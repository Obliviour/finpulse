import os
import base64
import json
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
import requests
from backend.db import get_connection, compute_tx_hash, bump_db_stamp, BASE_DIR
from backend.categorizer import categorize_transaction

CERTS_DIR = os.path.join(BASE_DIR, "certs")
CASH_EQUIV_SYMBOLS = {"SPAXX", "FDRXX", "VMFXX", "SWVXX", "SNSXX", "CASH", "USD", "HEQ-CASH"}
NON_PUBLIC_SYMBOLS = {"HEQ-INV"}


def _resolve_yahoo_symbol(symbol, name=""):
    """Map a holding ticker to a public Yahoo Finance symbol, or None if cash/trust/non-public."""
    sym = (symbol or "").strip().upper()
    if not sym or sym in CASH_EQUIV_SYMBOLS or sym in NON_PUBLIC_SYMBOLS:
        return None
    if "TRUST" in (name or "").upper():
        return None
    if sym.endswith("-RSU"):
        base = sym[:-4]
        return base or None
    return sym


def ensure_certs_dir():
    if not os.path.exists(CERTS_DIR):
        os.makedirs(CERTS_DIR)


def get_setting(key, default=""):
    conn = get_connection()
    row = conn.execute("SELECT value FROM sync_settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key, value):
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO sync_settings (key, value, updated_at) VALUES (?, ?, ?)",
        (key, str(value), datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    conn.close()
    bump_db_stamp()


def get_teller_enrollments():
    raw = get_setting("teller_enrollments_json", "[]")
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    # Fallback if single token was saved earlier
    single = get_setting("teller_access_token", "")
    if single:
        return [{"access_token": single, "institution": "Linked Bank", "enrollment_id": "default"}]
    return []


def add_teller_enrollment(access_token, institution="Bank", enrollment_id=""):
    enrollments = get_teller_enrollments()
    # Avoid duplicate token
    for e in enrollments:
        if e.get("access_token") == access_token:
            return enrollments
    enrollments.append({
        "access_token": access_token,
        "institution": institution,
        "enrollment_id": enrollment_id,
        "added_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    })
    set_setting("teller_enrollments_json", json.dumps(enrollments))
    set_setting("teller_access_token", access_token)
    return enrollments


def get_teller_cert_paths():
    """Auto-detect certificate.pem & private_key.pem in `certs/` or from settings."""
    ensure_certs_dir()
    default_cert = os.path.join(CERTS_DIR, "certificate.pem")
    default_key = os.path.join(CERTS_DIR, "private_key.pem")
    c_path = get_setting("teller_cert_path") or (default_cert if os.path.exists(default_cert) else "")
    k_path = get_setting("teller_key_path") or (default_key if os.path.exists(default_key) else "")
    if c_path and k_path and os.path.exists(c_path) and os.path.exists(k_path):
        return (c_path, k_path)
    return None


def _fetch_yahoo_chart(sym, range_str="2d", timeout=5):
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    url = "https://query1.finance.yahoo.com/v8/finance/chart/{0}?interval=1d&range={1}".format(sym, range_str)
    resp = requests.get(url, headers=headers, timeout=timeout)
    if resp.status_code != 200:
        return None
    data = resp.json()
    results = data.get("chart", {}).get("result") or []
    return results[0] if results else None


def sync_live_market_prices():
    """
    100% Free live stock/ETF/mutual fund price sync via Yahoo Finance API.
    Updates all holdings across Vanguard, Fidelity, and Charles Schwab accounts,
    mapping *-RSU grants to their underlying ticker and skipping institutional trusts.
    """
    conn = get_connection()
    rows = conn.execute("SELECT id, account_id, symbol, name, shares, current_price FROM holdings").fetchall()
    if not rows:
        conn.close()
        return {"updated": 0, "symbols": []}

    yahoo_symbols = sorted({
        ys for ys in (_resolve_yahoo_symbol(r["symbol"], r["name"]) for r in rows) if ys
    })
    live_quotes = {sym: (1.0, 0.0) for sym in CASH_EQUIV_SYMBOLS}

    def _quote_one(sym):
        try:
            res = _fetch_yahoo_chart(sym, range_str="2d", timeout=5)
            if not res:
                return None
            meta = res.get("meta", {})
            price = meta.get("regularMarketPrice")
            prev = meta.get("chartPreviousClose") or meta.get("previousClose") or price
            if price and price > 0:
                pct = ((price - prev) / prev * 100.0) if prev and prev > 0 else 0.0
                return sym, (round(float(price), 2), round(float(pct), 2))
        except Exception:
            pass
        return None

    if yahoo_symbols:
        with ThreadPoolExecutor(max_workers=min(8, len(yahoo_symbols))) as pool:
            for item in pool.map(_quote_one, yahoo_symbols):
                if item:
                    live_quotes[item[0]] = item[1]

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    updated_count = 0
    affected_accounts = set()

    for r in rows:
        raw_sym = (r["symbol"] or "").strip().upper()
        if raw_sym in CASH_EQUIV_SYMBOLS:
            q_sym = raw_sym
        else:
            q_sym = _resolve_yahoo_symbol(raw_sym, r["name"])
        if q_sym and q_sym in live_quotes:
            price, pct = live_quotes[q_sym]
            val = round(float(r["shares"]) * price, 2)
            conn.execute(
                "UPDATE holdings SET current_price = ?, current_value = ?, day_change_pct = ?, last_updated = ? WHERE id = ?",
                (price, val, pct, now_str, r["id"]),
            )
            updated_count += 1
            affected_accounts.add(r["account_id"])

    # Recalculate total balance for each investment account (excluding unvested RSU pipeline)
    for acc_id in affected_accounts:
        tot = conn.execute(
            "SELECT COALESCE(SUM(current_value), 0) as total FROM holdings WHERE account_id = ? AND symbol NOT LIKE '%-RSU' AND UPPER(asset_class) NOT LIKE '%UNVESTED%'",
            (acc_id,),
        ).fetchone()["total"]
        conn.execute(
            "UPDATE accounts SET balance = ?, last_synced = ? WHERE id = ?",
            (round(float(tot), 2), now_str, acc_id),
        )

    conn.commit()
    conn.close()
    bump_db_stamp()
    return {"updated": updated_count, "symbols": sorted(live_quotes.keys()), "timestamp": now_str}


def _ensure_market_history_table(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS market_price_history (
            symbol TEXT NOT NULL,
            price_date TEXT NOT NULL,
            close_price REAL NOT NULL,
            PRIMARY KEY (symbol, price_date)
        )
        """
    )


def sync_live_market_history(range_str="1y", force=False):
    """Fetch and cache 1-year daily closes from Yahoo Finance for all tracked holdings + SPY."""
    conn = get_connection()
    _ensure_market_history_table(conn)

    if not force:
        row = conn.execute("SELECT value FROM sync_settings WHERE key = 'last_market_history_sync'").fetchone()
        cnt = conn.execute("SELECT COUNT(*) AS cnt FROM market_price_history").fetchone()["cnt"]
        if row and cnt > 0:
            try:
                last_dt = datetime.fromisoformat(row["value"])
                if datetime.now() - last_dt < timedelta(hours=4):
                    conn.close()
                    return {
                        "status": "cached",
                        "symbols_synced": 0,
                        "points_stored": cnt,
                        "timestamp": row["value"],
                    }
            except Exception:
                pass

    h_rows = conn.execute("SELECT symbol, name FROM holdings").fetchall()
    symbols = sorted({
        ys for ys in (_resolve_yahoo_symbol(r["symbol"], r["name"]) for r in h_rows) if ys
    } | {"SPY"})

    def _fetch_series(sym):
        try:
            res = _fetch_yahoo_chart(sym, range_str=range_str, timeout=6)
            if not res:
                return sym, {}
            timestamps = res.get("timestamp") or []
            quotes = (res.get("indicators") or {}).get("quote") or [{}]
            closes = quotes[0].get("close") or []
            by_date = {}
            for ts, cl in zip(timestamps, closes):
                if ts is None or cl is None:
                    continue
                try:
                    c_val = float(cl)
                except (TypeError, ValueError):
                    continue
                if c_val <= 0:
                    continue
                dt_str = datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d")
                by_date[dt_str] = round(c_val, 4)
            return sym, by_date
        except Exception:
            return sym, {}

    all_points = []
    synced_syms = 0
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(symbols)))) as pool:
        futures = [pool.submit(_fetch_series, sym) for sym in symbols]
        for fut in as_completed(futures):
            sym, by_date = fut.result()
            if by_date:
                synced_syms += 1
                for dt_str, cl in by_date.items():
                    all_points.append((sym, dt_str, cl))

    now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if all_points:
        conn.executemany(
            "INSERT OR REPLACE INTO market_price_history (symbol, price_date, close_price) VALUES (?, ?, ?)",
            all_points,
        )
        conn.execute(
            "INSERT OR REPLACE INTO sync_settings (key, value, updated_at) VALUES (?, ?, ?)",
            ("last_market_history_sync", now_iso, now_iso),
        )
        conn.commit()
    conn.close()
    return {
        "status": "ok",
        "symbols_synced": synced_syms,
        "points_stored": len(all_points),
        "timestamp": now_iso,
    }


def _simulate_history_map(groups, spy_anchor=580.0, days=180):
    """Deterministic weekday price series anchored at current prices for demo/offline mode."""
    end_d = datetime.now().date()
    dates = []
    cur = end_d - timedelta(days=days)
    while cur <= end_d:
        if cur.weekday() < 5:
            dates.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)
    if not dates:
        dates = [end_d.strftime("%Y-%m-%d")]

    price_map = {}
    targets = {g["yahoo_symbol"]: g["current_price"] for g in groups if g["yahoo_symbol"] and g["current_price"] > 0}
    targets.setdefault("SPY", spy_anchor)

    for sym, end_p in targets.items():
        rng = random.Random(42 + sum(ord(ch) for ch in sym))
        vals = [float(end_p)]
        for _ in range(len(dates) - 1):
            daily_ret = rng.gauss(0.00045, 0.0115)
            prev_p = max(0.01, vals[-1] / (1.0 + daily_ret))
            vals.append(prev_p)
        vals.reverse()
        price_map[sym] = {d: round(v, 4) for d, v in zip(dates, vals)}
    return dates, price_map


def build_portfolio_market_history(range_key="6m", include_unvested=False, institution=None, allow_live_fetch=True):
    """Mark current holding share counts to historical market closes over the chosen window."""
    rk = (range_key or "6m").strip().lower()
    range_days_map = {"1w": 7, "1m": 30, "3m": 90, "6m": 180, "1y": 365}

    conn = get_connection()
    _ensure_market_history_table(conn)

    sql = (
        "SELECT h.symbol, h.name, h.shares, h.current_price, h.current_value, h.day_change_pct, h.asset_class "
        "FROM holdings h JOIN accounts a ON a.id = h.account_id WHERE 1=1"
    )
    params = []
    if institution and str(institution).strip().lower() != "all":
        sql += " AND LOWER(a.institution) = LOWER(?)"
        params.append(str(institution).strip())
    rows = conn.execute(sql, params).fetchall()

    grouped = {}
    static_vested_val = 0.0
    static_unvested_val = 0.0
    for r in rows:
        sym = (r["symbol"] or "").strip().upper()
        name = r["name"] or sym
        shares = float(r["shares"] or 0.0)
        cur_val = float(r["current_value"] or 0.0)
        cur_price = float(r["current_price"] or 0.0)
        day_pct = float(r["day_change_pct"] or 0.0)
        is_unv = sym.endswith("-RSU") or "UNVESTED" in (r["asset_class"] or "").upper()
        y_sym = _resolve_yahoo_symbol(sym, name)
        if not y_sym or shares <= 0:
            if is_unv:
                static_unvested_val += cur_val
            else:
                static_vested_val += cur_val
            continue
        key = (sym, y_sym, is_unv)
        g = grouped.setdefault(key, {
            "symbol": sym,
            "yahoo_symbol": y_sym,
            "name": name,
            "shares": 0.0,
            "current_value": 0.0,
            "current_price": cur_price,
            "day_change_pct": day_pct,
            "is_unvested": is_unv,
        })
        g["shares"] += shares
        g["current_value"] += cur_val
        if cur_price > 0:
            g["current_price"] = cur_price

    groups = list(grouped.values())
    active_groups = [g for g in groups if include_unvested or not g["is_unvested"]]
    needed_yahoo = sorted({g["yahoo_symbol"] for g in active_groups} | {"SPY"})

    is_demo_mode = (os.environ.get("FINPULSE_PROFILE_MODE") or "").strip().lower() == "demo"
    if allow_live_fetch and not is_demo_mode and active_groups:
        placeholders = ",".join("?" for _ in needed_yahoo)
        cnt_row = conn.execute(
            f"SELECT COUNT(*) AS cnt FROM market_price_history WHERE symbol IN ({placeholders})",
            needed_yahoo,
        ).fetchone()
        if not cnt_row or cnt_row["cnt"] == 0:
            conn.close()
            sync_live_market_history(range_str="1y", force=False)
            conn = get_connection()
            _ensure_market_history_table(conn)

    last_sync_row = conn.execute("SELECT value FROM sync_settings WHERE key = 'last_market_history_sync'").fetchone()
    last_synced = last_sync_row["value"] if last_sync_row else None

    price_map = {}
    all_dates_set = set()
    if needed_yahoo:
        placeholders = ",".join("?" for _ in needed_yahoo)
        hist_rows = conn.execute(
            f"SELECT symbol, price_date, close_price FROM market_price_history WHERE symbol IN ({placeholders}) ORDER BY price_date ASC",
            needed_yahoo,
        ).fetchall()
        for hr in hist_rows:
            price_map.setdefault(hr["symbol"], {})[hr["price_date"]] = float(hr["close_price"])
            all_dates_set.add(hr["price_date"])
    conn.close()

    has_real_history = any(sym != "SPY" and sym in price_map and len(price_map[sym]) >= 2 for sym in needed_yahoo)
    is_simulated = False
    if not has_real_history or is_demo_mode:
        days_back = range_days_map.get(rk, 365 if rk == "1y" else 240)
        if rk == "ytd":
            today_d = datetime.now().date()
            days_back = max(14, (today_d - today_d.replace(month=1, day=1)).days + 7)
        all_dates, price_map = _simulate_history_map(active_groups, days=max(days_back, 30))
        is_simulated = True
    else:
        spy_dates = sorted(price_map.get("SPY", {}).keys())
        all_dates = spy_dates if len(spy_dates) >= 5 else sorted(all_dates_set)

    if all_dates:
        end_dt = datetime.strptime(all_dates[-1], "%Y-%m-%d").date()
        if rk == "ytd":
            cutoff = end_dt.replace(month=1, day=1).strftime("%Y-%m-%d")
        else:
            days = range_days_map.get(rk, 180)
            cutoff = (end_dt - timedelta(days=days)).strftime("%Y-%m-%d")
        dates = [d for d in all_dates if d >= cutoff]
        if len(dates) < 2 and len(all_dates) >= 2:
            dates = all_dates[-2:]
    else:
        dates = []

    # Forward-fill prices across the active date window
    filled = {}
    for sym in needed_yahoo:
        s_map = price_map.get(sym, {})
        if not s_map:
            continue
        sorted_avail = sorted(s_map.items())
        # Initialize with the most recent known close on or before the first window date, or earliest available
        init_price = None
        if dates:
            for d_avail, p_avail in sorted_avail:
                if d_avail <= dates[0]:
                    init_price = p_avail
                else:
                    break
        if init_price is None:
            init_price = sorted_avail[0][1]
        cur_p = init_price
        sym_series = []
        for d in dates:
            if d in s_map:
                cur_p = s_map[d]
            sym_series.append(cur_p)
        filled[sym] = sym_series

    static_total = round(static_vested_val + (static_unvested_val if include_unvested else 0.0), 2)
    series = []
    spy_series = filled.get("SPY")
    spy_start = spy_series[0] if spy_series and spy_series[0] > 0 else None
    start_port_val = None

    for idx, d in enumerate(dates):
        live_val = 0.0
        for g in active_groups:
            y_sym = g["yahoo_symbol"]
            p = filled[y_sym][idx] if y_sym in filled else g["current_price"]
            live_val += g["shares"] * p
        port_val = round(live_val + static_total, 2)
        if start_port_val is None:
            start_port_val = port_val
        bench_val = round(start_port_val * (spy_series[idx] / spy_start), 2) if (spy_series and spy_start) else None
        series.append({
            "date": d,
            "portfolio_value": port_val,
            "benchmark_value": bench_val,
            "live_value": round(live_val, 2),
            "static_value": static_total,
        })

    movers = []
    for g in active_groups:
        y_sym = g["yahoo_symbol"]
        s_arr = filled.get(y_sym)
        if s_arr and len(s_arr) >= 2:
            p0, p1 = s_arr[0], s_arr[-1]
        else:
            p0 = p1 = g["current_price"]
        d_chg = round((p1 - p0) * g["shares"], 2)
        pct_chg = round(((p1 - p0) / p0) * 100.0, 2) if p0 > 0 else 0.0
        movers.append({
            "symbol": g["symbol"],
            "yahoo_symbol": y_sym,
            "name": g["name"],
            "shares": round(g["shares"], 4),
            "start_price": round(p0, 2),
            "end_price": round(p1, 2),
            "current_value": round(g["shares"] * p1, 2),
            "dollar_change": d_chg,
            "pct_change": pct_chg,
            "day_change_pct": round(g["day_change_pct"], 2),
            "is_unvested": g["is_unvested"],
        })

    movers.sort(key=lambda x: x["dollar_change"], reverse=True)
    top_gainers = [m for m in movers if m["dollar_change"] > 0][:6]
    top_detractors = sorted([m for m in movers if m["dollar_change"] < 0], key=lambda x: x["dollar_change"])[:6]

    start_v = series[0]["portfolio_value"] if series else round(sum(g["current_value"] for g in active_groups) + static_total, 2)
    end_v = series[-1]["portfolio_value"] if series else start_v
    port_d_chg = round(end_v - start_v, 2)
    port_pct_chg = round((port_d_chg / start_v) * 100.0, 2) if start_v > 0 else 0.0

    bench_pct = None
    if spy_series and len(spy_series) >= 2 and spy_series[0] > 0:
        bench_pct = round(((spy_series[-1] - spy_series[0]) / spy_series[0]) * 100.0, 2)
    alpha_pct = round(port_pct_chg - bench_pct, 2) if bench_pct is not None else None

    live_tracked_val = round(sum(m["current_value"] for m in movers), 2)
    return {
        "range": rk,
        "include_unvested": bool(include_unvested),
        "is_simulated": is_simulated,
        "last_synced": last_synced,
        "summary": {
            "start_value": start_v,
            "end_value": end_v,
            "dollar_change": port_d_chg,
            "pct_change": port_pct_chg,
            "benchmark_pct_change": bench_pct,
            "alpha_pct": alpha_pct,
            "live_tracked_value": live_tracked_val,
            "static_value": static_total,
            "live_ticker_count": len({g["yahoo_symbol"] for g in active_groups}),
        },
        "series": series,
        "movers": movers,
        "top_gainers": top_gainers,
        "top_detractors": top_detractors,
    }


def sync_simplefin(setup_token_or_access_url=None):
    """
    Sync accounts, balances, and transactions using SimpleFIN Bridge.
    Supports Chase, Bank of America, Wells Fargo, Capital One, Vanguard, Schwab, and Fidelity.
    """
    token = (setup_token_or_access_url or get_setting("simplefin_access_url") or "").strip()
    if not token:
        return {"status": "error", "message": "No SimpleFIN token or access URL configured."}

    access_url = token
    # If the user pasted a base64 SimpleFIN Setup Token, claim the Access URL once
    if not token.startswith("http://") and not token.startswith("https://"):
        try:
            claim_url = base64.b64decode(token).decode("utf-8").strip()
            resp = requests.post(claim_url, timeout=15)
            if resp.status_code == 200 and resp.text.startswith("http"):
                access_url = resp.text.strip()
                set_setting("simplefin_access_url", access_url)
            else:
                return {"status": "error", "message": "Failed to claim SimpleFIN Setup Token (it may already be claimed)."}
        except Exception as e:
            return {"status": "error", "message": "Invalid SimpleFIN Setup Token: {0}".format(e)}
    else:
        set_setting("simplefin_access_url", access_url)

    try:
        resp = requests.get(access_url.rstrip("/") + "/accounts", timeout=20)
        if resp.status_code != 200:
            return {"status": "error", "message": "SimpleFIN HTTP {0}".format(resp.status_code)}
        payload = resp.json()
    except Exception as e:
        return {"status": "error", "message": "SimpleFIN connection failed: {0}".format(e)}

    conn = get_connection()
    rules = [
        dict(r)
        for r in conn.execute(
            "SELECT keyword, merchant_name, category, tx_type, priority FROM category_rules ORDER BY priority DESC"
        ).fetchall()
    ]
    accounts_synced = 0
    txs_imported = 0
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    for acc in payload.get("accounts", []):
        ext_id = str(acc.get("id", ""))
        org_name = acc.get("org", {}).get("name") or acc.get("org", {}).get("domain") or "Bank"
        acc_name = acc.get("name", "Account")
        bal = float(acc.get("balance", 0.0))

        # Normalize institution name to match our 7 main institutions
        org_up = org_name.upper()
        if "CHASE" in org_up or "JPMORGAN" in org_up:
            org_name = "Chase"
        elif "CAPITAL ONE" in org_up:
            org_name = "Capital One"
        elif "BANK OF AMERICA" in org_up or "BOFA" in org_up:
            org_name = "Bank of America"
        elif "WELLS FARGO" in org_up:
            org_name = "Wells Fargo"
        elif "VANGUARD" in org_up:
            org_name = "Vanguard"
        elif "FIDELITY" in org_up:
            org_name = "Fidelity"
        elif "SCHWAB" in org_up:
            org_name = "Charles Schwab"

        nm_upper = (acc_name + " " + org_name).upper()
        if any(k in nm_upper for k in ("CARD", "SAPPHIRE", "FREEDOM", "VENTURE", "QUICKSILVER", "VISA", "MASTERCARD", "AMEX", "CREDIT")):
            acc_type = "credit_card"
            bal = abs(bal)
        elif any(k in nm_upper for k in ("VANGUARD", "FIDELITY", "SCHWAB", "IRA", "401K", "BROKERAGE", "ROTH", "INDEX")):
            acc_type = "investment"
        elif "SAVINGS" in nm_upper:
            acc_type = "savings"
        else:
            acc_type = "checking"

        row = conn.execute("SELECT id FROM accounts WHERE external_id = ?", (ext_id,)).fetchone()
        if row:
            account_id = row["id"]
            conn.execute(
                "UPDATE accounts SET balance = ?, last_synced = ?, sync_source = 'simplefin' WHERE id = ?",
                (round(bal, 2), now_str, account_id),
            )
        else:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO accounts (name, institution, account_type, balance, sync_source, external_id, last_synced, is_demo)
                VALUES (?, ?, ?, ?, 'simplefin', ?, ?, 0)
                """,
                (acc_name, org_name, acc_type, round(bal, 2), ext_id, now_str),
            )
            account_id = cur.lastrowid
        accounts_synced += 1

        for tx in acc.get("transactions", []):
            ts = tx.get("posted") or tx.get("transacted_at") or 0
            tx_date = datetime.fromtimestamp(int(ts)).strftime("%Y-%m-%d") if ts else datetime.now().strftime("%Y-%m-%d")
            desc = tx.get("description") or tx.get("payee") or "Transaction"
            raw_amt = float(tx.get("amount", 0.0))
            norm_amount = -raw_amt  # SimpleFIN outflows are negative -> positive spend
            dedup = compute_tx_hash(account_id, tx_date, desc, norm_amount)
            if conn.execute("SELECT 1 FROM transactions WHERE dedup_hash = ?", (dedup,)).fetchone():
                continue
            merchant, category, tx_type = categorize_transaction(desc, "", norm_amount, acc_type, rules=rules)
            conn.execute(
                """
                INSERT INTO transactions (account_id, tx_date, description, merchant, amount, tx_type, category, raw_source, dedup_hash, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'simplefin', ?, 0)
                """,
                (account_id, tx_date, desc, merchant, round(norm_amount, 2), tx_type, category, dedup),
            )
            txs_imported += 1

    conn.commit()
    conn.close()
    return {"status": "ok", "accounts_synced": accounts_synced, "transactions_imported": txs_imported}


def sync_teller(access_token=None, cert_path=None, key_path=None, institution_name="Bank"):
    """
    Sync live bank & credit card accounts via Teller API (Free Developer Tier).
    Supports multiple linked enrollments across Chase, Bank of America, Wells Fargo, Capital One.
    """
    if cert_path:
        set_setting("teller_cert_path", cert_path)
    if key_path:
        set_setting("teller_key_path", key_path)

    if access_token:
        add_teller_enrollment(access_token.strip(), institution=institution_name)

    enrollments = get_teller_enrollments()
    if not enrollments:
        return {"status": "error", "message": "No Teller bank connections linked yet."}

    cert_tuple = get_teller_cert_paths()
    conn = get_connection()
    rules = [
        dict(r)
        for r in conn.execute(
            "SELECT keyword, merchant_name, category, tx_type, priority FROM category_rules ORDER BY priority DESC"
        ).fetchall()
    ]
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    accounts_synced = 0
    txs_imported = 0
    errors = []

    for enr in enrollments:
        tok = enr.get("access_token", "").strip()
        if not tok:
            continue
        try:
            resp = requests.get("https://api.teller.io/accounts", auth=(tok, ""), cert=cert_tuple, timeout=15)
            if resp.status_code != 200:
                errors.append("HTTP {0}: {1}".format(resp.status_code, resp.text[:120]))
                continue
            accounts_data = resp.json()
        except Exception as e:
            errors.append(str(e))
            continue

        for acc in accounts_data:
            ext_id = acc.get("id", "")
            inst_name = acc.get("institution", {}).get("name", "Bank")
            acc_name = acc.get("name", "Account")
            subtype = acc.get("subtype", "checking")
            acc_type = "credit_card" if acc.get("type") == "credit" else ("savings" if "saving" in subtype else "checking")
            mask = acc.get("last_four", "")

            bal = 0.0
            try:
                b_resp = requests.get(
                    "https://api.teller.io/accounts/{0}/balances".format(ext_id),
                    auth=(tok, ""),
                    cert=cert_tuple,
                    timeout=10,
                )
                if b_resp.status_code == 200:
                    b_json = b_resp.json()
                    bal = float(b_json.get("ledger") or b_json.get("available") or 0.0)
            except Exception:
                pass

            row = conn.execute("SELECT id FROM accounts WHERE external_id = ?", (ext_id,)).fetchone()
            if row:
                account_id = row["id"]
                conn.execute(
                    "UPDATE accounts SET balance = ?, last_synced = ?, sync_source = 'teller' WHERE id = ?",
                    (round(bal, 2), now_str, account_id),
                )
            else:
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO accounts (name, institution, account_type, mask, balance, sync_source, external_id, last_synced, is_demo)
                    VALUES (?, ?, ?, ?, ?, 'teller', ?, ?, 0)
                    """,
                    (acc_name, inst_name, acc_type, mask, round(bal, 2), ext_id, now_str),
                )
                account_id = cur.lastrowid
            accounts_synced += 1

            try:
                t_resp = requests.get(
                    "https://api.teller.io/accounts/{0}/transactions".format(ext_id),
                    auth=(tok, ""),
                    cert=cert_tuple,
                    timeout=15,
                )
                if t_resp.status_code == 200:
                    for tx in t_resp.json():
                        tx_date = tx.get("date")
                        desc = tx.get("description", "Transaction")
                        raw_amt = float(tx.get("amount", 0.0))
                        norm_amount = raw_amt if acc_type == "credit_card" else -raw_amt
                        dedup = compute_tx_hash(account_id, tx_date, desc, norm_amount)
                        if conn.execute("SELECT 1 FROM transactions WHERE dedup_hash = ?", (dedup,)).fetchone():
                            continue
                        merchant, category, tx_type = categorize_transaction(desc, "", norm_amount, acc_type, rules=rules)
                        conn.execute(
                            """
                            INSERT INTO transactions (account_id, tx_date, description, merchant, amount, tx_type, category, raw_source, dedup_hash, is_demo)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 'teller', ?, 0)
                            """,
                            (account_id, tx_date, desc, merchant, round(norm_amount, 2), tx_type, category, dedup),
                        )
                        txs_imported += 1
            except Exception:
                pass

    conn.commit()
    conn.close()
    if accounts_synced == 0 and errors:
        return {"status": "error", "message": "; ".join(errors)}
    return {"status": "ok", "accounts_synced": accounts_synced, "transactions_imported": txs_imported}
