import re
from backend.db import get_connection


def clean_merchant_fallback(description):
    """Clean noisy bank statement descriptions when no explicit rule matches."""
    if not description:
        return "Unknown Merchant"
    s = str(description).strip()
    # Strip common prefixes like TST*, SQ *, APLPay, PAYPAL *
    s = re.sub(r"^(TST\*\s*|SQ\s*\*\s*|APLPAY\s+|PAYPAL\s*\*\s*|SP\s*\*\s*|POS\s+DEBIT\s+)", "", s, flags=re.IGNORECASE)
    # Strip trailing store numbers, dates, phone numbers, state codes
    s = re.sub(r"\s+#\d+.*$", "", s)
    s = re.sub(r"\s+\d{3}-\d{3}-\d{4}.*$", "", s)
    s = re.sub(r"\s+\d{4,}.*$", "", s)
    s = re.sub(r"\*[A-Z0-9]{4,}.*$", "", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s.title() if s else description.strip().title()


def map_institution_category(raw_cat):
    """Normalize bank-provided categories (e.g., from Chase or Capital One CSVs)."""
    if not raw_cat:
        return None
    rc = str(raw_cat).strip().lower()
    mapping = {
        "food & drink": "Dining & Restaurants",
        "dining": "Dining & Restaurants",
        "restaurants": "Dining & Restaurants",
        "groceries": "Groceries",
        "supermarkets": "Groceries",
        "merchandise": "Shopping",
        "shopping": "Shopping",
        "department stores": "Shopping",
        "travel": "Travel & Transit",
        "airfare": "Travel & Transit",
        "lodging": "Travel & Transit",
        "gas/automotive": "Automotive & Gas",
        "automotive": "Automotive & Gas",
        "gas": "Automotive & Gas",
        "bills & utilities": "Home & Utilities",
        "utilities": "Home & Utilities",
        "home": "Home & Utilities",
        "health & wellness": "Health & Fitness",
        "healthcare": "Health & Fitness",
        "medical": "Health & Fitness",
        "entertainment": "Entertainment",
        "payment": "Transfer / Payment",
        "transfer": "Transfer / Payment",
    }
    for k, v in mapping.items():
        if k in rc:
            return v
    return None


def _refine_special_merchant(desc_upper, amount, default_merchant):
    """Apply profile-configured merchant labels for household partner offsets and extra principal transfers."""
    from backend.profile_loader import get_household_profile, get_partner_offset_config

    hh = get_household_profile()
    cfg = get_partner_offset_config()
    partner = hh.get("partner_name", "Partner")
    abs_amt = abs(float(amount or 0.0))

    if "VENMO CASHOUT" in desc_upper:
        if abs_amt >= float(cfg.get("venmo_mortgage_hoa_min", 3250.0)):
            return "{0} Venmo (Mortgage + HOA Share)".format(partner)
        if abs_amt >= float(cfg.get("venmo_mortgage_min", 2900.0)):
            return "{0} Venmo (Mortgage Share)".format(partner)
        hoa_lo = float(cfg.get("venmo_hoa_min", 315.0))
        hoa_hi = float(cfg.get("venmo_hoa_max", 425.0))
        if hoa_lo <= abs_amt <= hoa_hi:
            return "{0} Venmo (HOA Share)".format(partner)
        return "Venmo Cashout"
    if "ADDITIONAL PRINCIPAL PREPAYMENT" in desc_upper:
        return cfg.get("extra_principal_merchant", "Extra Mortgage Principal Prepayment")
    if "DEBIT CENTRAL LOAN A 1 TIME DFT" in desc_upper:
        return cfg.get("extra_principal_draft_label", "Extra Mortgage Principal Draft")
    if "DEBIT CENTRAL LOAN A LOAN PAYMT" in desc_upper:
        return cfg.get("mortgage_pi_draft_label", "Monthly Mortgage (P&I) Draft")
    return default_merchant


def categorize_transaction(description, raw_category="", amount=0.0, account_type="credit_card", rules=None):
    """
    Returns (merchant_name, category, tx_type) using priority-ordered rules,
    falling back to institution category or smart heuristics.
    Note on normalized `amount`:
      Positive amount (> 0) = Spending / Outflow
      Negative amount (< 0) = Income / Refund / Credit Card Payment received
    """
    if rules is None:
        conn = get_connection()
        rows = conn.execute(
            "SELECT keyword, merchant_name, category, tx_type, priority FROM category_rules ORDER BY priority DESC, LENGTH(keyword) DESC"
        ).fetchall()
        conn.close()
        rules = [dict(r) for r in rows]

    desc_upper = (description or "").upper()

    for rule in rules:
        kw = rule["keyword"].upper()
        if kw and kw in desc_upper:
            m_name = _refine_special_merchant(desc_upper, amount, rule["merchant_name"])
            return m_name, rule["category"], rule["tx_type"]

    # Check if institution provided a category
    mapped_cat = map_institution_category(raw_category)
    merchant = clean_merchant_fallback(description)

    if mapped_cat == "Transfer / Payment":
        return merchant, "Transfer / Payment", "transfer"

    if amount < 0:
        # Negative normalized amount means inflow (income or refund or payment)
        if account_type == "credit_card" and abs(amount) > 150 and ("PMT" in desc_upper or "PAYMENT" in desc_upper or "THANK YOU" in desc_upper):
            return merchant, "Transfer / Payment", "transfer"
        if account_type in ("checking", "savings"):
            return merchant, "Income", "income"
        return merchant, mapped_cat or "Shopping", "expense"

    return merchant, mapped_cat or "Uncategorized", "expense"


def recategorize_all_transactions():
    """Re-apply all rules in `category_rules` across existing transactions in the DB."""
    conn = get_connection()
    rules = [
        dict(r)
        for r in conn.execute(
            "SELECT keyword, merchant_name, category, tx_type, priority FROM category_rules ORDER BY priority DESC, LENGTH(keyword) DESC"
        ).fetchall()
    ]
    txs = conn.execute(
        """
        SELECT t.id, t.description, t.category, t.amount, a.account_type
        FROM transactions t
        JOIN accounts a ON a.id = t.account_id
        """
    ).fetchall()

    updated = 0
    for tx in txs:
        desc_upper = (tx["description"] or "").upper()
        for rule in rules:
            if rule["keyword"].upper() in desc_upper:
                m_name = _refine_special_merchant(desc_upper, tx["amount"], rule["merchant_name"])
                conn.execute(
                    "UPDATE transactions SET merchant = ?, category = ?, tx_type = ? WHERE id = ?",
                    (m_name, rule["category"], rule["tx_type"], tx["id"]),
                )
                updated += 1
                break

    conn.commit()
    conn.close()
    return updated
