"""Recurring-charge detection, anomaly (outlier) detection and duplicate-charge detection."""
from collections import defaultdict
from datetime import timedelta

from backend.analytics.common import NON_RECURRING_CATEGORIES, median, parse_date, r2

CADENCES = [
    # name, min_days, max_days, nominal_days
    ("weekly", 5, 9, 7),
    ("biweekly", 12, 17, 14),
    ("monthly", 26, 35, 30.44),
    ("quarterly", 84, 98, 91.3),
    ("annual", 350, 380, 365.25),
]
GRACE_DAYS = {"weekly": 3, "biweekly": 4, "monthly": 6, "quarterly": 12, "annual": 20}


def _cadence_for(interval):
    for name, lo, hi, nominal in CADENCES:
        if lo <= interval <= hi:
            return name, nominal
    return None, None


def detect_recurring(conn, scope, as_of):
    """Merchants charged on a regular cadence with a stable price."""
    rows = conn.execute(
        "SELECT t.merchant, t.category, t.tx_date, t.amount, a.name AS account_name, a.institution "
        "FROM transactions t JOIN accounts a ON a.id = t.account_id "
        "WHERE t.tx_type='expense' AND t.amount > 0 AND t.tx_date <= ?" + scope.clause() +
        " ORDER BY t.merchant, t.tx_date",
        (as_of.isoformat(),),
    ).fetchall()
    by_merchant = defaultdict(list)
    for r in rows:
        by_merchant[r["merchant"]].append(r)

    out = []
    for merchant, txs in by_merchant.items():
        category = txs[-1]["category"]
        if category in NON_RECURRING_CATEGORIES:
            continue
        dates = [parse_date(t["tx_date"]) for t in txs]
        amounts = [float(t["amount"]) for t in txs]
        if len(txs) < 2:
            continue
        gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        gaps = [g for g in gaps if g > 0]
        if not gaps:
            continue
        med_gap = median(gaps)
        cadence, nominal = _cadence_for(med_gap)
        if not cadence:
            continue
        if cadence != "annual" and len(txs) < 3:
            continue
        if any(abs(g - med_gap) > med_gap * 0.30 for g in gaps):
            continue
        latest = amounts[-1]
        stable = sum(1 for a in amounts if abs(a - latest) <= max(latest * 0.02, 0.01))
        if stable / float(len(amounts)) < 0.6 and category != "Subscriptions":
            prev_vals = amounts[:-1]
            if not (len(set(round(a, 2) for a in prev_vals)) == 1 and len(prev_vals) >= 2):
                continue

        prev_amount = amounts[-2]
        price_change = None
        if abs(latest - prev_amount) > max(prev_amount * 0.01, 0.5):
            price_change = {
                "from": r2(prev_amount),
                "to": r2(latest),
                "diff": r2(latest - prev_amount),
                "pct": round((latest - prev_amount) / prev_amount * 100.0, 1) if prev_amount > 0 else 0.0,
                "date": txs[-1]["tx_date"],
            }
        next_expected = dates[-1] + timedelta(days=int(round(med_gap)))
        days_overdue = (as_of - next_expected).days
        max_missed_days = max(GRACE_DAYS[cadence] * 5, 90)
        if days_overdue > max_missed_days:
            status = "inactive"
        elif days_overdue > GRACE_DAYS[cadence]:
            status = "missed"
        else:
            status = "active"
        monthly_eq = latest * 30.44 / nominal
        out.append({
            "merchant": merchant,
            "category": category,
            "cadence": cadence,
            "amount": r2(latest),
            "monthly_amount": r2(monthly_eq),
            "monthly_equivalent": r2(monthly_eq),
            "annual_cost": r2(monthly_eq * 12),
            "charges": len(txs),
            "first_charged": txs[0]["tx_date"],
            "last_charged": txs[-1]["tx_date"],
            "next_expected": next_expected.isoformat(),
            "status": status,
            "price_change": price_change,
            "account_name": txs[-1]["account_name"],
            "institution": txs[-1]["institution"],
        })
    out.sort(key=lambda x: x["monthly_equivalent"], reverse=True)
    return out


def detect_anomalies(conn, scope, period):
    """Charges in the selected month that are unusually large vs. prior history."""
    month_rows = conn.execute(
        "SELECT t.id, t.tx_date, t.merchant, t.description, t.category, t.amount, a.name AS account_name, a.institution "
        "FROM transactions t JOIN accounts a ON a.id = t.account_id "
        "WHERE t.tx_type='expense' AND t.amount > 0 AND substr(t.tx_date,1,7) = ? AND t.category != 'Housing'"
        + scope.clause() + " ORDER BY t.amount DESC",
        (period.ym,),
    ).fetchall()
    prior = conn.execute(
        "SELECT t.merchant, t.category, t.amount FROM transactions t "
        "WHERE t.tx_type='expense' AND t.amount > 0 AND t.tx_date < ?" + scope.clause(),
        (period.start,),
    ).fetchall()
    by_merchant = defaultdict(list)
    by_category = defaultdict(list)
    for r in prior:
        by_merchant[r["merchant"]].append(float(r["amount"]))
        by_category[r["category"]].append(float(r["amount"]))

    out = []
    for r in month_rows:
        amt = float(r["amount"])
        hist = by_merchant.get(r["merchant"], [])
        reason, typical = None, None
        if len(hist) >= 3:
            med = median(hist)
            mad = median([abs(h - med) for h in hist])
            threshold = med + max(3 * 1.4826 * mad, 0.5 * med)
            if amt > threshold and amt - med >= 25:
                typical = med
                reason = "{0:.0f}% above your typical ${1:,.0f} here".format((amt - med) / med * 100.0, med)
        elif hist:
            mean = sum(hist) / len(hist)
            if amt > 1.75 * mean and amt - mean >= 50:
                typical = mean
                reason = "{0:.0f}% above your previous ${1:,.0f} here".format((amt - mean) / mean * 100.0, mean)
        else:
            cat_hist = sorted(by_category.get(r["category"], []))
            p90 = cat_hist[int(0.9 * (len(cat_hist) - 1))] if cat_hist else 0.0
            if amt >= max(150.0, p90):
                reason = "First charge at a new merchant"
        if reason:
            out.append({
                "id": r["id"], "tx_date": r["tx_date"], "merchant": r["merchant"], "description": r["description"],
                "category": r["category"], "amount": r2(amt), "typical": r2(typical) if typical else None,
                "excess": r2(amt - typical) if typical else r2(amt),
                "account_name": r["account_name"], "institution": r["institution"], "reason": reason,
            })
    return out


def detect_duplicates(conn, scope, period, window_days=3):
    """Same merchant + same amount on the same account within `window_days` in the selected month."""
    rows = conn.execute(
        "SELECT t.id, t.tx_date, t.merchant, t.amount, t.account_id, t.category, a.name AS account_name "
        "FROM transactions t JOIN accounts a ON a.id = t.account_id "
        "WHERE t.tx_type='expense' AND t.amount > 0 AND substr(t.tx_date,1,7) = ?" + scope.clause() +
        " ORDER BY t.merchant, t.amount, t.tx_date",
        (period.ym,),
    ).fetchall()
    out = []
    for i in range(1, len(rows)):
        a, b = rows[i - 1], rows[i]
        if a["merchant"] == b["merchant"] and abs(a["amount"] - b["amount"]) < 0.005 and a["account_id"] == b["account_id"]:
            gap = (parse_date(b["tx_date"]) - parse_date(a["tx_date"])).days
            if gap <= window_days:
                out.append({
                    "merchant": a["merchant"], "amount": r2(a["amount"]), "category": a["category"],
                    "account_name": a["account_name"], "dates": [a["tx_date"], b["tx_date"]], "ids": [a["id"], b["id"]],
                })
    return out
