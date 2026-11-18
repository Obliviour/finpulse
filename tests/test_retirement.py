from app import app
from backend.retirement import (
    compute_paycheck,
    compute_federal_income_tax,
    compute_ltcg_tax,
    solve_gross_from_net,
    run_plan,
    get_default_inputs,
)


def test_federal_income_tax_single():
    # 2026 brackets: 10% on first $12,400 ($1,240) + 12% on next $38,000 ($4,560) = $5,800
    tax, brackets, marginal = compute_federal_income_tax(50400.0, "single")
    assert round(tax, 2) == 5800.0
    assert len(brackets) == 2
    assert marginal == 0.12


def test_federal_income_tax_mfj_and_ltcg():
    tax_mfj, _, marg_mfj = compute_federal_income_tax(24800.0, "mfj")
    assert round(tax_mfj, 2) == 2480.0
    assert marg_mfj == 0.10

    ltcg_tax = compute_ltcg_tax(20000.0, taxable_ordinary_income=40000.0, filing_status="single")
    assert round(ltcg_tax, 2) == 1582.50


def test_paycheck_fica_and_401k_deduction():
    res = compute_paycheck(100000.0, filing_status="single", state_tax_rate_pct=5.0, pretax_401k_pct=10.0)
    assert res["pretax_401k"] == 10000.0
    assert res["federal_taxable_income"] == 73900.0
    assert res["federal_tax"] == 10970.0
    assert res["social_security_tax"] == 6200.0
    assert res["medicare_tax"] == 1450.0
    assert res["state_tax"] == 3695.0
    assert res["net_pay_annual"] == 100000.0 - 10000.0 - (10970.0 + 3695.0 + 6200.0 + 1450.0)


def test_fica_wage_cap():
    res = compute_paycheck(250000.0, filing_status="single")
    expected_ss = 184500.0 * 0.062
    assert round(res["social_security_tax"], 2) == round(expected_ss, 2)
    assert round(res["medicare_tax"], 2) == 4075.0


def test_employer_match_capped():
    res = compute_paycheck(100000.0, pretax_401k_pct=10.0, employer_match_pct=50.0, employer_match_limit_pct=6.0)
    assert res["employer_match"] == 3000.0


def test_401k_contribution_and_secure2_catchup_limits():
    res_35 = compute_paycheck(300000.0, pretax_401k_pct=20.0, age=35)
    assert res_35["pretax_401k"] == 24500.0

    res_52 = compute_paycheck(300000.0, pretax_401k_pct=20.0, age=52)
    assert res_52["pretax_401k"] == 32500.0

    res_61 = compute_paycheck(300000.0, pretax_401k_pct=20.0, age=61)
    assert res_61["pretax_401k"] == 35750.0


def test_gross_from_net_solver():
    target_net = 67685.0
    gross = solve_gross_from_net(target_net, filing_status="single", state_tax_rate_pct=5.0, pretax_401k_pct=10.0)
    assert abs(gross - 100000.0) <= 2000.0


def test_full_demo_plan_execution_and_rsu_401k_models():
    defaults, _ = get_default_inputs()
    assert defaults["age"] == 34
    assert defaults["state_tax_rate_pct"] == 0.0

    plan = run_plan(defaults, mc_runs=100)
    assert "summary" in plan
    assert "monte_carlo" in plan
    assert "levers" in plan
    assert "k401_model" in plan
    assert "rsu_model" in plan

    assert plan["rsu_model"]["ticker"] == "APXD"
    assert plan["k401_model"]["ending_balance"] > 0.0
    assert len(plan["levers"]) >= 4
    assert plan["summary"]["years_to_retirement"] == (defaults["retirement_age"] - defaults["age"])
    assert plan["monte_carlo"]["success_pct"] >= 0.0
    assert len(plan["projection"]) == (defaults["life_expectancy"] - defaults["age"] + 1)


def test_retirement_api_endpoints():
    client = app.test_client()
    r_get = client.get("/api/retirement")
    assert r_get.status_code == 200
    data = r_get.get_json()
    assert "result" in data
    assert "summary" in data["result"]
    assert "k401_model" in data["result"]
    assert "rsu_model" in data["result"]

    r_prev = client.post("/api/retirement/preview", json={"retirement_age": 50})
    assert r_prev.status_code == 200
    prev_data = r_prev.get_json()
    assert prev_data["inputs"]["retirement_age"] == 50
    assert "summary" in prev_data["result"]
