import copy
import json
from flask import Blueprint, jsonify, request
from backend.nutrition import get_default_nutrition_inputs, build_nutrition_analysis
from backend.connectors import get_setting, set_setting

nutrition_bp = Blueprint("nutrition_bp", __name__)


def _get_checked_groceries():
    raw = get_setting("nutrition_checked_groceries")
    if not raw:
        return []
    try:
        arr = json.loads(raw)
        return arr if isinstance(arr, list) else []
    except Exception:
        return []


@nutrition_bp.route("/api/nutrition", methods=["GET"])
def api_get_nutrition():
    defaults = get_default_nutrition_inputs()
    saved_str = get_setting("nutrition_inputs")
    raw_inputs = copy.deepcopy(defaults)
    if saved_str:
        try:
            saved = json.loads(saved_str)
            if isinstance(saved, dict):
                raw_inputs.update(saved)
        except Exception:
            pass

    try:
        res = build_nutrition_analysis(raw_inputs)
        res["checked_groceries"] = _get_checked_groceries()
    except Exception as e:
        return jsonify({"error": "Failed to compute nutrition analysis: {0}".format(str(e))}), 500

    return jsonify(res)


@nutrition_bp.route("/api/nutrition", methods=["POST"])
def api_save_nutrition():
    body = request.get_json(force=True) if request.is_json else {}
    try:
        res = build_nutrition_analysis(body)
        set_setting("nutrition_inputs", json.dumps(res["inputs"]))
        res["checked_groceries"] = _get_checked_groceries()
    except Exception as e:
        return jsonify({"error": "Invalid nutrition parameters: {0}".format(str(e))}), 400

    return jsonify({"status": "ok", **res})


@nutrition_bp.route("/api/nutrition/preview", methods=["POST"])
def api_preview_nutrition():
    body = request.get_json(force=True) if request.is_json else {}
    try:
        res = build_nutrition_analysis(body)
        res["checked_groceries"] = _get_checked_groceries()
    except Exception as e:
        return jsonify({"error": "Preview failed: {0}".format(str(e))}), 400

    return jsonify({"preview": True, **res})


@nutrition_bp.route("/api/nutrition/reset", methods=["POST"])
def api_reset_nutrition():
    defaults = get_default_nutrition_inputs()
    set_setting("nutrition_inputs", json.dumps(defaults))
    res = build_nutrition_analysis(defaults)
    res["checked_groceries"] = _get_checked_groceries()
    return jsonify({"status": "reset", **res})


@nutrition_bp.route("/api/nutrition/grocery-check", methods=["POST"])
def api_toggle_grocery_check():
    body = request.get_json(force=True) if request.is_json else {}
    item_name = (body.get("item") or "").strip()
    clear_all = bool(body.get("clear_all", False))
    checked = set(_get_checked_groceries())
    if clear_all:
        checked = set()
    elif item_name:
        if item_name in checked:
            checked.remove(item_name)
        else:
            checked.add(item_name)
    out_list = sorted(list(checked))
    set_setting("nutrition_checked_groceries", json.dumps(out_list))
    return jsonify({"status": "ok", "checked_groceries": out_list})
