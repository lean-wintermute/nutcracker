#!/usr/bin/env python3
"""
Sync image-catalog.json with actual images folder.

This script ensures the catalog stays in sync with the images directory.
Run before committing to catch any mismatches.

Usage:
    python scripts/sync-catalog.py [--fix]

Options:
    --fix    Automatically add missing entries and remove orphaned ones
"""

import json
import sys
from pathlib import Path


def get_display_name(filename: str) -> str:
    """Generate a display name from filename."""
    name = filename.replace('.png', '')

    # Handle animal_style_scene pattern
    parts = name.split('_')
    if len(parts) >= 3 and parts[0] in ('bear', 'lion', 'hippo', 'panda', 'whale'):
        animal = parts[0].title()
        style = parts[1].title()
        scene = ' '.join(parts[2:]).replace('_', ' ').title()
        return f"{animal} {scene}"

    # Handle numbered series (01_scene_name)
    if parts[0].isdigit():
        return ' '.join(parts[1:]).replace('_', ' ').title()

    # Default: clean up underscores and date suffix
    return name.replace('_', ' ').replace('082316', '').strip().title()


def get_category(filename: str) -> str:
    """Determine category from filename."""
    name = filename.replace('.png', '')
    parts = name.split('_')

    # Animal categories
    if parts[0] in ('bear', 'lion', 'hippo', 'panda', 'whale'):
        return parts[0]

    # Numbered series are whale vignettes
    if parts[0].isdigit():
        return 'whale'

    # Legacy categories
    if parts[0] in ('alive', 'animated', 'living', 'realistic', 'solitude', 'styles', 'teddy'):
        return parts[0] if parts[0] != 'teddy' else 'teddy'

    return 'unknown'


def sync_catalog(fix: bool = False) -> int:
    """Sync catalog with images folder. Returns exit code."""
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent

    images_dir = repo_root / "images"
    catalog_path = repo_root / "image-catalog.json"

    # Get actual image files
    actual_files = {f.name for f in images_dir.glob("*.png")}

    # Load catalog
    with open(catalog_path) as f:
        catalog = json.load(f)

    catalog_files = {img["filename"] for img in catalog["images"]}

    # Find mismatches
    missing_from_catalog = actual_files - catalog_files
    orphaned_in_catalog = catalog_files - actual_files

    has_issues = bool(missing_from_catalog or orphaned_in_catalog)

    if missing_from_catalog:
        print(f"\n{'='*50}")
        print(f"FILES MISSING FROM CATALOG ({len(missing_from_catalog)}):")
        print(f"{'='*50}")
        for f in sorted(missing_from_catalog):
            print(f"  + {f}")

        if fix:
            for f in sorted(missing_from_catalog):
                catalog["images"].append({
                    "filename": f,
                    "displayName": get_display_name(f),
                    "description": "",
                    "category": get_category(f)
                })
            print(f"\n  -> Added {len(missing_from_catalog)} entries to catalog")

    if orphaned_in_catalog:
        print(f"\n{'='*50}")
        print(f"ORPHANED CATALOG ENTRIES ({len(orphaned_in_catalog)}):")
        print(f"{'='*50}")
        for f in sorted(orphaned_in_catalog):
            print(f"  - {f}")

        if fix:
            catalog["images"] = [
                img for img in catalog["images"]
                if img["filename"] not in orphaned_in_catalog
            ]
            print(f"\n  -> Removed {len(orphaned_in_catalog)} orphaned entries")

    if fix and has_issues:
        # Sort by filename for consistency
        catalog["images"].sort(key=lambda x: x["filename"])

        with open(catalog_path, "w") as f:
            json.dump(catalog, f, indent=2)
        print(f"\n✓ Catalog updated: {len(catalog['images'])} images")

    if not has_issues:
        print(f"✓ Catalog in sync: {len(catalog['images'])} images match {len(actual_files)} files")
        return 0
    elif fix:
        return 0
    else:
        print(f"\n⚠️  Run with --fix to auto-correct")
        return 1


if __name__ == "__main__":
    fix_mode = "--fix" in sys.argv
    sys.exit(sync_catalog(fix=fix_mode))
