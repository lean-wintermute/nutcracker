/**
 * Tests for animals.js module
 * TDD: These tests are written before implementation
 */

const { getAnimal, getEnabledAnimals, validateAnimalId } = require('../lib/animals');

describe('animals module', () => {
  describe('getAnimal', () => {
    it('should return whale configuration', () => {
      const whale = getAnimal('whale');
      expect(whale).toBeDefined();
      expect(whale.id).toBe('whale');
      expect(whale.displayName).toBe('Whale');
      expect(whale.promptPrefix).toContain('whale');
      expect(Array.isArray(whale.styleHints)).toBe(true);
      expect(whale.enabled).toBe(true);
    });

    it('should return panda configuration', () => {
      const panda = getAnimal('panda');
      expect(panda).toBeDefined();
      expect(panda.id).toBe('panda');
      expect(panda.displayName).toBe('Panda');
      expect(panda.enabled).toBe(true);
    });

    it('should return bear configuration', () => {
      const bear = getAnimal('bear');
      expect(bear).toBeDefined();
      expect(bear.id).toBe('bear');
      expect(bear.displayName).toBe('Bear');
      expect(bear.enabled).toBe(true);
    });

    it('should return lion configuration', () => {
      const lion = getAnimal('lion');
      expect(lion).toBeDefined();
      expect(lion.id).toBe('lion');
      expect(lion.displayName).toBe('Lion');
      expect(lion.enabled).toBe(true);
    });

    it('should return null for unknown animal', () => {
      const unknown = getAnimal('dragon');
      expect(unknown).toBeNull();
    });

    it('should return null for empty string', () => {
      const empty = getAnimal('');
      expect(empty).toBeNull();
    });

    it('should return null for null input', () => {
      const nullResult = getAnimal(null);
      expect(nullResult).toBeNull();
    });
  });

  describe('getEnabledAnimals', () => {
    it('should return array of enabled animals', () => {
      const animals = getEnabledAnimals();
      expect(Array.isArray(animals)).toBe(true);
      expect(animals.length).toBeGreaterThanOrEqual(4);
    });

    it('should only include enabled animals', () => {
      const animals = getEnabledAnimals();
      animals.forEach(animal => {
        expect(animal.enabled).toBe(true);
      });
    });

    it('should include all core animals', () => {
      const animals = getEnabledAnimals();
      const ids = animals.map(a => a.id);
      expect(ids).toContain('whale');
      expect(ids).toContain('panda');
      expect(ids).toContain('bear');
      expect(ids).toContain('lion');
    });
  });

  describe('validateAnimalId', () => {
    it('should return true for valid whale id', () => {
      expect(validateAnimalId('whale')).toBe(true);
    });

    it('should return true for valid panda id', () => {
      expect(validateAnimalId('panda')).toBe(true);
    });

    it('should return true for valid bear id', () => {
      expect(validateAnimalId('bear')).toBe(true);
    });

    it('should return true for valid lion id', () => {
      expect(validateAnimalId('lion')).toBe(true);
    });

    it('should return false for unknown animal', () => {
      expect(validateAnimalId('dragon')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(validateAnimalId('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(validateAnimalId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(validateAnimalId(undefined)).toBe(false);
    });

    it('should return false for numeric input', () => {
      expect(validateAnimalId(123)).toBe(false);
    });
  });
});
