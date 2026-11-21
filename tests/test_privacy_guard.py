"""Strict Privacy-Leak Guard & Regression Tests for FinPulse.

IMPORTANT: This file is committed to the public repository.
Never hardcode personal names, addresses, account numbers, spreadsheet URLs,
or private strings here. All private token checks load dynamically from the
local gitignored `private/profile.json` when present.
"""
import glob
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from app import app
from backend.analytics.common import Scope
from backend.analytics.portfolio import build_investments
from backend.db import get_connection
from backend.mortgage import run_mortgage_analysis
from backend.profile_loader import PRIVATE_PROFILE_PATH, clear_profile_cache
from backend.retirement import get_default_inputs, run_plan

REPO_ROOT = Path(__file__).resolve().parent.parent

BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp",
    ".pdf", ".zip", ".enc", ".db", ".sqlite", ".sqlite3",
    ".woff", ".woff2", ".ttf", ".eot", ".pyc", ".pyo",
}

SAFE_EMAIL_DOMAINS = {
    "example.com",
    "finpulse.demo",
    "test.local",
    "localhost",
    "users.noreply.github.com",
}

GENERIC_STOPWORDS = {
    "home", "house", "road", "lane", "drive", "street", "avenue", "court",
    "place", "way", "north", "south", "east", "west", "apt", "unit", "suite",
    "primary", "residence", "employer", "partner", "personal", "account",
    "bank", "card", "credit", "checking", "savings", "mortgage", "trust",
    "equity", "awards", "plan", "roth", "traditional", "brokerage",
}


def _find_git_exe():
    git_exe = shutil.which("git")
    if git_exe:
        return git_exe
    local_app = os.environ.get("LOCALAPPDATA", "")
    candidates = glob.glob(
        os.path.join(local_app, "Microsoft", "WinGet", "Packages", "Git.MinGit*", "cmd", "git.exe")
    )
    candidates.extend([
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
    ])
    for cand in candidates:
        if os.path.exists(cand):
            return cand
    return None


def _git_tracked_and_staged_files():
    git_exe = _find_git_exe()
    if not git_exe:
        pytest.skip("git executable not found in environment")
    tracked = subprocess.check_output(
        [git_exe, "ls-files"], cwd=str(REPO_ROOT), text=True
    ).splitlines()
    staged = subprocess.check_output(
        [git_exe, "diff", "--cached", "--name-only"], cwd=str(REPO_ROOT), text=True
    ).splitlines()
    seen = set()
    ordered = []
    for rel in tracked + staged:
        norm = rel.replace("\\", "/").strip()
        if norm and norm not in seen:
            seen.add(norm)
            ordered.append(norm)
    return ordered


def _iter_tracked_text_files():
    for rel in _git_tracked_and_staged_files():
        p = REPO_ROOT / rel
        if not p.is_file():
            continue
        if p.suffix.lower() in BINARY_EXTS:
            continue
        raw = p.read_bytes()
        if b"\x00" in raw:
            continue
        yield rel, raw.decode("utf-8", errors="ignore")


def _extract_private_tokens(profile_data):
    """Dynamically derive sensitive substrings from local private/profile.json."""
    text_tokens = set()
    id_tokens = set()
    mask_tokens = set()

    hh = profile_data.get("household") or {}
    for key in (
        "primary_name",
        "primary_full_name",
        "partner_name",
        "home_address",
        "home_address_short",
        "neighborhood",
        "city_state_zip",
    ):
        val = str(hh.get(key) or "").strip()
        if len(val) >= 4:
            text_tokens.add(val)

    full_name = str(hh.get("primary_full_name") or "").strip()
    for part in re.split(r"[\s,.-]+", full_name):
        if len(part) >= 4 and part.lower() not in GENERIC_STOPWORDS:
            text_tokens.add(part)

    addr_short = str(hh.get("home_address_short") or "").strip()
    for part in re.split(r"[\s,]+", addr_short):
        if len(part) >= 5 and part.lower() not in GENERIC_STOPWORDS:
            text_tokens.add(part)

    mort = profile_data.get("mortgage") or {}
    sp_meta = mort.get("spreadsheet_meta") or {}
    for v in sp_meta.values():
        s = str(v or "").strip()
        if len(s) >= 12 and ("http" in s or "/" in s or len(s) >= 20):
            text_tokens.add(s)

    for comp in mort.get("local_market_comps") or []:
        if isinstance(comp, dict):
            for k in ("address", "street", "label"):
                s = str(comp.get(k) or "").strip()
                if len(s) >= 10:
                    text_tokens.add(s)

    nut = profile_data.get("nutrition") or {}
    lab_url = str(nut.get("lab_folder_url") or "").strip()
    if len(lab_url) >= 12:
        text_tokens.add(lab_url)

    def _walk_aliases(obj, key_hint=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if key_hint in ("fidelity_accounts", "vanguard_accounts") and re.search(r"\d{5,}", str(k)):
                    id_tokens.add(str(k).strip())
                _walk_aliases(v, k)
        elif isinstance(obj, list):
            for v in obj:
                _walk_aliases(v, key_hint)
        elif isinstance(obj, str):
            s = obj.strip()
            if not s or "401(k)" in s.lower() or "401k" in s.lower():
                return
            if re.fullmatch(r"\d{4}", s):
                mask_tokens.add(s)
            elif re.search(r"\d{5,}", s) or (
                key_hint.endswith(("_token", "_id", "_mask", "_account_id")) and any(ch.isdigit() for ch in s)
            ):
                id_tokens.add(s)

    _walk_aliases(profile_data.get("pdf_account_aliases") or {})
    return sorted(text_tokens), sorted(id_tokens), sorted(mask_tokens)


def test_no_private_or_vault_files_tracked_in_git():
    """Block any private, vault, database, cert, or personal statement files from git."""
    violations = []
    for rel in _git_tracked_and_staged_files():
        low = rel.lower()
        name = Path(low).name
        if (
            low.startswith("private/")
            or low.startswith("certs/")
            or low.startswith("backup/")
            or low.startswith(".agents/context/")
            or name.startswith("restore_")
            or name == ".env"
            or name.startswith(".env.")
            or low.endswith((".db", ".sqlite", ".sqlite3", ".enc", ".zip", ".pem", ".key"))
            or (low.startswith("imports/") and not low.startswith("imports/samples/"))
        ):
            violations.append(rel)
    assert not violations, f"Forbidden private/vault files tracked or staged in git: {violations}"


def test_no_hardcoded_secrets_or_pii_patterns_in_tracked_files():
    """Scan all tracked text files for private keys, SSNs, live Drive/Sheet URLs, emails, and vault headers."""
    priv_key_re = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----")
    ssn_re = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
    gdrive_re = re.compile(
        r"https://(?:docs\.google\.com/spreadsheets/d|drive\.google\.com/drive/folders)/[A-Za-z0-9_-]{20,}"
    )
    email_re = re.compile(r"\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")
    vault_magic = "FPVLT" + "1"

    findings = []
    for rel, txt in _iter_tracked_text_files():
        if priv_key_re.search(txt):
            findings.append(f"{rel}: private key block detected")
        if ssn_re.search(txt):
            findings.append(f"{rel}: SSN-like pattern detected")
        if gdrive_re.search(txt):
            findings.append(f"{rel}: live Google Drive/Sheets ID URL detected")
        for m in email_re.finditer(txt):
            domain = m.group(1).lower()
            if domain not in SAFE_EMAIL_DOMAINS:
                findings.append(f"{rel}: non-placeholder email domain '{domain}'")
        if vault_magic in txt and rel not in {
            "vault_manager.py",
            "tests/test_vault.py",
            "tests/test_privacy_guard.py",
        }:
            findings.append(f"{rel}: vault magic header detected")

    assert not findings, "Privacy/secret pattern violations found:\n" + "\n".join(findings)


def test_no_private_profile_or_db_tokens_in_tracked_files():
    """Verify zero personal tokens from local private/profile.json appear in any tracked file."""
    if not os.path.exists(PRIVATE_PROFILE_PATH):
        pytest.skip("private/profile.json not mounted locally (CI environment)")

    with open(PRIVATE_PROFILE_PATH, "r", encoding="utf-8") as f:
        priv = json.load(f)

    text_tokens, id_tokens, mask_tokens = _extract_private_tokens(priv)
    assert text_tokens, "Expected non-empty private profile tokens when private/profile.json is present"

    leaks = []
    for rel, txt in _iter_tracked_text_files():
        txt_low = txt.lower()
        for tok in text_tokens:
            if tok.lower() in txt_low:
                leaks.append(f"{rel}: leaked private text token (len={len(tok)})")
        for tok in id_tokens:
            if tok in txt:
                leaks.append(f"{rel}: leaked account/id token (len={len(tok)})")
        for mask in mask_tokens:
            if re.search(rf"(?:\({re.escape(mask)}\)|\bx{re.escape(mask)}\b)", txt):
                leaks.append(f"{rel}: leaked masked account suffix")

    assert not leaks, "Private profile data leaked into git-tracked files:\n" + "\n".join(leaks)


def test_demo_mode_api_never_leaks_private_profile(monkeypatch):
    """Ensure Demo-mode REST endpoints never serialize private household fields."""
    monkeypatch.setenv("FINPULSE_PROFILE_MODE", "demo")
    clear_profile_cache()

    priv_tokens = []
    if os.path.exists(PRIVATE_PROFILE_PATH):
        with open(PRIVATE_PROFILE_PATH, "r", encoding="utf-8") as f:
            priv_tokens, id_tokens, _ = _extract_private_tokens(json.load(f))
            priv_tokens.extend(id_tokens)

    client = app.test_client()
    endpoints = (
        "/api/dashboard",
        "/api/mortgage",
        "/api/retirement",
        "/api/reflections",
        "/api/nutrition",
    )
    try:
        for ep in endpoints:
            resp = client.get(ep)
            assert resp.status_code == 200, f"{ep} failed in demo mode: {resp.status_code}"
            body = resp.get_data(as_text=True)
            if ep == "/api/dashboard":
                assert resp.get_json()["meta"]["profile_mode"] == "demo"
            body_low = body.lower()
            for tok in priv_tokens:
                assert tok.lower() not in body_low, f"Private token leaked in {ep} demo response"
    finally:
        clear_profile_cache()


def test_phase2_and_phase3_math_regressions(monkeypatch):
    """Regression checks for Real Estate purchase_price, Living Baseline fields, MC pairing, and zero-basis holdings."""
    monkeypatch.setenv("FINPULSE_PROFILE_MODE", "demo")
    clear_profile_cache()

    # 1. Real Estate equity_progress exposes purchase_price matching home_price
    mort = run_mortgage_analysis()
    assert mort["equity_progress"]["purchase_price"] == round(float(mort["inputs"]["home_price"]), 2)
    assert mort["equity_progress"]["purchase_price"] > 0

    # 2. Reflections spending_tiers exposes 12M avg housing & routine living fields
    client = app.test_client()
    refl = client.get("/api/reflections").get_json()
    tiers = refl["spending_tiers"]
    for key in ("housing_fixed_net_monthly", "housing_fixed_gross_monthly", "routine_living_monthly"):
        assert key in tiers
    assert abs(
        tiers["necessary_net_monthly"]
        - (tiers["housing_fixed_net_monthly"] + tiers["routine_living_monthly"])
    ) <= 0.02

    # 3. Paired Common Random Numbers: capped/no-op What-If lever produces exactly 0.0 delta
    inp, _ = get_default_inputs()
    inp["pretax_401k_pct"] = 25.0  # already above IRS $24,500 cap on demo salary
    plan = run_plan(inp, mc_runs=400, seed=42)
    save_more = next(lv for lv in plan["levers"] if lv["id"] == "save_more_2pct")
    assert save_more["success_delta_pts"] == 0.0
    assert save_more["nest_egg_real_delta"] == 0.0

    # 4. Zero-cost-basis holdings return None gain fields rather than bogus percentages
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO holdings (account_id, symbol, name, shares, cost_basis_total, current_price, current_value, day_change_pct, asset_class, last_updated, is_demo) "
            "VALUES (1, 'TESTNOBASIS', 'No Basis Test Equity', 10.0, 0.0, 100.0, 1000.0, 0.0, 'US Index / Core Equities', '2026-11-20', 1)"
        )
        conn.commit()
        inv = build_investments(conn, Scope(conn))
        row = next(h for h in inv["holdings"] if h["symbol"] == "TESTNOBASIS")
        assert row["gain_dollars"] is None
        assert row["gain_pct"] is None
    finally:
        conn.execute("DELETE FROM holdings WHERE symbol = 'TESTNOBASIS'")
        conn.commit()
        conn.close()
