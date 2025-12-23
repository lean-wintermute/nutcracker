/**
 * Gemini API client for Imagine Bar
 *
 * Handles:
 * - Narrative generation (gemini-2.5-pro)
 * - Text-to-speech (gemini-2.5-pro-preview-tts)
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Models validated against dev_tools_core
const MODELS = {
  narrative: 'gemini-2.5-pro',
  tts: 'gemini-2.5-pro-preview-tts'
};

// TTS configuration
const TTS_CONFIG = {
  voice: 'Kore', // Warm, friendly voice
  sampleRate: 24000,
  channels: 1,
  bitsPerSample: 16
};

/**
 * Generate a narrative story for an image.
 *
 * @param {string} apiKey - Gemini API key
 * @param {string} imageDescription - Description of the image from catalog
 * @returns {Promise<string>} Generated narrative (150-200 words)
 */
async function generateNarrative(apiKey, imageDescription) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODELS.narrative });

  const prompt = `You are a warm, imaginative storyteller creating a brief audio story for a gallery visitor.

Based on this image description, create a 150-200 word narrative that:
- Draws the listener into the scene
- Uses sensory details (sounds, textures, atmosphere)
- Has a gentle, whimsical tone suitable for all ages
- Ends with a moment of wonder or quiet reflection

Image description: ${imageDescription}

Write only the narrative text, no titles or stage directions. The story will be read aloud.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  if (!text || text.trim().length === 0) {
    throw new Error('Empty narrative response from Gemini');
  }

  return text.trim();
}

/**
 * Generate TTS audio from narrative text.
 *
 * @param {string} apiKey - Gemini API key
 * @param {string} narrative - Text to convert to speech
 * @returns {Promise<string>} Base64-encoded PCM audio (24kHz, 16-bit mono)
 */
async function generateTTS(apiKey, narrative) {
  const genAI = new GoogleGenerativeAI(apiKey);

  // TTS uses special model with speech config
  const model = genAI.getGenerativeModel({
    model: MODELS.tts,
    generationConfig: {
      response_modalities: ['AUDIO'],
      speech_config: {
        voice_config: {
          prebuilt_voice_config: {
            voice_name: TTS_CONFIG.voice
          }
        }
      }
    }
  });

  const result = await model.generateContent(narrative);
  const response = result.response;

  // Extract audio from response
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('No TTS response candidates');
  }

  const parts = candidates[0].content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('No TTS response parts');
  }

  // Find inline_data part with audio
  const audioPart = parts.find(p => p.inline_data?.mime_type?.startsWith('audio/'));
  if (!audioPart) {
    throw new Error('No audio data in TTS response');
  }

  return audioPart.inline_data.data; // Base64 PCM
}

/**
 * Calculate audio duration from base64 PCM data.
 *
 * @param {string} base64Audio - Base64-encoded PCM audio
 * @returns {number} Duration in seconds
 */
function calculateAudioDuration(base64Audio) {
  const byteLength = (base64Audio.length * 3) / 4; // Approximate decoded size
  const bytesPerSecond = TTS_CONFIG.sampleRate * TTS_CONFIG.channels * (TTS_CONFIG.bitsPerSample / 8);
  return byteLength / bytesPerSecond;
}

module.exports = {
  generateNarrative,
  generateTTS,
  calculateAudioDuration,
  MODELS,
  TTS_CONFIG
};
