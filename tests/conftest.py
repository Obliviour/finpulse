import os
import tempfile
import shutil

# Force Demo Mode and an isolated temporary SQLite database BEFORE any backend/app imports
_TEST_TMP_DIR = tempfile.mkdtemp(prefix="finpulse_pytest_")
_TEST_DB_PATH = os.path.join(_TEST_TMP_DIR, "test_finance.db")
os.environ["FINPULSE_PROFILE_MODE"] = "demo"
os.environ["FINPULSE_DB_PATH"] = _TEST_DB_PATH

import pytest  # noqa: E402
import backend.db as db  # noqa: E402
from backend.profile_loader import clear_profile_cache  # noqa: E402
from backend.seed_demo import seed_demo_data_if_empty  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def demo_test_db():
    """Initialize an isolated Demo-mode database for the public pytest suite."""
    db.DB_PATH = _TEST_DB_PATH
    clear_profile_cache()
    db.init_db()
    seed_demo_data_if_empty(force=True)
    db.bump_db_stamp()
    yield _TEST_DB_PATH
    clear_profile_cache()
    shutil.rmtree(_TEST_TMP_DIR, ignore_errors=True)
