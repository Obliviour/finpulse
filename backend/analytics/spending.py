"""Cash flow, category, merchant, pace/forecast and change-attribution analytics."""
from collections import defaultdict

from backend.analytics.common import (
    add_months, day_clause, days_in_month, is_fixed, month_label, month_range, pct_change, r2,
)
from backend.profile_loader import get_household_profile, get_partner_offset_config


def available_months(conn, scope):
    rows = conn.execute(
        "SELECT MIN(substr(t.tx_date,1,7)) AS lo, MAX(substr(t.tx_date,1,7)) AS hi FROM transactions t "
        "WHERE t.tx_type IN ('expense','income')" + scope.clause()
    ).fetchone()
    if not rows or not rows["lo"]:
        return []
    return list(reversed(month_range(rows["lo"], rows["hi"])))


def monthly_totals(conn, scope, months, compare_day=None):
    """{ym: {"income", "spending"}} for the given months (optionally only days <= compare_day)."""
    out = {m: {"income": 0.0, "spending": 0.0} for m in months}
    if not months:
        return out
    marks = ",".join("?" * len(months))
    rows = conn.execute(
        "SELECT substr(t.tx_date,1,7) AS ym, t.tx_type, "
        "SUM(CASE WHEN t.tx_type='income' THEN ABS(t.amount) ELSE t.amount END) AS total "
        "FROM transactions t WHERE t.tx_type IN ('income','expense') AND substr(t.tx_date,1,7) IN (" + marks + ")"
        + scope.clause() + day_clause(compare_day) + " GROUP BY ym, t.tx_type",
        months,
    ).fetchall()
    for r in rows:
        key = "income" if r["tx_type"] == "income" else "spending"
        out[r["ym"]][key] = float(r["total"] or 0.0)
    return out


def monthly_income_and_housing_details(conn, scope, months):
    """Computes granular income sources, partner housing reimbursement offsets,
    and extra mortgage principal prepayments for each month in `months`."""
    hh = get_household_profile()
    po = get_partner_offset_config()
    partner_name = hh.get("partner_name", "Partner")
    payroll_lbl = po.get("payroll_label", "Primary Payroll")
    partner_lbl = po.get("partner_income_label", "{0} Housing Share".format(partner_name))
    payroll_kw = [k.upper() for k in (po.get("payroll_keywords") or ["PAYROLL", "DIRECT DEP"])]
    partner_kw = [k.upper() for k in (po.get("partner_keywords") or ["PARTNER SHARE"])]
    p2p_prefix = (po.get("venmo_cashout_prefix") or "P2P CASHOUT").upper()
    v_mh_min = float(po.get("venmo_mortgage_hoa_min") or 2900.0)
    v_m_min = float(po.get("venmo_mortgage_min") or 2800.0)
    v_h_min = float(po.get("venmo_hoa_min") or 100.0)
    v_h_max = float(po.get("venmo_hoa_max") or 450.0)
    mort_kw = [k.upper() for k in (po.get("mortgage_keywords") or ["MORTGAGE"])]
    hoa_kw = [k.upper() for k in (po.get("hoa_keywords") or ["HOA"])]
    reg_hoa_part = float(po.get("special_hoa_regular_part") or 0.0)
    exp_mort_cfg = float(po.get("expected_mortgage") or 0.0)
    exp_hoa_cfg = float(po.get("expected_hoa") or 0.0)
    draft_kw = (po.get("prepay_draft_keyword") or "").upper()
    extra_merch = po.get("extra_principal_merchant", "Extra Mortgage Principal")
    extra_inst = po.get("extra_principal_institution", "Mortgage Servicer")
    extra_from = po.get("extra_principal_account_label", "Brokerage Account")

    out = {}
    if not months:
        return out
    for m in months:
        out[m] = {
            "income_breakdown": {
                "payroll": 0.0,
                "partner_reimbursement": 0.0,
                "other_transfers": 0.0,
                "dividends_interest": 0.0,
                "other_income": 0.0,
                "total": 0.0,
                "sources": [],
                "transactions": [],
            },
            "housing_breakdown": {
                "mortgage_pi": 0.0,
                "hoa_total": 0.0,
                "hoa_regular": 0.0,
                "hoa_special_assessment": 0.0,
                "property_tax_other": 0.0,
                "gross_housing": 0.0,
                "partner_expected_mortgage": exp_mort_cfg,
                "partner_expected_hoa": exp_hoa_cfg,
                "partner_expected_total": r2(exp_mort_cfg + exp_hoa_cfg),
                "partner_actual_offset": 0.0,
                "net_housing": 0.0,
                "net_housing_actual": 0.0,
                "fidelity_extra_principal": 0.0,
                "total_housing_with_extra_gross": 0.0,
                "total_housing_with_extra_net": 0.0,
                "extra_principal_txs": [],
                "partner_txs": [],
                "housing_txs": [],
            },
        }

    marks = ",".join("?" * len(months))
    tx_rows = [
        dict(r)
        for r in conn.execute(
            "SELECT t.id, t.tx_date, substr(t.tx_date,1,7) AS ym, t.merchant, t.description, "
            "t.amount, t.category, t.tx_type, t.account_id, a.name AS account_name, a.institution, a.account_type "
            "FROM transactions t JOIN accounts a ON a.id = t.account_id "
            "WHERE substr(t.tx_date,1,7) IN (" + marks + ")" + scope.clause() +
            " ORDER BY t.tx_date DESC, ABS(t.amount) DESC, t.id DESC",
            months,
        ).fetchall()
    ]

    # Track whether direct loan servicer extra principal rows exist per month so bank draft rows aren't double-counted
    has_servicer_prepay = set()
    for t in tx_rows:
        desc_u = (t["description"] or "").upper()
        if "ADDITIONAL PRINCIPAL PREPAYMENT" in desc_u:
            has_servicer_prepay.add(t["ym"])

    for t in tx_rows:
        ym = t["ym"]
        if ym not in out:
            continue
        inc_b = out[ym]["income_breakdown"]
        h_b = out[ym]["housing_breakdown"]
        desc_u = (t["description"] or "").upper()
        merch_u = (t["merchant"] or "").upper()
        amt = float(t["amount"] or 0.0)
        abs_amt = abs(amt)

        # 1. Income transactions
        if t["tx_type"] == "income":
            source_kind = "other"
            source_label = "Other Inflows & Rewards"
            is_partner_match = (
                any(k in merch_u for k in partner_kw)
                or t["category"] == "Partner Reimbursement"
                or (p2p_prefix and p2p_prefix in desc_u and (abs_amt >= v_m_min or v_h_min <= abs_amt <= v_h_max))
            )
            if any(k in desc_u or k in merch_u for k in payroll_kw):
                inc_b["payroll"] += abs_amt
                source_kind = "payroll"
                source_label = payroll_lbl
            elif is_partner_match:
                inc_b["partner_reimbursement"] += abs_amt
                h_b["partner_actual_offset"] += abs_amt
                source_kind = "partner"
                source_label = partner_lbl
                h_b["partner_txs"].append({
                    "id": t["id"],
                    "tx_date": t["tx_date"],
                    "merchant": t["merchant"],
                    "description": t["description"],
                    "amount": r2(abs_amt),
                    "account_name": t["account_name"],
                    "institution": t["institution"],
                    "share_type": "Mortgage + HOA" if abs_amt >= v_mh_min else ("Mortgage Share" if abs_amt >= v_m_min else "HOA (50% Share)"),
                })
            elif "VENMO" in desc_u or "ZELLE" in desc_u or "VENMO" in merch_u or "ZELLE" in merch_u:
                inc_b["other_transfers"] += abs_amt
                source_kind = "p2p"
                source_label = "Other Peer Reimbursements"
            elif "DIVIDEND" in desc_u or "INTEREST" in desc_u or "DIVIDEND" in merch_u:
                inc_b["dividends_interest"] += abs_amt
                source_kind = "dividend"
                source_label = "Investment Dividends & Interest"
            else:
                inc_b["other_income"] += abs_amt

            inc_b["total"] += abs_amt
            inc_b["transactions"].append({
                "id": t["id"],
                "tx_date": t["tx_date"],
                "merchant": t["merchant"],
                "description": t["description"],
                "amount": r2(abs_amt),
                "raw_amount": r2(amt),
                "category": t["category"],
                "tx_type": t["tx_type"],
                "account_id": t["account_id"],
                "account_name": t["account_name"],
                "institution": t["institution"],
                "source_kind": source_kind,
                "source_label": source_label,
            })

        # 2. Housing expenses
        elif t["tx_type"] == "expense" and t["category"] == "Housing":
            if any(k in merch_u or k in desc_u for k in mort_kw) or "MORTGAGE MONTHLY PAYMENT" in desc_u:
                h_b["mortgage_pi"] += amt
                h_kind = "mortgage_pi"
            elif any(k in merch_u or k in desc_u for k in hoa_kw):
                h_b["hoa_total"] += amt
                h_kind = "hoa"
            else:
                h_b["property_tax_other"] += amt
                h_kind = "property_tax_other"
            h_b["housing_txs"].append({
                "id": t["id"],
                "tx_date": t["tx_date"],
                "merchant": t["merchant"],
                "description": t["description"],
                "amount": r2(amt),
                "account_name": t["account_name"],
                "institution": t["institution"],
                "kind": h_kind,
            })

        # 3. Extra Principal Prepayments (stored as transfer so debt paydown doesn't inflate burn rate)
        elif t["tx_type"] == "transfer":
            is_servicer_prepay = "ADDITIONAL PRINCIPAL PREPAYMENT" in desc_u
            is_bank_draft_prepay = bool(draft_kw) and (draft_kw in desc_u) and (ym not in has_servicer_prepay)
            if is_servicer_prepay or is_bank_draft_prepay:
                h_b["fidelity_extra_principal"] += abs_amt
                h_b["extra_principal_txs"].append({
                    "id": t["id"],
                    "tx_date": t["tx_date"],
                    "merchant": extra_merch,
                    "description": t["description"],
                    "amount": r2(abs_amt),
                    "account_name": t["account_name"],
                    "institution": extra_inst,
                    "funded_from": extra_from,
                })

    # Finalize numbers for each month
    for ym, data in out.items():
        inc_b = data["income_breakdown"]
        h_b = data["housing_breakdown"]

        inc_b["payroll"] = r2(inc_b["payroll"])
        inc_b["partner_reimbursement"] = r2(inc_b["partner_reimbursement"])
        inc_b["other_transfers"] = r2(inc_b["other_transfers"])
        inc_b["dividends_interest"] = r2(inc_b["dividends_interest"])
        inc_b["other_income"] = r2(inc_b["other_income"])
        inc_b["total"] = r2(inc_b["total"])

        source_defs = [
            ("payroll", payroll_lbl, inc_b["payroll"]),
            ("partner", partner_lbl, inc_b["partner_reimbursement"]),
            ("p2p", "Other Peer Transfers", inc_b["other_transfers"]),
            ("dividend", "Dividends & Interest", inc_b["dividends_interest"]),
            ("other", "Rewards & Other Inflows", inc_b["other_income"]),
        ]
        inc_b["sources"] = [
            {
                "kind": k,
                "label": lbl,
                "amount": val,
                "share_pct": round(val / inc_b["total"] * 100.0, 1) if inc_b["total"] > 0 else 0.0,
            }
            for k, lbl, val in source_defs
            if val > 0
        ]

        # Finalize Housing & Partner offset math
        h_b["mortgage_pi"] = r2(h_b["mortgage_pi"])
        h_b["hoa_total"] = r2(h_b["hoa_total"])
        if reg_hoa_part > 0 and h_b["hoa_total"] > 1500.0:
            h_b["hoa_regular"] = reg_hoa_part
            h_b["hoa_special_assessment"] = r2(h_b["hoa_total"] - reg_hoa_part)
        else:
            h_b["hoa_regular"] = r2(h_b["hoa_total"])
            h_b["hoa_special_assessment"] = 0.0
        h_b["property_tax_other"] = r2(h_b["property_tax_other"])
        h_b["gross_housing"] = r2(h_b["mortgage_pi"] + h_b["hoa_total"] + h_b["property_tax_other"])

        exp_mort = exp_mort_cfg if (h_b["mortgage_pi"] > 0 or h_b["partner_actual_offset"] >= v_m_min) else 0.0
        exp_hoa = exp_hoa_cfg if (h_b["hoa_regular"] > 0 or h_b["partner_actual_offset"] > 0) else 0.0
        h_b["partner_expected_mortgage"] = r2(exp_mort)
        h_b["partner_expected_hoa"] = r2(exp_hoa)
        h_b["partner_expected_total"] = r2(exp_mort + exp_hoa)
        h_b["partner_actual_offset"] = r2(h_b["partner_actual_offset"])

        h_b["net_housing"] = r2(max(0.0, h_b["gross_housing"] - h_b["partner_expected_total"]))
        h_b["net_housing_actual"] = r2(max(0.0, h_b["gross_housing"] - h_b["partner_actual_offset"]))
        h_b["fidelity_extra_principal"] = r2(h_b["fidelity_extra_principal"])
        h_b["total_housing_with_extra_gross"] = r2(h_b["gross_housing"] + h_b["fidelity_extra_principal"])
        h_b["total_housing_with_extra_net"] = r2(h_b["net_housing"] + h_b["fidelity_extra_principal"])

    return out


def build_cashflow(conn, scope, period, n_months=12, _shared=None):
    if _shared is not None and n_months == 12:
        months = _shared["months_12"]
        totals = _shared["totals_12"]
        details = _shared["ih_12"]
    else:
        months = [add_months(period.ym, -i) for i in range(n_months - 1, -1, -1)]
        totals = monthly_totals(conn, scope, months)
        details = monthly_income_and_housing_details(conn, scope, months)
    series = []
    for idx, m in enumerate(months):
        inc, sp = totals[m]["income"], totals[m]["spending"]
        net = inc - sp
        prev_inc = totals[months[idx - 1]]["income"] if idx > 0 else 0.0
        det = details.get(m, {})
        inc_b = det.get("income_breakdown", {})
        h_b = det.get("housing_breakdown", {})
        extra_prin = h_b.get("fidelity_extra_principal", 0.0)
        gross_h = h_b.get("gross_housing", 0.0)
        po_cfg = get_partner_offset_config()
        default_partner_exp = float(po_cfg.get("expected_total") or 0.0) if gross_h > 0 else 0.0
        partner_exp = h_b.get("partner_expected_total", default_partner_exp)
        net_h = h_b.get("net_housing", max(0.0, gross_h - partner_exp))
        ex_h = max(0.0, sp - gross_h)

        series.append({
            "month": m,
            "label": month_label(m),
            "income": r2(inc),
            "income_mom_diff": r2(inc - prev_inc) if idx > 0 and prev_inc > 0 else 0.0,
            "income_mom_pct": pct_change(inc, prev_inc) if idx > 0 and prev_inc > 0 else 0.0,
            "spending": r2(sp),
            "ex_housing_spend": r2(ex_h),
            "housing_spend": r2(gross_h),
            "net_housing_spend": r2(net_h),
            "spending_net_partner": r2(ex_h + net_h),
            "partner_offset": r2(partner_exp),
            "partner_actual_offset": r2(h_b.get("partner_actual_offset", 0.0)),
            "fidelity_extra_principal": r2(extra_prin),
            "total_outflow_with_principal": r2(sp + extra_prin),
            "net_savings": r2(net),
            "net_cashflow_after_principal": r2(net - extra_prin),
            "savings_rate_pct": round(net / inc * 100.0, 1) if inc > 0 else None,
            "is_partial": m == period.ym and period.is_partial,
            "income_breakdown": inc_b,
            "housing_breakdown": h_b,
        })
    return series


def _avg(values):
    return sum(values) / float(len(values)) if values else 0.0


def category_month_sums(conn, scope, months, compare_day=None):
    """{category: {ym: (spend, count)}}"""
    out = defaultdict(dict)
    if not months:
        return out
    marks = ",".join("?" * len(months))
    rows = conn.execute(
        "SELECT t.category, substr(t.tx_date,1,7) AS ym, SUM(t.amount) AS total, "
        "COUNT(*) AS cnt "
        "FROM transactions t WHERE t.tx_type='expense' AND substr(t.tx_date,1,7) IN (" + marks + ")"
        + scope.clause() + day_clause(compare_day) + " GROUP BY t.category, ym",
        months,
    ).fetchall()
    for r in rows:
        out[r["category"]][r["ym"]] = (float(r["total"] or 0.0), int(r["cnt"] or 0))
    return out


def merchant_month_sums(conn, scope, months, compare_day=None, category=None):
    """{(merchant, category): {ym: (spend, count)}}"""
    out = defaultdict(dict)
    if not months:
        return out
    marks = ",".join("?" * len(months))
    params = list(months)
    cat_sql = ""
    if category:
        cat_sql = " AND t.category = ? "
        params.append(category)
    rows = conn.execute(
        "SELECT t.merchant, t.category, substr(t.tx_date,1,7) AS ym, SUM(t.amount) AS total, COUNT(*) AS cnt "
        "FROM transactions t WHERE t.tx_type='expense' AND substr(t.tx_date,1,7) IN (" + marks + ")"
        + cat_sql + scope.clause() + day_clause(compare_day) + " GROUP BY t.merchant, t.category, ym",
        params,
    ).fetchall()
    for r in rows:
        out[(r["merchant"], r["category"])][r["ym"]] = (float(r["total"] or 0.0), int(r["cnt"] or 0))
    return out


def budgets_map(conn):
    return {r["category"]: float(r["monthly_limit"]) for r in conn.execute("SELECT category, monthly_limit FROM budgets")}


def _budget_status(spend, budget, period, forecast_spend):
    if budget <= 0:
        return None
    if spend > budget:
        return "over"
    if period.is_partial and forecast_spend > budget * 1.02:
        return "at_risk"
    if not period.is_partial and spend > budget * 0.9:
        return "near"
    return "on_track"


def build_spending(conn, scope, period, recurring, _shared=None):
    """Category table, attribution, fixed/discretionary split, pace & forecast, top merchants."""
    cd = period.compare_day
    if _shared is not None:
        hist_months = _shared["months_12"]
        full = _shared["cat_sums_12"]
        merch_sums_12 = _shared["merch_sums_12"]
        cur_ih = _shared["ih_12"]
    else:
        hist_months = [add_months(period.ym, -i) for i in range(11, -1, -1)]
        full = category_month_sums(conn, scope, hist_months)
        merch_sums_12 = None
        cur_ih = None
    cmp_ = category_month_sums(conn, scope, [period.ym] + period.prior_3, cd) if cd else full
    budgets = budgets_map(conn)

    pending_by_cat = defaultdict(float)
    pending_items = []
    if period.is_partial:
        for r in recurring:
            if r["cadence"] in ("monthly", "weekly", "biweekly") and r.get("next_expected") and \
                    period.as_of.isoformat() < r["next_expected"] <= period.end:
                pending_by_cat[r["category"]] += r["amount"]
                pending_items.append({"merchant": r["merchant"], "amount": r["amount"], "expected": r["next_expected"]})

    recurring_names = set(r["merchant"] for r in recurring)
    if merch_sums_12 is not None:
        merch_full = {
            k: {period.ym: v[period.ym]}
            for k, v in merch_sums_12.items()
            if period.ym in v
        }
    else:
        merch_full = merchant_month_sums(conn, scope, [period.ym])
    recurring_posted_by_cat = defaultdict(float)
    for (m, c), by_m in merch_full.items():
        if m in recurring_names:
            recurring_posted_by_cat[c] += by_m.get(period.ym, (0.0, 0))[0]

    cats = set(budgets.keys())
    for c, by_m in full.items():
        if any(abs(by_m.get(m, (0, 0))[0]) > 0 for m in [period.ym] + period.prior_3):
            cats.add(c)

    rows = []
    for c in cats:
        cur_full, cnt = full.get(c, {}).get(period.ym, (0.0, 0))
        cur_cmp = cmp_.get(c, {}).get(period.ym, (0.0, 0))[0]
        prev_cmp = cmp_.get(c, {}).get(period.prev_ym, (0.0, 0))[0]
        avg_cmp = _avg([cmp_.get(c, {}).get(m, (0.0, 0))[0] for m in period.prior_3])
        avg_full = _avg([full.get(c, {}).get(m, (0.0, 0))[0] for m in period.prior_3])
        fixed = is_fixed(c)
        if period.is_partial:
            rec_posted = recurring_posted_by_cat.get(c, 0.0)
            other = cur_full - rec_posted
            variable_extrapolated = (other / max(period.days_elapsed, 1) * period.dim) if other > 0 else other
            forecast = rec_posted + pending_by_cat.get(c, 0.0) + variable_extrapolated
        else:
            forecast = cur_full
        budget = budgets.get(c, 0.0)
        mom = cur_cmp - prev_cmp
        vs_avg = cur_cmp - avg_cmp
        status = "stable"
        if vs_avg >= 25 and (pct_change(cur_cmp, avg_cmp) or 999) >= 15:
            status = "up"
        elif vs_avg <= -25 and (pct_change(cur_cmp, avg_cmp) or 0) <= -15:
            status = "down"
        rows.append({
            "category": c,
            "is_fixed": fixed,
            "spend": r2(cur_full),
            "tx_count": cnt,
            "compare_spend": r2(cur_cmp),
            "prev_spend": r2(prev_cmp),
            "avg_3m_spend": r2(avg_cmp),
            "avg_3m_full": r2(avg_full),
            "mom_diff": r2(mom),
            "mom_pct": pct_change(cur_cmp, prev_cmp),
            "vs_avg_diff": r2(vs_avg),
            "vs_avg_pct": pct_change(cur_cmp, avg_cmp),
            "forecast": r2(forecast),
            "budget": r2(budget),
            "budget_pct": round(cur_full / budget * 100.0, 1) if budget > 0 else None,
            "budget_remaining": r2(budget - cur_full) if budget > 0 else None,
            "budget_status": _budget_status(cur_full, budget, period, forecast),
            "status": status,
            "history": [{"month": m, "spend": r2(full.get(c, {}).get(m, (0.0, 0))[0])} for m in hist_months],
        })
    rows.sort(key=lambda x: (x["spend"], x["budget"]), reverse=True)

    # Change attribution
    if cd:
        merch = merchant_month_sums(conn, scope, [period.ym] + period.prior_3, cd)
    elif merch_sums_12 is not None:
        merch = merch_sums_12
    else:
        merch = merchant_month_sums(conn, scope, [period.ym] + period.prior_3)
    drivers = defaultdict(list)
    for (m, c), by_m in merch.items():
        cur = by_m.get(period.ym, (0.0, 0))[0]
        avg = _avg([by_m.get(x, (0.0, 0))[0] for x in period.prior_3])
        if abs(cur - avg) >= 0.01:
            drivers[c].append({"merchant": m, "spend": r2(cur), "avg_3m": r2(avg), "diff": r2(cur - avg)})
    attribution = []
    for row in rows:
        d = row["vs_avg_diff"]
        if abs(d) < 1:
            continue
        ds = sorted(drivers.get(row["category"], []), key=lambda x: x["diff"], reverse=d > 0)
        attribution.append({
            "category": row["category"],
            "diff": d,
            "pct": row["vs_avg_pct"],
            "drivers": ds[:3],
        })
    attribution.sort(key=lambda x: abs(x["diff"]), reverse=True)
    for row in rows:
        ds = sorted(drivers.get(row["category"], []), key=lambda x: x["diff"], reverse=True)
        row["top_driver"] = ds[0] if ds and ds[0]["diff"] > 0 else None

    total_spend = sum(r["spend"] for r in rows)
    total_cmp = sum(r["compare_spend"] for r in rows)
    total_prev = sum(r["prev_spend"] for r in rows)
    total_avg = sum(r["avg_3m_spend"] for r in rows)
    total_forecast = sum(r["forecast"] for r in rows)
    fixed_spend = sum(r["spend"] for r in rows if r["is_fixed"])
    total_budget = sum(r["budget"] for r in rows)
    pace = {
        "spend_to_date": r2(total_spend),
        "forecast": r2(total_forecast),
        "avg_3m_full": r2(sum(r["avg_3m_full"] for r in rows)),
        "daily_avg": r2(total_spend / max(period.days_elapsed, 1)),
        "pending_recurring": sorted(pending_items, key=lambda x: x["expected"]),
        "pending_recurring_total": r2(sum(p["amount"] for p in pending_items)),
        "total_budget": r2(total_budget),
        "budget_used_pct": round(total_spend / total_budget * 100.0, 1) if total_budget > 0 else None,
        "forecast_vs_budget": r2(total_forecast - total_budget) if total_budget > 0 else None,
    }

    top_merchants = []
    for (m, c), by_m in merch_full.items():
        cur, cnt = by_m.get(period.ym, (0.0, 0))
        if cur <= 0:
            continue
        cm = merch.get((m, c), {})
        avg = _avg([cm.get(x, (0.0, 0))[0] for x in period.prior_3])
        top_merchants.append({"merchant": m, "category": c, "spend": r2(cur), "count": cnt,
                              "avg_3m": r2(avg), "diff": r2(cm.get(period.ym, (0.0, 0))[0] - avg)})
    top_merchants.sort(key=lambda x: x["spend"], reverse=True)

    seen_before = set(r["merchant"] for r in conn.execute(
        "SELECT DISTINCT t.merchant FROM transactions t WHERE t.tx_type='expense' AND t.tx_date < ?" + scope.clause(),
        (period.start,)))
    new_merchants = [m for m in top_merchants if m["merchant"] not in seen_before]

    if cur_ih is None:
        cur_ih = monthly_income_and_housing_details(conn, scope, hist_months)
    cur_det = cur_ih.get(period.ym, {})
    cur_hb = cur_det.get("housing_breakdown", {})
    cur_ib = cur_det.get("income_breakdown", {})
    ytd_extra_principal = r2(sum(
        cur_ih.get(m, {}).get("housing_breakdown", {}).get("fidelity_extra_principal", 0.0)
        for m in hist_months
    ))
    all_extra_txs = []
    for m in reversed(hist_months):
        all_extra_txs.extend(cur_ih.get(m, {}).get("housing_breakdown", {}).get("extra_principal_txs", []))

    gross_h = cur_hb.get("gross_housing", 0.0)
    net_h = cur_hb.get("net_housing", 0.0)
    partner_exp = cur_hb.get("partner_expected_total", float(get_partner_offset_config().get("expected_total") or 0.0) if gross_h > 0 else 0.0)
    extra_p = cur_hb.get("fidelity_extra_principal", 0.0)
    ex_h_spend = r2(max(0.0, total_spend - gross_h))
    spend_net_partner = r2(ex_h_spend + net_h)

    return {
        "totals": {
            "spend": r2(total_spend),
            "ex_housing_spend": ex_h_spend,
            "housing_spend": r2(gross_h),
            "net_housing_spend": r2(net_h),
            "spend_net_partner": spend_net_partner,
            "partner_offset": r2(partner_exp),
            "partner_actual_offset": r2(cur_hb.get("partner_actual_offset", 0.0)),
            "fidelity_extra_principal": r2(extra_p),
            "ytd_fidelity_extra_principal": ytd_extra_principal,
            "total_outflow_with_principal": r2(total_spend + extra_p),
            "compare_spend": r2(total_cmp),
            "prev_spend": r2(total_prev),
            "avg_3m_spend": r2(total_avg),
            "mom_diff": r2(total_cmp - total_prev),
            "mom_pct": pct_change(total_cmp, total_prev),
            "vs_avg_diff": r2(total_cmp - total_avg),
            "vs_avg_pct": pct_change(total_cmp, total_avg),
            "fixed": r2(fixed_spend),
            "discretionary": r2(total_spend - fixed_spend),
            "fixed_pct": round(fixed_spend / total_spend * 100.0, 1) if total_spend > 0 else None,
        },
        "income_breakdown": cur_ib,
        "housing_breakdown": dict(cur_hb, ytd_fidelity_extra_principal=ytd_extra_principal, all_extra_principal_txs=all_extra_txs),
        "pace": pace,
        "categories": rows,
        "attribution": attribution,
        "top_merchants": top_merchants[:15],
        "new_merchants": new_merchants[:10],
    }


def category_detail(conn, scope, period, category):
    """Drill-down for one category: 12-month history, merchant breakdown and the month's transactions."""
    hist_months = [add_months(period.ym, -i) for i in range(11, -1, -1)]
    full = category_month_sums(conn, scope, hist_months).get(category, {})
    history = [{"month": m, "label": month_label(m), "spend": r2(full.get(m, (0.0, 0))[0])} for m in hist_months]
    merch = merchant_month_sums(conn, scope, [period.ym] + period.prior_3, category=category)
    merchants = []
    for (m, _c), by_m in merch.items():
        cur, cnt = by_m.get(period.ym, (0.0, 0))
        avg = _avg([by_m.get(x, (0.0, 0))[0] for x in period.prior_3])
        if abs(cur) < 0.005 and abs(avg) < 0.005:
            continue
        merchants.append({"merchant": m, "spend": r2(cur), "count": cnt, "avg_3m": r2(avg), "diff": r2(cur - avg)})
    merchants.sort(key=lambda x: (x["spend"], x["avg_3m"]), reverse=True)
    txs = [dict(r) for r in conn.execute(
        "SELECT t.id, t.tx_date, t.merchant, t.description, t.amount, t.category, t.tx_type, a.name AS account_name, a.institution "
        "FROM transactions t JOIN accounts a ON a.id = t.account_id "
        "WHERE t.category = ? AND t.tx_type='expense' AND substr(t.tx_date,1,7) = ?" + scope.clause() +
        " ORDER BY t.tx_date DESC, t.id DESC",
        (category, period.ym),
    )]
    budget = budgets_map(conn).get(category, 0.0)
    spend = full.get(period.ym, (0.0, 0))[0]
    nonzero = [h["spend"] for h in history[:-1] if h["spend"] > 0]
    out = {
        "category": category,
        "period": period.to_dict(),
        "spend": r2(spend),
        "budget": r2(budget),
        "is_fixed": is_fixed(category),
        "avg_12m": r2(_avg(nonzero)),
        "max_12m": r2(max(nonzero) if nonzero else 0.0),
        "history": history,
        "merchants": merchants,
        "transactions": txs,
    }
    if category == "Housing":
        ih_map = monthly_income_and_housing_details(conn, scope, hist_months)
        cur_hb = ih_map.get(period.ym, {}).get("housing_breakdown", {})
        ytd_extra = r2(sum(ih_map.get(m, {}).get("housing_breakdown", {}).get("fidelity_extra_principal", 0.0) for m in hist_months))
        all_extra_txs = []
        for m in reversed(hist_months):
            all_extra_txs.extend(ih_map.get(m, {}).get("housing_breakdown", {}).get("extra_principal_txs", []))
        out["housing_breakdown"] = dict(cur_hb, ytd_fidelity_extra_principal=ytd_extra, all_extra_principal_txs=all_extra_txs)
    return out


def build_monthly_spending_explorer(conn, scope, period, n_months=12, _shared=None):
    """Builds a 12-month stacked category & merchant summary for interactive charts."""
    if _shared is not None and n_months == 12:
        months = _shared["months_12"]
        totals = _shared["totals_12"]
        cat_sums = _shared["cat_sums_12"]
        merch_sums = _shared["merch_sums_12"]
        ih_details = _shared["ih_12"]
    else:
        months = [add_months(period.ym, -i) for i in range(n_months - 1, -1, -1)]
        totals = monthly_totals(conn, scope, months)
        cat_sums = category_month_sums(conn, scope, months)
        merch_sums = merchant_month_sums(conn, scope, months)
        ih_details = monthly_income_and_housing_details(conn, scope, months)

    # Compute total 12-month spend per category to order stacked bars consistently
    cat_12m_totals = {}
    for c, by_m in cat_sums.items():
        cat_12m_totals[c] = sum(max(0.0, by_m.get(m, (0.0, 0))[0]) for m in months)
    categories_order = [
        c for c, tot in sorted(cat_12m_totals.items(), key=lambda x: x[1], reverse=True)
        if tot > 0
    ]

    # Top merchant per month
    top_merch_by_month = {}
    for (merch_name, cat_name), by_m in merch_sums.items():
        for m, (sp, cnt) in by_m.items():
            if sp > 0:
                cur_best = top_merch_by_month.get(m)
                if not cur_best or sp > cur_best["spend"]:
                    top_merch_by_month[m] = {
                        "merchant": merch_name,
                        "category": cat_name,
                        "spend": r2(sp),
                        "count": cnt,
                    }

    series = []
    for m in months:
        inc = totals[m]["income"]
        sp = totals[m]["spending"]
        det = ih_details.get(m, {})
        inc_b = det.get("income_breakdown", {})
        h_b = det.get("housing_breakdown", {})
        by_cat = {}
        tx_count = 0
        housing_spend = 0.0
        top_cat = None
        for c in categories_order:
            c_sp, c_cnt = cat_sums.get(c, {}).get(m, (0.0, 0))
            if c_sp > 0:
                by_cat[c] = r2(c_sp)
                tx_count += c_cnt
                if c == "Housing":
                    housing_spend += c_sp
                if not top_cat or c_sp > top_cat["spend"]:
                    top_cat = {"category": c, "spend": r2(c_sp)}

        ex_housing_spend = max(0.0, sp - housing_spend)
        po_exp_default = float(get_partner_offset_config().get("expected_total") or 0.0)
        net_housing = h_b.get("net_housing", max(0.0, housing_spend - po_exp_default))
        partner_offset = h_b.get("partner_expected_total", po_exp_default if housing_spend > 0 else 0.0)
        extra_prin = h_b.get("fidelity_extra_principal", 0.0)
        prev_m = add_months(m, -1)
        prev_sp = totals.get(prev_m, {}).get("spending", 0.0)
        prev_inc = totals.get(prev_m, {}).get("income", 0.0)
        series.append({
            "month": m,
            "label": month_label(m),
            "total_spend": r2(sp),
            "ex_housing_spend": r2(ex_housing_spend),
            "housing_spend": r2(housing_spend),
            "net_housing_spend": r2(net_housing),
            "spend_net_partner": r2(ex_housing_spend + net_housing),
            "partner_offset": r2(partner_offset),
            "partner_actual_offset": r2(h_b.get("partner_actual_offset", 0.0)),
            "fidelity_extra_principal": r2(extra_prin),
            "total_outflow_with_principal": r2(sp + extra_prin),
            "income": r2(inc),
            "income_mom_diff": r2(inc - prev_inc) if prev_inc > 0 else 0.0,
            "income_mom_pct": pct_change(inc, prev_inc) if prev_inc > 0 else 0.0,
            "net_savings": r2(inc - sp),
            "net_cashflow_after_principal": r2(inc - sp - extra_prin),
            "mom_diff": r2(sp - prev_sp) if prev_sp > 0 else 0.0,
            "mom_pct": pct_change(sp, prev_sp) if prev_sp > 0 else 0.0,
            "tx_count": tx_count,
            "by_category": by_cat,
            "top_category": top_cat,
            "top_merchant": top_merch_by_month.get(m),
            "income_breakdown": inc_b,
            "housing_breakdown": h_b,
        })

    # Top 6 merchants per category across all 12 months (powers zero-click matrix inline expansion)
    by_cat_merchants = defaultdict(list)
    for (m_name, c_name), by_m in merch_sums.items():
        by_month = {m: r2(by_m[m][0]) for m in months if by_m.get(m, (0.0, 0))[0] > 0}
        tot_12m = r2(sum(by_month.values()))
        if tot_12m <= 0:
            continue
        cnt_12m = sum(int(by_m.get(m, (0.0, 0))[1] or 0) for m in months)
        by_cat_merchants[c_name].append({
            "merchant": m_name,
            "total_12m": tot_12m,
            "avg_12m": r2(tot_12m / float(max(1, len(months)))),
            "count_12m": cnt_12m,
            "by_month": by_month,
        })
    category_top_merchants = {}
    for c_name, items in by_cat_merchants.items():
        items.sort(key=lambda x: x["total_12m"], reverse=True)
        category_top_merchants[c_name] = items[:6]

    return {
        "months": series,
        "categories_order": categories_order,
        "category_top_merchants": category_top_merchants,
    }


def month_detail(conn, scope, ym):
    """Comprehensive drill-down for a clicked month: KPIs, categories, daily timeline, top merchants, cards, and transactions."""
    prev_ym = add_months(ym, -1)
    prior_3 = [add_months(ym, -i) for i in (1, 2, 3)]
    all_target_months = [ym, prev_ym] + prior_3
    totals = monthly_totals(conn, scope, [ym, prev_ym])
    cat_sums = category_month_sums(conn, scope, all_target_months)
    merch_sums = merchant_month_sums(conn, scope, [ym, prev_ym])
    ih_details = monthly_income_and_housing_details(conn, scope, [ym, prev_ym])
    cur_det = ih_details.get(ym, {})
    prev_det = ih_details.get(prev_ym, {})
    inc_b = cur_det.get("income_breakdown", {})
    h_b = cur_det.get("housing_breakdown", {})

    cur_spend = totals[ym]["spending"]
    prev_spend = totals[prev_ym]["spending"]
    cur_income = totals[ym]["income"]
    prev_income = totals[prev_ym]["income"]
    net_sav = cur_income - cur_spend
    extra_prin = h_b.get("fidelity_extra_principal", 0.0)

    # Fetch all transactions in this month
    tx_rows = [
        dict(r)
        for r in conn.execute(
            "SELECT t.id, t.tx_date, t.merchant, t.description, t.amount, t.category, t.tx_type, "
            "t.account_id, a.name AS account_name, a.institution, a.account_type "
            "FROM transactions t JOIN accounts a ON a.id = t.account_id "
            "WHERE substr(t.tx_date, 1, 7) = ?" + scope.clause() +
            " ORDER BY t.tx_date DESC, ABS(t.amount) DESC, t.id DESC",
            (ym,),
        ).fetchall()
    ]

    expense_txs = [t for t in tx_rows if t["tx_type"] == "expense"]
    income_txs = [t for t in tx_rows if t["tx_type"] == "income"]
    housing_spend = sum(float(t["amount"]) for t in expense_txs if t["category"] == "Housing")
    ex_housing_spend = max(0.0, cur_spend - housing_spend)
    po_exp_default = float(get_partner_offset_config().get("expected_total") or 0.0)
    net_housing_spend = h_b.get("net_housing", max(0.0, housing_spend - po_exp_default))
    spend_net_partner = r2(ex_housing_spend + net_housing_spend)

    # Top merchant per category in ym
    top_merch_per_cat = {}
    for (m_name, c_name), by_m in merch_sums.items():
        sp, cnt = by_m.get(ym, (0.0, 0))
        if sp > 0:
            cur_top = top_merch_per_cat.get(c_name)
            if not cur_top or sp > cur_top["spend"]:
                top_merch_per_cat[c_name] = {"merchant": m_name, "spend": r2(sp), "count": cnt}

    # Category breakdown for ym
    categories = []
    for c_name, by_m in cat_sums.items():
        c_sp, c_cnt = by_m.get(ym, (0.0, 0))
        p_sp, _ = by_m.get(prev_ym, (0.0, 0))
        avg_3m = _avg([by_m.get(pm, (0.0, 0))[0] for pm in prior_3])
        if c_sp <= 0 and p_sp <= 0:
            continue
        tm = top_merch_per_cat.get(c_name)
        categories.append({
            "category": c_name,
            "spend": r2(c_sp),
            "prev_spend": r2(p_sp),
            "avg_3m_spend": r2(avg_3m),
            "mom_diff": r2(c_sp - p_sp),
            "mom_pct": pct_change(c_sp, p_sp) or 0.0,
            "share_pct": round(c_sp / cur_spend * 100.0, 1) if cur_spend > 0 else 0.0,
            "tx_count": c_cnt,
            "is_fixed": is_fixed(c_name),
            "top_merchant": tm["merchant"] if tm else "",
            "top_merchant_spend": tm["spend"] if tm else 0.0,
        })
    categories.sort(key=lambda x: x["spend"], reverse=True)

    # Top merchants in ym
    merchants = []
    for (m_name, c_name), by_m in merch_sums.items():
        sp, cnt = by_m.get(ym, (0.0, 0))
        p_sp, _ = by_m.get(prev_ym, (0.0, 0))
        if sp <= 0:
            continue
        merchants.append({
            "merchant": m_name,
            "category": c_name,
            "spend": r2(sp),
            "prev_spend": r2(p_sp),
            "mom_diff": r2(sp - p_sp),
            "count": cnt,
            "share_pct": round(sp / cur_spend * 100.0, 1) if cur_spend > 0 else 0.0,
            "avg_tx": r2(sp / cnt) if cnt > 0 else r2(sp),
        })
    merchants.sort(key=lambda x: x["spend"], reverse=True)

    # Daily spending timeline (1..days_in_month)
    dim = days_in_month(ym)
    daily_map = {
        d: {"spend": 0.0, "ex_housing_spend": 0.0, "tx_count": 0, "top_merchant": "", "top_amount": 0.0, "categories": defaultdict(float)}
        for d in range(1, dim + 1)
    }
    for t in expense_txs:
        try:
            day_num = int(str(t["tx_date"])[8:10])
        except Exception:
            continue
        if day_num not in daily_map:
            continue
        amt = float(t["amount"] or 0.0)
        slot = daily_map[day_num]
        slot["spend"] += amt
        if t["category"] != "Housing":
            slot["ex_housing_spend"] += amt
        slot["tx_count"] += 1
        slot["categories"][t["category"]] += amt
        if amt > slot["top_amount"]:
            slot["top_amount"] = amt
            slot["top_merchant"] = t["merchant"]

    daily_series = []
    biggest_day = None
    for d in range(1, dim + 1):
        slot = daily_map[d]
        date_str = "{0}-{1:02d}".format(ym, d)
        item = {
            "day": d,
            "date": date_str,
            "spend": r2(slot["spend"]),
            "ex_housing_spend": r2(slot["ex_housing_spend"]),
            "tx_count": slot["tx_count"],
            "top_merchant": slot["top_merchant"],
            "top_amount": r2(slot["top_amount"]),
            "categories": {k: r2(v) for k, v in slot["categories"].items()},
        }
        daily_series.append(item)
        if item["spend"] > 0 and (not biggest_day or item["spend"] > biggest_day["spend"]):
            biggest_day = item

    # Spend by Account / Card in ym
    acct_map = {}
    for t in expense_txs:
        aid = t["account_id"]
        slot = acct_map.setdefault(aid, {
            "account_id": aid,
            "account_name": t["account_name"],
            "institution": t["institution"],
            "account_type": t["account_type"],
            "spend": 0.0,
            "tx_count": 0,
        })
        slot["spend"] += float(t["amount"] or 0.0)
        slot["tx_count"] += 1

    by_account = []
    for slot in acct_map.values():
        slot["spend"] = r2(slot["spend"])
        slot["share_pct"] = round(slot["spend"] / cur_spend * 100.0, 1) if cur_spend > 0 else 0.0
        by_account.append(slot)
    by_account.sort(key=lambda x: x["spend"], reverse=True)

    biggest_tx = max(expense_txs, key=lambda x: float(x["amount"] or 0.0)) if expense_txs else None

    return {
        "month": ym,
        "label": month_label(ym),
        "prev_month": prev_ym,
        "prev_label": month_label(prev_ym),
        "kpis": {
            "total_spend": r2(cur_spend),
            "ex_housing_spend": r2(ex_housing_spend),
            "housing_spend": r2(housing_spend),
            "net_housing_spend": r2(net_housing_spend),
            "spend_net_partner": spend_net_partner,
            "partner_offset": r2(h_b.get("partner_expected_total", po_exp_default if housing_spend > 0 else 0.0)),
            "partner_actual_offset": r2(h_b.get("partner_actual_offset", 0.0)),
            "fidelity_extra_principal": r2(extra_prin),
            "total_outflow_with_principal": r2(cur_spend + extra_prin),
            "prev_spend": r2(prev_spend),
            "mom_diff": r2(cur_spend - prev_spend),
            "mom_pct": pct_change(cur_spend, prev_spend) or 0.0,
            "income": r2(cur_income),
            "prev_income": r2(prev_income),
            "income_mom_diff": r2(cur_income - prev_income),
            "income_mom_pct": pct_change(cur_income, prev_income) or 0.0,
            "net_savings": r2(net_sav),
            "net_cashflow_after_principal": r2(net_sav - extra_prin),
            "savings_rate_pct": round(net_sav / cur_income * 100.0, 1) if cur_income > 0 else 0.0,
            "tx_count": len(expense_txs),
            "income_tx_count": len(income_txs),
            "avg_daily_spend": r2(cur_spend / float(dim)),
            "avg_daily_ex_housing": r2(ex_housing_spend / float(dim)),
            "biggest_day": biggest_day,
            "biggest_tx": {
                "merchant": biggest_tx["merchant"],
                "amount": r2(biggest_tx["amount"]),
                "tx_date": biggest_tx["tx_date"],
                "category": biggest_tx["category"],
                "institution": biggest_tx["institution"],
            } if biggest_tx else None,
        },
        "income_breakdown": inc_b,
        "housing_breakdown": h_b,
        "categories": categories,
        "merchants": merchants[:30],
        "daily_series": daily_series,
        "by_account": by_account,
        "transactions": tx_rows,
    }
