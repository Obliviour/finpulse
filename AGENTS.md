# FinPulse Dashboard — Antigravity Workspace Context (`AGENTS.md`)

This file is automatically loaded by Antigravity as a **Workspace Rule** whenever this project is opened. It documents the architecture, privacy boundary, API contract, and testing commands for **FinPulse**.

---

## 1. Dual-Mode Architecture (Public Demo vs. Encrypted Private Vault)

FinPulse separates public application code cleanly from personal financial & health records via [`backend/profile_loader.py`](file:///backend/profile_loader.py):

- **Demo Mode (`FINPULSE_PROFILE_MODE=demo`, or when `private/profile.json` is absent)**:
  - Loads [`backend/demo_profile.json`](file:///backend/demo_profile.json) (100% synthetic sample household data).
  - [`backend/seed_demo.py`](file:///backend/seed_demo.py) initializes a realistic 11-account demo SQLite database if `data/finance.db` is empty.
- **Private Mode (local `private/profile.json` + `data/finance.db` mounted from encrypted vault)**:
  - [`private/`](file:///private/) and [`data/*.db`](file:///data/) are **strictly gitignored**. Never copy personal names, addresses, account numbers, tax IDs, trip logs, or clinical lab values into git-tracked files.
  - When present locally, check `private/AGENTS.private.md` for household-specific context and run `private/tests/test_private_parity.py` to verify personal ledger invariants.

### Encrypted Vault Workflow (`vault_manager.py`)
- Seal private data (`private/`, `data/finance.db`, `certs/`, statement folders):
  ```bash
  python vault_manager.py seal
  ```
- Unpack onto a new machine:
  ```bash
  python vault_manager.py open
  ```
- Inspect vault status:
  ```bash
  python vault_manager.py status
  ```
Never store vault passphrases in git, scripts, or plaintext cloud files.

---

## 2. Tech Stack & Key Commands

- **Backend**: Python 3 + Flask ([`app.py`](file:///app.py), port `5000`), SQLite ([`data/finance.db`](file:///data/finance.db)).
- **Frontend**: Zero-build React + Tailwind CDN + Chart.js + Lucide SPA ([`frontend/index.html`](file:///frontend/index.html), [`frontend/app.js`](file:///frontend/app.js), [`frontend/kitchen.js`](file:///frontend/kitchen.js)). No bundler required.
- **Start Server**:
  ```bash
  python app.py
  # Opens http://localhost:5000
  ```
- **Run Public Demo Tests** (isolated temporary DB + demo profile):
  ```bash
  pytest tests/ -v
  ```
- **Run Private Parity Tests** (local only, when `private/` is unpacked):
  ```bash
  pytest private/tests/test_private_parity.py -v
  ```

---

## 3. Codebase Structure & UI Conventions

- [`app.py`](file:///app.py): Flask entrypoint, gzip middleware, transaction/account/holdings/budget/rule/sync/reflections REST endpoints.
- [`backend/analytics/`](file:///backend/analytics/__init__.py):
  - `spending.py`: Cashflow, monthly spending explorer, partner housing-share offsets, extra mortgage principal deduplication.
  - `portfolio.py`: Net worth, liquid runway (checking + MMF), asset groups, investment concentration, 12-month attribution sub-curves.
  - `insights.py`: Ranked plain-English financial insights feed.
  - `recurring.py`: Subscription cadence, duplicate charge, and anomaly detection.
- [`backend/mortgage.py`](file:///backend/mortgage.py) & [`backend/mortgage_api.py`](file:///backend/mortgage_api.py): Amortization parity engine, IRS Pub 936 `$750k` loan cap tax math, recast modeling, and house vs. stock wealth comparison.
- [`backend/retirement.py`](file:///backend/retirement.py) & [`backend/retirement_api.py`](file:///backend/retirement_api.py): Federal paycheck/FICA calculator, RSU vesting pipeline, 401(k)/Mega Backdoor projection, RMD table, and Monte Carlo FIRE simulator.
- [`backend/nutrition.py`](file:///backend/nutrition.py) & [`backend/nutrition_api.py`](file:///backend/nutrition_api.py): Clinical biomarker tracking, macro calculator, meal prep matrix, and delivery vs. home kitchen ROI.
- **UI Conventions**:
  - Consolidated 4-workspace Bento layout (`Command Center`, `Cash Flow & Matrix`, `Investments & Property`, `Planning & Scenarios` + header toggle for `Fuel & Labs`).
  - Universal Right-Hand Context Inspector (`openInspector(type, param)` / `closeInspector()`).
  - Full Light / Dark theme parity using CSS variables (`--bg-card`, `--bg-elev`, `--text-main`, `--border-subtle`) and dynamic `chartColors()`.
  - JSX safety with Babel standalone: wrap literal `<` / `>` inside JSX text nodes (`{"< $450"}`) and bump `?v=` cache-busters in `frontend/index.html` after editing JS bundles.
