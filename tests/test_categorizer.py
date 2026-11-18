from backend.categorizer import (
    categorize_transaction,
    clean_merchant_fallback,
    map_institution_category,
)


def test_partner_p2p_housing_offset_tiers():
    """Verify P2P partner reimbursement disambiguation in Demo Mode."""
    # Combined partner offset ($1,350 >= $1,300 threshold)
    m1, c1, t1 = categorize_transaction("ZELLE FROM TAYLOR HOUSING", amount=-1350.00, account_type="checking")
    assert c1 == "Income"
    assert t1 == "income"
    assert "Taylor" in m1 or "Share" in m1

    # Partial offset ($150 within $140..$200) without triggering expense keyword collisions
    m2, c2, t2 = categorize_transaction("ZELLE FROM TAYLOR SHARE", amount=-150.00, account_type="checking")
    assert c2 == "Income"
    assert t2 == "income"


def test_mortgage_and_extra_principal_disambiguation():
    """Verify regular monthly mortgage is Housing expense while Extra Principal is Transfer."""
    m1, c1, t1 = categorize_transaction(
        "ADDITIONAL PRINCIPAL PREPAYMENT", amount=1500.00, account_type="mortgage"
    )
    assert c1 == "Transfer / Payment"
    assert t1 == "transfer"

    m2, c2, t2 = categorize_transaction(
        "MORTGAGE MONTHLY PAYMENT", amount=2140.00, account_type="mortgage"
    )
    assert c2 == "Housing"
    assert t2 == "expense"


def test_no_false_positive_rent_substring_collisions():
    """Ensure merchants containing 'RENT' as a substring are NEVER misclassified as Housing."""
    _, c_furn, t_furn = categorize_transaction("OAKRIDGE RENTON WAREHOUSE", amount=420.00, account_type="credit_card")
    assert c_furn != "Housing"
    assert t_furn == "expense"

    _, c_salon, t_salon = categorize_transaction("STAN PARENTE HAIR STUDIO", amount=85.00, account_type="credit_card")
    assert c_salon != "Housing"
    assert t_salon == "expense"


def test_credit_card_autopay_vs_checking_income():
    """Verify negative amounts on credit cards are transfers while checking inflows become income."""
    _, c_cc, t_cc = categorize_transaction("AUTOMATIC PAYMENT - THANK YOU", amount=-2500.00, account_type="credit_card")
    assert c_cc == "Transfer / Payment"
    assert t_cc == "transfer"

    _, c_chk, t_chk = categorize_transaction("MISC ACH DEPOSIT REWARD", amount=-125.00, account_type="checking")
    assert c_chk == "Income"
    assert t_chk == "income"


def test_clean_merchant_fallback_and_institution_mapping():
    """Verify noisy POS prefix stripping and raw institution category normalization."""
    assert clean_merchant_fallback("TST* RIVERSIDE ROASTERS #104") == "Riverside Roasters"
    assert clean_merchant_fallback("SQ *TRAILHEAD COFFEE CO") == "Trailhead Coffee Co"
    assert clean_merchant_fallback("") == "Unknown Merchant"

    assert map_institution_category("Food & Drink") == "Dining & Restaurants"
    assert map_institution_category("Groceries") == "Groceries"
    assert map_institution_category("Gas/Automotive") == "Automotive & Gas"
    assert map_institution_category("UnknownBankCat") is None
