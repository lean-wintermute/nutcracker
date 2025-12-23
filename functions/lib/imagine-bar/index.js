/**
 * Imagine Bar - Story Generation Module
 *
 * Exports the Cloud Function endpoint and initialization.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { handleGenerateStory } = require('./handler');
const { loadCatalog } = require('./validator');

// Define secret for Gemini API key
const geminiKey = defineSecret('GEMINI_KEY');

// Load image catalog at module load (cold start)
// In production, this is bundled with the function
let catalogLoaded = false;

function ensureCatalogLoaded() {
  if (!catalogLoaded) {
    try {
      const catalog = require('../../../image-descriptions.json');
      loadCatalog(catalog);
      catalogLoaded = true;
    } catch (error) {
      console.error('[ImagineBar] Failed to load catalog:', error.message);
    }
  }
}

/**
 * CORS configuration - same as helpbot
 */
const ALLOWED_ORIGINS = [
  'https://lean-wintermute.github.io',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];

/**
 * Safely parse JSON body.
 */
function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return { success: true, data: req.body };
  }

  if (req.rawBody) {
    try {
      const parsed = JSON.parse(req.rawBody.toString('utf8'));
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { success: true, data: parsed };
      }
      return { success: false, error: 'Request body must be a JSON object' };
    } catch (e) {
      return { success: false, error: 'Invalid JSON in request body' };
    }
  }

  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { success: true, data: parsed };
      }
      return { success: false, error: 'Request body must be a JSON object' };
    } catch (e) {
      return { success: false, error: 'Invalid JSON in request body' };
    }
  }

  return { success: false, error: 'Request body is required' };
}

/**
 * Imagine Bar Cloud Function
 *
 * POST /generateStory
 * Body: { imageId: string }
 * Headers: Authorization: Bearer <firebase-id-token>
 *
 * Returns: { audioBase64, duration, imageTitle, remaining }
 */
const generateStory = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,  // 2 minutes for narrative + TTS
    memory: '512MiB',
    secrets: [geminiKey],
    invoker: 'public'
  },
  async (req, res) => {
    // CORS headers
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // POST only
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Ensure catalog is loaded
    ensureCatalogLoaded();

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: true,
        code: 'unauthenticated',
        message: 'Please sign in to generate stories'
      });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    let userId;

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      userId = decodedToken.uid;
    } catch (error) {
      console.error('[ImagineBar] Token verification failed:', error.message);
      res.status(401).json({
        error: true,
        code: 'unauthenticated',
        message: 'Invalid authentication token'
      });
      return;
    }

    // Parse body
    const bodyResult = parseRequestBody(req);
    if (!bodyResult.success) {
      res.status(400).json({ error: true, message: bodyResult.error });
      return;
    }

    // Handle request
    const db = admin.firestore();
    const result = await handleGenerateStory(
      bodyResult.data,
      userId,
      db,
      geminiKey.value()
    );

    if (result.error) {
      const statusCode = result.code === 'unauthenticated' ? 401
        : result.code === 'invalid-argument' ? 400
          : result.code === 'resource-exhausted' ? 429
            : 500;

      res.status(statusCode).json({
        error: true,
        code: result.code,
        message: result.message
      });
      return;
    }

    res.status(200).json(result);
  }
);

module.exports = { generateStory };
