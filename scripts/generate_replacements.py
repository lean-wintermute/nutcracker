#!/usr/bin/env python3
"""Generate 5 replacement images for removed duplicates."""

import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

_project_root = Path(__file__).parent.parent.parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from tools.support.nano_bananas.generator import GenerationConfig, ImageGenerator

# 5 unique replacement scenes (no rain, kids, oranges, sky-staring)
REPLACEMENTS = [
    {
        "name": "lion_claymation_library_ladder",
        "animal": "lion",
        "style": "claymation",
        "scene": "reaching for a book on a tall library ladder, old wooden shelves, dust motes in slanted light, quiet concentration",
    },
    {
        "name": "panda_puppet_flower_shop",
        "animal": "panda",
        "style": "puppet",
        "scene": "browsing in a small flower shop, buckets of winter blooms, condensation on windows, gentle selection of a single stem",
    },
    {
        "name": "hippo_stopmotion_antique_radio",
        "animal": "hippo",
        "style": "stopmotion",
        "scene": "listening to an old tube radio in a dim room, warm amber glow from the dial, absorbed in distant music, teacup nearby",
    },
    {
        "name": "lion_puppet_bakery_morning",
        "animal": "lion",
        "style": "puppet",
        "scene": "standing at a bakery counter at dawn, fresh bread in wire baskets, flour dust in air, warm golden light from ovens",
    },
    {
        "name": "panda_stopmotion_museum_alone",
        "animal": "panda",
        "style": "stopmotion",
        "scene": "sitting alone on a bench in an empty museum gallery, large painting on wall, contemplating art, afternoon light through high windows",
    },
]

STYLES = {
    "claymation": "The style is claymation like Aardman studios, with smooth clay textures, visible fingerprints, slightly exaggerated proportions, and warm tactile charm.",
    "stopmotion": "The style is stop-motion animation reminiscent of Wes Anderson films, with symmetrical framing, muted pastel colors, visible textile textures on fur, and meticulous handcrafted detail.",
    "puppet": "The style is practical puppet like Jim Henson productions, a sophisticated animatronic character filmed on real sets, mechanical expressiveness, fabric textures, and theatrical warmth.",
}

CLOTHING = [
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


async def main():
    output_dir = Path("/Volumes/Soyuz/Projects/dev_env/output/2025.12.22/nano_bananas/nutcracker_varied_scenes")

    config = GenerationConfig(output_dir=output_dir, delay_between_requests=0.5)
    generator = ImageGenerator(config)

    print(f"Generating {len(REPLACEMENTS)} replacement images...")

    for i, r in enumerate(REPLACEMENTS):
        prompt = BASE_PROMPT.format(
            animal=r["animal"],
            style_desc=STYLES[r["style"]],
            clothing=CLOTHING[i],
            scene_desc=r["scene"],
        )

        print(f"[{i+1}/{len(REPLACEMENTS)}] {r['name']}")
        result = await generator.generate(prompt, name=r["name"])

        if result.success:
            print(f"  ✓ {r['name']}")
        else:
            print(f"  ✗ {r['name']}: {result.error_message}")

    # Count final
    final_count = len(list(output_dir.glob("*.png")))
    print(f"\nFinal count: {final_count} images in staging")


if __name__ == "__main__":
    asyncio.run(main())
