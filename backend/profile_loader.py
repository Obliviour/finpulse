"""Runtime loader for FinPulse household & private configuration overrides.

Behavior:
- When `FINPULSE_PROFILE_MODE=demo`, always loads `backend/demo_profile.json`.
- Otherwise, loads `private/profile.json` if present (local encrypted/private vault),
  falling back cleanly to `backend/demo_profile.json` for public GitHub clones.
"""
import copy
import json
import os

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEMO_PROFILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo_profile.json")
PRIVATE_PROFILE_PATH = os.path.join(_BASE_DIR, "private", "profile.json")

_CACHE = {
    "key": None,
    "data": None,
}


def _active_path_and_mode():
    env_mode = (os.environ.get("FINPULSE_PROFILE_MODE") or "").strip().lower()
    if env_mode == "demo":
        return DEMO_PROFILE_PATH, "demo"
    if os.path.exists(PRIVATE_PROFILE_PATH):
        return PRIVATE_PROFILE_PATH, "private"
    return DEMO_PROFILE_PATH, "demo"


def get_profile(fresh_copy=False):
    path, mode = _active_path_and_mode()
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = 0.0
    key = (path, mode, mtime)
    if _CACHE["key"] != key or _CACHE["data"] is None:
        with open(path, "r", encoding="utf-8") as f:
            _CACHE["data"] = json.load(f)
        _CACHE["key"] = key
    return copy.deepcopy(_CACHE["data"]) if fresh_copy else _CACHE["data"]


def clear_profile_cache():
    _CACHE["key"] = None
    _CACHE["data"] = None


def is_private_profile_loaded():
    _, mode = _active_path_and_mode()
    return mode == "private"


def get_household_profile():
    return get_profile().get("household", {})


def get_partner_offset_config():
    return get_household_profile().get("partner_offset", {})


def get_portfolio_profile():
    return get_household_profile().get("portfolio", {})


def get_mortgage_profile():
    return get_profile().get("mortgage", {})


def get_retirement_profile():
    return get_profile().get("retirement", {})


def get_reflections_profile():
    return get_profile().get("reflections", {})


def get_nutrition_profile():
    return get_profile().get("nutrition", {})


def get_rehab_profile():
    return get_profile().get("rehab", {})


def get_pdf_account_aliases():
    return get_profile().get("pdf_account_aliases", {})


def get_extra_category_rules():
    return get_profile().get("extra_category_rules", [])
