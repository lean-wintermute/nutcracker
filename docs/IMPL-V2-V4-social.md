# Implementation Plan: V2-V4 Social Features

## Overview

| Version | Feature | Effort | Dependencies |
|---------|---------|--------|--------------|
| V2 | Per-Image Sharing | 3h | V1 (OG tags) |
| V3 | Canvas Leaderboard Export | 4h | None |
| V4 | Shareable Ranking Snapshots | 6h | Firebase |

---

## V2: Per-Image Sharing (3 hours)

### Goal
Let users share individual favorite images with rank context to social platforms.

### Components

#### 2.1 Share Button on Rank Cards

**Location:** `renderRankingsGrid()` in rank-card-actions div

```javascript
// Add share button alongside view/download buttons
<button class="rank-action rank-action--share"
        data-id="${escapeHtml(img.id)}"
        data-rank="${i + 1}"
        data-name="${escapeHtml(img.name)}"
        data-src="${escapeHtml(img.src)}"
        aria-label="Share image" title="Share">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
    </svg>
</button>
```

#### 2.2 Share Button in Lightbox

**Location:** `lightbox-actions` div, add button next to download

```html
<button id="lightboxShare" class="lightbox-btn">
    <svg><!-- share icon --></svg>
    Share
</button>
```

#### 2.3 Share Menu Modal (Desktop Fallback)

```html
<dialog class="share-menu" id="shareMenu">
    <div class="share-menu-content">
        <div class="share-menu-header">
            <h3>Share Image</h3>
            <button class="share-menu-close" aria-label="Close">&times;</button>
        </div>
        <div class="share-menu-preview">
            <img id="sharePreviewImg" src="" alt="">
            <div id="sharePreviewText"></div>
        </div>
        <div class="share-options">
            <button class="share-option" data-platform="twitter">
                <svg><!-- Twitter icon --></svg> Twitter
            </button>
            <button class="share-option" data-platform="facebook">
                <svg><!-- Facebook icon --></svg> Facebook
            </button>
            <button class="share-option" data-platform="pinterest">
                <svg><!-- Pinterest icon --></svg> Pinterest
            </button>
            <button class="share-option" data-platform="linkedin">
                <svg><!-- LinkedIn icon --></svg> LinkedIn
            </button>
            <button class="share-option" data-platform="whatsapp">
                <svg><!-- WhatsApp icon --></svg> WhatsApp
            </button>
            <button class="share-option" data-platform="copy">
                <svg><!-- Copy icon --></svg> Copy Link
            </button>
        </div>
    </div>
</dialog>
```

#### 2.4 Platform Share URLs

```javascript
const SHARE_PLATFORMS = {
    twitter: (url, text) =>
        `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,

    facebook: (url) =>
        `https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,

    pinterest: (url, imgUrl, desc) =>
        `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(imgUrl)}&description=${encodeURIComponent(desc)}`,

    linkedin: (url) =>
        `https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,

    whatsapp: (url, text) =>
        `https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`,
};
```

#### 2.5 Share Handler Logic

```javascript
async function shareImage(imageId, rank, imageSrc, imageName, globalRank = null) {
    const baseUrl = location.href.split('?')[0];
    const shareUrl = `${baseUrl}?img=${imageId}`;
    const rankText = globalRank ? `#${rank} (Global #${globalRank})` : `#${rank}`;
    const shareText = `My ${rankText} pick: ${imageName}`;

    // Try Web Share API first (mobile)
    if (navigator.share) {
        try {
            // Try sharing with file
            const response = await fetch(imageSrc);
            const blob = await response.blob();
            const file = new File([blob], `${imageId}.png`, { type: 'image/png' });

            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    title: 'Christmas Stories',
                    text: shareText,
                    url: shareUrl,
                    files: [file]
                });
                return;
            }
        } catch (e) {
            // Fall through to URL-only
        }

        // URL-only share
        try {
            await navigator.share({ title: 'Christmas Stories', text: shareText, url: shareUrl });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return; // User cancelled
        }
    }

    // Desktop fallback: show share menu
    showShareMenu(shareUrl, shareText, imageSrc, imageName, rank);
}

function showShareMenu(url, text, imgSrc, imgName, rank) {
    const menu = document.getElementById('shareMenu');
    document.getElementById('sharePreviewImg').src = imgSrc;
    document.getElementById('sharePreviewText').textContent = `#${rank}: ${imgName}`;

    // Set up platform buttons
    menu.querySelectorAll('.share-option').forEach(btn => {
        btn.onclick = () => {
            const platform = btn.dataset.platform;
            if (platform === 'copy') {
                navigator.clipboard.writeText(url);
                announce('Link copied!');
            } else if (platform === 'pinterest') {
                // Pinterest supports direct image URL
                const fullImgUrl = new URL(imgSrc, location.href).href;
                window.open(SHARE_PLATFORMS.pinterest(url, fullImgUrl, text), '_blank');
            } else {
                window.open(SHARE_PLATFORMS[platform](url, text), '_blank');
            }
            menu.close();
        };
    });

    menu.showModal();
}
```

#### 2.6 CSS for Share Menu (~100 lines)

```css
.share-menu {
    /* Dialog styles */
    max-width: 400px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    padding: 0;
}

.share-menu::backdrop {
    background: rgba(0, 0, 0, 0.7);
}

.share-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
}

.share-menu-preview {
    padding: 16px;
    text-align: center;
}

.share-menu-preview img {
    max-width: 200px;
    border-radius: var(--radius-sm);
}

.share-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding: 16px;
}

.share-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.2s;
}

.share-option:hover {
    border-color: var(--color-accent);
    background: rgba(245, 87, 108, 0.1);
}
```

### Files Modified
- `index.html` - JS logic, HTML, CSS

---

## V3: Canvas Leaderboard Export (4 hours)

### Goal
Generate a shareable PNG image of user's top 10 rankings.

### Components

#### 3.1 "Export as Image" Button

Add to rankings header actions:
```javascript
<button class="share-btn" id="exportImageBtn" aria-label="Export as image" title="Export as image">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
    </svg>
</button>
```

#### 3.2 Canvas Generation Function

```javascript
async function generateLeaderboardImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 630);

    // Title
    ctx.fillStyle = '#f5576c';
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Christmas Stories', 40, 50);

    ctx.fillStyle = '#e0e0e0';
    ctx.font = '20px -apple-system, sans-serif';
    ctx.fillText('My Top 10', 1050, 50);

    // Get top 10
    const sorted = getSortedRankings().slice(0, 10);

    // Layout: 5 columns, 2 rows
    const imgWidth = 200;
    const imgHeight = 109; // 1408/768 aspect ratio
    const gapX = 20;
    const gapY = 40;
    const startX = 40;
    const startY = 80;

    // Load all images first
    const loadedImages = await Promise.all(
        sorted.map(img => loadImageAsync(img.src))
    );

    // Draw images with badges
    for (let i = 0; i < 10; i++) {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const x = startX + col * (imgWidth + gapX);
        const y = startY + row * (imgHeight + gapY + 30);

        // Draw image
        if (loadedImages[i]) {
            ctx.drawImage(loadedImages[i], x, y, imgWidth, imgHeight);
        } else {
            ctx.fillStyle = '#333';
            ctx.fillRect(x, y, imgWidth, imgHeight);
        }

        // Rank badge
        ctx.fillStyle = i === 0 ? '#f5af19' : i === 1 ? '#bdc3c7' : i === 2 ? '#cd7f32' : '#444';
        ctx.beginPath();
        ctx.arc(x + 18, y + 18, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}`, x + 18, y + 22);

        // Elo score below
        ctx.fillStyle = '#f5576c';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(sorted[i].elo.toString(), x + imgWidth / 2, y + imgHeight + 20);
    }

    // Footer
    ctx.fillStyle = '#9a9a9a';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
        `lean-wintermute.github.io/nutcracker • ${state.matches.length} votes`,
        40, 600
    );

    return canvas;
}

function loadImageAsync(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function getSortedRankings() {
    return images
        .map(img => ({
            ...img,
            elo: state.ratings[img.id] || DEFAULT_ELO
        }))
        .sort((a, b) => b.elo - a.elo);
}
```

#### 3.3 Export/Share Handler

```javascript
async function exportLeaderboardImage() {
    const btn = document.getElementById('exportImageBtn');
    btn.disabled = true;
    announce('Generating image...');

    try {
        const canvas = await generateLeaderboardImage();

        canvas.toBlob(async (blob) => {
            const file = new File([blob], 'my-rankings.png', { type: 'image/png' });

            // Try Web Share API with file
            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                try {
                    await navigator.share({
                        title: 'My Christmas Stories Rankings',
                        text: `My top 10 picks from ${state.matches.length} votes!`,
                        files: [file]
                    });
                    btn.disabled = false;
                    return;
                } catch (e) {
                    if (e.name === 'AbortError') {
                        btn.disabled = false;
                        return;
                    }
                }
            }

            // Fallback: download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `christmas-stories-rankings-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
            announce('Image downloaded!');
            btn.disabled = false;
        }, 'image/png');
    } catch (e) {
        console.error('Failed to generate image:', e);
        announce('Failed to generate image');
        btn.disabled = false;
    }
}
```

### Files Modified
- `index.html` - JS logic, button HTML

---

## V4: Shareable Ranking Snapshots (6 hours)

### Goal
Generate shareable links where others can view a user's rankings.

### Components

#### 4.1 Firestore Collection Schema

```javascript
// Collection: ranking_snapshots
{
    visitorId: string,           // Firebase UID
    rankings: [                  // Top 20
        { imageId: string, elo: number, rank: number }
    ],
    totalVotes: number,
    createdAt: Timestamp,
    expiresAt: Timestamp         // 30 days later
}
```

#### 4.2 Firestore Rules Addition

```
match /ranking_snapshots/{snapshotId} {
    allow create: if request.auth != null
        && request.resource.data.visitorId == request.auth.uid
        && request.resource.data.rankings.size() <= 20;
    allow read: if true;
}
```

#### 4.3 Create Snapshot Function

```javascript
async function createRankingSnapshot() {
    if (!window.firebaseAPI?.isReady()) {
        announce('Sign in required to share rankings');
        return null;
    }

    const sorted = getSortedRankings().slice(0, 20);
    const rankings = sorted.map((img, idx) => ({
        imageId: img.id,
        elo: img.elo,
        rank: idx + 1
    }));

    try {
        const docRef = await addDoc(collection(db, 'ranking_snapshots'), {
            visitorId: window.firebaseAPI.getVisitorId(),
            rankings,
            totalVotes: state.matches.length,
            createdAt: serverTimestamp(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });

        return docRef.id;
    } catch (e) {
        console.error('Failed to create snapshot:', e);
        return null;
    }
}
```

#### 4.4 "Share My Rankings" Button Handler

```javascript
async function shareMyRankings() {
    const btn = document.getElementById('shareRankingsBtn');
    btn.disabled = true;

    const snapshotId = await createRankingSnapshot();
    if (!snapshotId) {
        btn.disabled = false;
        return;
    }

    const shareUrl = `${location.href.split('?')[0]}?view=${snapshotId}`;
    const shareText = `Check out my Christmas Stories rankings (${state.matches.length} votes)!`;

    if (navigator.share) {
        try {
            await navigator.share({ title: 'My Rankings', text: shareText, url: shareUrl });
        } catch (e) {
            if (e.name !== 'AbortError') {
                await navigator.clipboard.writeText(shareUrl);
                announce('Link copied!');
            }
        }
    } else {
        await navigator.clipboard.writeText(shareUrl);
        announce('Link copied!');
    }

    btn.disabled = false;
}
```

#### 4.5 URL Parameter Detection on Load

```javascript
// Add to init section
function checkUrlParams() {
    const params = new URLSearchParams(location.search);

    // View someone's rankings
    const viewId = params.get('view');
    if (viewId) {
        loadSharedRankings(viewId);
        return true;
    }

    // Highlight specific image
    const imgId = params.get('img');
    if (imgId) {
        // Switch to rankings, scroll to image
        document.querySelector('[data-view="leaderboard"]').click();
        setTimeout(() => scrollToImage(imgId), 500);
    }

    return false;
}
```

#### 4.6 Load Shared Rankings View

```javascript
async function loadSharedRankings(snapshotId) {
    // Show loading
    const container = document.getElementById('leaderboard-panel');
    container.innerHTML = '<div class="global-loading"><div>Loading shared rankings...</div></div>';

    // Switch to rankings tab
    document.querySelector('[data-view="leaderboard"]').click();

    try {
        const docRef = doc(db, 'ranking_snapshots', snapshotId);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            container.innerHTML = '<div class="error-message">Rankings not found or expired</div>';
            return;
        }

        const data = snapshot.data();

        // Show banner
        container.innerHTML = `
            <div class="shared-rankings-banner">
                <span>Viewing someone's rankings (${data.totalVotes} votes)</span>
                <button class="btn btn--small" onclick="location.href=location.pathname">
                    See Yours
                </button>
            </div>
        `;

        // Build sorted array from snapshot
        const sorted = data.rankings.map(r => {
            const img = images.find(i => i.id === r.imageId);
            return {
                ...img,
                elo: r.elo,
                rank: r.rank
            };
        }).filter(Boolean);

        // Render read-only grid
        renderRankingsGrid(container, sorted, data.totalVotes, null, true /* readOnly */);

    } catch (e) {
        console.error('Failed to load shared rankings:', e);
        container.innerHTML = '<div class="error-message">Failed to load rankings</div>';
    }
}
```

#### 4.7 CSS for Shared View Banner

```css
.shared-rankings-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    margin-bottom: 16px;
    background: linear-gradient(90deg, var(--color-accent-alt), var(--color-accent));
    border-radius: var(--radius-sm);
    color: white;
}

.shared-rankings-banner .btn {
    background: white;
    color: var(--color-accent);
    border-color: white;
}
```

### Files Modified
- `index.html` - JS logic, HTML, CSS
- `firestore.rules` - New collection rules

---

## Dependency Graph

```
V1 (OG Tags + Share Button) ✅
    │
    ├── V1.1 (Compare With Global)
    │
    ├── V2 (Per-Image Sharing)
    │       │
    │       └── V3 (Canvas Export) [optional dependency]
    │
    └── V4 (Ranking Snapshots)
```

## Testing Notes

- Test Web Share API on iOS Safari, Android Chrome
- Test clipboard fallback on desktop browsers
- Test Pinterest share (only platform accepting image URL)
- Test canvas generation with 10+ votes
- Test snapshot URL sharing and loading
- Test expired/invalid snapshot handling
