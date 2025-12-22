/**
 * Main request handler for the helpbot
 *
 * Orchestrates classification, response generation, and logging.
 */

const admin = require('firebase-admin');
const { classifyInput } = require('./classifier');
const { callHaiku } = require('./anthropic');
const { createOrUpdateIssue } = require('./github');
const { checkRateLimit } = require('./rate-limiter');

/**
 * Handles an incoming helpbot request.
 *
 * @param {Object} body - Request body containing message and context
 * @param {string} body.sessionId - Unique session identifier for rate limiting
 * @param {string} body.message - User's message text
 * @param {Object} body.systemContext - Device/browser context
 * @param {Object} body.context - Additional conversation context
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @returns {Promise<Object>} Response with message and classification
 */
async function handleHelpbotRequest(body, db) {
  const { sessionId, message, systemContext, context } = body;

  // Validate required fields
  if (!sessionId || typeof sessionId !== 'string') {
    return {
      response: 'Session error. Please refresh the page and try again.',
      error: true,
    };
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return {
      response: 'Please enter a message.',
      error: true,
    };
  }

  // Sanitize message - limit length
  const sanitizedMessage = message.trim().slice(0, 2000);

  // Rate limiting check
  const rateCheck = await checkRateLimit(sessionId);
  if (!rateCheck.allowed) {
    return {
      response:
        "I want to make sure I can help everyone who needs assistance. There's a brief cooldown on messages - your feedback has been saved. Please try again in a few minutes if you have more to share.",
      rateLimited: true,
      retryAfter: rateCheck.retryAfter,
    };
  }

  // Classify the user's input using LLM
  const classification = await classifyInput(
    sanitizedMessage,
    systemContext,
    context
  );

  let response;
  let githubResult = null;

  // Handle based on classification
  if (!classification.is_valid) {
    // Invalid/spam input
    response =
      'I can only help with questions about the Christmas Stories app. Would you like to know about voting, rankings, or how the app works?';
  } else if (classification.type === 'bug' || classification.type === 'feedback') {
    // Create or update GitHub issue for bugs and feedback
    githubResult = await createOrUpdateIssue(
      classification,
      sanitizedMessage,
      systemContext
    );

    if (githubResult.action === 'CREATED') {
      response =
        classification.type === 'bug'
          ? `Thank you for your bug report! It's been filed as issue #${githubResult.issueNumber} and our team will investigate.`
          : `Thank you for your feedback! It's been filed as issue #${githubResult.issueNumber} and will be reviewed.`;
    } else if (githubResult.action === 'ADDED_TO_EXISTING') {
      const priorityNote = githubResult.priorityUpgraded
        ? ' and its priority has been upgraded based on report frequency'
        : '';
      response = `Your ${classification.type === 'bug' ? 'report' : 'feedback'} has been added to an existing issue (#${githubResult.issueNumber})${priorityNote}. Thank you for letting us know!`;
    } else {
      // Fallback if GitHub fails
      response = `Thank you! Your ${classification.type === 'bug' ? 'report' : 'feedback'} has been recorded and will be reviewed by our team.`;
    }
  } else if (classification.type === 'off_topic') {
    // Redirect off-topic queries
    response =
      'I can only help with Christmas Stories questions. Would you like to know about voting, rankings, or how to use the app?';
  } else {
    // General question - use Haiku for response
    response = await callHaiku(sanitizedMessage, systemContext, context);
  }

  // Log interaction to Firestore
  await logToFirestore(db, {
    sessionId,
    message: sanitizedMessage,
    classification: {
      type: classification.type,
      confidence: classification.confidence,
      priority: classification.priority,
      component: classification.component,
    },
    response,
    systemContext: sanitizeSystemContext(systemContext),
    githubResult: githubResult
      ? {
        action: githubResult.action,
        issueNumber: githubResult.issueNumber,
      }
      : null,
  });

  return {
    response,
    classification: classification.type,
    issueNumber: githubResult?.issueNumber || null,
  };
}

/**
 * Logs interaction to Firestore with 30-day TTL.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {Object} data - Data to log
 */
async function logToFirestore(db, data) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 day TTL

  try {
    await db.collection('helpbot_logs').add({
      ...data,
      expiresAt,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Log error but don't fail the request
    console.error('Firestore logging error:', error.message);
  }
}

/**
 * Sanitizes system context to prevent storing sensitive data.
 *
 * @param {Object} context - Raw system context
 * @returns {Object} Sanitized context
 */
function sanitizeSystemContext(context) {
  if (!context || typeof context !== 'object') {
    return {};
  }

  // Only include safe, non-identifying fields
  return {
    platform: String(context.platform || 'Unknown').slice(0, 50),
    osVersion: String(context.osVersion || '').slice(0, 20),
    browser: String(context.browser || 'Unknown').slice(0, 50),
    browserVersion: String(context.browserVersion || '').slice(0, 20),
    deviceType: String(context.deviceType || 'Unknown').slice(0, 20),
    isPWA: Boolean(context.isPWA),
    isOnline: Boolean(context.isOnline),
    screenWidth: context.screenWidth ? Number(context.screenWidth) : null,
    screenHeight: context.screenHeight ? Number(context.screenHeight) : null,
  };
}

module.exports = { handleHelpbotRequest };
