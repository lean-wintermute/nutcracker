/**
 * Main handler for Imagine Bar story generation
 *
 * Orchestrates:
 * - Authentication check
 * - Image validation
 * - Rate limiting + spend cap
 * - Narrative generation
 * - TTS generation
 * - Logging
 */

const admin = require('firebase-admin');
const { checkCanGenerate, recordGeneration, getSessionStatus, LIMITS } = require('./rate-limiter');
const { generateNarrative, generateTTS, calculateAudioDuration } = require('./gemini');
const { validateImageId, getImageDescription, getImageTitle } = require('./validator');

/**
 * Handle a story generation request.
 *
 * @param {Object} body - Request body
 * @param {string} body.imageId - Image ID from catalog
 * @param {string} userId - Firebase Auth UID (from request.auth)
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {string} geminiKey - Gemini API key
 * @returns {Promise<Object>} Response with audio and metadata
 */
async function handleGenerateStory(body, userId, db, geminiKey) {
  const startTime = Date.now();
  const { imageId } = body;

  console.log('[ImagineBar] Request started', { userId, imageId });

  // 1. Validate imageId
  const validation = validateImageId(imageId);
  if (!validation.valid) {
    return {
      error: true,
      code: 'invalid-argument',
      message: validation.error
    };
  }

  // 2. Check rate limit and spend cap
  const canGenerate = await checkCanGenerate(db, userId);
  if (!canGenerate.allowed) {
    return {
      error: true,
      code: 'resource-exhausted',
      message: canGenerate.reason
    };
  }

  // 3. Get image description
  const imageDescription = getImageDescription(imageId);
  if (!imageDescription) {
    console.error('[ImagineBar] Description not found for validated imageId', { imageId });
    return {
      error: true,
      code: 'internal',
      message: 'Image description not found'
    };
  }

  const imageTitle = getImageTitle(imageId);

  try {
    // 4. Generate narrative
    console.log('[ImagineBar] Generating narrative', { userId, imageId });
    const narrative = await generateNarrative(geminiKey, imageDescription);
    console.log('[ImagineBar] Narrative generated', {
      userId,
      imageId,
      length: narrative.length
    });

    // 5. Generate TTS
    console.log('[ImagineBar] Generating TTS', { userId, imageId });
    const audioBase64 = await generateTTS(geminiKey, narrative);
    const duration = calculateAudioDuration(audioBase64);
    console.log('[ImagineBar] TTS generated', {
      userId,
      imageId,
      duration: duration.toFixed(1)
    });

    // 6. Record generation (increment counters)
    await recordGeneration(db, userId, LIMITS.costPerStory);

    // 7. Get updated session status
    const status = await getSessionStatus(db, userId);

    // 8. Log to Firestore
    await logGeneration(db, {
      userId,
      imageId,
      imageTitle,
      narrativeLength: narrative.length,
      audioDuration: duration,
      elapsedMs: Date.now() - startTime
    });

    console.log('[ImagineBar] Request completed', {
      userId,
      imageId,
      duration: duration.toFixed(1),
      elapsedMs: Date.now() - startTime,
      remaining: status.remaining
    });

    return {
      audioBase64,
      duration,
      imageTitle,
      remaining: status.remaining
    };

  } catch (error) {
    console.error('[ImagineBar] Generation failed', {
      userId,
      imageId,
      error: error.message
    });

    // Log error
    await logGeneration(db, {
      userId,
      imageId,
      error: error.message,
      elapsedMs: Date.now() - startTime
    });

    return {
      error: true,
      code: 'internal',
      message: 'Story generation failed. Please try again.'
    };
  }
}

/**
 * Log generation attempt to Firestore.
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {Object} data - Log data
 */
async function logGeneration(db, data) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 day TTL

  try {
    await db.collection('imagine_logs').add({
      ...data,
      expiresAt,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    // Log error but don't fail the request
    console.error('[ImagineBar] Firestore logging error:', error.message);
  }
}

module.exports = { handleGenerateStory };
