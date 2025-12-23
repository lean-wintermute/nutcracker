/**
 * Storage Management module for Nutcracker Imagine Scenes
 *
 * Handles Firebase Storage uploads and signed URL generation.
 */

const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

/**
 * Upload an image to Firebase Storage
 *
 * @param {string} base64Data - Base64 encoded image data
 * @param {string} mimeType - Image MIME type (e.g., 'image/png')
 * @param {Object} metadata - Image metadata
 * @param {string} metadata.userId - User ID
 * @param {string} metadata.animal - Animal identifier
 * @param {string} metadata.seed - Original seed text
 * @returns {Promise<Object>} Upload result with path and signed URL
 */
async function uploadImage(base64Data, mimeType, metadata) {
  const bucket = admin.storage().bucket();
  const fileId = uuidv4();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const filename = `imagined/${metadata.userId}/${fileId}.${extension}`;
  const file = bucket.file(filename);

  // Decode base64 to buffer
  const buffer = Buffer.from(base64Data, 'base64');

  // Upload with metadata
  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      metadata: {
        animal: metadata.animal,
        seed: metadata.seed,
        generatedAt: new Date().toISOString(),
      },
    },
  });

  // Generate signed URL (valid for 7 days)
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + sevenDays,
  });

  return {
    path: filename,
    url: signedUrl,
  };
}

/**
 * Delete an image from storage
 *
 * @param {string} path - Storage path to delete
 */
async function deleteImage(path) {
  try {
    const bucket = admin.storage().bucket();
    await bucket.file(path).delete();
  } catch (error) {
    // Log but don't throw - deletion errors are non-critical
    console.error('Failed to delete image:', { path, error: error.message });
  }
}

/**
 * Refresh signed URL for an existing image
 *
 * @param {string} path - Storage path
 * @returns {Promise<string>} New signed URL
 */
async function refreshSignedUrl(path) {
  const bucket = admin.storage().bucket();
  const file = bucket.file(path);

  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + sevenDays,
  });

  return signedUrl;
}

module.exports = {
  uploadImage,
  deleteImage,
  refreshSignedUrl,
};
