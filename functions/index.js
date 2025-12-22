/**
 * Nutcracker Helpbot - Firebase Cloud Function
 *
 * Main entry point for the helpbot backend that handles:
 * - LLM-based classification of user messages
 * - GitHub issue creation/updates for bugs and feedback
 * - General help responses via Claude Haiku
 * - Rate limiting and Firestore logging
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { handleHelpbotRequest } = require('./lib/handler');

// Define secrets for v2 functions
const anthropicKey = defineSecret('ANTHROPIC_KEY');
const githubToken = defineSecret('GITHUB_TOKEN');

admin.initializeApp();

/**
 * HTTPS Cloud Function for the helpbot endpoint.
 * Accepts POST requests with message data and returns LLM responses.
 */
exports.helpbot = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [anthropicKey, githubToken],
    invoker: 'public',
  },
  async (req, res) => {
    // CORS headers for cross-origin requests from the web app
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    // Validate request body exists
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }

    try {
      const result = await handleHelpbotRequest(req.body, admin.firestore());
      res.status(200).json(result);
    } catch (error) {
      console.error('Helpbot error:', {
        error: error.message,
        stack: error.stack,
        body: req.body,
      });

      res.status(500).json({
        response:
          "I'm having trouble right now. Your feedback has been saved and will be reviewed.",
        error: true,
      });
    }
  });
