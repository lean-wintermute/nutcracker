# ADR-002: Post-Audit Enhancements

**Status**: Accepted
**Date**: 2025-12-22
**Deciders**: Development Team (5 parallel SDE agents)

## Context

Following the comprehensive audit (ADR-001), additional enhancements were identified to improve user experience and production readiness.

## Decision

Implement five enhancements in parallel:

1. PWA Support
2. Image Dimension Attributes
3. Feedback State Validation Hardening
4. Light/Dark Mode Toggle
5. Undo Last Vote Feature

## Implementation Summary

### 1. PWA Support (Offline Capability)

**Files Created**:
- `manifest.json` - PWA manifest with app metadata
- `sw.js` - Service worker with cache-first strategy

**Key Details**:
- Cache versioning: `nutcracker-v1`
- Caches all 96 images for offline use
- Network-first for future Firebase API calls
- Graceful degradation when served from `file://`
- CSP updated with `worker-src 'self'`

**Manifest Properties**:
```json
{
  "name": "Nutcracker Bear Ranker",
  "short_name": "Nutcracker",
  "display": "standalone",
  "theme_color": "#1a1a2e"
}
```

### 2. Image Dimension Attributes (Layout Stability)

**Image Dimensions**: 1408 x 768 pixels (all 96 images consistent)

**Changes**:
- Added `width="1408" height="768"` to all `<img>` elements
- Added `aspect-ratio: 1408 / 768` CSS to card images, rankings, lightbox
- Added `background: var(--color-bg-alt)` as placeholder color

**Benefit**: Eliminates Cumulative Layout Shift (CLS)

### 3. Feedback State Validation Hardening

**Before**: Basic try/catch with no structural validation

**After**:
```javascript
isValidTagsData(data)      // Object with string[] values
isValidSuggestionsData(data)  // Array of {text: string, timestamp: number}
```

**Defensive Measures**:
- Separate try/catch for tags and suggestions
- Removes corrupted localStorage keys
- Resets to defaults on invalid data

### 4. Light/Dark Mode Toggle

**CSS Variables** (Light Mode):
```css
--color-bg: #f5f5f7;
--color-text: #1d1d1f;
--color-text-muted: #515154;  /* 4.6:1 contrast */
--color-accent: #d63b4f;      /* Darker for light bg */
```

**Implementation**:
- FOUC prevention via inline script in `<head>`
- System preference detection (`prefers-color-scheme`)
- Manual override stored in `nutcracker_theme`
- Theme toggle button in header (sun/moon icons)
- Updates `theme-color` meta tag dynamically

**WCAG Compliance**: All text meets 4.5:1 contrast in both modes

### 5. Undo Last Vote Feature

**State Tracking**:
- Single undo level (not full history)
- Stores: winnerId, loserId, previous Elo ratings, last pair
- Auto-expires after 30 seconds

**UI**:
- Toast notification with "Undo" button
- 8-second auto-dismiss with visual timer
- Keyboard shortcuts: `Z` key, `Ctrl+Z` / `Cmd+Z`

**Accessibility**:
- `role="status"` and `aria-live="polite"` on toast
- Screen reader announcements for undo availability and completion
- 44px touch target on undo button

## Consequences

### Positive
- Installable as PWA on mobile/desktop
- Full offline functionality
- Improved CLS scores
- User choice of light/dark theme
- Ability to correct mis-clicks
- More robust error handling

### Negative
- Additional files to maintain (manifest.json, sw.js)
- Service worker cache management complexity
- Slightly larger HTML file (~2700 lines)

### Risks
- PWA icons use existing bear image (not properly sized 192x192/512x512)
- Service worker versioning requires manual increment

## Testing Checklist

- [ ] PWA install prompt appears when served over HTTPS
- [ ] Offline mode works after initial cache
- [ ] Theme toggle persists across sessions
- [ ] System theme changes detected when no manual preference
- [ ] Undo restores correct Elo ratings
- [ ] Undo expires after 30 seconds
- [ ] Light mode meets WCAG contrast requirements
- [ ] No layout shift during image loading

## References

- [ADR-001](./001-comprehensive-audit-fixes.md) - Comprehensive audit fixes
- [Web App Manifest](https://web.dev/add-manifest/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)
