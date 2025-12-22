# Christmas Stories

> **Version**: 1.0.0 | **Status**: Production | **Updated**: 2025-12-22

A holiday-themed image ranking tool using Elo ratings

![Christmas Stories](images/01_train_platform.png)

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)

A progressive web app for ranking images using the Elo rating system. Features holiday-themed imagery of animals navigating the human world inspired by the collision of human and fantasy realms in the Nutcracker.

**Live Demo**: [lean-wintermute.github.io/nutcracker](https://lean-wintermute.github.io/nutcracker/)

## Features

### Core
- **Elo Rating System** - K-factor 32, starting rating 1500
- **Pairwise Comparison** - Side-by-side image voting
- **Smart Pairing** - Prioritizes under-voted images for balanced coverage
- **Rankings Gallery** - View sorted results with lightbox viewer + download
- **Offline-First** - All data stored in localStorage

### V1.0 Features
- **Compare With Global** - See how your rankings differ from aggregate votes
- **Social Sharing** - Share rankings via link or social platforms with OG meta tags
- **Analytics Export** - Download your voting data as JSON
- **AI Helpbot** - Claude-powered assistant for app questions (Firebase Function)
- **GitHub Issue Sync** - Bug reports and suggestions auto-create GitHub issues

### User Experience
- **Light/Dark Mode** - Toggle theme with system preference detection
- **PWA Support** - Installable, offline-capable progressive web app
- **Feedback Collection** - Optional tag-based feedback on vote reasoning
- **Uncle Elmo Branding** - Shimmer effects and holiday theming

### Accessibility (WCAG 2.1 AA)
- Full keyboard navigation
- Screen reader support
- Reduced motion preference
- 44px+ touch targets

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

## Architecture

```
Nutcracker/
├── index.html          # Main PWA (single-file, ~3500 lines)
├── manifest.json       # PWA manifest
├── sw.js              # Service worker for offline
├── images/            # 30 holiday-themed images
├── chatbot-config.json # Helpbot FAQ configuration
├── functions/         # Firebase Cloud Functions
│   ├── index.js       # Function entry point
│   └── lib/           # Handler, classifier, GitHub integration
├── firebase.json      # Firebase configuration
└── firestore.rules    # Security rules
```

## Helpbot

The AI helpbot uses a 5-layer FAQ matching system:
1. Preprocessing + typo correction
2. Intent extraction
3. Multi-strategy matching (Fuse.js)
4. Confidence routing
5. Claude Haiku fallback for general questions

Bug reports and feedback are automatically synced to GitHub Issues with:
- Jaccard similarity deduplication
- Auto-priority upgrade (3+ reports → P3, 5+ → P2, 10+ → P1)
- Rate limiting (20 msgs/10min per session)

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| **1.0.0** | 2025-12-22 | Production release with all V1.0 features |
| **0.9.0** | 2025-12-22 | Compare With Global, social sharing, analytics export |
| **0.8.0** | 2025-12-22 | AI Helpbot with Firebase Functions, GitHub issue sync |
| **0.7.0** | 2025-12-22 | Uncle Elmo branding, shimmer effects, UI polish |
| **0.6.0** | 2025-12-22 | WCAG 2.1 AA accessibility, keyboard navigation |
| **0.5.0** | 2025-12-22 | Firebase + Firestore integration, cloud backup |
| **0.4.0** | 2025-12-21 | Feedback collection, tag-based voting reasons |
| **0.3.0** | 2025-12-21 | Rankings gallery, lightbox viewer, image download |
| **0.2.0** | 2025-12-21 | Smart pairing algorithm, under-voted image priority |
| **0.1.0** | 2025-12-21 | Initial PWA: Elo ratings, pairwise voting, light/dark mode |

## Adding Your Own Images

1. Fork this repository
2. Replace images in the `images/` directory
3. Update the `IMAGE_FILES` array in `index.html`
4. Deploy to GitHub Pages or any static host

## Browser Support

Chrome/Edge 88+, Firefox 78+, Safari 14+, iOS Safari 14+

## Credits

- **Architect**: Trey Herr
- **Developers**: Claude Code (Anthropic)
- **Graphic Design**: Gemini (Google)

## License

**Christmas Stories v1.0.0 © 2025 by Trey Herr** | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)

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
