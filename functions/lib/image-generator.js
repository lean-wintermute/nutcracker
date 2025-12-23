/**
 * Image Generation module for Nutcracker Imagine Scenes
 *
 * Handles image generation with safety retry (illustration style fallback)
 * and exponential backoff for transient errors.
 */

const { callGeminiImage } = require('./gemini');
const { STYLE_SUFFIXES, MODELS } = require('./constants');

/**
 * Sleep utility for backoff delays
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a safety/content policy error
 * @param {Error} error - Error to check
 * @returns {boolean} True if safety error
 */
function isSafetyError(error) {
  if (!error) return false;

  const message = error.message || '';
  const code = error.code || '';

  return (
    message.includes('SAFETY') ||
    message.includes('content policy') ||
    message.includes('blocked') ||
    code === 'CONTENT_POLICY_VIOLATION' ||
    code === 'SAFETY'
  );
}

/**
 * Check if error is a transient error (should retry)
 * @param {Error} error - Error to check
 * @returns {boolean} True if transient error
 */
function isTransientError(error) {
  if (!error) return false;

  const code = error.code || error.status || 0;
  const message = error.message || '';

  // HTTP status codes
  if (code === 429 || code === 503 || code === 504) {
    return true;
  }

  // Network errors
  if (
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    message.includes('timeout')
  ) {
    return true;
  }

  return false;
}

/**
 * Generate image with retry logic
 *
 * Retry strategies:
 * - Safety errors: Single retry with 'illustration' style (softer)
 * - Transient errors: Exponential backoff, max 3 attempts
 * - Other errors: Fail immediately
 *
 * @param {string} enhancedPrompt - Enhanced scene prompt
 * @param {string} animal - Animal identifier
 * @param {Object} options - Generation options
 * @param {string} options.style - Style key (default, illustration, storybook, etc.)
 * @param {number} options.attempt - Current attempt number (internal)
 * @returns {Promise<Object>} Generated image data
 */
async function generateImage(enhancedPrompt, animal, options = {}) {
  const styleKey = options.style || 'default';
  const attempt = options.attempt || 1;
  const maxAttempts = 3;

  // Build full prompt with style suffix
  const styleSuffix = STYLE_SUFFIXES[styleKey] || STYLE_SUFFIXES.default;
  const fullPrompt = `${enhancedPrompt} ${styleSuffix}`;

  try {
    const result = await callGeminiImage(fullPrompt, {
      model: MODELS.imageGeneration,
      responseModalities: ['TEXT', 'IMAGE'],
    });

    return result;
  } catch (error) {
    // Safety error: retry with softer illustration style (only once)
    if (isSafetyError(error) && styleKey === 'default') {
      console.log('Safety filter triggered, retrying with illustration style');
      return generateImage(enhancedPrompt, animal, {
        style: 'illustration',
        attempt: 1,  // Reset attempt counter for style change
      });
    }

    // Transient error: exponential backoff
    if (isTransientError(error) && attempt < maxAttempts) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);  // 2s, 4s, max 10s
      console.log(`Transient error (attempt ${attempt}/${maxAttempts}), retrying in ${backoffMs}ms`);
      await sleep(backoffMs);
      return generateImage(enhancedPrompt, animal, {
        ...options,
        attempt: attempt + 1,
      });
    }

    // Non-retryable or max attempts reached
    throw error;
  }
}

/**
 * Get a random style for variety in generated images
 * @returns {string} Random style key
 */
function getRandomStyle() {
  const styles = Object.keys(STYLE_SUFFIXES);
  return styles[Math.floor(Math.random() * styles.length)];
}

module.exports = {
  generateImage,
  isSafetyError,
  isTransientError,
  getRandomStyle,
  STYLE_SUFFIXES,
};
