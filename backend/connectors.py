import os
import base64
import json
from datetime import datetime
import requests
from backend.db import get_connection, compute_tx_hash, bump_db_stamp, BASE_DIR
from backend.categorizer import categorize_transaction

CERTS_DIR = os.path.join(BASE_DIR, "certs")
CASH_EQUIV_SYMBOLS = {"SPAXX", "FDRXX", "VMFXX", "SWVXX", "SNSXX", "CASH", "USD"}


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


def sync_live_market_prices():
    """
    100% Free live stock/ETF/mutual fund price sync via Yahoo Finance API.
    Updates all holdings across Vanguard, Fidelity, and Charles Schwab accounts.
    """
    conn = get_connection()
    rows = conn.execute("SELECT id, account_id, symbol, shares, current_price FROM holdings").fetchall()
    if not rows:
        conn.close()
        return {"updated": 0, "symbols": []}

    symbols = sorted(list({r["symbol"].upper() for r in rows if r["symbol"]}))
    live_quotes = {}

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    for sym in symbols:
        if sym in CASH_EQUIV_SYMBOLS:
            live_quotes[sym] = (1.0, 0.0)
            continue
        try:
            url = "https://query1.finance.yahoo.com/v8/finance/chart/{0}?interval=1d&range=2d".format(sym)
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
                price = meta.get("regularMarketPrice")
                prev = meta.get("chartPreviousClose") or meta.get("previousClose") or price
                if price and price > 0:
                    pct = ((price - prev) / prev * 100.0) if prev and prev > 0 else 0.0
                    live_quotes[sym] = (round(float(price), 2), round(float(pct), 2))
        except Exception:
            pass

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    updated_count = 0
    affected_accounts = set()

    for r in rows:
        sym = r["symbol"].upper()
        affected_accounts.add(r["account_id"])
        if sym in live_quotes:
            price, pct = live_quotes[sym]
            val = round(float(r["shares"]) * price, 2)
            conn.execute(
                "UPDATE holdings SET current_price = ?, current_value = ?, day_change_pct = ?, last_updated = ? WHERE id = ?",
                (price, val, pct, now_str, r["id"]),
            )
            updated_count += 1

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
    return {"updated": updated_count, "symbols": list(live_quotes.keys()), "timestamp": now_str}


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
