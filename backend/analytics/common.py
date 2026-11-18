"""Shared helpers for the analytics package: scoping, month math, and sign conventions.

Conventions (see backend/db.py):
  * transactions.amount > 0  -> money out (spend / charge); < 0 -> money in (income / refund).
  * "Spend" = SUM(amount) over tx_type='expense' rows, so refunds (negative expense rows) net out.
  * "Income" = SUM(ABS(amount)) over tx_type='income' rows (robust to either sign on import).
  * Transfers / card payments / investment moves are never spend.
"""
import calendar
import re
from datetime import date, datetime, timedelta

FIXED_CATEGORIES = {"Housing", "Home & Utilities", "Subscriptions", "Groceries"}
FIXED_MERCHANT_PATTERN = re.compile(r"INSURANCE|GEICO|PROGRESSIVE|STATE FARM|ALLSTATE", re.I)
NON_RECURRING_CATEGORIES = {"Groceries", "Dining & Restaurants", "Shopping", "Travel & Transit", "Entertainment"}
BROAD_INDEX_SYMBOLS = {
    "VTI", "VOO", "SPY", "IVV", "ITOT", "SCHB", "SCHX", "FXAIX", "FSKAX", "FZROX", "SWTSX", "SWPPX",
    "VTSAX", "VFIAX", "VXUS", "VEA", "IXUS", "FTIHX", "FZILX", "SCHF", "BND", "AGG", "VT", "VTWAX",
    "VFFSX", "VIIIX", "VIEIX", "VEXAX", "VIDMX", "VTMGX", "VTTSX", "SPYX", "HEQ-INV",
}
CASH_LIKE_CLASS_PATTERN = re.compile(r"cash|money market", re.I)
PRETAX_ACCOUNT_PATTERN = re.compile(r"IRA|401|403|TSP|pension", re.I)
ROTH_ACCOUNT_PATTERN = re.compile(r"roth", re.I)


class Scope(object):
    """Restricts every query to the accounts of one institution (or all accounts)."""

    def __init__(self, conn, institution=None):
        self.institution = institution if institution and institution != "All" else None
        if self.institution:
            rows = conn.execute("SELECT id FROM accounts WHERE institution = ?", (self.institution,)).fetchall()
        else:
            rows = conn.execute("SELECT id FROM accounts").fetchall()
        self.account_ids = [int(r["id"]) for r in rows]

    def clause(self, col="t.account_id"):
        """SQL fragment (safe: ids are ints from our own DB) restricting to the scoped accounts."""
        if not self.account_ids:
            return " AND 0 "
        return " AND {0} IN ({1}) ".format(col, ",".join(str(i) for i in self.account_ids))


def ym_of(d):
    return "{0:04d}-{1:02d}".format(d.year, d.month)


def parse_ym(ym):
    y, m = ym.split("-")
    return int(y), int(m)


def add_months(ym, n):
    y, m = parse_ym(ym)
    idx = y * 12 + (m - 1) + n
    return "{0:04d}-{1:02d}".format(idx // 12, idx % 12 + 1)


def month_range(start_ym, end_ym):
    out, cur = [], start_ym
    while cur <= end_ym:
        out.append(cur)
        cur = add_months(cur, 1)
    return out


def days_in_month(ym):
    y, m = parse_ym(ym)
    return calendar.monthrange(y, m)[1]


def month_end_date(ym):
    y, m = parse_ym(ym)
    return date(y, m, days_in_month(ym))


def parse_date(s):
    if not s or len(str(s).strip()) < 10:
        return date.min
    try:
        return datetime.strptime(str(s).strip()[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return date.min


def month_label(ym):
    y, m = parse_ym(ym)
    return "{0} {1}".format(calendar.month_abbr[m], y)


def pct_change(cur, base):
    """Percent change, or None when base is ~0 or cur is None."""
    if cur is None or base is None or abs(base) < 0.005:
        return None
    return round((cur - base) / abs(base) * 100.0, 1)


def r2(x):
    return round(float(x or 0.0), 2)


def median(values):
    vals = sorted(values)
    n = len(vals)
    if n == 0:
        return 0.0
    mid = n // 2
    return float(vals[mid]) if n % 2 else (vals[mid - 1] + vals[mid]) / 2.0


def is_fixed(category, merchant=""):
    return category in FIXED_CATEGORIES or bool(FIXED_MERCHANT_PATTERN.search(merchant or ""))


def tax_bucket(account_name):
    if ROTH_ACCOUNT_PATTERN.search(account_name or ""):
        return "roth"
    if PRETAX_ACCOUNT_PATTERN.search(account_name or ""):
        return "pretax"
    return "taxable"


class Period(object):
    """Selected month plus the comparison window."""

    def __init__(self, selected_ym, today):
        self.ym = selected_ym
        self.today = today
        self.dim = days_in_month(selected_ym)
        self.is_partial = ym_of(today) == selected_ym and today.day < self.dim
        self.days_elapsed = today.day if self.is_partial else self.dim
        self.compare_day = self.days_elapsed if self.is_partial else None
        self.prev_ym = add_months(selected_ym, -1)
        self.prior_3 = [add_months(selected_ym, -i) for i in (1, 2, 3)]
        self.start = "{0}-01".format(selected_ym)
        self.end = month_end_date(selected_ym).isoformat()
        self.as_of = min(today, month_end_date(selected_ym))

    def to_dict(self):
        return {
            "month": self.ym,
            "label": month_label(self.ym),
            "prev_month": self.prev_ym,
            "is_partial": self.is_partial,
            "days_elapsed": self.days_elapsed,
            "days_in_month": self.dim,
            "pct_of_month_elapsed": round(self.days_elapsed / float(self.dim) * 100.0, 1),
            "compare_basis": "same_day" if self.is_partial else "full_month",
            "as_of": self.as_of.isoformat(),
        }


def day_clause(compare_day, col="t.tx_date"):
    if not compare_day:
        return ""
    return " AND CAST(substr({0}, 9, 2) AS INTEGER) <= {1} ".format(col, int(compare_day))
