#!/usr/bin/env python3
"""Consolidate Nutcracker images to ~240 total with variety."""

import json
import shutil
from pathlib import Path

# Paths
REPO_IMAGES = Path("tools/support/Nutcracker/images")
BATCH_DIR = Path("output/2025.12.22/nano_bananas/nutcracker_full_batch")
REMOVED_DIR = Path("output/2025.12.22/nano_bananas/nutcracker_removed")
CATALOG_PATH = Path("tools/support/Nutcracker/image-catalog.json")

# Scene ownership: each scene assigned to 2-3 animals for variety
SCENE_OWNERSHIP = {
    "bookshop": ["panda", "lion"],
    "bus_stop": ["hippo", "whale"],
    "cafe_window": ["panda", "bear", "lion"],
    "diner_booth": ["hippo", "panda"],
    "hotel_lobby": ["whale", "lion"],
    "laundromat": ["hippo", "whale"],
    "park_bench": ["panda", "lion", "bear"],
    "phone_booth": ["whale", "hippo"],
    "rooftop_dawn": ["lion", "bear"],
    "street_corner": ["lion", "whale"],
    "subway_car": ["whale", "hippo", "panda"],
    "train_platform": ["bear", "panda", "lion"],
}

# All 5 styles
STYLES = ["cgi", "claymation", "handdrawn", "puppet", "stopmotion"]

# Repo images to KEEP (from the 128)
REPO_KEEP_PATTERNS = [
    # All whale vignettes (33) - unique content
    "01_", "02_", "03_", "04_", "05_", "06_",
    # All styles showcase (21)
    "styles_",
    # Melancholy - keep best 20 of 32 (5 per location)
    "teddy_melancholy_01_alone_in_house_01",
    "teddy_melancholy_01_alone_in_house_03",
    "teddy_melancholy_01_alone_in_house_05",
    "teddy_melancholy_01_alone_in_house_07",
    "teddy_melancholy_01_alone_in_house_08",
    "teddy_melancholy_02_bar_christmas_01",
    "teddy_melancholy_02_bar_christmas_02",
    "teddy_melancholy_02_bar_christmas_04",
    "teddy_melancholy_02_bar_christmas_07",
    "teddy_melancholy_02_bar_christmas_08",
    "teddy_melancholy_03_riding_bus_01",
    "teddy_melancholy_03_riding_bus_03",
    "teddy_melancholy_03_riding_bus_05",
    "teddy_melancholy_03_riding_bus_07",
    "teddy_melancholy_03_riding_bus_08",
    "teddy_melancholy_04_office_alone_01",
    "teddy_melancholy_04_office_alone_03",
    "teddy_melancholy_04_office_alone_05",
    "teddy_melancholy_04_office_alone_07",
    "teddy_melancholy_04_office_alone_08",
    # Living - keep 12 of 17 (best per category)
    "living_01_tiny_hiding_01",
    "living_01_tiny_hiding_03",
    "living_02_child_wandering_01",
    "living_02_child_wandering_02",
    "living_02_child_wandering_04",
    "living_03_human_confronting_01",
    "living_03_human_confronting_03",
    "living_03_human_confronting_05",
    "living_04_giant_gentle_01",
    "living_04_giant_gentle_02",
    "living_04_giant_gentle_03",
    "living_04_giant_gentle_04",
    # All solitude (7)
    "solitude_",
    # Keep 4 alive
    "alive_01_invisible_among_crowd_01",
    "alive_02_awkward_interactions_01",
    "alive_03_one_kind_soul_01",
    "alive_04_complete_solitude_01",
    # Keep 2 animated
    "animated_01_invisible_crowd_01",
    "animated_04_total_solitude_01",
    # Keep 3 realistic
    "realistic_01_tiny_unnoticed_01",
    "realistic_03_human_scale_01",
    "realistic_04_giant_looming_01",
]


def should_keep_repo_image(filename: str) -> bool:
    """Check if a repo image should be kept."""
    for pattern in REPO_KEEP_PATTERNS:
        if filename.startswith(pattern):
            return True
    return False


def get_batch_images_to_add() -> list[str]:
    """Get list of batch images to add based on scene ownership."""
    images = []
    for scene, animals in SCENE_OWNERSHIP.items():
        for animal in animals:
            for style in STYLES:
                filename = f"{animal}_{style}_{scene}.png"
                images.append(filename)
    return images


def analyze():
    """Analyze current state and plan changes."""
    # Get current repo images
    repo_images = list(REPO_IMAGES.glob("*.png"))
    repo_filenames = {img.name for img in repo_images}

    # Determine which to keep
    keep_from_repo = []
    remove_from_repo = []
    for img in repo_images:
        if should_keep_repo_image(img.name):
            keep_from_repo.append(img.name)
        else:
            remove_from_repo.append(img.name)

    # Get batch images to add
    batch_to_add = get_batch_images_to_add()

    # Check which batch images exist
    batch_available = []
    batch_missing = []
    for filename in batch_to_add:
        if (BATCH_DIR / filename).exists():
            batch_available.append(filename)
        else:
            batch_missing.append(filename)

    print("=== CONSOLIDATION PLAN ===\n")
    print(f"Current repo images: {len(repo_images)}")
    print(f"  Keep: {len(keep_from_repo)}")
    print(f"  Remove: {len(remove_from_repo)}")
    print(f"\nBatch images to add: {len(batch_to_add)}")
    print(f"  Available: {len(batch_available)}")
    print(f"  Missing: {len(batch_missing)}")
    print(f"\nFinal total: {len(keep_from_repo) + len(batch_available)}")

    if batch_missing:
        print(f"\n⚠️  Missing batch images:")
        for f in batch_missing[:10]:
            print(f"  - {f}")
        if len(batch_missing) > 10:
            print(f"  ... and {len(batch_missing) - 10} more")

    print("\n=== IMAGES TO REMOVE FROM REPO ===")
    for f in sorted(remove_from_repo):
        print(f"  - {f}")

    return {
        "keep_from_repo": keep_from_repo,
        "remove_from_repo": remove_from_repo,
        "batch_to_add": batch_available,
        "batch_missing": batch_missing,
    }


def execute(plan: dict, dry_run: bool = True):
    """Execute the consolidation plan."""
    if dry_run:
        print("\n=== DRY RUN (no changes made) ===\n")
    else:
        print("\n=== EXECUTING CONSOLIDATION ===\n")
        REMOVED_DIR.mkdir(parents=True, exist_ok=True)

    # Move removed repo images
    for filename in plan["remove_from_repo"]:
        src = REPO_IMAGES / filename
        dst = REMOVED_DIR / f"repo_{filename}"
        if dry_run:
            print(f"Would move: {src} -> {dst}")
        else:
            shutil.move(str(src), str(dst))
            print(f"Moved: {src} -> {dst}")

    # Copy batch images to repo
    for filename in plan["batch_to_add"]:
        src = BATCH_DIR / filename
        dst = REPO_IMAGES / filename
        if dst.exists():
            if dry_run:
                print(f"Would skip (exists): {filename}")
            continue
        if dry_run:
            print(f"Would copy: {src} -> {dst}")
        else:
            shutil.copy2(str(src), str(dst))
            print(f"Copied: {src} -> {dst}")

    # Final count
    if not dry_run:
        final_count = len(list(REPO_IMAGES.glob("*.png")))
        print(f"\n✓ Final image count: {final_count}")


def update_catalog(plan: dict, dry_run: bool = True):
    """Update the image catalog JSON."""
    with open(CATALOG_PATH) as f:
        catalog = json.load(f)

    # Remove entries for removed images
    removed_set = set(plan["remove_from_repo"])
    catalog["images"] = [
        img for img in catalog["images"]
        if img["filename"] not in removed_set
    ]

    # Add entries for new batch images
    existing_filenames = {img["filename"] for img in catalog["images"]}

    for filename in plan["batch_to_add"]:
        if filename in existing_filenames:
            continue

        # Parse filename: animal_style_scene.png
        parts = filename.replace(".png", "").split("_")
        animal = parts[0]
        style = parts[1]
        scene = "_".join(parts[2:])

        display_name = f"{animal.title()} {scene.replace('_', ' ').title()}"
        description = f"{style.title()} {animal} at {scene.replace('_', ' ')}"

        catalog["images"].append({
            "filename": filename,
            "displayName": display_name,
            "description": description,
            "category": animal,
            "series": style,
        })

    # Add new categories
    catalog["categories"]["lion"] = "Lion in human world"
    catalog["categories"]["hippo"] = "Hippo in human world"
    catalog["categories"]["panda"] = "Panda in human world"
    catalog["categories"]["bear"] = "Bear in human world"

    if dry_run:
        print(f"\nWould update catalog with {len(catalog['images'])} images")
        print(f"Categories: {list(catalog['categories'].keys())}")
    else:
        with open(CATALOG_PATH, "w") as f:
            json.dump(catalog, f, indent=2)
        print(f"\n✓ Updated catalog: {len(catalog['images'])} images")

    return catalog


if __name__ == "__main__":
    import sys

    dry_run = "--execute" not in sys.argv

    plan = analyze()
    execute(plan, dry_run=dry_run)
    update_catalog(plan, dry_run=dry_run)

    if dry_run:
        print("\n💡 Run with --execute to apply changes")
