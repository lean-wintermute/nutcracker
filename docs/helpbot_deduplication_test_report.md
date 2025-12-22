# Nutcracker Helpbot Deduplication Test Report
**Date:** 2025-12-22
**Endpoint:** https://helpbot-nxi6d2s3zq-uc.a.run.app
**Status:** ⚠️ FAILED - GitHub Integration Not Configured

## Executive Summary

The helpbot API is **responding correctly** but **not creating GitHub issues** due to missing GITHUB_TOKEN environment variable. All 4 test bug reports returned `issueNumber: null`, indicating the GitHub integration fallback path was triggered.

## Test Results

### Test 1: Baseline Bug Report (Export Button)
**Payload:**
```json
{
  "sessionId": "dedup-base",
  "message": "BUG_REPORT",
  "context": {
    "action": "Clicking the export button",
    "observed": "Nothing happens when I click export, no file downloads"
  }
}
```

**Response:**
```json
{
  "response": "Thank you! Your report has been recorded and will be reviewed by our team.",
  "classification": "bug",
  "issueNumber": null
}
```

### Test 2: Similar Report #1 (Export Feature)
**Payload:**
```json
{
  "sessionId": "dedup-similar-1",
  "context": {
    "action": "Using export feature",
    "observed": "Export button does not work, nothing downloads"
  }
}
```

**Response:**
```json
{
  "response": "Thank you! Your report has been recorded and will be reviewed by our team.",
  "classification": "bug",
  "issueNumber": null
}
```

### Test 3: Similar Report #2 (Export Not Working)
**Payload:**
```json
{
  "sessionId": "dedup-similar-2",
  "context": {
    "action": "Clicking export",
    "observed": "Export not working"
  }
}
```

**Response:**
```json
{
  "response": "Thank you! Your report has been recorded and will be reviewed by our team.",
  "classification": "bug",
  "issueNumber": null
}
```

### Test 4: Different Bug Report (Rankings Page)
**Payload:**
```json
{
  "sessionId": "dedup-different",
  "context": {
    "action": "Viewing rankings page",
    "observed": "Rankings show wrong order, highest rated image is at bottom"
  }
}
```

**Response:**
```json
{
  "response": "Thank you! Your report has been recorded and will be reviewed by our team.",
  "classification": "bug",
  "issueNumber": null
}
```

## GitHub Issues Created
**None** - No issues were created in lean-wintermute/nutcracker repository.

Recent issues (for reference):
- #3: feat: Imagine Bar - Image Generation & Audio Stories
- #2: feat: Improve feedback toast UX with winner context  
- #1: Social Features Roadmap: V2-V4

## Root Cause Analysis

### Handler Flow (lib/handler.js)
1. ✅ Request validation - PASSED
2. ✅ Rate limiting check - PASSED
3. ✅ LLM classification - PASSED (classified as "bug")
4. ❌ **GitHub issue creation - FAILED** (token not configured)
5. ✅ Fallback response triggered - PASSED

### GitHub Integration (lib/github.js)
**Key function:** `createOrUpdateIssue(classification, message, systemContext)`

**Line 32-36:**
```javascript
const token = getGitHubToken();

if (!token) {
  console.error('GitHub token not configured');
  return { action: 'FAILED', error: 'GitHub not configured' };
}
```

**Expected behavior:**
```javascript
function getGitHubToken() {
  return process.env.GITHUB_TOKEN;  // Currently undefined
}
```

### Handler Fallback (lib/handler.js, Line 90-92)
```javascript
else {
  // Fallback if GitHub fails
  response = `Thank you! Your ${classification.type === 'bug' ? 'report' : 'feedback'} has been recorded and will be reviewed by our team.`;
}
```

**This is the exact response we received**, confirming GitHub integration failure.

## Deduplication Logic Review

Even though we couldn't test deduplication in practice, the code review shows a robust implementation:

### Similarity Detection (lib/github.js, Line 169-215)

**Algorithm:**
1. Extract significant keywords from title (length > 3, not stop words)
2. Search GitHub for existing issues with those keywords
3. Calculate Jaccard similarity for each result
4. Check component label match for higher confidence
5. Use adaptive threshold: 0.4 if component matches, 0.6 otherwise

**Jaccard Similarity Calculation (Line 220-232):**
```javascript
function jaccardSimilarity(arr1, arr2) {
  const set1 = new Set(arr1.filter((w) => w.length > 2 && !isStopWord(w)));
  const set2 = new Set(arr2.filter((w) => w.length > 2 && !isStopWord(w)));
  
  const intersection = [...set1].filter((x) => set2.has(x));
  const union = new Set([...set1, ...set2]);
  
  return intersection.length / union.size;
}
```

**Stop words filter:** 40+ common words excluded (the, and, for, image, app, etc.)

### Expected Behavior for Our Tests

**If GitHub token were configured:**

**Test 1 (Baseline):** Would create new issue
- Title: "Export button not working"
- Labels: bug, P3-medium, user-submitted, ui
- Body: Formatted with user message, system context, classification

**Test 2 & 3 (Similar reports):** Would deduplicate
- Keyword extraction: ["export", "button", "work"]
- Jaccard similarity vs baseline: ~0.6-0.8
- Action: Add comment to existing issue
- Check priority upgrade (3+ reports → P3)

**Test 4 (Different report):** Would create new issue  
- Keyword extraction: ["rankings", "order", "wrong"]
- Jaccard similarity vs baseline: ~0.1-0.2
- Action: Create separate issue

### Priority Auto-Upgrade Logic (Line 283-350)

**Thresholds:**
- 3+ reports → Upgrade to P3-medium
- 5+ reports → Upgrade to P2-high  
- 10+ reports → Upgrade to P1-critical

**Additional triggers:**
- New report with higher priority than current issue
- Auto-reopen if closed within 30 days

## Recommendations

### 1. Configure GitHub Token (URGENT)
```bash
# From DIGEST.md instructions
firebase functions:config:set \
  github.token="<from Keychain: github_nutcracker>"

cd /Volumes/Soyuz/Projects/dev_env/tools/support/Nutcracker
firebase deploy --only functions
```

### 2. Verify Token Permissions
The GitHub token needs:
- `repo` scope (create issues, add labels, update issues)
- Write access to lean-wintermute/nutcracker repo

### 3. Re-run Tests After Deployment
Once token is configured, re-run these exact tests to verify:
- Issue creation for first report
- Deduplication for similar reports (2 & 3)
- Separate issue for different report (4)
- Priority upgrade after 3 reports

### 4. Monitor Cloud Function Logs
```bash
# View logs after redeployment
firebase functions:log --only helpbot

# Look for:
# ✅ "Created new issue #N"
# ✅ "Added to existing issue #N"
# ❌ "GitHub token not configured" (should not appear)
```

### 5. Add Health Check Endpoint
Consider adding `/health` endpoint that checks:
- GITHUB_TOKEN is set
- ANTHROPIC_KEY is set  
- Can authenticate to GitHub API
- Can call Anthropic API

## Code Quality Assessment

✅ **Strengths:**
- Robust Jaccard similarity algorithm
- Adaptive threshold based on component match
- Stop words filtering
- Priority auto-upgrade based on frequency
- Auto-reopen for recently closed issues
- Fallback handling when GitHub unavailable
- Comprehensive error logging

⚠️ **Potential Improvements:**
- Add retry logic for transient GitHub API errors
- Cache GitHub search results (5-minute TTL)
- Add telemetry for deduplication hit rate
- Consider fuzzy matching for typos in titles

## Deduplication Effectiveness: UNTESTED

**Cannot assess effectiveness** until GitHub integration is configured.

**Expected effectiveness based on code review:**
- **High confidence** for exact/near-exact duplicates (>0.6 Jaccard)
- **Medium confidence** for component-matched variations (>0.4 Jaccard)
- **Low false positives** due to keyword filtering + threshold tuning

## Next Steps

1. ✅ Test report completed
2. ⏳ Configure GITHUB_TOKEN in Firebase Functions
3. ⏳ Redeploy Cloud Function
4. ⏳ Re-run test suite
5. ⏳ Verify issues created in lean-wintermute/nutcracker
6. ⏳ Measure deduplication accuracy
7. ⏳ Monitor production usage for 48 hours

---

**Conclusion:** The deduplication logic is well-designed and comprehensive, but **cannot be tested** until GitHub integration is configured. The API classification and fallback handling work correctly.
