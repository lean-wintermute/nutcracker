#!/usr/bin/env python3
"""
Rebalance Nutcracker corpus by removing style duplicates in crowded scenes
and preparing for new varied scene generation.

Strategy:
1. Identify crowded scenes (3+ animals with 5 styles each)
2. Keep 2 most distinctive styles per animal per scene
3. Remove remaining duplicates (~32 images)
4. Generate prompts for new varied scenes

Style distinctiveness ranking (most to least distinctive):
1. handdrawn - Most visually distinct (2D composited)
2. claymation - Unique tactile quality
3. stopmotion - Wes Anderson aesthetic
4. puppet - Jim Henson warmth
5. cgi - Most generic (photorealistic)

For scenes with 3 animals, keep handdrawn + claymation (most contrast).
For scenes with 2 animals, no pruning needed.
"""

import json
import shutil
from collections import defaultdict
from pathlib import Path


def analyze_corpus(catalog_path: Path) -> dict:
    """Analyze corpus for scene/style patterns."""
    with open(catalog_path) as f:
        catalog = json.load(f)

    # Parse animal_style_scene pattern
    scenes = defaultdict(list)
    scene_animals = defaultdict(set)

    for img in catalog["images"]:
        fn = img["filename"]
        cat = img.get("category", "unknown")

        # Parse pattern: animal_style_scene.png
        if "_" in fn and cat in ("bear", "lion", "hippo", "panda", "whale"):
            parts = fn.replace(".png", "").split("_")
            if len(parts) >= 3 and parts[0] == cat:
                style = parts[1]
                scene = "_".join(parts[2:])
                scenes[scene].append({
                    "filename": fn,
                    "animal": cat,
                    "style": style,
                    "scene": scene,
                })
                scene_animals[scene].add(cat)

    return {
        "scenes": dict(scenes),
        "scene_animals": {k: list(v) for k, v in scene_animals.items()},
        "catalog": catalog,
    }


def select_removals(analysis: dict) -> list[str]:
    """Select images to remove based on style distinctiveness."""
    # Style priority (higher = keep)
    style_priority = {
        "handdrawn": 5,  # Most distinctive
        "claymation": 4,
        "stopmotion": 3,
        "puppet": 2,
        "cgi": 1,  # Most generic
    }

    removals = []

    # Process crowded scenes (3+ animals)
    for scene, images in analysis["scenes"].items():
        animals = analysis["scene_animals"].get(scene, [])

        if len(animals) >= 3:
            # Group by animal
            by_animal = defaultdict(list)
            for img in images:
                by_animal[img["animal"]].append(img)

            # For each animal, keep top 2 styles
            for animal, animal_imgs in by_animal.items():
                # Sort by style priority (highest first)
                sorted_imgs = sorted(
                    animal_imgs,
                    key=lambda x: style_priority.get(x["style"], 0),
                    reverse=True,
                )

                # Keep top 2, mark rest for removal
                for img in sorted_imgs[2:]:
                    removals.append(img["filename"])

    return removals


def execute_removals(
    repo_root: Path, removals: list[str], dry_run: bool = True
) -> dict:
    """Move removed images to archive folder."""
    images_dir = repo_root / "images"
    archive_dir = repo_root / "archive" / "style_duplicates"

    if not dry_run:
        archive_dir.mkdir(parents=True, exist_ok=True)

    moved = []
    errors = []

    for fn in removals:
        src = images_dir / fn
        dst = archive_dir / fn

        if src.exists():
            if dry_run:
                moved.append(fn)
            else:
                try:
                    shutil.move(str(src), str(dst))
                    moved.append(fn)
                except Exception as e:
                    errors.append({"filename": fn, "error": str(e)})
        else:
            errors.append({"filename": fn, "error": "File not found"})

    return {"moved": moved, "errors": errors}


def update_catalog(catalog_path: Path, removals: list[str]) -> int:
    """Remove entries from catalog."""
    with open(catalog_path) as f:
        catalog = json.load(f)

    original_count = len(catalog["images"])
    catalog["images"] = [
        img for img in catalog["images"] if img["filename"] not in removals
    ]
    new_count = len(catalog["images"])

    with open(catalog_path, "w") as f:
        json.dump(catalog, f, indent=2)

    return original_count - new_count


def main():
    import sys

    repo_root = Path(__file__).parent.parent
    catalog_path = repo_root / "image-catalog.json"

    dry_run = "--execute" not in sys.argv

    print("=" * 60)
    print("NUTCRACKER CORPUS REBALANCE")
    print("=" * 60)

    # Analyze
    print("\n1. Analyzing corpus...")
    analysis = analyze_corpus(catalog_path)

    # Find crowded scenes
    crowded = {
        scene: animals
        for scene, animals in analysis["scene_animals"].items()
        if len(animals) >= 3
    }
    print(f"   Found {len(crowded)} crowded scenes (3+ animals):")
    for scene, animals in crowded.items():
        print(f"     - {scene}: {', '.join(animals)}")

    # Select removals
    print("\n2. Selecting images to remove...")
    removals = select_removals(analysis)
    print(f"   Selected {len(removals)} images for removal:")

    # Group by scene for display
    by_scene = defaultdict(list)
    for fn in removals:
        parts = fn.replace(".png", "").split("_")
        if len(parts) >= 3:
            scene = "_".join(parts[2:])
            by_scene[scene].append(fn)

    for scene, files in sorted(by_scene.items()):
        print(f"\n   {scene}:")
        for fn in sorted(files):
            print(f"     - {fn}")

    if dry_run:
        print("\n" + "=" * 60)
        print("DRY RUN - No changes made")
        print("Run with --execute to perform removal")
        print("=" * 60)
        return 0

    # Execute
    print("\n3. Moving images to archive...")
    result = execute_removals(repo_root, removals, dry_run=False)
    print(f"   Moved {len(result['moved'])} files")
    if result["errors"]:
        print(f"   Errors: {len(result['errors'])}")
        for err in result["errors"]:
            print(f"     - {err['filename']}: {err['error']}")

    # Update catalog
    print("\n4. Updating catalog...")
    removed_count = update_catalog(catalog_path, removals)
    print(f"   Removed {removed_count} entries from catalog")

    print("\n" + "=" * 60)
    print("COMPLETE")
    print("=" * 60)
    print(f"Run 'python scripts/sync-catalog.py' to verify")

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
