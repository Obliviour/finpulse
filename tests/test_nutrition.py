from app import app
from backend.nutrition import build_nutrition_analysis


def test_demo_blood_labs_and_biomarker_simulator():
    """Verify synthetic Demo-mode longitudinal biomarker panels and lipid/nutrition simulation math."""
    res = build_nutrition_analysis()
    assert res["ui_copy"]["prep_partner_col"] == "Taylor's Evening Plating Twist"

    labs = res["labs"]
    history = labs["history"]
    assert len(history) >= 3

    latest = labs["latest"]
    assert latest["id"] == history[-1]["id"]
    assert latest["metrics"]["ldl"] == 94
    assert latest["metrics"]["triglycerides"] == 56

    sim = labs["ldl_simulation"]
    assert sim["current_ldl"] == 94
    assert sim["projected_ldl"] <= sim["current_ldl"]

    vt = res["vitals_and_targets"]
    assert vt["weight_lbs"] == 172.0
    assert vt["protein_g"] > 120
    assert len(res["modular_prep_system"]["chameleon_matrix"]) >= 4


def test_food_economics_and_nutrition_api_routes():
    """Verify Demo-mode SQLite food/delivery reconciliation and /api/nutrition + /kitchen endpoints."""
    client = app.test_client()

    r_page = client.get("/kitchen")
    assert r_page.status_code == 200
    assert b"kitchen.js" in r_page.data

    r_api = client.get("/api/nutrition")
    assert r_api.status_code == 200
    data = r_api.get_json()

    econ = data["food_economics"]
    assert econ["total_groceries_12m"] >= 0.0
    assert econ["total_delivery_12m"] >= 0.0
    assert len(data["air_fryer_meals"]) >= 2

    r_prev = client.post(
        "/api/nutrition/preview",
        json={"day_type": "rest", "lever_sat_fat_cap": False, "replace_delivery_meals_wk": 2.0},
    )
    assert r_prev.status_code == 200
    prev_data = r_prev.get_json()
    assert prev_data["preview"] is True
    assert prev_data["vitals_and_targets"]["active_target_kcal"] == prev_data["vitals_and_targets"]["rest_day_kcal"]
    assert prev_data["labs"]["ldl_simulation"]["projected_ldl"] > data["labs"]["ldl_simulation"]["projected_ldl"]
