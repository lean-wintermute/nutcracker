/**
 * Gemini API client for Nutcracker Imagine Scenes
 *
 * Provides text enhancement and image generation via Google Gemini API.
 * Follows same patterns as anthropic.js for consistency.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MODELS } = require('./constants');

let genAI = null;

/**
 * Get Gemini API key from environment.
 * Supports multiple env var names for flexibility.
 * For local dev: export GEMINI_API_KEY=$(security find-generic-password -s gemini_nutcracker -w)
 * @returns {string|undefined} API key
 */
function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
}

/**
 * Initialize the Gemini client with API key
 * @param {string} apiKey - Gemini API key (optional, will use env if not provided)
 */
function initializeGemini(apiKey) {
  const key = apiKey || getApiKey();
  if (!key) {
    throw new Error('Gemini API key is required. Set GEMINI_API_KEY env var or pass key to initializeGemini()');
  }
  genAI = new GoogleGenerativeAI(key);
}

/**
 * Get initialized Gemini client
 * @returns {GoogleGenerativeAI} Gemini client
 */
function getClient() {
  if (!genAI) {
    const apiKey = getApiKey();
    if (apiKey) {
      initializeGemini(apiKey);
    } else {
      throw new Error('Gemini client not initialized. Set GEMINI_API_KEY or call initializeGemini() first.');
    }
  }
  return genAI;
}

/**
 * Call Gemini for text generation (prompt enhancement)
 * @param {string} prompt - The prompt to send
 * @param {string} model - Model to use (default: gemini-2.5-pro)
 * @returns {Promise<string>} Generated text
 */
async function callGeminiText(prompt, model = MODELS.textEnhancement) {
  const client = getClient();
  const generativeModel = client.getGenerativeModel({ model });

  const result = await generativeModel.generateContent(prompt);
  const response = result.response;

  return response.text();
}

/**
 * Call Gemini for image generation
 * @param {string} prompt - Image generation prompt
 * @param {Object} config - Configuration options
 * @param {string} config.model - Model to use
 * @param {Array<string>} config.responseModalities - Response types (TEXT, IMAGE)
 * @returns {Promise<Object>} Generated image data
 */
async function callGeminiImage(prompt, config = {}) {
  const client = getClient();
  const model = config.model || MODELS.imageGeneration;

  const generativeModel = client.getGenerativeModel({
    model,
    generationConfig: {
      responseModalities: config.responseModalities || ['TEXT', 'IMAGE'],
    },
  });

  const result = await generativeModel.generateContent(prompt);
  const response = result.response;

  // Check for candidates
  if (!response.candidates || response.candidates.length === 0) {
    throw new Error('No candidates in response');
  }

  const candidate = response.candidates[0];
  const parts = candidate.content?.parts || [];

  // Find image data
  const imagePart = parts.find(part => part.inlineData);
  if (!imagePart) {
    throw new Error('No image generated');
  }

  // Find text description if present
  const textPart = parts.find(part => part.text);

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
    text: textPart?.text || '',
  };
}

module.exports = {
  getApiKey,
  initializeGemini,
  getClient,
  callGeminiText,
  callGeminiImage,
};
