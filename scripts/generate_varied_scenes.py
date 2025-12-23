#!/usr/bin/env python3
"""
Generate new varied scene prompts for Nutcracker corpus.

New scene categories:
1. ACTION/MOVEMENT - Break passive sitting pattern
2. WEATHER - Visual variety, emotional range
3. NIGHT - Missing time-of-day diversity
4. INTERACTION - Currently almost all solitary

Animal assignments are sparse (2-3 per scene) to maximize variety.
"""

import asyncio
import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

_project_root = Path(__file__).parent.parent.parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))


@dataclass
class NewScene:
    name: str
    desc: str
    category: str  # action, weather, night, interaction
    animals: list[str]  # Which animals to generate for this scene


# New scenes with animal assignments (2-3 per scene for variety)
NEW_SCENES = [
    # ACTION/MOVEMENT (8 images)
    NewScene(
        "walking_rain",
        "walking through city rain with an umbrella, puddles reflecting streetlights, wet pavement, raindrops visible, sense of purpose in stride",
        "action",
        ["panda", "lion"],  # 2 animals
    ),
    NewScene(
        "climbing_fire_escape",
        "carefully climbing an old fire escape at dusk, brick walls, distant city sounds, climbing with gentle determination",
        "action",
        ["bear", "hippo"],  # 2 animals
    ),
    NewScene(
        "dancing_streetlight",
        "dancing alone under a streetlight at night, soft pool of light, shadows stretching, joyful private moment",
        "action",
        ["whale", "panda"],  # 2 animals
    ),
    NewScene(
        "running_station",
        "running through a grand train station, marble floors, high ceilings, hurrying to catch a departing train",
        "action",
        ["lion", "bear"],  # 2 animals
    ),

    # WEATHER (8 images)
    NewScene(
        "snow_bench",
        "sitting on a snow-covered park bench, fresh snowfall, bare winter trees, quiet stillness, breath visible in cold air",
        "weather",
        ["hippo", "whale"],  # 2 animals
    ),
    NewScene(
        "foggy_pier",
        "standing at the end of a foggy pier, mist obscuring the water, ship horns in distance, ghostly atmosphere",
        "weather",
        ["whale", "bear"],  # 2 animals
    ),
    NewScene(
        "umbrella_sharing",
        "sharing a large umbrella with a small child in heavy rain, protecting the child, rain drumming on fabric",
        "weather",
        ["panda", "lion"],  # 2 animals
    ),
    NewScene(
        "wind_leaves",
        "caught in a gust of autumn wind, leaves swirling, coat billowing, hat nearly flying off, surprised expression",
        "weather",
        ["bear", "hippo"],  # 2 animals
    ),

    # NIGHT SCENES (8 images)
    NewScene(
        "neon_alley",
        "standing in a narrow alley lit by neon signs, Japanese text on signs, steam rising from grates, cyberpunk atmosphere but gentle",
        "night",
        ["lion", "panda"],  # 2 animals
    ),
    NewScene(
        "streetlamp_reading",
        "reading a book under a streetlamp at night, pool of warm light, darkness beyond, completely absorbed in story",
        "night",
        ["whale", "bear"],  # 2 animals
    ),
    NewScene(
        "night_market",
        "wandering through a night market, string lights everywhere, food stalls, steam and warm glow, curious expression",
        "night",
        ["hippo", "panda"],  # 2 animals
    ),
    NewScene(
        "rooftop_stars",
        "lying on a rooftop looking at stars, city lights in periphery, quiet contemplation, old blanket underneath",
        "night",
        ["lion", "whale"],  # 2 animals
    ),

    # INTERACTION (8 images)
    NewScene(
        "sharing_meal",
        "sharing a simple meal with an elderly person at a small kitchen table, warm lighting, genuine connection, steam from food",
        "interaction",
        ["bear", "panda"],  # 2 animals
    ),
    NewScene(
        "helping_stranger",
        "helping a stranger pick up dropped groceries on a busy sidewalk, bags and oranges scattered, people walking past",
        "interaction",
        ["hippo", "lion"],  # 2 animals
    ),
    NewScene(
        "playing_chess",
        "playing chess with an old man in a park, wooden board, fallen leaves nearby, deep concentration",
        "interaction",
        ["whale", "bear"],  # 2 animals
    ),
    NewScene(
        "teaching_child",
        "kneeling to teach a small child to tie shoelaces, patient expression, child looking up with trust",
        "interaction",
        ["panda", "hippo"],  # 2 animals
    ),
]


# Rotate through these 3 styles (1 per animal-scene combo = 32 total)
STYLES = [
    {
        "name": "claymation",
        "desc": "The style is claymation like Aardman studios, with smooth clay textures, visible fingerprints, slightly exaggerated proportions, and warm tactile charm.",
    },
    {
        "name": "stopmotion",
        "desc": "The style is stop-motion animation reminiscent of Wes Anderson films, with symmetrical framing, muted pastel colors, visible textile textures on fur, and meticulous handcrafted detail.",
    },
    {
        "name": "puppet",
        "desc": "The style is practical puppet like Jim Henson productions, a sophisticated animatronic character filmed on real sets, mechanical expressiveness, fabric textures, and theatrical warmth.",
    },
]

# Clothing options
CLOTHING_OPTIONS = [
    "a small military-style jacket in faded navy with tarnished brass buttons and worn gold epaulets, a cream wool scarf",
    "a burgundy velvet military coat with brass buttons and frayed silver braid, a pocket watch chain visible",
    "an olive drab officer's jacket with patched elbows and dulled medals, a knit scarf in forest green",
    "a midnight blue dress coat with mother-of-pearl buttons and a satin sash, slightly threadbare",
    "a weathered crimson military tunic with brass clasps and a cape draped over one shoulder",
]


def build_prompts(scenes: list[NewScene], styles: list[dict]) -> list[dict]:
    """Build prompt list for generation - rotates 1 style per animal-scene combo."""
    base_prompt = """A humanoid {animal} rendered as a living character—not a toy, not a costume—moves through the human world with gentle theatricality. {style_desc}

The {animal} wears Nutcracker-inspired clothing: {clothing}—evoking a faded holiday ballet aesthetic. Clothing suggests ceremony, memory, and role-playing, not disguise.

Setting: {scene_desc}. Christmas and winter elements appear lightly (garlands, snow, warm windows), not festive excess.

Humans exist naturally in the scene, treating the {animal} as unremarkable. The contrast is poetic rather than comic.

Tone balances melancholy and wonder. The {animal} pauses, thoughtful, slightly lonely but never bleak. A frame from a quiet animated film about crossing from a magical world into everyday life. Gentle whimsy, restrained emotion, holiday nostalgia."""

    prompts = []
    clothing_idx = 0
    style_idx = 0  # Rotate through styles

    for scene in scenes:
        for animal in scene.animals:
            # Rotate style (1 per animal-scene combo)
            style = styles[style_idx % len(styles)]
            style_idx += 1

            clothing = CLOTHING_OPTIONS[clothing_idx % len(CLOTHING_OPTIONS)]
            clothing_idx += 1

            prompt = base_prompt.format(
                animal=animal,
                style_desc=style["desc"],
                clothing=clothing,
                scene_desc=scene.desc,
            )

            name = f"{animal}_{style['name']}_{scene.name}"
            prompts.append({
                "name": name,
                "prompt": prompt,
                "animal": animal,
                "style": style["name"],
                "scene": scene.name,
                "category": scene.category,
            })

    return prompts


async def generate_batch(
    prompts: list[dict], output_dir: Path, max_concurrent: int = 15
) -> list[dict]:
    """Generate images with parallel execution."""
    from tools.support.nano_bananas.generator import GenerationConfig, ImageGenerator

    print(f"\n{'=' * 60}")
    print("GENERATING NEW VARIED SCENES")
    print(f"{'=' * 60}")
    print(f"Total prompts: {len(prompts)}")
    print(f"Max concurrent: {max_concurrent}")
    print(f"Output: {output_dir}")
    print(f"{'=' * 60}\n")

    output_dir.mkdir(parents=True, exist_ok=True)
    config = GenerationConfig(output_dir=output_dir, delay_between_requests=0)
    generator = ImageGenerator(config)
    semaphore = asyncio.Semaphore(max_concurrent)

    async def generate_one(prompt_data: dict, idx: int) -> dict[str, Any]:
        async with semaphore:
            name = prompt_data["name"]
            prompt = prompt_data["prompt"]
            print(f"[{idx + 1}/{len(prompts)}] {name}")

            try:
                result = await generator.generate(prompt, name=name)
                if result.success:
                    print(f"  ✓ {name}")
                    return {"name": name, "success": True, **prompt_data}
                else:
                    print(f"  ✗ {name}: {result.error_message}")
                    return {"name": name, "success": False, "error": result.error_message}
            except Exception as e:
                print(f"  ✗ {name}: {e}")
                return {"name": name, "success": False, "error": str(e)}

    # Staggered start
    tasks = []
    for i, prompt in enumerate(prompts):
        task = asyncio.create_task(generate_one(prompt, i))
        tasks.append(task)
        await asyncio.sleep(0.15)  # Stagger to respect rate limits

    results = await asyncio.gather(*tasks)

    # Summary
    successful = sum(1 for r in results if r.get("success"))
    print(f"\n{'=' * 60}")
    print(f"COMPLETE: {successful}/{len(prompts)} successful")
    print(f"{'=' * 60}")

    return results


def main():
    dry_run = "--generate" not in sys.argv

    print("=" * 60)
    print("NEW VARIED SCENE GENERATION")
    print("=" * 60)

    # Build prompts
    prompts = build_prompts(NEW_SCENES, STYLES)

    print(f"\nGenerated {len(prompts)} prompts across {len(NEW_SCENES)} scenes:")
    print("\nBy category:")
    by_cat = {}
    for p in prompts:
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    for cat, count in by_cat.items():
        print(f"  {cat}: {count}")

    print("\nBy animal:")
    by_animal = {}
    for p in prompts:
        by_animal[p["animal"]] = by_animal.get(p["animal"], 0) + 1
    for animal, count in sorted(by_animal.items()):
        print(f"  {animal}: {count}")

    # Output directory
    date_str = datetime.now().strftime("%Y.%m.%d")
    output_dir = Path(f"/Volumes/Soyuz/Projects/dev_env/output/{date_str}/nano_bananas/nutcracker_varied_scenes")

    if dry_run:
        # Save prompts for review
        output_dir.mkdir(parents=True, exist_ok=True)
        with open(output_dir / "prompts.json", "w") as f:
            json.dump(prompts, f, indent=2)
        print(f"\nPrompts saved to: {output_dir / 'prompts.json'}")
        print("\n" + "=" * 60)
        print("DRY RUN - No images generated")
        print("Run with --generate to create images")
        print("=" * 60)
        return 0

    # Generate
    results = asyncio.run(generate_batch(prompts, output_dir))

    # Save results
    with open(output_dir / "results.json", "w") as f:
        json.dump(results, f, indent=2)

    return 0 if all(r.get("success") for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
