import os
import io
import gzip
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from backend.db import init_db, get_connection, compute_tx_hash, bump_db_stamp, IMPORTS_DIR
from backend.seed_demo import seed_demo_data_if_empty, clear_demo_data
from backend.analytics import get_dashboard_summary, get_category_detail, get_month_detail, get_networth_history
from backend.retirement_api import retirement_bp
from backend.mortgage_api import mortgage_bp
from backend.nutrition_api import nutrition_bp
from backend.ingestor import (
    ingest_file_content,
    ingest_pdf_bytes,
    scan_watch_folder,
    scan_user_downloads_folder,
    ensure_institution_folders,
    classify_asset_class,
)
from backend.categorizer import categorize_transaction, recategorize_all_transactions
from backend.profile_loader import (
    get_household_profile,
    get_partner_offset_config,
    get_reflections_profile,
)
from backend.connectors import (
    sync_live_market_prices,
    sync_live_market_history,
    build_portfolio_market_history,
    sync_simplefin,
    sync_teller,
    get_setting,
    set_setting,
    get_teller_enrollments,
    get_teller_cert_paths,
    ensure_certs_dir,
    CERTS_DIR,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.register_blueprint(retirement_bp)
app.register_blueprint(mortgage_bp)
app.register_blueprint(nutrition_bp)


_GZIP_STATIC_CACHE = {}


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    if request.method in ("POST", "PATCH", "PUT", "DELETE") and not request.path.endswith("/preview"):
        bump_db_stamp()

    accept_enc = (request.headers.get("Accept-Encoding") or "").lower()
    if (
        "gzip" in accept_enc
        and 200 <= response.status_code < 300
        and "Content-Encoding" not in response.headers
    ):
        if response.direct_passthrough:
            response.direct_passthrough = False
        body = response.get_data()
        if len(body) >= 1024:
            if request.path in ("/app.js", "/kitchen.js", "/", "/index.html"):
                cache_k = (request.path, len(body), body[:128], body[-128:])
                compressed = _GZIP_STATIC_CACHE.get(cache_k)
                if compressed is None:
                    compressed = gzip.compress(body, compresslevel=5)
                    if len(_GZIP_STATIC_CACHE) >= 8:
                        _GZIP_STATIC_CACHE.clear()
                    _GZIP_STATIC_CACHE[cache_k] = compressed
            else:
                compressed = gzip.compress(body, compresslevel=5)
            response.set_data(compressed)
            response.headers["Content-Encoding"] = "gzip"
            response.headers["Content-Length"] = str(len(compressed))
            response.headers["Vary"] = "Accept-Encoding"
    return response


@app.route("/")
@app.route("/kitchen")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/api/dashboard", methods=["GET"])
def api_dashboard():
    month = request.args.get("month")
    institution = request.args.get("institution")
    data = get_dashboard_summary(selected_month=month, institution_filter=institution)
    return jsonify(data)


@app.route("/api/category/<path:category>", methods=["GET"])
def api_category_detail(category):
    month = request.args.get("month")
    institution = request.args.get("institution")
    data = get_category_detail(category, selected_month=month, institution_filter=institution)
    return jsonify(data)


@app.route("/api/month-detail/<ym>", methods=["GET"])
def api_month_detail(ym):
    institution = request.args.get("institution")
    data = get_month_detail(ym, institution_filter=institution)
    return jsonify(data)


@app.route("/api/networth/history", methods=["GET"])
def api_networth_history():
    months = int(request.args.get("months", 12))
    return jsonify(get_networth_history(months=months))


@app.route("/api/transactions", methods=["GET"])
def api_get_transactions():
    month = request.args.get("month", "")
    category = request.args.get("category", "")
    institution = request.args.get("institution", "")
    account_id = request.args.get("account_id", "")
    tx_type = request.args.get("tx_type", "")
    search = request.args.get("search", "").strip()
    limit = int(request.args.get("limit", 300))

    conn = get_connection()
    query = """
        SELECT t.*, a.name as account_name, a.institution, a.account_type
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        WHERE 1=1
    """
    params = []

    if month and month != "All":
        query += " AND substr(t.tx_date, 1, 7) = ? "
        params.append(month)
    if category and category != "All":
        query += " AND t.category = ? "
        params.append(category)
    if institution and institution != "All":
        query += " AND a.institution = ? "
        params.append(institution)
    if account_id and account_id != "All":
        query += " AND t.account_id = ? "
        params.append(int(account_id))
    if tx_type and tx_type != "All":
        query += " AND t.tx_type = ? "
        params.append(tx_type)
    if search:
        query += " AND (UPPER(t.merchant) LIKE ? OR UPPER(t.description) LIKE ? OR UPPER(t.category) LIKE ?) "
        like_q = "%{0}%".format(search.upper())
        params.extend([like_q, like_q, like_q])

    query += " ORDER BY t.tx_date DESC, t.id DESC LIMIT ? "
    params.append(limit)

    rows = [dict(r) for r in conn.execute(query, params).fetchall()]
    conn.close()
    return jsonify({"transactions": rows, "count": len(rows)})


@app.route("/api/transactions", methods=["POST"])
def api_add_transaction():
    body = request.get_json(force=True)
    account_id = int(body.get("account_id"))
    tx_date = body.get("tx_date") or datetime.now().strftime("%Y-%m-%d")
    description = body.get("description", "").strip()
    amount = float(body.get("amount", 0.0))
    category = body.get("category", "").strip()
    tx_type = body.get("tx_type", "expense")

    conn = get_connection()
    acc = conn.execute("SELECT account_type FROM accounts WHERE id = ?", (account_id,)).fetchone()
    acc_type = acc["account_type"] if acc else "credit_card"

    auto_merch, auto_cat, auto_type = categorize_transaction(description, category, amount, acc_type)
    final_merch = body.get("merchant", "").strip() or auto_merch
    final_cat = category or auto_cat
    final_type = tx_type or auto_type

    dedup = compute_tx_hash(account_id, tx_date, description, amount)
    conn.execute(
        """
        INSERT OR REPLACE INTO transactions
        (account_id, tx_date, description, merchant, amount, tx_type, category, raw_source, dedup_hash, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, 0)
        """,
        (account_id, tx_date, description, final_merch, round(amount, 2), final_type, final_cat, dedup),
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route("/api/transactions/<int:tx_id>", methods=["PATCH", "DELETE"])
def api_modify_transaction(tx_id):
    conn = get_connection()
    if request.method == "DELETE":
        conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "deleted"})

    body = request.get_json(force=True)
    category = body.get("category")
    merchant = body.get("merchant")
    tx_type = body.get("tx_type")
    create_rule = body.get("create_rule", False)

    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Not found"}), 404

    new_cat = category if category is not None else row["category"]
    new_merch = merchant if merchant is not None else row["merchant"]
    new_type = tx_type if tx_type is not None else row["tx_type"]

    conn.execute(
        "UPDATE transactions SET category = ?, merchant = ?, tx_type = ? WHERE id = ?",
        (new_cat, new_merch, new_type, tx_id),
    )

    if create_rule and new_merch:
        keyword = new_merch.upper()
        conn.execute(
            "INSERT OR REPLACE INTO category_rules (keyword, merchant_name, category, tx_type, priority) VALUES (?, ?, ?, ?, 75)",
            (keyword, new_merch, new_cat, new_type),
        )

    conn.commit()
    conn.close()
    if create_rule:
        recategorize_all_transactions()
    return jsonify({"status": "updated"})


@app.route("/api/rules", methods=["GET", "POST"])
def api_rules():
    conn = get_connection()
    if request.method == "GET":
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM category_rules ORDER BY priority DESC, keyword ASC"
            ).fetchall()
        ]
        conn.close()
        return jsonify({"rules": rows})

    body = request.get_json(force=True)
    keyword = (body.get("keyword") or "").strip().upper()
    merchant_name = (body.get("merchant_name") or keyword.title()).strip()
    category = (body.get("category") or "Shopping").strip()
    tx_type = (body.get("tx_type") or "expense").strip()
    priority = int(body.get("priority", 70))

    if not keyword:
        conn.close()
        return jsonify({"error": "Keyword required"}), 400

    conn.execute(
        "INSERT OR REPLACE INTO category_rules (keyword, merchant_name, category, tx_type, priority) VALUES (?, ?, ?, ?, ?)",
        (keyword, merchant_name, category, tx_type, priority),
    )
    conn.commit()
    conn.close()

    updated_count = recategorize_all_transactions()
    return jsonify({"status": "ok", "transactions_updated": updated_count})


@app.route("/api/rules/<int:rule_id>", methods=["DELETE"])
def api_delete_rule(rule_id):
    conn = get_connection()
    conn.execute("DELETE FROM category_rules WHERE id = ?", (rule_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "deleted"})


@app.route("/api/budgets", methods=["GET", "POST"])
def api_budgets():
    conn = get_connection()
    if request.method == "GET":
        rows = [dict(r) for r in conn.execute("SELECT * FROM budgets ORDER BY monthly_limit DESC").fetchall()]
        conn.close()
        return jsonify({"budgets": rows})

    body = request.get_json(force=True)
    category = (body.get("category") or "").strip()
    try:
        monthly_limit = float(body.get("monthly_limit") or 0.0)
    except (ValueError, TypeError):
        monthly_limit = 0.0
    if category:
        conn.execute(
            "INSERT OR REPLACE INTO budgets (category, monthly_limit) VALUES (?, ?)",
            (category, round(monthly_limit, 2)),
        )
        conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


ESSENTIAL_NEED_CATEGORIES = {"Housing", "Groceries", "Automotive & Gas", "Home & Utilities"}


def _essential_need_merchants():
    return set(get_reflections_profile().get("essential_need_merchants") or [
        "IRS Tax Payment", "Property Tax", "Electric Utility", "Internet Service",
        "Whole Foods Market", "Trader Joe's", "Costco Wholesale",
    ])


def _default_bucket_for(merchant, category, total_spend):
    if merchant in _essential_need_merchants() or category in ("Housing", "Groceries", "Automotive & Gas", "Subscriptions"):
        return "need"
    if category == "Entertainment" and total_spend < 1500:
        return "worth_it"
    if category == "Home & Utilities" and total_spend < 1000:
        return "need"
    return "questionable"


def _classify_major_project(merchant, category, amount):
    m_up = (merchant or "").upper()
    for pat in (get_reflections_profile().get("project_patterns") or []):
        kws = [k.upper() for k in (pat.get("keywords") or [])]
        cats = pat.get("categories") or []
        if (kws and any(k in m_up for k in kws)) or (cats and category in cats):
            return pat.get("group", "Major Project"), pat.get("verdict", "worth_it")
    if "HOA" in m_up:
        return "HOA Special Assessments", "forced_need"
    if "IRS" in m_up or "PROPERTY TAX" in m_up:
        return "Taxes & Statutory", "forced_need"
    if category == "Home & Utilities":
        return "Home Improvement & Upgrades", "worth_it"
    if category == "Travel & Transit" or "AIRBNB" in m_up:
        return "Major Trips & Vacation Lodging", "worth_it"
    return "Other Big-Ticket Purchases", "skip_next_time"


def _ensure_reflection_tables(conn):
    conn.execute(
        """CREATE TABLE IF NOT EXISTS spending_reflections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant TEXT NOT NULL UNIQUE,
            bucket TEXT NOT NULL DEFAULT 'questionable',
            feeling TEXT DEFAULT '',
            why_bought TEXT DEFAULT '',
            monthly_target REAL DEFAULT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS major_purchase_verdicts (
            tx_id INTEGER PRIMARY KEY,
            verdict TEXT NOT NULL DEFAULT 'worth_it',
            project_group TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS planned_purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Home & Upgrades',
            estimated_cost REAL NOT NULL DEFAULT 1000.0,
            target_ym TEXT NOT NULL DEFAULT '2026-12',
            priority TEXT NOT NULL DEFAULT 'medium',
            notes TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'planned',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    cnt = conn.execute("SELECT COUNT(*) AS c FROM planned_purchases").fetchone()["c"]
    if cnt == 0:
        seed_plans = get_reflections_profile().get("planned_purchases_seed") or []
        if seed_plans:
            conn.executemany(
                "INSERT INTO planned_purchases (name, category, estimated_cost, target_ym, priority, notes, status) VALUES (?,?,?,?,?,?,?)",
                seed_plans,
            )
            conn.commit()


@app.route("/api/reflections", methods=["GET", "POST"])
def api_reflections():
    conn = get_connection()
    _ensure_reflection_tables(conn)
    if request.method == "POST":
        body = request.get_json(force=True)
        items = body.get("items") if isinstance(body.get("items"), list) else [body]
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        for item in items:
            merch = (item.get("merchant") or "").strip()
            if not merch:
                continue
            existing = conn.execute(
                "SELECT * FROM spending_reflections WHERE merchant = ?", (merch,)
            ).fetchone()
            bucket = item.get("bucket") or (existing["bucket"] if existing else "questionable")
            feeling = item.get("feeling") if item.get("feeling") is not None else (existing["feeling"] if existing else "")
            why_bought = item.get("why_bought") if item.get("why_bought") is not None else (existing["why_bought"] if existing else "")
            monthly_target = item.get("monthly_target") if "monthly_target" in item else (existing["monthly_target"] if existing else None)
            conn.execute(
                """INSERT OR REPLACE INTO spending_reflections
                   (merchant, bucket, feeling, why_bought, monthly_target, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (merch, bucket, feeling, why_bought, monthly_target, now_str),
            )
        conn.commit()

    saved_map = {
        r["merchant"]: dict(r)
        for r in conn.execute("SELECT * FROM spending_reflections").fetchall()
    }
    verdict_map = {
        int(r["tx_id"]): dict(r)
        for r in conn.execute("SELECT * FROM major_purchase_verdicts").fetchall()
    }
    planned_rows = [
        dict(r)
        for r in conn.execute("SELECT * FROM planned_purchases ORDER BY target_ym ASC, estimated_cost DESC").fetchall()
    ]

    merch_rows = [
        dict(r)
        for r in conn.execute(
            """SELECT merchant, category, SUM(amount) AS total_spend, COUNT(*) AS tx_count,
                      MIN(tx_date) AS first_date, MAX(tx_date) AS last_date,
                      MAX(amount) AS max_tx
               FROM transactions
               WHERE tx_type = 'expense' AND amount > 0
               GROUP BY merchant
               ORDER BY total_spend DESC"""
        ).fetchall()
    ]

    all_expense_txs = [
        dict(r)
        for r in conn.execute(
            """SELECT id, tx_date, substr(tx_date, 1, 7) AS ym, merchant, category, amount, description
               FROM transactions
               WHERE tx_type = 'expense' AND amount > 0
               ORDER BY tx_date DESC, amount DESC"""
        ).fetchall()
    ]
    conn.close()

    enriched = []
    totals = {"need": 0.0, "worth_it": 0.0, "questionable": 0.0, "cut_back": 0.0, "potential_annual_savings": 0.0}
    for m in merch_rows:
        m_name = m["merchant"]
        tot = round(float(m["total_spend"] or 0.0), 2)
        saved = saved_map.get(m_name, {})
        bucket = saved.get("bucket") or _default_bucket_for(m_name, m["category"], tot)
        monthly_avg = round(tot / 12.0, 2)
        target = saved.get("monthly_target")
        if bucket == "cut_back":
            est_save = max(0.0, tot - (float(target) * 12.0 if target is not None else tot * 0.5))
            totals["potential_annual_savings"] += est_save
        totals[bucket] = totals.get(bucket, 0.0) + tot
        enriched.append({
            "merchant": m_name,
            "category": m["category"],
            "total_spend": tot,
            "monthly_avg": monthly_avg,
            "tx_count": m["tx_count"],
            "first_date": m["first_date"],
            "last_date": m["last_date"],
            "max_tx": round(float(m["max_tx"] or 0.0), 2),
            "bucket": bucket,
            "has_user_reflection": bool(saved),
            "feeling": saved.get("feeling", ""),
            "why_bought": saved.get("why_bought", ""),
            "monthly_target": target,
            "updated_at": saved.get("updated_at", ""),
        })

    # Build Month-by-Month Necessary vs. Everyday Discretionary vs. Major Purchases Breakdown
    # Mental model:
    # 1. Fixed Housing (Mortgage P&I + Regular HOA + Property Tax)
    # 2. Necessary Living (Home Utilities, Subscriptions, Groceries, Automotive & Gas, and normal Entertainment < $450)
    # 3. Everyday Discretionary (Dining & Restaurants, routine Shopping < $450, routine Travel/Fitness < $450)
    # 4. Major Purchases (>= $450 single item excluding regular Mortgage P&I and regular HOA)
    monthly_map = {}
    major_purchases = []
    project_totals = {}

    po = get_partner_offset_config()
    mort_kw = [k.upper() for k in (po.get("mortgage_keywords") or ["MORTGAGE"])]
    hoa_kw = [k.upper() for k in (po.get("hoa_keywords") or ["HOA"])]
    tax_kw = [k.upper() for k in (po.get("property_tax_keywords") or ["PROPERTY TAX"])]
    reg_hoa_part = float(po.get("special_hoa_regular_part") or 0.0)
    essential_merchants = _essential_need_merchants()

    for tx in all_expense_txs:
        ym = tx["ym"]
        amt = round(float(tx["amount"] or 0.0), 2)
        merch = tx["merchant"] or ""
        cat = tx["category"] or ""
        m_up = merch.upper()

        m_entry = monthly_map.setdefault(ym, {
            "ym": ym,
            "housing_fixed_gross": 0.0,
            "utilities_subs_groceries_ent": 0.0,
            "everyday_discretionary": 0.0,
            "major_forced": 0.0,
            "major_discretionary": 0.0,
            "major_unnecessary": 0.0,
            "total_gross": 0.0,
            "major_items": [],
        })
        m_entry["total_gross"] += amt

        is_reg_mortgage = any(k in m_up for k in mort_kw)
        is_hoa_row = any(k in m_up for k in hoa_kw)
        is_reg_hoa = is_hoa_row and (reg_hoa_part <= 0 or amt < 1500.0)
        is_special_hoa = is_hoa_row and reg_hoa_part > 0 and amt >= 1500.0
        is_prop_tax = any(k in m_up for k in tax_kw)

        if is_reg_mortgage or is_reg_hoa or is_prop_tax:
            m_entry["housing_fixed_gross"] += amt
            continue

        # Check if this is a Major One-Off Purchase (>= $450 or special HOA assessment)
        if amt >= 450.0 or is_special_hoa:
            default_proj, default_verdict = _classify_major_project(merch, cat, amt)
            v_saved = verdict_map.get(int(tx["id"]), {})
            m_saved = saved_map.get(merch, {})
            m_bucket = m_saved.get("bucket")
            # Sync merchant-level reflection bucket if no per-transaction verdict override exists
            if v_saved.get("verdict"):
                verdict = v_saved.get("verdict")
            elif m_bucket == "cut_back":
                verdict = "skip_next_time"
            elif m_bucket == "worth_it":
                verdict = "worth_it"
            else:
                verdict = default_verdict
            proj_grp = v_saved.get("project_group") or default_proj

            # Split special HOA assessment into regular dues + assessment excess when applicable
            if is_special_hoa and reg_hoa_part > 0:
                reg_part = reg_hoa_part
                maj_part = round(amt - reg_part, 2)
                m_entry["housing_fixed_gross"] += reg_part
            else:
                maj_part = amt

            if verdict == "forced_need":
                m_entry["major_forced"] += maj_part
            else:
                m_entry["major_discretionary"] += maj_part
                if verdict == "skip_next_time":
                    m_entry["major_unnecessary"] += maj_part

            m_note_parts = [p for p in [m_saved.get("why_bought", "").strip(), m_saved.get("feeling", "").strip()] if p]
            combined_note = v_saved.get("notes", "").strip() or " — ".join(m_note_parts)

            item_obj = {
                "id": tx["id"],
                "tx_date": tx["tx_date"],
                "ym": ym,
                "merchant": merch,
                "category": cat,
                "amount": maj_part,
                "raw_amount": amt,
                "description": tx["description"],
                "project_group": proj_grp,
                "verdict": verdict,
                "user_bucket": m_bucket or "",
                "notes": combined_note,
            }
            m_entry["major_items"].append(item_obj)
            major_purchases.append(item_obj)

            p_agg = project_totals.setdefault(proj_grp, {"project": proj_grp, "total": 0.0, "count": 0, "verdict": verdict})
            p_agg["total"] = round(p_agg["total"] + maj_part, 2)
            p_agg["count"] += 1
            continue

        # Otherwise (< $450 regular item): classify into Necessary Living vs. Everyday Discretionary
        if cat in ("Home & Utilities", "Subscriptions", "Groceries", "Automotive & Gas", "Entertainment") or merch in essential_merchants:
            m_entry["utilities_subs_groceries_ent"] += amt
        else:
            m_entry["everyday_discretionary"] += amt

    # Format monthly series (chronological)
    monthly_series = []
    partner_monthly = float(po.get("expected_total") or 0.0)
    for ym in sorted(monthly_map.keys())[-12:]:
        m = monthly_map[ym]
        housing_net = max(0.0, m["housing_fixed_gross"] - partner_monthly)
        necessary_net = round(housing_net + m["utilities_subs_groceries_ent"], 2)
        necessary_gross = round(m["housing_fixed_gross"] + m["utilities_subs_groceries_ent"], 2)
        everyday_disc = round(m["everyday_discretionary"], 2)
        maj_forced = round(m["major_forced"], 2)
        maj_disc = round(m["major_discretionary"], 2)
        maj_unnec = round(m["major_unnecessary"], 2)
        tot_net = round(necessary_net + everyday_disc + maj_forced + maj_disc, 2)
        tot_gross = round(m["total_gross"], 2)
        without_major_disc = round(necessary_net + everyday_disc, 2)

        monthly_series.append({
            "ym": ym,
            "housing_fixed_gross": round(m["housing_fixed_gross"], 2),
            "housing_fixed_net": round(housing_net, 2),
            "utilities_subs_groceries_ent": round(m["utilities_subs_groceries_ent"], 2),
            "necessary_total_net": necessary_net,
            "necessary_total_gross": necessary_gross,
            "everyday_discretionary": everyday_disc,
            "major_forced": maj_forced,
            "major_discretionary": maj_disc,
            "major_unnecessary": maj_unnec,
            "total_net_partner": tot_net,
            "total_gross": tot_gross,
            "spend_without_major_buys_net": without_major_disc,
            "spend_without_major_buys_gross": round(necessary_gross + everyday_disc, 2),
            "major_items": m["major_items"],
        })

    n_months = max(1, len(monthly_series))
    sum_housing_net = round(sum(x["housing_fixed_net"] for x in monthly_series), 2)
    sum_housing_gross = round(sum(x["housing_fixed_gross"] for x in monthly_series), 2)
    sum_routine_living = round(sum(x["utilities_subs_groceries_ent"] for x in monthly_series), 2)
    sum_nec_net = round(sum(x["necessary_total_net"] for x in monthly_series), 2)
    sum_nec_gross = round(sum(x["necessary_total_gross"] for x in monthly_series), 2)
    sum_every_disc = round(sum(x["everyday_discretionary"] for x in monthly_series), 2)
    sum_maj_forced = round(sum(x["major_forced"] for x in monthly_series), 2)
    sum_maj_disc = round(sum(x["major_discretionary"] for x in monthly_series), 2)
    sum_maj_unnec = round(sum(x["major_unnecessary"] for x in monthly_series), 2)
    sum_tot_net = round(sum(x["total_net_partner"] for x in monthly_series), 2)
    sum_tot_gross = round(sum(x["total_gross"] for x in monthly_series), 2)
    sum_no_major_net = round(sum(x["spend_without_major_buys_net"] for x in monthly_series), 2)

    spending_tiers = {
        "months_analyzed": n_months,
        "partner_monthly_offset": partner_monthly,
        "housing_fixed_net_monthly": round(sum_housing_net / n_months, 2),
        "housing_fixed_gross_monthly": round(sum_housing_gross / n_months, 2),
        "routine_living_monthly": round(sum_routine_living / n_months, 2),
        "necessary_net_annual": sum_nec_net,
        "necessary_net_monthly": round(sum_nec_net / n_months, 2),
        "necessary_gross_annual": sum_nec_gross,
        "necessary_gross_monthly": round(sum_nec_gross / n_months, 2),
        "everyday_discretionary_annual": sum_every_disc,
        "everyday_discretionary_monthly": round(sum_every_disc / n_months, 2),
        "baseline_no_major_net_annual": sum_no_major_net,
        "baseline_no_major_net_monthly": round(sum_no_major_net / n_months, 2),
        "major_forced_annual": sum_maj_forced,
        "major_forced_monthly": round(sum_maj_forced / n_months, 2),
        "major_discretionary_annual": sum_maj_disc,
        "major_discretionary_monthly": round(sum_maj_disc / n_months, 2),
        "major_unnecessary_annual": sum_maj_unnec,
        "major_unnecessary_monthly": round(sum_maj_unnec / n_months, 2),
        "actual_total_net_annual": sum_tot_net,
        "actual_total_net_monthly": round(sum_tot_net / n_months, 2),
        "actual_total_gross_annual": sum_tot_gross,
        "actual_total_gross_monthly": round(sum_tot_gross / n_months, 2),
        "savings_if_no_major_buys_annual": round(sum_maj_disc + sum_maj_forced, 2),
        "savings_if_no_discretionary_major_annual": sum_maj_disc,
    }

    ref_prof = get_reflections_profile()
    trips_analysis = ref_prof.get("trips_analysis") or {}
    user_reflection_insights = ref_prof.get("user_reflection_insights") or {"highlights": []}

    return jsonify({
        "totals": {k: round(v, 2) for k, v in totals.items()},
        "spending_tiers": spending_tiers,
        "monthly_breakdown": monthly_series,
        "major_purchases": major_purchases,
        "major_projects": sorted(project_totals.values(), key=lambda x: x["total"], reverse=True),
        "planned_purchases": planned_rows,
        "merchants": enriched,
        "trips_analysis": trips_analysis,
        "user_reflection_insights": user_reflection_insights,
    })


@app.route("/api/major-verdict", methods=["POST"])
def api_save_major_verdict():
    body = request.get_json(force=True)
    tx_id = int(body.get("tx_id"))
    verdict = (body.get("verdict") or "worth_it").strip()
    project_group = (body.get("project_group") or "").strip()
    notes = (body.get("notes") or "").strip()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    conn = get_connection()
    _ensure_reflection_tables(conn)
    existing = conn.execute("SELECT * FROM major_purchase_verdicts WHERE tx_id = ?", (tx_id,)).fetchone()
    if existing and not project_group:
        project_group = existing["project_group"]
    if existing and "notes" not in body:
        notes = existing["notes"]
    conn.execute(
        "INSERT OR REPLACE INTO major_purchase_verdicts (tx_id, verdict, project_group, notes, updated_at) VALUES (?,?,?,?,?)",
        (tx_id, verdict, project_group, notes, now_str),
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "ok", "tx_id": tx_id, "verdict": verdict})


@app.route("/api/planned-purchases", methods=["POST", "DELETE"])
def api_planned_purchases():
    conn = get_connection()
    _ensure_reflection_tables(conn)
    if request.method == "DELETE":
        plan_id = int(request.args.get("id") or 0)
        conn.execute("DELETE FROM planned_purchases WHERE id = ?", (plan_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "deleted"})

    body = request.get_json(force=True)
    plan_id = body.get("id")
    name = (body.get("name") or "New Major Purchase").strip()
    category = (body.get("category") or "Home & Upgrades").strip()
    estimated_cost = round(float(body.get("estimated_cost") or 0.0), 2)
    target_ym = (body.get("target_ym") or "2027-01").strip()
    priority = (body.get("priority") or "medium").strip()
    notes = (body.get("notes") or "").strip()
    status = (body.get("status") or "planned").strip()

    if plan_id:
        conn.execute(
            "UPDATE planned_purchases SET name=?, category=?, estimated_cost=?, target_ym=?, priority=?, notes=?, status=? WHERE id=?",
            (name, category, estimated_cost, target_ym, priority, notes, status, int(plan_id)),
        )
    else:
        conn.execute(
            "INSERT INTO planned_purchases (name, category, estimated_cost, target_ym, priority, notes, status) VALUES (?,?,?,?,?,?,?)",
            (name, category, estimated_cost, target_ym, priority, notes, status),
        )
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route("/api/accounts", methods=["GET", "POST"])
def api_accounts():
    conn = get_connection()
    if request.method == "GET":
        rows = [dict(r) for r in conn.execute("SELECT * FROM accounts ORDER BY account_type, institution, name").fetchall()]
        conn.close()
        return jsonify({"accounts": rows})

    body = request.get_json(force=True)
    name = (body.get("name") or "New Account").strip()
    institution = (body.get("institution") or "Chase").strip()
    account_type = (body.get("account_type") or "credit_card").strip()
    mask = (body.get("mask") or "").strip()
    try:
        balance = float(body.get("balance") or 0.0)
    except (ValueError, TypeError):
        balance = 0.0
    try:
        credit_limit = float(body.get("credit_limit") or 0.0)
    except (ValueError, TypeError):
        credit_limit = 0.0

    conn.execute(
        """
        INSERT INTO accounts (name, institution, account_type, mask, balance, credit_limit, sync_source, last_synced, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, 0)
        """,
        (name, institution, account_type, mask, round(balance, 2), round(credit_limit, 2), datetime.now().strftime("%Y-%m-%d %H:%M")),
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route("/api/accounts/<int:acc_id>", methods=["DELETE"])
def api_delete_account(acc_id):
    conn = get_connection()
    conn.execute("DELETE FROM accounts WHERE id = ?", (acc_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "deleted"})


@app.route("/api/holdings", methods=["POST"])
def api_upsert_holding():
    body = request.get_json(force=True)
    account_id = int(body.get("account_id"))
    symbol = (body.get("symbol") or "").strip().upper()
    name = (body.get("name") or symbol).strip()
    try:
        shares = float(body.get("shares") or 0.0)
    except (ValueError, TypeError):
        shares = 0.0
    try:
        current_price = float(body.get("current_price") or 0.0)
    except (ValueError, TypeError):
        current_price = 0.0
    try:
        cost_basis_total = float(body.get("cost_basis_total") or 0.0)
    except (ValueError, TypeError):
        cost_basis_total = 0.0
    current_value = round(shares * current_price, 2)
    asset_class = body.get("asset_class") or classify_asset_class(symbol, name)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    conn = get_connection()
    conn.execute(
        """
        INSERT OR REPLACE INTO holdings
        (account_id, symbol, name, shares, cost_basis_total, current_price, current_value, asset_class, last_updated, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (account_id, symbol, name, round(shares, 4), round(cost_basis_total, 2), round(current_price, 2), current_value, asset_class, now_str),
    )
    tot = conn.execute(
        "SELECT COALESCE(SUM(current_value), 0) as t FROM holdings WHERE account_id = ? AND symbol NOT LIKE '%-RSU' AND UPPER(asset_class) NOT LIKE '%UNVESTED%'",
        (account_id,),
    ).fetchone()["t"]
    conn.execute("UPDATE accounts SET balance = ?, last_synced = ? WHERE id = ?", (round(float(tot), 2), now_str, account_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route("/api/holdings/<int:holding_id>", methods=["DELETE"])
def api_delete_holding(holding_id):
    conn = get_connection()
    row = conn.execute("SELECT account_id FROM holdings WHERE id = ?", (holding_id,)).fetchone()
    conn.execute("DELETE FROM holdings WHERE id = ?", (holding_id,))
    if row:
        acc_id = row["account_id"]
        tot = conn.execute(
            "SELECT COALESCE(SUM(current_value), 0) as t FROM holdings WHERE account_id = ? AND symbol NOT LIKE '%-RSU' AND UPPER(asset_class) NOT LIKE '%UNVESTED%'",
            (acc_id,),
        ).fetchone()["t"]
        conn.execute("UPDATE accounts SET balance = ? WHERE id = ?", (round(float(tot), 2), acc_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "deleted"})


@app.route("/api/import/upload", methods=["POST"])
def api_import_upload():
    institution = request.form.get("institution") or None
    account_id = request.form.get("account_id")
    account_id = int(account_id) if (account_id and account_id.isdigit()) else None

    if "files" not in request.files and "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    uploaded_files = request.files.getlist("files") or [request.files.get("file")]
    results = []
    for f in uploaded_files:
        if not f or not f.filename:
            continue
        raw_bytes = f.read()
        save_path = os.path.join(IMPORTS_DIR, f.filename)

        if f.filename.lower().endswith(".pdf"):
            try:
                with open(save_path, "wb") as out_f:
                    out_f.write(raw_bytes)
            except Exception:
                pass
            res = ingest_pdf_bytes(
                f.filename,
                raw_bytes,
                institution_override=(institution if institution != "Auto-Detect" else None),
                account_id_override=account_id,
            )
            results.append(res)
            continue

        try:
            text = raw_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = raw_bytes.decode("latin-1", errors="replace")

        # Also save a backup copy to imports/
        try:
            with io.open(save_path, "w", encoding="utf-8") as out_f:
                out_f.write(text)
        except Exception:
            pass

        res = ingest_file_content(
            f.filename,
            text,
            institution_override=(institution if institution != "Auto-Detect" else None),
            account_id_override=account_id,
        )
        results.append(res)

    return jsonify({"status": "ok", "results": results})


@app.route("/api/import/scan-folder", methods=["POST"])
def api_scan_folder():
    results = scan_watch_folder()
    return jsonify({"status": "ok", "results": results, "watch_dir": IMPORTS_DIR})


@app.route("/api/import/scan-downloads", methods=["POST"])
def api_scan_downloads():
    results = scan_user_downloads_folder()
    return jsonify({"status": "ok", "results": results})


@app.route("/api/import/open-folder", methods=["POST"])
def api_open_folder():
    ensure_institution_folders()
    try:
        os.startfile(IMPORTS_DIR)
    except Exception:
        pass
    return jsonify({"status": "ok", "watch_dir": IMPORTS_DIR})


@app.route("/api/investments/history", methods=["GET"])
def api_investments_history():
    range_key = request.args.get("range", "6m")
    inc_raw = (request.args.get("include_unvested") or "").strip().lower()
    include_unvested = inc_raw in ("1", "true", "yes")
    institution = request.args.get("institution", "All")
    refresh_raw = (request.args.get("refresh") or "").strip().lower()
    is_demo = os.environ.get("FINPULSE_PROFILE_MODE", "").strip().lower() == "demo"
    if refresh_raw in ("1", "true", "yes") and not is_demo:
        sync_live_market_history(range_str="1y", force=True)
        sync_live_market_prices()
    data = build_portfolio_market_history(
        range_key=range_key,
        include_unvested=include_unvested,
        institution=institution,
    )
    return jsonify(data)


@app.route("/api/sync/market-prices", methods=["POST"])
def api_sync_market_prices():
    res = sync_live_market_prices()
    hist_res = sync_live_market_history(range_str="1y", force=True)
    return jsonify({"status": "ok", "result": res, "history": hist_res})


@app.route("/api/sync/simplefin", methods=["POST"])
def api_sync_simplefin():
    body = request.get_json(force=True) if request.is_json else {}
    token = body.get("token")
    res = sync_simplefin(token)
    return jsonify(res)


@app.route("/api/sync/teller", methods=["POST"])
def api_sync_teller():
    body = request.get_json(force=True) if request.is_json else {}
    token = body.get("access_token")
    cert_path = body.get("cert_path")
    key_path = body.get("key_path")
    inst_name = body.get("institution", "Bank")
    res = sync_teller(token, cert_path, key_path, institution_name=inst_name)
    return jsonify(res)


@app.route("/api/sync/teller/config", methods=["POST"])
def api_teller_config():
    ensure_certs_dir()
    app_id = request.form.get("app_id") or (request.json.get("app_id") if request.is_json else "")
    if app_id:
        set_setting("teller_app_id", app_id.strip())

    if "cert_file" in request.files and request.files["cert_file"].filename:
        c_dest = os.path.join(CERTS_DIR, "certificate.pem")
        request.files["cert_file"].save(c_dest)
        set_setting("teller_cert_path", c_dest)

    if "key_file" in request.files and request.files["key_file"].filename:
        k_dest = os.path.join(CERTS_DIR, "private_key.pem")
        request.files["key_file"].save(k_dest)
        set_setting("teller_key_path", k_dest)

    return jsonify({
        "status": "ok",
        "teller_app_id": get_setting("teller_app_id"),
        "has_teller_certs": bool(get_teller_cert_paths()),
    })


@app.route("/api/sync/all", methods=["POST"])
def api_sync_all():
    summary = {"market_prices": 0, "teller_accounts": 0, "simplefin_accounts": 0, "new_transactions": 0}
    mp = sync_live_market_prices()
    summary["market_prices"] = mp.get("updated", 0)

    if get_teller_enrollments():
        tr = sync_teller()
        if tr.get("status") == "ok":
            summary["teller_accounts"] = tr.get("accounts_synced", 0)
            summary["new_transactions"] += tr.get("transactions_imported", 0)

    if get_setting("simplefin_access_url"):
        sf = sync_simplefin()
        if sf.get("status") == "ok":
            summary["simplefin_accounts"] = sf.get("accounts_synced", 0)
            summary["new_transactions"] += sf.get("transactions_imported", 0)

    return jsonify({"status": "ok", "summary": summary})


@app.route("/api/sync/status", methods=["GET"])
def api_sync_status():
    conn = get_connection()
    imports_history = [
        dict(r)
        for r in conn.execute("SELECT * FROM imported_files ORDER BY id DESC LIMIT 15").fetchall()
    ]
    conn.close()
    return jsonify({
        "watch_dir": IMPORTS_DIR,
        "certs_dir": CERTS_DIR,
        "has_simplefin": bool(get_setting("simplefin_access_url")),
        "has_teller": bool(get_teller_enrollments()),
        "teller_app_id": get_setting("teller_app_id", ""),
        "has_teller_certs": bool(get_teller_cert_paths()),
        "teller_enrollments": get_teller_enrollments(),
        "imports_history": imports_history,
    })


@app.route("/api/demo/clear", methods=["POST"])
def api_clear_demo():
    clear_demo_data()
    return jsonify({"status": "ok", "message": "Demo data cleared."})


@app.route("/api/demo/reset", methods=["POST"])
def api_reset_demo():
    seed_demo_data_if_empty(force=True)
    return jsonify({"status": "ok", "message": "Demo data restored."})


def _cleanup_stale_port_5000():
    """On Windows, SO_REUSEADDR allows multiple Python processes to bind 127.0.0.1:5000 simultaneously,
    causing an older background process to intercept requests with stale in-memory modules.
    Terminate any other process listening on port 5000 before starting."""
    if os.name != "nt":
        return
    try:
        import subprocess
        my_pid = str(os.getpid())
        out = subprocess.check_output(["netstat", "-ano"], universal_newlines=True, stderr=subprocess.DEVNULL)
        stale_pids = set()
        for line in out.splitlines():
            if "127.0.0.1:5000" in line and "LISTENING" in line:
                parts = line.split()
                if parts:
                    pid = parts[-1]
                    if pid.isdigit() and pid != "0" and pid != my_pid:
                        stale_pids.add(pid)
        for pid in stale_pids:
            subprocess.call(["taskkill", "/F", "/PID", pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


if __name__ == "__main__":
    port = int(os.environ.get("FINPULSE_PORT", 5000))
    if port == 5000:
        _cleanup_stale_port_5000()
    init_db()
    force_demo = os.environ.get("FINPULSE_PROFILE_MODE", "").strip().lower() == "demo"
    seed_demo_data_if_empty(force=force_demo and bool(os.environ.get("FINPULSE_DB_PATH")))
    print("=================================================================")
    print(" FinPulse Local Personal Finance & Investment Dashboard")
    print(" Dashboard URL: http://localhost:{0}".format(port))
    print(" Profile Mode:  {0}".format("demo (synthetic)" if force_demo else "auto"))
    print(" Auto-Watch Statement Folder: {0}".format(IMPORTS_DIR))
    print("=================================================================")
    app.run(host="127.0.0.1", port=port, debug=False)
