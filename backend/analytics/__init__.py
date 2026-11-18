"""FinPulse analytics engine.

Public entry points:
  get_dashboard_summary(selected_month=None, institution_filter=None, today=None)
  get_category_detail(category, selected_month=None, institution_filter=None, today=None)
"""
import json
from datetime import date, datetime

from backend.db import get_connection, get_db_stamp
from backend.analytics.common import Period, Scope, add_months, ym_of, r2
from backend.analytics.spending import (
    available_months,
    build_cashflow,
    build_monthly_spending_explorer,
    build_spending,
    category_detail,
    category_month_sums,
    merchant_month_sums,
    month_detail,
    monthly_income_and_housing_details,
    monthly_totals,
)
from backend.analytics.recurring import detect_anomalies, detect_duplicates, detect_recurring
from backend.analytics.portfolio import build_investments, build_networth, networth_history, record_snapshot
from backend.analytics.insights import build_insights
from backend.profile_loader import (
    get_household_profile,
    get_mortgage_profile,
    get_partner_offset_config,
    get_portfolio_profile,
    is_private_profile_loaded,
)

_DASHBOARD_CACHE = {}


def _resolve_period(conn, scope, selected_month, today):
    months = available_months(conn, scope)
    if not months:
        months = [ym_of(today)]
    if selected_month not in months:
        selected_month = ym_of(today) if ym_of(today) in months else months[0]
    return Period(selected_month, today), months


def _institutions(conn):
    return [r["institution"] for r in conn.execute("SELECT DISTINCT institution FROM accounts ORDER BY institution")]


def get_dashboard_summary(selected_month=None, institution_filter=None, today=None):
    today = today or date.today()
    cache_key = (
        get_db_stamp(),
        is_private_profile_loaded(),
        selected_month or "",
        institution_filter or "All",
        today.isoformat(),
    )
    cached_dash = _DASHBOARD_CACHE.get(cache_key)
    if cached_dash is not None:
        return json.loads(cached_dash)

    conn = get_connection()
    try:
        try:
            record_snapshot(conn, today)
        except Exception:
            pass
        scope = Scope(conn, institution_filter)
        period, months = _resolve_period(conn, scope, selected_month, today)

        # Query 12-month aggregates ONCE and share across cashflow, explorer, and spending
        months_12 = [add_months(period.ym, -i) for i in range(11, -1, -1)]
        shared_12m = {
            "months_12": months_12,
            "totals_12": monthly_totals(conn, scope, months_12),
            "cat_sums_12": category_month_sums(conn, scope, months_12),
            "merch_sums_12": merchant_month_sums(conn, scope, months_12),
            "ih_12": monthly_income_and_housing_details(conn, scope, months_12),
        }

        recurring = detect_recurring(conn, scope, period.as_of)
        cashflow = build_cashflow(conn, scope, period, 12, _shared=shared_12m)
        monthly_explorer = build_monthly_spending_explorer(conn, scope, period, 12, _shared=shared_12m)
        spending = build_spending(conn, scope, period, recurring, _shared=shared_12m)
        active_month_detail = month_detail(conn, scope, period.ym)
        anomalies = detect_anomalies(conn, scope, period)
        duplicates = detect_duplicates(conn, scope, period)

        last_full = add_months(ym_of(today), -1) if period.ym >= ym_of(today) else period.ym
        full_months = [add_months(last_full, -i) for i in range(3)]
        mt = monthly_totals(conn, scope, full_months)
        spends = [mt[m]["spending"] for m in full_months if mt[m]["spending"] > 0]
        avg_spend = sum(spends) / len(spends) if spends else 0.0

        hh = get_household_profile()
        po = get_partner_offset_config()
        pf = get_portfolio_profile()
        partner_exp = float(po.get("expected_total") or 0.0)
        networth, accounts = build_networth(conn, scope, avg_spend, today)
        investments = build_investments(conn, scope)
        mmf_val = float(investments.get("cash_like_value") or 0.0)
        net_avg_sp = max(1.0, avg_spend - partner_exp) if (partner_exp > 0 and avg_spend > partner_exp + 1000.0) else avg_spend
        networth["mmf_cash"] = r2(mmf_val)
        networth["liquid_cash_with_mmf"] = r2(float(networth.get("cash") or 0.0) + mmf_val)
        networth["net_avg_monthly_spend"] = r2(net_avg_sp)
        networth["runway_with_mmf_months"] = round(networth["liquid_cash_with_mmf"] / net_avg_sp, 1) if net_avg_sp > 0 else None

        insights = build_insights(period, spending, recurring, anomalies, duplicates, networth, investments, cashflow)

        cur = next((m for m in cashflow if m["month"] == period.ym), {"income": 0.0, "spending": 0.0, "net_savings": 0.0, "savings_rate_pct": 0.0})
        active_rec = [r for r in recurring if r["status"] == "active"]
        rec_monthly = sum(r["monthly_equivalent"] for r in active_rec)
        t = spending["totals"]
        kpis = {
            "income": cur["income"],
            "income_mom_diff": cur.get("income_mom_diff", 0.0),
            "income_mom_pct": cur.get("income_mom_pct", 0.0),
            "spending": cur["spending"],
            "ex_housing_spend": t.get("ex_housing_spend", 0.0),
            "housing_spend": t.get("housing_spend", 0.0),
            "net_housing_spend": t.get("net_housing_spend", 0.0),
            "spend_net_partner": t.get("spend_net_partner", cur["spending"]),
            "partner_offset": t.get("partner_offset", 0.0),
            "partner_actual_offset": t.get("partner_actual_offset", 0.0),
            "fidelity_extra_principal": t.get("fidelity_extra_principal", 0.0),
            "ytd_fidelity_extra_principal": t.get("ytd_fidelity_extra_principal", 0.0),
            "total_outflow_with_principal": t.get("total_outflow_with_principal", cur["spending"]),
            "net_savings": cur["net_savings"],
            "net_cashflow_after_principal": cur.get("net_cashflow_after_principal", cur["net_savings"]),
            "savings_rate_pct": cur["savings_rate_pct"],
            "forecast_spending": spending["pace"]["forecast"],
            "spend_compare": t["compare_spend"],
            "spend_prev": t["prev_spend"],
            "spend_avg_3m": t["avg_3m_spend"],
            "spend_mom_diff": t["mom_diff"],
            "spend_mom_pct": t["mom_pct"],
            "spend_vs_avg_diff": t["vs_avg_diff"],
            "spend_vs_avg_pct": t["vs_avg_pct"],
            "fixed": t["fixed"],
            "discretionary": t["discretionary"],
            "recurring_monthly": r2(rec_monthly),
        }

        # Legacy-compatible current_month_kpis and category_trends for older components
        legacy_category_trends = []
        for cat_row in spending["categories"]:
            legacy_category_trends.append({
                "category": cat_row["category"],
                "current_spend": cat_row["spend"],
                "prev_spend": cat_row["prev_spend"],
                "avg_3m_spend": cat_row["avg_3m_spend"],
                "mom_diff": cat_row["mom_diff"],
                "mom_pct": cat_row["mom_pct"] if cat_row["mom_pct"] is not None else 0.0,
                "vs_avg_diff": cat_row["vs_avg_diff"],
                "vs_avg_pct": cat_row["vs_avg_pct"] if cat_row["vs_avg_pct"] is not None else 0.0,
                "tx_count": cat_row["tx_count"],
                "budget": cat_row["budget"],
                "budget_pct": cat_row["budget_pct"] if cat_row["budget_pct"] is not None else 0.0,
                "status": cat_row["status"],
                "top_driver": cat_row["top_driver"]["merchant"] if cat_row.get("top_driver") else "",
                "top_driver_diff": cat_row["top_driver"]["diff"] if cat_row.get("top_driver") else 0.0,
                "history": cat_row["history"],
            })

        legacy_kpis = {
            "income": cur["income"],
            "spending": cur["spending"],
            "net_savings": cur["net_savings"],
            "savings_rate_pct": cur["savings_rate_pct"] if cur["savings_rate_pct"] is not None else 0.0,
            "prev_spending": t["prev_spend"],
            "mom_spending_diff": t["mom_diff"],
            "mom_spending_pct": t["mom_pct"] if t["mom_pct"] is not None else 0.0,
        }

        acct_spend_rows = conn.execute(
            "SELECT account_id, SUM(amount) AS sp FROM transactions "
            "WHERE tx_type='expense' AND substr(tx_date,1,7)=?" + scope.clause("account_id") + " GROUP BY account_id",
            (period.ym,),
        ).fetchall()
        acct_spend_map = {int(r["account_id"]): float(r["sp"] or 0.0) for r in acct_spend_rows}

        legacy_card_metrics = []
        for a in accounts:
            if a["account_type"] == "credit_card":
                bal = float(a["balance"] or 0.0)
                lim = float(a["credit_limit"] or 0.0)
                util = round(bal / lim * 100.0, 1) if lim > 0 else 0.0
                legacy_card_metrics.append({
                    "id": a["id"],
                    "name": a["name"],
                    "institution": a["institution"],
                    "account_type": a["account_type"],
                    "balance": r2(bal),
                    "credit_limit": r2(lim),
                    "utilization_pct": util,
                    "month_spend": r2(acct_spend_map.get(a["id"], 0.0)),
                })

        res = {
            "meta": {
                "period": period.to_dict(),
                "institution": scope.institution or "All",
                "institutions": _institutions(conn),
                "available_months": months,
                "today": today.isoformat(),
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "has_data": bool(accounts),
                "is_demo": bool(accounts) and all(a.get("is_demo") for a in accounts),
                "profile_mode": "private" if is_private_profile_loaded() else "demo",
            },
            "ui_profile": {
                "mode": "private" if is_private_profile_loaded() else "demo",
                "primary_name": hh.get("primary_name", "Alex"),
                "partner_name": hh.get("partner_name", "Partner"),
                "employer_name": hh.get("employer_name", "Employer"),
                "employer_short": hh.get("employer_short", "Employer"),
                "home_address": hh.get("home_address", "Primary Residence"),
                "home_address_short": hh.get("home_address_short", "Primary Residence"),
                "neighborhood": hh.get("neighborhood", ""),
                "rsu_symbol": hh.get("rsu_symbol", "RSU"),
                "rsu_unvested_symbol": hh.get("rsu_unvested_symbol", "RSU-UNVESTED"),
                "rsu_company_label": hh.get("rsu_company_label", "Employer Equity"),
                "wa_state_tax_context": bool(hh.get("wa_state_tax_context", False)),
                "payroll_label": po.get("payroll_label", "Primary Payroll"),
                "partner_income_label": po.get("partner_income_label", "Partner Housing Share"),
                "extra_principal_account_label": po.get("extra_principal_account_label", "Taxable Brokerage"),
                "extra_principal_merchant": po.get("extra_principal_merchant", "Extra Mortgage Principal"),
                "partner_expected_mortgage": float(po.get("expected_mortgage") or 0.0),
                "partner_expected_hoa": float(po.get("expected_hoa") or 0.0),
                "partner_expected_total": float(po.get("expected_total") or 0.0),
                "secular_home_value": float(pf.get("secular_home_value") or 0.0),
                "comps_home_value": float(pf.get("comps_home_value") or 0.0),
                "comps_home_value_by_ym": pf.get("comps_home_value_by_ym") or {},
                "comps_note": pf.get("comps_note", ""),
                "gain_weights": pf.get("gain_weights") or {"equity_awards_pct": 0.2, "retirement_401k_pct": 0.4, "brokerage_hsa_pct": 0.4},
                "subcurve_market_desc": pf.get("subcurve_market_desc", ""),
                "monthly_pi": float(pf.get("monthly_pi") or 0.0),
                "monthly_hoa": float(pf.get("monthly_hoa") or 0.0),
                "spreadsheet_meta": get_mortgage_profile().get("spreadsheet_meta", {}),
            },
            # backwards-compatible fields
            "selected_month": period.ym,
            "prev_month": period.prev_ym,
            "available_months": months,
            "current_month_kpis": legacy_kpis,
            "monthly_cashflow": cashflow,
            "monthly_spending_explorer": monthly_explorer,
            "category_trends": legacy_category_trends,
            "top_merchants": spending["top_merchants"],
            "recurring_subscriptions": recurring,
            "card_metrics": legacy_card_metrics,
            # new rich structure
            "kpis": kpis,
            "net_worth": networth,
            "cashflow": cashflow,
            "spending": spending,
            "month_detail": active_month_detail,
            "recurring": {
                "items": recurring,
                "monthly_total": r2(rec_monthly),
                "annual_total": r2(rec_monthly * 12),
                "active_count": len(active_rec),
            },
            "anomalies": anomalies,
            "duplicates": duplicates,
            "investments": investments,
            "insights": insights,
            "accounts": accounts,
        }
        if len(_DASHBOARD_CACHE) >= 32:
            _DASHBOARD_CACHE.clear()
        payload_json = json.dumps(res)
        _DASHBOARD_CACHE[cache_key] = payload_json
        resolved_key = (
            get_db_stamp(),
            is_private_profile_loaded(),
            period.ym,
            institution_filter or "All",
            today.isoformat(),
        )
        _DASHBOARD_CACHE[resolved_key] = payload_json
        return res
    finally:
        conn.close()


def get_month_detail(ym, institution_filter=None):
    conn = get_connection()
    try:
        scope = Scope(conn, institution_filter)
        return month_detail(conn, scope, ym)
    finally:
        conn.close()


def get_category_detail(category, selected_month=None, institution_filter=None, today=None):
    today = today or date.today()
    conn = get_connection()
    try:
        scope = Scope(conn, institution_filter)
        period, _ = _resolve_period(conn, scope, selected_month, today)
        return category_detail(conn, scope, period, category)
    finally:
        conn.close()


def get_networth_history(months=12):
    conn = get_connection()
    try:
        return networth_history(conn, months)
    finally:
        conn.close()
