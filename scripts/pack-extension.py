#!/usr/bin/env python3
"""Build deterministic Chamber Extension archives.

Normal development builds are written to dist/ and never touch the website.
Publishing requires both --release and --promote, making promotion explicit.
"""

import argparse
import hashlib
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path


FIXED_ZIP_TIME = (2026, 1, 1, 0, 0, 0)
EXCLUDED_FILES = {"hot-reload.js"}


def project_paths() -> tuple[Path, Path]:
    project_root = Path(__file__).resolve().parent.parent
    return project_root, project_root / "extension"


def manifest_version(extension_dir: Path) -> str:
    manifest = json.loads((extension_dir / "manifest.json").read_text(encoding="utf-8"))
    return str(manifest["version"])


def extension_files(extension_dir: Path) -> list[Path]:
    files = []
    for path in extension_dir.rglob("*"):
        relative = path.relative_to(extension_dir)
        if not path.is_file() or any(part.startswith(".") for part in relative.parts):
            continue
        if path.name in EXCLUDED_FILES:
            continue
        files.append(path)
    return sorted(files, key=lambda path: path.relative_to(extension_dir).as_posix())


def pack(output_zip: Path, extension_dir: Path) -> int:
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    files = extension_files(extension_dir)
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            relative = path.relative_to(extension_dir).as_posix()
            info = zipfile.ZipInfo(relative, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    return len(files)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Chamber Extension ZIP files safely.")
    parser.add_argument(
        "--release",
        metavar="VERSION",
        help="Build an immutable website release whose version matches manifest.json.",
    )
    parser.add_argument(
        "--promote",
        action="store_true",
        help="Update the website stable alias and releases/latest.json (requires --release).",
    )
    parser.add_argument("--output", type=Path, help="Custom development output path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    project_root, extension_dir = project_paths()
    version = manifest_version(extension_dir)

    if args.promote and not args.release:
        raise SystemExit("--promote requires --release VERSION")
    if args.release and args.output:
        raise SystemExit("Use either --release or --output, not both")
    if args.release and args.release != version:
        raise SystemExit(
            f"Release version {args.release} does not match extension/manifest.json {version}"
        )

    if args.release:
        output_zip = (
            project_root
            / "web-feed"
            / "public"
            / "releases"
            / f"chamber-extension-v{version}.zip"
        )
    elif args.output:
        output_zip = args.output.resolve()
    else:
        output_zip = project_root / "dist" / "chamber-extension-dev.zip"

    count = pack(output_zip, extension_dir)
    checksum = sha256(output_zip)
    print(f"Built {count} files: {output_zip}")
    print(f"SHA-256: {checksum}")

    if args.promote:
        public_dir = project_root / "web-feed" / "public"
        stable_alias = public_dir / "chamber-extension.zip"
        shutil.copyfile(output_zip, stable_alias)
        release_manifest = {
            "channel": "closed-alpha",
            "version": version,
            "filename": output_zip.name,
            "downloadPath": f"/echo/releases/{output_zip.name}",
            "sha256": checksum,
            "fileCount": count,
            "publishedAt": datetime.now(timezone.utc).isoformat(),
            "network": "Irys Devnet",
        }
        manifest_path = public_dir / "releases" / "latest.json"
        manifest_path.write_text(
            json.dumps(release_manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Promoted stable alias: {stable_alias}")
        print(f"Updated release manifest: {manifest_path}")


if __name__ == "__main__":
    main()
