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
 * Allowed fields in systemContext with their expected types.
 * Used for validation to prevent type errors downstream.
 */
const SYSTEM_CONTEXT_SCHEMA = {
  platform: 'string',
  osVersion: 'string',
  browser: 'string',
  browserVersion: 'string',
  deviceType: 'string',
  isPWA: 'boolean',
  isOnline: 'boolean',
  screenWidth: 'number',
  screenHeight: 'number',
  // Additional optional fields
  userAgent: 'string',
  language: 'string',
  timezone: 'string',
};

/**
 * Validates and sanitizes the systemContext object from the request.
 *
 * @param {*} context - Raw systemContext from request body
 * @returns {{ valid: boolean, context: Object, error?: string }}
 *   - valid: true if context is usable (including null/undefined)
 *   - context: sanitized context object (empty object if input was null/undefined)
 *   - error: error message if validation failed
 */
function validateSystemContext(context) {
  // Null/undefined is acceptable - return empty context
  if (context === null || context === undefined) {
    return { valid: true, context: {} };
  }

  // Must be a plain object (not array, not primitive)
  if (typeof context !== 'object' || Array.isArray(context)) {
    return {
      valid: false,
      context: {},
      error: 'systemContext must be an object',
    };
  }

  // Check for prototype pollution attempts
  // Note: __proto__ as object literal key sets prototype (Node.js handles safely),
  // but constructor/prototype as keys can still be dangerous
  const dangerousKeys = ['constructor', 'prototype'];
  const contextKeys = Object.keys(context);
  for (const key of dangerousKeys) {
    if (contextKeys.includes(key)) {
      console.warn('Potential prototype pollution attempt detected', { key });
      return {
        valid: false,
        context: {},
        error: 'Invalid systemContext structure',
      };
    }
  }

  // Validate and coerce field types
  const validated = {};
  for (const [key, value] of Object.entries(context)) {
    // Skip unknown fields (they won't be used downstream)
    if (!Object.prototype.hasOwnProperty.call(SYSTEM_CONTEXT_SCHEMA, key)) {
      continue;
    }

    const expectedType = SYSTEM_CONTEXT_SCHEMA[key];

    // Allow null/undefined for any field - it will use defaults
    if (value === null || value === undefined) {
      continue;
    }

    // Type validation with safe coercion
    switch (expectedType) {
    case 'string':
      if (typeof value === 'string') {
        // Limit string length to prevent abuse
        validated[key] = value.slice(0, 200);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        // Safe coercion from primitives
        validated[key] = String(value).slice(0, 200);
      }
      // Silently drop objects/arrays/functions
      break;

    case 'boolean':
      if (typeof value === 'boolean') {
        validated[key] = value;
      } else if (value === 'true' || value === 1) {
        validated[key] = true;
      } else if (value === 'false' || value === 0) {
        validated[key] = false;
      }
      // Silently drop invalid values
      break;

    case 'number':
      if (typeof value === 'number' && Number.isFinite(value)) {
        // Clamp to reasonable screen dimension range
        validated[key] = Math.max(0, Math.min(value, 10000));
      } else if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          validated[key] = Math.max(0, Math.min(parsed, 10000));
        }
      }
      // Silently drop invalid values
      break;

    default:
      // Unknown type in schema - skip
      break;
    }
  }

  return { valid: true, context: validated };
}

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
  const { sessionId, message, systemContext: rawSystemContext, context } = body;

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

  // Validate and sanitize systemContext
  const contextValidation = validateSystemContext(rawSystemContext);
  if (!contextValidation.valid) {
    return {
      response: 'Invalid request format. Please refresh the page and try again.',
      error: true,
    };
  }
  const validatedSystemContext = contextValidation.context;

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
    validatedSystemContext,
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
      validatedSystemContext
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
    response = await callHaiku(sanitizedMessage, validatedSystemContext, context);
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
    systemContext: validatedSystemContext,
    githubResult: githubResult
      ? {
        action: githubResult.action,
        issueNumber: githubResult.issueNumber || null,
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

module.exports = { handleHelpbotRequest, validateSystemContext };
