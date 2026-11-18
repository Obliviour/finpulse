import os
import re
import csv
import io
import hashlib
from datetime import datetime
from backend.db import get_connection, compute_tx_hash, IMPORTS_DIR
from backend.categorizer import categorize_transaction
from backend.pdf_parser import parse_pdf_statement, parse_pdf_statement_bundles


def parse_date(date_str):
    """Parse common US bank date formats into YYYY-MM-DD."""
    if not date_str:
        return None
    s = str(date_str).strip().split(" ")[0]
    # Remove any 'as of' or extra text
    s = re.sub(r"[^0-9/\-\.]", "", s)
    formats = [
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%Y/%m/%d",
        "%Y%m%d",
        "%m-%d-%Y",
    ]
    for fmt in formats:
        try:
            # Handle 8-digit OFX date like 20261015120000
            cand = s[:8] if fmt == "%Y%m%d" and len(s) >= 8 else s
            return datetime.strptime(cand, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def parse_float(val):
    """Safely parse currency strings like '$1,234.56', '($45.00)', '--', 'N/A'."""
    if val is None:
        return 0.0
    s = str(val).strip()
    if not s or s in ("--", "n/a", "N/A", "None"):
        return 0.0
    is_neg = False
    if s.startswith("(") and s.endswith(")"):
        is_neg = True
        s = s[1:-1]
    s = re.sub(r"[^0-9\.\-]", "", s)
    if not s or s == "-" or s == ".":
        return 0.0
    try:
        num = float(s)
        return -abs(num) if is_neg else num
    except ValueError:
        return 0.0


def classify_asset_class(symbol, name=""):
    """Classify ticker symbol into asset class for portfolio allocation charts."""
    sym = (symbol or "").upper().strip()
    nm = (name or "").upper()
    if sym in ("SPAXX", "FDRXX", "VMFXX", "SWVXX", "SNSXX", "CASH", "USD", "HEQ-CASH") or "MONEY MARKET" in nm or "SWEEP" in nm or "CASH RESERVE" in nm:
        return "Cash & Money Market"
    if sym in ("BND", "BNDX", "AGG", "TLT", "SCHZ", "FXNAX", "VBTLX", "SGOV", "USFR") or "BOND" in nm or "TREASURY" in nm:
        return "Bonds & Fixed Income"
    if sym in ("VXUS", "IXUS", "VEA", "VWO", "SCHF", "FTIHX", "VTIAX", "VIDMX", "VTMGX", "NTDOY", "SONY", "SFGYY") or "INTERNATIONAL" in nm or "TOTAL INTL" in nm or "DEVELOPED MKTS" in nm:
        return "International Equities"
    if sym in ("SCHD", "VYM", "VIG", "DGRO", "JEPI", "JEPQ", "ARCC", "KO") or "DIVIDEND" in nm:
        return "Dividend & Value"
    if sym in ("VNQ", "SCHH", "O") or "REAL ESTATE" in nm or "REIT" in nm:
        return "Real Estate (REITs)"
    if sym in ("VTI", "VOO", "SPY", "IVV", "FXAIX", "VFIAX", "VFFSX", "VIIIX", "VIEIX", "VEXAX", "VTTSX", "SPYX", "SWPPX", "VTSAX", "SWTSX", "FZROX", "QQQ", "QQQM", "HEQ-INV") or "500 INDEX" in nm or "EXT MARKET IDX" in nm:
        return "US Index / Core Equities"
    if sym.endswith("-RSU") or "UNVESTED" in nm:
        return "Unvested Equity (RSUs)"
    return "Individual Stocks & Sector"


def detect_institution_from_content(filename, text):
    """Auto-detect which of the 7 institutions (or OFX/QFX) a file belongs to."""
    fn_lower = (filename or "").lower()
    head = text[:3000].upper()

    if fn_lower.endswith(".ofx") or fn_lower.endswith(".qfx") or "<OFX>" in head or "OFXHEADER:" in head:
        return "ofx"

    if "CHASE" in fn_lower or ("TRANSACTION DATE,POST DATE,DESCRIPTION,CATEGORY,TYPE,AMOUNT" in head) or ("DETAILS,POSTING DATE,DESCRIPTION,AMOUNT,TYPE,BALANCE" in head):
        return "Chase"
    if "CAPITAL" in fn_lower or "CARD NO.,DESCRIPTION,CATEGORY,DEBIT,CREDIT" in head:
        return "Capital One"
    if "VANGUARD" in fn_lower or ("ACCOUNT NUMBER,INVESTMENT NAME,SYMBOL,SHARES,SHARE PRICE,TOTAL VALUE" in head) or ("SETTLEMENT DATE,TRANSACTION TYPE,TRANSACTION DESCRIPTION,INVESTMENT NAME" in head):
        return "Vanguard"
    if "SCHWAB" in fn_lower or "POSITIONS FOR ACCOUNT" in head or ("DATE,ACTION,SYMBOL,DESCRIPTION,QUANTITY,PRICE,FEES & COMM,AMOUNT" in head):
        return "Charles Schwab"
    if "FIDELITY" in fn_lower or ("ACCOUNT NUMBER,ACCOUNT NAME,SYMBOL,DESCRIPTION,QUANTITY,LAST PRICE" in head) or ("RUN DATE,ACTION,SYMBOL,DESCRIPTION" in head):
        return "Fidelity"
    if "BOA" in fn_lower or "BANK OF AMERICA" in fn_lower or ("TOTAL CREDITS" in head and "RUNNING BAL." in head) or ("POSTED DATE,REFERENCE NUMBER,PAYEE,ADDRESS,AMOUNT" in head):
        return "Bank of America"
    if "WELLS" in fn_lower or "WF" in fn_lower:
        return "Wells Fargo"

    # Check if headerless Wells Fargo 5-column CSV: "MM/DD/YYYY","-12.34","*","","DESCRIPTION"
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if lines:
        sample_row = next(csv.reader([lines[0]]))
        if len(sample_row) == 5 and parse_date(sample_row[0]) and sample_row[2] == "*":
            return "Wells Fargo"

    return "Generic CSV"


def get_or_create_account(conn, institution, account_name=None, account_type="credit_card", sync_source="csv"):
    cur = conn.cursor()
    if account_name:
        row = cur.execute(
            "SELECT id, account_type FROM accounts WHERE LOWER(name) = LOWER(?) AND LOWER(institution) = LOWER(?)",
            (account_name, institution),
        ).fetchone()
        if row:
            return row["id"], row["account_type"]

    # Check existing non-demo account for this institution & type
    row = cur.execute(
        "SELECT id, account_type FROM accounts WHERE LOWER(institution) = LOWER(?) AND account_type = ? ORDER BY is_demo ASC, id ASC LIMIT 1",
        (institution, account_type),
    ).fetchone()
    if row:
        return row["id"], row["account_type"]

    default_name = account_name or "{0} {1}".format(institution, account_type.replace("_", " ").title())
    cur.execute(
        """
        INSERT INTO accounts (name, institution, account_type, balance, credit_limit, sync_source, last_synced, is_demo)
        VALUES (?, ?, ?, 0.0, ?, ?, ?, 0)
        """,
        (
            default_name,
            institution,
            account_type,
            15000.0 if account_type == "credit_card" else 0.0,
            sync_source,
            datetime.now().strftime("%Y-%m-%d %H:%M"),
        ),
    )
    conn.commit()
    return cur.lastrowid, account_type


def parse_ofx_qfx(text, account_id=None, institution_hint="Chase"):
    """Parse standard OFX / QFX files for both bank/card transactions and investment positions."""
    txs = []
    holdings = []

    # Extract bank/card transactions (<STMTTRN>...</STMTTRN>)
    blocks = re.findall(r"<STMTTRN>(.*?)(?:</STMTTRN>|(?=<STMTTRN>)|(?=</BANKTRANLIST>))", text, flags=re.DOTALL | re.IGNORECASE)
    for b in blocks:
        dt_m = re.search(r"<DTPOSTED>\s*([0-9]{8})", b, re.IGNORECASE)
        amt_m = re.search(r"<TRNAMT>\s*([\-0-9\.]+)", b, re.IGNORECASE)
        name_m = re.search(r"<NAME>\s*([^\r\n<]+)", b, re.IGNORECASE)
        memo_m = re.search(r"<MEMO>\s*([^\r\n<]+)", b, re.IGNORECASE)
        if dt_m and amt_m:
            dt = parse_date(dt_m.group(1))
            raw_amt = parse_float(amt_m.group(1))
            desc = (name_m.group(1).strip() if name_m else "") + (" " + memo_m.group(1).strip() if memo_m else "")
            desc = desc.strip() or "OFX Transaction"
            # In OFX, charges are negative (-45.00), credits/income are positive (+45.00).
            # Our normalized convention: positive = spending outflow, negative = income/payment inflow.
            txs.append({
                "tx_date": dt,
                "description": desc,
                "amount": -raw_amt,
                "raw_category": "",
            })

    # Extract investment positions (<INVPOS>...</INVPOS>)
    pos_blocks = re.findall(r"<INVPOS>(.*?)</INVPOS>", text, flags=re.DOTALL | re.IGNORECASE)
    # Build secid -> ticker map from <SECINFO>
    sec_map = {}
    for sec in re.findall(r"<SECINFO>(.*?)</SECINFO>", text, flags=re.DOTALL | re.IGNORECASE):
        uid = re.search(r"<UNIQUEID>\s*([^\r\n<]+)", sec, re.IGNORECASE)
        tkr = re.search(r"<TICKER>\s*([^\r\n<]+)", sec, re.IGNORECASE)
        snm = re.search(r"<SECNAME>\s*([^\r\n<]+)", sec, re.IGNORECASE)
        if uid:
            sec_map[uid.group(1).strip()] = (
                tkr.group(1).strip() if tkr else uid.group(1).strip(),
                snm.group(1).strip() if snm else "Security",
            )

    for pb in pos_blocks:
        uid_m = re.search(r"<UNIQUEID>\s*([^\r\n<]+)", pb, re.IGNORECASE)
        units_m = re.search(r"<UNITS>\s*([\-0-9\.]+)", pb, re.IGNORECASE)
        price_m = re.search(r"<UNITPRICE>\s*([\-0-9\.]+)", pb, re.IGNORECASE)
        mkt_m = re.search(r"<MKTVAL>\s*([\-0-9\.]+)", pb, re.IGNORECASE)
        if uid_m and units_m:
            uid = uid_m.group(1).strip()
            sym, secname = sec_map.get(uid, (uid, uid))
            shares = parse_float(units_m.group(1))
            price = parse_float(price_m.group(1)) if price_m else 0.0
            mkt = parse_float(mkt_m.group(1)) if mkt_m else shares * price
            holdings.append({
                "symbol": sym,
                "name": secname,
                "shares": shares,
                "current_price": price,
                "current_value": mkt,
                "cost_basis_total": mkt * 0.85,
            })

    return txs, holdings


def ingest_file_content(filename, text, institution_override=None, account_id_override=None):
    """
    Universal parser for Chase, Capital One, Bank of America, Wells Fargo,
    Fidelity, Charles Schwab, Vanguard, and OFX/QFX files.
    """
    conn = get_connection()
    rules = [
        dict(r)
        for r in conn.execute(
            "SELECT keyword, merchant_name, category, tx_type, priority FROM category_rules ORDER BY priority DESC, LENGTH(keyword) DESC"
        ).fetchall()
    ]

    detected = institution_override or detect_institution_from_content(filename, text)
    tx_records = []
    holding_records = []
    target_account_type = "credit_card"

    if detected == "ofx" or filename.lower().endswith((".ofx", ".qfx")):
        tx_records, holding_records = parse_ofx_qfx(text)
        if holding_records and not tx_records:
            target_account_type = "investment"
        if not institution_override or institution_override == "ofx":
            detected = "Chase"
    else:
        lines = [l for l in text.splitlines() if l.strip()]
        # Handle Vanguard or Bank of America multi-section or header-prefixed CSVs
        if detected == "Wells Fargo" and lines and len(next(csv.reader([lines[0]]))) == 5 and parse_date(next(csv.reader([lines[0]]))[0]):
            # Headerless Wells Fargo format: "Date","Amount","*","CheckNo","Description"
            for row in csv.reader(lines):
                if len(row) >= 5:
                    dt = parse_date(row[0])
                    raw_amt = parse_float(row[1])
                    desc = row[4].strip()
                    if dt:
                        tx_records.append({
                            "tx_date": dt,
                            "description": desc,
                            "amount": -raw_amt,  # WF negative = outflow -> positive spend
                            "raw_category": "",
                        })
        else:
            # Find CSV header line(s)
            current_headers = None
            for line in lines:
                parsed_row = next(csv.reader([line]))
                clean_cols = [c.strip() for c in parsed_row]
                upper_cols = [c.upper() for c in clean_cols]

                # Check if this line is a header row
                if any(h in upper_cols for h in ("TRANSACTION DATE", "POSTING DATE", "POSTED DATE", "RUN DATE", "DATE", "SETTLEMENT DATE", "SYMBOL", "INVESTMENT NAME")):
                    if len(clean_cols) >= 3:
                        current_headers = upper_cols
                        continue

                if not current_headers or len(clean_cols) < 3:
                    continue

                row_dict = {}
                for idx, h in enumerate(current_headers):
                    if idx < len(clean_cols):
                        row_dict[h] = clean_cols[idx]

                # Check if this is an Investment Holdings row (Vanguard / Fidelity / Schwab)
                if ("SYMBOL" in row_dict and ("QUANTITY" in row_dict or "SHARES" in row_dict) and ("CURRENT VALUE" in row_dict or "MARKET VALUE" in row_dict or "TOTAL VALUE" in row_dict or "LAST PRICE" in row_dict or "SHARE PRICE" in row_dict)):
                    target_account_type = "investment"
                    sym = row_dict.get("SYMBOL", "").strip().upper()
                    if not sym or sym in ("TOTAL", "ACCOUNT TOTAL", "PENDING ACTIVITY"):
                        continue
                    name = row_dict.get("DESCRIPTION") or row_dict.get("INVESTMENT NAME") or sym
                    shares = parse_float(row_dict.get("QUANTITY") or row_dict.get("SHARES") or 1.0)
                    price = parse_float(row_dict.get("LAST PRICE") or row_dict.get("PRICE") or row_dict.get("SHARE PRICE") or 1.0)
                    val = parse_float(row_dict.get("CURRENT VALUE") or row_dict.get("MARKET VALUE") or row_dict.get("TOTAL VALUE") or (shares * price))
                    cost = parse_float(row_dict.get("COST BASIS TOTAL") or row_dict.get("COST BASIS") or (val * 0.82))
                    if val > 0 or shares > 0:
                        holding_records.append({
                            "symbol": sym,
                            "name": name,
                            "shares": shares if shares > 0 else val,
                            "current_price": price if price > 0 else 1.0,
                            "current_value": val if val > 0 else shares * price,
                            "cost_basis_total": cost if cost > 0 else val,
                        })
                    continue

                # Otherwise parse as a Transaction row
                dt_raw = (
                    row_dict.get("TRANSACTION DATE")
                    or row_dict.get("POSTING DATE")
                    or row_dict.get("POSTED DATE")
                    or row_dict.get("RUN DATE")
                    or row_dict.get("SETTLEMENT DATE")
                    or row_dict.get("DATE")
                )
                dt = parse_date(dt_raw)
                if not dt:
                    continue

                desc = (
                    row_dict.get("DESCRIPTION")
                    or row_dict.get("PAYEE")
                    or row_dict.get("TRANSACTION DESCRIPTION")
                    or row_dict.get("ACTION")
                    or row_dict.get("MERCHANT")
                    or "Transaction"
                )
                raw_cat = row_dict.get("CATEGORY") or row_dict.get("TYPE") or ""

                # Capital One has separate DEBIT and CREDIT columns
                if "DEBIT" in row_dict and "CREDIT" in row_dict:
                    debit = parse_float(row_dict.get("DEBIT"))
                    credit = parse_float(row_dict.get("CREDIT"))
                    norm_amount = debit if debit > 0 else -abs(credit)
                else:
                    raw_amt = parse_float(row_dict.get("AMOUNT") or row_dict.get("NET AMOUNT") or 0.0)
                    # In Chase/BoA/Wells Fargo/Schwab/Fidelity exports, negative amount = charge/outflow (-45.20),
                    # whereas positive amount = payment/deposit (+45.20).
                    # Exception: some custom CSVs where expenses are already positive.
                    if "DETAILS" in row_dict:
                        # Chase checking CSV
                        target_account_type = "checking"
                    norm_amount = -raw_amt

                if abs(norm_amount) < 0.001:
                    continue

                tx_records.append({
                    "tx_date": dt,
                    "description": desc,
                    "amount": norm_amount,
                    "raw_category": raw_cat,
                })

    if account_id_override:
        row = conn.execute("SELECT id, account_type, institution FROM accounts WHERE id = ?", (account_id_override,)).fetchone()
        if row:
            account_id = row["id"]
            target_account_type = row["account_type"]
            detected = row["institution"]
        else:
            account_id, target_account_type = get_or_create_account(conn, detected, account_type=target_account_type)
    else:
        if detected in ("Vanguard", "Fidelity", "Charles Schwab") and holding_records:
            target_account_type = "investment"
        account_id, target_account_type = get_or_create_account(conn, detected, account_type=target_account_type)

    imported_count = 0
    skipped_count = 0

    # Insert transactions with automatic deduplication
    for rec in tx_records:
        dedup = compute_tx_hash(account_id, rec["tx_date"], rec["description"], rec["amount"])
        exists = conn.execute("SELECT 1 FROM transactions WHERE dedup_hash = ?", (dedup,)).fetchone()
        if exists:
            skipped_count += 1
            continue

        merchant, category, tx_type = categorize_transaction(
            rec["description"],
            rec.get("raw_category", ""),
            rec["amount"],
            target_account_type,
            rules=rules,
        )
        conn.execute(
            """
            INSERT INTO transactions
            (account_id, tx_date, description, merchant, amount, tx_type, category, raw_source, dedup_hash, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                account_id,
                rec["tx_date"],
                rec["description"],
                merchant,
                round(rec["amount"], 2),
                tx_type,
                category,
                filename,
                dedup,
            ),
        )
        imported_count += 1

    # Upsert investment holdings
    for h in holding_records:
        asset_class = classify_asset_class(h["symbol"], h["name"])
        conn.execute(
            """
            INSERT OR REPLACE INTO holdings
            (account_id, symbol, name, shares, cost_basis_total, current_price, current_value, asset_class, last_updated, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                account_id,
                h["symbol"],
                h["name"],
                round(h["shares"], 4),
                round(h["cost_basis_total"], 2),
                round(h["current_price"], 2),
                round(h["current_value"], 2),
                asset_class,
                datetime.now().strftime("%Y-%m-%d %H:%M"),
            ),
        )
        imported_count += 1

    # Update account balance if investment holdings were updated
    if holding_records:
        tot_val = conn.execute(
            "SELECT COALESCE(SUM(current_value), 0) as total FROM holdings WHERE account_id = ?",
            (account_id,),
        ).fetchone()["total"]
        conn.execute(
            "UPDATE accounts SET balance = ?, last_synced = ? WHERE id = ?",
            (round(tot_val, 2), datetime.now().strftime("%Y-%m-%d %H:%M"), account_id),
        )
    else:
        conn.execute(
            "UPDATE accounts SET last_synced = ? WHERE id = ?",
            (datetime.now().strftime("%Y-%m-%d %H:%M"), account_id),
        )

    conn.execute(
        "INSERT INTO imported_files (filename, institution, records_imported, records_skipped) VALUES (?, ?, ?, ?)",
        (filename, detected, imported_count, skipped_count),
    )
    conn.commit()
    conn.close()

    return {
        "filename": filename,
        "institution": detected,
        "account_id": account_id,
        "imported": imported_count,
        "skipped": skipped_count,
        "transactions_found": len(tx_records),
        "holdings_found": len(holding_records),
    }


FOLDER_INSTITUTION_MAP = {
    "chase": "Chase",
    "capital_one": "Capital One",
    "capital one": "Capital One",
    "bank_of_america": "Bank of America",
    "bank of america": "Bank of America",
    "boa": "Bank of America",
    "wells_fargo": "Wells Fargo",
    "wells fargo": "Wells Fargo",
    "vanguard": "Vanguard",
    "fidelity": "Fidelity",
    "charles_schwab": "Charles Schwab",
    "charles schwab": "Charles Schwab",
    "schwab": "Charles Schwab",
}


def ensure_institution_folders():
    if not os.path.exists(IMPORTS_DIR):
        os.makedirs(IMPORTS_DIR)
    for folder in ("Chase", "Capital_One", "Bank_of_America", "Wells_Fargo", "Vanguard", "Fidelity", "Charles_Schwab"):
        p = os.path.join(IMPORTS_DIR, folder)
        if not os.path.exists(p):
            os.makedirs(p)


def ingest_pdf_bytes(filename, pdf_bytes, institution_override=None, account_id_override=None):
    """Parse a PDF bank/card/brokerage/mortgage statement and insert transactions & holdings into SQLite."""
    bundles = parse_pdf_statement_bundles(
        filename, pdf_bytes, institution_override=institution_override
    )
    if not bundles:
        return {
            "filename": filename,
            "institution": institution_override or "Unknown",
            "account_id": None,
            "imported": 0,
            "skipped": 0,
            "transactions_found": 0,
            "holdings_found": 0,
        }

    conn = get_connection()
    rules = [
        dict(r)
        for r in conn.execute(
            "SELECT keyword, merchant_name, category, tx_type, priority FROM category_rules ORDER BY priority DESC, LENGTH(keyword) DESC"
        ).fetchall()
    ]

    total_imported = 0
    total_skipped = 0
    total_txs_found = 0
    total_holdings_found = 0
    first_acct_id = None
    first_inst = bundles[0]["institution"]

    for b in bundles:
        inst = institution_override or b["institution"]
        acct_name = b.get("account_name")
        acct_type = b.get("account_type", "credit_card")
        mask = b.get("mask", "")
        stmt_date = b.get("statement_date", "")
        stmt_bal = b.get("balance")
        stmt_lim = b.get("credit_limit", 0.0)
        tx_records = b.get("transactions", [])
        holding_records = b.get("holdings", [])

        total_txs_found += len(tx_records)
        total_holdings_found += len(holding_records)

        if account_id_override:
            row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id_override,)).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM accounts WHERE LOWER(name) = LOWER(?) AND LOWER(institution) = LOWER(?)",
                (acct_name, inst),
            ).fetchone()

        if row:
            account_id = row["id"]
            acct_type = row["account_type"]
            prev_stmt_date = row["external_id"] or ""
        else:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO accounts (name, institution, account_type, mask, balance, credit_limit, sync_source, external_id, last_synced, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, 'pdf', ?, ?, 0)
                """,
                (
                    acct_name,
                    inst,
                    acct_type,
                    mask,
                    round(stmt_bal, 2) if stmt_bal is not None else 0.0,
                    round(stmt_lim, 2) if stmt_lim else (15000.0 if acct_type == "credit_card" else 0.0),
                    stmt_date,
                    datetime.now().strftime("%Y-%m-%d %H:%M"),
                ),
            )
            conn.commit()
            account_id = cur.lastrowid
            prev_stmt_date = ""

        if first_acct_id is None:
            first_acct_id = account_id

        is_newer_or_same = (not prev_stmt_date) or (stmt_date >= prev_stmt_date)

        for rec in tx_records:
            dedup = compute_tx_hash(account_id, rec["tx_date"], rec["description"], rec["amount"])
            if conn.execute("SELECT 1 FROM transactions WHERE dedup_hash = ?", (dedup,)).fetchone():
                total_skipped += 1
                continue
            merchant, category, tx_type = categorize_transaction(
                rec["description"], rec.get("raw_category", ""), rec["amount"], acct_type, rules=rules
            )
            conn.execute(
                """
                INSERT INTO transactions
                (account_id, tx_date, description, merchant, amount, tx_type, category, raw_source, dedup_hash, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (account_id, rec["tx_date"], rec["description"], merchant, round(rec["amount"], 2), tx_type, category, filename, dedup),
            )
            total_imported += 1

        if is_newer_or_same and holding_records:
            for h in holding_records:
                asset_class = classify_asset_class(h["symbol"], h["name"])
                conn.execute(
                    """
                    INSERT OR REPLACE INTO holdings
                    (account_id, symbol, name, shares, cost_basis_total, current_price, current_value, asset_class, last_updated, is_demo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        account_id,
                        h["symbol"],
                        h["name"],
                        round(h["shares"], 4),
                        round(h["cost_basis_total"], 2),
                        round(h["current_price"], 2),
                        round(h["current_value"], 2),
                        asset_class,
                        datetime.now().strftime("%Y-%m-%d %H:%M"),
                    ),
                )
                total_imported += 1

        # Update account balance & credit limit only if this statement is >= the latest statement seen for this account
        if is_newer_or_same:
            new_bal = stmt_bal
            if new_bal is None and holding_records:
                new_bal = conn.execute(
                    "SELECT COALESCE(SUM(current_value), 0) as total FROM holdings WHERE account_id = ?",
                    (account_id,),
                ).fetchone()["total"]

            if new_bal is not None and stmt_lim and stmt_lim > 0:
                conn.execute(
                    "UPDATE accounts SET balance = ?, credit_limit = ?, external_id = ?, last_synced = ? WHERE id = ?",
                    (round(new_bal, 2), round(stmt_lim, 2), stmt_date, datetime.now().strftime("%Y-%m-%d %H:%M"), account_id),
                )
            elif new_bal is not None:
                conn.execute(
                    "UPDATE accounts SET balance = ?, external_id = ?, last_synced = ? WHERE id = ?",
                    (round(new_bal, 2), stmt_date, datetime.now().strftime("%Y-%m-%d %H:%M"), account_id),
                )
            else:
                conn.execute(
                    "UPDATE accounts SET last_synced = ? WHERE id = ?",
                    (datetime.now().strftime("%Y-%m-%d %H:%M"), account_id),
                )

    conn.execute(
        "INSERT INTO imported_files (filename, institution, records_imported, records_skipped) VALUES (?, ?, ?, ?)",
        (filename, first_inst, total_imported, total_skipped),
    )
    conn.commit()
    conn.close()

    return {
        "filename": filename,
        "institution": first_inst,
        "account_id": first_acct_id,
        "imported": total_imported,
        "skipped": total_skipped,
        "transactions_found": total_txs_found,
        "holdings_found": total_holdings_found,
    }


def scan_watch_folder():
    """Recursively scan `imports/` (excluding `samples/`) for any PDF, CSV, OFX, or QFX files and ingest new records."""
    ensure_institution_folders()
    results = []
    for root, dirs, files in os.walk(IMPORTS_DIR):
        # Skip the samples directory
        dirs[:] = [d for d in dirs if d.lower() != "samples"]
        folder_name = os.path.basename(root).lower()
        inst_hint = FOLDER_INSTITUTION_MAP.get(folder_name)

        for fname in sorted(files):
            fpath = os.path.join(root, fname)
            if not os.path.isfile(fpath):
                continue
            if fname.lower().endswith(".pdf"):
                with open(fpath, "rb") as f:
                    pdf_bytes = f.read()
                res = ingest_pdf_bytes(fname, pdf_bytes, institution_override=inst_hint)
                results.append(res)
            elif fname.lower().endswith((".csv", ".ofx", ".qfx", ".tsv")):
                with io.open(fpath, "r", encoding="utf-8-sig", errors="replace") as f:
                    content = f.read()
                res = ingest_file_content(fname, content, institution_override=inst_hint)
                results.append(res)
    return results


def scan_user_downloads_folder():
    """
    Scan the user's Windows `Downloads` folder for any PDF, CSV, OFX, or QFX files that match
    Chase, Capital One, Bank of America, Wells Fargo, Vanguard, Fidelity, Charles Schwab, PayPal, or Mortgage.
    """
    ensure_institution_folders()
    downloads_dir = os.path.join(os.path.expanduser("~"), "Downloads")
    if not os.path.exists(downloads_dir):
        return []

    seen_hashes = set()
    results = []
    for fname in sorted(os.listdir(downloads_dir)):
        fpath = os.path.join(downloads_dir, fname)
        if not os.path.isfile(fpath):
            continue
        fn_low = fname.lower()
        if fn_low.endswith(".pdf"):
            if any(k in fn_low for k in ("chase", "capital", "boa", "bank", "wells", "vanguard", "vg ", "fidelity", "schwab", "statement", "stmt", "estatement", "account", "mortgage")):
                try:
                    with open(fpath, "rb") as f:
                        pdf_bytes = f.read()
                    file_hash = hashlib.sha256(pdf_bytes).hexdigest()
                    if file_hash in seen_hashes:
                        continue
                    seen_hashes.add(file_hash)
                    res = ingest_pdf_bytes(fname, pdf_bytes)
                    if res.get("transactions_found", 0) > 0 or res.get("holdings_found", 0) > 0 or res.get("account_id"):
                        results.append(res)
                except Exception:
                    continue
        elif fn_low.endswith((".csv", ".ofx", ".qfx")):
            try:
                with io.open(fpath, "r", encoding="utf-8-sig", errors="replace") as f:
                    content = f.read()
            except Exception:
                continue
            detected = detect_institution_from_content(fname, content)
            if detected in ("Chase", "Capital One", "Bank of America", "Wells Fargo", "Vanguard", "Fidelity", "Charles Schwab", "ofx"):
                res = ingest_file_content(fname, content)
                if res.get("transactions_found", 0) > 0 or res.get("holdings_found", 0) > 0:
                    results.append(res)
    return results

