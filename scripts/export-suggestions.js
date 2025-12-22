#!/usr/bin/env node
/**
 * Export suggestions from Firebase to local JSON for human review.
 *
 * Usage:
 *   node scripts/export-suggestions.js
 *
 * Requirements:
 *   - Firebase Admin SDK credentials (service account JSON)
 *   - Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 */

const fs = require('fs');
const path = require('path');

// Firebase Admin SDK (lazy loaded)
let admin;
try {
    admin = require('firebase-admin');
} catch (e) {
    console.error('Firebase Admin SDK not installed. Run: npm install firebase-admin');
    process.exit(1);
}

// Initialize Firebase Admin
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file');
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'nutcracker-3e8fb'
});

const db = admin.firestore();

async function exportSuggestions() {
    console.log('Fetching suggestions from Firebase...');

    const snapshot = await db.collection('suggestions')
        .orderBy('timestamp', 'desc')
        .limit(500)
        .get();

    const suggestions = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        suggestions.push({
            id: doc.id,
            text: data.text,
            visitorId: data.visitorId,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
            status: 'pending',
            reviewedAt: null,
            reviewNotes: null
        });
    });

    console.log(`Found ${suggestions.length} suggestions`);

    // Load existing pending to preserve review status
    const pendingPath = path.join(__dirname, '..', 'prompts', 'pending.json');
    let existing = { exportedAt: null, suggestions: [] };
    try {
        existing = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    } catch (e) {
        // File doesn't exist or is invalid
    }

    // Merge: keep existing review status for known IDs
    const existingById = new Map(existing.suggestions.map(s => [s.id, s]));
    const merged = suggestions.map(s => {
        const prev = existingById.get(s.id);
        if (prev && prev.status !== 'pending') {
            return prev; // Preserve reviewed status
        }
        return s;
    });

    const output = {
        exportedAt: new Date().toISOString(),
        suggestions: merged
    };

    fs.writeFileSync(pendingPath, JSON.stringify(output, null, 2));
    console.log(`Exported to prompts/pending.json`);

    // Show summary
    const pending = merged.filter(s => s.status === 'pending').length;
    const approved = merged.filter(s => s.status === 'approved').length;
    const rejected = merged.filter(s => s.status === 'rejected').length;
    console.log(`\nStatus: ${pending} pending, ${approved} approved, ${rejected} rejected`);
}

exportSuggestions()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Export failed:', err);
        process.exit(1);
    });
