from pathlib import Path
import pytest
import vault_manager


def test_vault_seal_and_open_roundtrip(tmpdir, monkeypatch):
    """Verify AES/Fernet vault sealing, dry-run inspection, wrong passphrase rejection, and restore."""
    base = Path(str(tmpdir))
    src_root = base / "src_repo"
    (src_root / "private").mkdir(parents=True)
    (src_root / "data").mkdir(parents=True)
    (src_root / "imports" / "samples").mkdir(parents=True)

    (src_root / "private" / "profile.json").write_text('{"mode": "private"}', encoding="utf-8")
    (src_root / "data" / "finance.db").write_bytes(b"SQLite format 3\x00dummy")
    (src_root / "imports" / "statement.csv").write_text("Date,Amount\n2026-10-01,10.00\n", encoding="utf-8")
    # Public sample file under imports/samples must NOT be swept into the private vault
    (src_root / "imports" / "samples" / "sample.csv").write_text("demo", encoding="utf-8")

    monkeypatch.setattr(vault_manager, "ROOT_DIR", src_root)
    enc_path = base / "FinPulse_Test_Vault.enc"

    vault_manager.seal_vault(out_path=enc_path, passphrase="correct-horse-battery")
    assert enc_path.exists()

    # Wrong passphrase must raise ValueError
    with pytest.raises(ValueError):
        vault_manager.open_vault(in_path=enc_path, passphrase="wrong-password", dry_run=True)

    # Dry-run should report exactly 3 private files (excluding imports/samples/)
    count = vault_manager.open_vault(in_path=enc_path, passphrase="correct-horse-battery", dry_run=True)
    assert count == 3

    # Restore into a fresh clone directory
    dst_root = base / "dst_repo"
    dst_root.mkdir()
    monkeypatch.setattr(vault_manager, "ROOT_DIR", dst_root)
    restored = vault_manager.open_vault(in_path=enc_path, passphrase="correct-horse-battery", dry_run=False)
    assert restored == 3
    assert (dst_root / "private" / "profile.json").read_text(encoding="utf-8") == '{"mode": "private"}'
    assert (dst_root / "data" / "finance.db").read_bytes() == b"SQLite format 3\x00dummy"
    assert not (dst_root / "imports" / "samples" / "sample.csv").exists()
