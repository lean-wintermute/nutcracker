# Nutcracker Architecture

> **Version**: 2.0.0 | **Updated**: 2025-12-22

## Overview

Nutcracker is a Firebase-hosted web application for Elo-based image ranking with AI image generation. It combines a static image corpus with user-generated scenes in a unified catalog.

**Live URL**: https://nutcracker-3e8fb.web.app

## Use Cases

### Primary Use Cases

1. **Visual Preference Research**
   - Rank AI-generated images to identify preferred styles
   - Collect qualitative feedback on why images are preferred
   - Export results for analysis

2. **A/B Testing at Scale**
   - Compare variations of visual content
   - Statistical ranking via Elo system
   - Track which attributes drive preference

3. **Content Curation**
   - Crowdsource rankings from multiple users
   - Aggregate preferences via Firebase sync
   - Identify top performers

### User Workflows

```
Vote Flow:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  View Pair  │───►│  Click Vote │───►│ Save Rating │
└─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼ (every 3rd vote)
                   ┌─────────────┐
                   │ Feedback    │
                   │ Toast       │
                   └─────────────┘

Rankings Flow:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Click Tab  │───►│ View Sorted │───►│ Click Image │
└─────────────┘    └─────────────┘    └─────────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │ View Full   │    │  Download   │    │ Right-Click │
                   │ (new tab)   │    │  (button)   │    │ (context)   │
                   └─────────────┘    └─────────────┘    └─────────────┘
```

## Constraints

### Design Constraints

| Constraint | Rationale |
|------------|-----------|
| **Single HTML file** | Zero deployment complexity, works from file:// |
| **No build step** | Immediate editing, no toolchain |
| **No external runtime dependencies** | Works offline, no CDN failures |
| **localStorage primary** | Works without server, instant persistence |
| **Anonymous by default** | Zero friction, no signup barriers |

### Technical Constraints

| Constraint | Limit | Rationale |
|------------|-------|-----------|
| Max matches stored | 10,000 | Prevent localStorage bloat (~5MB limit) |
| Suggestion length | 500 chars | Reasonable feedback length |
| Toast duration | 8 seconds | WCAG timing requirements |
| Touch targets | 44px minimum | WCAG AA / mobile usability |
| Image format | PNG/JPG | Universal browser support |

### Security Constraints

| Constraint | Implementation |
|------------|----------------|
| XSS prevention | `escapeHtml()` on all dynamic content |
| CSP policy | `script-src 'self' 'unsafe-inline'` (single-file tradeoff) |
| No secrets in client | Firebase config is public (security via rules) |
| Input validation | Type checking on localStorage load |
| URL handling | `encodeURIComponent()` for file paths |

### Accessibility Constraints (WCAG 2.1 AA)

| Requirement | Implementation |
|-------------|----------------|
| Color contrast | 4.5:1 minimum for text |
| Keyboard navigation | Full app navigable via Tab/Enter/Escape |
| Focus indicators | 3px accent outline on :focus-visible |
| Screen readers | aria-live regions, proper roles |
| Timing | Pause on hover/focus, "Keep open" option |
| Reduced motion | `prefers-reduced-motion` media query |

## Infrastructure

### System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Firebase Hosting                              │
│                    nutcracker-3e8fb.web.app                         │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  index.html  │  │   sw.js      │  │ manifest.json│              │
│  │  (PWA)       │  │  (offline)   │  │  (install)   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Firebase        │  │  Cloud           │  │  Firestore       │
│  Storage         │  │  Functions       │  │                  │
│                  │  │                  │  │                  │
│  /images/*       │  │  imagineScenes   │  │  image_catalog   │
│  (static corpus) │  │  syncCatalog     │  │  votes           │
│                  │  │  helpbot         │  │  imagine_users   │
│  /imagined/*     │  │  generateStory   │  │  system          │
│  (user-generated)│  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### Unified Image Catalog

All images (static corpus + user-generated) share a single Firestore collection:

```
image_catalog/{imageId}
├── id: string              # Document ID
├── filename: string        # e.g., "whale_cafe.png"
├── src: string             # Full URL (Storage or signed URL)
├── name: string            # Display name
├── description: string     # Scene description
├── category: string        # whale, bear, lion, panda, etc.
├── series: string          # Style series or "generated"
├── isGenerated: boolean    # false = static, true = user-generated
├── userId?: string         # Only for generated images
├── storagePath?: string    # Only for generated images
├── eloScore: number        # Default 1200
├── createdAt: Timestamp
├── updatedAt?: Timestamp
└── expiresAt?: Date        # 90-day TTL for generated images
```

**Benefits**:
- Single source of truth for all images
- Frontend loads once, gets everything
- Generated images appear alongside corpus in voting + rankings
- Unified Elo calculations

### Single Source of Truth (File Level)

`image-catalog.json` is the canonical source for image lists. All consumers read from it:

```
image-catalog.json (SINGLE SOURCE)
        │
        ├──► sw.js (dynamically loads on install)
        ├──► syncImageCatalog.js (syncs to Firestore)
        └──► index.html (fallback if Firestore unavailable)
```

**Sync Workflow**:
```bash
# After adding/removing images:
python scripts/sync-catalog.py --fix   # Syncs catalog with images/
# Then copy to deploy/ and push to GitHub Pages
```

**NEVER**:
- Hardcode image lists in sw.js
- Maintain separate catalogs that can drift
- Update images without running sync-catalog.py

**Directory Structure**:
```
Nutcracker/
├── images/                    # Source images (synced with deploy)
├── image-catalog.json         # Root catalog (synced with images/)
├── deploy/
│   ├── images/                # Production images (curated set)
│   ├── image-catalog.json     # Deploy catalog (matches deploy/images/)
│   └── sw.js                  # Reads from image-catalog.json dynamically
└── scripts/
    └── sync-catalog.py        # Syncs catalog ↔ images folder
```

**Note**: Root and deploy should stay in sync. Archive removed images to `images/_removed_for_balance/`.

### Image Loading Flow

```
Page Load
    │
    ▼
┌─────────────────────┐
│ Wait for Firebase   │
│ auth ready          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│ Fetch image_catalog │────►│ Success: Use        │
│ from Firestore      │     │ Firestore images    │
└──────────┬──────────┘     └─────────────────────┘
           │ Failure
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│ Fetch local         │────►│ Success: Use        │
│ image-catalog.json  │     │ local JSON          │
└─────────────────────┘     └─────────────────────┘
```

### Cloud Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `imagineScenes` | HTTP POST | Generate AI images, write to both collections |
| `syncImageCatalog` | HTTP POST | Upload static catalog to Firestore |
| `scheduledCatalogSync` | Weekly cron | Maintenance sync of static catalog |
| `helpbot` | HTTP POST | AI chatbot for user questions |
| `generateStory` | HTTP POST | TTS audio story generation |
| `cleanupExpiredLogs` | Daily cron | Delete expired log documents |

### Storage Structure

```
Firebase Storage (nutcracker-3e8fb.appspot.com)
├── images/                    # Static corpus (public read)
│   ├── whale_cafe.png
│   ├── bear_park_bench.png
│   └── ... (240 images)
│
└── imagined/                  # User-generated (public read)
    └── {userId}/
        └── {uuid}.png
```

### Security Rules

**Firestore** (`firestore.rules`):
- `image_catalog`: Public read, Cloud Function write only
- `votes`: Authenticated create, public read
- `imagine_users`: Owner read, Cloud Function write only
- `system`: Admin only

**Storage** (`storage.rules`):
- `images/**`: Public read, no client write
- `imagined/**`: Public read, no client write

## Technical Architecture

### Data Model

```
State
├── ratings: { [imageId]: number }     # Elo ratings (default 1500)
├── matches: Match[]                    # Vote history
└── currentPair: { left, right }       # Current comparison

Match
├── winner: string                      # Image ID
├── loser: string                       # Image ID
└── timestamp: number                   # Unix ms

FeedbackState
├── tags: { [imageId]: string[] }      # Tags per image
└── suggestions: Suggestion[]           # User suggestions

Suggestion
├── text: string                        # Max 500 chars
└── timestamp: number                   # Unix ms
```

### Elo Algorithm

```javascript
K_FACTOR = 32
DEFAULT_ELO = 1500

expectedScore(ratingA, ratingB) = 1 / (1 + 10^((ratingB - ratingA) / 400))

newWinnerRating = oldRating + K * (1 - expectedScore)
newLoserRating = oldRating + K * (0 - expectedScore)
```

### Pairing Algorithm

1. Count matches per image
2. Sort images by match count (ascending)
3. Select first image from under-voted half
4. Select second image randomly (avoiding same image)

This ensures balanced coverage while maintaining randomness.

## Deployment

### Deploy Everything

```bash
cd /path/to/Nutcracker

# Deploy hosting, functions, rules
firebase deploy --project nutcracker-3e8fb

# One-time: Upload static images to Storage
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
node scripts/upload-images-to-storage.js

# Sync static catalog to Firestore
curl -X POST https://us-central1-nutcracker-3e8fb.cloudfunctions.net/syncImageCatalog
```

### Local Development

```bash
# Start emulators
firebase emulators:start

# Or serve frontend only
cd deploy && python -m http.server 5000
```

### Environment Variables

| Variable | Purpose | Where |
|----------|---------|-------|
| `GEMINI_API_KEY` | Image generation | Firebase Secret |
| `ANTHROPIC_KEY` | Helpbot AI | Firebase Secret |
| `GITHUB_TOKEN` | Issue creation | Firebase Secret |

## Performance Considerations

| Area | Optimization |
|------|--------------|
| Image loading | `loading="lazy"` on leaderboard, `loading="eager"` on arena |
| Leaderboard render | Pre-compute win/loss in O(n) not O(n*m) |
| State persistence | Debounce saves, trim old matches |
| CSS animations | Use `transform` for GPU acceleration |
| Touch events | `passive: true` for scroll listeners |

## Testing Checklist

- [ ] Vote recording and Elo calculation
- [ ] localStorage persistence across refresh
- [ ] Keyboard navigation (Tab, Enter, Escape, Arrow keys)
- [ ] Screen reader announcements
- [ ] Mobile touch interactions
- [ ] Toast pause/resume on hover
- [ ] Swipe to dismiss toast
- [ ] Rankings click-to-view (tap on mobile, click on desktop)
- [ ] Rankings download button (desktop only, 768px+)
- [ ] Export JSON/CSV completeness
- [ ] Reset confirmation and cleanup
- [ ] Offline functionality (PWA)
- [ ] Undo last vote (30s window, Z/Ctrl+Z)
- [ ] Dark/Light theme toggle

## Implemented Features

- **PWA Support**: manifest.json + service worker with offline caching
- **Undo Vote**: 30-second window, keyboard shortcuts (Z, Ctrl+Z)
- **CSV Export**: Alongside JSON export in Rankings
- **Dark/Light Toggle**: System preference detection with manual override
- **Image Catalog**: Display names and descriptions for all 128 images

## Mode B: Imagine Scenes (Image Generation)

### Overview

Mode B allows users to generate custom scenes featuring supported animals using a 40-character seed prompt. Generated images integrate with the existing Elo voting system.

### User Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Select Animal   │───►│ Enter Seed      │───►│ Click Imagine   │
│ (dropdown)      │    │ (40 chars max)  │    │ (button)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                      │
                              ┌───────────────────────┘
                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Enhance Prompt  │───►│ Generate Image  │───►│ Add to Gallery  │
│ (gemini-2.5-pro)│    │ (gemini-3-pro)  │    │ (✨ sparkle)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Architecture

```
functions/
├── imagineScenes.js          # Main Cloud Function entry point
└── lib/
    ├── animals.js            # Animal configurations + style hints
    ├── constants.js          # Rate limits, costs, timeouts
    ├── gemini.js             # Gemini API client (text + image)
    ├── scene-enhancer.js     # VALOR-style prompt enhancement
    ├── image-generator.js    # Image generation with retry
    ├── quota-manager.js      # Per-user + global budget tracking
    └── storage-manager.js    # Firebase Storage upload
```

### Data Flow

```
Request                 Cloud Function                      Gemini API
   │                         │                                  │
   ├─ animal, seed, token ──►│                                  │
   │                         ├─ verifyIdToken() ───────────────►│ Firebase Auth
   │                         ├─ reserveQuota() ────────────────►│ Firestore
   │                         ├─ enhanceScene() ────────────────►│ gemini-2.5-pro
   │                         ├─ generateImage() ───────────────►│ gemini-3-pro-image
   │                         ├─ uploadImage() ─────────────────►│ Storage
   │                         ├─ confirmReservation() ──────────►│ Firestore
   │◄── imageUrl, remaining ─┤                                  │
```

### Quota System

Atomic reserve-then-confirm pattern prevents race conditions:

```javascript
// 1. Reserve slot atomically BEFORE generation
const reservation = await reserveQuota(userId);  // Firestore transaction
if (!reservation.allowed) return { error: reservation.reason };

try {
  // 2. Generate image (expensive operation)
  const image = await generateImage(prompt);

  // 3. Confirm reservation (move from reserved → confirmed)
  await confirmReservation(userId, reservation.id);
  return { success: true, image };
} catch (error) {
  // 4. Release reservation on failure (rollback)
  await releaseReservation(userId, reservation.id);
  throw error;
}
```

**Limits**:
- User daily limit: 24 images/day
- Global budget cap: $20/day
- Image cost: $0.134/image (gemini-3-pro-image-preview)

### Error Handling

| Error Type | Response | Retry Strategy |
|------------|----------|----------------|
| Safety filter | "Try a different seed" | Auto-retry with "illustration" style |
| Rate limit (429) | "Slow down" | Exponential backoff (2s, 4s, 10s max) |
| Timeout (504) | "Try again" | Exponential backoff |
| Budget cap | "Engine resting" | No retry, wait until midnight |
| Auth failure | "Please try again" | No retry, user action needed |

### Security

| Layer | Protection |
|-------|------------|
| Input | 40-char max, blocklist for injection keywords |
| Auth | Firebase ID token verification |
| Quota | Atomic Firestore transactions |
| Budget | Admin SDK only (client can't modify) |
| Storage | Signed URLs with 7-day expiry |
| Prompt | VALOR-style redirect (enhance, not block) |

### Firestore Collections

```
imagine_users/{userId}
├── imagesGenerated: number     # Confirmed generations today
├── reserved: number            # Pending reservations
├── lastReset: "YYYY-MM-DD"     # Last quota reset date
└── lastGeneratedAt: Timestamp

system/budget_{date}
├── spent: number               # Confirmed spend today
├── reserved: number            # Pending spend
└── lastUpdated: Timestamp

imagined_images/{imageId}
├── userId: string
├── animal: string
├── seed: string
├── enhancedPrompt: string
├── storagePath: string
├── imageUrl: string
├── eloScore: number            # Default 1200
├── createdAt: Timestamp
└── expiresAt: Timestamp        # 90 days
```

### UI Components

Mode B is integrated into the existing ninja-keys omnibar (Cmd+K):

```
ninja-keys menu structure:
├── Current Images (Mode A quick access)
│   ├── Story for: [Left Image Name]
│   └── Story for: [Right Image Name]
├── Create New Scene (Mode B)
│   ├── 🐋 Create Whale Scene
│   ├── 🐼 Create Panda Scene
│   ├── 🐻 Create Bear Scene
│   └── 🦁 Create Lion Scene
└── Generate Story (Mode A full catalog)
    └── [All 230 images searchable]
```

Selecting a Mode B animal opens a seed dialog:
```html
<dialog id="seedDialog">
  <input id="seedDialogInput" maxlength="40" placeholder="Describe the scene...">
  <button>Generate</button>
</dialog>
```

Generated images in gallery receive `class="generated-badge"` for sparkle badge (✨ AI).

### Configuration

```javascript
// Cloud Function
{
  region: 'us-central1',
  timeoutSeconds: 120,       // Image generation is slow
  memory: '512MiB',          // Image processing
  secrets: ['GEMINI_API_KEY'],
  invoker: 'public'
}
```

---

## Implementation Status

### Completed (v3.0)
- ✅ **Mode A Audio Stories**: Full ninja-keys integration with current image quick access
- ✅ **Mode B Image Generation**: Whale, Panda, Bear, Lion via ninja-keys + seed dialog
- ✅ **Data Sync**: image-catalog.json ↔ image-descriptions.json (230 entries)
- ✅ **Generated Image Gallery**: Firestore `image_catalog` → merged into voting pool
- ✅ **Sparkle Badge**: `✨ AI` badge on generated images in rankings

### Remaining Gaps
| Gap | Priority | Description |
|-----|----------|-------------|
| Quota display | P2 | Show "X remaining" in UI (backend tracks, frontend doesn't display) |
| Generated image filtering | P3 | Filter rankings by original vs generated |
| Storage cleanup | P3 | TTL cleanup for expired generated images |
| Hippo animal | P3 | Exists in catalog but not in Mode B frontend |

### Future Considerations
- **Mode C (Audio Stories)**: Audio narratives for scenes (infrastructure exists)
- **Gallery Lazy Loading**: Paginate large image sets
- **Social Features**: Share generated scenes, public galleries
