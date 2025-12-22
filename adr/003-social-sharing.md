# ADR-003: Social Sharing Features

## Status
Proposed (V1 implemented, V1.1+ pending)

## Context
Nutcracker is a PWA for Elo-based image ranking. Users vote on pairs of holiday-themed images, building personal rankings that can be compared against global community rankings via Firebase.

Social sharing features would increase engagement and viral growth potential.

## V1 Implementation (Complete)

### 1. Open Graph Meta Tags
Added to `<head>` for link preview support across all social platforms:
- `og:title`, `og:description`, `og:image`, `og:url`, `og:type`
- `twitter:card` for Twitter/X large image cards

### 2. Share Button
Added to rankings header with:
- Web Share API (mobile/supported browsers)
- Clipboard fallback (desktop)
- Visual feedback on success

---

## Remaining Social Features Proposal

### V1.1: Compare With Global (Medium Effort, ~2 hours)

**Goal:** Show users how their personal rankings compare to global rankings.

**Implementation:**
1. Modify `renderPersonalLeaderboard()` to be async
2. Fetch global rankings via `getGlobalRankings()` when showing personal view
3. Build a rank lookup map: `{ imageId: globalRankPosition }`
4. Pass comparison data to `renderRankingsGrid()`
5. Add comparison badge to each rank card: "You: #3 → Global: #47"
6. Add summary stats at top: "Your taste aligns 73% with the crowd"

**UI Addition:**
```html
<div class="rank-comparison">
  #3 → #47 global
</div>
```

**New CSS required:** ~20 lines for comparison badge styling

---

### V2: Per-Image Sharing (Medium Effort, ~3 hours)

**Goal:** Let users share individual favorite images with their rank context.

**Implementation:**
1. Add share button to rank card actions (alongside view/download)
2. Add share button to lightbox
3. Share data includes:
   - Image URL (for Pinterest `media` param)
   - Text: "My #3 pick in Christmas Stories (Global #47)"
   - URL: `https://lean-wintermute.github.io/nutcracker/?img=IMAGE_ID`
4. Web Share API with file support on mobile
5. Desktop: show share menu modal with platform buttons

**Platform URLs:**
```javascript
const SHARE_URLS = {
  twitter: (url, text) => `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(text)}`,
  facebook: (url) => `https://facebook.com/sharer/sharer.php?u=${enc(url)}`,
  linkedin: (url) => `https://linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
  pinterest: (url, img, desc) => `https://pinterest.com/pin/create/button/?url=${enc(url)}&media=${enc(img)}&description=${enc(desc)}`,
  whatsapp: (url, text) => `https://api.whatsapp.com/send?text=${enc(text + ' ' + url)}`,
  reddit: (url, title) => `https://reddit.com/submit?url=${enc(url)}&title=${enc(title)}`
};
```

**Note:** Facebook, LinkedIn, Twitter, WhatsApp ignore custom parameters - they use OG tags from the shared URL. Only Pinterest supports direct image URL via `media` param.

---

### V3: Canvas Leaderboard Export (Medium Effort, ~4 hours)

**Goal:** Generate a shareable image of user's top 10 rankings.

**Implementation:**
1. Create canvas (1200x630 - OG standard size)
2. Render:
   - App branding/title
   - Top 10 images in grid (2 rows x 5)
   - Rank badges with Elo scores
   - Footer: URL + vote count
3. Export via `canvas.toBlob()`
4. Share via Web Share API with files, or download

**Considerations:**
- All images must be same-origin (they are: `./images/`)
- Canvas rendering is synchronous - may block briefly
- File size ~200-400KB for PNG

---

### V4: Shareable Ranking Snapshots (Higher Effort, ~6 hours)

**Goal:** "Share my rankings" link that others can view.

**Implementation:**
1. New Firestore collection: `ranking_snapshots`
   ```javascript
   {
     visitorId: string,
     rankings: [{ imageId, elo, rank }], // top 20
     totalVotes: number,
     createdAt: Timestamp,
     expiresAt: Timestamp // 30 days
   }
   ```
2. Update `firestore.rules`:
   ```
   match /ranking_snapshots/{snapshotId} {
     allow create: if request.auth != null;
     allow read: if true;
   }
   ```
3. "Share Rankings" button creates snapshot, returns ID
4. URL format: `?view=SNAPSHOT_ID`
5. App detects `?view=` param on load
6. Fetch snapshot, render read-only view with banner:
   "Viewing [Anonymous]'s Rankings • [See Yours]"

**Storage consideration:** ~500 bytes per snapshot. At scale, consider TTL cleanup via Cloud Functions.

---

## Platform Behavior Summary

| Platform | Image in Share? | How |
|----------|----------------|-----|
| Native iOS/Android | Yes | Web Share API with files |
| Twitter/X | No | OG tags from URL |
| Facebook | No | OG tags from URL |
| LinkedIn | No | OG tags from URL |
| Pinterest | Yes | `media` URL param |
| WhatsApp | No | OG tags from URL |
| Reddit | No | OG tags from URL |

**Key insight:** Most platforms pull preview from OG tags, so the static OG image we set is what users will see. Dynamic per-image previews would require server-side rendering (Cloudflare Workers, Firebase Functions, etc.).

---

## Priority Recommendation

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| V1.1 Compare With Global | 2h | High engagement | 1 |
| V2 Per-Image Share | 3h | Viral potential | 2 |
| V3 Canvas Export | 4h | Social sharing | 3 |
| V4 Ranking Snapshots | 6h | Deep engagement | 4 |

---

## Decision

Implemented V1 (OG tags + basic share button). Remaining features proposed for future iterations based on user feedback and engagement metrics.

## Date
2025-12-22
