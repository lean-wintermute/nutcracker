# Implementation Plan: V1.1 Compare With Global

## Goal
Show users how their personal rankings compare to global community rankings with visual badges and summary stats.

## Estimated Effort
2 hours

## Changes Required

### 1. Modify `renderPersonalLeaderboard()` (index.html ~line 1816)

**Current:** Synchronous, only uses local data
**New:** Async, fetches global data for comparison

```javascript
// BEFORE
function renderPersonalLeaderboard(container) {
    const stats = {};
    // ... compute local stats
    const sorted = images.map(...).sort(...);
    renderRankingsGrid(container, sorted, state.matches.length);
}

// AFTER
async function renderPersonalLeaderboard(container) {
    // Show loading indicator briefly
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'global-loading';
    loadingDiv.innerHTML = '<div>Loading comparison data...</div>';
    container.appendChild(loadingDiv);

    // Compute local stats
    const stats = {};
    images.forEach(img => { stats[img.id] = { wins: 0, losses: 0 }; });
    state.matches.forEach(m => {
        if (stats[m.winner]) stats[m.winner].wins++;
        if (stats[m.loser]) stats[m.loser].losses++;
    });

    const sorted = images
        .map(img => ({
            ...img,
            elo: state.ratings[img.id] || DEFAULT_ELO,
            wins: stats[img.id]?.wins || 0,
            losses: stats[img.id]?.losses || 0
        }))
        .sort((a, b) => b.elo - a.elo);

    // Fetch global rankings for comparison (uses 15-min cache)
    let globalRankMap = null;
    let alignmentStats = null;

    if (window.firebaseAPI?.getGlobalRankings) {
        try {
            const globalData = await window.firebaseAPI.getGlobalRankings(images);
            if (globalData && !globalData.error) {
                // Build rank lookup map
                const globalSorted = images
                    .map(img => ({ id: img.id, elo: globalData.ratings[img.id] || 1500 }))
                    .sort((a, b) => b.elo - a.elo);

                globalRankMap = {};
                globalSorted.forEach((img, idx) => {
                    globalRankMap[img.id] = idx + 1;
                });

                // Calculate alignment stats
                alignmentStats = calculateAlignment(sorted, globalSorted, globalData);
            }
        } catch (e) {
            console.warn('Failed to fetch global comparison:', e);
        }
    }

    loadingDiv.remove();

    // Show alignment summary if available
    if (alignmentStats) {
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'alignment-summary';
        summaryDiv.innerHTML = `
            <span class="alignment-score">${alignmentStats.overlap}% match</span>
            <span class="alignment-detail">with community taste</span>
        `;
        container.appendChild(summaryDiv);
    }

    renderRankingsGrid(container, sorted, state.matches.length, globalRankMap);
}
```

### 2. Add `calculateAlignment()` function

```javascript
function calculateAlignment(localSorted, globalSorted, globalData) {
    const localTop20 = localSorted.slice(0, 20).map(i => i.id);
    const globalTop20 = globalSorted.slice(0, 20).map(i => i.id);
    const overlap = localTop20.filter(id => globalTop20.includes(id)).length;

    return {
        overlap: Math.round((overlap / 20) * 100),
        yourTop1GlobalRank: globalSorted.findIndex(g => g.id === localSorted[0]?.id) + 1,
        totalVoters: globalData.uniqueVoters,
        totalVotes: globalData.totalVotes
    };
}
```

### 3. Modify `renderRankingsGrid()` signature (line ~1892)

**Current:** `function renderRankingsGrid(container, sorted, totalVotes)`
**New:** `function renderRankingsGrid(container, sorted, totalVotes, globalRankMap = null)`

### 4. Add comparison badge to rank card HTML (inside `renderRankingsGrid`)

```javascript
// Inside the card.innerHTML template, after rank-card-footer:
const globalRank = globalRankMap?.[img.id];
const comparisonHtml = globalRankMap && globalRank
    ? `<div class="rank-comparison" title="Your rank vs global">
         #${i + 1} → #${globalRank}
       </div>`
    : '';

// Add to card HTML after rank-card-footer div
card.innerHTML = `
    ...existing content...
    ${comparisonHtml}
`;
```

### 5. Add CSS for comparison elements (~line 620)

```css
/* Alignment summary at top of personal rankings */
.alignment-summary {
    text-align: center;
    padding: 12px 16px;
    margin-bottom: 16px;
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
}

.alignment-score {
    font-size: 1.2rem;
    font-weight: bold;
    color: var(--color-accent);
}

.alignment-detail {
    font-size: 0.85rem;
    color: var(--color-text-muted);
    margin-left: 8px;
}

/* Comparison badge on rank cards */
.rank-comparison {
    position: absolute;
    bottom: 44px;
    right: 8px;
    font-size: 0.65rem;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    padding: 3px 8px;
    border-radius: 10px;
    color: var(--color-text-muted);
}

.rank-comparison::before {
    content: "vs global ";
    opacity: 0.7;
}
```

### 6. Update caller in `renderLeaderboard()` (line ~1810)

```javascript
// BEFORE
if (mode === 'global') {
    renderGlobalLeaderboard(container);
} else {
    renderPersonalLeaderboard(container);
}

// AFTER
if (mode === 'global') {
    renderGlobalLeaderboard(container);
} else {
    renderPersonalLeaderboard(container); // Now async but fire-and-forget is fine
}
```

## Testing Checklist

- [ ] Personal rankings load with comparison badges
- [ ] Alignment summary shows correct percentage
- [ ] Global rankings view still works (unchanged)
- [ ] Graceful degradation when Firebase unavailable
- [ ] Loading state appears briefly
- [ ] Mobile layout not broken by new elements

## Files Modified

1. `index.html` - JS logic + CSS
