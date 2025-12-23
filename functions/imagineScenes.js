/**
 * Nutcracker Imagine Scenes - Cloud Function
 *
 * Main entry point for image generation. Handles:
 * - Authentication via Firebase ID token
 * - Quota reservation (atomic, prevents race conditions)
 * - Prompt enhancement via Gemini 2.5 Pro
 * - Image generation via Gemini image model
 * - Storage upload with signed URLs
 * - Firestore logging for gallery integration
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

const { initializeGemini, getApiKey } = require('./lib/gemini');
const { enhanceScene } = require('./lib/scene-enhancer');
const { generateImage } = require('./lib/image-generator');
const { reserveQuota, confirmReservation, releaseReservation } = require('./lib/quota-manager');
const { uploadImage } = require('./lib/storage-manager');
const { validateAnimalId } = require('./lib/animals');
const { LIMITS } = require('./lib/constants');

// Define secret for Gemini API key (production)
// For local dev: export GEMINI_API_KEY=$(security find-generic-password -s gemini_nutcracker -w)
const geminiKey = defineSecret('GEMINI_API_KEY');

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
 * Imagine Scenes Cloud Function
 *
 * POST /imagineScenes
 * Body: { animal: string, seed: string, idToken: string }
 * Returns: { success: boolean, imageId?: string, imageUrl?: string, remaining?: number }
 */
const imagineScenes = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: [geminiKey],
    invoker: 'public',
  },
  async (req, res) => {
    // 1. CORS headers
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // Only POST allowed
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Initialize Gemini with secret (production) or env var (local dev)
    // For local: export GEMINI_API_KEY=$(security find-generic-password -s gemini_nutcracker -w)
    const apiKey = geminiKey.value() || getApiKey();
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      res.status(500).json({
        response: 'Image generation is not configured. Please try again later.',
        error: true,
      });
      return;
    }
    initializeGemini(apiKey);

    let userId = null;
    let reservationId = null;

    try {
      // 2. Parse request body
      const { animal, seed, idToken } = req.body || {};

      if (!animal || !seed || !idToken) {
        res.status(400).json({
          response: 'Missing required fields: animal, seed, idToken',
          error: true,
        });
        return;
      }

      // 3. Verify Firebase Auth token
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (authError) {
        console.error('Auth error:', authError.message);
        res.status(401).json({
          response: 'Invalid or expired authentication. Please refresh and try again.',
          error: true,
        });
        return;
      }
      userId = decodedToken.uid;

      // 4. Validate animal
      if (!validateAnimalId(animal)) {
        res.status(400).json({
          response: `Unknown animal: ${animal}. Please select a valid animal.`,
          error: true,
        });
        return;
      }

      // 5. Validate seed length
      if (typeof seed !== 'string' || seed.length === 0 || seed.length > LIMITS.seedMaxLength) {
        res.status(400).json({
          response: `Scene description must be 1-${LIMITS.seedMaxLength} characters.`,
          error: true,
        });
        return;
      }

      // 6. Reserve quota (atomic - prevents race conditions)
      const quotaResult = await reserveQuota(userId);
      if (!quotaResult.allowed) {
        const message = quotaResult.reason === 'daily_limit'
          ? `You've used all ${LIMITS.userDailyImages} daily images. Try again tomorrow!`
          : 'The imagination engine is resting. Try again tomorrow!';

        res.status(429).json({
          response: message,
          error: true,
          rateLimited: true,
          retryAfter: quotaResult.retryAfter,
        });
        return;
      }
      reservationId = quotaResult.reservationId;

      // 7. Enhance scene prompt
      const enhanced = await enhanceScene(animal, seed);

      // 8. Generate image
      const imageResult = await generateImage(enhanced.enhanced, animal);

      // 9. Upload to storage
      const storageResult = await uploadImage(
        imageResult.base64,
        imageResult.mimeType,
        { userId, animal, seed: seed.trim() }
      );

      // 10. Save to Firestore (both legacy collection and unified catalog)
      const db = admin.firestore();
      const now = admin.firestore.FieldValue.serverTimestamp();
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);  // 90 days TTL

      // Legacy collection for backwards compatibility
      const imageDoc = await db.collection('imagined_images').add({
        userId,
        animal,
        seed: seed.trim(),
        enhancedPrompt: enhanced.enhanced,
        storagePath: storageResult.path,
        imageUrl: storageResult.url,
        eloScore: 1200,  // Starting Elo rating
        createdAt: now,
        expiresAt,
      });

      // Unified image_catalog collection for frontend consumption
      // Uses imageDoc.id as document ID for consistency
      await db.collection('image_catalog').doc(imageDoc.id).set({
        id: imageDoc.id,
        filename: `${imageDoc.id}.png`,  // Virtual filename for compatibility
        src: storageResult.url,
        name: `${animal.charAt(0).toUpperCase() + animal.slice(1)} - ${seed.trim().substring(0, 30)}`,
        description: enhanced.enhanced.substring(0, 200),
        category: animal,
        series: 'generated',
        isGenerated: true,
        userId,
        storagePath: storageResult.path,
        eloScore: 1200,
        createdAt: now,
        expiresAt,
      });

      // 11. Confirm quota reservation
      await confirmReservation(userId, reservationId);

      // 12. Return success
      res.status(200).json({
        success: true,
        imageId: imageDoc.id,
        imageUrl: storageResult.url,
        enhancedPrompt: enhanced.enhanced,
        remaining: quotaResult.remaining,
      });

    } catch (error) {
      console.error('imagineScenes error:', {
        error: error.message,
        stack: error.stack,
        userId,
      });

      // Release reservation on failure
      if (userId && reservationId) {
        try {
          await releaseReservation(userId, reservationId);
        } catch (releaseError) {
          console.error('Failed to release reservation:', releaseError.message);
        }
      }

      // Determine user-friendly error message
      let userMessage = 'Something went wrong creating your scene. Please try again.';

      if (error.message?.includes('SAFETY') || error.message?.includes('content policy')) {
        userMessage = "That scene couldn't be illustrated. Try a different description!";
      } else if (error.message?.includes('blocked')) {
        userMessage = 'That description contains restricted content. Try something else!';
      } else if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
        userMessage = 'Image creation took too long. Please try again with a simpler scene.';
      }

      res.status(500).json({
        response: userMessage,
        error: true,
      });
    }
  }
);

module.exports = { imagineScenes };
