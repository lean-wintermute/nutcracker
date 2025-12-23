#!/usr/bin/env python3
"""Sync image descriptions from catalog to image-descriptions.json.

This script reads image-catalog.json (the source of truth) and backfills
any missing descriptions in image-descriptions.json, while also removing
orphaned entries that don't exist in the catalog.
"""

import json
from pathlib import Path


def main() -> None:
    """Sync descriptions from catalog to descriptions file."""
    base_dir = Path(__file__).parent.parent
    catalog_path = base_dir / "image-catalog.json"
    descriptions_path = base_dir / "image-descriptions.json"

    # Read catalog
    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    # Read existing descriptions
    with open(descriptions_path, "r", encoding="utf-8") as f:
        descriptions = json.load(f)

    # Build set of catalog filenames
    catalog_filenames = {img["filename"] for img in catalog["images"]}

    # Track changes
    added = []
    removed = []
    empty_in_catalog = []

    # Find orphaned descriptions (in descriptions but not in catalog)
    for filename in list(descriptions.keys()):
        if filename not in catalog_filenames:
            removed.append(filename)
            del descriptions[filename]

    # Find missing descriptions (in catalog but not in descriptions)
    for img in catalog["images"]:
        filename = img["filename"]
        if filename not in descriptions:
            description = img.get("description", "")
            if description:
                descriptions[filename] = description
                added.append(filename)
            else:
                empty_in_catalog.append(filename)

    # Sort descriptions by filename for consistent output
    sorted_descriptions = dict(sorted(descriptions.items()))

    # Write updated descriptions
    with open(descriptions_path, "w", encoding="utf-8") as f:
        json.dump(sorted_descriptions, f, indent=2)
        f.write("\n")

    # Print summary
    print("=" * 60)
    print("SYNC DESCRIPTIONS SUMMARY")
    print("=" * 60)
    print(f"\nCatalog images: {len(catalog['images'])}")
    print(f"Previous descriptions: {len(descriptions) - len(added) + len(removed)}")
    print(f"Final descriptions: {len(sorted_descriptions)}")
    print()
    print(f"Added: {len(added)}")
    print(f"Removed (orphaned): {len(removed)}")
    print(f"Skipped (empty in catalog): {len(empty_in_catalog)}")

    if added:
        print("\n--- ADDED ---")
        for filename in sorted(added)[:20]:
            print(f"  + {filename}")
        if len(added) > 20:
            print(f"  ... and {len(added) - 20} more")

    if removed:
        print("\n--- REMOVED (orphaned) ---")
        for filename in sorted(removed):
            print(f"  - {filename}")

    if empty_in_catalog:
        print("\n--- SKIPPED (empty description in catalog) ---")
        for filename in sorted(empty_in_catalog):
            print(f"  ? {filename}")

    print()
    print("=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    main()
