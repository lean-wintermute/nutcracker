/**
 * Nutcracker Image Catalog Sync - Cloud Function
 *
 * Synchronizes the static image-catalog.json to Firestore's image_catalog collection.
 * This creates a unified source of truth for all images (static + generated).
 *
 * Usage:
 * - HTTP trigger: POST /syncImageCatalog (for manual/deploy sync)
 * - Scheduled: Weekly maintenance sync
 *
 * The image_catalog collection schema:
 * {
 *   id: string,           // Document ID = filename without extension
 *   filename: string,     // Original filename
 *   src: string,          // Full URL to image
 *   name: string,         // Display name
 *   description: string,  // Image description
 *   category: string,     // Category (whale, bear, etc.)
 *   series: string,       // Series identifier (optional)
 *   isGenerated: boolean, // false for static, true for user-generated
 *   eloScore: number,     // Starting Elo (1200)
 *   createdAt: Timestamp, // When added to catalog
 *   updatedAt: Timestamp  // Last sync update
 * }
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Base URL for static images (Firebase Hosting)
const STATIC_IMAGE_BASE_URL = 'https://nutcracker-3e8fb.web.app/images/';

/**
 * Load the static image catalog from the bundled JSON file
 * @returns {Object} The catalog object with images array and categories
 */
function loadStaticCatalog() {
  // In Cloud Functions, the catalog is deployed alongside the function
  // We need to bundle it or fetch from hosting
  const catalogPath = path.join(__dirname, '..', 'image-catalog.json');

  if (fs.existsSync(catalogPath)) {
    const content = fs.readFileSync(catalogPath, 'utf8');
    return JSON.parse(content);
  }

  // Fallback: return empty catalog
  console.warn('Static catalog not found at:', catalogPath);
  return { images: [], categories: {} };
}

/**
 * Sync static images to Firestore image_catalog collection
 * Uses batch writes for efficiency (max 500 per batch)
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @returns {Object} Sync results
 */
async function syncStaticCatalog(db) {
  const catalog = loadStaticCatalog();
  const images = catalog.images || [];

  if (images.length === 0) {
    return { success: false, error: 'No images in catalog', synced: 0 };
  }

  const collectionRef = db.collection('image_catalog');
  const now = admin.firestore.FieldValue.serverTimestamp();

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches of 500 (Firestore limit)
  const BATCH_SIZE = 500;
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchImages = images.slice(i, i + BATCH_SIZE);

    for (const img of batchImages) {
      if (!img.filename) {
        skipped++;
        continue;
      }

      // Use filename without extension as document ID
      const docId = img.filename.replace('.png', '').replace('.jpg', '');
      const docRef = collectionRef.doc(docId);

      // Build the document data
      const docData = {
        id: docId,
        filename: img.filename,
        src: STATIC_IMAGE_BASE_URL + encodeURIComponent(img.filename),
        name: img.displayName || docId.replace(/_/g, ' '),
        description: img.description || '',
        category: img.category || 'unknown',
        series: img.series || null,
        isGenerated: false,
        eloScore: 1200, // Default starting Elo
        updatedAt: now,
      };

      // Use merge to preserve createdAt if exists
      batch.set(docRef, docData, { merge: true });
      synced++;
    }

    try {
      await batch.commit();
      console.log(`Synced batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchImages.length} images`);
    } catch (err) {
      console.error('Batch commit error:', err.message);
      errors += batchImages.length;
      synced -= batchImages.length;
    }
  }

  // Set createdAt for new documents (those without it)
  // This is done in a separate pass to avoid overwriting existing createdAt
  const newDocsQuery = await collectionRef.where('createdAt', '==', null).limit(500).get();
  if (!newDocsQuery.empty) {
    const createdAtBatch = db.batch();
    newDocsQuery.docs.forEach(doc => {
      createdAtBatch.update(doc.ref, { createdAt: now });
    });
    await createdAtBatch.commit();
    console.log(`Set createdAt for ${newDocsQuery.size} new documents`);
  }

  return {
    success: true,
    synced,
    skipped,
    errors,
    totalInCatalog: images.length,
  };
}

/**
 * Allowed origins for CORS
 */
const allowedOrigins = [
  'https://lean-wintermute.github.io',
  'https://nutcracker-3e8fb.web.app',
  'https://nutcracker-3e8fb.firebaseapp.com',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

/**
 * HTTP-triggered Cloud Function to sync the image catalog
 * POST /syncImageCatalog
 *
 * Optionally accepts admin token for authorization (for production use)
 */
const syncImageCatalog = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    invoker: 'public', // Consider restricting in production
  },
  async (req, res) => {
    // CORS headers
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const db = admin.firestore();
      const result = await syncStaticCatalog(db);

      console.log('Catalog sync completed:', result);
      res.status(200).json(result);
    } catch (error) {
      console.error('Catalog sync error:', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to sync catalog',
        message: error.message,
      });
    }
  }
);

/**
 * Scheduled Cloud Function to maintain catalog sync
 * Runs weekly to ensure consistency
 */
const scheduledCatalogSync = onSchedule(
  {
    schedule: 'every sunday 03:00',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    console.log('Starting scheduled catalog sync...');
    const db = admin.firestore();
    const result = await syncStaticCatalog(db);
    console.log('Scheduled catalog sync completed:', result);
  }
);

module.exports = {
  syncImageCatalog,
  scheduledCatalogSync,
  syncStaticCatalog, // Export for testing
};
