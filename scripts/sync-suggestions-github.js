#!/usr/bin/env node
/**
 * Sync suggestions from Firebase to GitHub Issues on nutcracker repo.
 *
 * Usage:
 *   node scripts/sync-suggestions-github.js
 *   node scripts/sync-suggestions-github.js --dry-run
 *
 * Requirements:
 *   - Firebase Admin SDK credentials (service account JSON)
 *   - Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 *   - GitHub CLI (gh) authenticated with repo access
 *
 * Labels used:
 *   - scene-suggestion: User-submitted story scene idea
 *   - user-submitted: Submitted by app users
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Configuration
const GITHUB_REPO = 'lean-wintermute/nutcracker';
const SYNCED_FILE = path.join(__dirname, '..', 'prompts', 'synced-to-github.json');
const DRY_RUN = process.argv.includes('--dry-run');

// Firebase Admin SDK
let admin;
try {
    admin = require('firebase-admin');
} catch (e) {
    console.error('Firebase Admin SDK not installed. Run: npm install firebase-admin');
    process.exit(1);
}

// Check prerequisites
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file');
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json');
    process.exit(1);
}

// Check gh CLI
try {
    execSync('gh auth status', { stdio: 'pipe' });
} catch (e) {
    console.error('GitHub CLI not authenticated. Run: gh auth login');
    process.exit(1);
}

// Initialize Firebase
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'nutcracker-3e8fb'
});

const db = admin.firestore();

// Load synced tracking file
function loadSyncedIds() {
    try {
        const data = JSON.parse(fs.readFileSync(SYNCED_FILE, 'utf8'));
        return new Set(data.syncedIds || []);
    } catch (e) {
        return new Set();
    }
}

// Save synced tracking file
function saveSyncedIds(syncedIds) {
    const data = {
        lastSync: new Date().toISOString(),
        syncedIds: Array.from(syncedIds)
    };
    fs.writeFileSync(SYNCED_FILE, JSON.stringify(data, null, 2));
}

// Create GitHub issue for a suggestion
function createGitHubIssue(suggestion) {
    const title = `[Scene Suggestion] ${suggestion.text.substring(0, 60)}${suggestion.text.length > 60 ? '...' : ''}`;

    const body = `## Scene Suggestion

**Submitted:** ${suggestion.timestamp || 'Unknown'}
**Visitor ID:** \`${suggestion.visitorId || 'anonymous'}\`

---

### Scene Description

${suggestion.text}

---

### Review Checklist

- [ ] Scene description is clear and specific
- [ ] Fits Christmas/holiday theme
- [ ] Appropriate for all audiences
- [ ] Feasible to generate with image models
- [ ] Adds variety to existing image set

---

*Submitted via Nutcracker app feedback*
*Firebase ID: \`${suggestion.id}\`*`;

    const labels = 'scene-suggestion,user-submitted';

    if (DRY_RUN) {
        console.log(`[DRY RUN] Would create issue: ${title}`);
        console.log(`  Labels: ${labels}`);
        console.log(`  Body preview: ${body.substring(0, 100)}...`);
        return true;
    }

    try {
        // Use spawnSync with array args to avoid shell escaping issues
        const result = spawnSync('gh', [
            'issue', 'create',
            '--repo', GITHUB_REPO,
            '--title', title,
            '--body', body,
            '--label', labels
        ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

        if (result.status !== 0) {
            throw new Error(result.stderr || 'gh command failed');
        }
        console.log(`Created issue: ${result.stdout.trim()}`);
        return true;
    } catch (e) {
        console.error(`Failed to create issue for ${suggestion.id}:`, e.message);
        return false;
    }
}

// Main sync function
async function syncSuggestionsToGitHub() {
    console.log('Fetching suggestions from Firebase...');
    if (DRY_RUN) console.log('[DRY RUN MODE - No issues will be created]');

    const snapshot = await db.collection('suggestions')
        .orderBy('timestamp', 'asc')
        .get();

    const suggestions = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        suggestions.push({
            id: doc.id,
            text: data.text,
            visitorId: data.visitorId,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || null
        });
    });

    console.log(`Found ${suggestions.length} total suggestions in Firebase`);

    // Load already synced IDs
    const syncedIds = loadSyncedIds();
    console.log(`${syncedIds.size} suggestions already synced to GitHub`);

    // Filter to unsynced
    const unsynced = suggestions.filter(s => !syncedIds.has(s.id));
    console.log(`${unsynced.length} new suggestions to sync`);

    if (unsynced.length === 0) {
        console.log('Nothing to sync!');
        return;
    }

    // Create issues for unsynced suggestions
    let created = 0;
    let failed = 0;

    for (const suggestion of unsynced) {
        console.log(`\nProcessing: ${suggestion.id}`);
        console.log(`  Text: ${suggestion.text.substring(0, 50)}...`);

        const success = createGitHubIssue(suggestion);

        if (success) {
            syncedIds.add(suggestion.id);
            created++;

            // Rate limit: GitHub API has limits
            if (!DRY_RUN) {
                await new Promise(r => setTimeout(r, 1000));
            }
        } else {
            failed++;
        }
    }

    // Save updated synced IDs
    if (!DRY_RUN) {
        saveSyncedIds(syncedIds);
    }

    console.log(`\n=== Sync Complete ===`);
    console.log(`Created: ${created}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total synced: ${syncedIds.size}`);
}

// Run
syncSuggestionsToGitHub()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Sync failed:', err);
        process.exit(1);
    });
