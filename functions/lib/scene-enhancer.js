/**
 * Scene Enhancement module for Nutcracker Imagine Scenes
 *
 * Uses VALOR-style prompt enhancement - redirects and improves
 * user input rather than blocking. Maintains intent while adding
 * visual details for image generation.
 */

const { getAnimal } = require('./animals');
const { callGeminiText } = require('./gemini');
const { LIMITS, BLOCKLIST, MODELS } = require('./constants');

/**
 * Enhancement prompt template for scene descriptions.
 * Uses VALOR approach: redirect and enhance, don't block.
 */
const ENHANCEMENT_PROMPT = `You are a scene description enhancer for a children's illustration app.
Given a short seed phrase, expand it into a detailed, family-friendly scene description.

Rules:
- Keep the core intent of the seed phrase
- Add visual details (lighting, composition, mood, setting)
- Ensure child-appropriate content
- Include the specified animal naturally in the scene
- If the seed seems inappropriate, redirect to something wholesome but similar
- Output 2-3 sentences maximum

Animal: {animal}
Animal Style Hints: {styleHints}
User Seed: {seed}

Enhanced scene description:`;

/**
 * Check if seed contains blocked content (injection attempts)
 * @param {string} seed - User seed input
 * @returns {boolean} True if blocked content found
 */
function containsBlockedContent(seed) {
  if (!seed) return false;

  const lowerSeed = seed.toLowerCase();
  return BLOCKLIST.some(blocked => lowerSeed.includes(blocked.toLowerCase()));
}

/**
 * Validate seed input
 * @param {string} seed - User seed input
 * @throws {Error} If seed is invalid
 */
function validateSeed(seed) {
  if (seed === null || seed === undefined) {
    throw new Error('Seed is required');
  }

  if (typeof seed !== 'string') {
    throw new Error('Seed must be a string');
  }

  const trimmed = seed.trim();
  if (trimmed.length === 0) {
    throw new Error('Seed cannot be empty');
  }

  if (seed.length > LIMITS.seedMaxLength) {
    throw new Error(`Seed must be ${LIMITS.seedMaxLength} characters or less`);
  }
}

/**
 * Enhance a user's scene seed into a detailed prompt
 * @param {string} animal - Animal identifier
 * @param {string} seed - User's scene seed (max 40 chars)
 * @returns {Promise<Object>} Enhanced scene data
 */
async function enhanceScene(animal, seed) {
  // 1. Validate seed
  validateSeed(seed);

  // 2. Check for blocked content (injection attempts)
  if (containsBlockedContent(seed)) {
    throw new Error('Seed contains blocked content');
  }

  // 3. Get animal configuration
  const animalConfig = getAnimal(animal);
  if (!animalConfig) {
    throw new Error(`Invalid animal: ${animal}`);
  }

  // 4. Build enhancement prompt
  const prompt = ENHANCEMENT_PROMPT
    .replace('{animal}', animalConfig.promptPrefix)
    .replace('{styleHints}', animalConfig.styleHints.join(', '))
    .replace('{seed}', seed.trim());

  // 5. Call Gemini for enhancement
  const enhanced = await callGeminiText(prompt, MODELS.textEnhancement);

  // 6. Return enhanced result
  return {
    original: seed.trim(),
    enhanced: enhanced.trim(),
    animal: animal,
    animalConfig: animalConfig,
  };
}

module.exports = {
  enhanceScene,
  validateSeed,
  containsBlockedContent,
  ENHANCEMENT_PROMPT,
};
