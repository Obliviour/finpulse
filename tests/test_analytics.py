import time
from backend.db import get_connection, get_db_stamp, bump_db_stamp
from backend.retirement import run_plan, get_default_inputs
from backend.analytics import (
    get_dashboard_summary,
    get_category_detail,
    get_month_detail,
    get_networth_history,
)


def test_demo_dashboard_net_worth_reconciliation():
    """Verify Demo-mode Net Worth equations, ui_profile export, and unvested RSU separation."""
    data = get_dashboard_summary()
    assert data["meta"]["profile_mode"] == "demo"
    assert data["meta"]["is_demo"] is True
    assert data["ui_profile"]["partner_name"] == "Taylor"
    assert data["ui_profile"]["rsu_symbol"] == "APXD"

    nw = data["net_worth"]
    calc_nw = round(
        nw["cash"] + nw["investments"] + nw["home_value"] - nw["credit_card_debt"] - nw["mortgage_debt"],
        2,
    )
    assert nw["total"] == calc_nw
    assert nw["cash"] == 47250.00
    assert nw["investments"] == 337960.00
    assert nw["home_value"] == 545000.00
    assert nw["mortgage_debt"] == 340000.00
    assert nw["total"] == 584313.75
    assert nw["assets"] == round(nw["cash"] + nw["investments"] + nw["home_value"], 2)
    assert nw["liabilities"] == round(nw["credit_card_debt"] + nw["mortgage_debt"], 2)
    assert round(nw["assets"] - nw["liabilities"], 2) == nw["total"]
    assert nw["liquid_net_worth"] == round(nw["cash"] + nw["investments"] - nw["credit_card_debt"], 2)
    assert nw["financial_net_worth_after_mortgage"] == round(nw["liquid_net_worth"] - nw["mortgage_debt"], 2)


def test_demo_housing_partner_offset():
    """Verify partner housing reimbursement offset configuration in Demo Mode."""
    data = get_dashboard_summary()
    ms = data["net_worth"]["mortgage_summary"]
    assert ms["partner_monthly_total"] == 1350.00
    assert ms["monthly_pi"] == 2140.00
    assert ms["monthly_hoa"] == 300.00
    assert ms["net_monthly_housing"] == round(2140.00 + 300.00 - 1350.00, 2)


def test_cashflow_monthly_reconciliation():
    """Verify every month in the 12-month cashflow series reconciles income buckets and housing math."""
    data = get_dashboard_summary()
    cf = data["cashflow"]
    assert len(cf) >= 6

    for m in cf:
        inc_b = m["income_breakdown"]
        bucket_sum = round(
            inc_b["payroll"]
            + inc_b["partner_reimbursement"]
            + inc_b["other_transfers"]
            + inc_b["dividends_interest"]
            + inc_b["other_income"],
            2,
        )
        assert bucket_sum == m["income"]
        assert inc_b["total"] == m["income"]
        assert m["net_savings"] == round(m["income"] - m["spending"], 2)
        assert m["total_outflow_with_principal"] == round(m["spending"] + m["fidelity_extra_principal"], 2)
        assert m["spending_net_partner"] == round(m["ex_housing_spend"] + m["net_housing_spend"], 2)


def test_networth_history_and_category_detail():
    """Verify networth_history additive sub-curve identities and category_detail structure."""
    nh = get_networth_history(months=12)
    assert len(nh["monthly"]) >= 6
    assert "subcurve_summary" in nh
    assert len(nh["subcurve_summary"]["drivers"]) == 4

    for idx, pt in enumerate(nh["monthly"]):
        assert "net_worth" in pt
        if idx > 0:
            assert round(pt["portfolio_redemption_mom"] + pt["debt_paydown_mom"], 2) == 0.0
            liquid_diff = round(pt["cash_diff"] + pt["inv_diff"], 2)
            subcurve_liquid = round(
                pt["income_saved_mom"] + pt["market_growth_mom"] + pt["portfolio_redemption_mom"], 2
            )
            assert liquid_diff == subcurve_liquid
            assert pt["mom_diff_secular"] == round(
                pt["income_saved_mom"] + pt["market_growth_mom"] + pt["home_price_secular_mom"], 2
            )
            assert pt["mom_diff_comps"] == round(
                pt["income_saved_mom"] + pt["market_growth_mom"] + pt["home_price_comps_mom"], 2
            )

    latest_ym = nh["monthly"][-1]["month"]
    det = get_category_detail("Dining & Restaurants", selected_month=latest_ym)
    assert det["category"] == "Dining & Restaurants"
    assert len(det["history"]) >= 1
    assert "transactions" in det
    assert "merchants" in det


def test_zero_uncategorized_transactions_in_demo_db():
    """Ensure 0 transactions in Demo DB fall into Uncategorized."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM transactions WHERE category = 'Uncategorized' OR category IS NULL OR TRIM(category) = ''"
        ).fetchone()
        assert row["cnt"] == 0
    finally:
        conn.close()


def test_dashboard_embedded_month_detail_and_cache_speed():
    """Verify embedded month_detail, category_top_merchants matrix payload, stamp invalidation, and warm cache speed."""
    s0 = get_db_stamp()
    bump_db_stamp()
    assert get_db_stamp() != s0

    summary = get_dashboard_summary("2026-10")
    assert "month_detail" in summary
    assert summary["month_detail"]["month"] == "2026-10"
    assert "transactions" in summary["month_detail"]

    cat_merch = summary["monthly_spending_explorer"]["category_top_merchants"]
    assert "Housing" in cat_merch
    assert "Dining & Restaurants" in cat_merch

    t0 = time.perf_counter()
    summary_warm = get_dashboard_summary("2026-10")
    assert time.perf_counter() - t0 < 0.05
    assert summary_warm["selected_month"] == "2026-10"

    defaults, _ = get_default_inputs()
    bump_db_stamp()
    plan_cold = run_plan(defaults)
    assert len(plan_cold["levers"]) >= 1
    t2 = time.perf_counter()
    plan_warm = run_plan(defaults)
    assert time.perf_counter() - t2 < 0.05
    assert plan_warm["monte_carlo"]["success_pct"] == plan_cold["monte_carlo"]["success_pct"]
