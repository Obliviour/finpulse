import copy
import json
import os
import re
import subprocess
from datetime import datetime
from flask import Blueprint, jsonify, request
from backend.mortgage import get_default_mortgage_inputs, run_mortgage_analysis, get_spreadsheet_meta
from backend.connectors import get_setting, set_setting
from backend.db import get_connection, bump_db_stamp

mortgage_bp = Blueprint("mortgage_bp", __name__)


def _parse_currency_float(val):
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s or s == "-":
        return 0.0
    s = re.sub(r"[^0-9.\-]", "", s)
    try:
        return float(s) if s else 0.0
    except ValueError:
        return 0.0


def _parse_sheet_date_to_ym(date_str):
    s = str(date_str or "").strip()
    if not s:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m")
        except ValueError:
            pass
    return None


@mortgage_bp.route("/api/mortgage", methods=["GET"])
def api_get_mortgage():
    defaults = get_default_mortgage_inputs()
    saved_str = get_setting("mortgage_inputs")
    raw_inputs = copy.deepcopy(defaults)
    if saved_str:
        try:
            saved = json.loads(saved_str)
            if isinstance(saved, dict):
                raw_inputs.update(saved)
        except Exception:
            pass

    try:
        res = run_mortgage_analysis(raw_inputs)
    except Exception as e:
        return jsonify({"error": "Failed to compute mortgage analysis: {0}".format(str(e))}), 500

    return jsonify(res)


@mortgage_bp.route("/api/mortgage", methods=["POST"])
def api_save_mortgage():
    body = request.get_json(force=True) if request.is_json else {}
    try:
        res = run_mortgage_analysis(body)
    except Exception as e:
        return jsonify({"error": "Invalid mortgage parameters: {0}".format(str(e))}), 400

    set_setting("mortgage_inputs", json.dumps(res["inputs"]))
    try:
        conn = get_connection()
        est_val = float(res["inputs"].get("estimated_home_value") or 0.0)
        buy_price = float(res["inputs"].get("home_price") or est_val)
        conn.execute(
            "UPDATE accounts SET balance = ?, credit_limit = ? WHERE account_type = 'real_estate'",
            (round(est_val, 2), round(buy_price, 2)),
        )
        conn.commit()
        conn.close()
        bump_db_stamp()
    except Exception:
        pass
    return jsonify({"status": "ok", **res})


@mortgage_bp.route("/api/mortgage/preview", methods=["POST"])
def api_preview_mortgage():
    body = request.get_json(force=True) if request.is_json else {}
    try:
        res = run_mortgage_analysis(body)
    except Exception as e:
        return jsonify({"error": "Preview failed: {0}".format(str(e))}), 400

    return jsonify({"preview": True, **res})


@mortgage_bp.route("/api/mortgage/reset", methods=["POST"])
def api_reset_mortgage():
    set_setting("mortgage_inputs", "")
    res = run_mortgage_analysis(get_default_mortgage_inputs())
    try:
        conn = get_connection()
        secular_val = float(res["inputs"].get("secular_home_value") or res["inputs"].get("estimated_home_value") or 545000.0)
        buy_val = float(res["inputs"].get("home_price") or 510000.0)
        conn.execute(
            "UPDATE accounts SET balance = ?, credit_limit = ? WHERE account_type = 'real_estate'",
            (round(secular_val, 2), round(buy_val, 2)),
        )
        conn.commit()
        conn.close()
        bump_db_stamp()
    except Exception:
        pass
    return jsonify({"status": "reset", **res})


@mortgage_bp.route("/api/mortgage/sync-gsheets", methods=["POST"])
def api_sync_mortgage_from_gsheets():
    """Pull latest excess payments and loan parameters when a Google Sheet ID is configured in profile."""
    sheet_id = (get_spreadsheet_meta().get("spreadsheet_id") or "").strip()
    if not sheet_id:
        return jsonify({"error": "No spreadsheet_id configured in active profile."}), 400
    appdata = os.environ.get("ANTIGRAVITY_APP_DATA_DIR") or os.path.join(os.path.expanduser("~"), ".gemini", "antigravity")
    bin_dir = os.path.join(appdata, "plugin_data", "gsheets", "bin")
    exe_path = None
    if os.path.isdir(bin_dir):
        for fn in os.listdir(bin_dir):
            if fn.startswith("gsheets") and fn.endswith(".exe"):
                exe_path = os.path.join(bin_dir, fn)
                break
    if not exe_path:
        exe_path = "gsheets"

    defaults = get_default_mortgage_inputs()
    saved_str = get_setting("mortgage_inputs")
    if saved_str:
        try:
            saved = json.loads(saved_str)
            if isinstance(saved, dict):
                defaults.update(saved)
        except Exception:
            pass

    try:
        # Read 'Real Tracker'!B3:G60
        proc = subprocess.run(
            [exe_path, "readonly", "read", sheet_id, "'Real Tracker'!B3:G60", "--json"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
        )
        if proc.returncode == 0:
            rows = json.loads(proc.stdout.decode("utf-8", errors="replace"))
            new_excess_575 = {}
            for r in rows[6:]:  # Starting at row 9 (index 6 in B3:G60)
                if len(r) >= 6:
                    ym = _parse_sheet_date_to_ym(r[0])
                    ex_val = _parse_currency_float(r[5])
                    if ym and ex_val > 0:
                        new_excess_575[ym] = round(ex_val, 2)
            if new_excess_575:
                defaults["historical_excess_575"] = new_excess_575

        res = run_mortgage_analysis(defaults)
        set_setting("mortgage_inputs", json.dumps(res["inputs"]))
        return jsonify({"status": "synced", **res})
    except Exception as e:
        res = run_mortgage_analysis(defaults)
        return jsonify({"status": "cached", "sync_warning": str(e), **res})
