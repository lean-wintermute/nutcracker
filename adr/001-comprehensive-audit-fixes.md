# ADR-001: Comprehensive Audit Fixes

**Status**: Accepted
**Date**: 2025-12-22
**Deciders**: Development Team

## Context

Nutcracker underwent a comprehensive audit by 4 parallel SDE agents covering:
- Functionality
- Security
- Mobile Support
- Accessibility (WCAG 2.1 AA)

This ADR documents the findings and accepted fixes.

## Decision

Implement all identified fixes organized by priority.

## Findings Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Functionality | 0 | 0 | 4 | 4 |
| Security | 0 | 0 | 1 | 3 |
| Mobile | 0 | 2 | 5 | 8 |
| Accessibility | 0 | 0 | 4 | 4 |

## Accepted Fixes

### Accessibility (WCAG 2.1 AA)

#### A1. Color Contrast Failures
**Issue**: Text colors `#888` and `#666` fail 4.5:1 contrast ratio.
**Fix**: Update CSS variables:
```css
--color-text-muted: #a0a0a0;  /* Was #888, now 5.3:1 */
--color-text-dim: #9a9a9a;    /* Was #666, now 4.6:1 */
```

#### A2. Touch Target Sizes
**Issue**: `.btn--small` (40px) and `.link-btn` (no minimum) fail 44px requirement.
**Fix**: Increase padding and add minimum heights.

#### A3. Empty Alt Text on Load
**Issue**: Arena images have empty `alt=""` before JS populates them.
**Fix**: Add default alt text: `alt="Loading comparison image..."`

#### A4. ARIA Improvements
- Add `role="group"` to stats div for `aria-label` validity
- Add `aria-label` to timer bar progressbar
- Add `hidden` attribute to inactive tabpanel
- Implement proper tab keyboard navigation (arrow keys)

### Functionality

#### F1. Timer Bar Resume Bug
**Issue**: Animation keyframes override width on resume, causing visual glitch.
**Fix**: Use negative animation-delay instead of setting width.

#### F2. Leaderboard Performance
**Issue**: O(n*m) complexity computing win/loss (96 images × 10k matches).
**Fix**: Pre-compute counts in single O(n+m) pass.

#### F3. Duplicate Vote Function
**Issue**: Original `vote()` function exists but is completely overridden.
**Fix**: Remove original, keep only enhanced version.

#### F4. Image Error Handlers
**Issue**: No fallback if images fail to load.
**Fix**: Add `onerror` handlers with alt text update.

### Mobile

#### M1. Missing Breakpoints
**Issue**: No 480px breakpoint (common small phone width).
**Fix**: Add responsive rules for 480px.

#### M2. Landscape Support
**Issue**: No landscape-specific styling.
**Fix**: Add `@media (max-height: 500px) and (orientation: landscape)` rules.

#### M3. Overscroll Behavior
**Issue**: Pull-to-refresh may interfere with swipe gestures.
**Fix**: Add `overscroll-behavior-y: contain` to body.

#### M4. Touch Callout
**Issue**: Long-press on images shows system callout.
**Fix**: Add `-webkit-touch-callout: none` to card images.

#### M5. Keyboard Hints
**Issue**: Keyboard shortcuts shown on touch-only devices.
**Fix**: Hide `.skip-hint` when `(hover: none) and (pointer: coarse)`.

### Rankings View/Download

#### R1. Separate View and Download Actions
**Issue**: Current implementation combines view+download in one link.
**Fix**:
- Click image → opens in new tab (view)
- Download button → triggers download
- Right-click → native browser context menu

### Security

#### S1. Console Logging
**Issue**: Visitor ID partially logged to console.
**Fix**: Remove `console.log` for visitor ID.

#### S2. CSP Enhancement
**Issue**: Missing `frame-ancestors` directive.
**Fix**: Add `frame-ancestors 'none'` to prevent clickjacking.

#### S3. Feedback State Validation
**Issue**: Weaker validation than main state on localStorage load.
**Fix**: Add type checking for tags array and suggestions structure.

## Implementation Plan

1. **Phase 1**: Accessibility fixes (critical for compliance)
2. **Phase 2**: Functionality fixes (user experience)
3. **Phase 3**: Mobile fixes (device support)
4. **Phase 4**: Rankings enhancement (feature completion)
5. **Phase 5**: Security hardening (defense in depth)

## Testing Requirements

After implementation:
- [ ] Automated: HTML validation, CSP check
- [ ] Manual: Keyboard-only navigation test
- [ ] Manual: VoiceOver/NVDA screen reader test
- [ ] Manual: Mobile touch interaction test (iOS Safari, Chrome Android)
- [ ] Manual: Color contrast verification (WebAIM checker)
- [ ] Manual: Rankings view/download on desktop and mobile

## Consequences

### Positive
- WCAG 2.1 AA compliance achieved
- Improved mobile user experience
- Better performance on large datasets
- Cleaner, more maintainable code

### Negative
- Slightly increased CSS file size (~2KB)
- More complex rankings UI

### Risks
- Color changes may affect visual design consistency
- Need to verify contrast on all UI states (hover, focus, etc.)

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices - Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
