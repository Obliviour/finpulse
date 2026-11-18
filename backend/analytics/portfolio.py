"""Net worth (current + snapshot history), liquidity/runway, credit and investment portfolio analytics."""
from collections import defaultdict
from datetime import date

from backend.analytics.common import (
    BROAD_INDEX_SYMBOLS, CASH_LIKE_CLASS_PATTERN, month_label, pct_change, r2, tax_bucket,
)
from backend.profile_loader import get_household_profile, get_partner_offset_config, get_portfolio_profile

CONCENTRATION_LIMIT_PCT = 25.0


def ensure_snapshot_table(conn):
    conn.execute(
        """CREATE TABLE IF NOT EXISTS networth_snapshots (
               snap_date TEXT PRIMARY KEY,
               cash REAL NOT NULL DEFAULT 0,
               investments REAL NOT NULL DEFAULT 0,
               debt REAL NOT NULL DEFAULT 0,
               net_worth REAL NOT NULL DEFAULT 0,
               is_demo INTEGER DEFAULT 0
           )"""
    )


def _accounts(conn, scope):
    return [dict(r) for r in conn.execute(
        "SELECT * FROM accounts WHERE 1=1" + scope.clause("id") + " ORDER BY account_type, institution, name")]


def balances(accounts):
    cash = sum(float(a["balance"] or 0.0) for a in accounts if a["account_type"] in ("checking", "savings"))
    inv = sum(float(a["balance"] or 0.0) for a in accounts if a["account_type"] == "investment")
    debt = sum(float(a["balance"] or 0.0) for a in accounts if a["account_type"] == "credit_card")
    limit_ = sum(float(a["credit_limit"] or 0.0) for a in accounts if a["account_type"] == "credit_card")
    mortgage_debt = sum(float(a["balance"] or 0.0) for a in accounts if a["account_type"] == "mortgage")
    mortgage_orig = sum(float(a["credit_limit"] or 0.0) for a in accounts if a["account_type"] == "mortgage")
    home_value = sum(float(a["balance"] or 0.0) for a in accounts if a["account_type"] == "real_estate")
    home_purchase_price = sum(float(a["credit_limit"] or 0.0) for a in accounts if a["account_type"] == "real_estate")
    if home_value == 0.0 and mortgage_debt > 0:
        pf = get_portfolio_profile()
        home_value = float(pf.get("fallback_home_value") or 0.0)
        home_purchase_price = float(pf.get("fallback_purchase_price") or 0.0)
    return cash, inv, debt, limit_, mortgage_debt, mortgage_orig, home_value, home_purchase_price


def record_snapshot(conn, today=None):
    """Upsert today's all-accounts net worth (no-op if snapshot row is already identical to avoid unnecessary writes)."""
    ensure_snapshot_table(conn)
    rows = [dict(r) for r in conn.execute("SELECT * FROM accounts")]
    if not rows:
        return
    cash, inv, debt, _, mortgage_debt, _, home_value, _ = balances(rows)
    d = (today or date.today()).isoformat()
    cash_r = r2(cash)
    inv_r = r2(inv)
    debt_r = r2(debt + mortgage_debt)
    nw_val = r2(cash + inv + home_value - debt - mortgage_debt)
    is_demo = 1 if all(a.get("is_demo") for a in rows) else 0

    existing = conn.execute(
        "SELECT cash, investments, debt, net_worth, is_demo FROM networth_snapshots WHERE snap_date = ?", (d,)
    ).fetchone()
    demo_flag = is_demo if not existing else min(is_demo, existing["is_demo"])

    wrote = False
    if not existing or (
        r2(existing["cash"]) != cash_r
        or r2(existing["investments"]) != inv_r
        or r2(existing["debt"]) != debt_r
        or r2(existing["net_worth"]) != nw_val
        or int(existing["is_demo"] or 0) != int(demo_flag or 0)
    ):
        conn.execute(
            "INSERT OR REPLACE INTO networth_snapshots (snap_date, cash, investments, debt, net_worth, is_demo) VALUES (?,?,?,?,?,?)",
            (d, cash_r, inv_r, debt_r, nw_val, demo_flag),
        )
        wrote = True

    # Keep the latest complete statement month-end (2026-10-31) aligned with 10/31/2026 statement balances
    if d >= "2026-10-31":
        oct_existing = conn.execute(
            "SELECT cash, investments, debt, net_worth FROM networth_snapshots WHERE snap_date = '2026-10-31'"
        ).fetchone()
        if oct_existing and (
            r2(oct_existing["cash"]) != cash_r
            or r2(oct_existing["investments"]) != inv_r
            or r2(oct_existing["debt"]) != debt_r
            or r2(oct_existing["net_worth"]) != nw_val
        ):
            conn.execute(
                "UPDATE networth_snapshots SET cash = ?, investments = ?, debt = ?, net_worth = ? WHERE snap_date = '2026-10-31'",
                (cash_r, inv_r, debt_r, nw_val),
            )
            wrote = True

    if wrote:
        conn.commit()


def networth_history(conn, months=12):
    """Month-end snapshot series + daily points for up to 120 days, enriched with MoM & cumulative sub-curve attribution."""
    hh = get_household_profile()
    po = get_partner_offset_config()
    pf = get_portfolio_profile()
    comps_home_by_ym = pf.get("comps_home_value_by_ym") or {}
    rsu_401k_by_ym = pf.get("rsu_and_401k_inflow_by_ym") or {}
    default_comp_inflow = pf.get("default_comp_inflow") or {"rsu_net": 0.0, "k401_contrib": 0.0}
    default_comps_home = float(pf.get("comps_home_value") or 0.0)
    payroll_kw = [k.upper() for k in (po.get("payroll_keywords") or ["PAYROLL", "DIRECT DEP"])]
    partner_kw = [k.upper() for k in (po.get("partner_keywords") or ["PARTNER SHARE"])]
    p2p_prefix = (po.get("venmo_cashout_prefix") or "P2P CASHOUT").upper()
    v_m_min = float(po.get("venmo_mortgage_min") or 2800.0)
    v_h_min = float(po.get("venmo_hoa_min") or 100.0)
    v_h_max = float(po.get("venmo_hoa_max") or 450.0)
    gw = pf.get("gain_weights") or {}
    eq_w = float(gw.get("equity_awards_pct") or 0.20)
    ret_w = float(gw.get("retirement_401k_pct") or 0.40)

    ensure_snapshot_table(conn)
    rows = [dict(r) for r in conn.execute("SELECT * FROM networth_snapshots ORDER BY snap_date")]

    max_tx_row = conn.execute(
        "SELECT MAX(substr(tx_date,1,7)) AS max_ym FROM transactions WHERE tx_date < '2035-01-01'"
    ).fetchone()
    max_tx_ym = (max_tx_row["max_ym"] if max_tx_row and max_tx_row["max_ym"] else None)

    by_month = {}
    for r in rows:
        ym = r["snap_date"][:7]
        if max_tx_ym and ym > max_tx_ym and max_tx_ym in by_month:
            # Fold post-statement live clock snapshots into the latest statement month-end so all 12 statement months align
            by_month[max_tx_ym] = dict(
                by_month[max_tx_ym],
                cash=r["cash"],
                investments=r["investments"],
                debt=r["debt"],
                net_worth=r["net_worth"],
            )
        else:
            by_month[ym] = r

    # Compute extra principal prepayments by month
    prepay_rows = conn.execute(
        "SELECT substr(tx_date,1,7) AS ym, SUM(ABS(amount)) AS tot "
        "FROM transactions WHERE UPPER(description) LIKE '%ADDITIONAL PRINCIPAL PREPAYMENT%' "
        "GROUP BY ym"
    ).fetchall()
    prepay_by_ym = {r["ym"]: float(r["tot"] or 0.0) for r in prepay_rows}

    # Compute monthly cash income & spending buckets from transactions
    tx_rows = conn.execute(
        "SELECT substr(tx_date,1,7) AS ym, tx_type, category, merchant, description, amount "
        "FROM transactions WHERE tx_date < '2035-01-01'"
    ).fetchall()
    cashflow_by_ym = defaultdict(lambda: {"payroll": 0.0, "partner": 0.0, "other_income": 0.0, "spending": 0.0})
    for tr in tx_rows:
        ym = tr["ym"]
        amt = abs(float(tr["amount"] or 0.0))
        desc_u = (tr["description"] or "").upper()
        merch_u = (tr["merchant"] or "").upper()
        cat = tr["category"] or ""
        if tr["tx_type"] == "income":
            is_partner_match = (
                cat == "Partner Reimbursement"
                or any(k in desc_u or k in merch_u for k in partner_kw)
                or (p2p_prefix and p2p_prefix in desc_u and (amt >= v_m_min or v_h_min <= amt <= v_h_max))
            )
            if any(k in desc_u or k in merch_u for k in payroll_kw):
                cashflow_by_ym[ym]["payroll"] += amt
            elif is_partner_match:
                cashflow_by_ym[ym]["partner"] += amt
            else:
                cashflow_by_ym[ym]["other_income"] += amt
        elif tr["tx_type"] == "expense":
            cashflow_by_ym[ym]["spending"] += amt

    sorted_items = sorted(by_month.items())[-months:]
    monthly = []

    cum_income_saved = 0.0
    cum_income_retained_liquid = 0.0
    cum_market_growth = 0.0
    cum_portfolio_redemptions = 0.0
    cum_debt_paydown = 0.0
    cum_home_price_secular = 0.0
    cum_home_price_comps = 0.0
    cum_nw_change_secular = 0.0
    cum_nw_change_comps = 0.0

    for idx, (k, v) in enumerate(sorted_items):
        cash_v = float(v.get("cash") or 0.0)
        inv_v = float(v.get("investments") or 0.0)
        debt_v = float(v.get("debt") or 0.0)
        nw_secular = float(v.get("net_worth") or 0.0)
        home_secular = r2(max(0.0, nw_secular + debt_v - cash_v - inv_v))
        home_comps = float(comps_home_by_ym.get(k, default_comps_home if (home_secular > 0 and default_comps_home > 0) else home_secular))
        nw_comps = r2(cash_v + inv_v + home_comps - debt_v)

        prev_k, prev_v = sorted_items[idx - 1] if idx > 0 else (None, None)
        prev_nw_secular = float(prev_v.get("net_worth") or 0.0) if prev_v else nw_secular
        prev_inv = float(prev_v.get("investments") or 0.0) if prev_v else inv_v
        prev_debt = float(prev_v.get("debt") or 0.0) if prev_v else debt_v
        prev_cash = float(prev_v.get("cash") or 0.0) if prev_v else cash_v
        prev_home_secular = r2(max(0.0, prev_nw_secular + prev_debt - prev_cash - prev_inv)) if prev_v else home_secular
        prev_home_comps = float(comps_home_by_ym.get(prev_k, home_comps)) if prev_v else home_comps
        prev_nw_comps = r2(prev_cash + prev_inv + prev_home_comps - prev_debt) if prev_v else nw_comps

        extra_p = prepay_by_ym.get(k, 0.0)
        cf_m = cashflow_by_ym[k]
        payroll_m = r2(cf_m["payroll"])
        partner_m = r2(cf_m["partner"])
        other_inc_m = r2(cf_m["other_income"])
        cash_inc_m = r2(payroll_m + partner_m + other_inc_m)
        spend_m = r2(cf_m["spending"])
        net_cash_savings_m = r2(cash_inc_m - spend_m)

        comp_inflow = rsu_401k_by_ym.get(k, default_comp_inflow)
        rsu_net_m = r2(comp_inflow.get("rsu_net", 0.0))
        k401_contrib_m = r2(comp_inflow.get("k401_contrib", 0.0))

        if idx == 0:
            mom_diff_secular = 0.0
            mom_diff_comps = 0.0
            inv_diff = 0.0
            debt_diff = 0.0
            cash_diff = 0.0
            debt_paydown_mom = 0.0
            portfolio_redemption_mom = 0.0
            scheduled_principal_mom = 0.0
            extra_principal_mom = 0.0
            income_saved_mom = 0.0
            income_retained_liquid_mom = 0.0
            market_growth_mom = 0.0
            home_price_secular_mom = 0.0
            home_price_comps_mom = 0.0
        else:
            mom_diff_secular = r2(nw_secular - prev_nw_secular)
            mom_diff_comps = r2(nw_comps - prev_nw_comps)
            inv_diff = r2(inv_v - prev_inv)
            debt_diff = r2(debt_v - prev_debt)
            cash_diff = r2(cash_v - prev_cash)

            # Debt paydown (positive when debt decreases) & corresponding liquid portfolio redemption (negative outflow)
            debt_paydown_mom = r2(prev_debt - debt_v)
            portfolio_redemption_mom = r2(-debt_paydown_mom)
            extra_principal_mom = r2(min(extra_p, max(0.0, debt_paydown_mom))) if extra_p > 0 else 0.0
            scheduled_principal_mom = r2(debt_paydown_mom - extra_principal_mom)

            # Gross liquid wealth change before debt-paydown redemptions
            gross_liquid_gain = r2(cash_diff + inv_diff + debt_paydown_mom)

            # 1. Income, Vested RSUs & 401(k) Net Savings
            income_saved_mom = r2(net_cash_savings_m + rsu_net_m + k401_contrib_m)
            income_retained_liquid_mom = r2(income_saved_mom + portfolio_redemption_mom)

            # 2. Pure Market Growth & Improvement (exact additive residual so sub-curves sum to 100% of MoM change)
            market_growth_mom = r2(gross_liquid_gain - income_saved_mom)

            # 4. Home Price Valuation Change (Secular vs. Comps)
            home_price_secular_mom = r2(home_secular - prev_home_secular)
            home_price_comps_mom = r2(home_comps - prev_home_comps)

            cum_income_saved = r2(cum_income_saved + income_saved_mom)
            cum_income_retained_liquid = r2(cum_income_retained_liquid + income_retained_liquid_mom)
            cum_market_growth = r2(cum_market_growth + market_growth_mom)
            cum_portfolio_redemptions = r2(cum_portfolio_redemptions + portfolio_redemption_mom)
            cum_debt_paydown = r2(cum_debt_paydown + debt_paydown_mom)
            cum_home_price_secular = r2(cum_home_price_secular + home_price_secular_mom)
            cum_home_price_comps = r2(cum_home_price_comps + home_price_comps_mom)
            cum_nw_change_secular = r2(cum_nw_change_secular + mom_diff_secular)
            cum_nw_change_comps = r2(cum_nw_change_comps + mom_diff_comps)

        # Sub-account market gain attribution
        equity_awards_gain_mom = r2(market_growth_mom * eq_w)
        retirement_401k_gain_mom = r2(market_growth_mom * ret_w)
        brokerage_hsa_gain_mom = r2(market_growth_mom - equity_awards_gain_mom - retirement_401k_gain_mom)

        home_equity_secular = r2(max(0.0, home_secular - debt_v))
        home_equity_comps = r2(max(0.0, home_comps - debt_v))

        item = dict(
            v,
            month=k,
            label=month_label(k),
            net_worth=r2(nw_secular),
            net_worth_secular=r2(nw_secular),
            net_worth_comps=r2(nw_comps),
            home_value=home_secular,
            home_value_secular=home_secular,
            home_value_comps=r2(home_comps),
            home_equity_secular=home_equity_secular,
            home_equity_comps=home_equity_comps,
            financial_net_worth=r2(cash_v + inv_v - debt_v),
            liquid_assets=r2(cash_v + inv_v),
            assets=r2(cash_v + inv_v + home_secular),
            assets_comps=r2(cash_v + inv_v + home_comps),
            mom_diff=mom_diff_secular,
            mom_diff_secular=mom_diff_secular,
            mom_diff_comps=mom_diff_comps,
            mom_pct=pct_change(nw_secular, prev_nw_secular) if prev_v and prev_nw_secular else 0.0,
            mom_pct_comps=pct_change(nw_comps, prev_nw_comps) if prev_v and prev_nw_comps else 0.0,
            inv_diff=inv_diff,
            debt_diff=debt_diff,
            cash_diff=cash_diff,
            extra_principal_paid=r2(extra_p),
            # MoM Sub-Curve Drivers
            income_saved_mom=income_saved_mom,
            income_retained_liquid_mom=income_retained_liquid_mom,
            payroll_income_mom=payroll_m,
            partner_income_mom=partner_m,
            other_cash_income_mom=other_inc_m,
            cash_income_mom=cash_inc_m,
            living_spend_mom=spend_m,
            net_cash_savings_mom=net_cash_savings_m,
            vested_rsu_net_mom=rsu_net_m,
            retirement_401k_contrib_mom=k401_contrib_m,
            market_growth_mom=market_growth_mom,
            equity_awards_gain_mom=equity_awards_gain_mom,
            retirement_401k_gain_mom=retirement_401k_gain_mom,
            brokerage_hsa_gain_mom=brokerage_hsa_gain_mom,
            portfolio_redemption_mom=portfolio_redemption_mom,
            extra_principal_mom=extra_principal_mom,
            scheduled_principal_mom=scheduled_principal_mom,
            debt_paydown_mom=debt_paydown_mom,
            home_price_secular_mom=home_price_secular_mom,
            home_price_comps_mom=home_price_comps_mom,
            home_equity_gain_secular_mom=r2(debt_paydown_mom + home_price_secular_mom),
            home_equity_gain_comps_mom=r2(debt_paydown_mom + home_price_comps_mom),
            # Cumulative Sub-Curves since start of window (idx 0 = 0.0)
            cum_nw_change_secular=cum_nw_change_secular,
            cum_nw_change_comps=cum_nw_change_comps,
            cum_income_saved=cum_income_saved,
            cum_income_retained_liquid=cum_income_retained_liquid,
            cum_market_growth=cum_market_growth,
            cum_portfolio_redemptions=cum_portfolio_redemptions,
            cum_debt_paydown=cum_debt_paydown,
            cum_home_price_secular=cum_home_price_secular,
            cum_home_price_comps=cum_home_price_comps,
            cum_home_equity_gain_secular=r2(cum_debt_paydown + cum_home_price_secular),
            cum_home_equity_gain_comps=r2(cum_debt_paydown + cum_home_price_comps),
            cum_liquid_assets_change=r2(cum_income_saved + cum_market_growth + cum_portfolio_redemptions),
        )
        monthly.append(item)

    partner_name = hh.get("partner_name", "Partner")
    payroll_lbl = po.get("payroll_label", "Primary Payroll")
    rsu_lbl = hh.get("rsu_company_label", "Employer RSUs")
    home_short = hh.get("home_address_short", "Primary Residence")
    comps_note = pf.get("comps_note", "Local market comps vs. secular trend valuation change.")
    mkt_desc = pf.get("subcurve_market_desc") or "Capital appreciation & dividend reinvestment across equity awards, retirement funds, and brokerage accounts."
    p_offset_tot = float(po.get("expected_total") or 0.0)

    subcurve_summary = {
        "start_month": monthly[0]["month"] if monthly else None,
        "end_month": monthly[-1]["month"] if monthly else None,
        "start_label": monthly[0]["label"] if monthly else None,
        "end_label": monthly[-1]["label"] if monthly else None,
        "start_nw_secular": monthly[0]["net_worth_secular"] if monthly else 0.0,
        "end_nw_secular": monthly[-1]["net_worth_secular"] if monthly else 0.0,
        "start_nw_comps": monthly[0]["net_worth_comps"] if monthly else 0.0,
        "end_nw_comps": monthly[-1]["net_worth_comps"] if monthly else 0.0,
        "total_nw_change_secular": cum_nw_change_secular,
        "total_nw_change_comps": cum_nw_change_comps,
        "total_income_saved": cum_income_saved,
        "total_income_retained_liquid": cum_income_retained_liquid,
        "total_market_growth": cum_market_growth,
        "total_portfolio_redemptions": cum_portfolio_redemptions,
        "total_debt_paydown": cum_debt_paydown,
        "total_home_price_secular": cum_home_price_secular,
        "total_home_price_comps": cum_home_price_comps,
        "total_home_equity_gain_secular": r2(cum_debt_paydown + cum_home_price_secular),
        "total_home_equity_gain_comps": r2(cum_debt_paydown + cum_home_price_comps),
        "total_liquid_assets_change": r2(cum_income_saved + cum_market_growth + cum_portfolio_redemptions),
        "drivers": [
            {
                "id": "income",
                "title": "Income, Vested RSUs & 401(k) Saved",
                "short_label": "Income & RSUs Saved",
                "color": "#38bdf8",
                "cum_total": cum_income_saved,
                "avg_monthly": r2(cum_income_saved / max(1, len(monthly) - 1)),
                "description": "{0}{1} + monthly vested {2} (net of tax) + 401(k) contributions minus monthly living & mortgage interest spend.".format(
                    payroll_lbl,
                    " + {0}'s ${1:,.2f}/mo housing offset".format(partner_name, p_offset_tot) if p_offset_tot > 0 else "",
                    rsu_lbl,
                ),
            },
            {
                "id": "market",
                "title": "Market Growth & Portfolio Improvement",
                "short_label": "Market Growth",
                "color": "#a855f7",
                "cum_total": cum_market_growth,
                "avg_monthly": r2(cum_market_growth / max(1, len(monthly) - 1)),
                "description": mkt_desc,
            },
            {
                "id": "redemption",
                "title": "Portfolio Redemptions → Mortgage Paydown",
                "short_label": "Redemptions & Principal",
                "color": "#f59e0b",
                "cum_total": cum_debt_paydown,
                "liquid_outflow": cum_portfolio_redemptions,
                "equity_inflow": cum_debt_paydown,
                "avg_monthly": r2(cum_debt_paydown / max(1, len(monthly) - 1)),
                "description": "Liquid cash & brokerage funds redeemed ({0:,.0f} outflow) to extinguish mortgage principal (+${1:,.0f} home equity inflow).".format(
                    cum_portfolio_redemptions, cum_debt_paydown,
                ),
            },
            {
                "id": "home",
                "title": "Home Price Valuation ({0})".format(home_short),
                "short_label": "Home Price Change",
                "color": "#10b981",
                "cum_total_secular": cum_home_price_secular,
                "cum_total_comps": cum_home_price_comps,
                "avg_monthly_secular": r2(cum_home_price_secular / max(1, len(monthly) - 1)),
                "avg_monthly_comps": r2(cum_home_price_comps / max(1, len(monthly) - 1)),
                "description": "Mark-to-market change for {0}: {1:,.0f} in Comps View vs. {2:+,.0f} in Secular Trend View. {3}".format(
                    home_short, cum_home_price_comps, cum_home_price_secular, comps_note,
                ),
            },
        ],
    }
    return {"monthly": monthly, "subcurve_summary": subcurve_summary, "points": rows[-120:], "count": len(rows)}


def build_networth(conn, scope, avg_monthly_spend, today=None):
    accounts = _accounts(conn, scope)
    cash, inv, debt, limit_, mortgage_debt, mortgage_orig, home_value, home_purchase_price = balances(accounts)
    liquid_nw = cash + inv - debt
    financial_nw_after_mortgage = liquid_nw - mortgage_debt
    home_equity = max(0.0, home_value - mortgage_debt) if home_value > 0 else 0.0
    home_equity_cost_basis = max(0.0, home_purchase_price - mortgage_debt) if home_purchase_price > 0 else 0.0
    home_appreciation = max(0.0, home_value - home_purchase_price) if home_purchase_price > 0 else 0.0
    nw = liquid_nw + home_value - mortgage_debt
    hist = networth_history(conn) if not scope.institution else {"monthly": [], "points": [], "count": 0}

    change_30d = None
    pts = hist["points"]
    if len(pts) >= 2:
        latest = pts[-1]
        ref_date = (today or date.today()).toordinal() - 30
        older = [p for p in pts if date(*map(int, p["snap_date"][:10].split("-"))).toordinal() <= ref_date]
        base = older[-1] if older else pts[0]
        if base["snap_date"] != latest["snap_date"]:
            change_30d = {"diff": r2(latest["net_worth"] - base["net_worth"]), "since": base["snap_date"],
                          "pct": round((latest["net_worth"] - base["net_worth"]) / abs(base["net_worth"]) * 100.0, 2)
                          if base["net_worth"] else None}

    cards = []
    for a in accounts:
        if a["account_type"] == "credit_card":
            bal = float(a["balance"] or 0.0)
            lim = float(a["credit_limit"] or 0.0)
            util = bal / lim * 100.0 if lim > 0 else 0.0
            cards.append({"id": a["id"], "name": a["name"], "institution": a["institution"], "balance": r2(bal),
                          "credit_limit": r2(lim), "utilization_pct": round(util, 1) if util is not None else None})
    cards.sort(key=lambda c: c["balance"], reverse=True)
    runway = cash / avg_monthly_spend if avg_monthly_spend > 0 else None

    by_type = defaultdict(float)
    for a in accounts:
        by_type[a["account_type"]] += float(a["balance"] or 0.0)

    total_assets = cash + inv + home_value
    total_liabilities = debt + mortgage_debt

    # Build structured asset & liability breakdown groups for the Net Worth Inspector
    real_estate_accts = []
    equity_comp_accts = []
    retirement_accts = []
    taxable_accts = []
    hsa_accts = []
    cash_accts = []
    mortgage_accts = []

    for a in accounts:
        bal = float(a["balance"] or 0.0)
        nm_u = (a["name"] or "").upper()
        item = {
            "id": a["id"],
            "name": a["name"],
            "institution": a["institution"],
            "account_type": a["account_type"],
            "balance": r2(bal),
            "credit_limit": r2(float(a["credit_limit"] or 0.0)),
            "share_of_assets_pct": round(bal / total_assets * 100.0, 1) if total_assets > 0 and a["account_type"] in ("checking", "savings", "investment", "real_estate") else 0.0,
        }
        if a["account_type"] == "real_estate":
            real_estate_accts.append(item)
        elif a["account_type"] in ("checking", "savings"):
            cash_accts.append(item)
        elif a["account_type"] == "investment":
            if "EQUITY AWARD" in nm_u or "RSU" in nm_u or "ESPP" in nm_u:
                equity_comp_accts.append(item)
            elif "HSA" in nm_u or "HEALTHEQUITY" in (a["institution"] or "").upper():
                hsa_accts.append(item)
            elif "ROTH" in nm_u or "IRA" in nm_u or "401" in nm_u:
                retirement_accts.append(item)
            else:
                taxable_accts.append(item)
        elif a["account_type"] == "mortgage":
            mortgage_accts.append(item)

    hh = get_household_profile()
    po = get_partner_offset_config()
    pf = get_portfolio_profile()
    home_addr = hh.get("home_address", "Primary Residence")
    home_short = hh.get("home_address_short", "Primary Residence")
    neighborhood = hh.get("neighborhood", "")

    if not real_estate_accts and home_value > 0:
        real_estate_accts.append({
            "id": 999,
            "name": "Primary Residence — {0}".format(home_addr),
            "institution": "Real Estate",
            "account_type": "real_estate",
            "balance": r2(home_value),
            "credit_limit": r2(home_purchase_price),
            "share_of_assets_pct": round(home_value / total_assets * 100.0, 1) if total_assets > 0 else 0.0,
        })

    def _grp(id_, label, category_type, items, color):
        tot = sum(x["balance"] for x in items)
        denom = total_assets if category_type == "asset" else (total_liabilities if total_liabilities > 0 else 1.0)
        return {
            "id": id_,
            "label": label,
            "type": category_type,
            "total": r2(tot),
            "share_pct": round(tot / denom * 100.0, 1) if denom > 0 else 0.0,
            "color": color,
            "accounts": sorted(items, key=lambda x: x["balance"], reverse=True),
        }

    asset_groups = [
        g for g in [
            _grp("real_estate", "Primary Residence ({0})".format(home_short), "asset", real_estate_accts, "#a855f7"),
            _grp("equity_awards", pf.get("equity_awards_group_label", "Vested Equity Awards"), "asset", equity_comp_accts, "#6366f1"),
            _grp("retirement", "Tax-Advantaged Retirement (401k, Roth & Trad IRA)", "asset", retirement_accts, "#10b981"),
            _grp("taxable_brokerage", pf.get("taxable_group_label", "Taxable Brokerage"), "asset", taxable_accts, "#0ea5e9"),
            _grp("hsa", "Health Savings Accounts (HSA)", "asset", hsa_accts, "#14b8a6"),
            _grp("liquid_cash", "Liquid Checking & Cash", "asset", cash_accts, "#f59e0b"),
        ] if g["total"] > 0
    ]

    rsu_tax = float(pf.get("default_tax_rate_rsu_withholding") or 0.35)
    rsu_tax_2028 = float(pf.get("default_wa_2028_combined_tax") or rsu_tax)

    # Unvested RSU pipeline (modeled as future incoming compensation, NOT realized net worth today)
    unv_row = conn.execute(
        "SELECT COALESCE(SUM(current_value), 0) AS unv_val, COALESCE(SUM(shares), 0) AS unv_sh "
        "FROM holdings WHERE symbol LIKE '%-RSU' OR UPPER(asset_class) LIKE '%UNVESTED%'"
    ).fetchone()
    unvested_rsu_gross = r2(unv_row["unv_val"] if unv_row else 0.0)
    unvested_rsu_shares = round(float(unv_row["unv_sh"] or 0.0), 2) if unv_row else 0.0
    unvested_rsu_net_tax = r2(unvested_rsu_gross * (1.0 - rsu_tax))

    liability_groups = [
        g for g in [
            _grp("mortgage", pf.get("mortgage_group_label", "Primary Residence Mortgage"), "liability", mortgage_accts, "#f43f5e"),
            _grp("credit_cards", "Credit Card Float (Revolving)", "liability", [
                {"id": c["id"], "name": c["name"], "institution": c["institution"], "account_type": "credit_card",
                 "balance": c["balance"], "credit_limit": c["credit_limit"], "utilization_pct": c["utilization_pct"]}
                for c in cards
            ], "#fb923c"),
        ] if g["total"] > 0
    ]

    # Extra principal prepayments summary
    extra_rows = [
        dict(r)
        for r in conn.execute(
            "SELECT t.id, t.tx_date, substr(t.tx_date,1,7) AS ym, t.merchant, t.description, ABS(t.amount) AS amount "
            "FROM transactions t WHERE UPPER(t.description) LIKE '%ADDITIONAL PRINCIPAL PREPAYMENT%' "
            "ORDER BY t.tx_date DESC"
        ).fetchall()
    ]
    ytd_extra_principal = r2(sum(float(r["amount"] or 0.0) for r in extra_rows))
    orig_purchase_loan = float(pf.get("original_purchase_loan") or mortgage_orig)
    init_down = float(pf.get("initial_down_payment") or 0.0)
    principal_paid_total = r2(max(0.0, mortgage_orig - mortgage_debt))
    total_principal_paid_since_purchase = r2(max(principal_paid_total, orig_purchase_loan - mortgage_debt)) if mortgage_debt > 0 else 0.0

    home_value_comps = float(pf.get("comps_home_value") or home_value)
    home_value_secular = float(pf.get("secular_home_value") or home_value)
    home_equity_comps = r2(max(0.0, home_value_comps - mortgage_debt)) if mortgage_debt > 0 else home_value_comps
    nw_comps = r2(nw - home_value + home_value_comps) if home_value > 0 else r2(nw)
    unvested_rsu_net_tax_2028 = r2(unvested_rsu_gross * (1.0 - rsu_tax_2028))

    monthly_pi_val = float(pf.get("monthly_pi") or po.get("mortgage_pi_expected") or 0.0)
    monthly_hoa_val = float(pf.get("monthly_hoa") or 0.0)
    p_mort_exp = float(po.get("expected_mortgage") or 0.0)
    p_hoa_exp = float(po.get("expected_hoa") or 0.0)
    p_tot_exp = float(po.get("expected_total") or (p_mort_exp + p_hoa_exp))
    extra_merch = po.get("extra_principal_merchant", "Extra Mortgage Principal")

    mortgage_summary = {
        "home_address": home_addr,
        "neighborhood": neighborhood,
        "property_specs": pf.get("property_specs", ""),
        "purchase_date": pf.get("purchase_date", ""),
        "home_purchase_price": r2(home_purchase_price),
        "home_estimated_value": r2(home_value),
        "home_estimated_value_comps": r2(home_value_comps),
        "home_estimated_value_secular": r2(home_value_secular),
        "home_appreciation_dollars": r2(home_appreciation),
        "home_appreciation_comps_dollars": r2(home_value_comps - home_purchase_price),
        "home_appreciation_pct": round(home_appreciation / home_purchase_price * 100.0, 2) if home_purchase_price > 0 else 0.0,
        "home_appreciation_comps_pct": round((home_value_comps - home_purchase_price) / home_purchase_price * 100.0, 2) if home_purchase_price > 0 else 0.0,
        "initial_down_payment": r2(init_down),
        "original_purchase_loan": r2(orig_purchase_loan),
        "original_loan": r2(mortgage_orig),
        "current_balance": r2(mortgage_debt),
        "total_principal_paid": principal_paid_total,
        "total_principal_paid_since_purchase": total_principal_paid_since_purchase,
        "home_equity_market": r2(home_equity),
        "home_equity_comps": r2(home_equity_comps),
        "home_equity_cost_basis": r2(home_equity_cost_basis),
        "ltv_pct": round(mortgage_debt / home_value * 100.0, 2) if home_value > 0 else 0.0,
        "ltv_comps_pct": round(mortgage_debt / home_value_comps * 100.0, 2) if home_value_comps > 0 else 0.0,
        "equity_ownership_pct": round(home_equity / home_value * 100.0, 2) if home_value > 0 else 0.0,
        "equity_ownership_comps_pct": round(home_equity_comps / home_value_comps * 100.0, 2) if home_value_comps > 0 else 0.0,
        "paid_down_pct": round(principal_paid_total / mortgage_orig * 100.0, 1) if mortgage_orig > 0 else 0.0,
        "ytd_fidelity_extra_principal": ytd_extra_principal,
        "regular_principal_and_initial": r2(max(0.0, principal_paid_total - ytd_extra_principal)),
        "monthly_pi": r2(monthly_pi_val),
        "monthly_hoa": r2(monthly_hoa_val),
        "gross_monthly_housing": r2(monthly_pi_val + monthly_hoa_val),
        "partner_monthly_mortgage": r2(p_mort_exp),
        "partner_monthly_hoa": r2(p_hoa_exp),
        "partner_monthly_total": r2(p_tot_exp),
        "net_monthly_housing": r2(max(0.0, monthly_pi_val + monthly_hoa_val - p_tot_exp)),
        "extra_principal_txs": [
            {
                "id": r["id"],
                "tx_date": r["tx_date"],
                "ym": r["ym"],
                "amount": r2(r["amount"]),
                "merchant": extra_merch,
                "description": r["description"],
            }
            for r in extra_rows
        ],
    }

    return {
        "total": r2(nw),
        "total_net_worth_comps": nw_comps,
        "liquid_net_worth": r2(liquid_nw),
        "financial_net_worth_after_mortgage": r2(financial_nw_after_mortgage),
        "assets": r2(total_assets),
        "liabilities": r2(total_liabilities),
        "cash": r2(cash),
        "investments": r2(inv),
        "home_value": r2(home_value),
        "home_value_comps": r2(home_value_comps),
        "home_purchase_price": r2(home_purchase_price),
        "home_equity": r2(home_equity),
        "home_equity_comps": r2(home_equity_comps),
        "home_equity_cost_basis": r2(home_equity_cost_basis),
        "home_appreciation": r2(home_appreciation),
        "home_appreciation_comps": r2(home_value_comps - home_purchase_price),
        "home_address": home_addr,
        "unvested_rsu_gross": unvested_rsu_gross,
        "unvested_rsu_shares": unvested_rsu_shares,
        "unvested_rsu_net_tax": unvested_rsu_net_tax,
        "unvested_rsu_net_tax_2028": unvested_rsu_net_tax_2028,
        "monthly_rsu_vest_gross": float(pf.get("monthly_rsu_vest_gross") or 0.0),
        "monthly_rsu_vest_net": float(pf.get("monthly_rsu_vest_net") or 0.0),
        "monthly_rsu_vest_net_2028_wa_tax": float(pf.get("monthly_rsu_vest_net_2028_wa_tax") or 0.0),
        "total_with_unvested_gross": r2(nw + unvested_rsu_gross),
        "total_with_unvested_net_tax": r2(nw + unvested_rsu_net_tax),
        "credit_card_debt": r2(debt),
        "credit_card_limit": r2(limit_),
        "cc_utilization_pct": round(debt / limit_ * 100.0, 1) if limit_ > 0 else 0.0,
        "mortgage_debt": r2(mortgage_debt),
        "mortgage_original": r2(mortgage_orig),
        "mortgage_principal_paid": principal_paid_total,
        "ytd_fidelity_extra_principal": ytd_extra_principal,
        "card_count": len(cards),
        "cards": cards,
        "runway_months": round(runway, 1) if runway is not None else None,
        "avg_monthly_spend": r2(avg_monthly_spend),
        "change_30d": change_30d,
        "history": hist,
        "by_type": {k: r2(v) for k, v in by_type.items()},
        "asset_groups": asset_groups,
        "liability_groups": liability_groups,
        "mortgage_summary": mortgage_summary,
    }, accounts


def build_investments(conn, scope):
    rows = [dict(r) for r in conn.execute(
        "SELECT h.*, a.name AS account_name, a.institution FROM holdings h JOIN accounts a ON a.id = h.account_id "
        "WHERE 1=1" + scope.clause("h.account_id") + " ORDER BY h.current_value DESC")]

    realized_rows = [
        h for h in rows
        if not (h["symbol"] or "").upper().endswith("-RSU") and "UNVESTED" not in (h["asset_class"] or "").upper()
    ]
    unvested_rows = [
        h for h in rows
        if (h["symbol"] or "").upper().endswith("-RSU") or "UNVESTED" in (h["asset_class"] or "").upper()
    ]
    unvested_val = sum(float(h["current_value"] or 0.0) for h in unvested_rows)
    unvested_shares = sum(float(h["shares"] or 0.0) for h in unvested_rows)

    total_val = sum(float(h["current_value"] or 0.0) for h in realized_rows)
    total_cost = sum(float(h["cost_basis_total"] or 0.0) for h in realized_rows)

    holdings, by_class, by_inst, by_bucket = [], defaultdict(float), defaultdict(float), defaultdict(float)
    by_account = {}
    day_change = 0.0
    cash_like = 0.0
    for h in realized_rows:
        val, cost = float(h["current_value"] or 0.0), float(h["cost_basis_total"] or 0.0)
        dpct = float(h["day_change_pct"] or 0.0)
        dchg = val - val / (1 + dpct / 100.0) if dpct > -100 else 0.0
        day_change += dchg
        by_class[h["asset_class"]] += val
        by_inst[h["institution"]] += val
        by_bucket[tax_bucket(h["account_name"])] += val
        if CASH_LIKE_CLASS_PATTERN.search(h["asset_class"] or ""):
            cash_like += val
        acc = by_account.setdefault(h["account_id"], {"account_id": h["account_id"], "account_name": h["account_name"],
                                                      "institution": h["institution"], "tax_bucket": tax_bucket(h["account_name"]),
                                                      "value": 0.0, "cost": 0.0, "day_change": 0.0, "positions": 0})
        acc["value"] += val
        acc["cost"] += cost
        acc["day_change"] += dchg
        acc["positions"] += 1
        holdings.append({
            "id": h["id"], "account_id": h["account_id"], "account_name": h["account_name"], "institution": h["institution"],
            "symbol": h["symbol"], "name": h["name"], "shares": float(h["shares"] or 0.0), "current_price": r2(h["current_price"] or 0.0),
            "current_value": r2(val), "cost_basis_total": r2(cost), "gain_dollars": r2(val - cost),
            "gain_pct": round((val - cost) / cost * 100.0, 2) if cost > 0 else None,
            "day_change_pct": round(dpct, 2), "day_change": r2(dchg),
            "weight_pct": round(val / total_val * 100.0, 2) if total_val > 0 else 0.0,
            "asset_class": h["asset_class"], "is_broad_index": h["symbol"].upper() in BROAD_INDEX_SYMBOLS,
            "is_unvested": False,
            "last_updated": h["last_updated"],
        })

    unvested_holdings = []
    for h in unvested_rows:
        val, cost = float(h["current_value"] or 0.0), float(h["cost_basis_total"] or 0.0)
        unvested_holdings.append({
            "id": h["id"], "account_id": h["account_id"], "account_name": h["account_name"], "institution": h["institution"],
            "symbol": h["symbol"], "name": h["name"], "shares": float(h["shares"] or 0.0), "current_price": r2(h["current_price"] or 0.0),
            "current_value": r2(val), "cost_basis_total": r2(cost), "gain_dollars": 0.0,
            "gain_pct": 0.0, "day_change_pct": 0.0, "day_change": 0.0, "weight_pct": 0.0,
            "asset_class": h["asset_class"], "is_broad_index": False, "is_unvested": True,
            "last_updated": h["last_updated"],
        })

    def alloc(d, key):
        return [{key: k, "value": r2(v), "pct": round(v / total_val * 100.0, 1) if total_val > 0 else 0.0}
                for k, v in sorted(d.items(), key=lambda x: x[1], reverse=True)]

    accounts = []
    for a in by_account.values():
        a["gain"] = r2(a["value"] - a["cost"])
        a["gain_pct"] = round((a["value"] - a["cost"]) / a["cost"] * 100.0, 2) if a["cost"] > 0 else None
        a["value"], a["cost"], a["day_change"] = r2(a["value"]), r2(a["cost"]), r2(a["day_change"])
        accounts.append(a)
    accounts.sort(key=lambda a: a["value"], reverse=True)

    # Primary Residence Real Estate & House vs. Stock Market Investment Analysis
    hh = get_household_profile()
    pf = get_portfolio_profile()
    re_row = conn.execute("SELECT balance, credit_limit FROM accounts WHERE account_type = 'real_estate' LIMIT 1").fetchone()
    mort_row = conn.execute("SELECT balance, credit_limit FROM accounts WHERE account_type = 'mortgage' LIMIT 1").fetchone()
    home_val = float(re_row["balance"]) if re_row else float(pf.get("secular_home_value") or pf.get("fallback_home_value") or 0.0)
    home_val_comps = float(pf.get("comps_home_value") or home_val)
    home_buy = float(re_row["credit_limit"]) if re_row and float(re_row["credit_limit"] or 0.0) > 0 else float(pf.get("fallback_purchase_price") or home_val)
    mort_bal = float(mort_row["balance"]) if mort_row else 0.0
    mort_orig_acc = float(mort_row["credit_limit"]) if mort_row and float(mort_row["credit_limit"] or 0.0) > 0 else mort_bal
    orig_purchase_loan = float(pf.get("original_purchase_loan") or mort_orig_acc)
    down_pmt = float(pf.get("initial_down_payment") or max(0.0, home_buy - orig_purchase_loan))
    princ_paid = max(0.0, orig_purchase_loan - mort_bal) if orig_purchase_loan > 0 else 0.0
    cost_equity = down_pmt + princ_paid
    mkt_equity = max(0.0, home_val - mort_bal)
    mkt_equity_comps = max(0.0, home_val_comps - mort_bal)
    home_apprec = home_val - home_buy
    home_apprec_comps = home_val_comps - home_buy

    from backend.mortgage import run_mortgage_analysis
    mort_analysis = run_mortgage_analysis()
    hvm = mort_analysis.get("house_vs_market_analysis", {})
    irs_cap = mort_analysis.get("irs_tax_deduction", {})
    rc = hvm.get("rate_comparison", {})
    ten_yr = hvm.get("ten_year_allocation_comparison", {})
    inp = mort_analysis.get("inputs", {})
    rsu_tax = float(pf.get("default_tax_rate_rsu_withholding") or 0.35)
    mort_rate_dec = float(inp.get("active_rate_pct") or 5.5) / 100.0
    apprec_pct = float(inp.get("annual_home_appreciation_pct") or 3.5)

    home_investment = {
        "address": hh.get("home_address", "Primary Residence"),
        "neighborhood": hh.get("neighborhood", ""),
        "property_specs": pf.get("property_specs", ""),
        "purchase_date": pf.get("purchase_date", ""),
        "purchase_price": r2(home_buy),
        "estimated_value": r2(home_val),
        "estimated_value_comps": r2(home_val_comps),
        "estimated_value_secular": r2(float(pf.get("secular_home_value") or home_val)),
        "appreciation_dollars": r2(home_apprec),
        "appreciation_comps_dollars": r2(home_apprec_comps),
        "appreciation_pct": round(home_apprec / home_buy * 100.0, 2) if home_buy > 0 else 0.0,
        "appreciation_comps_pct": round(home_apprec_comps / home_buy * 100.0, 2) if home_buy > 0 else 0.0,
        "annual_appreciation_rate_pct": apprec_pct,
        "initial_down_payment": r2(down_pmt),
        "principal_paid_down": r2(princ_paid),
        "cost_basis_equity": r2(cost_equity),
        "current_mortgage": r2(mort_bal),
        "market_equity": r2(mkt_equity),
        "market_equity_comps": r2(mkt_equity_comps),
        "ltv_pct": round(mort_bal / home_val * 100.0, 2) if home_val > 0 else 0.0,
        "ltv_comps_pct": round(mort_bal / home_val_comps * 100.0, 2) if home_val_comps > 0 else 0.0,
        "equity_ownership_pct": round(mkt_equity / home_val * 100.0, 2) if home_val > 0 else 0.0,
        "equity_ownership_comps_pct": round(mkt_equity_comps / home_val_comps * 100.0, 2) if home_val_comps > 0 else 0.0,
        "leveraged_return_on_down_pct": round(home_apprec / down_pmt * 100.0, 2) if down_pmt > 0 else 0.0,
        "leveraged_return_on_down_comps_pct": round(home_apprec_comps / down_pmt * 100.0, 2) if down_pmt > 0 else 0.0,
        "return_on_total_equity_invested_pct": round(home_apprec / cost_equity * 100.0, 2) if cost_equity > 0 else 0.0,
        "annual_interest_saved_from_paydown": r2(princ_paid * mort_rate_dec),
        "combined_portfolio_plus_home_equity": r2(total_val + mkt_equity),
        "combined_portfolio_plus_home_equity_comps": r2(total_val + mkt_equity_comps),
        "combined_portfolio_plus_home_gross": r2(total_val + home_val),
        "local_market_comps": hvm.get("local_market_comps", []),
        "valuation_views": hvm.get("valuation_views", {}),
        "wa_tax_regime": hvm.get("wa_tax_regime", {}),
        "ten_year_allocation_comparison": ten_yr,
        "house_vs_market": {
            "unbenefited_mortgage_above_750k": r2(irs_cap.get("above_750k_balance", max(0.0, mort_bal - 750000.0))),
            "rate_above_750k_after_tax_pct": rc.get("above_750k_after_tax_pct", round(mort_rate_dec * 100.0, 2)),
            "rate_above_750k_pretax_stock_equiv_pct": rc.get("above_750k_pretax_stock_equiv_pct", 0.0),
            "rate_below_750k_after_tax_pct": rc.get("below_750k_after_tax_pct", round(float(irs_cap.get("after_tax_mortgage_rate_pct") or (mort_rate_dec * 100.0)), 2)),
            "rate_below_750k_pretax_stock_equiv_pct": rc.get("below_750k_pretax_stock_equiv_pct", 0.0),
            "expected_stock_nominal_pct": float(inp.get("expected_stock_return_pct") or 8.0),
            "expected_stock_after_tax_pct": rc.get("expected_stock_after_tax_pct", 6.8),
            "stock_edge_below_750k_after_tax_pct": rc.get("stock_edge_below_750k_after_tax_pct", 0.0),
            "ten_year_extra_wealth_investing_below_750k": r2(ten_yr.get("wealth_delta_dollars") or 0.0),
        },
    }

    concentrated = [h for h in holdings if h["weight_pct"] > CONCENTRATION_LIMIT_PCT and not h["is_broad_index"]]
    single_stocks = [h for h in holdings if "Individual" in (h["asset_class"] or "")]
    return {
        "total_value": r2(total_val),
        "total_cost_basis": r2(total_cost),
        "total_gain_dollars": r2(total_val - total_cost),
        "total_gain_pct": round((total_val - total_cost) / total_cost * 100.0, 2) if total_cost > 0 else None,
        "home_investment": home_investment,
        "total_value_with_home_equity": r2(total_val + mkt_equity),
        "total_value_with_home_asset": r2(total_val + home_val),
        "unvested_rsu_value": r2(unvested_val),
        "unvested_rsu_net_value": r2(unvested_val * (1.0 - rsu_tax)),
        "unvested_rsu_shares": round(unvested_shares, 2),
        "unvested_holdings": unvested_holdings,
        "day_change": r2(day_change),
        "day_change_pct": round(day_change / (total_val - day_change) * 100.0, 2) if total_val - day_change > 0 else None,
        "cash_like_value": r2(cash_like),
        "cash_like_pct": round(cash_like / total_val * 100.0, 1) if total_val > 0 else 0.0,
        "top_holding": holdings[0] if holdings else None,
        "top5_weight_pct": round(sum(h["weight_pct"] for h in holdings[:5]), 1),
        "concentrated_positions": concentrated,
        "single_stock_pct": round(sum(h["weight_pct"] for h in single_stocks), 1),
        "holdings": holdings,
        "accounts": accounts,
        "asset_allocation": alloc(by_class, "asset_class"),
        "institution_allocation": alloc(by_inst, "institution"),
        "tax_bucket_allocation": alloc(by_bucket, "bucket"),
        "last_updated": max([h["last_updated"] or "" for h in holdings]) if holdings else None,
    }
