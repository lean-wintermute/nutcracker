/**
 * Animal configuration module for Nutcracker Imagine Scenes
 *
 * Provides animal definitions with prompt prefixes and style hints
 * for image generation. Extensible for new animals.
 */

const ANIMALS = {
  whale: {
    id: 'whale',
    displayName: 'Whale',
    promptPrefix: 'A gentle whale character',
    styleHints: ['ocean blue tones', 'massive but gentle', 'serene underwater feeling'],
    enabled: true,
  },
  panda: {
    id: 'panda',
    displayName: 'Panda',
    promptPrefix: 'A contemplative panda',
    styleHints: ['black and white contrast', 'bamboo forest aesthetic', 'peaceful demeanor'],
    enabled: true,
  },
  bear: {
    id: 'bear',
    displayName: 'Bear',
    promptPrefix: 'A thoughtful bear',
    styleHints: ['warm brown tones', 'forest setting', 'cozy atmosphere'],
    enabled: true,
  },
  lion: {
    id: 'lion',
    displayName: 'Lion',
    promptPrefix: 'A majestic lion',
    styleHints: ['golden mane', 'savanna warmth', 'regal presence'],
    enabled: true,
  },
};

/**
 * Get animal configuration by ID
 * @param {string} id - Animal identifier
 * @returns {Object|null} Animal configuration or null if not found
 */
function getAnimal(id) {
  if (!id || typeof id !== 'string') {
    return null;
  }
  return ANIMALS[id.toLowerCase()] || null;
}

/**
 * Get all enabled animals
 * @returns {Array} Array of enabled animal configurations
 */
function getEnabledAnimals() {
  return Object.values(ANIMALS).filter(animal => animal.enabled);
}

/**
 * Validate if an animal ID is valid and enabled
 * @param {string} id - Animal identifier
 * @returns {boolean} True if valid and enabled
 */
function validateAnimalId(id) {
  if (!id || typeof id !== 'string') {
    return false;
  }
  const animal = ANIMALS[id.toLowerCase()];
  return animal ? animal.enabled : false;
}

module.exports = {
  ANIMALS,
  getAnimal,
  getEnabledAnimals,
  validateAnimalId,
};
