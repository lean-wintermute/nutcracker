/**
 * Firestore-based rate limiter for Imagine Bar
 *
 * Tracks:
 * - Session limit: 5 stories per 4-hour session
 * - Daily spend cap: $20 per user per day
 * - Feature flag: Test deployment whitelist
 */

const LIMITS = {
  storiesPerSession: 5,
  sessionTtlMs: 4 * 60 * 60 * 1000, // 4 hours
  dailySpendCap: 20.00, // $20 USD
  costPerStory: 0.01, // ~$0.01 per story (narrative + TTS)
};

/**
 * Check if user can generate a story.
 * Validates session limit, daily spend, and feature access.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {string} userId - Firebase Auth UID
 * @returns {Promise<{allowed: boolean, reason?: string, remaining?: number}>}
 */
async function checkCanGenerate(db, userId) {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // 1. Check feature flag / test user whitelist
  const configDoc = await db.collection('imagine_config').doc('settings').get();
  if (configDoc.exists) {
    const config = configDoc.data();

    // Feature disabled globally
    if (config.enabled === false) {
      return { allowed: false, reason: 'Feature is currently disabled' };
    }

    // Test mode: only whitelisted users
    if (config.testMode === true) {
      const whitelist = config.testUsers || [];
      if (!whitelist.includes(userId)) {
        return { allowed: false, reason: 'Feature in test mode' };
      }
    }
  }

  // 2. Check daily spend cap
  const spendRef = db.collection('imagine_spend').doc(`${userId}_${today}`);
  const spendDoc = await spendRef.get();

  if (spendDoc.exists) {
    const spend = spendDoc.data();
    if (spend.total >= LIMITS.dailySpendCap) {
      return {
        allowed: false,
        reason: 'Daily limit reached. Try again tomorrow.',
        resetAt: getEndOfDay()
      };
    }
  }

  // 3. Check session limit (5 per 4 hours)
  const sessionRef = db.collection('imagine_sessions').doc(userId);
  const sessionDoc = await sessionRef.get();

  if (sessionDoc.exists) {
    const session = sessionDoc.data();
    const sessionExpired = now > session.resetAt;

    if (!sessionExpired && session.count >= LIMITS.storiesPerSession) {
      const resetTime = new Date(session.resetAt);
      return {
        allowed: false,
        reason: `Session limit reached (${LIMITS.storiesPerSession} stories). Try again after ${resetTime.toLocaleTimeString()}.`,
        resetAt: session.resetAt,
        remaining: 0
      };
    }
  }

  return { allowed: true };
}

/**
 * Record a story generation (increment counters).
 * Call this AFTER successful generation.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {string} userId - Firebase Auth UID
 * @param {number} cost - Estimated cost of this generation
 */
async function recordGeneration(db, userId, cost = LIMITS.costPerStory) {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const admin = require('firebase-admin');

  // Update session counter
  const sessionRef = db.collection('imagine_sessions').doc(userId);
  const sessionDoc = await sessionRef.get();

  if (sessionDoc.exists) {
    const session = sessionDoc.data();
    const sessionExpired = now > session.resetAt;

    if (sessionExpired) {
      // Start new session
      await sessionRef.set({
        count: 1,
        resetAt: now + LIMITS.sessionTtlMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Increment existing session
      await sessionRef.update({
        count: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  } else {
    // First story in session
    await sessionRef.set({
      count: 1,
      resetAt: now + LIMITS.sessionTtlMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Update daily spend
  const spendRef = db.collection('imagine_spend').doc(`${userId}_${today}`);
  const spendDoc = await spendRef.get();

  if (spendDoc.exists) {
    await spendRef.update({
      total: admin.firestore.FieldValue.increment(cost),
      count: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    await spendRef.set({
      userId,
      date: today,
      total: cost,
      count: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

/**
 * Get remaining stories for user's current session.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {string} userId - Firebase Auth UID
 * @returns {Promise<{remaining: number, resetAt?: number}>}
 */
async function getSessionStatus(db, userId) {
  const now = Date.now();
  const sessionRef = db.collection('imagine_sessions').doc(userId);
  const sessionDoc = await sessionRef.get();

  if (!sessionDoc.exists) {
    return { remaining: LIMITS.storiesPerSession };
  }

  const session = sessionDoc.data();
  const sessionExpired = now > session.resetAt;

  if (sessionExpired) {
    return { remaining: LIMITS.storiesPerSession };
  }

  return {
    remaining: Math.max(0, LIMITS.storiesPerSession - session.count),
    resetAt: session.resetAt
  };
}

/**
 * Get end of current day in milliseconds.
 */
function getEndOfDay() {
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return endOfDay.getTime();
}

module.exports = {
  checkCanGenerate,
  recordGeneration,
  getSessionStatus,
  LIMITS
};
