from app import app
from backend.mortgage import (
    compute_pmt,
    compute_monthly_tax_benefit,
    run_mortgage_analysis,
)


def test_demo_mortgage_baseline_and_amortization_math():
    """Verify Demo-mode amortization math ($360k @ 4.85% 30-Yr) and PMT identity."""
    res = run_mortgage_analysis()

    rt = res["real_tracker_baseline"]["summary"]
    assert rt["scheduled_monthly_pmt"] == compute_pmt(4.85, 360, 360000.0)
    assert rt["current_balance"] > 300000.0
    assert rt["current_balance"] < 360000.0
    assert rt["total_interest"] > 0.0
    assert rt["interest_saved_vs_orig"] >= 0.0

    rt_prev = res["real_tracker_65"]["summary"]
    assert rt_prev["scheduled_monthly_pmt"] == compute_pmt(5.85, 360, 385000.0)


def test_irs_750k_tax_deduction_cap():
    """Verify the $750k IRS Pub 936 cap properly excludes interest on balances over $750,000."""
    tax_over = compute_monthly_tax_benefit(
        begin_balance=900000.0,
        monthly_interest=4500.0,
        marginal_rate_dec=0.35,
        debt_cap=750000.0,
        include_std_floor=False,
    )
    assert tax_over["unbenefited_balance"] == 150000.0
    assert tax_over["deductible_interest"] < 4500.0
    assert tax_over["non_deductible_interest"] > 0.0
    assert tax_over["true_after_tax_rate_annual_pct"] > tax_over["naive_after_tax_rate_annual_pct"]

    tax_under = compute_monthly_tax_benefit(
        begin_balance=500000.0,
        monthly_interest=2500.0,
        marginal_rate_dec=0.35,
        debt_cap=750000.0,
        include_std_floor=False,
    )
    assert tax_under["unbenefited_balance"] == 0.0
    assert tax_under["non_deductible_interest"] == 0.0


def test_payment_reduction_recast_milestones():
    """Verify recast milestone table structure and positive monthly savings vs scheduled P&I."""
    res = run_mortgage_analysis()
    pmt_red = res["payment_reduction"]
    assert len(pmt_red["tiers"]) >= 2
    for t in pmt_red["tiers"]:
        assert "owner_share_recast_pmt" in t
        assert "owner_share_keep_pmt" in t
        assert "recast_pmt_remaining_term" in t
    curr_tier = next(t for t in pmt_red["tiers"] if t["id"] == "current_bal")
    assert curr_tier["recast_monthly_savings_vs_8171"] >= 0.0


def test_house_vs_market_valuation_modes():
    """Verify house_vs_market_analysis across comps_cooling and secular_inflation valuation modes."""
    res_comps = run_mortgage_analysis({"valuation_mode": "comps_cooling"})
    assert res_comps["equity_progress"]["estimated_home_value"] == 525000.0
    assert "house_vs_market_analysis" in res_comps

    res_sec = run_mortgage_analysis({"valuation_mode": "secular_inflation"})
    assert res_sec["equity_progress"]["estimated_home_value"] == 545000.0
    assert res_sec["equity_progress"]["market_home_equity"] > res_comps["equity_progress"]["market_home_equity"]


def test_mortgage_api_endpoints():
    """Verify /api/mortgage GET, preview, save, and reset endpoints in Demo Mode."""
    client = app.test_client()

    r_get = client.get("/api/mortgage")
    assert r_get.status_code == 200
    data = r_get.get_json()
    assert "active_plan" in data
    assert "real_tracker_65" in data
    assert data["equity_progress"]["home_price"] == 510000.0

    r_prev = client.post(
        "/api/mortgage/preview",
        json={"one_time_lump_sum": 40000, "lump_sum_ym": "2026-11", "future_monthly_excess": 500},
    )
    assert r_prev.status_code == 200
    prev_data = r_prev.get_json()
    assert prev_data["active_plan"]["summary"]["total_interest"] < data["real_tracker_baseline"]["summary"]["total_interest"]

    r_reset = client.post("/api/mortgage/reset")
    assert r_reset.status_code == 200
