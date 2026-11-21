"""Turns findings from every module into a short, ranked, plain-English 'Needs attention' feed."""

from backend.profile_loader import get_household_profile, get_partner_offset_config

SEVERITY_WEIGHT = {"high": 3.0, "medium": 2.0, "low": 1.0, "positive": 0.5}

CADENCE_ANNUAL_FACTOR = {
    "weekly": 52.0,
    "biweekly": 26.0,
    "monthly": 12.0,
    "quarterly": 4.0,
    "annual": 1.0,
}


def _money(x):
    return "${0:,.0f}".format(abs(x or 0.0))


def build_insights(period, spending, recurring, anomalies, duplicates, networth, investments, cashflow):
    out = []

    def add(id_, severity, title, detail, impact=0.0, link=None, kind="spending"):
        out.append({"id": id_, "severity": severity, "kind": kind, "title": title, "detail": detail,
                    "impact": round(abs(impact or 0.0), 2), "link": link or {}})

    basis = "at this point last month" if period.is_partial else "your 3-month average"

    hh = get_household_profile()
    po = get_partner_offset_config()
    partner_name = hh.get("partner_name", "Partner")
    extra_from = po.get("extra_principal_account_label", "Brokerage")
    exp_partner_default = float(po.get("expected_total") or 0.0)
    exp_mort_cfg = float(po.get("expected_mortgage") or 0.0)
    exp_hoa_cfg = float(po.get("expected_hoa") or 0.0)

    # Housing, Mortgage, Extra Principal & Partner Offset Insight
    hb = spending.get("housing_breakdown") or {}
    if hb and (hb.get("gross_housing", 0) > 0 or hb.get("fidelity_extra_principal", 0) > 0):
        mort_pi = hb.get("mortgage_pi", 0.0)
        hoa_reg = hb.get("hoa_regular", 0.0)
        hoa_spec = hb.get("hoa_special_assessment", 0.0)
        p_tot = hb.get("partner_expected_total", exp_partner_default)
        p_act = hb.get("partner_actual_offset", 0.0)
        net_h = hb.get("net_housing", max(0.0, hb.get("gross_housing", 0.0) - p_tot))
        extra_p = hb.get("fidelity_extra_principal", 0.0)
        ytd_extra = hb.get("ytd_fidelity_extra_principal", 0.0)
        detail_parts = [
            "${0:,.0f} Mortgage P&I + ${1:,.0f} HOA".format(mort_pi, hoa_reg)
            + (" (+${0:,.0f} HOA special assessment)".format(hoa_spec) if hoa_spec > 0 else ""),
        ]
        if p_tot > 0:
            detail_parts.append(
                "less {0}'s ${1:,.0f}/mo housing share (${2:,.0f} mortgage + ${3:,.0f} HOA{4}) = ${5:,.0f} net baseline housing.".format(
                    partner_name, p_tot, exp_mort_cfg, exp_hoa_cfg,
                    ", ${0:,.0f} received this month".format(p_act) if p_act > 0 else "",
                    net_h,
                )
            )
        if extra_p > 0:
            detail_parts.append(
                "Plus ${0:,.0f} extra principal paid from {1} (${2:,.0f} YTD principal prepayments).".format(
                    extra_p, extra_from, ytd_extra
                )
            )
        add(
            "housing-math-summary",
            "positive" if hoa_spec == 0 else "medium",
            "Net housing is ${0:,.0f}/mo{1}{2}".format(
                net_h,
                " after {0}'s ${1:,.0f} share".format(partner_name, p_tot) if p_tot > 0 else "",
                " (+${0:,.0f} extra principal)".format(extra_p) if extra_p > 0 else "",
            ),
            " ".join(detail_parts),
            extra_p if extra_p > 0 else net_h,
            {"inspector": "cashflow", "category": "Housing"},
            kind="housing",
        )

    # Budgets (over / pacing over)
    for c in spending["categories"]:
        st = c["budget_status"]
        cat_name = c.get("category") or "Uncategorized"
        if cat_name == "Housing" and (hb.get("hoa_special_assessment", 0.0) == 0):
            # Normal baseline housing is covered by the dedicated housing-math-summary insight above
            continue
        if st == "over":
            add("budget-over-" + cat_name, "high", "{0} is over budget".format(cat_name),
                "{0} spent of {1} budget ({2}%).".format(_money(c["spend"]), _money(c["budget"]), int(c["budget_pct"] or 0)),
                c["spend"] - c["budget"], {"inspector": "category", "category": cat_name, "tab": "spending"})
        elif st == "at_risk":
            add("budget-risk-" + cat_name, "medium", "{0} is on pace to exceed budget".format(cat_name),
                "Forecast {0} vs {1} budget.".format(_money(c["forecast"]), _money(c["budget"])),
                c["forecast"] - c["budget"], {"inspector": "category", "category": cat_name, "tab": "spending"})

    # Biggest increases (attribution)
    for a in spending["attribution"][:4]:
        if a["diff"] >= 75 and (a["pct"] is None or a["pct"] >= 20):
            drv = a["drivers"][0] if a["drivers"] else None
            detail = "Up {0} vs {1}".format(_money(a["diff"]), basis)
            if drv and drv["diff"] > 0:
                detail += ", mostly {0} (+{1}).".format(drv["merchant"], _money(drv["diff"]))
            cat_name = a.get("category") or "Uncategorized"
            add("increase-" + cat_name, "medium", "{0} spending is up {1}".format(
                cat_name, "{0}%".format(int(a["pct"])) if a["pct"] is not None else _money(a["diff"])),
                detail, a["diff"], {"tab": "spending", "category": cat_name})

    # Subscription / bill price increases (within the selected month)
    for r in recurring:
        pc = r.get("price_change")
        if pc and pc["diff"] > 0 and pc["date"][:7] == period.ym:
            ann_factor = CADENCE_ANNUAL_FACTOR.get(r.get("cadence"), 12.0)
            ann_diff = pc["diff"] * ann_factor
            add("price-" + r["merchant"], "medium", "{0} went up {1}%".format(r["merchant"], int(round(pc["pct"]))),
                "${0:,.2f} → ${1:,.2f} ({2}/yr more).".format(pc["from"], pc["to"], _money(ann_diff)),
                ann_diff, {"tab": "spending", "section": "recurring"}, kind="recurring")
        elif r["status"] == "missed":
            add("missed-" + r["merchant"], "low", "{0} hasn't charged as expected".format(r["merchant"]),
                "Usually {0} {1}; expected around {2}. Cancelled, or a billing change?".format(
                    "${0:,.2f}".format(r["amount"]), r["cadence"], r["next_expected"]),
                r["amount"], {"tab": "spending", "section": "recurring"}, kind="recurring")

    # Duplicates & anomalies
    for d in duplicates:
        add("dup-{0}".format(d["ids"][1]), "high", "Possible duplicate charge: {0}".format(d["merchant"]),
            "Two charges of ${0:,.2f} on {1} and {2} ({3}).".format(d["amount"], d["dates"][0], d["dates"][1], d["account_name"]),
            d["amount"], {"tab": "activity", "search": d["merchant"]}, kind="anomaly")
    for a in anomalies[:3]:
        add("anom-{0}".format(a["id"]), "low", "Unusual charge: {0} {1}".format(a["merchant"], "${0:,.2f}".format(a["amount"])),
            "{0} · {1}.".format(a["reason"], a["tx_date"]), a["excess"], {"tab": "activity", "search": a["merchant"]}, kind="anomaly")

    # Savings rate vs prior 3 full months
    cur = next((m for m in cashflow if m["month"] == period.ym), None)
    prior = [m for m in cashflow if m["month"] in period.prior_3 and m["savings_rate_pct"] is not None]
    if cur and cur["savings_rate_pct"] is not None and prior and not period.is_partial:
        avg = sum(m["savings_rate_pct"] for m in prior) / len(prior)
        if cur["savings_rate_pct"] < avg - 5:
            add("savings-drop", "medium", "Savings rate fell to {0}%".format(int(cur["savings_rate_pct"])),
                "Down from a {0}% average over the prior 3 months.".format(int(avg)),
                (avg - cur["savings_rate_pct"]) / 100.0 * cur["income"], {"inspector": "cashflow", "tab": "overview"}, kind="cashflow")
        elif cur["savings_rate_pct"] >= max(avg + 3, 20):
            add("savings-up", "positive", "Strong month: {0}% saved".format(int(cur["savings_rate_pct"])),
                "Above your {0}% recent average.".format(int(avg)), 0, {"inspector": "cashflow", "tab": "overview"}, kind="cashflow")

    # Credit utilization
    util = networth.get("cc_utilization_pct")
    hot_cards = [c for c in networth["cards"] if c["utilization_pct"] is not None and c["utilization_pct"] > 30]
    for c in hot_cards:
        add("util-{0}".format(c["id"]), "high", "{0} is {1}% utilized".format(c["name"], int(c["utilization_pct"])),
            "Above 30% can hurt your credit score. Paying {0} brings it to 30%.".format(
                _money(c["balance"] - 0.3 * c["credit_limit"])),
            c["balance"] - 0.3 * c["credit_limit"], {"inspector": "cards", "tab": "overview"}, kind="credit")
    if util is not None and util <= 10 and not hot_cards and networth["card_count"]:
        add("util-ok", "positive", "Credit utilization is healthy ({0}%)".format(util),
            "Under 10% across {0} cards.".format(networth["card_count"]), 0, {"inspector": "cards", "tab": "overview"}, kind="credit")

    # Runway (accounting for checking cash, liquid money-market funds, and partner housing share)
    rw = networth.get("runway_months")
    mmf_cash = float(investments.get("cash_like_value") or 0.0)
    avg_sp = float(networth.get("avg_monthly_spend") or 0.0)
    net_avg_sp = max(1.0, avg_sp - exp_partner_default) if (exp_partner_default > 0 and avg_sp > exp_partner_default + 1000.0) else avg_sp
    total_liquid_cash = float(networth.get("cash") or 0.0) + mmf_cash
    total_rw = round(total_liquid_cash / net_avg_sp, 1) if net_avg_sp > 0 else rw
    taxable_total = sum(
        g.get("total", 0.0) for g in networth.get("asset_groups", []) if g.get("id") == "taxable_brokerage"
    )
    if rw is not None:
        if rw < 3 and total_rw is not None and total_rw >= 2.0:
            add("runway-mmf-backed", "positive", "{0} mo cash & MMF runway ({1} checking + {2} MMF)".format(
                total_rw, _money(networth["cash"]), _money(mmf_cash)),
                "Checking keeps a lean {0} operating float while liquid money-market funds hold {1}{2}.".format(
                    _money(networth["cash"]), _money(mmf_cash),
                    " (backed by {0} in taxable brokerage)".format(_money(taxable_total)) if taxable_total > 0 else "",
                ),
                0, {"inspector": "cards", "tab": "overview"}, kind="cashflow")
        elif rw < 3:
            if mmf_cash > 0 and total_rw is not None:
                add("runway-low", "high", "{0} mo liquid runway ({1} checking + {2} MMF)".format(
                    total_rw, _money(networth["cash"]), _money(mmf_cash)),
                    "Checking alone covers {0} mo; aim for 3–6 months of net expenses ({1}–{2}).".format(
                        rw, _money(net_avg_sp * 3), _money(net_avg_sp * 6)),
                    max(0.0, net_avg_sp * 3 - total_liquid_cash), {"inspector": "cards", "tab": "overview"}, kind="cashflow")
            else:
                add("runway-low", "high", "Only {0} months of cash on hand".format(rw),
                    "Aim for 3–6 months of expenses ({0}–{1}).".format(_money(avg_sp * 3), _money(avg_sp * 6)),
                    avg_sp * 3 - networth["cash"], {"inspector": "cards", "tab": "overview"}, kind="cashflow")
        elif rw > 12:
            idle = networth["cash"] - avg_sp * 6
            add("runway-high", "low", "{0} months of cash may be more than you need".format(int(rw)),
                "About {0} above a 6-month emergency fund could be invested.".format(_money(idle)),
                idle * 0.04, {"inspector": "networth", "tab": "investments"}, kind="cashflow")

    # Portfolio
    for h in investments["concentrated_positions"]:
        sym = h.get("symbol") or "Unknown"
        add("conc-" + sym, "medium", "{0} is {1}% of your portfolio".format(sym, int(h["weight_pct"])),
            "Single positions above 25% add concentration risk.", 0, {"inspector": "networth", "tab": "investments"}, kind="investing")
    if investments["cash_like_pct"] > 15 and investments["total_value"] > 0:
        add("cash-drag", "low", "{0}% of investments sit in cash".format(int(investments["cash_like_pct"])),
            "{0} in money-market funds. Intentional?".format(_money(investments["cash_like_value"])),
            investments["cash_like_value"] * 0.03, {"inspector": "networth", "tab": "investments"}, kind="investing")

    out.sort(key=lambda i: (SEVERITY_WEIGHT[i["severity"]], i["impact"]), reverse=True)
    return out
