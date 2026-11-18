from datetime import datetime
from backend.db import get_connection, compute_tx_hash
from backend.categorizer import categorize_transaction


def clear_demo_data():
    conn = get_connection()
    conn.execute("DELETE FROM transactions WHERE is_demo = 1")
    conn.execute("DELETE FROM holdings WHERE is_demo = 1")
    conn.execute("DELETE FROM accounts WHERE is_demo = 1")
    conn.commit()
    conn.close()


def seed_demo_data_if_empty(force=False):
    conn = get_connection()
    cur = conn.cursor()

    if not force:
        cnt = cur.execute("SELECT COUNT(*) as c FROM accounts").fetchone()["c"]
        if cnt > 0:
            conn.close()
            return False

    clear_demo_data()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    # 1. Create Accounts across all 7 requested institutions:
    # Vanguard, Charles Schwab, Fidelity, Wells Fargo, Bank of America, Capital One, Chase
    demo_accounts = [
        # Real Estate & Mortgage (Austin synthetic demo property)
        ("Primary Residence — 412 Oakridge Way, Austin TX", "Austin Real Estate", "real_estate", "0412", 545000.00, 510000.00, "demo"),
        ("First Home Servicing Mortgage (4.85%)", "First Home Servicing", "mortgage", "9102", 340000.00, 385000.00, "demo"),
        # Checking & Savings
        ("Wells Fargo Everyday Checking", "Wells Fargo", "checking", "4821", 14850.00, 0.0, "demo"),
        ("Bank of America Advantage Savings", "Bank of America", "savings", "9014", 32400.00, 0.0, "demo"),
        # Credit Cards
        ("Chase Sapphire Reserve", "Chase", "credit_card", "3319", 2845.60, 25000.0, "demo"),
        ("Capital One Venture X", "Capital One", "credit_card", "7742", 1620.40, 30000.0, "demo"),
        ("Bank of America Customized Cash", "Bank of America", "credit_card", "5108", 890.25, 15000.0, "demo"),
        ("Wells Fargo Active Cash Card", "Wells Fargo", "credit_card", "6630", 540.00, 12000.0, "demo"),
        # Investment Accounts
        ("Vanguard Brokerage & Index Account", "Vanguard", "investment", "8812", 142650.00, 0.0, "demo"),
        ("Fidelity Rollover IRA & 401(k)", "Fidelity", "investment", "2049", 118420.00, 0.0, "demo"),
        ("Charles Schwab Individual Taxable", "Charles Schwab", "investment", "6591", 76890.00, 0.0, "demo"),
    ]

    acc_ids = {}
    for name, inst, atype, mask, bal, limit_amt, src in demo_accounts:
        cur.execute(
            """
            INSERT INTO accounts (name, institution, account_type, mask, balance, credit_limit, sync_source, last_synced, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (name, inst, atype, mask, bal, limit_amt, src, now_str),
        )
        acc_ids[name] = cur.lastrowid

    wf_chk = acc_ids["Wells Fargo Everyday Checking"]
    chase_cc = acc_ids["Chase Sapphire Reserve"]
    cap_cc = acc_ids["Capital One Venture X"]
    boa_cc = acc_ids["Bank of America Customized Cash"]
    wf_cc = acc_ids["Wells Fargo Active Cash Card"]
    vanguard_inv = acc_ids["Vanguard Brokerage & Index Account"]
    fidelity_inv = acc_ids["Fidelity Rollover IRA & 401(k)"]
    schwab_inv = acc_ids["Charles Schwab Individual Taxable"]

    # 2. Seed Investment Holdings across Vanguard, Fidelity, and Charles Schwab
    demo_holdings = [
        # Vanguard
        (vanguard_inv, "VTI", "Vanguard Total Stock Market ETF", 310.0, 68200.00, 286.50, 88815.00, 0.64, "US Index / Core Equities"),
        (vanguard_inv, "VXUS", "Vanguard Total International Stock ETF", 450.0, 24750.00, 63.40, 28530.00, 0.31, "International Equities"),
        (vanguard_inv, "BND", "Vanguard Total Bond Market ETF", 220.0, 16500.00, 73.50, 16170.00, -0.12, "Bonds & Fixed Income"),
        (vanguard_inv, "VMFXX", "Vanguard Federal Money Market Fund", 9135.0, 9135.00, 1.00, 9135.00, 0.00, "Cash & Money Market"),
        # Fidelity
        (fidelity_inv, "FXAIX", "Fidelity 500 Index Fund", 420.0, 67200.00, 202.80, 85176.00, 0.72, "US Index / Core Equities"),
        (fidelity_inv, "FTIHX", "Fidelity Total International Index", 1100.0, 14300.00, 14.60, 16060.00, 0.25, "International Equities"),
        (fidelity_inv, "SPAXX", "Fidelity Government Money Market", 17184.0, 17184.00, 1.00, 17184.00, 0.00, "Cash & Money Market"),
        # Charles Schwab
        (schwab_inv, "SCHD", "Schwab U.S. Dividend Equity ETF", 950.0, 24200.00, 29.10, 27645.00, 0.45, "Dividend & Value"),
        (schwab_inv, "QQQM", "Invesco NASDAQ 100 ETF", 120.0, 19800.00, 211.50, 25380.00, 1.15, "US Index / Core Equities"),
        (schwab_inv, "NVDA", "NVIDIA Corporation", 110.0, 9350.00, 138.60, 15246.00, 2.18, "Individual Stocks & Sector"),
        (schwab_inv, "SWVXX", "Schwab Value Advantage Money Fund", 8619.0, 8619.00, 1.00, 8619.00, 0.00, "Cash & Money Market"),
        (schwab_inv, "APXD-RSU", "Apex Design Studio (Unvested Equity)", 320.0, 44800.00, 140.00, 44800.00, 0.00, "Unvested RSU Equity"),
    ]

    for acc_id, sym, name, shares, cost, price, val, chg, aclass in demo_holdings:
        cur.execute(
            """
            INSERT INTO holdings (account_id, symbol, name, shares, cost_basis_total, current_price, current_value, day_change_pct, asset_class, last_updated, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (acc_id, sym, name, shares, cost, price, val, chg, aclass, now_str),
        )

    # 3. Seed 6 Months of Realistic Transactions (2026-05 through 2026-10)
    # Shows realistic category trends & noticeable Month-over-Month increases in Dining, Shopping, Travel, and Groceries!
    months_spec = [
        ("2026-05", 0.84),
        ("2026-06", 0.88),
        ("2026-07", 0.92),
        ("2026-08", 0.95),
        ("2026-09", 1.00),
        ("2026-10", 1.18),  # October has clear MoM increases in specific categories to highlight trend detection
    ]

    rules = [
        dict(r)
        for r in cur.execute(
            "SELECT keyword, merchant_name, category, tx_type, priority FROM category_rules ORDER BY priority DESC"
        ).fetchall()
    ]

    tx_list = []
    for ym, mult in months_spec:
        is_oct = (ym == "2026-10")
        is_sep = (ym == "2026-09")

        # Bi-weekly Payroll & Partner Housing Share into Wells Fargo Checking
        tx_list.extend([
            (wf_chk, "{0}-01".format(ym), "DIRECT DEP APEX DESIGN PAYROLL", -4650.00, "checking"),
            (wf_chk, "{0}-15".format(ym), "DIRECT DEP APEX DESIGN PAYROLL", -4650.00, "checking"),
            (wf_chk, "{0}-18".format(ym), "ZELLE FROM TAYLOR HOUSING SHARE", -1350.00, "checking"),
            (wf_chk, "{0}-28".format(ym), "DIVIDEND VANGUARD DIST", -215.40, "checking"),
        ])

        # Fixed Housing & Utilities
        tx_list.extend([
            (wf_chk, "{0}-02".format(ym), "FIRST HOME SERVICING MORTGAGE PMT", 2140.00, "checking"),
            (wf_chk, "{0}-03".format(ym), "OAKRIDGE HOA MONTHLY DUES", 300.00, "checking"),
            (wf_cc, "{0}-05".format(ym), "COMCAST XFINITY FIBER INTERNET", 79.99, "credit_card"),
            (wf_cc, "{0}-08".format(ym), "VERIZON WIRELESS BILL", 92.50, "credit_card"),
            (wf_cc, "{0}-12".format(ym), "CON EDISON ELECTRIC UTILITY", round(118.00 * (1.28 if is_oct else 1.0), 2), "credit_card"),
        ])

        if is_oct:
            tx_list.append((wf_chk, "2026-10-15", "ADDITIONAL PRINCIPAL PREPAYMENT DEMO", 3000.00, "checking"))
        elif ym in ("2026-06", "2026-08"):
            tx_list.append((wf_chk, "{0}-15".format(ym), "ADDITIONAL PRINCIPAL PREPAYMENT DEMO", 2500.00, "checking"))

        # Recurring Subscriptions & Memberships
        tx_list.extend([
            (chase_cc, "{0}-03".format(ym), "NETFLIX.COM SUBSCRIPTION", 22.99, "credit_card"),
            (chase_cc, "{0}-04".format(ym), "SPOTIFY USA DUO PLAN", 16.99, "credit_card"),
            (cap_cc, "{0}-06".format(ym), "OPENAI *CHATGPT PLUS", 20.00, "credit_card"),
            (cap_cc, "{0}-09".format(ym), "APPLE.COM/BILL ICLOUD+", 9.99, "credit_card"),
            (chase_cc, "{0}-10".format(ym), "EQUINOX FITNESS CLUB MONTHLY", 245.00, "credit_card"),
            (boa_cc, "{0}-14".format(ym), "AMAZON PRIME MEMBERSHIP", 14.99, "credit_card"),
            (cap_cc, "{0}-16".format(ym), "YOUTUBE PREMIUM MEMBERSHIP", 13.99, "credit_card"),
        ])

        # Groceries (steadily rising +19% in Oct)
        groc_mult = 1.21 if is_oct else (1.02 if is_sep else mult)
        tx_list.extend([
            (boa_cc, "{0}-04".format(ym), "WHOLEFDS MKT #1024", round(184.50 * groc_mult, 2), "credit_card"),
            (boa_cc, "{0}-11".format(ym), "TRADER JOE'S #512", round(132.40 * groc_mult, 2), "credit_card"),
            (boa_cc, "{0}-18".format(ym), "COSTCO WHSE #0419", round(248.00 * groc_mult, 2), "credit_card"),
            (boa_cc, "{0}-24".format(ym), "WHOLEFDS MKT #1024", round(156.80 * groc_mult, 2), "credit_card"),
        ])

        # Dining & Restaurants (big +36% surge in Oct driven by DoorDash & Restaurants)
        dine_mult = 1.34 if is_oct else (0.98 if is_sep else mult)
        tx_list.extend([
            (chase_cc, "{0}-03".format(ym), "TST* SWEETGREEN DOWNTOWN", round(24.80 * dine_mult, 2), "credit_card"),
            (chase_cc, "{0}-06".format(ym), "DOORDASH*THAI VILLA", round(68.40 * dine_mult, 2), "credit_card"),
            (chase_cc, "{0}-09".format(ym), "CHIPOTLE MEXICAN GRILL", round(21.50 * dine_mult, 2), "credit_card"),
            (chase_cc, "{0}-13".format(ym), "STARBUCKS STORE #4910", round(18.75 * dine_mult, 2), "credit_card"),
            (chase_cc, "{0}-16".format(ym), "TST* OMAKASE SUSHI RESTAURANT", round(165.00 * dine_mult, 2), "credit_card"),
            (chase_cc, "{0}-20".format(ym), "UBER EATS *PIZZA NAPOLI", round(54.20 * dine_mult, 2), "credit_card"),
            (chase_cc, "{0}-23".format(ym), "CAVA GRILL #118", round(26.40 * dine_mult, 2), "credit_card"),
        ])
        if is_oct:
            tx_list.append((chase_cc, "2026-10-21", "TST* STEAKHOUSE PRIME DINING", 248.50, "credit_card"))
            tx_list.append((chase_cc, "2026-10-24", "DOORDASH*WEEKEND GROUP ORDER", 112.80, "credit_card"))

        # Shopping & Retail (Amazon + Target + Apple Store spike in Oct)
        shop_mult = 1.25 if is_oct else (0.95 if is_sep else mult)
        tx_list.extend([
            (cap_cc, "{0}-05".format(ym), "AMZN Mktp US*2K91A", round(94.20 * shop_mult, 2), "credit_card"),
            (cap_cc, "{0}-12".format(ym), "TARGET T-1842", round(118.60 * shop_mult, 2), "credit_card"),
            (boa_cc, "{0}-19".format(ym), "AMZN Mktp US*8L44P", round(142.00 * shop_mult, 2), "credit_card"),
        ])
        if is_oct:
            tx_list.append((cap_cc, "2026-10-18", "APPLE STORE #R042 AIRPODS PRO", 269.00, "credit_card"))
            tx_list.append((boa_cc, "2026-10-22", "NIKE.COM RUNNING GEAR", 158.40, "credit_card"))

        # Travel & Transit
        trav_mult = 1.30 if is_oct else (0.90 if is_sep else mult)
        tx_list.extend([
            (chase_cc, "{0}-07".format(ym), "UBER *TRIP HELP.UBER.COM", round(42.50 * trav_mult, 2), "credit_card"),
            (chase_cc, "{0}-17".format(ym), "LYFT *RIDE FRI NIGHT", round(36.80 * trav_mult, 2), "credit_card"),
            (cap_cc, "{0}-15".format(ym), "DELTA AIR LINES TICKET", round(285.00 * trav_mult, 2), "credit_card"),
        ])
        if is_oct:
            tx_list.append((chase_cc, "2026-10-19", "MARRIOTT HOTELS WEEKEND STAY", 412.00, "credit_card"))

        # Automotive & Gas
        tx_list.extend([
            (wf_cc, "{0}-08".format(ym), "SHELL OIL 5744210", round(54.20 * mult, 2), "credit_card"),
            (wf_cc, "{0}-20".format(ym), "COSTCO GAS #0419", round(48.90 * mult, 2), "credit_card"),
            (wf_cc, "{0}-22".format(ym), "GEICO AUTO INSURANCE MONTHLY", 128.00, "credit_card"),
        ])

        # Entertainment
        tx_list.extend([
            (chase_cc, "{0}-14".format(ym), "AMC THEATRES IMAX TICKETS", round(46.00 * mult, 2), "credit_card"),
            (cap_cc, "{0}-21".format(ym), "TICKETMASTER CONCERT PASS", round(135.00 * (1.35 if is_oct else 0.85), 2), "credit_card"),
        ])

        # Credit Card Autopayments (Automatically categorized as Transfer / Payment so never double counted!)
        tx_list.extend([
            (wf_chk, "{0}-25".format(ym), "CHASE CREDIT CRD AUTOPAY", 1850.00, "checking"),
            (chase_cc, "{0}-25".format(ym), "PAYMENT THANK YOU - WEB", -1850.00, "credit_card"),
        ])

    for acc_id, dt, desc, amt, atype in tx_list:
        dedup = compute_tx_hash(acc_id, dt, desc, amt)
        merchant, cat, tx_type = categorize_transaction(desc, "", amt, atype, rules=rules)
        cur.execute(
            """
            INSERT OR IGNORE INTO transactions
            (account_id, tx_date, description, merchant, amount, tx_type, category, raw_source, dedup_hash, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'demo', ?, 1)
            """,
            (acc_id, dt, desc, merchant, amt, tx_type, cat, dedup),
        )

    # Seed 12 monthly net worth snapshots ending at the seeded Oct 2026 balances
    # Cash=$47,250, Investments=$337,960, Debt=$345,896.25 ($340k mort + $5,896.25 CC), Home=$545,000 -> NW=$584,313.75
    snap_months = [
        ("2025-11-30", 38500.0, 294200.0, 362400.0, 505300.0),
        ("2025-12-31", 39800.0, 298900.0, 360900.0, 514800.0),
        ("2026-01-31", 40600.0, 303500.0, 359400.0, 523700.0),
        ("2026-02-28", 41200.0, 307100.0, 357800.0, 531500.0),
        ("2026-03-31", 42100.0, 311800.0, 356200.0, 540700.0),
        ("2026-04-30", 42900.0, 316400.0, 354700.0, 549600.0),
        ("2026-05-31", 43600.0, 320900.0, 353100.0, 556400.0),
        ("2026-06-30", 44500.0, 324600.0, 350400.0, 563700.0),
        ("2026-07-31", 45100.0, 328200.0, 349000.0, 569300.0),
        ("2026-08-31", 45800.0, 331900.0, 347600.0, 575100.0),
        ("2026-09-30", 46400.0, 334800.0, 346800.0, 579400.0),
        ("2026-10-31", 47250.0, 337960.0, 345896.25, 584313.75),
    ]
    for s_dt, s_cash, s_inv, s_debt, s_nw in snap_months:
        cur.execute(
            """
            INSERT OR REPLACE INTO networth_snapshots
            (snap_date, cash, investments, debt, net_worth, is_demo)
            VALUES (?, ?, ?, ?, ?, 1)
            """,
            (s_dt, s_cash, s_inv, s_debt, s_nw),
        )

    conn.commit()
    conn.close()
    return True
