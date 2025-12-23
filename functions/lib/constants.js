/**
 * Constants for Nutcracker Imagine Scenes
 *
 * Centralized configuration for rate limits, costs, and timeouts.
 */

const LIMITS = {
  // User quota
  userDailyImages: 24,
  seedMaxLength: 40,

  // Global budget
  globalDailyBudget: 20.00,  // $20 cap per day
  imageCost: 0.134,          // gemini-3-pro-image-preview per image
  enhancementCost: 0.02,     // gemini-2.5-pro per enhancement (estimated)

  // Rate limiting
  maxConcurrentPerUser: 2,
};

const TIMEOUTS = {
  imageGeneration: 90000,    // 90 seconds
  textEnhancement: 10000,    // 10 seconds
  storageUpload: 30000,      // 30 seconds
};

const MODELS = {
  textEnhancement: 'gemini-2.5-pro',
  imageGeneration: 'gemini-2.0-flash-exp',  // Image-capable model
};

const STYLE_SUFFIXES = {
  default: 'in the style of modern animation, warm lighting, high quality digital art',
  illustration: 'as a gentle watercolor illustration, soft edges, muted palette, family-friendly',
  storybook: 'in classic storybook illustration style, detailed yet whimsical, nostalgic',
  minimal: 'in minimalist style, clean lines, simple shapes, soft colors',
  cozy: 'in a cozy, warm atmosphere, soft lighting, comfortable setting',
  adventure: 'in an adventurous scene, dynamic composition, exciting atmosphere',
};

const BLOCKLIST = [
  'ignore previous',
  'system prompt',
  'jailbreak',
  'bypass',
  'pretend',
  'roleplay as',
  'act as',
  'ignore instructions',
  'disregard',
  'override',
  'new instructions',
  'forget everything',
];

module.exports = {
  LIMITS,
  TIMEOUTS,
  MODELS,
  STYLE_SUFFIXES,
  BLOCKLIST,
};
