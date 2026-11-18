import gzip
import json
from app import app
from backend.db import get_db_stamp


def test_index_route_and_no_cache_headers():
    client = app.test_client()
    r = client.get("/")
    assert r.status_code == 200
    assert "no-store" in r.headers.get("Cache-Control", "")
    assert b"FinPulse" in r.data


def test_dashboard_api_and_filters():
    client = app.test_client()

    r = client.get("/api/dashboard")
    assert r.status_code == 200
    d = r.get_json()
    assert d["meta"]["has_data"] is True
    assert d["meta"]["profile_mode"] == "demo"
    assert d["net_worth"]["total"] == 584313.75

    r_oct = client.get("/api/dashboard?month=2026-10")
    assert r_oct.status_code == 200
    assert r_oct.get_json()["selected_month"] == "2026-10"

    r_vg = client.get("/api/dashboard?institution=Vanguard")
    assert r_vg.status_code == 200
    assert r_vg.get_json()["meta"]["institution"] == "Vanguard"


def test_month_category_and_networth_history_endpoints():
    client = app.test_client()

    r_md = client.get("/api/month-detail/2026-10")
    assert r_md.status_code == 200
    md = r_md.get_json()
    assert md["month"] == "2026-10"
    assert "income_breakdown" in md
    assert "housing_breakdown" in md

    r_cat = client.get("/api/category/Groceries?month=2026-10")
    assert r_cat.status_code == 200
    cat = r_cat.get_json()
    assert cat["category"] == "Groceries"

    r_nw = client.get("/api/networth/history?months=12")
    assert r_nw.status_code == 200
    assert len(r_nw.get_json()["monthly"]) >= 6


def test_accounts_budgets_rules_and_sync_status():
    client = app.test_client()

    r_acc = client.get("/api/accounts")
    assert r_acc.status_code == 200
    accounts = r_acc.get_json()["accounts"]
    assert len(accounts) == 11

    r_bud = client.get("/api/budgets")
    assert r_bud.status_code == 200
    budgets = {b["category"]: b["monthly_limit"] for b in r_bud.get_json()["budgets"]}
    assert "Housing" in budgets

    r_rules = client.get("/api/rules")
    assert r_rules.status_code == 200
    assert len(r_rules.get_json()["rules"]) > 5

    r_sync = client.get("/api/sync/status")
    assert r_sync.status_code == 200
    sync_data = r_sync.get_json()
    assert "watch_dir" in sync_data
    assert "imports_history" in sync_data


def test_transactions_filtering_and_crud_roundtrip():
    client = app.test_client()

    r_acc = client.get("/api/accounts")
    chk_id = next(a["id"] for a in r_acc.get_json()["accounts"] if a["account_type"] == "checking")

    r_tx = client.get("/api/transactions?category=Groceries")
    assert r_tx.status_code == 200
    assert r_tx.get_json()["count"] >= 1

    r_post = client.post(
        "/api/transactions",
        json={
            "account_id": chk_id,
            "tx_date": "2099-12-31",
            "description": "PYTEST TEMP TEST COFFEE",
            "amount": 5.75,
            "category": "Dining & Restaurants",
            "tx_type": "expense",
        },
    )
    assert r_post.status_code == 200

    found = client.get("/api/transactions?search=PYTEST TEMP TEST COFFEE").get_json()["transactions"]
    assert len(found) == 1
    tx_id = found[0]["id"]

    try:
        r_patch = client.patch(
            f"/api/transactions/{tx_id}",
            json={"category": "Groceries", "merchant": "Pytest Grocery"},
        )
        assert r_patch.status_code == 200
    finally:
        r_del = client.delete(f"/api/transactions/{tx_id}")
        assert r_del.status_code == 200

    assert client.get("/api/transactions?search=PYTEST TEMP TEST COFFEE").get_json()["count"] == 0


def test_reflections_trips_audit_and_spending_tiers():
    """Verify /api/reflections returns the 4-tier breakdown and generic Demo trips structure."""
    client = app.test_client()
    r = client.get("/api/reflections")
    assert r.status_code == 200
    data = r.get_json()

    tiers = data["spending_tiers"]
    assert tiers["partner_monthly_offset"] == 1350.00
    assert tiers["months_analyzed"] >= 6
    assert tiers["actual_total_net_annual"] <= tiers["actual_total_gross_annual"]

    trips = data["trips_analysis"]
    assert "primary_trip" in trips
    assert "airbnb_trips" in trips
    assert "upcoming_trip" in trips

    insights = data["user_reflection_insights"]
    assert len(insights["highlights"]) >= 1


def test_gzip_compression_and_stamp_invalidation():
    """Verify gzip compression on API & static JS plus automatic DB cache stamp bump."""
    client = app.test_client()

    r = client.get("/api/dashboard?month=2026-10", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers.get("Content-Encoding") == "gzip"
    payload = json.loads(gzip.decompress(r.data).decode("utf-8"))
    assert payload["selected_month"] == "2026-10"
    assert payload["month_detail"]["month"] == "2026-10"

    r_js = client.get("/app.js", headers={"Accept-Encoding": "gzip"})
    assert r_js.status_code == 200
    assert r_js.headers.get("Content-Encoding") == "gzip"
    js_text = gzip.decompress(r_js.data).decode("utf-8")
    assert "renderCrossDimensionalMatrix" in js_text

    r_acc = client.get("/api/accounts")
    cc_id = next(a["id"] for a in r_acc.get_json()["accounts"] if a["account_type"] == "credit_card")

    stamp_before = get_db_stamp()
    r_post = client.post(
        "/api/transactions",
        json={
            "account_id": cc_id,
            "tx_date": "2026-10-29",
            "description": "PYTEST GZIP STAMP CHECK",
            "merchant": "Pytest Stamp Check",
            "amount": 3.25,
            "category": "Dining & Restaurants",
            "tx_type": "expense",
        },
    )
    assert r_post.status_code == 200
    assert get_db_stamp() > stamp_before

    # Clean up test row
    found = client.get("/api/transactions?search=PYTEST GZIP STAMP CHECK").get_json()["transactions"]
    for t in found:
        client.delete(f"/api/transactions/{t['id']}")
