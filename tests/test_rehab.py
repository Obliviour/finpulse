"""Public Unit & API Tests for the Climbing Injury Rehab, Guided Timer & Diagnostics Module."""
from app import app
from backend.rehab import ASSESSMENT_CATALOG, EXERCISES, PROTOCOLS


def test_rehab_dashboard_demo_get():
    client = app.test_client()
    r = client.get("/api/rehab")
    assert r.status_code == 200
    d = r.get_json()
    assert d["mode"] == "demo"
    assert len(d["injuries"]) >= 2
    assert d["overall_readiness"]["active_count"] >= 2
    assert d["today_workout"]["id"] == "adaptive_today"
    assert len(d["today_workout"]["exercises"]) >= 2
    assert len(d["protocols"]) >= len(PROTOCOLS)
    assert len(d["exercises"]) == len(EXERCISES)
    assert d["assessments"]["total_tests"] == len(ASSESSMENT_CATALOG)


def test_rehab_daily_checkin_triage_escalation():
    client = app.test_client()
    base = client.get("/api/rehab").get_json()
    target_id = base["injuries"][0]["id"]

    # High load pain + swelling triggers RED triage
    r_red = client.post(
        "/api/rehab/checkin",
        json={
            "injury_id": target_id,
            "log_date": "2026-11-20",
            "pain_rest": 4,
            "pain_load": 7,
            "morning_stiffness": 6,
            "swelling": 2,
            "warmup_minutes": 5,
            "climbed_today": 1,
            "notes": "Flared up after steep session.",
        },
    )
    assert r_red.status_code == 200
    d_red = r_red.get_json()
    inj_red = next(i for i in d_red["injuries"] if i["id"] == target_id)
    assert inj_red["triage"]["status_color"] == "red"
    assert d_red["overall_readiness"]["status_color"] == "red"

    # Low pain & zero swelling clears back down
    r_calm = client.post(
        "/api/rehab/checkin",
        json={
            "injury_id": target_id,
            "log_date": "2026-11-21",
            "pain_rest": 0,
            "pain_load": 1,
            "morning_stiffness": 1,
            "swelling": 0,
            "warmup_minutes": 12,
            "climbed_today": 0,
            "notes": "Settled cleanly after isometric protocol.",
        },
    )
    assert r_calm.status_code == 200
    d_calm = r_calm.get_json()
    inj_calm = next(i for i in d_calm["injuries"] if i["id"] == target_id)
    assert inj_calm["triage"]["status_color"] in ("amber", "green")


def test_rehab_injury_crud_session_and_assessment():
    client = app.test_client()

    # Create custom injury
    r_create = client.post(
        "/api/rehab/injuries",
        json={
            "title": "Left Wrist TFCC Irritation",
            "body_region": "fingers",
            "side": "left",
            "phase": "acute",
            "symptoms": "Ulnar wrist pinch on slopers.",
        },
    )
    assert r_create.status_code == 200
    d_create = r_create.get_json()
    created = next(i for i in d_create["injuries"] if i["title"] == "Left Wrist TFCC Irritation")

    # Log completed workout timer session
    r_sess = client.post(
        "/api/rehab/sessions",
        json={
            "session_date": "2026-11-20",
            "protocol_id": "pre_climb_warmup",
            "protocol_title": "10-Min Pre-Climb Full-Chain Primer",
            "duration_sec": 620,
            "exercises_completed": 5,
            "total_exercises": 5,
            "post_pain": 1,
            "notes": "Warm-up unlocked hamstring stiffness.",
        },
    )
    assert r_sess.status_code == 200
    assert any(s["protocol_id"] == "pre_climb_warmup" for s in r_sess.get_json()["workout_sessions"])

    # Record L/R asymmetry mobility screen
    r_assess = client.post(
        "/api/rehab/assessments",
        json={
            "assessed_date": "2026-11-20",
            "test_id": "hamstring_aslr",
            "left_val": 62.0,
            "right_val": 82.0,
            "notes": "Left hamstring slower to warm up.",
        },
    )
    assert r_assess.status_code == 200
    d_assess = r_assess.get_json()
    aslr = next(a for a in d_assess["assessments"]["catalog"] if a["id"] == "hamstring_aslr")
    assert aslr["evaluation"]["asymmetry_pct"] == 24.4
    assert aslr["evaluation"]["weak_side"] == "left"
    assert aslr["evaluation"]["status"] == "priority_gap"

    # Delete custom injury
    r_del = client.delete(f"/api/rehab/injuries/{created['id']}")
    assert r_del.status_code == 200
    assert all(i["id"] != created["id"] for i in r_del.get_json()["injuries"])
