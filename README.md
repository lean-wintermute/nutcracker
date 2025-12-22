# Christmas Stories

> A holiday-themed image ranking tool using Elo ratings

![Christmas Stories](images/01_train_platform.png)

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)

A progressive web app for ranking images using the Elo rating system. Features holiday-themed imagery of animals navigating the human world inspired by the collision of human and fantasy realms in the Nutcracker.

**Live Demo**: [lean-wintermute.github.io/nutcracker](https://lean-wintermute.github.io/nutcracker/)

## Features

- **Elo Rating System** - K-factor 32, starting rating 1500
- **Pairwise Comparison** - Side-by-side image voting
- **Smart Pairing** - Prioritizes under-voted images for balanced coverage
- **Light/Dark Mode** - Toggle theme with system preference detection
- **PWA Support** - Installable, offline-capable progressive web app
- **Feedback Collection** - Optional tag-based feedback on vote reasoning
- **Rankings Gallery** - View sorted results with lightbox viewer + download
- **Offline-First** - All data stored in localStorage

## Quick Start

1. Visit [lean-wintermute.github.io/nutcracker](https://lean-wintermute.github.io/nutcracker/)
2. Click or tap the image you prefer
3. View rankings in the Rankings tab

Or run locally:

```bash
git clone https://github.com/lean-wintermute/nutcracker.git
cd nutcracker
python -m http.server 8000
# Visit http://localhost:8000
```

## Controls

| Input | Action |
|-------|--------|
| Click/Tap image | Vote for that image |
| `Left Arrow` / `A` | Vote left |
| `Right Arrow` / `D` | Vote right |
| `S` / `Down Arrow` | Skip matchup |

## Adding Your Own Images

1. Fork this repository
2. Replace images in the `images/` directory
3. Update the `IMAGE_FILES` array in `index.html`
4. Deploy to GitHub Pages or any static host

## Browser Support

Chrome/Edge 88+, Firefox 78+, Safari 14+, iOS Safari 14+

## Accessibility

WCAG 2.1 AA compliant: full keyboard navigation, screen reader support, reduced motion preference, 44px+ touch targets.

## Credits

- **Architect**: Trey Herr
- **Developers**: Claude Code (Anthropic)
- **Graphic Design**: Gemini (Google)

## License

**Christmas Stories © 2025 by Trey Herr** | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

SPDX-License-Identifier: CC-BY-NC-SA-4.0

You are free to:
- **Share** — copy and redistribute the material
- **Adapt** — remix, transform, and build upon the material

Under the following terms:
- **Attribution** — Give appropriate credit and indicate if changes were made
- **NonCommercial** — Do not use for commercial purposes
- **ShareAlike** — Distribute contributions under the same license

---

*A standalone project. Source at [lean-wintermute/nutcracker](https://github.com/lean-wintermute/nutcracker)*
