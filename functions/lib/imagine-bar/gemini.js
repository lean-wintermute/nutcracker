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
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: TTS_CONFIG.voice
          }
        }
      }
    }
  });

  const result = await model.generateContent(narrative);
  const response = result.response;

  // Debug log the full response structure
  console.log('[ImagineBar TTS Debug] Response candidates:', JSON.stringify(response.candidates, null, 2).substring(0, 2000));

  // Extract audio from response
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('No TTS response candidates');
  }

  const parts = candidates[0].content?.parts;
  if (!parts || parts.length === 0) {
    console.log('[ImagineBar TTS Debug] Candidate content:', JSON.stringify(candidates[0].content, null, 2));
    throw new Error('No TTS response parts');
  }

  console.log('[ImagineBar TTS Debug] Parts:', parts.map(p => ({ 
    hasInlineData: !!p.inline_data || !!p.inlineData,
    mimeType: p.inline_data?.mime_type || p.inline_data?.mimeType || p.inlineData?.mimeType,
    dataLength: (p.inline_data?.data || p.inlineData?.data)?.length || 0
  })));

  // Find inline_data part with audio (check both snake_case and camelCase)
  const audioPart = parts.find(p => {
    const inlineData = p.inline_data || p.inlineData;
    const mimeType = inlineData?.mime_type || inlineData?.mimeType;
    return mimeType?.startsWith('audio/');
  });

  if (!audioPart) {
    throw new Error('No audio data in TTS response');
  }

  const inlineData = audioPart.inline_data || audioPart.inlineData;
  return inlineData.data; // Base64 PCM
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
