#!/usr/bin/env python3
"""Generate bear and whale images for gaps only."""

import asyncio
import json
import sys
import time
from pathlib import Path

_project_root = Path(__file__).parent.parent.parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from tools.support.nano_bananas.generator import GenerationConfig, ImageGenerator


# Existing bear coverage (mapped to our scene names)
EXISTING_BEAR = {
    ("stopmotion", "diner_booth"),
    ("stopmotion", "phone_booth"),
    ("claymation", "laundromat"),
    ("claymation", "subway_car"),
    ("claymation", "park_bench"),
    ("cgi", "cafe_window"),
    ("cgi", "train_platform"),
    ("cgi", "hotel_lobby"),
    ("handdrawn", "rooftop_dawn"),
    ("handdrawn", "street_corner"),
    ("puppet", "hotel_lobby"),
}

STYLES = [
    {"name": "stopmotion", "desc": "The style is stop-motion animation reminiscent of Wes Anderson films, with symmetrical framing, muted pastel colors, visible textile textures on fur, and meticulous handcrafted detail."},
    {"name": "claymation", "desc": "The style is claymation like Aardman studios, with smooth clay textures, visible fingerprints, slightly exaggerated proportions, and warm tactile charm."},
    {"name": "cgi", "desc": "The style is photorealistic CGI like the Paddington films, seamlessly composited into live-action backgrounds, incredibly detailed fur, expressive eyes, and cinematic lighting."},
    {"name": "puppet", "desc": "The style is practical puppet like Jim Henson productions, a sophisticated animatronic character filmed on real sets, mechanical expressiveness, fabric textures, and theatrical warmth."},
    {"name": "handdrawn", "desc": "The style is hand-drawn 2D animation composited into live-action photography like Who Framed Roger Rabbit, with expressive ink lines, watercolor washes, and a slightly sketchy luminous quality."},
]

SCENES = [
    {"name": "cafe_window", "desc": "a cozy café window seat at evening, snow falling outside, warm amber lighting, garlands on the window frame, a human barista working in background"},
    {"name": "train_platform", "desc": "a train station platform at dusk, string lights wrapped around pillars, light snow dusting the ground, warm glowing windows of a departing train, humans with luggage passing"},
    {"name": "bus_stop", "desc": "a bus stop bench at night, snow falling gently, warm light from a nearby bakery window with holiday garlands, a few humans waiting nearby"},
    {"name": "bookshop", "desc": "inside a cozy used bookshop, warm lamplight, stacks of books, a small tabletop Christmas tree with simple ornaments, snow visible through the window"},
    {"name": "laundromat", "desc": "a late-night laundromat, fluorescent lights softened, dryers spinning, a small string of Christmas lights taped to the window, snow outside"},
    {"name": "rooftop_dawn", "desc": "a city rooftop at dawn, old chimneys, distant city lights, first light of winter morning, a small Christmas tree visible through a neighbor's window"},
    {"name": "diner_booth", "desc": "a late-night diner booth, soft neon glow, a small holiday wreath on the wall, snow against the window, coffee cup steaming"},
    {"name": "subway_car", "desc": "an empty subway car late at night, warm tungsten lighting, holiday advertisements on the walls, city lights streaming past windows"},
    {"name": "street_corner", "desc": "a quiet street corner at twilight, snow falling, warm light spilling from shop windows decorated with simple garlands"},
    {"name": "park_bench", "desc": "a park bench in winter, bare trees with string lights, fresh snow on the ground, distant sound of carolers, city skyline soft in background"},
    {"name": "phone_booth", "desc": "an old red phone booth on a snowy street at night, warm light inside, frost on the glass, a small wreath hung on the door"},
    {"name": "hotel_lobby", "desc": "a grand old hotel lobby at Christmas, chandelier with warm light, a tall decorated tree, marble floors reflecting lights, a few guests in winter coats"},
]

CLOTHING_OPTIONS = [
    "a small military-style jacket in faded navy with tarnished brass buttons and worn gold epaulets, a cream wool scarf",
    "a burgundy velvet military coat with brass buttons and frayed silver braid, a pocket watch chain visible",
    "an olive drab officer's jacket with patched elbows and dulled medals, a knit scarf in forest green",
    "a midnight blue dress coat with mother-of-pearl buttons and a satin sash, slightly threadbare",
    "a weathered crimson military tunic with brass clasps and a cape draped over one shoulder",
]

BASE_PROMPT = """A humanoid {animal} rendered as a living character—not a toy, not a costume—moves through the human world with gentle theatricality. {style_desc}

The {animal} wears Nutcracker-inspired clothing: {clothing}—evoking a faded holiday ballet aesthetic. Clothing suggests ceremony, memory, and role-playing, not disguise.

Setting: {scene_desc}. Christmas and winter elements appear lightly (garlands, snow, warm windows), not festive excess.

Humans exist naturally in the scene, treating the {animal} as unremarkable. The contrast is poetic rather than comic.

Tone balances melancholy and wonder. The {animal} pauses, thoughtful, slightly lonely but never bleak. A frame from a quiet animated film about crossing from a magical world into everyday life. Gentle whimsy, restrained emotion, holiday nostalgia."""


def build_gap_prompts():
    """Build prompts for bear gaps and full whale matrix."""
    prompts = []
    clothing_idx = 0

    # Bear gaps
    for style in STYLES:
        for scene in SCENES:
            if (style["name"], scene["name"]) not in EXISTING_BEAR:
                clothing = CLOTHING_OPTIONS[clothing_idx % len(CLOTHING_OPTIONS)]
                clothing_idx += 1
                prompt = BASE_PROMPT.format(
                    animal="bear",
                    style_desc=style["desc"],
                    clothing=clothing,
                    scene_desc=scene["desc"],
                )
                prompts.append({"name": f"bear_{style['name']}_{scene['name']}", "prompt": prompt})

    # Full whale matrix
    for style in STYLES:
        for scene in SCENES:
            clothing = CLOTHING_OPTIONS[clothing_idx % len(CLOTHING_OPTIONS)]
            clothing_idx += 1
            prompt = BASE_PROMPT.format(
                animal="whale",
                style_desc=style["desc"],
                clothing=clothing,
                scene_desc=scene["desc"],
            )
            prompts.append({"name": f"whale_{style['name']}_{scene['name']}", "prompt": prompt})

    return prompts


async def generate_one(semaphore, generator, prompt_data, index, total):
    async with semaphore:
        name = prompt_data["name"]
        prompt = prompt_data["prompt"]
        print(f"[{index + 1}/{total}] Starting: {name}")
        start = time.time()
        try:
            result = await generator.generate(prompt, name=name)
            elapsed = time.time() - start
            if result.success:
                print(f"  ✓ {name} ({elapsed:.1f}s)")
                return {"name": name, "success": True, "time": elapsed}
            else:
                print(f"  ✗ {name}: {result.error_message}")
                return {"name": name, "success": False, "error": result.error_message}
        except Exception as e:
            print(f"  ✗ {name}: {e}")
            return {"name": name, "success": False, "error": str(e)}


async def main():
    prompts = build_gap_prompts()
    print(f"Generated {len(prompts)} prompts (bear gaps + whale full)")

    # Same output folder as lion/hippo/panda
    output_dir = Path("/Volumes/Soyuz/Projects/dev_env/output/2025.12.22/nano_bananas/nutcracker_full_batch")
    output_dir.mkdir(parents=True, exist_ok=True)

    config = GenerationConfig(output_dir=output_dir, delay_between_requests=0)
    generator = ImageGenerator(config)
    semaphore = asyncio.Semaphore(25)

    print(f"\n{'=' * 60}")
    print(f"BEAR + WHALE GAP GENERATION")
    print(f"{'=' * 60}")
    print(f"Total: {len(prompts)} | Concurrent: 25 | Output: {output_dir}")
    print(f"{'=' * 60}\n")

    # Staggered parallel execution
    tasks = []
    for i, p in enumerate(prompts):
        tasks.append(generate_one(semaphore, generator, p, i, len(prompts)))

    async def staggered():
        pending = []
        for i, task in enumerate(tasks):
            pending.append(asyncio.create_task(task))
            if i < len(tasks) - 1:
                await asyncio.sleep(0.15)
        return await asyncio.gather(*pending)

    start_time = time.time()
    results = await staggered()
    total_time = time.time() - start_time

    successful = sum(1 for r in results if r["success"])
    print(f"\n{'=' * 60}")
    print(f"COMPLETE: {successful}/{len(prompts)} successful")
    print(f"Time: {total_time:.1f}s ({total_time/60:.1f} min) | Rate: {len(prompts)/total_time*60:.1f}/min")
    print(f"{'=' * 60}")

    return 0 if successful == len(prompts) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
