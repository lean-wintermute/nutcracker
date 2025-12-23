/**
 * Nutcracker Helpbot - Firebase Cloud Function
 *
 * Main entry point for the helpbot backend that handles:
 * - LLM-based classification of user messages
 * - GitHub issue creation/updates for bugs and feedback
 * - General help responses via Claude Haiku
 * - Rate limiting and Firestore logging
 * - Imagine Bar story generation (Phase 1)
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { handleHelpbotRequest } = require('./lib/handler');

// Import Imagine Bar
const { generateStory } = require('./lib/imagine-bar');

// Define secrets for v2 functions
const anthropicKey = defineSecret('ANTHROPIC_KEY');
const githubToken = defineSecret('GITHUB_TOKEN');

admin.initializeApp();

/**
 * HTTPS Cloud Function for the helpbot endpoint.
 * Accepts POST requests with message data and returns LLM responses.
 */
/**
 * Safely parse JSON body, returning null on failure.
 * Uses rawBody if available to handle cases where Firebase's parser fails.
 */
function parseRequestBody(req) {
  // If body is already parsed as object, use it
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return { success: true, data: req.body };
  }

  // Try rawBody if available (for webhook-style manual parsing)
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

  // Body is string or missing
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

  if (!req.body) {
    return { success: false, error: 'Request body is required' };
  }

  return { success: false, error: 'Invalid request body format' };
}

exports.helpbot = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [anthropicKey, githubToken],
    invoker: 'public',
  },
  async (req, res) => {
    // CORS headers - restrict to Nutcracker domains only
    const allowedOrigins = [
      'https://lean-wintermute.github.io',
      'http://localhost:5000', // Local dev
      'http://127.0.0.1:5000', // Local dev
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // Only accept POST requests
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Parse and validate request body
    const bodyResult = parseRequestBody(req);
    if (!bodyResult.success) {
      res.status(400).json({ error: bodyResult.error });
      return;
    }

    try {
      const result = await handleHelpbotRequest(bodyResult.data, admin.firestore());
      res.status(200).json(result);
    } catch (error) {
      console.error('Helpbot error:', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        response:
          "I'm having trouble right now. Your feedback has been saved and will be reviewed.",
        error: true,
      });
    }
  });

/**
 * Scheduled Cloud Function to clean up expired helpbot logs.
 * Runs every 24 hours and deletes documents where expiresAt < now.
 * Uses batch deletes for efficiency (500 docs per batch, Firestore limit).
 */
exports.cleanupExpiredLogs = onSchedule(
  {
    schedule: 'every 24 hours',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    let totalDeleted = 0;

    console.log('Starting expired logs cleanup', { timestamp: now.toDate().toISOString() });

    try {
      let hasMore = true;

      while (hasMore) {
        // Query expired documents, limit to 500 (Firestore batch limit)
        const expiredDocs = await db
          .collection('helpbot_logs')
          .where('expiresAt', '<', now)
          .limit(500)
          .get();

        if (expiredDocs.empty) {
          hasMore = false;
          break;
        }

        // Create a batch and add all deletes
        const batch = db.batch();
        expiredDocs.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });

        // Commit the batch
        await batch.commit();
        totalDeleted += expiredDocs.size;

        console.log('Deleted batch of expired logs', { batchSize: expiredDocs.size, totalDeleted });

        // If we got fewer than 500, we're done
        if (expiredDocs.size < 500) {
          hasMore = false;
        }
      }

      console.log('Expired logs cleanup completed', { totalDeleted });
    } catch (error) {
      console.error('Error cleaning up expired logs', {
        error: error.message,
        stack: error.stack,
        totalDeletedBeforeError: totalDeleted,
      });
      throw error; // Re-throw to mark the function execution as failed
    }
  });

// Imagine Bar - Story Generation (Phase 1)
exports.generateStory = generateStory;
