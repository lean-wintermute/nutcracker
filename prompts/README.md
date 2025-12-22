# Nutcracker Prompts Queue

This directory contains scene suggestions submitted by users through the Nutcracker app for human review before being used as prompts for nano-bananas image generation.

## Workflow

1. **Collection**: User suggestions are submitted via the app footer and stored in Firebase (`suggestions` collection)
2. **Sync to GitHub**: Run sync script to create GitHub Issues on `lean-wintermute/nutcracker`
3. **Review**: Review and triage issues on GitHub (labels: `scene-suggestion`, `user-submitted`)
4. **Approve**: Close issues with approved prompts, add to `approved.json`
5. **Generation**: nano-bananas uses approved prompts for new image generation

## Files

- `pending.json` - Raw suggestions exported from Firebase (legacy)
- `approved.json` - Human-approved prompts ready for image generation
- `synced-to-github.json` - Tracks which Firebase suggestions have been synced to GitHub Issues

## Scripts

### Sync to GitHub Issues (Recommended)

```bash
cd tools/support/Nutcracker

# Dry run - see what would be created
node scripts/sync-suggestions-github.js --dry-run

# Create issues
node scripts/sync-suggestions-github.js
```

This creates GitHub Issues with labels:
- `scene-suggestion` - User-submitted story scene idea
- `user-submitted` - Submitted by app users

### Export to Local JSON (Legacy)

```bash
node scripts/export-suggestions.js
```

## Suggestion Format

```json
{
  "id": "firebase-doc-id",
  "text": "Scene description from user",
  "timestamp": "2025-12-22T10:30:00Z",
  "visitorId": "anonymous-user-id",
  "status": "pending|approved|rejected",
  "reviewedAt": null,
  "reviewNotes": null
}
```

## Review Guidelines

When reviewing suggestions, consider:
- Is the scene description clear and specific?
- Does it fit the Christmas/holiday theme?
- Is it appropriate for all audiences?
- Is it feasible to generate with current image models?
- Does it add variety to the existing image set?

## Integration with nano-bananas

Approved prompts in `approved.json` can be used directly as input for nano-bananas:

```bash
nano-bananas generate --prompts prompts/approved.json --style christmas-whale
```
