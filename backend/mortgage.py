"""Mortgage Paydown, Refinance Comparison, and IRS $750k Tax Deduction Engine.

Models:
1. Dynamic amortization & historical excess payment schedules
2. IRS Publication 936 Mortgage Interest Deduction rules:
   - $750,000 qualified residence loan limit ($375,000 MFS) — interest on principal > $750k gets 0% tax benefit
   - Itemized Deductions (Deductible Mortgage Interest + SALT capped at $10,000) vs. Standard Deduction floor
   - Recast / Re-amortize at lower principal vs. Term shortening
3. Ownership vs. Renting unrecoverable cost comparison
"""
import copy
import json
import math
from datetime import datetime
from backend.db import get_db_stamp
from backend.profile_loader import get_mortgage_profile, is_private_profile_loaded

_MORTGAGE_CACHE = {}


def get_spreadsheet_meta():
    return copy.deepcopy(get_mortgage_profile().get("spreadsheet_meta", {}))


def _get_excess_maps():
    mp = get_mortgage_profile()
    return (
        mp.get("real_tracker_65_actual_excess", {}),
        mp.get("real_tracker_575_actual_excess", {}),
    )


def compute_pmt(annual_rate_pct, total_months, loan_amount):
    """Equivalent to Excel/Sheets ROUND(-PMT(rate/12, months, loan), 2)."""
    if total_months <= 0 or loan_amount <= 0:
        return 0.0
    r = (float(annual_rate_pct) / 100.0) / 12.0
    if r <= 0:
        return round(float(loan_amount) / float(total_months), 2)
    pmt = float(loan_amount) * (r * ((1.0 + r) ** total_months)) / (((1.0 + r) ** total_months) - 1.0)
    return round(pmt, 2)


def add_months(ym_str, offset):
    """Add `offset` months to a 'YYYY-MM' string and return ('YYYY-MM', 'M/1/YYYY')."""
    parts = str(ym_str).split("-")
    year = int(parts[0])
    month = int(parts[1])
    tot = (year * 12 + (month - 1)) + int(offset)
    ny = tot // 12
    nm = (tot % 12) + 1
    return "{0:04d}-{1:02d}".format(ny, nm), "{0}/1/{1}".format(nm, ny)


def get_default_mortgage_inputs():
    """Return default mortgage & property parameters from the active profile."""
    mp = get_mortgage_profile()
    d = copy.deepcopy(mp.get("default_inputs") or {})
    ex65, ex575 = _get_excess_maps()

    base = {
        "home_address": "100 Main St, Anytown, USA",
        "neighborhood": "Primary Residence",
        "property_specs": "3 Bed • 2.5 Bath",
        "purchase_date": "January 2024",
        "home_price": 500000.0,
        "valuation_mode": "comps_cooling",
        "estimated_home_value": 525000.0,
        "secular_home_value": 545000.0,
        "comps_home_value": 525000.0,
        "annual_home_appreciation_pct": 3.0,
        "expected_stock_return_pct": 8.0,
        "stock_cap_gains_tax_pct": 15.0,
        "include_wa_millionaire_tax": False,
        "down_payment": 100000.0,
        "assessed_tax_value": 490000.0,
        "property_tax_annual": 7200.0,
        "hoa_monthly": 300.0,
        "home_insurance_monthly": 140.0,
        "partner_contribution_monthly": 1200.0,
        "rent_comparison_monthly": 3200.0,
        "prev_loan_amount": 400000.0,
        "prev_rate_pct": 5.85,
        "prev_term_years": 30,
        "prev_start_ym": "2024-02",
        "prev_initial_interest": 0.0,
        "prev_orig_total_interest": 432650.0,
        "loan_amount": 360000.0,
        "rate_pct": 4.85,
        "term_years": 30,
        "start_ym": "2025-11",
        "pre_start_principal_paid": 0.0,
        "initial_interest_carry": 0.0,
        "current_ym": "2026-11",
        "historical_excess_575": {k: v["amount"] for k, v in ex575.items()},
        "historical_excess_65": {k: v["amount"] for k, v in ex65.items()},
        "future_monthly_excess": 0.0,
        "one_time_lump_sum": 0.0,
        "lump_sum_ym": "2026-11",
        "stop_excess_at_balance": 0.0,
        "custom_future_overrides": {},
        "filing_status": "single",
        "marginal_tax_rate_pct": 24.0,
        "mortgage_debt_cap": 750000.0,
        "salt_Deduction_cap": 10000.0,
        "standard_deduction_override": 16100.0,
        "include_standard_deduction_floor": True,
    }
    base.update(d)
    if "historical_excess_575" not in d:
        base["historical_excess_575"] = {k: v["amount"] for k, v in ex575.items()}
    if "historical_excess_65" not in d:
        base["historical_excess_65"] = {k: v["amount"] for k, v in ex65.items()}
    return base


def compute_monthly_tax_benefit(
    begin_balance,
    monthly_interest,
    marginal_rate_dec,
    debt_cap=750000.0,
    monthly_salt_deductible=833.33,
    monthly_std_deduction=1341.67,
    include_std_floor=True,
):
    """Compute IRS $750k-capped mortgage interest tax benefit vs. naive uncapped formula.

    Under IRS Publication 936:
    - Qualified residence interest is only deductible on up to $750,000 of principal.
    - If `begin_balance > debt_cap`, only `monthly_interest * (debt_cap / begin_balance)` is deductible.
    - The portion of interest on `(begin_balance - debt_cap)` gets $0 tax benefit.
    """
    if begin_balance <= 0 or monthly_interest <= 0:
        return {
            "deductible_ratio": 0.0,
            "deductible_balance": 0.0,
            "unbenefited_balance": 0.0,
            "deductible_interest": 0.0,
            "non_deductible_interest": 0.0,
            "naive_tax_saved": 0.0,
            "capped_tax_saved_gross": 0.0,
            "incremental_tax_saved_over_std": 0.0,
            "effective_tax_saved": 0.0,
            "net_interest_after_tax": 0.0,
            "naive_after_tax_rate_annual_pct": 0.0,
            "true_after_tax_rate_annual_pct": 0.0,
            "marginal_rate_on_top_dollar_pct": 0.0,
        }

    # 1. IRS $750k debt cap split
    if debt_cap > 0 and begin_balance > debt_cap:
        deductible_ratio = debt_cap / float(begin_balance)
        deductible_balance = float(debt_cap)
        unbenefited_balance = float(begin_balance) - float(debt_cap)
    else:
        deductible_ratio = 1.0 if debt_cap > 0 else 0.0
        deductible_balance = float(begin_balance) if debt_cap > 0 else 0.0
        unbenefited_balance = 0.0 if debt_cap > 0 else float(begin_balance)

    deductible_interest = round(monthly_interest * deductible_ratio, 2)
    non_deductible_interest = round(max(0.0, monthly_interest - deductible_interest), 2)

    # 2. Naive spreadsheet formula (Col P: F_t * 0.37 on entire balance regardless of $750k cap)
    naive_tax_saved = round(monthly_interest * marginal_rate_dec, 2)

    # 3. Capped tax saved (before standard deduction hurdle)
    capped_tax_saved_gross = round(deductible_interest * marginal_rate_dec, 2)

    # 4. Incremental tax saved over Standard Deduction (Itemized = Deductible Interest + SALT vs Std Deduction)
    total_itemized = deductible_interest + monthly_salt_deductible
    excess_over_std = max(0.0, total_itemized - monthly_std_deduction)
    # Compare against what itemized excess would be without mortgage interest
    salt_only_excess = max(0.0, monthly_salt_deductible - monthly_std_deduction)
    incremental_deduction_from_mortgage = max(0.0, excess_over_std - salt_only_excess)
    incremental_tax_saved = round(incremental_deduction_from_mortgage * marginal_rate_dec, 2)

    effective_tax_saved = incremental_tax_saved if include_std_floor else capped_tax_saved_gross
    net_interest_after_tax = round(max(0.0, monthly_interest - effective_tax_saved), 2)

    nominal_annual_pct = (monthly_interest / begin_balance) * 12.0 * 100.0
    naive_after_tax_rate_annual_pct = nominal_annual_pct * (1.0 - marginal_rate_dec)
    true_after_tax_rate_annual_pct = (net_interest_after_tax / begin_balance) * 12.0 * 100.0

    # What is the guaranteed after-tax return on the NEXT $1 of principal paid down right now?
    # - If begin_balance > debt_cap ($750k), paying down $1 reduces non-deductible interest, so you lose $0 tax deduction -> full nominal rate!
    # - If begin_balance <= debt_cap AND total_itemized > monthly_std_deduction, paying down $1 reduces deductible interest -> rate * (1 - tax_rate)
    # - If total_itemized <= monthly_std_deduction, you are taking the standard deduction -> full nominal rate!
    if begin_balance > debt_cap:
        marginal_rate_on_top_dollar_pct = nominal_annual_pct
    elif include_std_floor and total_itemized <= monthly_std_deduction:
        marginal_rate_on_top_dollar_pct = nominal_annual_pct
    else:
        marginal_rate_on_top_dollar_pct = nominal_annual_pct * (1.0 - marginal_rate_dec)

    return {
        "deductible_ratio": round(deductible_ratio, 4),
        "deductible_balance": round(deductible_balance, 2),
        "unbenefited_balance": round(unbenefited_balance, 2),
        "deductible_interest": deductible_interest,
        "non_deductible_interest": non_deductible_interest,
        "naive_tax_saved": naive_tax_saved,
        "capped_tax_saved_gross": capped_tax_saved_gross,
        "incremental_tax_saved_over_std": incremental_tax_saved,
        "effective_tax_saved": effective_tax_saved,
        "net_interest_after_tax": net_interest_after_tax,
        "naive_after_tax_rate_annual_pct": round(naive_after_tax_rate_annual_pct, 4),
        "true_after_tax_rate_annual_pct": round(true_after_tax_rate_annual_pct, 4),
        "marginal_rate_on_top_dollar_pct": round(marginal_rate_on_top_dollar_pct, 4),
    }


def simulate_schedule(
    loan_amount,
    annual_rate_pct,
    term_years,
    start_ym,
    pre_start_principal_paid=0.0,
    initial_interest_carry=4615.89,
    orig_total_interest=1377483.90,
    historical_excess_map=None,
    current_ym="2026-11",
    future_monthly_excess=0.0,
    one_time_lump_sum=0.0,
    lump_sum_ym="2026-11",
    stop_excess_at_balance=0.0,
    custom_future_overrides=None,
    marginal_tax_rate_pct=37.0,
    debt_cap=750000.0,
    salt_cap_annual=10000.0,
    std_deduction_annual=16100.0,
    include_std_floor=True,
    rent_benchmark_monthly=3607.50,
    spreadsheet_final_pmt_compat=True,
):
    """Simulate a complete month-by-month mortgage schedule matching 'Real Tracker' & 'Real Tracker 6.5%'.

    Exact Spreadsheet Equations Replicated:
    - C7 (Scheduled Monthly Pmt): `=ROUND(-PMT(rate/12, term_years*12, loan_amount), 2)`
    - C9 (Period 1 Begin Bal): `=loan_amount - pre_start_principal_paid`
    - D9 (Period 1 Pmt): `=C7`; D_t (t>1): `=MIN(C_t + F_{t-1}, $D$9)` (or `C_t + F_t` if not compat)
    - F_t (Interest): `=ROUND(C_t * (rate/12), 2)`
    - E_t (Principal): `=D_t - F_t`
    - H_t (End Bal): `=IF(C_t - E_t - G_t > 0, C_t - E_t - G_t, 0)`
    - J_t (Total Princ): cumulative sum of `E_t`
    - K_t (Total Int): `initial_interest_carry + cumulative sum of F_t`
    - L_t (Cumulative Rent Benchmark): `t * rent_benchmark_monthly`
    - M_t (Difference in Cost): `=L_t - K_t`
    - O_t (Nominal Monthly Rate): `=((C_t + F_t)/C_t - 1)`
    - P_t (Naive Tax-Adjusted Monthly Rate): `=(C_t + F_t*(1 - tax_rate))/C_t - 1`
    - Q_t (Naive Annualized After-Tax Rate): `=P_t * 12`
    """
    historical_excess_map = historical_excess_map or {}
    custom_future_overrides = custom_future_overrides or {}

    total_months = int(term_years) * 12
    scheduled_pmt = compute_pmt(annual_rate_pct, total_months, loan_amount)
    r_monthly = (float(annual_rate_pct) / 100.0) / 12.0
    tax_rate_dec = float(marginal_tax_rate_pct) / 100.0
    monthly_salt = float(salt_cap_annual) / 12.0
    monthly_std = float(std_deduction_annual) / 12.0

    begin_bal = round(float(loan_amount) - float(pre_start_principal_paid), 2)
    cum_scheduled_princ = 0.0
    cum_excess_princ = 0.0
    cum_int = round(float(initial_interest_carry), 2)
    cum_int_schedule_only = 0.0
    cum_rent = 0.0

    cum_deductible_int = 0.0
    cum_non_deductible_int = 0.0
    cum_naive_tax_saved = 0.0
    cum_true_tax_saved = 0.0
    cum_net_after_tax_int = round(float(initial_interest_carry), 2)

    rows = []
    prev_int = 0.0
    crossed_750k_ym = None
    crossed_750k_period = None
    payoff_ym = None
    payoff_date_str = None
    payoff_period = 0

    for m_idx in range(total_months):
        period = m_idx + 1
        ym, date_str = add_months(start_ym, m_idx)

        if begin_bal <= 0.004:
            break

        if crossed_750k_ym is None and begin_bal <= debt_cap:
            crossed_750k_ym = ym
            crossed_750k_period = period

        interest = round(begin_bal * r_monthly, 2)

        if period == 1:
            payment = scheduled_pmt
        else:
            if spreadsheet_final_pmt_compat:
                payment = round(min(begin_bal + prev_int, scheduled_pmt), 2)
            else:
                payment = round(min(begin_bal + interest, scheduled_pmt), 2)

        principal = round(payment - interest, 2)

        # Determine Excess Payment (G_t)
        is_historical = (ym < current_ym)
        if ym in custom_future_overrides and custom_future_overrides[ym] is not None:
            excess = float(custom_future_overrides[ym])
        elif ym in historical_excess_map:
            excess = float(historical_excess_map[ym])
        elif not is_historical:
            # Future month (ym >= current_ym)
            excess = float(future_monthly_excess or 0.0)
            if stop_excess_at_balance and float(stop_excess_at_balance) > 0:
                # If balance is already at or below target, stop recurring excess
                if begin_bal <= float(stop_excess_at_balance):
                    excess = 0.0
                else:
                    # Cap excess so ending balance doesn't overshoot below stop_excess_at_balance
                    after_sched = max(0.0, begin_bal - principal)
                    max_needed_to_hit_stop = max(0.0, after_sched - float(stop_excess_at_balance))
                    excess = min(excess, max_needed_to_hit_stop)
            if one_time_lump_sum and float(one_time_lump_sum) > 0 and ym == lump_sum_ym:
                excess += float(one_time_lump_sum)
        else:
            excess = 0.0

        # Ensure excess doesn't exceed remaining balance after scheduled principal
        rem_after_princ = max(0.0, round(begin_bal - principal, 2))
        actual_excess = round(min(excess, rem_after_princ), 2) if rem_after_princ > 0 else 0.0

        raw_end = round(begin_bal - principal - excess, 2)
        end_bal = raw_end if raw_end > 0 else 0.0

        cum_scheduled_princ = round(cum_scheduled_princ + principal, 2)
        cum_excess_princ = round(cum_excess_princ + actual_excess, 2)
        cum_int = round(cum_int + interest, 2)
        cum_int_schedule_only = round(cum_int_schedule_only + interest, 2)
        cum_rent = round(cum_rent + float(rent_benchmark_monthly), 2)
        diff_in_cost = round(cum_rent - cum_int, 2)

        # Tax calculations for this month
        tax_info = compute_monthly_tax_benefit(
            begin_balance=begin_bal,
            monthly_interest=interest,
            marginal_rate_dec=tax_rate_dec,
            debt_cap=debt_cap,
            monthly_salt_deductible=monthly_salt,
            monthly_std_deduction=monthly_std,
            include_std_floor=include_std_floor,
        )

        cum_deductible_int = round(cum_deductible_int + tax_info["deductible_interest"], 2)
        cum_non_deductible_int = round(cum_non_deductible_int + tax_info["non_deductible_interest"], 2)
        cum_naive_tax_saved = round(cum_naive_tax_saved + tax_info["naive_tax_saved"], 2)
        cum_true_tax_saved = round(cum_true_tax_saved + tax_info["effective_tax_saved"], 2)
        cum_net_after_tax_int = round(cum_net_after_tax_int + tax_info["net_interest_after_tax"], 2)

        row_obj = {
            "period": period,
            "ym": ym,
            "date": date_str,
            "is_historical": is_historical,
            "is_current_month": (ym == current_ym),
            "begin_balance": begin_bal,
            "payment": payment,
            "principal": principal,
            "interest": interest,
            "excess_payment": round(excess, 2),
            "actual_excess_applied": actual_excess,
            "total_cash_outflow": round(payment + actual_excess, 2),
            "end_balance": end_bal,
            "total_principal_scheduled": cum_scheduled_princ,
            "total_principal_all": round(float(loan_amount) - end_bal, 2),
            "total_interest": cum_int,
            "rent_cost_cum": cum_rent,
            "diff_in_cost": diff_in_cost,
            "above_750k_cap": begin_bal > debt_cap,
            "unbenefited_balance": tax_info["unbenefited_balance"],
            "deductible_ratio_pct": round(tax_info["deductible_ratio"] * 100.0, 1),
            "deductible_interest": tax_info["deductible_interest"],
            "non_deductible_interest": tax_info["non_deductible_interest"],
            "naive_tax_saved": tax_info["naive_tax_saved"],
            "true_tax_saved": tax_info["effective_tax_saved"],
            "net_interest_after_tax": tax_info["net_interest_after_tax"],
            "naive_after_tax_rate_pct": tax_info["naive_after_tax_rate_annual_pct"],
            "true_after_tax_rate_pct": tax_info["true_after_tax_rate_annual_pct"],
            "marginal_return_on_paydown_pct": tax_info["marginal_rate_on_top_dollar_pct"],
        }
        rows.append(row_obj)

        prev_int = interest
        payoff_ym = ym
        payoff_date_str = date_str
        payoff_period = period

        if end_bal <= 0.004:
            if crossed_750k_ym is None:
                crossed_750k_ym = ym
                crossed_750k_period = period
            break
        begin_bal = end_bal

    # Populate N_t = SUM(F_t : F_{t+11}) rolling 12-month forward interest (matching Col N in Real Tracker)
    num_rows = len(rows)
    for i in range(num_rows):
        fwd_12_int = sum(rows[j]["interest"] for j in range(i, min(num_rows, i + 12)))
        fwd_12_tax_saved = sum(rows[j]["true_tax_saved"] for j in range(i, min(num_rows, i + 12)))
        rows[i]["forward_12m_interest"] = round(fwd_12_int, 2)
        rows[i]["forward_12m_tax_saved"] = round(fwd_12_tax_saved, 2)
        rows[i]["forward_12m_net_interest"] = round(fwd_12_int - fwd_12_tax_saved, 2)

    # Annual summary rollup
    by_year = {}
    for r in rows:
        yr = r["ym"][:4]
        if yr not in by_year:
            by_year[yr] = {
                "year": yr,
                "months_count": 0,
                "start_balance": r["begin_balance"],
                "end_balance": r["end_balance"],
                "scheduled_payments": 0.0,
                "scheduled_principal": 0.0,
                "excess_principal": 0.0,
                "total_principal_paid": 0.0,
                "interest_paid": 0.0,
                "deductible_interest": 0.0,
                "non_deductible_interest": 0.0,
                "naive_tax_saved": 0.0,
                "true_tax_saved": 0.0,
                "net_interest_after_tax": 0.0,
            }
        y = by_year[yr]
        y["months_count"] += 1
        y["end_balance"] = r["end_balance"]
        y["scheduled_payments"] = round(y["scheduled_payments"] + r["payment"], 2)
        y["scheduled_principal"] = round(y["scheduled_principal"] + r["principal"], 2)
        y["excess_principal"] = round(y["excess_principal"] + r["actual_excess_applied"], 2)
        y["total_principal_paid"] = round(y["total_principal_paid"] + r["principal"] + r["actual_excess_applied"], 2)
        y["interest_paid"] = round(y["interest_paid"] + r["interest"], 2)
        y["deductible_interest"] = round(y["deductible_interest"] + r["deductible_interest"], 2)
        y["non_deductible_interest"] = round(y["non_deductible_interest"] + r["non_deductible_interest"], 2)
        y["naive_tax_saved"] = round(y["naive_tax_saved"] + r["naive_tax_saved"], 2)
        y["true_tax_saved"] = round(y["true_tax_saved"] + r["true_tax_saved"], 2)
        y["net_interest_after_tax"] = round(y["net_interest_after_tax"] + r["net_interest_after_tax"], 2)

    # Find current month row (or latest row if already paid off before current_ym)
    current_row = next((r for r in rows if r["ym"] == current_ym), rows[-1] if rows else None)
    remaining_months_from_current = sum(1 for r in rows if r["ym"] >= current_ym)

    int_saved_vs_orig = round(float(orig_total_interest) - cum_int, 2)
    net_after_tax_int_saved_vs_orig = round(float(orig_total_interest) - cum_net_after_tax_int, 2)

    return {
        "summary": {
            "loan_amount": round(float(loan_amount), 2),
            "annual_rate_pct": round(float(annual_rate_pct), 3),
            "term_years": int(term_years),
            "term_months": total_months,
            "scheduled_monthly_pmt": scheduled_pmt,
            "pre_start_principal_paid": round(float(pre_start_principal_paid), 2),
            "initial_interest_carry": round(float(initial_interest_carry), 2),
            "total_principal_scheduled": cum_scheduled_princ,
            "total_excess_principal": cum_excess_princ,
            "total_interest": cum_int,
            "total_interest_schedule_only": cum_int_schedule_only,
            "orig_total_interest": round(float(orig_total_interest), 2),
            "interest_saved_vs_orig": int_saved_vs_orig,
            "total_deductible_interest": cum_deductible_int,
            "total_non_deductible_interest": cum_non_deductible_int,
            "total_naive_tax_saved": cum_naive_tax_saved,
            "total_true_tax_saved": cum_true_tax_saved,
            "tax_overstatement_from_750k_rule": round(cum_naive_tax_saved - cum_true_tax_saved, 2),
            "total_net_after_tax_interest": cum_net_after_tax_int,
            "net_after_tax_saved_vs_orig": net_after_tax_int_saved_vs_orig,
            "payoff_period": payoff_period,
            "payoff_ym": payoff_ym,
            "payoff_date": payoff_date_str,
            "months_saved_vs_term": max(0, total_months - payoff_period),
            "years_saved_vs_term": round(max(0, total_months - payoff_period) / 12.0, 1),
            "remaining_months_from_now": remaining_months_from_current,
            "remaining_years_from_now": round(remaining_months_from_current / 12.0, 1),
            "crossed_750k_ym": crossed_750k_ym,
            "crossed_750k_period": crossed_750k_period,
            "current_balance": current_row["begin_balance"] if current_row else 0.0,
            "current_month_interest": current_row["interest"] if current_row else 0.0,
            "current_month_principal": current_row["principal"] if current_row else 0.0,
            "current_amount_over_750k": max(0.0, (current_row["begin_balance"] if current_row else 0.0) - debt_cap),
            "current_forward_12m_interest": current_row["forward_12m_interest"] if current_row else 0.0,
            "current_forward_12m_tax_saved": current_row["forward_12m_tax_saved"] if current_row else 0.0,
        },
        "current_snapshot": current_row,
        "annual_summary": list(by_year.values()),
        "schedule": rows,
    }


def compute_payment_reduction_analysis(inputs, current_balance=810000.0, remaining_months=172):
    """Analyze how paying down principal reduces monthly payments (Recast / Re-amortize) vs. keeping payment fixed."""
    rate_pct = float(inputs.get("rate_pct", 5.75))
    prev_pmt = compute_pmt(inputs.get("prev_rate_pct", 6.50), int(inputs.get("prev_term_years", 30)) * 12, inputs.get("prev_loan_amount", 1080000.0))
    curr_scheduled_pmt = compute_pmt(rate_pct, int(inputs.get("term_years", 15)) * 12, inputs.get("loan_amount", 984000.0))

    prop_tax_mo = round(float(inputs.get("property_tax_annual", 11000.0)) / 12.0, 2)
    hoa_mo = float(inputs.get("hoa_monthly", 675.0))
    ins_mo = float(inputs.get("home_insurance_monthly", 75.0))
    partner_mo = float(inputs.get("partner_contribution_monthly", 3000.0))
    fixed_escrow_hoa = round(prop_tax_mo + hoa_mo + ins_mo, 2)

    debt_cap = float(inputs.get("mortgage_debt_cap", 750000.0))
    tax_rate_dec = float(inputs.get("marginal_tax_rate_pct", 37.0)) / 100.0
    salt_mo = float(inputs.get("salt_Deduction_cap", 10000.0)) / 12.0
    std_mo = float(inputs.get("standard_deduction_override", 16100.0)) / 12.0
    inc_std = bool(inputs.get("include_standard_deduction_floor", True))
    r_mo = (rate_pct / 100.0) / 12.0

    loan_amt = float(inputs.get("loan_amount", 360000.0))
    lump_sum = float(inputs.get("one_time_lump_sum", 0.0))
    milestones = [
        {"id": "orig_loan", "label": "Loan Start (${0:,.0f})".format(loan_amt), "balance": loan_amt, "extra_needed_now": 0.0},
        {"id": "current_bal", "label": "Current Balance (${0:,.0f})".format(current_balance), "balance": current_balance, "extra_needed_now": 0.0},
    ]
    if current_balance > debt_cap:
        milestones.append({
            "id": "irs_cap_750k",
            "label": "At ${0:,.0f} IRS Tax Cap (-${1:,.0f})".format(debt_cap, current_balance - debt_cap),
            "balance": debt_cap,
            "extra_needed_now": max(0.0, current_balance - debt_cap),
        })
    for tgt in (700000.0, 600000.0, 500000.0, 300000.0, 200000.0):
        if current_balance > tgt + 15000.0 and tgt < loan_amt:
            milestones.append({
                "id": "target_{0}k".format(int(tgt // 1000)),
                "label": "At ${0:,.0f} Balance (-${1:,.0f})".format(tgt, current_balance - tgt),
                "balance": tgt,
                "extra_needed_now": max(0.0, current_balance - tgt),
            })
            if len(milestones) >= 6:
                break
    if lump_sum > 0:
        custom_bal = max(0.0, current_balance - lump_sum)
        milestones.insert(2, {
            "id": "custom_lump",
            "label": "After Custom -${0:,.0f} Lump Sum (${1:,.0f})".format(lump_sum, custom_bal),
            "balance": custom_bal,
            "extra_needed_now": lump_sum,
        })

    tiers = []
    for m in milestones:
        bal = float(m["balance"])
        recast_172_pmt = compute_pmt(rate_pct, remaining_months, bal)
        recast_180_pmt = compute_pmt(rate_pct, 180, bal)
        recast_360_pmt = compute_pmt(rate_pct, 360, bal)

        mo_interest = round(bal * r_mo, 2)
        # If keeping $8,171.24 payment, how much goes to principal vs interest?
        keep_pmt_principal = round(max(0.0, curr_scheduled_pmt - mo_interest), 2)
        # If recasting to remaining 172 months:
        recast_principal = round(max(0.0, recast_172_pmt - mo_interest), 2)

        tax_b = compute_monthly_tax_benefit(
            begin_balance=bal,
            monthly_interest=mo_interest,
            marginal_rate_dec=tax_rate_dec,
            debt_cap=debt_cap,
            monthly_salt_deductible=salt_mo,
            monthly_std_deduction=std_mo,
            include_std_floor=inc_std,
        )
        # Also include SALT tax benefit if itemizing:
        total_itemized = tax_b["deductible_interest"] + salt_mo
        total_tax_saved_inc_salt = round(max(0.0, total_itemized - std_mo) * tax_rate_dec, 2) if inc_std else round(total_itemized * tax_rate_dec, 2)

        all_in_keep_pmt = round(curr_scheduled_pmt + fixed_escrow_hoa, 2)
        all_in_recast_pmt = round(recast_172_pmt + fixed_escrow_hoa, 2)
        unrecoverable_monthly_gross = round(mo_interest + fixed_escrow_hoa, 2)
        unrecoverable_monthly_net_tax = round(unrecoverable_monthly_gross - total_tax_saved_inc_salt, 2)

        tiers.append({
            "id": m["id"],
            "label": m["label"],
            "balance": round(bal, 2),
            "extra_needed_now": round(m["extra_needed_now"], 2),
            "monthly_interest": mo_interest,
            "deductible_interest": tax_b["deductible_interest"],
            "non_deductible_interest": tax_b["non_deductible_interest"],
            "monthly_mortgage_tax_saved": tax_b["effective_tax_saved"],
            "monthly_total_tax_saved_with_salt": total_tax_saved_inc_salt,
            "net_after_tax_interest": tax_b["net_interest_after_tax"],
            "true_after_tax_rate_pct": tax_b["true_after_tax_rate_annual_pct"],
            "marginal_return_on_paydown_pct": tax_b["marginal_rate_on_top_dollar_pct"],
            "keep_pmt_8171": curr_scheduled_pmt,
            "keep_pmt_principal": keep_pmt_principal,
            "recast_pmt_remaining_term": recast_172_pmt,
            "recast_monthly_savings_vs_8171": round(curr_scheduled_pmt - recast_172_pmt, 2),
            "recast_diff_vs_old_6826": round(recast_172_pmt - prev_pmt, 2),
            "recast_principal": recast_principal,
            "recast_15yr_fresh_pmt": recast_180_pmt,
            "recast_30yr_fresh_pmt": recast_360_pmt,
            "all_in_monthly_keep_pmt": all_in_keep_pmt,
            "all_in_monthly_recast_pmt": all_in_recast_pmt,
            "owner_share_keep_pmt": round(all_in_keep_pmt - partner_mo, 2),
            "owner_share_recast_pmt": round(all_in_recast_pmt - partner_mo, 2),
            "unrecoverable_monthly_gross": unrecoverable_monthly_gross,
            "unrecoverable_monthly_net_tax": unrecoverable_monthly_net_tax,
        })

    return {
        "prev_65_scheduled_pmt": prev_pmt,
        "curr_575_scheduled_pmt": curr_scheduled_pmt,
        "property_tax_monthly": prop_tax_mo,
        "hoa_monthly": hoa_mo,
        "insurance_monthly": ins_mo,
        "fixed_escrow_hoa_monthly": fixed_escrow_hoa,
        "partner_contribution_monthly": partner_mo,
        "remaining_months": remaining_months,
        "tiers": tiers,
    }


def run_mortgage_analysis(raw_inputs=None):
    """Run full comparison across current loan, prior loan, IRS cap stop, and user custom plan."""
    ex65, ex575 = _get_excess_maps()
    sp_meta = get_spreadsheet_meta()
    mp = get_mortgage_profile()
    cache_key = (
        get_db_stamp(),
        is_private_profile_loaded(),
        json.dumps(raw_inputs or {}, sort_keys=True, default=str),
    )
    cached = _MORTGAGE_CACHE.get(cache_key)
    if cached is not None:
        return json.loads(cached)

    defaults = get_default_mortgage_inputs()
    inputs = copy.deepcopy(defaults)
    if isinstance(raw_inputs, dict):
        for k, v in raw_inputs.items():
            if k in ("historical_excess_575", "historical_excess_65", "custom_future_overrides") and isinstance(v, dict):
                clean_map = {}
                for mk, mv in v.items():
                    try:
                        clean_map[str(mk)] = max(0.0, float(mv))
                    except (ValueError, TypeError):
                        pass
                inputs[k] = clean_map
            elif k in inputs and v is not None:
                if isinstance(defaults[k], bool):
                    inputs[k] = bool(v)
                elif isinstance(defaults[k], int):
                    try:
                        inputs[k] = int(v)
                    except (ValueError, TypeError):
                        pass
                elif isinstance(defaults[k], float):
                    try:
                        inputs[k] = float(v)
                    except (ValueError, TypeError):
                        pass
                else:
                    inputs[k] = str(v)

    # Calculate the spreadsheet's L7 rent benchmark formula:
    # In Real Tracker!L7: =5000 - (11000/12 * 0.63 + 815) = 3607.50
    tax_rate_dec = float(inputs["marginal_tax_rate_pct"]) / 100.0
    prop_tax_mo = float(inputs["property_tax_annual"]) / 12.0
    hoa_ins_mo = float(inputs["hoa_monthly"]) + float(inputs["home_insurance_monthly"])
    rent_benchmark_575 = 3607.50
    rent_benchmark_65 = 4400.00

    # 1. Original 30-Yr 6.50% Baseline (0 prepayments ever)
    orig_30yr = simulate_schedule(
        loan_amount=inputs["prev_loan_amount"],
        annual_rate_pct=inputs["prev_rate_pct"],
        term_years=inputs["prev_term_years"],
        start_ym=inputs["prev_start_ym"],
        pre_start_principal_paid=0.0,
        initial_interest_carry=0.0,
        orig_total_interest=inputs["prev_orig_total_interest"],
        historical_excess_map={},
        current_ym=inputs["current_ym"],
        future_monthly_excess=0.0,
        marginal_tax_rate_pct=inputs["marginal_tax_rate_pct"],
        debt_cap=inputs["mortgage_debt_cap"],
        salt_cap_annual=inputs["salt_Deduction_cap"],
        std_deduction_annual=inputs["standard_deduction_override"],
        include_std_floor=inputs["include_standard_deduction_floor"],
        rent_benchmark_monthly=rent_benchmark_65,
    )

    # 2. 'Real Tracker 6.5%' (30-Yr 6.50% with actual 2025-2026 prepayments down to $984k, $0 after)
    real_tracker_65 = simulate_schedule(
        loan_amount=inputs["prev_loan_amount"],
        annual_rate_pct=inputs["prev_rate_pct"],
        term_years=inputs["prev_term_years"],
        start_ym=inputs["prev_start_ym"],
        pre_start_principal_paid=0.0,
        initial_interest_carry=inputs["prev_initial_interest"],
        orig_total_interest=inputs["prev_orig_total_interest"],
        historical_excess_map=inputs["historical_excess_65"],
        current_ym=inputs["current_ym"],
        future_monthly_excess=0.0,
        marginal_tax_rate_pct=inputs["marginal_tax_rate_pct"],
        debt_cap=inputs["mortgage_debt_cap"],
        salt_cap_annual=inputs["salt_Deduction_cap"],
        std_deduction_annual=inputs["standard_deduction_override"],
        include_std_floor=inputs["include_standard_deduction_floor"],
        rent_benchmark_monthly=rent_benchmark_65,
    )

    # 3. 'Real Tracker' Baseline (15-Yr 5.75% with actual prepayments to $810k as of 11/1/2026, $0 future excess)
    real_tracker_baseline = simulate_schedule(
        loan_amount=inputs["loan_amount"],
        annual_rate_pct=inputs["rate_pct"],
        term_years=inputs["term_years"],
        start_ym=inputs["start_ym"],
        pre_start_principal_paid=inputs["pre_start_principal_paid"],
        initial_interest_carry=inputs["initial_interest_carry"],
        orig_total_interest=inputs["prev_orig_total_interest"],
        historical_excess_map=inputs["historical_excess_575"],
        current_ym=inputs["current_ym"],
        future_monthly_excess=0.0,
        marginal_tax_rate_pct=inputs["marginal_tax_rate_pct"],
        debt_cap=inputs["mortgage_debt_cap"],
        salt_cap_annual=inputs["salt_Deduction_cap"],
        std_deduction_annual=inputs["standard_deduction_override"],
        include_std_floor=inputs["include_standard_deduction_floor"],
        rent_benchmark_monthly=rent_benchmark_575,
    )

    # 4. 'Pay Down to $750k IRS Cap Then Coast' Strategy (pay $10k/mo or lump sum until hitting $750k, then $0 excess)
    pay_to_750k_plan = simulate_schedule(
        loan_amount=inputs["loan_amount"],
        annual_rate_pct=inputs["rate_pct"],
        term_years=inputs["term_years"],
        start_ym=inputs["start_ym"],
        pre_start_principal_paid=inputs["pre_start_principal_paid"],
        initial_interest_carry=inputs["initial_interest_carry"],
        orig_total_interest=inputs["prev_orig_total_interest"],
        historical_excess_map=inputs["historical_excess_575"],
        current_ym=inputs["current_ym"],
        future_monthly_excess=max(6000.0, float(inputs["future_monthly_excess"] or 6000.0)),
        one_time_lump_sum=60000.0,
        lump_sum_ym=inputs["current_ym"],
        stop_excess_at_balance=inputs["mortgage_debt_cap"],
        marginal_tax_rate_pct=inputs["marginal_tax_rate_pct"],
        debt_cap=inputs["mortgage_debt_cap"],
        salt_cap_annual=inputs["salt_Deduction_cap"],
        std_deduction_annual=inputs["standard_deduction_override"],
        include_std_floor=inputs["include_standard_deduction_floor"],
        rent_benchmark_monthly=rent_benchmark_575,
    )

    # 5. 'Real Tracker Plan 5.75%' (+$6,800/mo ongoing excess)
    plan_6800_excess = simulate_schedule(
        loan_amount=inputs["loan_amount"],
        annual_rate_pct=inputs["rate_pct"],
        term_years=inputs["term_years"],
        start_ym=inputs["start_ym"],
        pre_start_principal_paid=inputs["pre_start_principal_paid"],
        initial_interest_carry=inputs["initial_interest_carry"],
        orig_total_interest=inputs["prev_orig_total_interest"],
        historical_excess_map=inputs["historical_excess_575"],
        current_ym=inputs["current_ym"],
        future_monthly_excess=6800.0,
        marginal_tax_rate_pct=inputs["marginal_tax_rate_pct"],
        debt_cap=inputs["mortgage_debt_cap"],
        salt_cap_annual=inputs["salt_Deduction_cap"],
        std_deduction_annual=inputs["standard_deduction_override"],
        include_std_floor=inputs["include_standard_deduction_floor"],
        rent_benchmark_monthly=rent_benchmark_575,
    )

    # 6. User's Active Custom What-If Simulation
    active_custom = simulate_schedule(
        loan_amount=inputs["loan_amount"],
        annual_rate_pct=inputs["rate_pct"],
        term_years=inputs["term_years"],
        start_ym=inputs["start_ym"],
        pre_start_principal_paid=inputs["pre_start_principal_paid"],
        initial_interest_carry=inputs["initial_interest_carry"],
        orig_total_interest=inputs["prev_orig_total_interest"],
        historical_excess_map=inputs["historical_excess_575"],
        current_ym=inputs["current_ym"],
        future_monthly_excess=inputs["future_monthly_excess"],
        one_time_lump_sum=inputs["one_time_lump_sum"],
        lump_sum_ym=inputs["lump_sum_ym"],
        stop_excess_at_balance=inputs["stop_excess_at_balance"],
        custom_future_overrides=inputs["custom_future_overrides"],
        marginal_tax_rate_pct=inputs["marginal_tax_rate_pct"],
        debt_cap=inputs["mortgage_debt_cap"],
        salt_cap_annual=inputs["salt_Deduction_cap"],
        std_deduction_annual=inputs["standard_deduction_override"],
        include_std_floor=inputs["include_standard_deduction_floor"],
        rent_benchmark_monthly=rent_benchmark_575,
    )

    curr_bal = real_tracker_baseline["summary"]["current_balance"]
    total_contract_months = int(inputs["term_years"]) * 12
    cur_period = (real_tracker_baseline.get("current_snapshot") or {}).get("period") or 1
    rem_contract_months = max(12, total_contract_months - (int(cur_period) - 1))
    payment_reduction = compute_payment_reduction_analysis(
        inputs, current_balance=curr_bal, remaining_months=rem_contract_months
    )

    # Combined Historical Paydown Journey (June 2025 -> Oct 2026 across both loans)
    paid_on_65 = round(inputs["prev_loan_amount"] - inputs["loan_amount"], 2)  # $96,000.00
    paid_on_575 = round(inputs["loan_amount"] - curr_bal, 2)                   # $174,000.00
    total_principal_paid_to_date = round(paid_on_65 + paid_on_575, 2)          # $270,000.00
    current_home_equity = round(inputs["home_price"] - curr_bal, 2)            # $740,000.00 (cost-basis equity)
    equity_pct = round(current_home_equity / inputs["home_price"] * 100.0, 2) if inputs["home_price"] > 0 else 0.0

    val_mode = str(inputs.get("valuation_mode") or "comps_cooling").strip().lower()
    comps_val = float(inputs.get("comps_home_value") or defaults.get("comps_home_value") or inputs["home_price"])
    sec_val = float(inputs.get("secular_home_value") or defaults.get("secular_home_value") or inputs["home_price"])
    if val_mode == "secular_inflation" and float(inputs.get("estimated_home_value") or 0.0) == comps_val:
        est_home_val = sec_val
        apprec_rate = 0.035
    else:
        est_home_val = float(inputs.get("estimated_home_value") or (sec_val if val_mode == "secular_inflation" else comps_val))
        apprec_rate = float(inputs.get("annual_home_appreciation_pct") or (3.5 if val_mode == "secular_inflation" else 2.0)) / 100.0

    stock_nom_rate = float(inputs.get("expected_stock_return_pct") or 8.0) / 100.0
    stock_tax_rate = float(inputs.get("stock_cap_gains_tax_pct") or 18.8) / 100.0
    stock_after_tax_rate = stock_nom_rate * (1.0 - stock_tax_rate)
    mort_rate = float(inputs["rate_pct"]) / 100.0
    tax_rate = float(inputs["marginal_tax_rate_pct"]) / 100.0
    after_tax_mort_below_cap = mort_rate * (1.0 - tax_rate)
    market_home_equity = round(max(0.0, est_home_val - curr_bal), 2)
    market_equity_pct = round(market_home_equity / est_home_val * 100.0, 2) if est_home_val > 0 else 0.0
    unrealized_appreciation = round(est_home_val - float(inputs["home_price"]), 2)
    appreciation_pct = round(unrealized_appreciation / float(inputs["home_price"]) * 100.0, 2) if inputs["home_price"] > 0 else 0.0
    leveraged_return_on_down_pct = round(unrealized_appreciation / float(inputs["down_payment"]) * 100.0, 2) if inputs["down_payment"] > 0 else 0.0

    local_market_comps = copy.deepcopy(mp.get("local_market_comps") or [])

    # Simulate 10-year (120 months) House vs. Stock Market Capital Allocation on $60k lump sum + $6,800/mo excess budget
    monthly_stock_after_tax = stock_after_tax_rate / 12.0
    monthly_mort_r = mort_rate / 12.0
    base_pmt = real_tracker_baseline["summary"]["scheduled_monthly_pmt"]
    alloc_monthly_excess = float(inputs["future_monthly_excess"]) if float(inputs["future_monthly_excess"] or 0.0) > 0 else 6800.0
    alloc_initial_lump = 60000.0

    def _sim_10yr_allocation(mode, home_val_start=None, home_cagr=None, stock_after_tax_override=None):
        h_start = float(home_val_start if home_val_start is not None else est_home_val)
        h_cagr = float(home_cagr if home_cagr is not None else apprec_rate)
        s_monthly = float(stock_after_tax_override if stock_after_tax_override is not None else stock_after_tax_rate) / 12.0
        bal = curr_bal
        stock_bal = 0.0
        cum_tax_saved = 0.0
        cum_int_paid = 0.0
        req_pmt = base_pmt
        if mode in ("all_house", "hybrid_750k", "hybrid_750k_no_recast"):
            pay_lump = min(bal, alloc_initial_lump)
            bal -= pay_lump
            stock_bal += (alloc_initial_lump - pay_lump)
            if mode == "hybrid_750k" and bal <= float(inputs["mortgage_debt_cap"]):
                req_pmt = compute_pmt(inputs["rate_pct"], rem_contract_months, bal)
        else:
            stock_bal += alloc_initial_lump

        for _ in range(120):
            stock_bal = stock_bal * (1.0 + s_monthly)
            if bal > 0.01:
                m_int = round(bal * monthly_mort_r, 2)
                ded_int = m_int * min(1.0, float(inputs["mortgage_debt_cap"]) / bal) if inputs["mortgage_debt_cap"] > 0 else 0.0
                tax_sav = round(ded_int * tax_rate, 2)
                cum_int_paid += m_int
                cum_tax_saved += tax_sav
                sched_p = min(bal, max(0.0, req_pmt - m_int))
                bal -= sched_p
                freed_pmt = max(0.0, base_pmt - (m_int + sched_p))
                avail_extra = alloc_monthly_excess + freed_pmt + tax_sav
                if mode == "all_house":
                    ex_p = min(bal, avail_extra)
                    bal -= ex_p
                    stock_bal += (avail_extra - ex_p)
                elif mode in ("hybrid_750k", "hybrid_750k_no_recast"):
                    if bal > float(inputs["mortgage_debt_cap"]):
                        ex_p = min(bal - float(inputs["mortgage_debt_cap"]), avail_extra)
                        bal -= ex_p
                        stock_bal += (avail_extra - ex_p)
                    else:
                        stock_bal += avail_extra
                else:
                    stock_bal += avail_extra
            else:
                stock_bal += (base_pmt + alloc_monthly_excess)
        home_10yr = round(h_start * ((1.0 + h_cagr) ** 10), 2)
        home_eq_10yr = round(home_10yr - bal, 2)
        return {
            "monthly_req_pmt": round(req_pmt, 2),
            "ending_mortgage": round(bal, 2),
            "ending_home_value": home_10yr,
            "ending_home_equity": home_eq_10yr,
            "ending_stock_portfolio": round(stock_bal, 2),
            "total_combined_net_wealth": round(home_eq_10yr + stock_bal, 2),
            "cumulative_interest_paid_10yr": round(cum_int_paid, 2),
            "cumulative_tax_saved_10yr": round(cum_tax_saved, 2),
            "net_after_tax_interest_10yr": round(cum_int_paid - cum_tax_saved, 2),
        }

    strat_all_house = _sim_10yr_allocation("all_house")
    strat_hybrid_no_recast = _sim_10yr_allocation("hybrid_750k_no_recast")
    strat_hybrid_750k = _sim_10yr_allocation("hybrid_750k")
    strat_all_market = _sim_10yr_allocation("all_market")

    buy_price = float(inputs["home_price"])
    down_pmt = float(inputs["down_payment"])
    cost_basis_eq = round(buy_price - curr_bal, 2)
    comps_unr = round(comps_val - buy_price, 2)
    sec_unr = round(sec_val - buy_price, 2)
    comps_pct = round(comps_unr / buy_price * 100.0, 2) if buy_price > 0 else 0.0
    sec_pct = round(sec_unr / buy_price * 100.0, 2) if buy_price > 0 else 0.0

    valuation_views = {
        "comps_cooling": {
            "id": "comps_cooling",
            "label": "View A: Local Comps Reality (${0:.3f}M Today)".format(comps_val / 1e6),
            "short_label": "Local Comps (${0:.3f}M)".format(comps_val / 1e6),
            "estimated_home_value": comps_val,
            "unrealized_appreciation": comps_unr,
            "appreciation_pct": comps_pct,
            "net_after_selling_costs_today": round(comps_val * 0.94 - curr_bal - cost_basis_eq, 2),
            "market_home_equity": round(comps_val - curr_bal, 2),
            "cost_basis_equity": cost_basis_eq,
            "equity_vs_cash_invested": comps_unr,
            "market_equity_pct": round((comps_val - curr_bal) / comps_val * 100.0, 2) if comps_val > 0 else 0.0,
            "ltv_pct": round(curr_bal / comps_val * 100.0, 2) if comps_val > 0 else 0.0,
            "leveraged_return_on_down_pct": round(comps_unr / down_pmt * 100.0, 2) if down_pmt > 0 else 0.0,
            "annual_appreciation_rate_pct": 2.0,
            "projected_home_value_5yr": round(comps_val * (1.02 ** 5), 2),
            "projected_home_value_10yr": round(comps_val * (1.02 ** 10), 2),
            "rationale": mp.get("comps_rationale") or (
                "Anchored to recent neighborhood comparable sales and automated valuation estimates, "
                "modeling conservative +2.0%/yr long-term real appreciation under higher mortgage rates."
            ),
            "ten_year_strategies": {
                "all_house": _sim_10yr_allocation("all_house", comps_val, 0.02),
                "hybrid_750k_no_recast": _sim_10yr_allocation("hybrid_750k_no_recast", comps_val, 0.02),
                "hybrid_750k": _sim_10yr_allocation("hybrid_750k", comps_val, 0.02),
                "all_market": _sim_10yr_allocation("all_market", comps_val, 0.02),
            },
        },
        "secular_inflation": {
            "id": "secular_inflation",
            "label": "View B: Secular Inflation Trend (${0:.3f}M / +3.5%/yr)".format(sec_val / 1e6),
            "short_label": "Inflation Trend (${0:.3f}M)".format(sec_val / 1e6),
            "estimated_home_value": sec_val,
            "unrealized_appreciation": sec_unr,
            "appreciation_pct": sec_pct,
            "net_after_selling_costs_today": round(sec_val * 0.94 - curr_bal - cost_basis_eq, 2),
            "market_home_equity": round(sec_val - curr_bal, 2),
            "cost_basis_equity": cost_basis_eq,
            "equity_vs_cash_invested": sec_unr,
            "market_equity_pct": round((sec_val - curr_bal) / sec_val * 100.0, 2) if sec_val > 0 else 0.0,
            "ltv_pct": round(curr_bal / sec_val * 100.0, 2) if sec_val > 0 else 0.0,
            "leveraged_return_on_down_pct": round(sec_unr / down_pmt * 100.0, 2) if down_pmt > 0 else 0.0,
            "annual_appreciation_rate_pct": 3.5,
            "projected_home_value_5yr": round(sec_val * (1.035 ** 5), 2),
            "projected_home_value_10yr": round(sec_val * (1.035 ** 10), 2),
            "rationale": mp.get("secular_rationale") or (
                "Models long-run nominal appreciation (+3.5%/yr) reflecting construction replacement-cost inflation "
                "and metropolitan housing land scarcity."
            ),
            "ten_year_strategies": {
                "all_house": _sim_10yr_allocation("all_house", sec_val, 0.035),
                "hybrid_750k_no_recast": _sim_10yr_allocation("hybrid_750k_no_recast", sec_val, 0.035),
                "hybrid_750k": _sim_10yr_allocation("hybrid_750k", sec_val, 0.035),
                "all_market": _sim_10yr_allocation("all_market", sec_val, 0.035),
            },
        },
    }

    # State high-earner / capital gains tax regime (loaded from household mortgage profile)
    wa_tax_regime = copy.deepcopy(get_mortgage_profile().get("wa_tax_regime") or {
        "enabled": False,
        "statute": "Federal & State Tax Context",
        "income_tax_rate_pct": 0.0,
        "income_tax_threshold_agi": 0.0,
        "effective_date": "",
        "combined_top_ordinary_rate_pre_2028_pct": round(tax_rate * 100.0, 2),
        "combined_top_ordinary_rate_2028_plus_pct": round(tax_rate * 100.0, 2),
        "est_annual_agi_with_rsus": 0.0,
        "est_agi_above_1m_threshold": 0.0,
        "est_annual_wa_millionaire_tax_2028": 0.0,
        "est_monthly_wa_millionaire_tax_2028": 0.0,
        "wa_cap_gains_standard_deduction": 0.0,
        "wa_cap_gains_rate_tier1_pct": 0.0,
        "wa_cap_gains_rate_above_1m_pct": 0.0,
        "combined_ltcg_rate_under_278k_pct": round(stock_tax_rate * 100.0, 2),
        "combined_ltcg_rate_278k_to_1m_pct": round(stock_tax_rate * 100.0, 2),
        "combined_ltcg_rate_above_1m_pct": round(stock_tax_rate * 100.0, 2),
        "does_wa_tax_increase_mortgage_deduction": False,
        "mortgage_deduction_rule": "",
        "strategic_actions_2026_2027": [],
    })

    house_vs_market_analysis = {
        "address": inputs.get("home_address", "Primary Residence"),
        "neighborhood": inputs.get("neighborhood", "Residential Neighborhood"),
        "property_specs": inputs.get("property_specs", ""),
        "purchase_date": inputs.get("purchase_date", ""),
        "valuation_mode": val_mode,
        "purchase_price": round(float(inputs["home_price"]), 2),
        "estimated_home_value": round(est_home_val, 2),
        "unrealized_appreciation": unrealized_appreciation,
        "appreciation_pct": appreciation_pct,
        "annual_appreciation_rate_pct": round(apprec_rate * 100.0, 2),
        "projected_home_value_5yr": round(est_home_val * ((1.0 + apprec_rate) ** 5), 2),
        "projected_home_value_10yr": round(est_home_val * ((1.0 + apprec_rate) ** 10), 2),
        "down_payment": round(float(inputs["down_payment"]), 2),
        "principal_paid_to_date": total_principal_paid_to_date,
        "cost_basis_equity": current_home_equity,
        "market_home_equity": market_home_equity,
        "market_equity_pct": market_equity_pct,
        "ltv_pct": round(100.0 - market_equity_pct, 2),
        "leveraged_return_on_down_pct": leveraged_return_on_down_pct,
        "local_market_comps": local_market_comps,
        "valuation_views": valuation_views,
        "wa_tax_regime": wa_tax_regime,
        "tier1_above_750k": {
            "principal_amount": max(0.0, round(curr_bal - float(inputs["mortgage_debt_cap"]), 2)),
            "guaranteed_after_tax_return_pct": round(mort_rate * 100.0, 2),
            "pretax_stock_equivalent_pct": round((mort_rate / (1.0 - stock_tax_rate)) * 100.0, 2),
            "pretax_stock_equiv_with_wa_cap_gains_pct": round((mort_rate / (1.0 - 0.308)) * 100.0, 2),
            "annual_interest_saved": round(max(0.0, curr_bal - float(inputs["mortgage_debt_cap"])) * mort_rate, 2),
            "winner": "House Paydown (Guaranteed 5.75% After-Tax = 7.08%–8.31% Pre-Tax Stock Equiv.)",
        },
        "tier2_below_750k": {
            "principal_amount": min(curr_bal, float(inputs["mortgage_debt_cap"])),
            "guaranteed_after_tax_return_pct": round(after_tax_mort_below_cap * 100.0, 2),
            "pretax_stock_equivalent_pct": round((after_tax_mort_below_cap / (1.0 - stock_tax_rate)) * 100.0, 2),
            "expected_stock_nominal_pct": round(stock_nom_rate * 100.0, 2),
            "expected_stock_after_tax_pct": round(stock_after_tax_rate * 100.0, 2),
            "expected_stock_after_wa_top_tax_pct": round(stock_nom_rate * (1.0 - 0.258) * 100.0, 2),
            "stock_annual_after_tax_spread_pct": round((stock_after_tax_rate - after_tax_mort_below_cap) * 100.0, 2),
            "winner": "Stock Market (+{0:.2f}%/yr After-Tax Spread + Full Liquidity)".format(
                (stock_after_tax_rate - after_tax_mort_below_cap) * 100.0
            ),
        },
        "ten_year_allocation_comparison": {
            "monthly_excess_modeled": alloc_monthly_excess,
            "initial_lump_sum_modeled": alloc_initial_lump,
            "all_house": strat_all_house,
            "hybrid_750k_no_recast": strat_hybrid_no_recast,
            "hybrid_750k": strat_hybrid_750k,
            "all_market": strat_all_market,
            "no_recast_wealth_advantage_vs_all_house": round(
                strat_hybrid_no_recast["total_combined_net_wealth"] - strat_all_house["total_combined_net_wealth"], 2
            ),
            "hybrid_wealth_advantage_vs_all_house": round(
                strat_hybrid_750k["total_combined_net_wealth"] - strat_all_house["total_combined_net_wealth"], 2
            ),
        },
    }

    # Detailed explanation of the Spreadsheet Equations & $750k Tax Rule
    equations_guide = [
        {
            "cell": "C7 (Monthly Pmt)",
            "formula": "=ROUND(-PMT(C4/12, C6, C3), 2)",
            "real_tracker_val": "$8,171.24 (5.75%, 15-Yr on $984k)",
            "real_tracker_65_val": "$6,826.33 (6.50%, 30-Yr on $1.08M)",
            "explanation": "Standard annuity payment formula. Refinancing from 6.50% (30-yr) to 5.75% (15-yr) increased required monthly P&I by $1,344.91/mo, but shifted monthly principal paydown from $1,496/mo to $4,290/mo.",
        },
        {
            "cell": "F_t & E_t (Interest & Principal)",
            "formula": "F_t = ROUND(C_t * $C$4/12, 2) | E_t = D_t - F_t",
            "real_tracker_val": "Nov 2026: $3,881.25 Int | $4,289.99 Princ",
            "real_tracker_65_val": "Nov 2026: $5,255.45 Int | $1,570.88 Princ",
            "explanation": "Every $10,000 of excess principal you pay down on the 5.75% loan immediately cuts monthly interest by $47.92/mo ($575/yr) and redirects that exact $47.92/mo into faster principal compounding.",
        },
        {
            "cell": "F5 (Int Saved)",
            "formula": "=F4 - F3 ($1,377,483.90 - MAX(K9:K368))",
            "real_tracker_val": "$1,047,452.20 Saved ($330,031.70 Total Int)",
            "real_tracker_65_val": "$393,968.12 Saved ($983,515.78 Total Int)",
            "explanation": "Compares total lifetime interest against the original 30-year 6.50% schedule ($1,377,483.90). Your 2025-2026 prepayments + 15-yr 5.75% refi have already locked in $1.047M of nominal interest savings.",
        },
        {
            "cell": "L7 & M_t (Rent vs. Interest Benchmark)",
            "formula": "L7 = 5000 - (11000/12*0.63 + 815) = $3,607.50/mo | M_t = L_t - K_t",
            "real_tracker_val": "$3,607.50/mo net rent hurdle",
            "real_tracker_65_val": "$4,400.00/mo gross rent hurdle",
            "explanation": "Subtracts after-tax property tax ($11k/12 * (1 - 37%) = $577.50) and HOA+Insurance ($815) from $5,000/mo equivalent rent. Once monthly after-tax mortgage interest drops below $3,607.50/mo, owning beats renting on pure unrecoverable cost.",
        },
        {
            "cell": "O_t, P_t, Q_t (After-Tax Interest Rate & $750k Cap)",
            "formula": "Sheet Col P: =(C_t + F_t*(1-0.37))/C_t - 1 | True IRS Cap: MIN(1, 750000/C_t)",
            "real_tracker_val": "Above $750k: 5.75% marginal | Below $750k: 3.6225%",
            "real_tracker_65_val": "Above $750k: 6.50% marginal | Below $750k: 4.095%",
            "explanation": "Sheet Col P applies the 37% tax reduction to all interest. However, IRS Pub 936 caps the mortgage interest deduction at $750,000 of debt. That means the top $60,000 of your current $810,000 balance receives ZERO tax benefit — paying down $810k -> $750k earns a full 5.75% after-tax return!",
        },
    ]

    scenarios_comparison = [
        {
            "id": "orig_30yr_65",
            "name": "Original 30-Yr @ 6.50% (No Prepay)",
            "tag": "BaselineF4",
            "rate_pct": 6.50,
            "term_years": 30,
            "monthly_pmt": orig_30yr["summary"]["scheduled_monthly_pmt"],
            "future_monthly_excess": 0.0,
            "payoff_ym": orig_30yr["summary"]["payoff_ym"],
            "payoff_date": orig_30yr["summary"]["payoff_date"],
            "total_months": orig_30yr["summary"]["payoff_period"],
            "total_interest": orig_30yr["summary"]["total_interest"],
            "interest_saved_vs_orig": 0.0,
            "total_true_tax_saved": orig_30yr["summary"]["total_true_tax_saved"],
            "total_net_after_tax_interest": orig_30yr["summary"]["total_net_after_tax_interest"],
            "crossed_750k_ym": orig_30yr["summary"]["crossed_750k_ym"],
        },
        {
            "id": "real_tracker_65",
            "name": "Real Tracker 6.5% (30-Yr + 2025 Prepay)",
            "tag": "SheetTab6.5%",
            "rate_pct": 6.50,
            "term_years": 30,
            "monthly_pmt": real_tracker_65["summary"]["scheduled_monthly_pmt"],
            "future_monthly_excess": 0.0,
            "payoff_ym": real_tracker_65["summary"]["payoff_ym"],
            "payoff_date": real_tracker_65["summary"]["payoff_date"],
            "total_months": real_tracker_65["summary"]["payoff_period"],
            "total_interest": real_tracker_65["summary"]["total_interest"],
            "interest_saved_vs_orig": real_tracker_65["summary"]["interest_saved_vs_orig"],
            "total_true_tax_saved": real_tracker_65["summary"]["total_true_tax_saved"],
            "total_net_after_tax_interest": real_tracker_65["summary"]["total_net_after_tax_interest"],
            "crossed_750k_ym": real_tracker_65["summary"]["crossed_750k_ym"],
        },
        {
            "id": "real_tracker_575",
            "name": "Real Tracker 5.75% (Current $810k, $0 Future Excess)",
            "tag": "CurrentSheet",
            "rate_pct": 5.75,
            "term_years": 15,
            "monthly_pmt": real_tracker_baseline["summary"]["scheduled_monthly_pmt"],
            "future_monthly_excess": 0.0,
            "payoff_ym": real_tracker_baseline["summary"]["payoff_ym"],
            "payoff_date": real_tracker_baseline["summary"]["payoff_date"],
            "total_months": real_tracker_baseline["summary"]["payoff_period"],
            "total_interest": real_tracker_baseline["summary"]["total_interest"],
            "interest_saved_vs_orig": real_tracker_baseline["summary"]["interest_saved_vs_orig"],
            "total_true_tax_saved": real_tracker_baseline["summary"]["total_true_tax_saved"],
            "total_net_after_tax_interest": real_tracker_baseline["summary"]["total_net_after_tax_interest"],
            "crossed_750k_ym": real_tracker_baseline["summary"]["crossed_750k_ym"],
        },
        {
            "id": "pay_to_750k_cap",
            "name": "Pay -$60k to $750k IRS Cap, Then Coast ($0 Excess)",
            "tag": "TaxOptimal",
            "rate_pct": 5.75,
            "term_years": 15,
            "monthly_pmt": pay_to_750k_plan["summary"]["scheduled_monthly_pmt"],
            "future_monthly_excess": 0.0,
            "payoff_ym": pay_to_750k_plan["summary"]["payoff_ym"],
            "payoff_date": pay_to_750k_plan["summary"]["payoff_date"],
            "total_months": pay_to_750k_plan["summary"]["payoff_period"],
            "total_interest": pay_to_750k_plan["summary"]["total_interest"],
            "interest_saved_vs_orig": pay_to_750k_plan["summary"]["interest_saved_vs_orig"],
            "total_true_tax_saved": pay_to_750k_plan["summary"]["total_true_tax_saved"],
            "total_net_after_tax_interest": pay_to_750k_plan["summary"]["total_net_after_tax_interest"],
            "crossed_750k_ym": pay_to_750k_plan["summary"]["crossed_750k_ym"],
        },
        {
            "id": "plan_6800_excess",
            "name": "Real Tracker Plan 5.75% (+$6,800/mo Excess)",
            "tag": "Aggressive",
            "rate_pct": 5.75,
            "term_years": 15,
            "monthly_pmt": plan_6800_excess["summary"]["scheduled_monthly_pmt"],
            "future_monthly_excess": 6800.0,
            "payoff_ym": plan_6800_excess["summary"]["payoff_ym"],
            "payoff_date": plan_6800_excess["summary"]["payoff_date"],
            "total_months": plan_6800_excess["summary"]["payoff_period"],
            "total_interest": plan_6800_excess["summary"]["total_interest"],
            "interest_saved_vs_orig": plan_6800_excess["summary"]["interest_saved_vs_orig"],
            "total_true_tax_saved": plan_6800_excess["summary"]["total_true_tax_saved"],
            "total_net_after_tax_interest": plan_6800_excess["summary"]["total_net_after_tax_interest"],
            "crossed_750k_ym": plan_6800_excess["summary"]["crossed_750k_ym"],
        },
        {
            "id": "active_custom",
            "name": "Your Custom What-If Plan",
            "tag": "CustomLive",
            "rate_pct": inputs["rate_pct"],
            "term_years": inputs["term_years"],
            "monthly_pmt": active_custom["summary"]["scheduled_monthly_pmt"],
            "future_monthly_excess": inputs["future_monthly_excess"],
            "payoff_ym": active_custom["summary"]["payoff_ym"],
            "payoff_date": active_custom["summary"]["payoff_date"],
            "total_months": active_custom["summary"]["payoff_period"],
            "total_interest": active_custom["summary"]["total_interest"],
            "interest_saved_vs_orig": active_custom["summary"]["interest_saved_vs_orig"],
            "total_true_tax_saved": active_custom["summary"]["total_true_tax_saved"],
            "total_net_after_tax_interest": active_custom["summary"]["total_net_after_tax_interest"],
            "crossed_750k_ym": active_custom["summary"]["crossed_750k_ym"],
        },
    ]

    out_res = {
        "meta": sp_meta,
        "inputs": inputs,
        "defaults": defaults,
        "equity_progress": {
            "home_address": inputs.get("home_address", "Primary Residence"),
            "neighborhood": inputs.get("neighborhood", "Residential Area"),
            "property_specs": inputs.get("property_specs", "Primary Residence"),
            "purchase_date": inputs.get("purchase_date", ""),
            "home_price": inputs["home_price"],
            "purchase_price": round(float(inputs["home_price"]), 2),
            "estimated_home_value": round(est_home_val, 2),
            "unrealized_appreciation": unrealized_appreciation,
            "appreciation_pct": appreciation_pct,
            "down_payment": inputs["down_payment"],
            "original_loan": inputs["prev_loan_amount"],
            "refi_loan": inputs["loan_amount"],
            "current_balance": curr_bal,
            "paid_on_65_loan": paid_on_65,
            "paid_on_575_loan": paid_on_575,
            "total_principal_paid_to_date": total_principal_paid_to_date,
            "current_home_equity": current_home_equity,
            "equity_pct": equity_pct,
            "market_home_equity": market_home_equity,
            "market_equity_pct": market_equity_pct,
            "ltv_pct": round(100.0 - market_equity_pct, 2),
            "leveraged_return_on_down_pct": leveraged_return_on_down_pct,
            "distance_to_750k_cap": max(0.0, round(curr_bal - inputs["mortgage_debt_cap"], 2)),
        },
        "house_vs_market_analysis": house_vs_market_analysis,
        "payment_reduction": payment_reduction,
        "scenarios_comparison": scenarios_comparison,
        "equations_guide": equations_guide,
        "active_plan": active_custom,
        "real_tracker_baseline": real_tracker_baseline,
        "real_tracker_65": real_tracker_65,
        "pay_to_750k_plan": pay_to_750k_plan,
        "plan_6800_excess": plan_6800_excess,
        "actual_excess_notes_575": ex575,
        "actual_excess_notes_65": ex65,
    }
    if len(_MORTGAGE_CACHE) >= 24:
        _MORTGAGE_CACHE.clear()
    _MORTGAGE_CACHE[cache_key] = json.dumps(out_res)
    return out_res
