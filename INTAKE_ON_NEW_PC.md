# FinPulse — New Machine Intake & Restore Guide

Follow these steps to bring **FinPulse** online on a new computer by combining the **public GitHub code repository** with your **encrypted private financial vault** from Google Drive.

---

## 1. Clone the Application Code

```bash
git clone https://github.com/Obliviour/finpulse.git
cd finpulse
pip install -r requirements.txt
```

## 2. Download Your Encrypted Private Vault

From your Google Drive folder **`FinPulse-Private-Vault`**, download:

- `FinPulse_Private_Vault.enc` → place it in the root `finpulse/` folder (or pass its full path to `vault_manager.py`).

> **Security reminder:** Keep your vault passphrase strictly in your password manager (never save it inside the repository or alongside the encrypted file in Drive).

## 3. Decrypt & Unpack Private Data

Run the vault unpacker in the `finpulse/` folder and enter your passphrase when prompted:

```bash
python vault_manager.py open FinPulse_Private_Vault.enc
```

Verify everything unpacked cleanly:

```bash
python vault_manager.py status
```

This restores your gitignored local files:
- `data/finance.db` (SQLite ledger & snapshots)
- `private/profile.json` (household config, tax brackets, trips, labs, category rules)
- `private/AGENTS.private.md` & `private/tests/test_private_parity.py`
- `certs/` and statement folders under `imports/` (if previously sealed)

## 4. Verify Both Modes with Automated Tests

Run both the public demo suite and the private parity suite:

```bash
pytest tests/ -v
pytest private/tests/test_private_parity.py -v
```

Both suites should report **100% passing**.

## 5. Launch the Dashboard

```bash
python app.py
# Or double-click start_dashboard.bat on Windows
```

Open **http://localhost:5000** in your browser.

---

## 6. Using Antigravity on the New Computer

1. Open the `finpulse/` folder in **Antigravity IDE** — the root `AGENTS.md` workspace rule is loaded automatically.
2. Tell your Antigravity assistant:
   > *"Read `private/AGENTS.private.md` (it is gitignored locally) for my household context, confirm `pytest private/tests/test_private_parity.py -v` passes, and we're ready to continue."*
3. Whenever you add new statements or update data and want to sync back to Drive:
   ```bash
   python vault_manager.py seal
   ```
   Then upload the refreshed `FinPulse_Private_Vault.enc` to `FinPulse-Private-Vault` in Google Drive.
