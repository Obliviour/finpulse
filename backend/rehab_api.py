from flask import Blueprint, jsonify, request
from backend.rehab import (
    build_rehab_dashboard,
    upsert_daily_checkin,
    upsert_injury,
    delete_injury,
    record_workout_session,
    record_assessment,
)

rehab_bp = Blueprint("rehab_bp", __name__)


@rehab_bp.route("/api/rehab", methods=["GET"])
def api_get_rehab():
    try:
        return jsonify(build_rehab_dashboard())
    except Exception as e:
        return jsonify({"error": "Failed to build rehab dashboard: {0}".format(str(e))}), 500


@rehab_bp.route("/api/rehab/checkin", methods=["POST"])
def api_rehab_checkin():
    body = request.get_json(force=True) if request.is_json else {}
    try:
        res = upsert_daily_checkin(body)
        return jsonify({"status": "ok", **res})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Failed to save check-in: {0}".format(str(e))}), 500


@rehab_bp.route("/api/rehab/injuries", methods=["POST"])
def api_rehab_upsert_injury():
    body = request.get_json(force=True) if request.is_json else {}
    try:
        res = upsert_injury(body)
        return jsonify({"status": "ok", **res})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Failed to save injury: {0}".format(str(e))}), 500


@rehab_bp.route("/api/rehab/injuries/<injury_id>", methods=["DELETE"])
def api_rehab_delete_injury(injury_id):
    try:
        removed = delete_injury(injury_id)
        if not removed:
            return jsonify({"error": "Injury not found"}), 404
        return jsonify({"status": "deleted", **build_rehab_dashboard()})
    except Exception as e:
        return jsonify({"error": "Failed to delete injury: {0}".format(str(e))}), 500


@rehab_bp.route("/api/rehab/sessions", methods=["POST"])
def api_rehab_record_session():
    body = request.get_json(force=True) if request.is_json else {}
    try:
        res = record_workout_session(body)
        return jsonify({"status": "ok", **res})
    except Exception as e:
        return jsonify({"error": "Failed to log workout session: {0}".format(str(e))}), 500


@rehab_bp.route("/api/rehab/assessments", methods=["POST"])
def api_rehab_record_assessment():
    body = request.get_json(force=True) if request.is_json else {}
    try:
        res = record_assessment(body)
        return jsonify({"status": "ok", **res})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Failed to record assessment: {0}".format(str(e))}), 500
