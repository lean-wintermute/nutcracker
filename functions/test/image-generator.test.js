/**
 * Tests for image-generator.js module
 * TDD: These tests are written before implementation
 */

// Mock gemini module
jest.mock('../lib/gemini', () => ({
  callGeminiImage: jest.fn(),
}));

describe('image-generator module', () => {
  let mockCallGeminiImage;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockCallGeminiImage = require('../lib/gemini').callGeminiImage;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('generateImage', () => {
    it('should generate image with default style', async () => {
      const { generateImage } = require('../lib/image-generator');

      mockCallGeminiImage.mockResolvedValue({
        base64: 'base64imagedata',
        mimeType: 'image/png',
        text: 'Generated image',
      });

      const result = await generateImage('A whale in a cafe', 'whale');

      expect(result.base64).toBe('base64imagedata');
      expect(result.mimeType).toBe('image/png');
      expect(mockCallGeminiImage).toHaveBeenCalledWith(
        expect.stringContaining('A whale in a cafe'),
        expect.objectContaining({
          model: 'gemini-2.0-flash-exp',  // Actual model used
          responseModalities: ['TEXT', 'IMAGE'],
        })
      );
    });

    it('should include style suffix in prompt', async () => {
      const { generateImage } = require('../lib/image-generator');

      mockCallGeminiImage.mockResolvedValue({
        base64: 'data',
        mimeType: 'image/png',
        text: '',
      });

      await generateImage('A whale in a cafe', 'whale', { style: 'default' });

      expect(mockCallGeminiImage).toHaveBeenCalledWith(
        expect.stringContaining('modern animation'),
        expect.any(Object)
      );
    });

    it('should retry with illustration style on safety error', async () => {
      const { generateImage } = require('../lib/image-generator');

      const safetyError = new Error('SAFETY: Content blocked');
      safetyError.code = 'CONTENT_POLICY_VIOLATION';

      mockCallGeminiImage
        .mockRejectedValueOnce(safetyError)
        .mockResolvedValueOnce({
          base64: 'safe-image-data',
          mimeType: 'image/png',
          text: '',
        });

      const result = await generateImage('A whale in a cafe', 'whale');

      expect(mockCallGeminiImage).toHaveBeenCalledTimes(2);
      expect(result.base64).toBe('safe-image-data');
      // Second call should use illustration style
      expect(mockCallGeminiImage.mock.calls[1][0]).toContain('watercolor');
    });

    it('should not retry safety error if already using illustration style', async () => {
      const { generateImage } = require('../lib/image-generator');

      const safetyError = new Error('SAFETY: Content blocked');
      safetyError.code = 'CONTENT_POLICY_VIOLATION';

      mockCallGeminiImage.mockRejectedValue(safetyError);

      await expect(generateImage('prompt', 'whale', { style: 'illustration' }))
        .rejects.toThrow('SAFETY');

      expect(mockCallGeminiImage).toHaveBeenCalledTimes(1);
    });

    it('should retry with exponential backoff on transient errors', async () => {
      const { generateImage } = require('../lib/image-generator');

      const rateLimitError = new Error('Rate limited');
      rateLimitError.code = 429;

      mockCallGeminiImage
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce({
          base64: 'success-data',
          mimeType: 'image/png',
          text: '',
        });

      const resultPromise = generateImage('prompt', 'whale');

      // Advance timers for backoff
      await jest.advanceTimersByTimeAsync(2000); // First retry
      await jest.advanceTimersByTimeAsync(4000); // Second retry

      const result = await resultPromise;

      expect(mockCallGeminiImage).toHaveBeenCalledTimes(3);
      expect(result.base64).toBe('success-data');
    });

    it('should fail after max retries on transient error', async () => {
      // Use real timers for this test since fake timers cause issues with promise resolution
      jest.useRealTimers();

      const { generateImage } = require('../lib/image-generator');

      const rateLimitError = new Error('Rate limited');
      rateLimitError.code = 429;

      mockCallGeminiImage.mockRejectedValue(rateLimitError);

      await expect(generateImage('prompt', 'whale')).rejects.toThrow('Rate limited');
      expect(mockCallGeminiImage).toHaveBeenCalledTimes(3); // Initial + 2 retries

      // Restore fake timers for other tests
      jest.useFakeTimers();
    }, 30000);  // 30 second timeout for exponential backoff test

    it('should not retry on non-transient errors', async () => {
      const { generateImage } = require('../lib/image-generator');

      const authError = new Error('Invalid API key');
      authError.code = 401;

      mockCallGeminiImage.mockRejectedValue(authError);

      await expect(generateImage('prompt', 'whale'))
        .rejects.toThrow('Invalid API key');

      expect(mockCallGeminiImage).toHaveBeenCalledTimes(1);
    });
  });

  describe('isSafetyError', () => {
    it('should return true for SAFETY message', () => {
      const { isSafetyError } = require('../lib/image-generator');

      expect(isSafetyError(new Error('SAFETY: Content blocked'))).toBe(true);
    });

    it('should return true for CONTENT_POLICY_VIOLATION code', () => {
      const { isSafetyError } = require('../lib/image-generator');

      const error = new Error('Blocked');
      error.code = 'CONTENT_POLICY_VIOLATION';
      expect(isSafetyError(error)).toBe(true);
    });

    it('should return false for regular error', () => {
      const { isSafetyError } = require('../lib/image-generator');

      expect(isSafetyError(new Error('Network error'))).toBe(false);
    });
  });

  describe('isTransientError', () => {
    it('should return true for 429 rate limit', () => {
      const { isTransientError } = require('../lib/image-generator');

      const error = new Error('Rate limited');
      error.code = 429;
      expect(isTransientError(error)).toBe(true);
    });

    it('should return true for 503 service unavailable', () => {
      const { isTransientError } = require('../lib/image-generator');

      const error = new Error('Service unavailable');
      error.code = 503;
      expect(isTransientError(error)).toBe(true);
    });

    it('should return true for 504 gateway timeout', () => {
      const { isTransientError } = require('../lib/image-generator');

      const error = new Error('Gateway timeout');
      error.code = 504;
      expect(isTransientError(error)).toBe(true);
    });

    it('should return true for ECONNRESET', () => {
      const { isTransientError } = require('../lib/image-generator');

      expect(isTransientError(new Error('ECONNRESET'))).toBe(true);
    });

    it('should return true for ETIMEDOUT', () => {
      const { isTransientError } = require('../lib/image-generator');

      expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should return false for 401 auth error', () => {
      const { isTransientError } = require('../lib/image-generator');

      const error = new Error('Unauthorized');
      error.code = 401;
      expect(isTransientError(error)).toBe(false);
    });

    it('should return false for 400 bad request', () => {
      const { isTransientError } = require('../lib/image-generator');

      const error = new Error('Bad request');
      error.code = 400;
      expect(isTransientError(error)).toBe(false);
    });
  });
});
