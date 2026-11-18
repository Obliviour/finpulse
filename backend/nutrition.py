"""Clinical Lab Longitudinal Analyzer, Activity Macro Calculator, Home Kitchen System, and Food ROI.

All personal biomarkers, recipes, cafeteria guides, and clinic details are loaded at runtime
via `backend.profile_loader.get_nutrition_profile()`:
- Private local runs load `private/profile.json`.
- Public / demo runs load unrelated synthetic demo data from `backend/demo_profile.json`.
"""
import copy
from backend.db import get_connection
from backend.analytics.common import add_months
from backend.profile_loader import get_nutrition_profile


def get_default_nutrition_inputs():
    np = get_nutrition_profile()
    return copy.deepcopy(np.get("default_inputs") or {
        "height_cm": 178.0,
        "wingspan_in": 70.0,
        "ape_index_plus_in": 0.0,
        "weight_lbs": 165.0,
        "target_weight_lbs": 162.0,
        "age": 34,
        "sex": "male",
        "climbing_sessions_wk": 3,
        "other_training_days_wk": 2,
        "goal_mode": "recomp_performance",
        "day_type": "climbing",
        "lever_sat_fat_cap": True,
        "lever_soluble_fiber": True,
        "lever_soy_marine_swap": True,
        "lever_nuts_sterols_evoo": True,
        "replace_delivery_meals_wk": 1.5,
        "replace_dineout_meals_wk": 1.0,
        "home_meal_cost_for_two": 12.0,
    })


def build_nutrition_analysis(raw_inputs=None):
    np = get_nutrition_profile()
    defaults = get_default_nutrition_inputs()
    inputs = copy.deepcopy(defaults)
    if isinstance(raw_inputs, dict):
        for k, v in raw_inputs.items():
            if k in inputs and v is not None:
                inputs[k] = v

    weight_lbs = float(inputs.get("weight_lbs") or defaults.get("weight_lbs", 165.0))
    target_weight_lbs = float(inputs.get("target_weight_lbs") or defaults.get("target_weight_lbs", 160.0))
    weight_kg = round(weight_lbs / 2.20462, 1)
    height_cm = float(inputs.get("height_cm") or defaults.get("height_cm", 178.0))
    ape_index_plus_in = float(inputs.get("ape_index_plus_in") or 0.0)
    age = int(inputs.get("age") or defaults.get("age", 34))
    goal_mode = str(inputs.get("goal_mode") or "recomp_performance")
    day_type = str(inputs.get("day_type") or "climbing")

    sex_offset = -161.0 if str(inputs.get("sex", "male")).lower().startswith("f") else 5.0
    bmr = round(10.0 * weight_kg + 6.25 * height_cm - 5.0 * age + sex_offset)
    neat_mult = float(np.get("neat_multiplier") or 1.40)
    base_tdee = round(bmr * neat_mult)

    act_kcal = np.get("activity_kcal") or {"climbing": 420, "training": 300, "rest": 0}
    raw_climbing_tdee = base_tdee + int(act_kcal.get("climbing", 420))
    raw_training_tdee = base_tdee + int(act_kcal.get("training", 300))
    raw_rest_tdee = base_tdee + int(act_kcal.get("rest", 0))

    deltas = np.get("goal_kcal_deltas") or {
        "recomp_performance": (-180, -240, -280),
        "lean_send": (-320, -350, -380),
        "muscle_build": (180, 200, 50),
    }
    d_tuple = deltas.get(goal_mode, deltas.get("recomp_performance", (-180, -240, -280)))
    climbing_day_kcal = raw_climbing_tdee + int(d_tuple[0])
    training_day_kcal = raw_training_tdee + int(d_tuple[1])
    rest_day_kcal = raw_rest_tdee + int(d_tuple[2])

    if day_type == "climbing":
        target_calories = climbing_day_kcal
    elif day_type == "training":
        target_calories = training_day_kcal
    else:
        target_calories = rest_day_kcal

    prot_per_kg = float(np.get("protein_g_per_kg") or 2.0)
    protein_g = round(weight_kg * prot_per_kg)
    sat_fat_cap_g = round((target_calories * 0.046) / 9.0, 1)
    total_fat_g = round((target_calories * 0.26) / 9.0)
    carbs_g = round((target_calories - (protein_g * 4.0) - (total_fat_g * 9.0)) / 4.0)

    slot_specs = np.get("meal_calorie_split_ratios") or []
    meal_calorie_split = [
        {
            "slot": s.get("slot", "Meal"),
            "calories": round(target_calories * float(s.get("ratio", 0.25))),
            "protein_g": s.get("protein_g", 30),
            "soluble_fiber_g": s.get("soluble_fiber_g", 4.0),
            "sat_fat_max_g": s.get("sat_fat_max_g", 3.0),
            "note": s.get("note", ""),
        }
        for s in slot_specs
    ]

    bio = np.get("baseline_biomarkers") or {}
    current_ldl = int(bio.get("current_ldl", 95))
    current_non_hdl = int(bio.get("current_non_hdl", 110))
    current_trig = int(bio.get("current_trig", 65))
    current_vit_d = int(bio.get("current_vit_d", 42))

    pct_reduction = 0.0
    active_levers = []
    for lv in (bio.get("ldl_levers") or []):
        if inputs.get(lv.get("input_key", ""), True):
            dp = float(lv.get("drop_pct", 0.05))
            pct_reduction += dp
            active_levers.append({
                "name": lv.get("name", "Dietary Lever"),
                "ldl_drop_pct": int(round(dp * 100)),
                "mg_dl_drop": round(current_ldl * dp),
            })

    pct_reduction = min(0.32, pct_reduction)
    projected_ldl = round(current_ldl * (1.0 - pct_reduction))
    projected_non_hdl = round(projected_ldl + 15)

    # Query Live Food & Delivery Transactions from active SQLite DB (works for both Private & Demo DBs)
    conn = get_connection()
    max_row = conn.execute("SELECT MAX(substr(tx_date, 1, 7)) AS max_ym FROM transactions").fetchone()
    max_ym = max_row["max_ym"] if max_row and max_row["max_ym"] else "2026-10"
    start_ym = add_months(max_ym, -11)

    food_txs = [
        dict(r)
        for r in conn.execute(
            """SELECT id, tx_date, substr(tx_date, 1, 7) AS ym,
                      coalesce(merchant, description) AS merchant,
                      description, category, abs(amount) AS amount
               FROM transactions
               WHERE tx_type = 'expense'
                 AND category IN ('Dining & Restaurants', 'Groceries')
                 AND substr(tx_date, 1, 7) BETWEEN ? AND ?
               ORDER BY tx_date DESC, amount DESC""",
            (start_ym, max_ym),
        ).fetchall()
    ]
    conn.close()

    delivery_txs = []
    dineout_txs = []
    grocery_txs = []
    monthly_food = {}
    merchant_rollup = {}

    for tx in food_txs:
        ym = tx["ym"]
        m_name = tx["merchant"] or ""
        m_up = m_name.upper()
        cat = tx["category"]
        amt = round(float(tx["amount"] or 0.0), 2)

        m_bucket = monthly_food.setdefault(
            ym,
            {"ym": ym, "delivery": 0.0, "dine_out": 0.0, "groceries": 0.0, "total": 0.0, "delivery_count": 0},
        )
        m_bucket["total"] = round(m_bucket["total"] + amt, 2)

        if cat == "Groceries":
            grocery_txs.append(tx)
            m_bucket["groceries"] = round(m_bucket["groceries"] + amt, 2)
            sub_type = "groceries"
        elif "UBER EATS" in m_up or "DOORDASH" in m_up or "GRUBHUB" in m_up or "POSTMATES" in m_up:
            delivery_txs.append(tx)
            m_bucket["delivery"] = round(m_bucket["delivery"] + amt, 2)
            m_bucket["delivery_count"] += 1
            sub_type = "delivery"
        else:
            dineout_txs.append(tx)
            m_bucket["dine_out"] = round(m_bucket["dine_out"] + amt, 2)
            sub_type = "dine_out"

        m_agg = merchant_rollup.setdefault(
            m_name,
            {"merchant": m_name, "category": cat, "sub_type": sub_type, "total": 0.0, "count": 0, "max_tx": 0.0},
        )
        m_agg["total"] = round(m_agg["total"] + amt, 2)
        m_agg["count"] += 1
        if amt > m_agg["max_tx"]:
            m_agg["max_tx"] = amt

    total_delivery = round(sum(x["amount"] for x in delivery_txs), 2)
    total_dineout = round(sum(x["amount"] for x in dineout_txs), 2)
    total_dining_all = round(total_delivery + total_dineout, 2)
    total_groceries = round(sum(x["amount"] for x in grocery_txs), 2)
    total_food_all = round(total_dining_all + total_groceries, 2)

    delivery_count = len(delivery_txs)
    avg_delivery_order = round(total_delivery / max(1, delivery_count), 2)
    orders_over_100 = [x for x in delivery_txs if x["amount"] >= 100.0]
    orders_over_80 = [x for x in delivery_txs if x["amount"] >= 80.0]

    rep_deliv_wk = float(inputs.get("replace_delivery_meals_wk") or 1.5)
    rep_dine_wk = float(inputs.get("replace_dineout_meals_wk") or 1.0)
    home_cost_two = float(inputs.get("home_meal_cost_for_two") or 12.0)

    avg_dineout_order = round(total_dineout / max(1, len(dineout_txs)), 2)
    weekly_delivery_saved = max(0.0, rep_deliv_wk * max(0.0, avg_delivery_order - home_cost_two))
    weekly_dineout_saved = max(0.0, rep_dine_wk * max(0.0, avg_dineout_order - home_cost_two))
    annual_cash_saved = round((weekly_delivery_saved + weekly_dineout_saved) * 52.0, 2)
    monthly_cash_saved = round(annual_cash_saved / 12.0, 2)

    r = 0.07
    n_yrs = int(bio.get("fire_compounding_years") or 10)
    compounded_savings = round(annual_cash_saved * (((1.0 + r) ** n_yrs - 1.0) / r), 2)
    goal_amt = float(bio.get("roi_goal_amount") or 15000.0)
    pct_of_goal = round((annual_cash_saved / goal_amt) * 100.0, 1) if goal_amt > 0 else 0.0

    meals_swapped_yr = round((rep_deliv_wk + rep_dine_wk) * 52.0)
    sat_fat_avoided_grams_yr = round(meals_swapped_yr * (26.0 - 2.4))

    labs_hist = copy.deepcopy(np.get("lab_reports_history") or [])
    latest_lab = labs_hist[-1] if labs_hist else {"metrics": {}, "flags": []}

    return {
        "inputs": inputs,
        "ui_copy": copy.deepcopy(np.get("ui_copy") or {}),
        "vitals_and_targets": {
            "height_display": np.get("height_display", "{0:.1f} cm".format(height_cm)),
            "wingspan_display": np.get("wingspan_display", ""),
            "ape_index_plus_in": ape_index_plus_in,
            "weight_lbs": weight_lbs,
            "target_weight_lbs": target_weight_lbs,
            "weight_kg": weight_kg,
            "bmi": round(weight_kg / ((height_cm / 100.0) ** 2), 2) if height_cm > 0 else 22.0,
            "bmr_kcal": bmr,
            "climbing_day_kcal": climbing_day_kcal,
            "training_day_kcal": training_day_kcal,
            "rest_day_kcal": rest_day_kcal,
            "active_target_kcal": target_calories,
            "protein_g": protein_g,
            "protein_per_kg": prot_per_kg,
            "carbs_g": carbs_g,
            "total_fat_g": total_fat_g,
            "sat_fat_cap_g": sat_fat_cap_g,
            "soluble_fiber_target_g": 14,
            "total_fiber_target_g": 42,
            "vitamin_d_target_iu": 2000 if current_vit_d >= 35 else 4000,
            "training_split_summary": np.get("training_split_summary", "5–6 Days/Wk Training"),
            "meal_calorie_split": meal_calorie_split,
        },
        "labs": {
            "folder_url": np.get("lab_folder_url", ""),
            "history": labs_hist,
            "latest": latest_lab,
            "ldl_simulation": {
                "current_ldl": current_ldl,
                "current_non_hdl": current_non_hdl,
                "current_trig": current_trig,
                "current_vit_d": current_vit_d,
                "projected_ldl": projected_ldl,
                "projected_non_hdl": projected_non_hdl,
                "total_reduction_pct": round(pct_reduction * 100, 1),
                "mg_dl_reduction": current_ldl - projected_ldl,
                "active_levers": active_levers,
            },
            "vitamin_d_protocol": copy.deepcopy(bio.get("vitamin_d_protocol") or {}),
            "clinical_takeaways": copy.deepcopy(bio.get("clinical_takeaways") or []),
        },
        "food_economics": {
            "total_food_12m": total_food_all,
            "total_dining_12m": total_dining_all,
            "total_delivery_12m": total_delivery,
            "total_dineout_12m": total_dineout,
            "total_groceries_12m": total_groceries,
            "dining_to_grocery_ratio": round(total_dining_all / max(1.0, total_groceries), 2),
            "delivery_order_count": delivery_count,
            "avg_delivery_order": avg_delivery_order,
            "max_delivery_order": max([x["amount"] for x in delivery_txs] or [0.0]),
            "orders_over_100_count": len(orders_over_100),
            "orders_over_80_count": len(orders_over_80),
            "top_delivery_orders": sorted(delivery_txs, key=lambda x: x["amount"], reverse=True)[:12],
            "monthly_series": [monthly_food[k] for k in sorted(monthly_food.keys())],
            "top_merchants": sorted(merchant_rollup.values(), key=lambda x: x["total"], reverse=True)[:18],
            "roi_simulation": {
                "replace_delivery_meals_wk": rep_deliv_wk,
                "replace_dineout_meals_wk": rep_dine_wk,
                "home_meal_cost_for_two": home_cost_two,
                "monthly_cash_saved": monthly_cash_saved,
                "annual_cash_saved": annual_cash_saved,
                "compounded_savings": compounded_savings,
                "compounded_years": n_yrs,
                "pct_of_goal": pct_of_goal,
                "roi_goal_label": bio.get("roi_goal_label", "% of annual savings target"),
                "meals_swapped_yr": meals_swapped_yr,
                "sat_fat_avoided_grams_yr": sat_fat_avoided_grams_yr,
            },
        },
        "air_fryer_meals": copy.deepcopy(np.get("air_fryer_meals") or []),
        "modular_prep_system": copy.deepcopy(np.get("modular_prep_system") or {}),
        "breakfast_protocol": copy.deepcopy(np.get("breakfast_protocol") or {}),
        "workplace_cafe_playbook": copy.deepcopy(np.get("workplace_cafe_playbook") or {}),
        "night_snack_matrix": copy.deepcopy(np.get("night_snack_matrix") or {}),
        "grocery_store_matrix": copy.deepcopy(np.get("grocery_store_matrix") or []),
    }
