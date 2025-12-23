/**
 * Tests for gemini.js module
 * TDD: These tests are written before implementation
 */

// Mock the Gemini SDK
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

describe('gemini module', () => {
  let mockGenerateContent;

  beforeEach(() => {
    jest.resetModules();
    // Reset mocks
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    mockGenerateContent = jest.fn();
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    }));
    // Set API key for initialization
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    jest.clearAllMocks();
  });

  describe('callGeminiText', () => {
    it('should call Gemini API with correct prompt', async () => {
      const { callGeminiText } = require('../lib/gemini');

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Enhanced prompt text',
        },
      });

      const result = await callGeminiText('Test prompt', 'gemini-2.5-pro');

      expect(result).toBe('Enhanced prompt text');
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should handle empty response gracefully', async () => {
      const { callGeminiText } = require('../lib/gemini');

      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => '',
        },
      });

      const result = await callGeminiText('Test prompt', 'gemini-2.5-pro');

      expect(result).toBe('');
    });

    it('should throw on API error', async () => {
      const { callGeminiText } = require('../lib/gemini');

      mockGenerateContent.mockRejectedValue(new Error('API Error'));

      await expect(callGeminiText('Test prompt', 'gemini-2.5-pro'))
        .rejects.toThrow('API Error');
    });
  });

  describe('callGeminiImage', () => {
    it('should return base64 image and metadata', async () => {
      const { callGeminiImage } = require('../lib/gemini');

      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [
                { text: 'Image description' },
                { inlineData: { data: 'base64imagedata', mimeType: 'image/png' } },
              ],
            },
          }],
        },
      });

      const result = await callGeminiImage('Generate an image', {
        model: 'gemini-3-pro-image-preview',
        responseModalities: ['TEXT', 'IMAGE'],
      });

      expect(result.base64).toBe('base64imagedata');
      expect(result.mimeType).toBe('image/png');
      expect(result.text).toBe('Image description');
    });

    it('should throw if no image generated', async () => {
      const { callGeminiImage } = require('../lib/gemini');

      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [
                { text: 'No image here' },
              ],
            },
          }],
        },
      });

      await expect(callGeminiImage('Generate an image', {}))
        .rejects.toThrow('No image generated');
    });

    it('should handle safety filter errors', async () => {
      const { callGeminiImage } = require('../lib/gemini');

      const safetyError = new Error('SAFETY: Content blocked');
      safetyError.code = 'CONTENT_POLICY_VIOLATION';
      mockGenerateContent.mockRejectedValue(safetyError);

      await expect(callGeminiImage('Generate an image', {}))
        .rejects.toThrow('SAFETY');
    });
  });

  describe('initializeGemini', () => {
    it('should initialize with API key', () => {
      const { initializeGemini } = require('../lib/gemini');

      // Should not throw
      expect(() => initializeGemini('test-key')).not.toThrow();
    });

    it('should throw without API key', () => {
      delete process.env.GEMINI_API_KEY;
      jest.resetModules();

      expect(() => {
        const { initializeGemini } = require('../lib/gemini');
        initializeGemini();
      }).toThrow();
    });
  });
});
