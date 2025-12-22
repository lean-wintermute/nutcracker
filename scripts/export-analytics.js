#!/usr/bin/env node
/**
 * Export Nutcracker analytics data from Firebase for local analysis.
 *
 * Usage:
 *   node scripts/export-analytics.js [--output ./analytics]
 *
 * Exports:
 *   - votes.json: All votes with timestamps
 *   - rankings.json: Computed Elo rankings
 *   - suggestions.json: User suggestions
 *   - feedback.json: Tag feedback data
 *   - summary.json: Aggregate statistics
 *
 * Requirements:
 *   - Firebase Admin SDK: npm install firebase-admin
 *   - Service account credentials
 *   - Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 */

const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
const outputIdx = args.indexOf('--output');
const outputDir = outputIdx >= 0 ? args[outputIdx + 1] : './analytics';

// Firebase Admin SDK
let admin;
try {
    admin = require('firebase-admin');
} catch (e) {
    console.error('Firebase Admin SDK not installed. Run: npm install firebase-admin');
    process.exit(1);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file');
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json');
    console.error('\nTo get service account:');
    console.error('  1. Go to Firebase Console > Project Settings > Service Accounts');
    console.error('  2. Click "Generate new private key"');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'nutcracker-3e8fb'
});

const db = admin.firestore();

// Elo calculation
function calculateElo(votes, imageIds) {
    const K = 32;
    const ratings = {};
    const stats = {};

    imageIds.forEach(id => {
        ratings[id] = 1500;
        stats[id] = { wins: 0, losses: 0 };
    });

    // Sort by timestamp
    votes.sort((a, b) => {
        const aTime = a.timestamp?.toMillis?.() || a.timestamp || 0;
        const bTime = b.timestamp?.toMillis?.() || b.timestamp || 0;
        return aTime - bTime;
    });

    votes.forEach(vote => {
        const { winner, loser } = vote;
        if (!ratings[winner] || !ratings[loser]) return;

        const expectedWinner = 1 / (1 + Math.pow(10, (ratings[loser] - ratings[winner]) / 400));
        const expectedLoser = 1 - expectedWinner;

        ratings[winner] += K * (1 - expectedWinner);
        ratings[loser] += K * (0 - expectedLoser);

        stats[winner].wins++;
        stats[loser].losses++;
    });

    // Round ratings
    Object.keys(ratings).forEach(id => {
        ratings[id] = Math.round(ratings[id]);
    });

    return { ratings, stats };
}

async function exportAnalytics() {
    console.log('Exporting Nutcracker analytics...\n');

    // Create output directory
    const timestamp = new Date().toISOString().slice(0, 10);
    const exportPath = path.join(outputDir, timestamp);
    fs.mkdirSync(exportPath, { recursive: true });

    // Export votes
    console.log('Fetching votes...');
    const votesSnap = await db.collection('votes').get();
    const votes = [];
    const uniqueVoters = new Set();
    const imageIds = new Set();

    votesSnap.forEach(doc => {
        const data = doc.data();
        votes.push({
            id: doc.id,
            winner: data.winner,
            loser: data.loser,
            visitorId: data.visitorId,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || null
        });
        uniqueVoters.add(data.visitorId);
        imageIds.add(data.winner);
        imageIds.add(data.loser);
    });

    fs.writeFileSync(
        path.join(exportPath, 'votes.json'),
        JSON.stringify(votes, null, 2)
    );
    console.log(`  ${votes.length} votes exported`);

    // Calculate and export rankings
    console.log('Computing rankings...');
    const { ratings, stats } = calculateElo(votes, Array.from(imageIds));

    const rankings = Object.entries(ratings)
        .map(([id, elo]) => ({
            id,
            elo,
            wins: stats[id]?.wins || 0,
            losses: stats[id]?.losses || 0,
            winRate: stats[id]?.wins + stats[id]?.losses > 0
                ? (stats[id].wins / (stats[id].wins + stats[id].losses) * 100).toFixed(1) + '%'
                : 'N/A'
        }))
        .sort((a, b) => b.elo - a.elo);

    fs.writeFileSync(
        path.join(exportPath, 'rankings.json'),
        JSON.stringify(rankings, null, 2)
    );
    console.log(`  ${rankings.length} images ranked`);

    // Export suggestions
    console.log('Fetching suggestions...');
    const suggestionsSnap = await db.collection('suggestions').get();
    const suggestions = [];

    suggestionsSnap.forEach(doc => {
        const data = doc.data();
        suggestions.push({
            id: doc.id,
            text: data.text,
            visitorId: data.visitorId,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || null
        });
    });

    fs.writeFileSync(
        path.join(exportPath, 'suggestions.json'),
        JSON.stringify(suggestions, null, 2)
    );
    console.log(`  ${suggestions.length} suggestions exported`);

    // Export feedback
    console.log('Fetching feedback...');
    const feedbackSnap = await db.collection('feedback').get();
    const feedback = [];
    const tagCounts = {};

    feedbackSnap.forEach(doc => {
        const data = doc.data();
        feedback.push({
            id: doc.id,
            imageId: data.imageId,
            tags: data.tags,
            visitorId: data.visitorId,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || null
        });
        (data.tags || []).forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });

    fs.writeFileSync(
        path.join(exportPath, 'feedback.json'),
        JSON.stringify(feedback, null, 2)
    );
    console.log(`  ${feedback.length} feedback entries exported`);

    // Generate summary
    const summary = {
        exportedAt: new Date().toISOString(),
        totalVotes: votes.length,
        uniqueVoters: uniqueVoters.size,
        imagesRanked: imageIds.size,
        suggestions: suggestions.length,
        feedbackEntries: feedback.length,
        tagBreakdown: tagCounts,
        top10: rankings.slice(0, 10).map(r => ({
            id: r.id,
            elo: r.elo,
            record: `${r.wins}W-${r.losses}L`
        })),
        bottom10: rankings.slice(-10).reverse().map(r => ({
            id: r.id,
            elo: r.elo,
            record: `${r.wins}W-${r.losses}L`
        })),
        votesPerDay: calculateVotesPerDay(votes)
    };

    fs.writeFileSync(
        path.join(exportPath, 'summary.json'),
        JSON.stringify(summary, null, 2)
    );

    console.log(`\nExport complete: ${exportPath}/`);
    console.log(`\nSummary:`);
    console.log(`  Total votes: ${summary.totalVotes}`);
    console.log(`  Unique voters: ${summary.uniqueVoters}`);
    console.log(`  Images ranked: ${summary.imagesRanked}`);
    console.log(`  Suggestions: ${summary.suggestions}`);

    return exportPath;
}

function calculateVotesPerDay(votes) {
    const days = {};
    votes.forEach(v => {
        if (v.timestamp) {
            const day = v.timestamp.slice(0, 10);
            days[day] = (days[day] || 0) + 1;
        }
    });
    return days;
}

exportAnalytics()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Export failed:', err);
        process.exit(1);
    });
