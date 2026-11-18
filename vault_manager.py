"""Encrypted Personal Financial Vault Manager for FinPulse.

Packages all private user data (`private/`, `data/*.db`, `certs/`, personal
statements under `imports/` excluding `imports/samples/`, and `.agents/context/`)
into a single AES-encrypted, HMAC-authenticated `.enc` file using PBKDF2-HMAC-SHA256
key derivation (`cryptography` Fernet + 200,000 iterations).

Nothing personal ever needs to be committed to GitHub. Keep `FinPulse_Private_Vault.enc`
inside your private Google Drive (`FinPulse-Private-Vault/`) alongside `INTAKE_ON_NEW_PC.md`.
"""
import argparse
import base64
import getpass
import io
import os
import struct
import zipfile
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT_DIR = Path(__file__).resolve().parent
MAGIC = b"FPVLT1"
SALT_LEN = 16
KDF_ITERATIONS = 200000
DEFAULT_VAULT_FILE = ROOT_DIR.parent / "FinPulse_Private_Vault.enc"

# Directories / files sealed in the private vault (none of these belong in public GitHub)
VAULT_INCLUDE_DIRS = ("private", "certs", ".agents")


def _derive_fernet_key(passphrase, salt):
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=KDF_ITERATIONS,
        backend=default_backend(),
    )
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8")))


def _read_passphrase(confirm=False):
    env_pw = os.environ.get("FINPULSE_VAULT_KEY", "").strip()
    if env_pw:
        return env_pw
    pw = getpass.getpass("Enter FinPulse Vault passphrase: ")
    if not pw:
        raise ValueError("Vault passphrase cannot be empty.")
    if confirm:
        pw2 = getpass.getpass("Confirm Vault passphrase: ")
        if pw != pw2:
            raise ValueError("Passphrases did not match.")
    return pw


def _collect_vault_files():
    items = []
    # 1. Explicit private directories
    for dname in VAULT_INCLUDE_DIRS:
        dpath = ROOT_DIR / dname
        if dpath.exists():
            for root, dirs, files in os.walk(dpath):
                dirs[:] = [d for d in dirs if d not in ("__pycache__", ".pytest_cache")]
                for fn in files:
                    if fn.endswith((".pyc", ".pyo")):
                        continue
                    fp = Path(root) / fn
                    items.append((fp, fp.relative_to(ROOT_DIR).as_posix()))

    # 2. Local SQLite databases (`data/*.db`)
    data_dir = ROOT_DIR / "data"
    if data_dir.exists():
        for fp in data_dir.glob("*.db"):
            items.append((fp, fp.relative_to(ROOT_DIR).as_posix()))

    # 3. Personal statements (`imports/` excluding synthetic `imports/samples/`)
    imports_dir = ROOT_DIR / "imports"
    if imports_dir.exists():
        for root, dirs, files in os.walk(imports_dir):
            dirs[:] = [d for d in dirs if d != "samples"]
            for fn in files:
                fp = Path(root) / fn
                rel = fp.relative_to(ROOT_DIR).as_posix()
                if rel.startswith("imports/samples/"):
                    continue
                items.append((fp, rel))

    # 4. Local .env if present
    env_file = ROOT_DIR / ".env"
    if env_file.exists():
        items.append((env_file, ".env"))

    return items


def seal_vault(out_path=None, passphrase=None):
    target = Path(out_path) if out_path else DEFAULT_VAULT_FILE
    pw = passphrase or _read_passphrase(confirm=True)
    files = _collect_vault_files()
    if not files:
        raise RuntimeError("No private files found to seal (expected private/, data/*.db, or imports/).")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fp, rel in files:
            zf.write(fp, rel)
    zip_bytes = buf.getvalue()

    salt = os.urandom(SALT_LEN)
    token = Fernet(_derive_fernet_key(pw, salt)).encrypt(zip_bytes)

    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "wb") as f:
        f.write(MAGIC)
        f.write(struct.pack(">I", KDF_ITERATIONS))
        f.write(salt)
        f.write(token)

    mb = len(token) / (1024.0 * 1024.0)
    print("Sealed {0} private files into {1} ({2:.2f} MB encrypted)".format(len(files), target, mb))
    return target


def open_vault(in_path=None, passphrase=None, dry_run=False):
    src = Path(in_path) if in_path else DEFAULT_VAULT_FILE
    if not src.exists():
        raise FileNotFoundError("Encrypted vault not found: {0}".format(src))
    pw = passphrase or _read_passphrase(confirm=False)

    with open(src, "rb") as f:
        header = f.read(len(MAGIC))
        if header != MAGIC:
            raise ValueError("Invalid vault header in {0}".format(src))
        iters = struct.unpack(">I", f.read(4))[0]
        salt = f.read(SALT_LEN)
        token = f.read()

    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iters,
        backend=default_backend(),
    )
    key = base64.urlsafe_b64encode(kdf.derive(pw.encode("utf-8")))
    try:
        zip_bytes = Fernet(key).decrypt(token)
    except InvalidToken:
        raise ValueError("Incorrect vault passphrase or corrupted archive.")

    restored = 0
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            rel = info.filename.replace("\\", "/")
            # Path traversal safety guard
            dest = (ROOT_DIR / rel).resolve()
            if not str(dest).startswith(str(ROOT_DIR.resolve())):
                raise ValueError("Refusing unsafe path inside vault: {0}".format(rel))
            if dry_run:
                restored += 1
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "wb") as out_f:
                out_f.write(zf.read(info.filename))
            restored += 1

    action = "Verified" if dry_run else "Unpacked"
    print("{0} {1} private files into {2}".format(action, restored, ROOT_DIR))
    return restored


def show_status():
    p_json = ROOT_DIR / "private" / "profile.json"
    p_agent = ROOT_DIR / "private" / "AGENTS.private.md"
    db_path = ROOT_DIR / "data" / "finance.db"
    files = _collect_vault_files()
    print("FinPulse Vault Status ({0}):".format(ROOT_DIR))
    print("  private/profile.json    :", "PRESENT" if p_json.exists() else "MISSING (running in Demo Mode)")
    print("  private/AGENTS.private  :", "PRESENT" if p_agent.exists() else "MISSING")
    print("  data/finance.db         :", "PRESENT ({0:.1f} KB)".format(db_path.stat().st_size / 1024.0) if db_path.exists() else "MISSING")
    print("  Collectable vault files :", len(files))


def main():
    parser = argparse.ArgumentParser(description="FinPulse AES-Encrypted Private Vault CLI")
    sub = parser.add_subparsers(dest="cmd")

    p_seal = sub.add_parser("seal", help="Encrypt private/ and data/finance.db into a .enc vault")
    p_seal.add_argument("--out", default=str(DEFAULT_VAULT_FILE), help="Output .enc path (default: parent dir)")

    p_open = sub.add_parser("open", help="Decrypt .enc vault into local gitignored private/ and data/")
    p_open.add_argument("--in", dest="in_path", default=str(DEFAULT_VAULT_FILE), help="Input .enc path")
    p_open.add_argument("--dry-run", action="store_true", help="Verify passphrase and file count without overwriting")

    sub.add_parser("status", help="Show local private override status")

    args = parser.parse_args()
    if args.cmd == "seal":
        seal_vault(out_path=args.out)
    elif args.cmd == "open":
        open_vault(in_path=args.in_path, dry_run=args.dry_run)
    else:
        show_status()


if __name__ == "__main__":
    main()
