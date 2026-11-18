import io
import re
import base64
import zlib
from datetime import datetime
from backend.profile_loader import get_pdf_account_aliases

MONTH_MAP = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
    "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "APRIL": 4, "JUNE": 6,
    "JULY": 7, "AUGUST": 8, "SEPTEMBER": 9, "OCTOBER": 10, "NOVEMBER": 11, "DECEMBER": 12,
}

FIDELITY_NAME_TO_SYMBOL = {
    "FIDELITY GOVERNMENT MONEY": ("SPAXX", "Fidelity Government Money Market"),
    "FIDELITY 500 INDEX FUND": ("FXAIX", "Fidelity 500 Index Fund"),
    "MFIDELITY 500 INDEX FUND": ("FXAIX", "Fidelity 500 Index Fund"),
    "GLOBAL X FDS ARTIFICIAL ETF": ("AIQ", "Global X Artificial Intelligence & Tech ETF"),
    "SPDR SERIES TRUST STATE STREET": ("SPYX", "SPDR S&P 500 Fossil Fuel Reserves Free ETF"),
    "VANGUARD WORLD FD INF TECH ETF": ("VGT", "Vanguard Information Technology ETF"),
    "ALASKA AIR GROUP": ("ALK", "Alaska Air Group Inc."),
    "AMAZON.COM INC": ("AMZN", "Amazon.com Inc."),
    "APPLE INC": ("AAPL", "Apple Inc."),
    "ARES CAPITAL CORP": ("ARCC", "Ares Capital Corp."),
    "DELTA AIR LINES": ("DAL", "Delta Air Lines Inc."),
    "LOCKHEED MARTIN": ("LMT", "Lockheed Martin Corp."),
    "NETFLIX INC": ("NFLX", "Netflix Inc."),
    "NINTENDO CO LTD": ("NTDOY", "Nintendo Co. Ltd. ADR"),
    "SONY GROUP CORPORATION": ("SONY", "Sony Group Corp. ADR"),
    "SONY FINANCIAL GROUP": ("SFGYY", "Sony Financial Group Inc."),
    "WILLIAMS-SONOMA": ("WSM", "Williams-Sonoma Inc."),
    "KROGER CO": ("KR", "The Kroger Co."),
}


def clean_num(s):
    if not s:
        return 0.0
    s = str(s).strip()
    is_neg = False
    if s.startswith("-") or s.endswith("-") or (s.startswith("(") and s.endswith(")")):
        is_neg = True
    c = re.sub(r"[^0-9\.]", "", s)
    if not c or c == ".":
        return 0.0
    try:
        val = float(c)
        return -abs(val) if is_neg else val
    except ValueError:
        return 0.0


def extract_Structured_pages(pdf_bytes, maxpages=18, page_numbers=None):
    """
    Extract horizontal rows per page using pdfminer coordinates `(y0, x0, text)`.
    Returns list of pages, where each page is a list of `(row_str, [(x0, text), ...])`.
    """
    pages_out = []
    try:
        from pdfminer.high_level import extract_pages
        from pdfminer.layout import LTTextContainer, LTTextLine, LAParams

        laparams = LAParams(line_margin=0.1, char_margin=1.5)
        for page_layout in extract_pages(
            io.BytesIO(pdf_bytes),
            laparams=laparams,
            maxpages=0 if page_numbers is not None else maxpages,
            page_numbers=page_numbers,
        ):
            items = []
            for elem in page_layout:
                if isinstance(elem, LTTextContainer):
                    for line in elem:
                        if isinstance(line, LTTextLine):
                            t = line.get_text().strip()
                            if t:
                                items.append((line.bbox[1], line.bbox[0], re.sub(r"\s+", " ", t)))
            items.sort(key=lambda x: (-round(x[0] / 3.0), x[1]))
            merged = []
            for y, x, t in items:
                if merged and abs(merged[-1][0] - y) <= 3.5:
                    merged[-1][1].append((x, t))
                else:
                    merged.append((y, [(x, t)]))
            page_rows = []
            for y, r_items in merged:
                r_items.sort(key=lambda z: z[0])
                row_str = "   ".join(z[1] for z in r_items)
                page_rows.append((row_str, r_items))
            pages_out.append(page_rows)
    except Exception:
        pass
    return pages_out


def extract_text_from_pdf_bytes(pdf_bytes, maxpages=16):
    pages = extract_Structured_pages(pdf_bytes, maxpages=maxpages)
    if pages:
        return "\n".join(r[0] for p in pages for r in p)
    return ""


def parse_schwab_ascii85_pdf(filename, pdf_bytes):
    """Decode Charles Schwab Stock Plan Services Account Statement PDFs that use ASCII85Decode+FlateDecode."""
    aliases = get_pdf_account_aliases()
    ticker = aliases.get("schwab_ticker") or "STOCK"
    acct_name = aliases.get("schwab_account_name") or "Charles Schwab Equity Awards"
    mask = aliases.get("schwab_mask") or "EQUITY"

    streams = []
    for m in re.finditer(rb"Filter\s*\[/ASCII85Decode/FlateDecode\]>>stream\r?\n(.*?)\r?\nendstream", pdf_bytes, re.DOTALL):
        s = m.group(1).strip()
        if s.endswith(b"~>"):
            s = s[:-2]
        try:
            dec = zlib.decompress(base64.a85decode(s))
            tokens = [t.decode("latin1", "ignore") for t in re.findall(rb"\(([^)]*)\)", dec)]
            streams.append("".join(tokens))
        except Exception:
            continue

    full = "\n".join(streams)
    m_dt = re.search(r"(20\d{2}-\d{2}-\d{2})", filename)
    stmt_date = m_dt.group(1) if m_dt else datetime.now().strftime("%Y-%m-%d")

    txs = []
    for dm in re.finditer(r"(20\d{2}-\d{2}-\d{2})\s*00:00:00\s*\$([\d,]+\.\d{2})\s*Dividend(?!\s*Reinvestment)", full):
        dt = dm.group(1)
        amt = clean_num(dm.group(2))
        if amt > 0:
            txs.append({
                "tx_date": dt,
                "description": "Charles Schwab {0} Cash Dividend".format(ticker),
                "amount": -abs(amt),
                "raw_category": "Income",
            })

    return [{
        "institution": "Charles Schwab",
        "account_name": acct_name,
        "account_type": "investment",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": None,
        "credit_limit": 0.0,
        "transactions": txs,
        "holdings": [],
    }]


def parse_schwab_equity_awards_pdf(filename, pdf_bytes):
    """Fast parser for Charles Schwab Equity Awards Details PDFs (reads only pages 1 and 13)."""
    aliases = get_pdf_account_aliases()
    pages = extract_Structured_pages(pdf_bytes, page_numbers=[0, 12])
    text = "\n".join(r[0] for p in pages for r in p)

    sym_hint = aliases.get("schwab_ticker")
    if sym_hint:
        m_price = re.search(re.escape(sym_hint) + r"\s+\$([\d,]+\.\d{2})", text)
        ticker = sym_hint
    else:
        m_price = re.search(r"\b([A-Z]{2,5})\s+\$([\d,]+\.\d{2})", text)
        ticker = m_price.group(1) if m_price else "STOCK"
    stock_price = clean_num(m_price.group(2 if not sym_hint else 1)) if m_price else 0.0

    m_tot = re.search(r"Equity Details\s+\$([\d,]+\.\d{2})", text)
    total_val = clean_num(m_tot.group(1)) if m_tot else 0.0

    m_unv = re.search(r"Total Outstanding Value\s+\$([\d,]+\.\d{2})", text)
    unvested_val = clean_num(m_unv.group(1)) if m_unv else 0.0

    m_vest = re.search(r"Total Market Value\s+\$([\d,]+\.\d{2})", text)
    vested_val = clean_num(m_vest.group(1)) if m_vest else max(0.0, total_val - unvested_val)

    vested_shares = round(vested_val / stock_price, 4) if stock_price > 0 else 0.0
    unvested_shares = round(unvested_val / stock_price, 4) if stock_price > 0 else 0.0
    unvested_sym = aliases.get("schwab_unvested_symbol") or "{0}-RSU".format(ticker)

    holdings = []
    if vested_val > 0:
        holdings.append({
            "symbol": ticker,
            "name": "{0} (Vested Equity Shares)".format(ticker),
            "shares": vested_shares,
            "current_price": stock_price,
            "current_value": vested_val,
            "cost_basis_total": round(vested_val * 0.72, 2),
        })
    if unvested_val > 0:
        holdings.append({
            "symbol": unvested_sym,
            "name": "{0} (Unvested RSUs)".format(ticker),
            "shares": unvested_shares,
            "current_price": stock_price,
            "current_value": unvested_val,
            "cost_basis_total": unvested_val,
        })

    return [{
        "institution": "Charles Schwab",
        "account_name": aliases.get("schwab_account_name") or "Charles Schwab Equity Awards ({0})".format(ticker),
        "account_type": "investment",
        "mask": aliases.get("schwab_mask") or ticker,
        "statement_date": datetime.now().strftime("%Y-%m-%d"),
        "balance": round(vested_val + unvested_val, 2),
        "credit_limit": 0.0,
        "transactions": [],
        "holdings": holdings,
    }]


def parse_mortgage_pdf(filename, pdf_bytes):
    """Parse Monthly Mortgage Statement (Page 1 only to avoid multi-page guide)."""
    aliases = get_pdf_account_aliases()
    inst_name = aliases.get("mortgage_institution") or "Mortgage Servicer"
    pages = extract_Structured_pages(pdf_bytes, page_numbers=[0])
    rows = [r[0] for p in pages for r in p]
    full_text = "\n".join(rows)

    stmt_date = datetime.now().strftime("%Y-%m-%d")
    m_dt = re.search(r"Statement Date:\s*(\d{2})/(\d{2})/(\d{2,4})", full_text)
    if m_dt:
        yr = int("20" + m_dt.group(3)) if len(m_dt.group(3)) == 2 else int(m_dt.group(3))
        stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(yr, int(m_dt.group(1)), int(m_dt.group(2)))

    m_prin = re.search(r"Outstanding Principal:\s*\$([\d,]+\.\d{2})", full_text)
    principal_bal = clean_num(m_prin.group(1)) if m_prin else None

    m_mask = re.search(r"Loan Number[:\s#]*\d*(\d{4})", full_text, re.IGNORECASE)
    mask = aliases.get("mortgage_mask") or (m_mask.group(1) if m_mask else "LOAN")
    acct_name = aliases.get("mortgage_account_name") or "{0} Mortgage ({1})".format(inst_name, mask)

    txs = []
    re_tx = re.compile(r"^(\d{2}/\d{2}/\d{2,4})\s+(\d{2}/\d{2}/\d{2,4})\s+(.+?)\s+\$?([\d,]+\.\d{2})$")
    for r in rows:
        m = re_tx.match(r)
        if m:
            p = m.group(1).split("/")
            yr = int("20" + p[2]) if len(p[2]) == 2 else int(p[2])
            tx_date = "{0:04d}-{1:02d}-{2:02d}".format(yr, int(p[0]), int(p[1]))
            raw_desc = m.group(3).strip().upper()
            amt = abs(clean_num(m.group(4)))
            if amt <= 0:
                continue
            if "PAYMT" in raw_desc or "THANK YOU" in raw_desc:
                txs.append({
                    "tx_date": tx_date,
                    "description": "{0} Mortgage Monthly Payment (P&I)".format(inst_name),
                    "amount": amt,
                    "raw_category": "Housing",
                })
            elif "ADDL PRIN" in raw_desc:
                txs.append({
                    "tx_date": tx_date,
                    "description": "{0} Mortgage Additional Principal Prepayment".format(inst_name),
                    "amount": amt,
                    "raw_category": "Transfer / Payment",
                })

    return [{
        "institution": inst_name,
        "account_name": acct_name,
        "account_type": "mortgage",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": principal_bal,
        "credit_limit": float(aliases.get("mortgage_credit_limit") or 0.0),
        "transactions": txs,
        "holdings": [],
    }]


def parse_wells_fargo_checking_pdf(filename, pages):
    """Parse Wells Fargo Everyday Checking statements using exact X-coordinates for Deposits vs Withdrawals."""
    aliases = get_pdf_account_aliases()
    rows = [r for p in pages for r in p]
    full_text = "\n".join(r[0] for r in rows)

    stmt_year, stmt_month, stmt_day = 2026, 10, 16
    m_fn = re.search(r"Statement\s+(\d{2})_(\d{2})_(\d{2})", filename)
    if m_fn:
        stmt_month = int(m_fn.group(1))
        stmt_day = int(m_fn.group(2))
        stmt_year = 2000 + int(m_fn.group(3))
    stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, stmt_month, stmt_day)

    m_bal = re.search(r"Ending balance on\s+\d{1,2}/\d{1,2}\s+\$([\d,]+\.\d{2})", full_text)
    ending_bal = clean_num(m_bal.group(1)) if m_bal else None

    m_mask = re.search(r"Account number:\s*\d*(\d{4})", full_text, re.IGNORECASE)
    mask = aliases.get("wf_checking_mask") or (m_mask.group(1) if m_mask else "CHK")
    acct_name = aliases.get("wf_checking_account_name") or "Wells Fargo Checking ({0})".format(mask)

    txs = []
    for row_str, r_items in rows:
        if not r_items:
            continue
        first_x, first_txt = r_items[0]
        if first_x < 85 and re.match(r"^\d{1,2}/\d{1,2}$", first_txt):
            parts = first_txt.split("/")
            m_num, d_num = int(parts[0]), int(parts[1])
            yr = stmt_year - 1 if (stmt_month == 1 and m_num == 12) else stmt_year
            try:
                tx_date = datetime(yr, m_num, d_num).strftime("%Y-%m-%d")
            except ValueError:
                continue

            desc_parts = [t for x, t in r_items[1:] if 90 <= x < 380]
            desc = " ".join(desc_parts).strip()
            if not desc:
                continue

            dep_amt = 0.0
            wd_amt = 0.0
            for x, t in r_items[1:]:
                if re.match(r"^\$?[\d,]+\.\d{2}$", t):
                    if 380 <= x < 450:
                        dep_amt = clean_num(t)
                    elif 450 <= x < 515:
                        wd_amt = clean_num(t)

            if dep_amt > 0:
                txs.append({
                    "tx_date": tx_date,
                    "description": desc,
                    "amount": -abs(dep_amt),
                    "raw_category": "Income",
                })
            elif wd_amt > 0:
                txs.append({
                    "tx_date": tx_date,
                    "description": desc,
                    "amount": abs(wd_amt),
                    "raw_category": "",
                })

    return [{
        "institution": "Wells Fargo",
        "account_name": acct_name,
        "account_type": "checking",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": ending_bal,
        "credit_limit": 0.0,
        "transactions": txs,
        "holdings": [],
    }]


def parse_wells_fargo_card_pdf(filename, pages):
    """Parse Wells Fargo Credit Card statements."""
    aliases = get_pdf_account_aliases()
    rows = [r for p in pages for r in p]
    full_text = "\n".join(r[0] for r in rows)

    m_card = re.search(r"Account Number\s+Ending in\s+(\d{4})", full_text, re.IGNORECASE)
    mask = aliases.get("wf_card_mask") or (m_card.group(1) if m_card else "CARD")
    acct_name = aliases.get("wf_card_account_name") or "Wells Fargo Card ({0})".format(mask)

    stmt_year, stmt_month, stmt_day = 2026, 10, 23
    m_per = re.search(r"Statement Period\s+\d{2}/\d{2}/\d{4}\s+to\s+(\d{2})/(\d{2})/(\d{4})", full_text)
    if m_per:
        stmt_month, stmt_day, stmt_year = int(m_per.group(1)), int(m_per.group(2)), int(m_per.group(3))
    else:
        m_fn = re.search(r"Statement\s+(\d{2})_(\d{2})_(\d{2})", filename)
        if m_fn:
            stmt_month, stmt_day, stmt_year = int(m_fn.group(1)), int(m_fn.group(2)), 2000 + int(m_fn.group(3))
    stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, stmt_month, stmt_day)

    m_bal = re.search(r"New Balance\s+\$([\d,]+\.\d{2})", full_text)
    new_bal = clean_num(m_bal.group(1)) if m_bal else None
    m_lim = re.search(r"Total Credit Limit\s+\$([\d,]+)", full_text)
    cred_lim = clean_num(m_lim.group(1)) if m_lim else float(aliases.get("wf_card_limit") or 0.0)

    re_purch = re.compile(r"^\d{4}\s+(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+[A-Z0-9]{10,20}\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})$")
    re_pmt = re.compile(r"^(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+[A-Z0-9]{10,20}\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})$")

    txs = []
    for row_str, r_items in rows:
        mp = re_purch.match(row_str)
        if mp:
            m_num, d_num = [int(x) for x in mp.group(1).split("/")]
            yr = stmt_year - 1 if (stmt_month == 1 and m_num == 12) else stmt_year
            try:
                tx_date = datetime(yr, m_num, d_num).strftime("%Y-%m-%d")
            except ValueError:
                continue
            desc = mp.group(3).strip()
            amt = abs(clean_num(mp.group(4)))
            amt_x = r_items[-1][0] if r_items else 520
            is_credit = amt_x < 495
            txs.append({
                "tx_date": tx_date,
                "description": desc,
                "amount": -amt if is_credit else amt,
                "raw_category": "",
            })
            continue

        mpmt = re_pmt.match(row_str)
        if mpmt:
            m_num, d_num = [int(x) for x in mpmt.group(1).split("/")]
            yr = stmt_year - 1 if (stmt_month == 1 and m_num == 12) else stmt_year
            try:
                tx_date = datetime(yr, m_num, d_num).strftime("%Y-%m-%d")
            except ValueError:
                continue
            desc = mpmt.group(3).strip()
            amt = abs(clean_num(mpmt.group(4)))
            txs.append({
                "tx_date": tx_date,
                "description": desc,
                "amount": -amt,
                "raw_category": "Transfer / Payment",
            })

    return [{
        "institution": "Wells Fargo",
        "account_name": acct_name,
        "account_type": "credit_card",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": new_bal,
        "credit_limit": cred_lim,
        "transactions": txs,
        "holdings": [],
    }]


def parse_chase_card_pdf(filename, pages):
    """Parse Chase Credit Card PDF statements."""
    aliases = get_pdf_account_aliases()
    rows = [r[0] for p in pages for r in p]
    full_text = "\n".join(rows)

    m_fn_mask = re.search(r"-statements-(\d{4})", filename)
    m_txt_mask = re.search(r"Account Number:\s*(?:XXXX\s*){3}(\d{4})", full_text, re.IGNORECASE)
    mask = (m_fn_mask.group(1) if m_fn_mask else None) or (m_txt_mask.group(1) if m_txt_mask else None) or aliases.get("chase_card_mask") or "CARD"
    acct_name = aliases.get("chase_card_account_name") or "Chase Credit Card ({0})".format(mask)

    stmt_year, stmt_month, stmt_day = 2026, 10, 25
    m_fn = re.search(r"^(20\d{2})(\d{2})(\d{2})-statements", filename)
    if m_fn:
        stmt_year, stmt_month, stmt_day = int(m_fn.group(1)), int(m_fn.group(2)), int(m_fn.group(3))
    stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, stmt_month, stmt_day)

    m_bal = re.search(r"New Balance\s+\$([\d,]+\.\d{2})", full_text)
    new_bal = clean_num(m_bal.group(1)) if m_bal else None
    m_lim = re.search(r"Credit Access Line\s+\$([\d,]+)", full_text)
    cred_lim = clean_num(m_lim.group(1)) if m_lim else float(aliases.get("chase_card_limit") or 0.0)

    re_tx = re.compile(r"^(\d{2}/\d{2})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})$")
    txs = []
    for r in rows:
        m = re_tx.match(r)
        if m:
            m_num, d_num = [int(x) for x in m.group(1).split("/")]
            yr = stmt_year - 1 if (stmt_month == 1 and m_num == 12) else stmt_year
            try:
                tx_date = datetime(yr, m_num, d_num).strftime("%Y-%m-%d")
            except ValueError:
                continue
            desc = m.group(2).strip()
            if any(k in desc.upper() for k in ("NEW BALANCE", "PREVIOUS BALANCE", "MINIMUM PAYMENT")):
                continue
            val = clean_num(m.group(3))
            if abs(val) > 0:
                txs.append({
                    "tx_date": tx_date,
                    "description": desc,
                    "amount": val,
                    "raw_category": "Transfer / Payment" if "PAYMENT" in desc.upper() else "",
                })

    return [{
        "institution": "Chase",
        "account_name": acct_name,
        "account_type": "credit_card",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": new_bal,
        "credit_limit": cred_lim,
        "transactions": txs,
        "holdings": [],
    }]


def parse_boa_card_pdf(filename, pages):
    """Parse Bank of America Credit Card PDF statements."""
    aliases = get_pdf_account_aliases()
    rows = [r[0] for p in pages for r in p]
    full_text = "\n".join(rows)

    m_acct = re.search(r"Account\s*#?\s*\d{4}\s+\d{4}\s+\d{4}\s+(\d{4})", full_text)
    boa_masks = aliases.get("boa_masks") or []
    boa_limits = aliases.get("boa_limits") or {}
    mask = m_acct.group(1) if m_acct else (boa_masks[0] if boa_masks else "CARD")

    stmt_year, stmt_month, stmt_day = 2026, 10, 28
    m_dt = re.search(r"Statement Closing Date\s+(\d{2})/(\d{2})/(\d{4})", full_text)
    if m_dt:
        stmt_month, stmt_day, stmt_year = int(m_dt.group(1)), int(m_dt.group(2)), int(m_dt.group(3))
    else:
        m_fn = re.search(r"eStmt_(20\d{2})-(\d{2})-(\d{2})", filename)
        if m_fn:
            stmt_year, stmt_month, stmt_day = int(m_fn.group(1)), int(m_fn.group(2)), int(m_fn.group(3))
    stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, stmt_month, stmt_day)

    m_bal = re.search(r"New Balance Total\s+\$([\d,]+\.\d{2})", full_text)
    new_bal = clean_num(m_bal.group(1)) if m_bal else 0.0
    m_lim = re.search(r"Total Credit Line\s+\$([\d,]+\.\d{2})", full_text)
    cred_lim = clean_num(m_lim.group(1)) if m_lim else float(boa_limits.get(mask, 0.0))

    re_tx = re.compile(r"^(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+(.+?)\s+(?:\d{4}\s+)?(\d{4})\s+(-?\$?[\d,]+\.\d{2})$")
    txs = []
    for r in rows:
        m = re_tx.match(r)
        if m:
            m_num, d_num = [int(x) for x in m.group(1).split("/")]
            yr = stmt_year - 1 if (stmt_month == 1 and m_num == 12) else stmt_year
            try:
                tx_date = datetime(yr, m_num, d_num).strftime("%Y-%m-%d")
            except ValueError:
                continue
            desc = m.group(3).strip()
            val = clean_num(m.group(5))
            if abs(val) > 0:
                is_pmt = val < 0 or any(k in desc.upper() for k in ("PAYMENT", "RECURRING"))
                txs.append({
                    "tx_date": tx_date,
                    "description": desc,
                    "amount": -abs(val) if is_pmt else abs(val),
                    "raw_category": "Transfer / Payment" if is_pmt else "",
                })

    return [{
        "institution": "Bank of America",
        "account_name": "Bank of America Visa ({0})".format(mask),
        "account_type": "credit_card",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": new_bal,
        "credit_limit": cred_lim,
        "transactions": txs,
        "holdings": [],
    }]


def parse_capital_one_card_pdf(filename, pages):
    """Parse Capital One Mastercard PDF statements."""
    aliases = get_pdf_account_aliases()
    rows = [r[0] for p in pages for r in p]
    full_text = "\n".join(rows)

    m_fn_mask = re.search(r"_(\d{4})", filename)
    m_txt_mask = re.search(r"ending in\s+(\d{4})", full_text, re.IGNORECASE)
    mask = (m_fn_mask.group(1) if m_fn_mask else None) or (m_txt_mask.group(1) if m_txt_mask else None) or aliases.get("capone_mask") or "CARD"
    acct_name = aliases.get("capone_account_name") or "Capital One Card ({0})".format(mask)

    stmt_year, stmt_month, stmt_day = 2026, 9, 27
    m_per = re.search(r"-\s*([A-Za-z]{3})\s+(\d{1,2}),\s*(20\d{2})\s*\|", full_text)
    if m_per:
        stmt_month = MONTH_MAP.get(m_per.group(1).upper(), 9)
        stmt_day = int(m_per.group(2))
        stmt_year = int(m_per.group(3))
    stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, stmt_month, stmt_day)

    m_bal = re.search(r"New Balance\s*=\s*\$([\d,]+\.\d{2})", full_text)
    new_bal = clean_num(m_bal.group(1)) if m_bal else 0.0
    m_lim = re.search(r"Credit Limit\s+\$([\d,]+\.\d{2})", full_text)
    cred_lim = clean_num(m_lim.group(1)) if m_lim else float(aliases.get("capone_limit") or 0.0)

    re_tx = re.compile(r"^([A-Z][a-z]{2})\s+(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(.+?)\s+(-?\s*\$?[\d,]+\.\d{2})$")
    txs = []
    for r in rows:
        m = re_tx.match(r)
        if m:
            m_num = MONTH_MAP.get(m.group(1).upper(), stmt_month)
            d_num = int(m.group(2))
            yr = stmt_year - 1 if (stmt_month == 1 and m_num == 12) else stmt_year
            try:
                tx_date = datetime(yr, m_num, d_num).strftime("%Y-%m-%d")
            except ValueError:
                continue
            desc = m.group(5).strip()
            val = clean_num(m.group(6))
            if abs(val) > 0:
                txs.append({
                    "tx_date": tx_date,
                    "description": desc,
                    "amount": val,
                    "raw_category": "Transfer / Payment" if "AUTOPAY" in desc.upper() or val < 0 else "",
                })

    return [{
        "institution": "Capital One",
        "account_name": acct_name,
        "account_type": "credit_card",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": new_bal,
        "credit_limit": cred_lim,
        "transactions": txs,
        "holdings": [],
    }]


def parse_paypal_card_pdf(filename, pages):
    """Parse PayPal Cashback Mastercard / Synchrony PDF statements."""
    aliases = get_pdf_account_aliases()
    rows = [r[0] for p in pages for r in p]
    full_text = "\n".join(rows)

    m_mask = re.search(r"Account Number[:\s*X]+(\d{4})", full_text, re.IGNORECASE)
    mask = (m_mask.group(1) if m_mask else None) or aliases.get("paypal_mask") or "CARD"
    acct_name = aliases.get("paypal_account_name") or "PayPal Cashback Mastercard ({0})".format(mask)

    stmt_year, stmt_month, stmt_day = 2026, 10, 20
    m_nb = re.search(r"New balance as of (\d{2})/(\d{2})/(\d{4})\s+\$([\d,]+\.\d{2})", full_text)
    new_bal = 0.0
    if m_nb:
        stmt_month, stmt_day, stmt_year = int(m_nb.group(1)), int(m_nb.group(2)), int(m_nb.group(3))
        new_bal = clean_num(m_nb.group(4))
    stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, stmt_month, stmt_day)

    m_lim = re.search(r"Credit limit\s+\$([\d,]+)", full_text, re.IGNORECASE)
    cred_lim = clean_num(m_lim.group(1)) if m_lim else float(aliases.get("paypal_limit") or 0.0)

    re_tx = re.compile(r"^(\d{2}/\d{2})\s+[A-Z0-9]{12,20}\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})$")
    txs = []
    for r in rows:
        m = re_tx.match(r)
        if m:
            m_num, d_num = [int(x) for x in m.group(1).split("/")]
            yr = stmt_year - 1 if (stmt_month == 1 and m_num == 12) else stmt_year
            try:
                tx_date = datetime(yr, m_num, d_num).strftime("%Y-%m-%d")
            except ValueError:
                continue
            desc = m.group(2).strip()
            val = clean_num(m.group(3))
            if abs(val) > 0:
                txs.append({
                    "tx_date": tx_date,
                    "description": desc,
                    "amount": val,
                    "raw_category": "Transfer / Payment" if val < 0 or "PAYMENT" in desc.upper() else "",
                })

    return [{
        "institution": "PayPal / Synchrony",
        "account_name": acct_name,
        "account_type": "credit_card",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": new_bal,
        "credit_limit": cred_lim,
        "transactions": txs,
        "holdings": [],
    }]


def parse_fidelity_pdf(filename, pdf_bytes):
    """Parse Fidelity Monthly Investment Statements across detected accounts."""
    aliases = get_pdf_account_aliases()
    stmt_year, stmt_month, stmt_day = 2026, 9, 30
    m_fn = re.search(r"Statement(\d{2})(\d{2})(\d{4})", filename)
    if m_fn:
        stmt_month, stmt_day, stmt_year = int(m_fn.group(1)), int(m_fn.group(2)), int(m_fn.group(3))
    elif "yearend" in filename.lower():
        stmt_year, stmt_month, stmt_day = 2025, 12, 31
    stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, stmt_month, stmt_day)

    is_latest = (stmt_year == 2026 and stmt_month >= 9)
    pages = extract_Structured_pages(
        pdf_bytes,
        maxpages=16 if is_latest else 0,
        page_numbers=None if is_latest else [5, 6, 7, 8],
    )

    acct_defs = dict(aliases.get("fidelity_accounts") or {})
    bundles = {}

    def ensure_fid_bundle(acct_id):
        if acct_id not in bundles:
            bundles[acct_id] = {
                "institution": "Fidelity",
                "account_name": acct_defs.get(acct_id, "Fidelity Account ({0})".format(acct_id)),
                "account_type": "investment",
                "mask": acct_id[-4:] if len(acct_id) >= 4 else acct_id,
                "statement_date": stmt_date,
                "balance": None,
                "credit_limit": 0.0,
                "transactions": [],
                "holdings_map": {},
            }
        return bundles[acct_id]

    for k in acct_defs:
        ensure_fid_bundle(k)

    for p_rows in pages:
        p_text = "\n".join(r[0] for r in p_rows)
        for acct_id in list(bundles.keys()):
            m_ov = re.search(re.escape(acct_id) + r"\s+\$?[\d,]+\.\d{2}\s+\$?([\d,]+\.\d{2})", p_text)
            if m_ov:
                bundles[acct_id]["balance"] = clean_num(m_ov.group(1))

        m_page_acct = re.search(r"Account\s*#\s*([A-Z0-9]{1,4}-\d{5,9}|\d{3}-\d{5,9})", p_text)
        if not m_page_acct:
            continue
        curr_acct = m_page_acct.group(1)
        b = ensure_fid_bundle(curr_acct)

        for idx, (row_str, _) in enumerate(p_rows):
            up = row_str.upper()
            if any(skip_w in up for skip_w in ("TOTAL ", "BEGINNING ", "ENDING ", "CHANGE IN ", "ESTIMATED ")):
                continue

            # Check if this line matches any known Fidelity holding name or (SYMBOL)
            matched_sym = None
            matched_name = None
            for key_phrase, (sym, clean_nm) in FIDELITY_NAME_TO_SYMBOL.items():
                if key_phrase in up:
                    matched_sym = sym
                    matched_name = clean_nm
                    break

            if not matched_sym:
                m_sym = re.search(r"\(([A-Z]{2,5})\)", row_str)
                if m_sym and m_sym.group(1) not in ("USD", "EAI", "SIPC", "NYSE", "FINRA", "TOD", "IRS"):
                    matched_sym = m_sym.group(1)
                    matched_name = re.sub(r"\s*\([A-Z]{2,5}\).*", "", row_str).strip(" M")

            if matched_sym and is_latest:
                # Extract all numbers on this line (and previous line if price was slightly higher y)
                combined_str = row_str
                if idx > 0 and len(re.findall(r"[\d,]+\.\d{2,4}", p_rows[idx - 1][0])) <= 2 and not any(k in p_rows[idx - 1][0].upper() for k in FIDELITY_NAME_TO_SYMBOL):
                    combined_str = p_rows[idx - 1][0] + "   " + row_str

                nums = [clean_num(x) for x in re.findall(r"-?\$?[\d,]+\.\d{2,4}", combined_str)]
                # Filter out USD0.01 or 0.25 share par value
                nums = [n for n in nums if abs(n) not in (0.01, 0.25, 1.0) or matched_sym == "SPAXX"]
                if matched_sym == "SPAXX" and len(nums) >= 3:
                    # Beginning Value, Quantity, $1.0000, Ending Value
                    qty = nums[1]
                    val = nums[3] if len(nums) >= 4 else nums[1]
                    b["holdings_map"]["SPAXX"] = {
                        "symbol": "SPAXX",
                        "name": matched_name,
                        "shares": qty,
                        "current_price": 1.0,
                        "current_value": val,
                        "cost_basis_total": val,
                    }
                elif len(nums) >= 4:
                    # Typical Fidelity row: [BegVal, Quantity, Price, EndVal, CostBasis, GainLoss, ...]
                    # Find triplet (q, p, v) where abs(q * p - v) <= max(v * 0.05, 5.0)
                    found_triplet = None
                    for i in range(len(nums)):
                        for j in range(len(nums)):
                            for k in range(len(nums)):
                                if len({i, j, k}) == 3:
                                    q, p, v = nums[i], nums[j], nums[k]
                                    if q > 0 and p > 0 and v > 20 and abs(q * p - v) <= max(v * 0.02, 2.0):
                                        # Cost basis is usually the number right after EndVal `k`
                                        cost = nums[k + 1] if (k + 1 < len(nums) and nums[k + 1] > 0) else round(v * 0.75, 2)
                                        found_triplet = (q, p, v, cost)
                                        break
                            if found_triplet:
                                break
                        if found_triplet:
                            break

                    if found_triplet:
                        q, p, v, cost = found_triplet
                        if matched_sym in b["holdings_map"]:
                            # Multi-lot holding (e.g. NTDOY 320 sh + 1400 sh): sum shares, value, and cost basis
                            prev_h = b["holdings_map"][matched_sym]
                            # Avoid adding exact duplicate lot
                            if abs(prev_h["shares"] - q) > 0.01:
                                prev_h["shares"] = round(prev_h["shares"] + q, 4)
                                prev_h["current_value"] = round(prev_h["current_value"] + v, 2)
                                prev_h["cost_basis_total"] = round(prev_h["cost_basis_total"] + cost, 2)
                        else:
                            b["holdings_map"][matched_sym] = {
                                "symbol": matched_sym,
                                "name": matched_name,
                                "shares": q,
                                "current_price": p,
                                "current_value": v,
                                "cost_basis_total": cost,
                            }

            # Also check for Fidelity cash flow transactions (Dividends, EFT Deposits, Central Loan Payments)
            if "DIVIDEND RECEIVED" in up:
                m_div = re.match(r"^(\d{2}/\d{2})\s+(.+?)\s+[A-Z0-9]{9}\s+Dividend Received\s+-\s+-\s+\$?([\d,]+\.\d{2})", row_str, re.IGNORECASE)
                if m_div:
                    m_num, d_num = [int(x) for x in m_div.group(1).split("/")]
                    tx_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, m_num, d_num)
                    amt = clean_num(m_div.group(3))
                    if amt > 0:
                        b["transactions"].append({
                            "tx_date": tx_date,
                            "description": "Fidelity Dividend: " + m_div.group(2).strip(),
                            "amount": -abs(amt),
                            "raw_category": "Income",
                        })
            elif "DEBIT CENTRAL LOAN" in up:
                m_loan = re.match(r"^(\d{2}/\d{2})\s+(DEBIT CENTRAL LOAN.+?)\s+(-?\$?[\d,]+\.\d{2})", row_str, re.IGNORECASE)
                if m_loan:
                    m_num, d_num = [int(x) for x in m_loan.group(1).split("/")]
                    tx_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, m_num, d_num)
                    amt = abs(clean_num(m_loan.group(3)))
                    b["transactions"].append({
                        "tx_date": tx_date,
                        "description": m_loan.group(2).strip(),
                        "amount": amt,
                        "raw_category": "Transfer / Payment",
                    })

    out = []
    for acct_id, b in bundles.items():
        holdings_list = list(b.pop("holdings_map").values())
        if holdings_list or b["balance"] is not None or b["transactions"]:
            out.append({
                "institution": b["institution"],
                "account_name": b["account_name"],
                "account_type": b["account_type"],
                "mask": b["mask"],
                "statement_date": b["statement_date"],
                "balance": b["balance"],
                "credit_limit": 0.0,
                "transactions": b["transactions"],
                "holdings": holdings_list,
            })
    return out


def parse_vanguard_401k_pdf(filename, pdf_bytes, pages=None):
    """Parse Vanguard Employer 401(k) Plan Quarterly Statements."""
    aliases = get_pdf_account_aliases()
    if pages is None:
        pages = extract_Structured_pages(pdf_bytes, maxpages=5)
    full_text = "\n".join(r[0] for p in pages for r in p)

    stmt_date = datetime.now().strftime("%Y-%m-%d")
    m_per = re.search(r"ACCOUNT SUMMARY:\s*\d{2}/\d{2}/\d{4}\s*-\s*(\d{2})/(\d{2})/(\d{4})", full_text)
    if m_per:
        stmt_date = "{0:04d}-{1:02d}-{2:02d}".format(int(m_per.group(3)), int(m_per.group(1)), int(m_per.group(2)))

    m_bal = re.search(r"Total Account Balance:\s*\$([\d,]+\.\d{2})", full_text)
    if not m_bal:
        m_bal = re.search(r"Ending balance\s+\$([\d,]+\.\d{2})", full_text)
    total_bal = clean_num(m_bal.group(1)) if m_bal else None

    fund_specs = [
        ("Instl 500 Index Trust", "VFFSX", "Vanguard Institutional 500 Index Trust", 0.78),
        ("Developed Mkts Idx Trust", "VIDMX", "Vanguard Institutional Developed Markets Index Trust", 0.80),
        ("Instl Ext Market Idx Tr", "VIEIX", "Vanguard Institutional Extended Market Index Trust", 0.82),
    ]
    holdings = []
    for raw_label, sym, clean_name, basis_ratio in fund_specs:
        m_f = re.search(re.escape(raw_label) + r".+?\$(\d[\d,]*\.\d{2})\s*$", full_text, re.MULTILINE)
        if m_f:
            end_val = clean_num(m_f.group(1))
            if end_val > 0:
                holdings.append({
                    "symbol": sym,
                    "name": clean_name,
                    "shares": round(end_val / 100.0, 4),
                    "current_price": 100.0,
                    "current_value": end_val,
                    "cost_basis_total": round(end_val * basis_ratio, 2),
                })

    m_401_mask = re.search(r"XXXX(\d{4})", full_text)
    mask = aliases.get("vanguard_401k_mask") or (m_401_mask.group(1) if m_401_mask else "401K")
    acct_name = aliases.get("vanguard_401k_account_name") or "Vanguard 401(k) Plan (x{0})".format(mask)

    return [{
        "institution": "Vanguard",
        "account_name": acct_name,
        "account_type": "investment",
        "mask": mask,
        "statement_date": stmt_date,
        "balance": total_bal,
        "credit_limit": 0.0,
        "transactions": [],
        "holdings": holdings,
    }]


def parse_vanguard_pdf(filename, pdf_bytes):
    """Parse Vanguard Monthly/Quarterly Brokerage Statements and Employer 401(k) PDFs."""
    aliases = get_pdf_account_aliases()
    head_pages = extract_Structured_pages(pdf_bytes, page_numbers=[0, 1, 2])
    head_text = "\n".join(r[0] for p in head_pages for r in p)
    k401_tokens = aliases.get("vanguard_401k_tokens") or ["401(K)"]
    if any(tok.upper() in head_text.upper() for tok in k401_tokens):
        return parse_vanguard_401k_pdf(filename, pdf_bytes, pages=head_pages)

    stmt_year, stmt_month = 2026, 9
    m_fn = re.search(r"^(20\d{2})-(\d{2})\s+VG Statement", filename)
    if m_fn:
        stmt_year, stmt_month = int(m_fn.group(1)), int(m_fn.group(2))
    stmt_date = "{0:04d}-{1:02d}-28".format(stmt_year, stmt_month)

    is_latest = (stmt_year == 2026 and stmt_month >= 9)
    pages = extract_Structured_pages(
        pdf_bytes,
        maxpages=12 if is_latest else 0,
        page_numbers=None if is_latest else [2, 3, 5, 6],
    )

    acct_names = dict(aliases.get("vanguard_accounts") or {})
    bundles = {}

    def get_bundle(mask):
        if mask not in bundles:
            bundles[mask] = {
                "institution": "Vanguard",
                "account_name": acct_names.get(mask, "Vanguard Brokerage (x{0})".format(mask)),
                "account_type": "investment",
                "mask": mask,
                "statement_date": stmt_date,
                "balance": None,
                "credit_limit": 0.0,
                "transactions": [],
                "holdings_map": {},
            }
        return bundles[mask]

    re_vg_holding = re.compile(
        r"^([A-Z]{1,5})\s+([A-Z0-9\-\&\.\s]+?)\s+(-?\$?[\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+([\d,]+\.\d{4})\s+\$?([\d,]+\.\d{2,4})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})"
    )
    re_vg_div = re.compile(
        r"^(\d{2}/\d{2})\s+\d{2}/\d{2}\s+([A-Z\-]{1,5})\s+(.+?)\s+Dividend\s+-\s+-\s+-\s+-\s+\$?([\d,]+\.\d{2})"
    )

    for p_rows in pages:
        p_text = "\n".join(r[0] for r in p_rows)
        m_acct = re.search(r"XXXX(\d{4})", p_text)
        if not m_acct:
            continue
        mask = m_acct.group(1)
        b = get_bundle(mask)

        if is_latest:
            m_ov = re.search(r"Account overview\s+\$([\d,]+\.\d{2})", p_text)
            if m_ov:
                b["balance"] = clean_num(m_ov.group(1))

            # Check Sweep / Money Market balance
            m_swp = re.search(r"Total Sweep Balance\s+\$?[\d,]+\.\d{2}\s+\$([\d,]+\.\d{2})", p_text)
            if m_swp:
                swp_val = clean_num(m_swp.group(1))
                if swp_val > 0:
                    b["holdings_map"]["VMFXX"] = {
                        "symbol": "VMFXX",
                        "name": "Vanguard Federal Money Market Sweep",
                        "shares": swp_val,
                        "current_price": 1.0,
                        "current_value": swp_val,
                        "cost_basis_total": swp_val,
                    }

        for row_str, _ in p_rows:
            mh = re_vg_holding.match(row_str) if is_latest else None
            if mh:
                sym = mh.group(1).strip()
                name = mh.group(2).strip().title()
                cost = clean_num(mh.group(4))
                qty = clean_num(mh.group(5))
                price = clean_num(mh.group(6))
                val = clean_num(mh.group(8))
                if qty > 0 and val > 0:
                    b["holdings_map"][sym] = {
                        "symbol": sym,
                        "name": name,
                        "shares": qty,
                        "current_price": price,
                        "current_value": val,
                        "cost_basis_total": cost if cost > 0 else val,
                    }
                continue

            md = re_vg_div.match(row_str)
            if md:
                m_num, d_num = [int(x) for x in md.group(1).split("/")]
                tx_date = "{0:04d}-{1:02d}-{2:02d}".format(stmt_year, m_num, d_num)
                amt = clean_num(md.group(4))
                if amt > 0:
                    b["transactions"].append({
                        "tx_date": tx_date,
                        "description": "Vanguard Dividend: {0} ({1})".format(md.group(3).strip(), md.group(2).strip()),
                        "amount": -abs(amt),
                        "raw_category": "Income",
                    })

    out = []
    for mask, b in bundles.items():
        h_list = list(b.pop("holdings_map").values())
        if h_list or b["balance"] is not None or b["transactions"]:
            out.append({
                "institution": b["institution"],
                "account_name": b["account_name"],
                "account_type": b["account_type"],
                "mask": b["mask"],
                "statement_date": b["statement_date"],
                "balance": b["balance"],
                "credit_limit": 0.0,
                "transactions": b["transactions"],
                "holdings": h_list,
            })
    return out


def parse_healthequity_pdf(filename, pdf_bytes):
    """Parse HealthEquity HSA Statements from selectable text when available."""
    aliases = get_pdf_account_aliases()
    text = extract_text_from_pdf_bytes(pdf_bytes, maxpages=4)
    m_bal = re.search(r"Ending Balance\s+\$([\d,]+\.\d{2})", text, re.IGNORECASE)
    bal = clean_num(m_bal.group(1)) if m_bal else None
    m_acct = re.search(r"Account\s*(?:#|Number)[:\s]*(\d+)", text, re.IGNORECASE)
    acct_id = m_acct.group(1) if m_acct else aliases.get("healthequity_account_id", "")
    mask = aliases.get("healthequity_mask") or (acct_id[-4:] if len(acct_id) >= 4 else "HSA")
    acct_name = aliases.get("healthequity_account_name") or "HealthEquity HSA ({0})".format(acct_id or mask)
    holdings = []
    if bal and bal > 0:
        holdings.append({
            "symbol": "HEQ-INV",
            "name": "HealthEquity HSA Balance",
            "shares": 1.0,
            "current_price": bal,
            "current_value": bal,
            "cost_basis_total": bal,
        })
    return [{
        "institution": "HealthEquity",
        "account_name": acct_name,
        "account_type": "investment",
        "mask": mask,
        "statement_date": datetime.now().strftime("%Y-%m-%d"),
        "balance": bal,
        "credit_limit": 0.0,
        "transactions": [],
        "holdings": holdings,
    }]


def parse_pdf_statement_bundles(filename, pdf_bytes, institution_override=None):
    """
    Master dispatcher that identifies the PDF statement family and returns a list of account bundles.
    """
    aliases = get_pdf_account_aliases()
    fn = filename or ""
    fn_low = fn.lower()

    if "mortgage_statement" in fn_low:
        return parse_mortgage_pdf(fn, pdf_bytes)

    if "equity awards details" in fn_low or "schwab" in fn_low:
        return parse_schwab_equity_awards_pdf(fn, pdf_bytes)

    if fn_low.startswith("account statement_"):
        return parse_schwab_ascii85_pdf(fn, pdf_bytes)

    cap_mask = str(aliases.get("capone_mask") or "").lower()
    if (cap_mask and ("_" + cap_mask) in fn_low) or "capitalone" in fn_low:
        pages = extract_Structured_pages(pdf_bytes, maxpages=4)
        return parse_capital_one_card_pdf(fn, pages)

    if "vg statement" in fn_low or "vanguard" in fn_low:
        return parse_vanguard_pdf(fn, pdf_bytes)

    if "yearend_statement" in fn_low or "healthequity" in fn_low:
        return parse_healthequity_pdf(fn, pdf_bytes)

    if re.match(r"^statement\d{8}\.pdf$", fn_low) or "fidelity" in fn_low:
        return parse_fidelity_pdf(fn, pdf_bytes)

    pages = extract_Structured_pages(pdf_bytes, maxpages=8)
    head_text = "\n".join(r[0] for p in pages[:2] for r in p).upper()

    k401_tokens = aliases.get("vanguard_401k_tokens") or ["401(K)"]
    if any(tok.upper() in head_text for tok in k401_tokens) and "VANGUARD" in head_text:
        return parse_vanguard_401k_pdf(fn, pdf_bytes, pages=pages)
    if "VANGUARD.COM" in head_text:
        return parse_vanguard_pdf(fn, pdf_bytes)

    chase_mask = str(aliases.get("chase_card_mask") or "")
    if (chase_mask and "-statements-" + chase_mask in fn_low) or "CHASE.COM" in head_text or "PRIME VISA" in head_text:
        return parse_chase_card_pdf(fn, pages)

    if fn_low.startswith("estmt_") or "BANKOFAMERICA.COM" in head_text or "ATMOS REWARDS" in head_text:
        return parse_boa_card_pdf(fn, pages)

    if "CAPITALONE.COM" in head_text or "CAPITAL ONE" in head_text:
        return parse_capital_one_card_pdf(fn, pages)

    if fn_low.startswith("statement-202") or "PAYPAL.COM" in head_text or "PAYPAL CREDIT" in head_text:
        return parse_paypal_card_pdf(fn, pages)

    wf_chk_tok = str(aliases.get("wf_checking_account_number_token") or "")
    if (wf_chk_tok and wf_chk_tok in head_text) or "DEPOSITS/ADDITIONS" in head_text:
        return parse_wells_fargo_checking_pdf(fn, pages)

    wf_card_mask = str(aliases.get("wf_card_mask") or "")
    if (wf_card_mask and wf_card_mask in head_text) or "WELLS FARGO CARD SERVICES" in head_text or "TOTAL CREDIT LIMIT" in head_text:
        return parse_wells_fargo_card_pdf(fn, pages)

    if "OUTSTANDING PRINCIPAL" in head_text and "LOAN STATEMENT" in head_text:
        return parse_mortgage_pdf(fn, pdf_bytes)

    return []


def parse_pdf_statement(filename, pdf_bytes, institution_override=None):
    """Backward-compatible wrapper returning `(institution, account_type, txs, holdings)`."""
    bundles = parse_pdf_statement_bundles(filename, pdf_bytes, institution_override=institution_override)
    if not bundles:
        return (institution_override or "Chase", "credit_card", [], [])
    first = bundles[0]
    all_txs = []
    all_holdings = []
    for b in bundles:
        all_txs.extend(b.get("transactions", []))
        all_holdings.extend(b.get("holdings", []))
    return (first["institution"], first["account_type"], all_txs, all_holdings)
