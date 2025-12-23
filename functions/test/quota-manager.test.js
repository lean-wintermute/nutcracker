/**
 * Tests for quota-manager.js module
 * TDD: These tests are written before implementation
 */

// Mock firebase-admin
jest.mock('firebase-admin', () => ({
  firestore: Object.assign(
    jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({}),
      }),
      runTransaction: jest.fn(),
    }),
    {
      FieldValue: {
        serverTimestamp: jest.fn().mockReturnValue({ _methodName: 'serverTimestamp' }),
      },
    }
  ),
}));

describe('quota-manager module', () => {
  let mockFirestore;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Get fresh mock reference
    const admin = require('firebase-admin');
    mockFirestore = admin.firestore();

    // Setup transaction mock
    mockFirestore.runTransaction = jest.fn(async (callback) => {
      const transaction = {
        get: jest.fn(),
        set: jest.fn(),
      };
      return callback(transaction);
    });

    mockFirestore.collection = jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({}),
    });
  });

  describe('reserveQuota', () => {
    it('should allow reservation when under daily limit', async () => {
      const { reserveQuota, getDateString } = require('../lib/quota-manager');
      const today = getDateString();

      // Mock user has 5 images, 0 reserved
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn()
            .mockResolvedValueOnce({ data: () => ({ imagesGenerated: 5, reserved: 0, lastReset: today }) })
            .mockResolvedValueOnce({ data: () => ({ spent: 1.0, reserved: 0 }) }),
          set: jest.fn(),
        };
        return callback(transaction);
      });

      const result = await reserveQuota('user123');

      expect(result.allowed).toBe(true);
      expect(result.reservationId).toBeDefined();
      expect(result.remaining).toBeLessThanOrEqual(24);
    });

    it('should deny reservation when at daily limit', async () => {
      const { reserveQuota, getDateString } = require('../lib/quota-manager');
      const today = getDateString();

      // Mock user at limit
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn()
            .mockResolvedValueOnce({ data: () => ({ imagesGenerated: 24, reserved: 0, lastReset: today }) })
            .mockResolvedValueOnce({ data: () => ({ spent: 1.0, reserved: 0 }) }),
          set: jest.fn(),
        };
        return callback(transaction);
      });

      const result = await reserveQuota('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('daily_limit');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should count reserved slots in quota check', async () => {
      const { reserveQuota, getDateString } = require('../lib/quota-manager');
      const today = getDateString();

      // Mock user has 23 images + 1 reserved = at limit (24)
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn()
            .mockResolvedValueOnce({ data: () => ({ imagesGenerated: 23, reserved: 1, lastReset: today }) })
            .mockResolvedValueOnce({ data: () => ({ spent: 1.0, reserved: 0.134 }) }),
          set: jest.fn(),
        };
        return callback(transaction);
      });

      const result = await reserveQuota('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('daily_limit');
    });

    it('should deny when global budget exceeded', async () => {
      const { reserveQuota, getDateString } = require('../lib/quota-manager');
      const today = getDateString();

      // Mock budget at cap
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn()
            .mockResolvedValueOnce({ data: () => ({ imagesGenerated: 0, reserved: 0, lastReset: today }) })
            .mockResolvedValueOnce({ data: () => ({ spent: 20.0, reserved: 0 }) }),
          set: jest.fn(),
        };
        return callback(transaction);
      });

      const result = await reserveQuota('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('budget_cap');
    });

    it('should reset quota on new day', async () => {
      const { reserveQuota } = require('../lib/quota-manager');

      // Mock old lastReset date
      const oldDate = '2024-01-01';

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn()
            .mockResolvedValueOnce({ data: () => ({ imagesGenerated: 24, reserved: 0, lastReset: oldDate }) })
            .mockResolvedValueOnce({ data: () => ({ spent: 0, reserved: 0 }) }),
          set: jest.fn(),
        };
        return callback(transaction);
      });

      const result = await reserveQuota('user123');

      expect(result.allowed).toBe(true);
    });
  });

  describe('confirmReservation', () => {
    it('should move reserved to confirmed count', async () => {
      const { confirmReservation } = require('../lib/quota-manager');

      let userSetData;

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn()
            .mockResolvedValueOnce({ data: () => ({ imagesGenerated: 5, reserved: 1 }) })
            .mockResolvedValueOnce({ data: () => ({ spent: 1.0, reserved: 0.134 }) }),
          set: jest.fn((ref, data) => {
            if (!userSetData) userSetData = data;
          }),
        };
        return callback(transaction);
      });

      await confirmReservation('user123', 'res_123');

      expect(userSetData.imagesGenerated).toBe(6);
      expect(userSetData.reserved).toBe(0);
    });
  });

  describe('releaseReservation', () => {
    it('should decrement reserved count on rollback', async () => {
      const { releaseReservation } = require('../lib/quota-manager');

      let userSetData;

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn()
            .mockResolvedValueOnce({ data: () => ({ imagesGenerated: 5, reserved: 2 }) })
            .mockResolvedValueOnce({ data: () => ({ spent: 1.0, reserved: 0.268 }) }),
          set: jest.fn((ref, data) => {
            if (!userSetData) userSetData = data;
          }),
        };
        return callback(transaction);
      });

      await releaseReservation('user123', 'res_123');

      expect(userSetData.reserved).toBe(1);
    });

    it('should not go below zero on release', async () => {
      const { releaseReservation } = require('../lib/quota-manager');

      let userSetData;

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn()
            .mockResolvedValueOnce({ data: () => ({ imagesGenerated: 5, reserved: 0 }) })
            .mockResolvedValueOnce({ data: () => ({ spent: 1.0, reserved: 0 }) }),
          set: jest.fn((ref, data) => { userSetData = data; }),
        };
        return callback(transaction);
      });

      await releaseReservation('user123', 'res_123');

      expect(userSetData.reserved).toBe(0);
    });
  });

  describe('getSecondsUntilMidnight', () => {
    it('should return positive seconds', () => {
      const { getSecondsUntilMidnight } = require('../lib/quota-manager');

      const seconds = getSecondsUntilMidnight();

      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(86400); // 24 hours
    });
  });

  describe('LIMITS constants', () => {
    it('should export correct limits', () => {
      const { LIMITS } = require('../lib/quota-manager');

      expect(LIMITS.userDailyImages).toBe(24);
      expect(LIMITS.globalDailyBudget).toBe(20.00);
      expect(LIMITS.imageCost).toBeCloseTo(0.134);
    });
  });
});
