#!/usr/bin/env python3
"""
Batch image generation runner for Nutcracker with proper throttling.

Runs lion, hippo, and panda batches with:
- Rate limiting respecting Gemini API quotas (500 RPM tier)
- Parallel execution where safe
- Progress tracking and resumption support

Usage:
    # Run all batches
    python scripts/run_batch_generation.py --all

    # Run specific animal
    python scripts/run_batch_generation.py --animal lions

    # Resume from failure
    python scripts/run_batch_generation.py --animal hippos --resume
"""

import argparse
import asyncio
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

# Add project root to path
_project_root = Path(__file__).parent.parent.parent.parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from tools.support.nano_bananas.generator import GenerationConfig, ImageGenerator


class BatchRunner:
    """Runs batch image generation with throttling and progress tracking."""

    def __init__(
        self,
        prompts_dir: Path,
        output_base: Path,
        delay_between_requests: float = 3.0,  # Conservative for image gen
    ):
        self.prompts_dir = prompts_dir
        self.output_base = output_base
        self.delay = delay_between_requests
        self.progress_file = output_base / "progress.json"

    def load_prompts(self, animal: str) -> list[dict[str, Any]]:
        """Load prompts for a specific animal."""
        prompts_file = self.prompts_dir / f"batch_{animal}.json"
        if not prompts_file.exists():
            raise FileNotFoundError(f"Prompts file not found: {prompts_file}")

        with open(prompts_file) as f:
            data = json.load(f)

        return data.get("prompts", [])

    def load_progress(self, animal: str) -> set[str]:
        """Load completed image names for resume support."""
        progress_file = self.output_base / animal / "completed.json"
        if progress_file.exists():
            with open(progress_file) as f:
                return set(json.load(f))
        return set()

    def save_progress(self, animal: str, completed: set[str]) -> None:
        """Save completed image names."""
        progress_file = self.output_base / animal / "completed.json"
        progress_file.parent.mkdir(parents=True, exist_ok=True)
        with open(progress_file, "w") as f:
            json.dump(list(completed), f, indent=2)

    async def run_batch(
        self,
        animal: str,
        resume: bool = True,
    ) -> dict[str, Any]:
        """Run batch generation for a specific animal."""
        print(f"\n{'=' * 60}")
        print(f"Starting batch generation: {animal.upper()}")
        print(f"{'=' * 60}")

        prompts = self.load_prompts(animal)
        output_dir = self.output_base / animal
        output_dir.mkdir(parents=True, exist_ok=True)

        # Load progress if resuming
        completed = self.load_progress(animal) if resume else set()
        if completed:
            print(f"Resuming: {len(completed)} already completed")

        # Filter out completed
        remaining = [p for p in prompts if p["name"] not in completed]
        print(f"To generate: {len(remaining)} images")

        if not remaining:
            print("All images already generated!")
            return {"animal": animal, "total": len(prompts), "completed": len(prompts), "failed": 0}

        # Configure generator
        config = GenerationConfig(
            output_dir=output_dir,
            aspect_ratio="16:9",
            delay_between_requests=self.delay,
        )
        generator = ImageGenerator(config)

        # Track results
        failed: list[str] = []
        start_time = time.time()

        for i, prompt_data in enumerate(remaining):
            name = prompt_data["name"]
            prompt = prompt_data["prompt"]

            print(f"\n[{i + 1}/{len(remaining)}] Generating: {name}")
            print(f"  Prompt: {prompt[:80]}...")

            try:
                result = await generator.generate(prompt, name=name)

                if result.success:
                    print(f"  ✓ Success in {result.generation_time:.1f}s: {result.output_path}")
                    completed.add(name)
                    self.save_progress(animal, completed)
                else:
                    print(f"  ✗ Failed: {result.error_message}")
                    failed.append(name)

            except Exception as e:
                print(f"  ✗ Exception: {e}")
                failed.append(name)

            # Progress update every 10 images
            if (i + 1) % 10 == 0:
                elapsed = time.time() - start_time
                rate = (i + 1) / elapsed * 60  # images per minute
                eta = (len(remaining) - i - 1) / rate if rate > 0 else 0
                print(f"\n  --- Progress: {i + 1}/{len(remaining)} | Rate: {rate:.1f}/min | ETA: {eta:.1f} min ---\n")

            # Delay between requests (throttling)
            if i < len(remaining) - 1:
                await asyncio.sleep(self.delay)

        elapsed = time.time() - start_time
        print(f"\n{'=' * 60}")
        print(f"Batch complete: {animal.upper()}")
        print(f"  Total: {len(prompts)}")
        print(f"  Completed: {len(completed)}")
        print(f"  Failed: {len(failed)}")
        print(f"  Time: {elapsed / 60:.1f} minutes")
        print(f"{'=' * 60}")

        if failed:
            print(f"\nFailed images: {failed}")

        return {
            "animal": animal,
            "total": len(prompts),
            "completed": len(completed),
            "failed": len(failed),
            "failed_names": failed,
            "elapsed_minutes": elapsed / 60,
        }


async def run_parallel(animals: list[str], runner: BatchRunner, resume: bool = True) -> list[dict]:
    """Run multiple batches in parallel."""
    tasks = [runner.run_batch(animal, resume=resume) for animal in animals]
    return await asyncio.gather(*tasks)


async def main() -> int:
    parser = argparse.ArgumentParser(description="Batch image generation for Nutcracker")
    parser.add_argument("--animal", choices=["lions", "hippos", "pandas"], help="Specific animal to generate")
    parser.add_argument("--all", action="store_true", help="Generate all animals (lions + hippos in parallel, then pandas)")
    parser.add_argument("--lions-hippos", action="store_true", help="Generate lions and hippos in parallel")
    parser.add_argument("--pandas-only", action="store_true", help="Generate pandas only (separate hold)")
    parser.add_argument("--resume", action="store_true", default=True, help="Resume from previous run (default: True)")
    parser.add_argument("--no-resume", action="store_true", help="Start fresh, ignore previous progress")
    parser.add_argument("--delay", type=float, default=3.0, help="Delay between requests in seconds (default: 3.0)")

    args = parser.parse_args()
    resume = not args.no_resume

    # Paths
    script_dir = Path(__file__).parent
    prompts_dir = script_dir.parent / "prompts"
    output_base = Path("/Volumes/Soyuz/Projects/dev_env/output/nutcracker_batch")

    runner = BatchRunner(
        prompts_dir=prompts_dir,
        output_base=output_base,
        delay_between_requests=args.delay,
    )

    results = []

    if args.animal:
        result = await runner.run_batch(args.animal, resume=resume)
        results.append(result)

    elif args.lions_hippos:
        print("\n" + "=" * 60)
        print("PARALLEL GENERATION: LIONS + HIPPOS")
        print("=" * 60)
        results = await run_parallel(["lions", "hippos"], runner, resume=resume)

    elif args.pandas_only:
        result = await runner.run_batch("pandas", resume=resume)
        results.append(result)

    elif args.all:
        print("\n" + "=" * 60)
        print("FULL BATCH: LIONS + HIPPOS (parallel), then PANDAS")
        print("=" * 60)

        # Lions and hippos in parallel
        lion_hippo_results = await run_parallel(["lions", "hippos"], runner, resume=resume)
        results.extend(lion_hippo_results)

        # Pandas separately
        panda_result = await runner.run_batch("pandas", resume=resume)
        results.append(panda_result)

    else:
        parser.print_help()
        return 1

    # Summary
    print("\n" + "=" * 60)
    print("GENERATION SUMMARY")
    print("=" * 60)
    for r in results:
        print(f"  {r['animal'].upper()}: {r['completed']}/{r['total']} ({r['failed']} failed)")
    print("=" * 60)

    # Save summary
    summary_file = output_base / f"summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSummary saved to: {summary_file}")

    return 0 if all(r["failed"] == 0 for r in results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
