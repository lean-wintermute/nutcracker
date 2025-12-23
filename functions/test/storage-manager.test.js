/**
 * Tests for storage-manager.js module
 * TDD: These tests are written before implementation
 */

// Mock firebase-admin storage
jest.mock('firebase-admin', () => ({
  storage: jest.fn().mockReturnValue({
    bucket: jest.fn().mockReturnValue({
      file: jest.fn().mockReturnValue({
        save: jest.fn().mockResolvedValue(),
        getSignedUrl: jest.fn().mockResolvedValue(['https://signed-url.example.com']),
        delete: jest.fn().mockResolvedValue(),
      }),
    }),
  }),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

describe('storage-manager module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('uploadImage', () => {
    it('should upload base64 image to storage', async () => {
      const { uploadImage } = require('../lib/storage-manager');

      const result = await uploadImage(
        'base64imagedata',
        'image/png',
        { userId: 'user123', animal: 'whale', seed: 'cafe scene' }
      );

      expect(result).toBeDefined();
      expect(result.path).toContain('imagined/user123');
      expect(result.path).toContain('.png');
      expect(result.url).toContain('https://');
    });

    it('should include metadata in upload', async () => {
      const { uploadImage } = require('../lib/storage-manager');
      const admin = require('firebase-admin');
      const mockSave = admin.storage().bucket().file().save;

      await uploadImage(
        'base64imagedata',
        'image/png',
        { userId: 'user123', animal: 'whale', seed: 'cafe scene' }
      );

      expect(mockSave).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: 'image/png',
            metadata: expect.objectContaining({
              animal: 'whale',
              seed: 'cafe scene',
            }),
          }),
        })
      );
    });

    it('should generate 7-day signed URL', async () => {
      const { uploadImage } = require('../lib/storage-manager');
      const admin = require('firebase-admin');
      const mockGetSignedUrl = admin.storage().bucket().file().getSignedUrl;

      await uploadImage(
        'base64imagedata',
        'image/png',
        { userId: 'user123', animal: 'whale', seed: 'test' }
      );

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'read',
          expires: expect.any(Number),
        })
      );

      // Verify expiration is ~7 days from now
      const call = mockGetSignedUrl.mock.calls[0][0];
      const expiresIn = call.expires - Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(expiresIn).toBeCloseTo(sevenDays, -4); // Within ~2 hours
    });

    it('should decode base64 to buffer correctly', async () => {
      const { uploadImage } = require('../lib/storage-manager');
      const admin = require('firebase-admin');
      const mockSave = admin.storage().bucket().file().save;

      const testBase64 = Buffer.from('test image content').toString('base64');
      await uploadImage(testBase64, 'image/png', { userId: 'u', animal: 'a', seed: 's' });

      expect(mockSave).toHaveBeenCalled();
      const savedBuffer = mockSave.mock.calls[0][0];
      expect(Buffer.isBuffer(savedBuffer)).toBe(true);
      expect(savedBuffer.toString()).toBe('test image content');
    });

    it('should generate unique filename with uuid', async () => {
      const { uploadImage } = require('../lib/storage-manager');
      const admin = require('firebase-admin');
      const mockFileFunc = admin.storage().bucket().file;

      await uploadImage('data', 'image/png', { userId: 'user1', animal: 'whale', seed: 'test' });

      expect(mockFileFunc).toHaveBeenCalledWith(
        expect.stringContaining('mock-uuid-1234')
      );
    });

    it('should handle upload errors', async () => {
      const { uploadImage } = require('../lib/storage-manager');
      const admin = require('firebase-admin');

      admin.storage().bucket().file().save.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(uploadImage('data', 'image/png', { userId: 'u', animal: 'a', seed: 's' }))
        .rejects.toThrow('Upload failed');
    });
  });

  describe('deleteImage', () => {
    it('should delete image from storage', async () => {
      const { deleteImage } = require('../lib/storage-manager');
      const admin = require('firebase-admin');
      const mockDelete = admin.storage().bucket().file().delete;

      await deleteImage('imagined/user123/mock-uuid.png');

      expect(mockDelete).toHaveBeenCalled();
    });

    it('should handle delete errors gracefully', async () => {
      const { deleteImage } = require('../lib/storage-manager');
      const admin = require('firebase-admin');

      admin.storage().bucket().file().delete.mockRejectedValueOnce(new Error('Not found'));

      // Should not throw - deletion errors are logged but not thrown
      await expect(deleteImage('nonexistent/path.png')).resolves.not.toThrow();
    });
  });

  describe('generateFilename', () => {
    it('should create path in imagined/{userId}/ format', async () => {
      const { uploadImage } = require('../lib/storage-manager');
      const admin = require('firebase-admin');
      const mockFileFunc = admin.storage().bucket().file;

      await uploadImage('data', 'image/png', { userId: 'test-user-id', animal: 'bear', seed: 'test' });

      const filePath = mockFileFunc.mock.calls[0][0];
      expect(filePath).toMatch(/^imagined\/test-user-id\//);
      expect(filePath).toMatch(/\.png$/);
    });
  });
});
