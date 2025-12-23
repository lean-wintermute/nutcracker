/**
 * Quota Management module for Nutcracker Imagine Scenes
 *
 * Implements atomic reserve-then-confirm pattern to prevent race conditions.
 * Tracks per-user daily quota and global budget cap.
 */

const admin = require('firebase-admin');
const { LIMITS } = require('./constants');

/**
 * Get date string in YYYY-MM-DD format
 * @returns {string} Current date string
 */
function getDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Get seconds until midnight (quota reset)
 * @returns {number} Seconds until midnight UTC
 */
function getSecondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.ceil((midnight - now) / 1000);
}

/**
 * Reserve a quota slot atomically BEFORE image generation.
 * Uses Firestore transaction to prevent race conditions.
 *
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Reservation result
 */
async function reserveQuota(userId) {
  const db = admin.firestore();
  const today = getDateString();

  return await db.runTransaction(async (transaction) => {
    const userRef = db.collection('imagine_users').doc(userId);
    const budgetRef = db.collection('system').doc(`budget_${today}`);

    const [userDoc, budgetDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(budgetRef),
    ]);

    let userData = userDoc.data() || {
      imagesGenerated: 0,
      reserved: 0,
      lastReset: today,
    };
    const budgetData = budgetDoc.data() || { spent: 0, reserved: 0 };

    // Reset if new day
    if (userData.lastReset !== today) {
      userData = {
        imagesGenerated: 0,
        reserved: 0,
        lastReset: today,
      };
    }

    // Check user quota (including pending reservations)
    const totalUser = userData.imagesGenerated + userData.reserved;
    if (totalUser >= LIMITS.userDailyImages) {
      return {
        allowed: false,
        reason: 'daily_limit',
        retryAfter: getSecondsUntilMidnight(),
      };
    }

    // Check global budget (including pending)
    const totalBudget = budgetData.spent + budgetData.reserved;
    if (totalBudget >= LIMITS.globalDailyBudget) {
      return {
        allowed: false,
        reason: 'budget_cap',
        retryAfter: getSecondsUntilMidnight(),
      };
    }

    // Reserve slot atomically
    const reservationId = `${userId}_${Date.now()}`;

    transaction.set(userRef, {
      ...userData,
      reserved: (userData.reserved || 0) + 1,
      lastReservation: reservationId,
    }, { merge: true });

    transaction.set(budgetRef, {
      ...budgetData,
      reserved: (budgetData.reserved || 0) + LIMITS.imageCost,
    }, { merge: true });

    return {
      allowed: true,
      reservationId,
      remaining: LIMITS.userDailyImages - totalUser - 1,
    };
  });
}

/**
 * Confirm a reservation after successful image generation.
 * Moves from reserved to confirmed counts.
 *
 * @param {string} userId - User ID
 * @param {string} reservationId - Reservation ID from reserveQuota
 */
async function confirmReservation(userId, _reservationId) {
  const db = admin.firestore();
  const today = getDateString();

  await db.runTransaction(async (transaction) => {
    const userRef = db.collection('imagine_users').doc(userId);
    const budgetRef = db.collection('system').doc(`budget_${today}`);

    const [userDoc, budgetDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(budgetRef),
    ]);

    const userData = userDoc.data() || { imagesGenerated: 0, reserved: 0 };
    const budgetData = budgetDoc.data() || { spent: 0, reserved: 0 };

    // Move from reserved to confirmed
    transaction.set(userRef, {
      imagesGenerated: (userData.imagesGenerated || 0) + 1,
      reserved: Math.max(0, (userData.reserved || 0) - 1),
      lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(budgetRef, {
      spent: (budgetData.spent || 0) + LIMITS.imageCost,
      reserved: Math.max(0, (budgetData.reserved || 0) - LIMITS.imageCost),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

/**
 * Release a reservation on failure (rollback).
 * Decrements reserved counts without incrementing confirmed.
 *
 * @param {string} userId - User ID
 * @param {string} reservationId - Reservation ID from reserveQuota
 */
async function releaseReservation(userId, _reservationId) {
  const db = admin.firestore();
  const today = getDateString();

  await db.runTransaction(async (transaction) => {
    const userRef = db.collection('imagine_users').doc(userId);
    const budgetRef = db.collection('system').doc(`budget_${today}`);

    const [userDoc, budgetDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(budgetRef),
    ]);

    const userData = userDoc.data() || { reserved: 0 };
    const budgetData = budgetDoc.data() || { reserved: 0 };

    // Release reservation (decrement reserved only)
    transaction.set(userRef, {
      reserved: Math.max(0, (userData.reserved || 0) - 1),
    }, { merge: true });

    transaction.set(budgetRef, {
      reserved: Math.max(0, (budgetData.reserved || 0) - LIMITS.imageCost),
    }, { merge: true });
  });
}

/**
 * Get current quota status for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Quota status
 */
async function getQuotaStatus(userId) {
  const db = admin.firestore();
  const today = getDateString();

  const userDoc = await db.collection('imagine_users').doc(userId).get();
  const userData = userDoc.data() || { imagesGenerated: 0, reserved: 0, lastReset: today };

  // Reset if new day
  if (userData.lastReset !== today) {
    return {
      used: 0,
      remaining: LIMITS.userDailyImages,
      limit: LIMITS.userDailyImages,
    };
  }

  const used = userData.imagesGenerated + userData.reserved;
  return {
    used,
    remaining: Math.max(0, LIMITS.userDailyImages - used),
    limit: LIMITS.userDailyImages,
  };
}

module.exports = {
  LIMITS,
  reserveQuota,
  confirmReservation,
  releaseReservation,
  getQuotaStatus,
  getDateString,
  getSecondsUntilMidnight,
};
