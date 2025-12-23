/**
 * Image ID validation for Imagine Bar
 *
 * Security layer to prevent:
 * - Path traversal attacks
 * - Prompt injection via imageId
 * - Arbitrary content requests
 */

// Image catalog is loaded at cold start
let imageDescriptions = null;
let validImageIds = null;

// Regex for valid image ID format
// Allows: alphanumeric, underscores, hyphens, must end with .png
const IMAGE_ID_PATTERN = /^[\w-]+\.png$/;

/**
 * Load image descriptions catalog.
 * Called once per cold start.
 *
 * @param {Object} catalog - The image-descriptions.json content
 */
function loadCatalog(catalog) {
  imageDescriptions = catalog;
  validImageIds = new Set(Object.keys(catalog));
  console.log(`[ImagineBar] Loaded ${validImageIds.size} images`);
}

/**
 * Validate an imageId against the catalog.
 *
 * @param {*} imageId - The image ID to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateImageId(imageId) {
  // Type check
  if (typeof imageId !== 'string') {
    return { valid: false, error: 'imageId must be a string' };
  }

  // Empty check
  if (imageId.length === 0) {
    return { valid: false, error: 'imageId cannot be empty' };
  }

  // Length check (prevent DoS with very long strings)
  if (imageId.length > 100) {
    return { valid: false, error: 'imageId is too long' };
  }

  // Format check (prevents path traversal, injection attempts)
  if (!IMAGE_ID_PATTERN.test(imageId)) {
    console.warn('[ImagineBar] Invalid imageId format:', imageId.substring(0, 50));
    return { valid: false, error: 'Invalid imageId format' };
  }

  // Catalog existence check
  if (!validImageIds || !validImageIds.has(imageId)) {
    console.warn('[ImagineBar] Unknown imageId:', imageId);
    return { valid: false, error: 'Unknown image' };
  }

  return { valid: true };
}

/**
 * Get the description for a validated image ID.
 *
 * @param {string} imageId - A validated image ID
 * @returns {string|null} The image description or null
 */
function getImageDescription(imageId) {
  if (!imageDescriptions) {
    console.error('[ImagineBar] Catalog not loaded');
    return null;
  }
  return imageDescriptions[imageId] || null;
}

/**
 * Get display title for an image.
 * Converts "01_train_platform.png" -> "Train Platform"
 *
 * @param {string} imageId - A validated image ID
 * @returns {string} Human-readable title
 */
function getImageTitle(imageId) {
  return imageId
    .replace(/\.png$/, '')           // Remove extension
    .replace(/^\d+_/, '')            // Remove leading number prefix
    .replace(/_/g, ' ')              // Replace underscores with spaces
    .replace(/\b\w/g, c => c.toUpperCase()); // Title case
}

/**
 * Get count of images in catalog.
 *
 * @returns {number}
 */
function getImageCount() {
  return validImageIds ? validImageIds.size : 0;
}

module.exports = {
  loadCatalog,
  validateImageId,
  getImageDescription,
  getImageTitle,
  getImageCount
};
