import copy
import json
from flask import Blueprint, jsonify, request
from backend.retirement import get_default_inputs, run_plan, normalize_filing_status
from backend.connectors import get_setting, set_setting

retirement_bp = Blueprint("retirement_bp", __name__)


def sanitize_inputs(raw_dict, defaults):
    """Sanitize and type-coerce retirement inputs against default schema."""
    result = copy.deepcopy(defaults)
    if not isinstance(raw_dict, dict):
        return result

    float_keys = [
        "gross_salary", "bonus", "annual_rsu_grant", "unvested_rsu_balance",
        "rsu_tax_withholding_pct", "state_tax_rate_pct", "pretax_401k_pct",
        "roth_401k_pct", "employer_match_pct", "employer_match_limit_pct",
        "aftertax_401k_annual", "ira_contribution", "hsa_contribution", "taxable_savings_monthly",
        "salary_growth_pct", "inflation_pct", "return_pre_pct", "return_post_pct",
        "volatility_pct", "cash_return_pct", "retirement_spending",
        "social_security_monthly", "taxable_cost_basis_pct"
    ]
    int_keys = ["age", "retirement_age", "life_expectancy", "ss_start_age"]

    for k in float_keys:
        if k in raw_dict and raw_dict[k] is not None:
            try:
                result[k] = float(raw_dict[k])
            except (ValueError, TypeError):
                pass

    for k in int_keys:
        if k in raw_dict and raw_dict[k] is not None:
            try:
                result[k] = int(raw_dict[k])
            except (ValueError, TypeError):
                pass

    if "filing_status" in raw_dict:
        result["filing_status"] = normalize_filing_status(raw_dict["filing_status"])

    if "ira_type" in raw_dict:
        val = str(raw_dict["ira_type"]).strip().lower()
        result["ira_type"] = "traditional" if val == "traditional" else "roth"

    if "hsa_coverage" in raw_dict:
        val = str(raw_dict["hsa_coverage"]).strip().lower()
        result["hsa_coverage"] = "family" if val == "family" else "self"

    if "balances" in raw_dict and isinstance(raw_dict["balances"], dict):
        b = raw_dict["balances"]
        for bk in ("pretax", "roth", "taxable", "cash"):
            if bk in b and b[bk] is not None:
                try:
                    result["balances"][bk] = max(0.0, float(b[bk]))
                except (ValueError, TypeError):
                    pass

    # Basic boundary safeguards
    result["age"] = max(18, min(100, result["age"]))
    result["retirement_age"] = max(result["age"] + 1, min(105, result["retirement_age"]))
    result["life_expectancy"] = max(result["retirement_age"] + 1, min(115, result["life_expectancy"]))
    result["ss_start_age"] = max(62, min(70, result["ss_start_age"]))
    result["gross_salary"] = max(0.0, result["gross_salary"])
    result["retirement_spending"] = max(0.0, result["retirement_spending"])

    return result


@retirement_bp.route("/api/retirement", methods=["GET"])
def api_get_retirement():
    defaults, derived = get_default_inputs()
    saved_str = get_setting("retirement_inputs")
    effective_inputs = copy.deepcopy(defaults)

    if saved_str:
        try:
            saved = json.loads(saved_str)
            effective_inputs = sanitize_inputs(saved, defaults)
        except Exception:
            pass

    try:
        plan = run_plan(effective_inputs, observed_net_annual=derived.get("observed_net_annual"), mc_runs=500)
    except Exception as e:
        return jsonify({"error": f"Failed to compute retirement plan: {str(e)}"}), 500

    return jsonify({
        "inputs": effective_inputs,
        "defaults": defaults,
        "derived": derived,
        "result": plan,
    })


@retirement_bp.route("/api/retirement", methods=["POST"])
def api_save_retirement():
    body = request.get_json(force=True) if request.is_json else {}
    defaults, derived = get_default_inputs()
    effective_inputs = sanitize_inputs(body, defaults)

    try:
        plan = run_plan(effective_inputs, observed_net_annual=derived.get("observed_net_annual"), mc_runs=500)
    except Exception as e:
        return jsonify({"error": f"Invalid retirement calculation parameters: {str(e)}"}), 400

    # Only persist after successful plan computation
    set_setting("retirement_inputs", json.dumps(effective_inputs))

    return jsonify({
        "status": "ok",
        "inputs": effective_inputs,
        "defaults": defaults,
        "derived": derived,
        "result": plan,
    })


@retirement_bp.route("/api/retirement/preview", methods=["POST"])
def api_preview_retirement():
    body = request.get_json(force=True) if request.is_json else {}
    defaults, derived = get_default_inputs()
    effective_inputs = sanitize_inputs(body, defaults)

    try:
        plan = run_plan(effective_inputs, observed_net_annual=derived.get("observed_net_annual"), mc_runs=250)
    except Exception as e:
        return jsonify({"error": f"Preview computation failed: {str(e)}"}), 400

    return jsonify({
        "preview": True,
        "inputs": effective_inputs,
        "result": plan,
    })


@retirement_bp.route("/api/retirement/reset", methods=["POST"])
def api_reset_retirement():
    set_setting("retirement_inputs", "")
    defaults, derived = get_default_inputs()
    try:
        plan = run_plan(defaults, observed_net_annual=derived.get("observed_net_annual"), mc_runs=500)
    except Exception as e:
        return jsonify({"error": f"Reset computation failed: {str(e)}"}), 500

    return jsonify({
        "status": "reset",
        "inputs": defaults,
        "defaults": defaults,
        "derived": derived,
        "result": plan,
    })
