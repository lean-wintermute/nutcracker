#!/usr/bin/env node
/**
 * Upload static images to Firebase Storage and sync catalog to Firestore.
 *
 * Usage:
 *   node scripts/upload-images-to-storage.js [--dry-run] [--images-only] [--catalog-only]
 *
 * Options:
 *   --dry-run       Show what would be uploaded without making changes
 *   --images-only   Only upload images to Storage, skip Firestore sync
 *   --catalog-only  Only sync catalog to Firestore, skip image upload
 *
 * Requirements:
 *   - Firebase Admin SDK: npm install firebase-admin
 *   - Service account credentials
 *   - Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 *
 * Example:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   node scripts/upload-images-to-storage.js
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const imagesOnly = args.includes('--images-only');
const catalogOnly = args.includes('--catalog-only');

// Constants
const PROJECT_ID = 'nutcracker-3e8fb';
const STORAGE_BUCKET = `${PROJECT_ID}.firebasestorage.app`;
const IMAGES_DIR = path.join(__dirname, '..', 'deploy', 'images');
const CATALOG_PATH = path.join(__dirname, '..', 'deploy', 'image-catalog.json');
const FIRESTORE_COLLECTION = 'image_catalog';

// Cache control: 1 year for static images (they're immutable by filename)
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

// Firebase Admin SDK
let admin;
try {
    admin = require('firebase-admin');
} catch (e) {
    console.error('Firebase Admin SDK not installed.');
    console.error('Run: npm install firebase-admin');
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

// Initialize Firebase
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * Get all PNG files from the images directory (excluding subdirectories like _removed_for_balance)
 */
function getImageFiles() {
    const files = fs.readdirSync(IMAGES_DIR);
    return files.filter(file => {
        const filePath = path.join(IMAGES_DIR, file);
        const stat = fs.statSync(filePath);
        return stat.isFile() && file.endsWith('.png');
    });
}

/**
 * Upload a single image to Firebase Storage
 * @param {string} filename - The image filename
 * @returns {Promise<{filename: string, url: string, skipped: boolean}>}
 */
async function uploadImage(filename) {
    const localPath = path.join(IMAGES_DIR, filename);
    const storagePath = `images/${filename}`;

    // Check if file already exists in storage
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();

    if (exists) {
        // Get the existing file's download URL
        const [metadata] = await file.getMetadata();
        const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`;
        return { filename, url, skipped: true };
    }

    if (dryRun) {
        const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`;
        return { filename, url, skipped: false, dryRun: true };
    }

    // Upload the file
    await bucket.upload(localPath, {
        destination: storagePath,
        metadata: {
            contentType: 'image/png',
            cacheControl: CACHE_CONTROL,
            metadata: {
                uploadedBy: 'upload-images-to-storage.js',
                uploadedAt: new Date().toISOString()
            }
        }
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`;
    return { filename, url, skipped: false };
}

/**
 * Upload all images to Firebase Storage
 * @returns {Promise<Map<string, string>>} Map of filename to storage URL
 */
async function uploadAllImages() {
    const imageFiles = getImageFiles();
    console.log(`Found ${imageFiles.length} PNG files in ${IMAGES_DIR}\n`);

    const urlMap = new Map();
    let uploaded = 0;
    let skipped = 0;
    let errors = 0;

    // Process in batches of 10 for reasonable parallelism
    const BATCH_SIZE = 10;
    for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
        const batch = imageFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(filename => uploadImage(filename))
        );

        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { filename, url, skipped: wasSkipped, dryRun: wasDryRun } = result.value;
                urlMap.set(filename, url);
                if (wasSkipped) {
                    skipped++;
                    process.stdout.write('.');
                } else if (wasDryRun) {
                    uploaded++;
                    process.stdout.write('D');
                } else {
                    uploaded++;
                    process.stdout.write('+');
                }
            } else {
                errors++;
                console.error(`\nError uploading: ${result.reason}`);
            }
        }
    }

    console.log('\n');
    console.log(`Images: ${uploaded} uploaded, ${skipped} already existed, ${errors} errors`);

    return urlMap;
}

/**
 * Load and parse the image catalog
 * @returns {Array<Object>}
 */
function loadCatalog() {
    if (!fs.existsSync(CATALOG_PATH)) {
        console.error(`Catalog not found: ${CATALOG_PATH}`);
        process.exit(1);
    }

    const content = fs.readFileSync(CATALOG_PATH, 'utf8');
    const data = JSON.parse(content);
    return data.images || [];
}

/**
 * Sync catalog entries to Firestore
 * @param {Map<string, string>} urlMap - Map of filename to storage URL
 */
async function syncCatalogToFirestore(urlMap) {
    const catalog = loadCatalog();
    console.log(`Syncing ${catalog.length} catalog entries to Firestore...\n`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process in batches using Firestore batch writes
    const BATCH_SIZE = 500; // Firestore limit

    for (let i = 0; i < catalog.length; i += BATCH_SIZE) {
        const batchEntries = catalog.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const entry of batchEntries) {
            const { filename, displayName, description, category, series } = entry;

            // Document ID is filename without .png
            const docId = filename.replace(/\.png$/, '');

            // Get storage URL - try with and without .png extension
            let src = urlMap.get(filename);
            if (!src && !filename.endsWith('.png')) {
                src = urlMap.get(`${filename}.png`);
            }

            // If we still don't have a URL, construct it
            if (!src) {
                const storagePath = `images/${filename}`;
                src = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`;
            }

            const docRef = db.collection(FIRESTORE_COLLECTION).doc(docId);

            // Check if document exists
            const doc = await docRef.get();

            const docData = {
                id: docId,
                src: src,
                name: displayName || docId,
                description: description || '',
                category: category || 'uncategorized',
                isGenerated: false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            // Only set createdAt for new documents
            if (!doc.exists) {
                docData.createdAt = admin.firestore.FieldValue.serverTimestamp();
            }

            // Include series if present
            if (series) {
                docData.series = series;
            }

            if (dryRun) {
                if (doc.exists) {
                    process.stdout.write('U');
                    updated++;
                } else {
                    process.stdout.write('C');
                    created++;
                }
            } else {
                batch.set(docRef, docData, { merge: true });

                if (doc.exists) {
                    process.stdout.write('U');
                    updated++;
                } else {
                    process.stdout.write('C');
                    created++;
                }
            }
        }

        if (!dryRun) {
            try {
                await batch.commit();
            } catch (err) {
                console.error(`\nBatch commit error: ${err.message}`);
                errors += batchEntries.length;
            }
        }
    }

    console.log('\n');
    console.log(`Firestore: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`);
}

/**
 * Main execution
 */
async function main() {
    console.log('========================================');
    console.log('Nutcracker Image Upload to Firebase');
    console.log('========================================\n');

    if (dryRun) {
        console.log('*** DRY RUN MODE - No changes will be made ***\n');
    }

    console.log(`Project: ${PROJECT_ID}`);
    console.log(`Storage Bucket: ${STORAGE_BUCKET}`);
    console.log(`Images Directory: ${IMAGES_DIR}`);
    console.log(`Catalog: ${CATALOG_PATH}`);
    console.log(`Firestore Collection: ${FIRESTORE_COLLECTION}`);
    console.log('');

    let urlMap = new Map();

    // Step 1: Upload images to Storage
    if (!catalogOnly) {
        console.log('Step 1: Uploading images to Firebase Storage...');
        console.log('  Legend: + = uploaded, . = already exists, D = dry-run\n');
        urlMap = await uploadAllImages();
    } else {
        console.log('Step 1: Skipped (--catalog-only)\n');
    }

    // Step 2: Sync catalog to Firestore
    if (!imagesOnly) {
        console.log('\nStep 2: Syncing catalog to Firestore...');
        console.log('  Legend: C = created, U = updated\n');
        await syncCatalogToFirestore(urlMap);
    } else {
        console.log('\nStep 2: Skipped (--images-only)\n');
    }

    console.log('\n========================================');
    console.log('Upload complete!');
    console.log('========================================');

    if (dryRun) {
        console.log('\n*** This was a dry run. Run without --dry-run to make actual changes. ***');
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('\nFatal error:', err);
        process.exit(1);
    });
