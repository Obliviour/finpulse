# FinPulse — Personal Wealth, Mortgage, FIRE & Kitchen Command Center

A zero-build, full-stack personal finance and life optimization dashboard built with **Python (Flask + SQLite)** and **React + Chart.js + Tailwind** in a modern Bento layout.

Out of the box, FinPulse runs in **Demo Mode** with realistic synthetic data so you can explore every view safely without touching real financial credentials or personal records. Your own books live separately in an **AES-encrypted local vault** (`private/` + `data/finance.db`, gitignored) managed by [`vault_manager.py`](file:///vault_manager.py).

## Key Workspaces

1. **Command Center**: Asymmetric Bento overview with net worth KPIs, secular trend vs. local comps valuation toggle, 12-month net worth attribution curve, liquidity runway (checking + money market funds), credit utilization, priority action queue, and consolidated account balance sheet.
2. **Cash Flow & Matrix**:
   - **Cash Flow & Explore**: Income composition, partner housing-share offsets, extra mortgage principal prepayments, and interactive 12-month category matrix.
   - **Transactions Pivot**: Multi-facet filterable ledger, inline recategorization, and merchant rule builder.
   - **Audit & Trips**: Necessity vs. discretionary spend tiers, big-ticket purchase verdicts (`>= $450`), trip timelines, and sinking-fund planner.
3. **Investments & Property**:
   - **Portfolio & Allocation**: Tax-bucket split (Retirement, Taxable, Equity Awards, HSA), concentration alerts, and holdings drill-down.
   - **Real Estate & Mortgage**: Amortization tracker, IRS Pub 936 `$750k` loan cap tax math, recast savings modeling, and house vs. index investing comparison.
4. **Planning & Scenarios**:
   - **FIRE & RSU Engine**: Take-home paycheck & FICA waterfall, RSU vesting runway, 401(k) / Mega Backdoor tracker, and Monte Carlo retirement projections.
   - **Activity & Sync**: CSV/OFX/PDF statement ingestion, custom category rules, and optional market price / aggregator sync.
5. **Fuel & Labs** (header toggle): Longitudinal biomarker tracker, athletic macro planner, modular weekly prep system, and dining-out vs. home kitchen ROI simulator (powered by synthetic sample data in Demo Mode).

---

## Quick Start (Public Demo Mode)

```bash
git clone https://github.com/Obliviour/finpulse.git
cd finpulse
pip install -r requirements.txt
python app.py
```

Open **http://localhost:5000**. On first boot without a private vault, FinPulse automatically seeds synthetic demo accounts, holdings, 12-month snapshots, and sample transactions.

To force Demo Mode explicitly even when a local `private/profile.json` exists:

```powershell
# PowerShell
$env:FINPULSE_PROFILE_MODE="demo"
python app.py
```

---

## Private Encrypted Vault (Moving Between Machines)

All personal files (`private/`, `data/*.db`, `certs/`, raw statement imports) are excluded in `.gitignore`. Use `vault_manager.py` (AES-128-CBC + HMAC-SHA256 via PBKDF2-HMAC-SHA256 `200,000` rounds) to encrypt your personal bundle into a single portable file (`FinPulse_Private_Vault.enc`) suitable for private Google Drive storage:

```bash
# Seal personal files into FinPulse_Private_Vault.enc (prompts for passphrase)
python vault_manager.py seal

# Unpack on a new machine after cloning this repo
python vault_manager.py open FinPulse_Private_Vault.enc
```

See [`INTAKE_ON_NEW_PC.md`](file:///INTAKE_ON_NEW_PC.md) for the complete new-machine bootstrap checklist (including loading the workspace in Antigravity).

---

## Testing

```bash
# Public isolated test suite (uses temp SQLite DB + Demo Mode)
pytest tests/ -v
```
