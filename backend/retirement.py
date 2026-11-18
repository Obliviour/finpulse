"""Retirement and Tax Planning Engine for FinPulse.

Includes:
- IRS 2026 Federal tax brackets (Single and MFJ)
- 2026 FICA rules (Social Security wage cap $184,500, Medicare + Add'l Medicare)
- Contribution limits (401k employee limit $24,500 + catch-up, IRA $7,500 + catch-up, HSA $4,400/$8,750)
- Paycheck calculation: gross -> 401(k) / HSA / taxes -> net take-home pay
- Gross salary solver matching observed bank payroll deposits
- Year-by-year projections with inflation indexing
- IRS Uniform Lifetime Table for RMDs (starting age 75 per SECURE 2.0)
- Monte Carlo simulation with volatility, depletion detection, and percentile bands
- What-if levers and earliest retirement age calculation
"""
import copy
import json
import math
import random
import re
from datetime import datetime
from backend.db import get_connection, get_db_stamp
from backend.connectors import get_setting, set_setting
from backend.profile_loader import get_retirement_profile, is_private_profile_loaded

_PLAN_CACHE = {}

TAX_2026 = {
    "standard_deduction": {
        "single": 16100.0,
        "mfj": 32200.0,
    },
    "federal_brackets": {
        "single": [
            (12400.0, 0.10),
            (50400.0, 0.12),
            (105700.0, 0.22),
            (201775.0, 0.24),
            (256225.0, 0.32),
            (640600.0, 0.35),
            (float("inf"), 0.37),
        ],
        "mfj": [
            (24800.0, 0.10),
            (100800.0, 0.12),
            (211400.0, 0.22),
            (403550.0, 0.24),
            (512450.0, 0.32),
            (768700.0, 0.35),
            (float("inf"), 0.37),
        ],
    },
    "ltcg_brackets": {
        "single": [
            (49450.0, 0.0),
            (545500.0, 0.15),
            (float("inf"), 0.20),
        ],
        "mfj": [
            (98900.0, 0.0),
            (613700.0, 0.15),
            (float("inf"), 0.20),
        ],
    },
    "fica": {
        "ss_rate": 0.062,
        "ss_wage_base": 184500.0,
        "medicare_rate": 0.0145,
        "addl_medicare_rate": 0.009,
        "addl_medicare_threshold": {
            "single": 200000.0,
            "mfj": 250000.0,
        },
    },
    "limits": {
        "k401_employee": 24500.0,
        "k401_catchup_50": 8000.0,
        "k401_catchup_60_63": 11250.0,
        "ira": 7500.0,
        "ira_catchup_50": 1100.0,
        "hsa_self": 4400.0,
        "hsa_family": 8750.0,
        "hsa_catchup_55": 1000.0,
    },
}

# IRS Uniform Lifetime Table (SECURE 2.0 age 75 start)
RMD_TABLE = {
    75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8,
    85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
    90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5,
    95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
    100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6,
    106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5,
    111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9,
    116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
}


def normalize_filing_status(status):
    s = str(status or "single").strip().lower()
    if s in ("mfj", "married", "married filing jointly"):
        return "mfj"
    return "single"


def compute_ltcg_tax(gain_amount, taxable_ordinary_income, filing_status="single", inflation_factor=1.0, _brackets=None):
    if gain_amount <= 0:
        return 0.0
    if _brackets is None:
        filing = filing_status if filing_status in ("single", "mfj") else normalize_filing_status(filing_status)
        _brackets = TAX_2026["ltcg_brackets"].get(filing, TAX_2026["ltcg_brackets"]["single"])
    tot_start = taxable_ordinary_income
    tot_end = taxable_ordinary_income + gain_amount
    tax = 0.0
    prev_thresh = 0.0
    for thresh, rate in _brackets:
        adj_thresh = thresh * inflation_factor if thresh != float("inf") else float("inf")
        hi = adj_thresh if tot_end > adj_thresh else tot_end
        lo = prev_thresh if tot_start < prev_thresh else tot_start
        if hi > lo:
            tax += (hi - lo) * rate
        prev_thresh = adj_thresh
        if tot_end <= adj_thresh:
            break
    return tax


def compute_federal_income_tax(taxable_income, filing_status="single", inflation_factor=1.0, include_breakdown=True, _brackets=None):
    if taxable_income <= 0:
        return 0.0, [], 0.0
    if _brackets is None:
        filing = filing_status if filing_status in ("single", "mfj") else normalize_filing_status(filing_status)
        _brackets = TAX_2026["federal_brackets"].get(filing, TAX_2026["federal_brackets"]["single"])
    tax = 0.0
    prev_threshold = 0.0
    bracket_breakdown = [] if include_breakdown else None
    marginal_rate = 0.10

    for threshold, rate in _brackets:
        adj_thresh = threshold * inflation_factor if threshold != float("inf") else float("inf")
        if taxable_income > prev_threshold:
            diff_inc = taxable_income - prev_threshold
            span = adj_thresh - prev_threshold
            taxable_in_bracket = diff_inc if diff_inc < span else span
            bracket_tax = taxable_in_bracket * rate
            tax += bracket_tax
            marginal_rate = rate
            if include_breakdown:
                bracket_breakdown.append({
                    "rate_pct": round(rate * 100.0, 1),
                    "from": round(prev_threshold, 2),
                    "to": round(adj_thresh, 2) if adj_thresh != float("inf") else None,
                    "taxed_amount": round(taxable_in_bracket, 2),
                    "tax": round(bracket_tax, 2),
                })
            if taxable_income <= adj_thresh:
                break
            prev_threshold = adj_thresh
        else:
            break

    return tax, bracket_breakdown if include_breakdown else [], marginal_rate


def compute_paycheck(gross_salary, bonus=0.0, filing_status="single", state_tax_rate_pct=5.0,
                     pretax_401k_pct=10.0, roth_401k_pct=0.0, employer_match_pct=50.0,
                     employer_match_limit_pct=6.0, ira_contribution=0.0, ira_type="roth",
                     hsa_contribution=0.0, hsa_coverage="self", age=35):
    filing = normalize_filing_status(filing_status)
    total_wages = float(gross_salary or 0.0) + float(bonus or 0.0)
    std_ded = TAX_2026["standard_deduction"].get(filing, TAX_2026["standard_deduction"]["single"])

    if total_wages <= 0:
        return {
            "gross": 0.0,
            "pretax_401k": 0.0,
            "roth_401k": 0.0,
            "traditional_ira": 0.0,
            "hsa": 0.0,
            "standard_deduction": round(std_ded, 2),
            "federal_taxable_income": 0.0,
            "federal_tax": 0.0,
            "state_tax": 0.0,
            "social_security_tax": 0.0,
            "medicare_tax": 0.0,
            "total_tax": 0.0,
            "net_pay_annual": 0.0,
            "net_pay_monthly": 0.0,
            "effective_tax_rate_pct": 0.0,
            "marginal_federal_pct": 0.0,
            "marginal_combined_pct": 0.0,
            "employer_match": 0.0,
            "total_retirement_savings": 0.0,
            "savings_rate_pct": 0.0,
            "brackets": [],
            "waterfall": [
                {"label": "Gross Income", "amount": 0.0, "type": "total"},
                {"label": "Net Take-Home Pay", "amount": 0.0, "type": "total"},
            ],
        }

    # 401(k) limits
    limit_401k = TAX_2026["limits"]["k401_employee"]
    if 60 <= age <= 63:
        limit_401k += TAX_2026["limits"]["k401_catchup_60_63"]
    elif age >= 50:
        limit_401k += TAX_2026["limits"]["k401_catchup_50"]

    requested_pretax = total_wages * (float(pretax_401k_pct) / 100.0)
    requested_roth = total_wages * (float(roth_401k_pct) / 100.0)

    # Scale down if employee total exceeds limit
    tot_req_401k = requested_pretax + requested_roth
    if tot_req_401k > limit_401k and tot_req_401k > 0:
        scale = limit_401k / tot_req_401k
        pretax_401k = requested_pretax * scale
        roth_401k = requested_roth * scale
    else:
        pretax_401k = requested_pretax
        roth_401k = requested_roth

    # Employer match: applies to combined employee 401k contribution up to match_limit_pct
    actual_employee_pct = ((pretax_401k + roth_401k) / total_wages * 100.0) if total_wages > 0 else 0.0
    matched_pct = min(actual_employee_pct, float(employer_match_limit_pct))
    employer_match = total_wages * (matched_pct / 100.0) * (float(employer_match_pct) / 100.0)

    # HSA deduction (pre-tax)
    is_family = str(hsa_coverage or "self").strip().lower() == "family"
    base_hsa = TAX_2026["limits"]["hsa_family"] if is_family else TAX_2026["limits"]["hsa_self"]
    hsa_catchup = TAX_2026["limits"]["hsa_catchup_55"] if age >= 55 else 0.0
    hsa_limit = base_hsa + hsa_catchup
    actual_hsa = min(max(0.0, float(hsa_contribution or 0.0)), hsa_limit)

    # IRA contributions (capped at annual limit + catch-up)
    ira_type_norm = str(ira_type or "roth").strip().lower()
    ira_limit = TAX_2026["limits"]["ira"] + (TAX_2026["limits"]["ira_catchup_50"] if age >= 50 else 0.0)
    actual_ira = min(max(0.0, float(ira_contribution or 0.0)), ira_limit)
    trad_ira_deduction = actual_ira if ira_type_norm == "traditional" else 0.0
    actual_roth_ira = actual_ira if ira_type_norm == "roth" else 0.0

    # Federal taxable income (pretax 401k and HSA reduce AGI before standard deduction)
    agi = max(0.0, total_wages - pretax_401k - actual_hsa - trad_ira_deduction)
    federal_taxable = max(0.0, agi - std_ded)

    fed_tax, brackets_touched, fed_marginal = compute_federal_income_tax(federal_taxable, filing)

    # State Tax
    state_tax = federal_taxable * (float(state_tax_rate_pct) / 100.0)

    # FICA (FICA applies to gross wages minus HSA, but 401(k) does NOT reduce FICA!)
    fica_wages = max(0.0, total_wages - actual_hsa)
    ss_tax = min(fica_wages, TAX_2026["fica"]["ss_wage_base"]) * TAX_2026["fica"]["ss_rate"]
    medicare_tax = fica_wages * TAX_2026["fica"]["medicare_rate"]
    addl_thresh = TAX_2026["fica"]["addl_medicare_threshold"].get(filing, 200000.0)
    if fica_wages > addl_thresh:
        medicare_tax += (fica_wages - addl_thresh) * TAX_2026["fica"]["addl_medicare_rate"]

    total_taxes = fed_tax + state_tax + ss_tax + medicare_tax
    net_pay_annual = total_wages - pretax_401k - roth_401k - actual_hsa - total_taxes
    net_pay_monthly = net_pay_annual / 12.0

    effective_tax_rate = (total_taxes / total_wages * 100.0) if total_wages > 0 else 0.0
    ss_marginal = TAX_2026["fica"]["ss_rate"] if fica_wages < TAX_2026["fica"]["ss_wage_base"] else 0.0
    med_marginal = TAX_2026["fica"]["medicare_rate"] + (TAX_2026["fica"]["addl_medicare_rate"] if fica_wages >= addl_thresh else 0.0)
    marginal_combined = fed_marginal + (float(state_tax_rate_pct) / 100.0) + ss_marginal + med_marginal

    # Waterfall chart data
    waterfall = [
        {"label": "Gross Income", "amount": round(total_wages, 2), "type": "total"},
        {"label": "Pre-Tax 401(k)", "amount": -round(pretax_401k, 2), "type": "deduction"},
        {"label": "HSA Contribution", "amount": -round(actual_hsa, 2), "type": "deduction"},
        {"label": "Federal Income Tax", "amount": -round(fed_tax, 2), "type": "tax"},
        {"label": "State Income Tax", "amount": -round(state_tax, 2), "type": "tax"},
        {"label": "Social Security", "amount": -round(ss_tax, 2), "type": "tax"},
        {"label": "Medicare", "amount": -round(medicare_tax, 2), "type": "tax"},
    ]
    if roth_401k > 0:
        waterfall.append({"label": "Roth 401(k)", "amount": -round(roth_401k, 2), "type": "deduction"})
    waterfall.append({"label": "Net Take-Home Pay", "amount": round(net_pay_annual, 2), "type": "total"})

    total_retirement_savings = pretax_401k + roth_401k + employer_match + actual_ira + actual_hsa

    return {
        "gross": round(total_wages, 2),
        "pretax_401k": round(pretax_401k, 2),
        "roth_401k": round(roth_401k, 2),
        "traditional_ira": round(trad_ira_deduction, 2),
        "roth_ira": round(actual_roth_ira, 2),
        "hsa": round(actual_hsa, 2),
        "standard_deduction": round(std_ded, 2),
        "federal_taxable_income": round(federal_taxable, 2),
        "federal_tax": round(fed_tax, 2),
        "state_tax": round(state_tax, 2),
        "social_security_tax": round(ss_tax, 2),
        "medicare_tax": round(medicare_tax, 2),
        "total_tax": round(total_taxes, 2),
        "net_pay_annual": round(net_pay_annual, 2),
        "net_pay_monthly": round(net_pay_monthly, 2),
        "effective_tax_rate_pct": round(effective_tax_rate, 2),
        "marginal_federal_pct": round(fed_marginal * 100.0, 1),
        "marginal_combined_pct": round(marginal_combined * 100.0, 1),
        "employer_match": round(employer_match, 2),
        "total_retirement_savings": round(total_retirement_savings, 2),
        "savings_rate_pct": round(total_retirement_savings / total_wages * 100.0, 1) if total_wages > 0 else 0.0,
        "brackets": brackets_touched,
        "waterfall": waterfall,
    }


def solve_gross_from_net(target_net_annual, filing_status="single", state_tax_rate_pct=5.0, pretax_401k_pct=10.0):
    """Bisection solver to determine gross salary given target annual net take-home."""
    if not target_net_annual or target_net_annual <= 0:
        return 100000.0
    low = target_net_annual
    high = target_net_annual * 2.5
    for _ in range(35):
        mid = (low + high) / 2.0
        res = compute_paycheck(mid, filing_status=filing_status, state_tax_rate_pct=state_tax_rate_pct, pretax_401k_pct=pretax_401k_pct)
        net = res.get("net_pay_annual", 0.0)
        if abs(net - target_net_annual) < 25.0:
            break
        if net < target_net_annual:
            low = mid
        else:
            high = mid
    return round(mid / 1000.0) * 1000.0


def get_default_inputs(conn=None):
    close_conn = False
    if conn is None:
        conn = get_connection()
        close_conn = True

    try:
        # 1. Balances from accounts
        accounts = [dict(r) for r in conn.execute("SELECT * FROM accounts")]
        pretax = 0.0
        roth = 0.0
        taxable = 0.0
        cash = 0.0

        rp = get_retirement_profile()
        k401_kws = [str(k).lower() for k in (rp.get("k401_split_keywords") or ["401(k)"])]
        pretax_ratio = float(rp.get("k401_pretax_balance_ratio", 0.85))
        roth_ratio = float(rp.get("k401_roth_balance_ratio", 0.15))

        for a in accounts:
            bal = float(a.get("balance", 0.0))
            atype = a.get("account_type", "")
            name = (a.get("name", "") + " " + a.get("institution", "")).lower()

            if atype in ("checking", "savings"):
                cash += bal
            elif atype == "investment":
                if any(kw in name for kw in k401_kws) and ("401" in name or "plan" in name):
                    pretax += bal * pretax_ratio
                    roth += bal * roth_ratio
                elif "roth" in name or "hsa" in name or "healthequity" in name:
                    roth += bal
                elif re.search(r"ira|401|403|tsp|pension", name):
                    pretax += bal
                else:
                    taxable += bal

        # Separate unvested RSUs from already-vested taxable investments (only if account balance includes them)
        unvested_row = conn.execute(
            "SELECT COALESCE(SUM(current_value), 0) as unv FROM holdings WHERE UPPER(symbol) LIKE '%-RSU' OR UPPER(name) LIKE '%UNVESTED%'"
        ).fetchone()
        unvested_rsu = float(unvested_row["unv"] or 0.0) if unvested_row else 0.0
        if unvested_rsu > 0:
            rsu_acct_rows = conn.execute(
                """SELECT a.balance,
                          COALESCE((SELECT SUM(h2.current_value) FROM holdings h2
                                    WHERE h2.account_id = a.id
                                      AND UPPER(h2.symbol) NOT LIKE '%-RSU'
                                      AND UPPER(h2.name) NOT LIKE '%UNVESTED%'), 0) AS vested_sum
                   FROM accounts a
                   WHERE a.id IN (
                       SELECT DISTINCT account_id FROM holdings
                       WHERE UPPER(symbol) LIKE '%-RSU' OR UPPER(name) LIKE '%UNVESTED%'
                   )"""
            ).fetchall()
            double_counted = sum(
                max(0.0, float(r["balance"] or 0.0) - float(r["vested_sum"] or 0.0))
                for r in rsu_acct_rows
            )
            if double_counted > unvested_rsu * 0.5 and taxable >= unvested_rsu:
                taxable = round(taxable - unvested_rsu, 2)

        # 2. Observed net income from payroll deposits
        payroll_rows = conn.execute(
            """
            SELECT substr(tx_date, 1, 7) as ym, SUM(ABS(amount)) as total
            FROM transactions
            WHERE tx_type = 'income' AND (UPPER(merchant) LIKE '%PAYROLL%' OR UPPER(description) LIKE '%PAYROLL%' OR UPPER(description) LIKE '%DIRECT DEP%')
            GROUP BY ym
            """
        ).fetchall()

        observed_net_annual = 0.0
        months_seen = len(payroll_rows)
        if months_seen > 0:
            avg_monthly_net = sum(float(r["total"]) for r in payroll_rows) / float(months_seen)
            observed_net_annual = round(avg_monthly_net * 12.0, 2)

        # 3. Trailing annual recurring spending (exclude Mortgage P&I which is paid off before retirement & one-time >$7k spikes)
        spend_rows = conn.execute(
            """
            SELECT substr(tx_date, 1, 7) as ym, SUM(amount) as total
            FROM transactions
            WHERE tx_type = 'expense'
              AND merchant NOT LIKE '%Mortgage%'
              AND amount < 7000
            GROUP BY ym
            """
        ).fetchall()

        trailing_spending = 96000.0
        if spend_rows:
            avg_m_spend = sum(float(r["total"]) for r in spend_rows) / float(len(spend_rows))
            trailing_spending = round(avg_m_spend * 12.0, 2)

        state_tax = float(rp.get("default_state_tax_rate_pct", 0.0))
        estimated_gross = 120000.0
        gross_estimated = False
        if observed_net_annual > 0:
            estimated_gross = solve_gross_from_net(observed_net_annual, state_tax_rate_pct=state_tax)
            gross_estimated = True

        default_annual_rsu_grant = float(rp.get("default_annual_rsu_grant", 25000.0)) if unvested_rsu > 0 else 0.0

        defaults = {
            "age": int(rp.get("default_age", 34)),
            "retirement_age": int(rp.get("default_retirement_age", 55)),
            "life_expectancy": int(rp.get("default_life_expectancy", 90)),
            "filing_status": str(rp.get("default_filing_status", "single")),
            "state_tax_rate_pct": state_tax,
            "gross_salary": estimated_gross,
            "bonus": 0.0,
            "annual_rsu_grant": default_annual_rsu_grant,
            "unvested_rsu_balance": round(unvested_rsu, 2),
            "rsu_tax_withholding_pct": 39.2,
            "salary_growth_pct": 3.0,
            "pretax_401k_pct": 10.0,
            "roth_401k_pct": 0.0,
            "employer_match_pct": 50.0,
            "employer_match_limit_pct": float(rp.get("default_employer_match_limit_pct", 6.0)),
            "aftertax_401k_annual": float(rp.get("default_aftertax_401k_annual", 6000.0)),
            "ira_contribution": 7000.0,
            "ira_type": "roth",
            "hsa_contribution": 4400.0,
            "hsa_coverage": "self",
            "taxable_savings_monthly": float(rp.get("default_taxable_savings_monthly", 1500.0)),
            "balances": {
                "pretax": round(pretax, 2),
                "roth": round(roth, 2),
                "taxable": round(taxable, 2),
                "cash": round(cash, 2),
            },
            "taxable_cost_basis_pct": 65.0,
            "return_pre_pct": 7.0,
            "return_post_pct": 5.0,
            "volatility_pct": 15.0,
            "inflation_pct": 2.5,
            "retirement_spending": round(trailing_spending, 2),
            "social_security_monthly": 2800.0,
            "ss_start_age": 67,
            "cash_return_pct": 3.0,
        }

        derived_info = {
            "observed_net_annual": observed_net_annual,
            "gross_salary_estimated": gross_estimated,
            "spending_months_used": len(spend_rows),
            "annual_expenses_observed": trailing_spending,
            "unvested_rsu_balance": round(unvested_rsu, 2),
            "annual_rsu_grant_default": default_annual_rsu_grant,
        }

        return defaults, derived_info
    finally:
        if close_conn:
            conn.close()


def _precompute_work_schedule(inputs, max_years=None):
    """Precompute working-year cashflows once per parameter set so Monte Carlo runs avoid repeating compute_paycheck()."""
    age = int(inputs["age"])
    life_exp = int(inputs["life_expectancy"])
    years = max_years if max_years is not None else max(1, life_exp - age + 1)

    salary = float(inputs["gross_salary"])
    sal_growth = float(inputs["salary_growth_pct"]) / 100.0
    annual_rsu_grant = max(0.0, float(inputs.get("annual_rsu_grant", 0.0)))
    filing = normalize_filing_status(inputs.get("filing_status", "single"))
    state_tax_pct = inputs.get("state_tax_rate_pct", 5.0)
    pretax_401k_pct = float(inputs["pretax_401k_pct"])
    roth_401k_pct = float(inputs["roth_401k_pct"])
    employer_match_pct = float(inputs["employer_match_pct"])
    employer_match_limit_pct = float(inputs["employer_match_limit_pct"])
    ira_contribution = float(inputs["ira_contribution"])
    ira_type = str(inputs.get("ira_type", "roth")).strip().lower()
    hsa_contribution = float(inputs["hsa_contribution"])
    hsa_cov = str(inputs.get("hsa_coverage", "self")).strip().lower()
    aftertax_roth = max(0.0, float(inputs.get("aftertax_401k_annual", 0.0)))
    taxable_monthly = float(inputs["taxable_savings_monthly"])

    sched = []
    for t in range(years):
        curr_age = age + t
        growth_factor = (1.0 + sal_growth) ** t
        curr_sal = salary * growth_factor
        pc = compute_paycheck(
            curr_sal,
            bonus=0.0,
            filing_status=filing,
            state_tax_rate_pct=state_tax_pct,
            pretax_401k_pct=pretax_401k_pct,
            roth_401k_pct=roth_401k_pct,
            employer_match_pct=employer_match_pct,
            employer_match_limit_pct=employer_match_limit_pct,
            ira_contribution=ira_contribution,
            ira_type=ira_type,
            hsa_contribution=hsa_contribution,
            hsa_coverage=hsa_cov,
            age=curr_age,
        )
        c_pre = pc["pretax_401k"] + pc["hsa"] + (pc["traditional_ira"] if ira_type == "traditional" else 0.0)
        c_roth = pc["roth_401k"] + aftertax_roth + (ira_contribution if ira_type == "roth" else 0.0)
        c_taxable = taxable_monthly * 12.0 * growth_factor
        match_amt = pc["employer_match"]
        new_rsu_grant = annual_rsu_grant * growth_factor
        sched.append((curr_sal, c_pre, c_roth, c_taxable, match_amt, new_rsu_grant))
    return sched


def simulate_single_path(inputs, current_year=2026, seed=None, _work_sched=None, collect_projection=True):
    """Run a single projection (deterministic if seed is None, stochastic if random seed provided)."""
    rng = random.Random(seed) if seed is not None else None

    age = int(inputs["age"])
    ret_age = int(inputs["retirement_age"])
    life_exp = int(inputs["life_expectancy"])
    years = max(1, life_exp - age + 1)

    pretax = float(inputs["balances"]["pretax"])
    roth = float(inputs["balances"]["roth"])
    taxable = float(inputs["balances"]["taxable"])
    cash = float(inputs["balances"]["cash"])
    cost_basis_ratio = float(inputs.get("taxable_cost_basis_pct", 65.0)) / 100.0
    taxable_basis = taxable * cost_basis_ratio

    unvested_rsu = max(0.0, float(inputs.get("unvested_rsu_balance", 0.0)))
    annual_rsu_grant = max(0.0, float(inputs.get("annual_rsu_grant", 0.0)))
    rsu_tax_rate = min(0.60, max(0.0, float(inputs.get("rsu_tax_withholding_pct", 39.2)) / 100.0))

    salary = float(inputs["gross_salary"])
    sal_growth = float(inputs["salary_growth_pct"]) / 100.0
    inflation = max(-0.50, float(inputs["inflation_pct"]) / 100.0)
    r_pre = float(inputs["return_pre_pct"]) / 100.0
    r_post = float(inputs["return_post_pct"]) / 100.0
    vol = float(inputs["volatility_pct"]) / 100.0
    cash_r = float(inputs["cash_return_pct"]) / 100.0

    ret_spend_base = float(inputs["retirement_spending"])
    ss_monthly_base = float(inputs["social_security_monthly"])
    ss_start = int(inputs["ss_start_age"])
    filing = normalize_filing_status(inputs.get("filing_status", "single"))
    state_tax_rate = float(inputs.get("state_tax_rate_pct", 5.0)) / 100.0
    std_ded_base = TAX_2026["standard_deduction"].get(filing, 16100.0)
    fed_brackets = TAX_2026["federal_brackets"].get(filing, TAX_2026["federal_brackets"]["single"])
    ltcg_brackets = TAX_2026["ltcg_brackets"].get(filing, TAX_2026["ltcg_brackets"]["single"])

    projection = []
    depleted = False
    depletion_age = None

    for t in range(years):
        curr_age = age + t
        year = current_year + t
        inf_factor = (1.0 + inflation) ** t

        is_retired = (curr_age >= ret_age)
        phase = "retire" if is_retired else "work"

        # Annual market return draw
        if rng is None:
            mkt_return = r_post if is_retired else r_pre
        else:
            mean = r_post if is_retired else r_pre
            mkt_return = rng.gauss(mean, vol)

        contributions = 0.0
        match_amt = 0.0
        rsu_vest_gross = 0.0
        rsu_vest_net = 0.0
        spend_need = 0.0
        ss_income = 0.0
        gross_withdrawn = 0.0
        withdrawn_taxes = 0.0
        rmd_amount = 0.0

        if not is_retired:
            # Working phase
            if _work_sched is not None and t < len(_work_sched):
                curr_sal, c_pre, c_roth, c_taxable, match_amt, new_rsu_grant = _work_sched[t]
            else:
                curr_sal = salary * ((1.0 + sal_growth) ** t)
                # Paycheck & savings
                ira_type = str(inputs.get("ira_type", "roth")).strip().lower()
                hsa_cov = str(inputs.get("hsa_coverage", "self")).strip().lower()
                pc = compute_paycheck(
                    curr_sal,
                    bonus=0.0,
                    filing_status=filing,
                    state_tax_rate_pct=inputs.get("state_tax_rate_pct", 5.0),
                    pretax_401k_pct=float(inputs["pretax_401k_pct"]),
                    roth_401k_pct=float(inputs["roth_401k_pct"]),
                    employer_match_pct=float(inputs["employer_match_pct"]),
                    employer_match_limit_pct=float(inputs["employer_match_limit_pct"]),
                    ira_contribution=float(inputs["ira_contribution"]),
                    ira_type=ira_type,
                    hsa_contribution=float(inputs["hsa_contribution"]),
                    hsa_coverage=hsa_cov,
                    age=curr_age,
                )

                aftertax_roth = max(0.0, float(inputs.get("aftertax_401k_annual", 0.0)))
                c_pre = pc["pretax_401k"] + pc["hsa"] + (pc["traditional_ira"] if ira_type == "traditional" else 0.0)
                c_roth = pc["roth_401k"] + aftertax_roth + (float(inputs["ira_contribution"]) if ira_type == "roth" else 0.0)
                c_taxable = float(inputs["taxable_savings_monthly"]) * 12.0 * ((1.0 + sal_growth) ** t)
                match_amt = pc["employer_match"]
                new_rsu_grant = annual_rsu_grant * ((1.0 + sal_growth) ** t)

            # RSU pipeline: unvested pool appreciates with stock return, receives annual refresher grant,
            # and ~55% of the pool vests during the year (front-loaded + stacked 4-yr grants)
            unvested_rsu = max(0.0, unvested_rsu * (1.0 + mkt_return)) + new_rsu_grant
            rsu_vest_gross = unvested_rsu * 0.55
            unvested_rsu = max(0.0, unvested_rsu - rsu_vest_gross)
            rsu_vest_net = rsu_vest_gross * (1.0 - rsu_tax_rate)

            contributions = c_pre + c_roth + c_taxable + rsu_vest_net

            # Apply market returns
            pretax = pretax * (1.0 + mkt_return) + c_pre + match_amt
            roth = roth * (1.0 + mkt_return) + c_roth
            taxable = taxable * (1.0 + mkt_return) + c_taxable + rsu_vest_net
            taxable_basis += c_taxable + rsu_vest_net
            cash = cash * (1.0 + cash_r)

        else:
            # Retirement phase (remaining unvested RSUs are forfeited upon leaving employment)
            unvested_rsu = 0.0
            curr_sal = 0.0
            spend_need = ret_spend_base * inf_factor

            if curr_age >= ss_start:
                ss_income = ss_monthly_base * 12.0 * inf_factor

            # Required Minimum Distribution (RMD) starting at age 75
            if curr_age >= 75 and pretax > 0:
                div = RMD_TABLE.get(curr_age, 2.0)
                rmd_amount = pretax / div

            net_need = max(0.0, spend_need - ss_income)

            # Withdrawal logic across buckets:
            # 1. Cash (if cash exceeds 6 months of spending)
            cash_min = (spend_need / 2.0)
            w_cash = 0.0
            if cash > cash_min and net_need > 0:
                w_cash = min(net_need, cash - cash_min)
                cash -= w_cash
                net_need -= w_cash

            # 2. Taxable Brokerage
            w_taxable = 0.0
            tax_on_taxable = 0.0
            if taxable > 0 and net_need > 0:
                w_taxable = min(taxable, net_need)
                gain_frac = max(0.0, 1.0 - (taxable_basis / taxable)) if taxable > 0 else 0.0
                gain = w_taxable * gain_frac
                tax_on_taxable = compute_ltcg_tax(gain, 0.0, filing, inf_factor, _brackets=ltcg_brackets) + (gain * state_tax_rate)
                taxable -= w_taxable
                taxable_basis = max(0.0, taxable_basis - (w_taxable * (1.0 - gain_frac)))
                net_taxable_recvd = max(0.0, w_taxable - tax_on_taxable)
                net_need = max(0.0, net_need - net_taxable_recvd)

            # 3. Pre-tax (Trad 401k / IRA)
            w_pretax = 0.0
            tax_on_pretax = 0.0
            target_pretax_draw = max(rmd_amount, net_need)
            if pretax > 0 and (target_pretax_draw > 0):
                w_pretax = min(pretax, target_pretax_draw)
                pretax -= w_pretax
                # Tax on pretax: taxed as ordinary income
                std_d = std_ded_base * inf_factor
                taxable_ord = max(0.0, w_pretax + (0.85 * ss_income) - std_d)
                fed_t, _, _ = compute_federal_income_tax(taxable_ord, filing, inf_factor, include_breakdown=False, _brackets=fed_brackets)
                tax_on_pretax = fed_t + (taxable_ord * state_tax_rate)
                net_pretax = max(0.0, w_pretax - tax_on_pretax)
                if net_pretax >= net_need:
                    excess = net_pretax - net_need
                    taxable += excess
                    taxable_basis += excess
                    net_need = 0.0
                else:
                    net_need -= net_pretax

            # 4. Roth (tax-free)
            w_roth = 0.0
            if roth > 0 and net_need > 0:
                w_roth = min(roth, net_need)
                roth -= w_roth
                net_need -= w_roth

            # 5. Last resort cash buffer tap
            if cash > 0 and net_need > 0:
                w_cash_extra = min(cash, net_need)
                cash -= w_cash_extra
                w_cash += w_cash_extra
                net_need -= w_cash_extra

            gross_withdrawn = w_cash + w_taxable + w_pretax + w_roth
            withdrawn_taxes = tax_on_taxable + tax_on_pretax

            # Apply market return to remaining balances
            pretax = max(0.0, pretax * (1.0 + mkt_return))
            roth = max(0.0, roth * (1.0 + mkt_return))
            taxable = max(0.0, taxable * (1.0 + mkt_return))
            cash = max(0.0, cash * (1.0 + cash_r))

            if net_need > 1.0:
                if not depleted:
                    depleted = True
                    depletion_age = curr_age

        tot_nom = max(0.0, pretax + roth + taxable + cash)
        tot_real = tot_nom / inf_factor

        if collect_projection is True:
            projection.append({
                "age": curr_age,
                "year": year,
                "phase": phase,
                "salary": round(curr_sal, 2),
                "rsu_vest_gross": round(rsu_vest_gross, 2),
                "rsu_vest_net": round(rsu_vest_net, 2),
                "unvested_rsu": round(unvested_rsu, 2),
                "contributions": round(contributions, 2),
                "employer_match": round(match_amt, 2),
                "balance_pretax": round(pretax, 2),
                "balance_roth": round(roth, 2),
                "balance_taxable": round(taxable, 2),
                "balance_cash": round(cash, 2),
                "total": round(tot_nom, 2),
                "total_real": round(tot_real, 2),
                "spending_need": round(spend_need, 2),
                "social_security": round(ss_income, 2),
                "withdrawal_gross": round(gross_withdrawn, 2),
                "withdrawal_taxes": round(withdrawn_taxes, 2),
                "rmd": round(rmd_amount, 2),
            })
        elif collect_projection == "real_only":
            projection.append(tot_real)

    return projection, depleted, depletion_age


def run_plan(inputs, observed_net_annual=None, mc_runs=600, seed=42):
    """Complete calculation running paycheck, deterministic projection, Monte Carlo, levers, and earliest age."""
    rp = get_retirement_profile()
    rsu_static = rp.get("rsu_model_static") or {}
    rsu_ticker = rsu_static.get("ticker") or "RSU"
    cache_key = (
        get_db_stamp(),
        is_private_profile_loaded(),
        json.dumps(inputs, sort_keys=True, default=str),
        round(float(observed_net_annual or 0.0), 2),
        int(mc_runs),
        seed,
    )
    cached_plan = _PLAN_CACHE.get(cache_key)
    if cached_plan is not None:
        return copy.deepcopy(cached_plan)

    work_sched = _precompute_work_schedule(inputs)

    # 1. Paycheck breakdown
    pc = compute_paycheck(
        float(inputs["gross_salary"]),
        bonus=float(inputs.get("bonus", 0.0)),
        filing_status=inputs.get("filing_status", "single"),
        state_tax_rate_pct=float(inputs.get("state_tax_rate_pct", 5.0)),
        pretax_401k_pct=float(inputs["pretax_401k_pct"]),
        roth_401k_pct=float(inputs["roth_401k_pct"]),
        employer_match_pct=float(inputs["employer_match_pct"]),
        employer_match_limit_pct=float(inputs["employer_match_limit_pct"]),
        ira_contribution=float(inputs["ira_contribution"]),
        ira_type=inputs["ira_type"],
        hsa_contribution=float(inputs["hsa_contribution"]),
        hsa_coverage=inputs.get("hsa_coverage", "self"),
        age=int(inputs["age"]),
    )

    if observed_net_annual:
        pc["observed_net_annual"] = round(observed_net_annual, 2)
        pc["net_vs_observed_diff"] = round(pc["net_pay_annual"] - observed_net_annual, 2)

    # 2. Deterministic baseline projection
    det_proj, det_depleted, det_depletion_age = simulate_single_path(inputs, seed=None, _work_sched=work_sched)

    # Enrich paycheck waterfall with Year-1 RSU Vesting & Sell-to-Cover Withholding
    yr1_rsu_gross = det_proj[0]["rsu_vest_gross"] if det_proj else 0.0
    yr1_rsu_net = det_proj[0]["rsu_vest_net"] if det_proj else 0.0
    yr1_rsu_tax = max(0.0, yr1_rsu_gross - yr1_rsu_net)
    pc["rsu_vest_gross"] = round(yr1_rsu_gross, 2)
    pc["rsu_vest_net"] = round(yr1_rsu_net, 2)
    pc["rsu_tax_withheld"] = round(yr1_rsu_tax, 2)
    pc["total_comp_gross"] = round(pc["gross"] + yr1_rsu_gross, 2)
    if yr1_rsu_gross > 0:
        rsu_pct_str = round(float(inputs.get("rsu_tax_withholding_pct", 39.2)), 1)
        pc["waterfall"].append({"label": "+ Gross RSU Vests ({0})".format(rsu_ticker), "amount": round(yr1_rsu_gross, 2), "type": "total"})
        pc["waterfall"].append({"label": "- RSU Sell-to-Cover Tax ({0}%)".format(rsu_pct_str), "amount": -round(yr1_rsu_tax, 2), "type": "tax"})
        pc["waterfall"].append({"label": "= Net Vested {0} Added to Brokerage".format(rsu_ticker), "amount": round(yr1_rsu_net, 2), "type": "deduction"})
        tot_comp = pc["gross"] + yr1_rsu_gross
        tot_saved = pc["total_retirement_savings"] + yr1_rsu_net + (float(inputs.get("taxable_savings_monthly", 0.0)) * 12.0)
        pc["savings_rate_pct"] = round(tot_saved / tot_comp * 100.0, 1) if tot_comp > 0 else pc["savings_rate_pct"]

    # Summary metrics
    ret_idx = int(inputs["retirement_age"]) - int(inputs["age"])
    nest_egg_at_ret = det_proj[ret_idx]["total"] if 0 <= ret_idx < len(det_proj) else 0.0
    nest_egg_at_ret_real = det_proj[ret_idx]["total_real"] if 0 <= ret_idx < len(det_proj) else 0.0

    # Required nest egg calculation (PV of retirement spending gap net of SS, discounted at real post-retirement return)
    r_post_real = (1.0 + float(inputs["return_post_pct"]) / 100.0) / (1.0 + float(inputs["inflation_pct"]) / 100.0) - 1.0
    r_post_real = max(0.005, r_post_real)
    ret_years = max(1, int(inputs["life_expectancy"]) - int(inputs["retirement_age"]))
    net_annual_gap_real = max(0.0, float(inputs["retirement_spending"]) - (float(inputs["social_security_monthly"]) * 12.0 * 0.9))
    # Annuity present value formula
    required_nest_egg_real = net_annual_gap_real * (1.0 - (1.0 + r_post_real) ** (-ret_years)) / r_post_real
    funded_pct = (nest_egg_at_ret_real / required_nest_egg_real * 100.0) if required_nest_egg_real > 0 else 100.0

    # Sustainable real spending bisection
    # Test zero spending first: if even 0 spend depletes, sustainable spending is 0
    zero_inp = dict(inputs)
    zero_inp["retirement_spending"] = 0.0
    _, zero_dep, _ = simulate_single_path(zero_inp, seed=None, _work_sched=work_sched, collect_projection=False)
    if zero_dep:
        sustainable_spending_real = 0.0
    else:
        sust_low = 0.0
        sust_high = max(float(inputs["retirement_spending"]) * 3.0, 50000.0)
        sustainable_spending_real = float(inputs["retirement_spending"])
        for _ in range(14):
            test_spend = (sust_low + sust_high) / 2.0
            test_inp = dict(inputs)
            test_inp["retirement_spending"] = test_spend
            _, is_dep, _ = simulate_single_path(test_inp, seed=None, _work_sched=work_sched, collect_projection=False)
            if is_dep:
                sust_high = test_spend
            else:
                sust_low = test_spend
                sustainable_spending_real = test_spend

    # 3. Monte Carlo Simulation
    successes = 0
    all_paths_real = []  # shape: (runs, num_years)

    for i in range(mc_runs):
        path_real, is_dep, _ = simulate_single_path(
            inputs, seed=seed + i, _work_sched=work_sched, collect_projection="real_only"
        )
        if not is_dep:
            successes += 1
        all_paths_real.append(path_real)

    mc_success_pct = round(successes / float(mc_runs) * 100.0, 1)

    # Percentile bands (p10, p25, p50, p75, p90) by age
    num_years = len(det_proj)
    bands = []
    for y_idx in range(num_years):
        vals = sorted([all_paths_real[r][y_idx] for r in range(mc_runs)])
        bands.append({
            "age": det_proj[y_idx]["age"],
            "year": det_proj[y_idx]["year"],
            "p10": round(vals[int(0.10 * mc_runs)], 2),
            "p25": round(vals[int(0.25 * mc_runs)], 2),
            "p50": round(vals[int(0.50 * mc_runs)], 2),
            "p75": round(vals[int(0.75 * mc_runs)], 2),
            "p90": round(vals[int(0.90 * mc_runs)], 2),
        })

    end_vals = sorted([all_paths_real[r][-1] for r in range(mc_runs)])
    median_end_balance_real = round(end_vals[int(0.50 * mc_runs)], 2)
    p10_end_balance_real = round(end_vals[int(0.10 * mc_runs)], 2)

    # 4. Warnings and Advice
    warnings = []
    actual_emp_match_pct = pc.get("employer_match", 0.0)
    max_possible_match = float(inputs["gross_salary"]) * (float(inputs["employer_match_limit_pct"]) / 100.0) * (float(inputs["employer_match_pct"]) / 100.0)
    if actual_emp_match_pct < max_possible_match - 5.0:
        left_on_table = max_possible_match - actual_emp_match_pct
        warnings.append({
            "severity": "high",
            "title": "Leaving Employer 401(k) Match on the Table",
            "detail": f"You are contributing below the match limit. Contributing more captures an extra ${left_on_table:,.0f}/year in free money.",
        })

    if float(inputs["balances"]["cash"]) < float(inputs["retirement_spending"]) * 0.25:
        warnings.append({
            "severity": "medium",
            "title": "Emergency Cash Reserves Low",
            "detail": "Cash on hand is under 3 months of typical living expenses. Consider strengthening your liquid emergency cushion.",
        })

    if float(inputs["gross_salary"]) > 160000.0 and inputs["ira_type"] == "roth":
        warnings.append({
            "severity": "info",
            "title": "Roth IRA Income Limit Phase-Out",
            "detail": "For 2026, direct Roth IRA contributions begin phasing out around $153k single ($242k married). You may use the standard Backdoor Roth strategy.",
        })

    # 5. What-if Levers
    gross_sal = float(inputs["gross_salary"])
    max_401k_pct = min(50.0, round(24500.0 / gross_sal * 100.0, 1)) if gross_sal > 0 else 50.0

    cur_grant = float(inputs.get("annual_rsu_grant") or 0.0)
    cons_grant = round(cur_grant * 0.67, -3) if cur_grant > 10000 else 0.0
    cons_label = "Conservative RSU Refresher (${0:,.0f}/yr)".format(cons_grant) if cur_grant > 10000 else "Boost Monthly Savings (+$500/mo)"
    cons_diff = {"annual_rsu_grant": cons_grant} if cur_grant > 10000 else {"taxable_savings_monthly": float(inputs.get("taxable_savings_monthly") or 0.0) + 500.0}

    lever_defs = [
        {"id": "save_more_2pct", "label": "Save +2% more to 401(k)", "diff": {"pretax_401k_pct": float(inputs["pretax_401k_pct"]) + 2.0}, "needs_sched": True},
        {"id": "max_401k", "label": "Max out 401(k) ($24,500/yr)", "diff": {"pretax_401k_pct": max_401k_pct}, "needs_sched": True},
        {"id": "retire_later_2", "label": "Retire 2 years later (extra comp cycles)", "diff": {"retirement_age": int(inputs["retirement_age"]) + 2}, "needs_sched": False},
        {"id": "retire_earlier_2", "label": "Retire 2 years earlier", "diff": {"retirement_age": max(int(inputs["age"]) + 1, int(inputs["retirement_age"]) - 2)}, "needs_sched": False},
        {"id": "conservative_rsu", "label": cons_label, "diff": cons_diff, "needs_sched": True},
        {"id": "spend_less_10pct", "label": "Spend 10% less in retirement", "diff": {"retirement_spending": round(float(inputs["retirement_spending"]) * 0.9, 2)}, "needs_sched": False},
    ]

    levers = []
    for l in lever_defs:
        mod_inp = dict(inputs)
        mod_inp.update(l["diff"])
        l_sched = _precompute_work_schedule(mod_inp) if l["needs_sched"] else work_sched
        succ = 0
        l_runs = 200
        for r_i in range(l_runs):
            _, is_dep, _ = simulate_single_path(mod_inp, seed=seed + r_i, _work_sched=l_sched, collect_projection=False)
            if not is_dep:
                succ += 1
        l_succ_pct = round(succ / float(l_runs) * 100.0, 1)
        mod_det, _, _ = simulate_single_path(mod_inp, seed=None, _work_sched=l_sched, collect_projection="real_only")
        m_ret_idx = int(mod_inp["retirement_age"]) - int(mod_inp["age"])
        mod_nest_real = mod_det[m_ret_idx] if 0 <= m_ret_idx < len(mod_det) else 0.0

        levers.append({
            "id": l["id"],
            "label": l["label"],
            "diff": l["diff"],
            "success_pct": l_succ_pct,
            "success_delta_pts": round(l_succ_pct - mc_success_pct, 1),
            "nest_egg_real_delta": round(mod_nest_real - nest_egg_at_ret_real, 2),
        })

    # 6. Earliest Retirement Age (where success >= 80%) via binary search
    def _is_age_viable(cand_age):
        cand_inp = dict(inputs)
        cand_inp["retirement_age"] = cand_age
        c_succ = 0
        c_runs = 120
        for c_i in range(c_runs):
            _, is_dep, _ = simulate_single_path(
                cand_inp, seed=seed + c_i, _work_sched=work_sched, collect_projection=False
            )
            if not is_dep:
                c_succ += 1
        return (c_succ / float(c_runs)) >= 0.80

    lo_age = int(inputs["age"]) + 1
    hi_age = 72
    earliest_age = None
    if lo_age <= hi_age:
        if _is_age_viable(lo_age):
            earliest_age = lo_age
        elif _is_age_viable(hi_age):
            while lo_age < hi_age:
                mid_age = (lo_age + hi_age) // 2
                if _is_age_viable(mid_age):
                    hi_age = mid_age
                else:
                    lo_age = mid_age + 1
            earliest_age = lo_age

    summary = {
        "nest_egg_at_retirement": round(nest_egg_at_ret, 2),
        "nest_egg_at_retirement_real": round(nest_egg_at_ret_real, 2),
        "required_nest_egg_real": round(required_nest_egg_real, 2),
        "funded_pct": round(funded_pct, 1),
        "on_track": (mc_success_pct >= 80.0),
        "depletion_age": det_depletion_age,
        "sustainable_spending_real": round(sustainable_spending_real, 2),
        "years_to_retirement": int(inputs["retirement_age"]) - int(inputs["age"]),
        "years_in_retirement": int(inputs["life_expectancy"]) - int(inputs["retirement_age"]),
        "monthly_income_at_retirement_real": round(sustainable_spending_real / 12.0, 2),
        "replacement_rate_pct": round(sustainable_spending_real / gross_sal * 100.0, 1) if gross_sal > 0 else 0.0,
    }

    age_val = int(inputs["age"])
    if 60 <= age_val <= 63:
        k401_catch = TAX_2026["limits"]["k401_catchup_60_63"]
    elif age_val >= 50:
        k401_catch = TAX_2026["limits"]["k401_catchup_50"]
    else:
        k401_catch = 0.0

    hsa_base = TAX_2026["limits"]["hsa_self"] if inputs.get("hsa_coverage") == "self" else TAX_2026["limits"]["hsa_family"]
    hsa_catch = TAX_2026["limits"]["hsa_catchup_55"] if age_val >= 55 else 0.0

    limits_info = {
        "k401_employee": TAX_2026["limits"]["k401_employee"],
        "k401_catchup": k401_catch,
        "ira": TAX_2026["limits"]["ira"],
        "ira_catchup": TAX_2026["limits"]["ira_catchup_50"] if age_val >= 50 else 0.0,
        "hsa": hsa_base + hsa_catch,
    }

    yr1_vest_gross = det_proj[0]["rsu_vest_gross"] if det_proj else 0.0
    yr1_vest_net = det_proj[0]["rsu_vest_net"] if det_proj else 0.0

    # Derive live vested & unvested RSU totals from DB holdings if available
    stock_price = float(rsu_static.get("fallback_price") or 100.0)
    vested_sh = 0.0
    vested_val = 0.0
    unvested_sh = 0
    try:
        c_rsu = get_connection()
        h_rows = c_rsu.execute(
            "SELECT symbol, shares, current_price, current_value FROM holdings WHERE UPPER(symbol) = ? OR UPPER(symbol) LIKE '%-RSU' OR UPPER(name) LIKE '%UNVESTED%'",
            (rsu_ticker.upper(),),
        ).fetchall()
        c_rsu.close()
        for hr in h_rows:
            sym_u = (hr["symbol"] or "").upper()
            sh = float(hr["shares"] or 0.0)
            px = float(hr["current_price"] or 0.0)
            val = float(hr["current_value"] or 0.0)
            if px > 0:
                stock_price = px
            if sym_u.endswith("-RSU") or "UNVESTED" in sym_u:
                unvested_sh += int(round(sh))
            elif sym_u == rsu_ticker.upper():
                vested_sh += sh
                vested_val += val
    except Exception:
        pass

    unv_bal_val = float(inputs.get("unvested_rsu_balance", 0.0))
    if unvested_sh == 0 and unv_bal_val > 0 and stock_price > 0:
        unvested_sh = int(round(unv_bal_val / stock_price))

    rsu_model = {
        "ticker": rsu_ticker,
        "title": rsu_static.get("title") or "{0} RSU Vesting Pipeline".format(rsu_ticker),
        "unvested_balance": round(unv_bal_val, 2),
        "unvested_shares": unvested_sh,
        "vested_award_shares": round(vested_sh, 2),
        "vested_award_value": round(vested_val, 2),
        "stock_price": round(stock_price, 2),
        "annual_rsu_grant": round(float(inputs.get("annual_rsu_grant", 0.0)), 2),
        "rsu_tax_withholding_pct": round(float(inputs.get("rsu_tax_withholding_pct", 39.2)), 1),
        "yr1_vest_gross": round(yr1_vest_gross, 2),
        "yr1_vest_net": round(yr1_vest_net, 2),
        "current_monthly_vest_shares": float(rsu_static.get("current_monthly_vest_shares") or 0.0),
        "current_monthly_net_shares": float(rsu_static.get("current_monthly_net_shares") or 0.0),
        "historical_grants_by_year": copy.deepcopy(rsu_static.get("historical_grants_by_year") or []),
        "active_grants": copy.deepcopy(rsu_static.get("active_grants") or []),
    }

    k401_src = copy.deepcopy(rp.get("k401_model") or {})
    k401_model = {
        "enabled": bool(k401_src.get("enabled", True)),
        "plan_name": k401_src.get("plan_name", "Employer 401(k) Savings Plan"),
        "account_number": k401_src.get("account_number", "XXXX"),
        "as_of": k401_src.get("as_of", "2026-09-30"),
        "ending_balance": float(k401_src.get("ending_balance", 0.0)),
        "pretax_total": float(k401_src.get("pretax_total", 0.0)),
        "roth_in_plan_total": float(k401_src.get("roth_in_plan_total", 0.0)),
        "ytd_beginning_balance": float(k401_src.get("ytd_beginning_balance", 0.0)),
        "ytd_employee_pretax": float(k401_src.get("ytd_employee_pretax", 0.0)),
        "ytd_employer_match": float(k401_src.get("ytd_employer_match", 0.0)),
        "ytd_aftertax_mega_backdoor": float(k401_src.get("ytd_aftertax_mega_backdoor", 0.0)),
        "ytd_employee_total": float(k401_src.get("ytd_employee_total", 0.0)),
        "ytd_total_contributions": float(k401_src.get("ytd_total_contributions", 0.0)),
        "ytd_market_gain": float(k401_src.get("ytd_market_gain", 0.0)),
        "ytd_other_transactions": float(k401_src.get("ytd_other_transactions", 0.0)),
        "ytd_roth_rollout_q1": float(k401_src.get("ytd_roth_rollout_q1", 0.0)),
        "ytd_roth_rollout_note": k401_src.get("ytd_roth_rollout_note", ""),
        "ytd_fees": float(k401_src.get("ytd_fees", 0.0)),
        "annualized_mega_backdoor": round(float(inputs.get("aftertax_401k_annual", 0.0)), 2),
        "quarters": k401_src.get("quarters") or [],
        "sources": k401_src.get("sources") or [],
        "funds": k401_src.get("funds") or [],
    }

    plan_result = {
        "inputs": inputs,
        "paycheck": pc,
        "limits": limits_info,
        "warnings": warnings,
        "projection": det_proj,
        "summary": summary,
        "rsu_model": rsu_model,
        "k401_model": k401_model,
        "monte_carlo": {
            "runs": mc_runs,
            "success_pct": mc_success_pct,
            "success_definition": "Portfolio never completely depleted before life expectancy",
            "bands": bands,
            "median_end_balance_real": median_end_balance_real,
            "p10_end_balance_real": p10_end_balance_real,
        },
        "levers": levers,
        "earliest_retirement_age": earliest_age,
    }
    if len(_PLAN_CACHE) >= 32:
        _PLAN_CACHE.clear()
    _PLAN_CACHE[cache_key] = copy.deepcopy(plan_result)
    return plan_result
