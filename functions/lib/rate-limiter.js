/**
 * Rate limiter for helpbot requests
 *
 * Uses in-memory storage with automatic cleanup.
 * Note: In a multi-instance deployment, consider using Redis or Firestore
 * for distributed rate limiting.
 */

/**
 * In-memory rate limit storage.
 * Map of sessionId -> { count, resetAt }
 */
const rateLimitMap = new Map();

/**
 * Rate limit configuration.
 */
const LIMITS = {
  messagesPerWindow: 20,
  windowMs: 10 * 60 * 1000, // 10 minutes
  cleanupProbability: 0.1, // 10% chance to run cleanup on each request
};

/**
 * Checks if a session is within rate limits.
 *
 * @param {string} sessionId - Unique session identifier
 * @returns {Promise<Object>} Rate limit check result
 */
async function checkRateLimit(sessionId) {
  const now = Date.now();

  // Get or create session record
  let session = rateLimitMap.get(sessionId);

  // Reset if window has expired
  if (!session || now > session.resetAt) {
    session = {
      count: 0,
      resetAt: now + LIMITS.windowMs,
    };
  }

  // Check if limit exceeded
  if (session.count >= LIMITS.messagesPerWindow) {
    const retryAfter = Math.ceil((session.resetAt - now) / 1000);
    return {
      allowed: false,
      retryAfter,
      remaining: 0,
    };
  }

  // Increment counter
  session.count++;
  rateLimitMap.set(sessionId, session);

  // Periodic cleanup of expired sessions
  if (Math.random() < LIMITS.cleanupProbability) {
    cleanupExpiredSessions(now);
  }

  return {
    allowed: true,
    remaining: LIMITS.messagesPerWindow - session.count,
    resetAt: session.resetAt,
  };
}

/**
 * Cleans up expired session records to prevent memory leaks.
 *
 * @param {number} now - Current timestamp
 */
function cleanupExpiredSessions(now) {
  let cleaned = 0;
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetAt) {
      rateLimitMap.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`Rate limiter cleanup: removed ${cleaned} expired sessions`);
  }
}

/**
 * Gets the current rate limit status for a session (for debugging).
 *
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Current session data or null
 */
function getRateLimitStatus(sessionId) {
  return rateLimitMap.get(sessionId) || null;
}

/**
 * Resets rate limit for a session (for testing).
 *
 * @param {string} sessionId - Session identifier
 */
function resetRateLimit(sessionId) {
  rateLimitMap.delete(sessionId);
}

module.exports = {
  checkRateLimit,
  getRateLimitStatus,
  resetRateLimit,
};
