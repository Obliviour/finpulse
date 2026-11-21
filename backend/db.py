import os
import sqlite3
import hashlib
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
IMPORTS_DIR = os.path.join(BASE_DIR, "imports")
DB_PATH = os.environ.get("FINPULSE_DB_PATH") or os.path.join(DATA_DIR, "finance.db")

_DB_STATE_STAMP = [0]
_INDEXES_ENSURED = False


def get_db_stamp(conn=None):
    """Lightweight process-wide cache stamp combining DB file mtime and explicit write counter."""
    try:
        mtime = os.path.getmtime(DB_PATH) if os.path.exists(DB_PATH) else 0.0
    except OSError:
        mtime = 0.0
    return (mtime, _DB_STATE_STAMP[0])


def bump_db_stamp():
    """Increment explicit write counter to invalidate in-process analytics caches immediately."""
    _DB_STATE_STAMP[0] += 1


def ensure_dirs():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    if not os.path.exists(IMPORTS_DIR):
        os.makedirs(IMPORTS_DIR)


def get_connection():
    global _INDEXES_ENSURED
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    if not _INDEXES_ENSURED and os.path.exists(DB_PATH):
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tx_type_date ON transactions(tx_type, tx_date);")
            _INDEXES_ENSURED = True
        except Exception:
            pass
    return conn


def compute_tx_hash(account_id, tx_date, description, amount):
    raw = "{0}|{1}|{2}|{3:.2f}".format(
        account_id, str(tx_date).strip(), str(description).strip().upper(), float(amount)
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            institution TEXT NOT NULL,
            account_type TEXT NOT NULL, -- 'checking', 'savings', 'credit_card', 'investment'
            mask TEXT DEFAULT '',
            balance REAL DEFAULT 0.0,
            credit_limit REAL DEFAULT 0.0,
            currency TEXT DEFAULT 'USD',
            sync_source TEXT DEFAULT 'manual', -- 'csv', 'teller', 'simplefin', 'demo'
            external_id TEXT DEFAULT '',
            last_synced TEXT DEFAULT '',
            is_demo INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            tx_date TEXT NOT NULL, -- YYYY-MM-DD
            post_date TEXT DEFAULT '',
            description TEXT NOT NULL,
            merchant TEXT NOT NULL,
            amount REAL NOT NULL, -- Positive = Spending/Outflow, Negative = Income/Refund (normalized!)
            tx_type TEXT NOT NULL, -- 'expense', 'income', 'transfer', 'investment'
            category TEXT NOT NULL,
            subcategory TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            is_recurring INTEGER DEFAULT 0,
            is_anomaly INTEGER DEFAULT 0,
            raw_source TEXT DEFAULT 'csv',
            dedup_hash TEXT UNIQUE,
            is_demo INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(tx_date);
        CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
        CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
        CREATE INDEX IF NOT EXISTS idx_tx_type_date ON transactions(tx_type, tx_date);

        CREATE TABLE IF NOT EXISTS holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            name TEXT NOT NULL,
            shares REAL NOT NULL DEFAULT 0.0,
            cost_basis_total REAL NOT NULL DEFAULT 0.0,
            current_price REAL NOT NULL DEFAULT 0.0,
            current_value REAL NOT NULL DEFAULT 0.0,
            day_change_pct REAL DEFAULT 0.0,
            asset_class TEXT DEFAULT 'US Equities',
            last_updated TEXT DEFAULT '',
            is_demo INTEGER DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
            UNIQUE(account_id, symbol)
        );

        CREATE TABLE IF NOT EXISTS category_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL UNIQUE,
            merchant_name TEXT NOT NULL,
            category TEXT NOT NULL,
            tx_type TEXT DEFAULT 'expense',
            priority INTEGER DEFAULT 10
        );

        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL UNIQUE,
            monthly_limit REAL NOT NULL DEFAULT 0.0
        );

        CREATE TABLE IF NOT EXISTS spending_reflections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            merchant TEXT NOT NULL UNIQUE,
            bucket TEXT NOT NULL DEFAULT 'questionable',
            feeling TEXT DEFAULT '',
            why_bought TEXT DEFAULT '',
            monthly_target REAL DEFAULT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sync_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS imported_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            institution TEXT NOT NULL,
            records_imported INTEGER DEFAULT 0,
            records_skipped INTEGER DEFAULT 0,
            imported_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS networth_snapshots (
            snap_date TEXT PRIMARY KEY,
            cash REAL NOT NULL DEFAULT 0,
            investments REAL NOT NULL DEFAULT 0,
            debt REAL NOT NULL DEFAULT 0,
            net_worth REAL NOT NULL DEFAULT 0,
            is_demo INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS market_price_history (
            symbol TEXT NOT NULL,
            price_date TEXT NOT NULL,
            close_price REAL NOT NULL,
            PRIMARY KEY (symbol, price_date)
        );

        CREATE TABLE IF NOT EXISTS rehab_injuries (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body_region TEXT NOT NULL,
            side TEXT DEFAULT 'bilateral',
            tissue_type TEXT DEFAULT 'tendon',
            suspected_grade TEXT DEFAULT 'Grade 1',
            phase TEXT DEFAULT 'subacute',
            status TEXT DEFAULT 'active',
            onset_date TEXT DEFAULT '',
            mechanism TEXT DEFAULT '',
            symptoms TEXT DEFAULT '',
            anatomy_note TEXT DEFAULT '',
            climbing_modifications TEXT DEFAULT '',
            red_flags TEXT DEFAULT '',
            protocol_id TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            is_demo INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS rehab_daily_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT NOT NULL,
            injury_id TEXT NOT NULL,
            pain_rest INTEGER DEFAULT 0,
            pain_load INTEGER DEFAULT 0,
            morning_stiffness INTEGER DEFAULT 0,
            swelling INTEGER DEFAULT 0,
            warmup_minutes INTEGER DEFAULT 0,
            climbed_today INTEGER DEFAULT 0,
            session_rpe INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(log_date, injury_id)
        );

        CREATE TABLE IF NOT EXISTS rehab_workout_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_date TEXT NOT NULL,
            protocol_id TEXT NOT NULL,
            protocol_title TEXT NOT NULL,
            duration_sec INTEGER DEFAULT 0,
            exercises_completed INTEGER DEFAULT 0,
            total_exercises INTEGER DEFAULT 0,
            post_pain INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rehab_assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assessed_date TEXT NOT NULL,
            test_id TEXT NOT NULL,
            left_val REAL,
            right_val REAL,
            bilateral_val REAL,
            unit TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    # Seed & update default generic category rules (no PII)
    default_rules = [
        # Transfers & Credit Card / Mortgage Payments (excluded from consumer spending)
        ("AUTOMATIC PAYMENT", "Credit Card Autopay", "Transfer / Payment", "transfer", 105),
        ("AUTOPAY", "Credit Card Autopay", "Transfer / Payment", "transfer", 105),
        ("PAYMENT THANK YOU", "Credit Card Payment", "Transfer / Payment", "transfer", 105),
        ("ONLINE PAYMENT", "Credit Card Payment", "Transfer / Payment", "transfer", 105),
        ("ONLINE/MOBILE RECURRING", "BoA Card Autopay", "Transfer / Payment", "transfer", 105),
        ("BA ELECTRONIC PAYMENT", "BoA Card Autopay", "Transfer / Payment", "transfer", 105),
        ("WF CREDIT CARD AUTO PAY", "Wells Fargo Card Autopay", "Transfer / Payment", "transfer", 105),
        ("WELLS FARGO ACTIVE CASH", "Wells Fargo Card Transfer", "Transfer / Payment", "transfer", 105),
        ("CHASE CREDIT CRD", "Chase Card Payment", "Transfer / Payment", "transfer", 105),
        ("CAPITAL ONE CRCARDPMT", "Capital One Payment", "Transfer / Payment", "transfer", 105),
        ("BANK OF AMERICA CREDIT CARD BILL", "BoA Card Payment", "Transfer / Payment", "transfer", 105),
        ("BK OF AMER VISA ONLINE PMT", "BoA Card Payment", "Transfer / Payment", "transfer", 105),
        ("WELLS FARGO CARD", "Wells Fargo Card Payment", "Transfer / Payment", "transfer", 105),
        ("AMERICAN EXPRESS ACH PMT", "Amex Card Payment", "Transfer / Payment", "transfer", 105),
        ("AMEX EPAYMENT", "Amex Card Payment", "Transfer / Payment", "transfer", 105),
        ("PAYPAL INST XFER", "PayPal Card Payment", "Transfer / Payment", "transfer", 105),
        ("ADDITIONAL PRINCIPAL", "Extra Mortgage Principal", "Transfer / Payment", "transfer", 105),
        ("VANGUARD BUY", "Vanguard Investment Transfer", "Investment Transfer", "transfer", 100),
        ("FIDELITY BKG SVC", "Fidelity Investment Transfer", "Investment Transfer", "transfer", 100),
        ("FID BKG SVC", "Fidelity Investment Transfer", "Investment Transfer", "transfer", 100),
        ("EFT FUNDS RECEIVED", "Brokerage EFT Transfer", "Investment Transfer", "transfer", 100),
        ("SCHWAB BROKERAGE", "Schwab Investment Transfer", "Investment Transfer", "transfer", 100),
        ("ZELLE TRANSFER", "Zelle Transfer", "Transfer / Payment", "transfer", 90),
        ("ONLINE TRANSFER TO", "Internal Savings Transfer", "Transfer / Payment", "transfer", 95),

        # Income
        ("PAYROLL", "Employer Payroll", "Income", "income", 95),
        ("DIRECT DEP", "Direct Deposit Payroll", "Income", "income", 95),
        ("VENMO CASHOUT", "Venmo Cashout", "Income", "income", 92),
        ("WELLS FARGO REWARDS", "Wells Fargo Rewards", "Income", "income", 92),
        ("ONLINE TRANSFER FROM", "Incoming Transfer", "Income", "income", 90),
        ("FIDELITY DIVIDEND", "Fidelity Dividend", "Income", "income", 95),
        ("VANGUARD DIVIDEND", "Vanguard Dividend", "Income", "income", 95),
        ("INTEREST PAYMENT", "Bank Interest", "Income", "income", 90),
        ("DIVIDEND", "Investment Dividend", "Income", "income", 90),

        # Housing & Utilities
        ("RENT PAYMENT", "Monthly Rent / Housing", "Housing", "expense", 60),
        ("MORTGAGE", "Mortgage Payment", "Housing", "expense", 60),
        ("FIRST HOME SERVICING", "First Home Servicing Mortgage", "Housing", "expense", 80),
        ("OAKRIDGE HOA", "Oakridge HOA", "Housing", "expense", 80),
        ("BILT", "Bilt Rent Payment", "Housing", "expense", 60),
        ("HOA", "HOA Dues", "Housing", "expense", 55),

        # Groceries
        ("COSTCO WHSE", "Costco Wholesale", "Groceries", "expense", 75),
        ("WHOLEFDS", "Whole Foods Market", "Groceries", "expense", 50),
        ("WHOLE FOODS", "Whole Foods Market", "Groceries", "expense", 50),
        ("TRADER JOE", "Trader Joe's", "Groceries", "expense", 50),
        ("KROGER", "Kroger", "Groceries", "expense", 50),
        ("SAFEWAY", "Safeway", "Groceries", "expense", 50),
        ("HMART", "H Mart", "Groceries", "expense", 60),
        ("PUBLIX", "Publix", "Groceries", "expense", 50),
        ("WEGMANS", "Wegmans", "Groceries", "expense", 50),
        ("ALDI", "Aldi", "Groceries", "expense", 50),
        ("HEB ", "H-E-B", "Groceries", "expense", 50),
        ("CENTRAL MARKET", "Central Market", "Groceries", "expense", 55),
        ("INSTACART", "Instacart", "Groceries", "expense", 50),

        # Dining & Restaurants
        ("UBER   *EATS", "Uber Eats", "Dining & Restaurants", "expense", 85),
        ("UBER *EATS", "Uber Eats", "Dining & Restaurants", "expense", 85),
        ("UBER EATS", "Uber Eats", "Dining & Restaurants", "expense", 85),
        ("DOORDASH", "DoorDash", "Dining & Restaurants", "expense", 80),
        ("SWEETGREEN", "Sweetgreen", "Dining & Restaurants", "expense", 50),
        ("CHIPOTLE", "Chipotle", "Dining & Restaurants", "expense", 75),
        ("STARBUCKS", "Starbucks", "Dining & Restaurants", "expense", 50),
        ("GRUBHUB", "Grubhub", "Dining & Restaurants", "expense", 50),
        ("CHICK-FIL-A", "Chick-fil-A", "Dining & Restaurants", "expense", 50),
        ("PANERA", "Panera Bread", "Dining & Restaurants", "expense", 50),
        ("SHAKE SHACK", "Shake Shack", "Dining & Restaurants", "expense", 50),
        ("CAVA", "CAVA", "Dining & Restaurants", "expense", 50),
        ("RESTAURANT", "Restaurant", "Dining & Restaurants", "expense", 30),
        ("CAFE", "Local Cafe", "Dining & Restaurants", "expense", 30),
        ("COFFEE", "Coffee Shop", "Dining & Restaurants", "expense", 30),
        ("TST*", "Restaurant (Toast POS)", "Dining & Restaurants", "expense", 25),
        ("SQ *", "Local Merchant (Square)", "Dining & Restaurants", "expense", 20),

        # Shopping & Retail
        ("WWW COSTCO COM", "Costco.com", "Shopping", "expense", 85),
        ("REI.COM", "REI Co-op", "Shopping", "expense", 85),
        ("REI #", "REI Co-op", "Shopping", "expense", 85),
        ("COSTCO *ANNUAL RENEWAL", "Costco Membership", "Shopping", "expense", 80),
        ("PAYPAL PURCHASE", "PayPal Purchase", "Shopping", "expense", 65),
        ("VENMO PAYMENT", "Venmo Payment", "Shopping", "expense", 65),
        ("AMAZON MKTPL", "Amazon Marketplace", "Shopping", "expense", 55),
        ("AMAZON.COM", "Amazon", "Shopping", "expense", 55),
        ("AMZN", "Amazon", "Shopping", "expense", 50),
        ("AMAZON", "Amazon", "Shopping", "expense", 50),
        ("TARGET", "Target", "Shopping", "expense", 50),
        ("WAL-MART", "Walmart", "Shopping", "expense", 50),
        ("WALMART", "Walmart", "Shopping", "expense", 50),
        ("APPLE.COM/BILL", "Apple Services", "Subscriptions", "expense", 60),
        ("APPLE STORE", "Apple Store", "Shopping", "expense", 55),
        ("BEST BUY", "Best Buy", "Shopping", "expense", 50),
        ("HOME DEPOT", "The Home Depot", "Home & Utilities", "expense", 80),
        ("HOMEDEPOT.COM", "The Home Depot", "Home & Utilities", "expense", 85),
        ("LOWES", "Lowe's", "Home & Utilities", "expense", 80),
        ("IKEA", "IKEA", "Shopping", "expense", 85),
        ("NIKE", "Nike", "Shopping", "expense", 50),
        ("NORDSTROM", "Nordstrom", "Shopping", "expense", 50),

        # Subscriptions & Recurring Tech
        ("HBOMAX", "HBO Max", "Subscriptions", "expense", 85),
        ("PRIME VIDEO", "Prime Video Channels", "Subscriptions", "expense", 85),
        ("NETFLIX", "Netflix", "Subscriptions", "expense", 80),
        ("SPOTIFY", "Spotify", "Subscriptions", "expense", 80),
        ("HULU", "Hulu", "Subscriptions", "expense", 60),
        ("HBO MAX", "Max", "Subscriptions", "expense", 60),
        ("YOUTUBE PREMIUM", "YouTube Premium", "Subscriptions", "expense", 60),
        ("OPENAI", "OpenAI ChatGPT", "Subscriptions", "expense", 60),
        ("ANTHROPIC", "Anthropic Claude", "Subscriptions", "expense", 60),
        ("AMAZON PRIME", "Amazon Prime", "Subscriptions", "expense", 80),
        ("NYTIMES", "New York Times", "Subscriptions", "expense", 60),
        ("ANNUAL FEE", "Credit Card Annual Fee", "Subscriptions", "expense", 75),

        # Health & Fitness
        ("GYM", "Fitness Membership", "Health & Fitness", "expense", 55),
        ("EQUINOX", "Equinox", "Health & Fitness", "expense", 60),
        ("PELOTON", "Peloton", "Health & Fitness", "expense", 60),
        ("CVS/PHARMACY", "CVS Pharmacy", "Health & Fitness", "expense", 50),
        ("WALGREENS", "Walgreens", "Health & Fitness", "expense", 50),
        ("ONE MEDICAL", "One Medical", "Health & Fitness", "expense", 55),
        ("DENTAL", "Dental Care", "Health & Fitness", "expense", 50),

        # Travel & Transit
        ("UBER *TRIP", "Uber", "Travel & Transit", "expense", 55),
        ("UBER", "Uber", "Travel & Transit", "expense", 45),
        ("LYFT", "Lyft", "Travel & Transit", "expense", 75),
        ("DELTA AIR", "Delta Air Lines", "Travel & Transit", "expense", 60),
        ("UNITED AIR", "United Airlines", "Travel & Transit", "expense", 60),
        ("AMERICAN AIR", "American Airlines", "Travel & Transit", "expense", 60),
        ("SOUTHWEST", "Southwest Airlines", "Travel & Transit", "expense", 60),
        ("AIRBNB", "Airbnb", "Travel & Transit", "expense", 60),
        ("MARRIOTT", "Marriott Hotels", "Travel & Transit", "expense", 60),
        ("HILTON", "Hilton Hotels", "Travel & Transit", "expense", 60),
        ("HYATT", "Hyatt Hotels", "Travel & Transit", "expense", 60),
        ("PARKING", "Parking", "Travel & Transit", "expense", 40),
        ("MTA*", "MTA Transit", "Travel & Transit", "expense", 50),

        # Automotive & Gas
        ("COSTCO GAS", "Costco Gas", "Automotive & Gas", "expense", 85),
        ("STATE FARM", "State Farm Insurance", "Automotive & Gas", "expense", 85),
        ("PROGRESSIVE", "Progressive Insurance", "Automotive & Gas", "expense", 85),
        ("SHELL OIL", "Shell Gas", "Automotive & Gas", "expense", 50),
        ("EXXON", "ExxonMobil", "Automotive & Gas", "expense", 50),
        ("CHEVRON", "Chevron", "Automotive & Gas", "expense", 50),
        ("BP#", "BP Gas", "Automotive & Gas", "expense", 50),
        ("GEICO", "GEICO Auto Insurance", "Automotive & Gas", "expense", 60),
        ("TESLA SUPERCHARGER", "Tesla Supercharger", "Automotive & Gas", "expense", 55),

        # Home & Utilities
        ("COMCAST", "Xfinity / Comcast", "Home & Utilities", "expense", 80),
        ("XFINITY", "Xfinity Internet", "Home & Utilities", "expense", 80),
        ("VERIZON", "Verizon Wireless", "Home & Utilities", "expense", 60),
        ("AT&T", "AT&T", "Home & Utilities", "expense", 60),
        ("T-MOBILE", "T-Mobile", "Home & Utilities", "expense", 60),
        ("CON EDISON", "Con Edison Electric", "Home & Utilities", "expense", 60),
        ("PG&E", "PG&E Utility", "Home & Utilities", "expense", 60),
        ("DUKE ENERGY", "Duke Energy", "Home & Utilities", "expense", 60),

        # Entertainment
        ("AMC THEATRES", "AMC Theatres", "Entertainment", "expense", 50),
        ("TICKETMASTER", "Ticketmaster", "Entertainment", "expense", 50),
        ("STUBHUB", "StubHub", "Entertainment", "expense", 50),
        ("STEAM GAMES", "Steam", "Entertainment", "expense", 50),
    ]
    try:
        from backend.profile_loader import get_extra_category_rules
        for r in get_extra_category_rules():
            default_rules.append((
                r["keyword"], r["merchant_name"], r["category"], r["tx_type"], int(r.get("priority", 85))
            ))
    except Exception:
        pass

    cur.executemany(
        "INSERT OR REPLACE INTO category_rules (keyword, merchant_name, category, tx_type, priority) VALUES (?, ?, ?, ?, ?)",
        default_rules,
    )

    # Seed default budgets if empty
    cur.execute("SELECT COUNT(*) as cnt FROM budgets")
    if cur.fetchone()["cnt"] == 0:
        default_budgets = [
            ("Housing", 9000.0),
            ("Groceries", 850.0),
            ("Dining & Restaurants", 650.0),
            ("Shopping", 800.0),
            ("Travel & Transit", 600.0),
            ("Home & Utilities", 450.0),
            ("Automotive & Gas", 350.0),
            ("Health & Fitness", 350.0),
            ("Subscriptions", 150.0),
            ("Entertainment", 250.0),
        ]
        cur.executemany(
            "INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)",
            default_budgets,
        )

    conn.commit()
    conn.close()
