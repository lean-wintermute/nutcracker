# Implementation Plan: Nutcracker Mode B - imagineScenes Cloud Function

**Status**: REVISED (critique issues addressed)
**Ticket**: Mode B Enhancement
**Created**: 2025-12-22
**Research Depth**: HIGH (12+ sources validated, dual-track research)

---

## Embedded Principles

### From Root Architecture (/docs/ARCHITECTURE.md)

- **Separation of Concerns**: Cloud Function handles API orchestration; scene-enhancer handles prompt logic; animals.js handles data mapping - each module has single responsibility
- **Dependency Inversion**: imagineScenes depends on abstractions (scene-enhancer interface) not implementations; allows swapping Gemini for Claude later
- **Quality Gates**: Multi-layer validation (input sanitization -> rate limiting -> quota check -> budget cap) before expensive image generation
- **Modularity**: Each new module (animals.js, scene-enhancer.js, imagineScenes.js) is independently testable
- **Fail-Safe Defaults**: Retry with "illustration style" on safety failures; graceful degradation on API errors

### From Tool Patterns (functions/index.js)

- **Secret Management**: Use `defineSecret()` pattern for GEMINI_API_KEY as established for ANTHROPIC_KEY
- **CORS Handling**: Extend allowedOrigins array; reuse parseRequestBody() utility
- **Error Response Format**: Standardized `{response, error, rateLimited?, retryAfter?}` shape
- **Firestore Logging**: TTL-based logs with expiresAt field for automatic cleanup

---

## Summary

Mode B adds generative image capability to Nutcracker, allowing users to create custom scenes featuring any of the supported animals (whale, panda, bear, lion, + extensible) using a 40-character seed prompt. The implementation follows a **multi-layer architecture**:

1. **Input Layer**: Validates seed length, sanitizes against injection, checks blocklist
2. **Enhancement Layer**: VALOR-style prompt rewriting via Gemini 2.5 Pro (redirect not block)
3. **Generation Layer**: Gemini 3 Pro Image Preview with responseModalities config
4. **Safety Layer**: Retry with "illustration style" suffix on content policy failures
5. **Quota Layer**: Firestore-based per-user tracking (24 images/day) + global budget cap ($20/day)
6. **Storage Layer**: Base64 decode -> Firebase Storage upload -> signed URL generation

The approach prioritizes **reliability over speed** - each layer has explicit error handling and fallback behavior. Cost tracking uses Firestore atomic transactions to prevent budget overruns.

---

## Research Integration

Key findings from research phase incorporated:

| Finding | Source | How Applied |
|---------|--------|-------------|
| `responseModalities: ["TEXT", "IMAGE"]` required | Google Docs (Tier A) | Used in Gemini API config |
| `defineSecret()` for API keys | Firebase Docs (Tier A) | GEMINI_API_KEY secret binding |
| 120s timeout for image generation | Best Practice (Tier B) | Cloud Function timeout config |
| 512MiB memory for image processing | Best Practice (Tier B) | Cloud Function memory config |
| VALOR-style rewriting > blocking | Best Practice (Tier B) | scene-enhancer redirect logic |
| `system/budget_{date}` collection | Best Practice (Tier B) | Hard budget cap tracking |
| Style retry on safety failure | Best Practice (Tier B) | "illustration style" suffix fallback |

---

## Phases

### Phase 1: Foundation - LOW RISK

**Goal**: Create extensible animal configuration and core data structures
**Rationale**: Start with pure data/utility modules that have no external dependencies

**Modules**:

| Module | Files | Changes | Tests Required |
|--------|-------|---------|----------------|
| animals.js | `functions/lib/animals.js` | New file ~80 lines | `test_animals.js` |
| Constants | `functions/lib/constants.js` | New file ~40 lines | N/A (pure data) |

**animals.js Structure**:
```javascript
const ANIMALS = {
  whale: {
    id: 'whale',
    displayName: 'Whale',
    promptPrefix: 'A gentle whale character',
    styleHints: ['ocean blue tones', 'massive but gentle'],
    enabled: true,
  },
  panda: {
    id: 'panda',
    displayName: 'Panda',
    promptPrefix: 'A contemplative panda',
    styleHints: ['black and white contrast', 'bamboo forest aesthetic'],
    enabled: true,
  },
  bear: {
    id: 'bear',
    displayName: 'Bear',
    promptPrefix: 'A thoughtful bear',
    styleHints: ['warm brown tones', 'forest setting'],
    enabled: true,
  },
  lion: {
    id: 'lion',
    displayName: 'Lion',
    promptPrefix: 'A majestic lion',
    styleHints: ['golden mane', 'savanna warmth'],
    enabled: true,
  },
};

// Extensibility: Add new animals here
function getAnimal(id) { ... }
function getEnabledAnimals() { ... }
function validateAnimalId(id) { ... }
```

**Verification**: Unit tests pass; getAnimal('whale') returns expected structure
**Rollback**: Delete new files; no dependencies yet

---

### Phase 2: Prompt Enhancement - LOW RISK

**Goal**: Build VALOR-style prompt enhancement with safety guardrails
**Rationale**: Text-only LLM calls; no image generation yet; easy to test

**Modules**:

| Module | Files | Changes | Tests Required |
|--------|-------|---------|----------------|
| scene-enhancer.js | `functions/lib/scene-enhancer.js` | New file ~150 lines | `test_scene_enhancer.js` |
| Gemini client | `functions/lib/gemini.js` | New file ~100 lines | `test_gemini.js` |

**scene-enhancer.js Structure**:
```javascript
const { getAnimal } = require('./animals');
const { callGeminiText } = require('./gemini');

// Blocklist for obvious injection attempts
const BLOCKLIST = ['ignore previous', 'system prompt', 'jailbreak', ...];

// VALOR-style enhancement prompt
const ENHANCEMENT_PROMPT = `
You are a scene description enhancer for a children's illustration app.
Given a short seed phrase, expand it into a detailed, family-friendly scene description.

Rules:
- Keep the core intent of the seed
- Add visual details (lighting, composition, mood)
- Ensure child-appropriate content
- Include the specified animal naturally in the scene
- Output 2-3 sentences maximum

Animal: {animal}
Style hints: {styleHints}
Seed: {seed}

Enhanced description:
`;

async function enhanceScene(animal, seed) {
  // 1. Validate inputs
  validateSeed(seed);  // max 40 chars, no blocklist
  const animalConfig = getAnimal(animal);

  // 2. Call Gemini 2.5 Pro for enhancement
  const prompt = ENHANCEMENT_PROMPT
    .replace('{animal}', animalConfig.promptPrefix)
    .replace('{styleHints}', animalConfig.styleHints.join(', '))
    .replace('{seed}', seed);

  const enhanced = await callGeminiText(prompt, 'gemini-2.5-pro');

  // 3. Return enhanced prompt for image generation
  return {
    original: seed,
    enhanced: enhanced,
    animal: animal,
  };
}
```

**Verification**: Unit tests with mock Gemini responses; blocklist correctly rejects injection
**Rollback**: Delete new files; Phase 1 unaffected

---

### Phase 3: Image Generation - MEDIUM RISK

**Goal**: Integrate Gemini 3 Pro Image Preview with safety retry
**Rationale**: First external image API integration; requires careful error handling

**Modules**:

| Module | Files | Changes | Tests Required |
|--------|-------|---------|----------------|
| image-generator.js | `functions/lib/image-generator.js` | New file ~120 lines | `test_image_generator.js` |
| Gemini client (extend) | `functions/lib/gemini.js` | +50 lines | Update tests |

**image-generator.js Structure**:
```javascript
const { callGeminiImage } = require('./gemini');

const STYLE_SUFFIXES = {
  default: 'in the style of modern animation, warm lighting',
  illustration: 'as a gentle watercolor illustration, soft edges, muted palette',
  storybook: 'in classic storybook illustration style, detailed yet whimsical',
};

/**
 * Generate image with exponential backoff for transient errors
 * and safety retry with softer style.
 *
 * Retry strategy:
 * - Transient errors (429, 503, timeout): Exponential backoff, max 3 attempts
 * - Safety errors: Single retry with 'illustration' style
 * - Other errors: Fail immediately
 */
async function generateImage(enhancedPrompt, animal, options = {}) {
  const styleKey = options.style || 'default';
  const attempt = options.attempt || 1;
  const maxAttempts = 3;
  const fullPrompt = `${enhancedPrompt} ${STYLE_SUFFIXES[styleKey]}`;

  try {
    return await callGeminiImage(fullPrompt, {
      model: 'gemini-3-pro-image-preview',
      responseModalities: ['TEXT', 'IMAGE'],
    });
  } catch (error) {
    // Safety error: retry with softer style (only once)
    if (isSafetyError(error) && styleKey === 'default') {
      console.log('Safety filter triggered, retrying with illustration style');
      return generateImage(enhancedPrompt, animal, {
        style: 'illustration',
        attempt: 1,  // Reset attempt counter for style retry
      });
    }

    // Transient error: exponential backoff
    if (isTransientError(error) && attempt < maxAttempts) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);  // 2s, 4s, max 10s
      console.log(`Transient error (attempt ${attempt}/${maxAttempts}), retrying in ${backoffMs}ms`);
      await sleep(backoffMs);
      return generateImage(enhancedPrompt, animal, {
        ...options,
        attempt: attempt + 1,
      });
    }

    // Non-retryable or max attempts reached
    throw error;
  }
}

function isTransientError(error) {
  const code = error.code || error.status;
  const message = error.message || '';
  return (
    code === 429 ||  // Rate limited
    code === 503 ||  // Service unavailable
    code === 504 ||  // Gateway timeout
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('socket hang up')
  );
}

function isSafetyError(error) {
  return error.message?.includes('SAFETY') ||
         error.code === 'CONTENT_POLICY_VIOLATION';
}
```

**Gemini Client Extension**:
```javascript
async function callGeminiImage(prompt, config) {
  const response = await gemini.generateContent({
    model: config.model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: config.responseModalities,
    },
  });

  // Extract image from response
  const imagePart = response.candidates[0].content.parts
    .find(part => part.inlineData);

  if (!imagePart) {
    throw new Error('No image generated');
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
    text: response.candidates[0].content.parts
      .find(part => part.text)?.text || '',
  };
}
```

**Verification**: Integration test with mock Gemini (base64 image response); safety retry tested
**Rollback**: Remove image-generator.js; Phase 2 still works for text enhancement

---

### Phase 4: Quota & Budget Tracking - MEDIUM RISK

**Goal**: Implement per-user daily quota and global budget cap
**Rationale**: Firestore transactions; critical for cost control before public launch

**Modules**:

| Module | Files | Changes | Tests Required |
|--------|-------|---------|----------------|
| quota-manager.js | `functions/lib/quota-manager.js` | New file ~120 lines | `test_quota_manager.js` |
| firestore.rules | `deploy/firestore.rules` | +20 lines | Manual verify |
| firestore.indexes.json | `firestore.indexes.json` | +8 lines | Deploy verify |

**quota-manager.js Structure**:
```javascript
const admin = require('firebase-admin');

const LIMITS = {
  userDailyImages: 24,
  globalDailyBudget: 20.00,  // $20 cap
  imageCost: 0.134,  // gemini-3-pro-image-preview per image
};

/**
 * Reserve quota atomically BEFORE generation to prevent race conditions.
 * Uses Firestore transaction to reserve-then-confirm pattern.
 *
 * Flow:
 * 1. reserveQuota() - atomically increments counter, returns reservation ID
 * 2. Image generation happens
 * 3. On success: confirmReservation() - marks as confirmed
 * 4. On failure: releaseReservation() - decrements counter (rollback)
 */
async function reserveQuota(userId) {
  const db = admin.firestore();
  const today = getDateString();  // YYYY-MM-DD

  return await db.runTransaction(async (transaction) => {
    const userRef = db.collection('imagine_users').doc(userId);
    const budgetRef = db.collection('system').doc(`budget_${today}`);

    const [userDoc, budgetDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(budgetRef),
    ]);

    const userData = userDoc.data() || { imagesGenerated: 0, reserved: 0, lastReset: today };
    const budgetData = budgetDoc.data() || { spent: 0, reserved: 0 };

    // Reset if new day
    if (userData.lastReset !== today) {
      userData.imagesGenerated = 0;
      userData.reserved = 0;
      userData.lastReset = today;
    }

    // Check quota including pending reservations
    const totalUser = userData.imagesGenerated + userData.reserved;
    if (totalUser >= LIMITS.userDailyImages) {
      return { allowed: false, reason: 'daily_limit', retryAfter: getSecondsUntilMidnight() };
    }

    // Check global budget including pending
    const totalBudget = budgetData.spent + budgetData.reserved;
    if (totalBudget >= LIMITS.globalDailyBudget) {
      return { allowed: false, reason: 'budget_cap', retryAfter: getSecondsUntilMidnight() };
    }

    // Reserve slot atomically
    const reservationId = `${userId}_${Date.now()}`;

    transaction.set(userRef, {
      ...userData,
      reserved: (userData.reserved || 0) + 1,
      lastReservation: reservationId,
    }, { merge: true });

    transaction.set(budgetRef, {
      ...budgetData,
      reserved: (budgetData.reserved || 0) + LIMITS.imageCost,
    }, { merge: true });

    return {
      allowed: true,
      reservationId,
      remaining: LIMITS.userDailyImages - totalUser - 1,
    };
  });
}

async function confirmReservation(userId, reservationId) {
  const db = admin.firestore();
  const today = getDateString();

  await db.runTransaction(async (transaction) => {
    const userRef = db.collection('imagine_users').doc(userId);
    const budgetRef = db.collection('system').doc(`budget_${today}`);

    const [userDoc, budgetDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(budgetRef),
    ]);

    const userData = userDoc.data();
    const budgetData = budgetDoc.data();

    // Move from reserved to confirmed
    transaction.set(userRef, {
      imagesGenerated: (userData.imagesGenerated || 0) + 1,
      reserved: Math.max(0, (userData.reserved || 0) - 1),
      lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(budgetRef, {
      spent: (budgetData.spent || 0) + LIMITS.imageCost,
      reserved: Math.max(0, (budgetData.reserved || 0) - LIMITS.imageCost),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function releaseReservation(userId, reservationId) {
  const db = admin.firestore();
  const today = getDateString();

  await db.runTransaction(async (transaction) => {
    const userRef = db.collection('imagine_users').doc(userId);
    const budgetRef = db.collection('system').doc(`budget_${today}`);

    const [userDoc, budgetDoc] = await Promise.all([
      transaction.get(userRef),
      transaction.get(budgetRef),
    ]);

    const userData = userDoc.data();
    const budgetData = budgetDoc.data();

    // Release reservation (rollback)
    transaction.set(userRef, {
      reserved: Math.max(0, (userData.reserved || 0) - 1),
    }, { merge: true });

    transaction.set(budgetRef, {
      reserved: Math.max(0, (budgetData.reserved || 0) - LIMITS.imageCost),
    }, { merge: true });
  });
}

async function recordImageGeneration(userId) {
  const db = admin.firestore();
  const today = getDateString();

  // Atomic transaction for both user and budget
  await db.runTransaction(async (transaction) => {
    const userRef = db.collection('imagine_users').doc(userId);
    const budgetRef = db.collection('system').doc(`budget_${today}`);

    const userDoc = await transaction.get(userRef);
    const budgetDoc = await transaction.get(budgetRef);

    const userData = userDoc.data() || { imagesGenerated: 0, lastReset: today };
    const budgetData = budgetDoc.data() || { spent: 0 };

    transaction.set(userRef, {
      imagesGenerated: userData.imagesGenerated + 1,
      lastReset: today,
      lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(budgetRef, {
      spent: budgetData.spent + LIMITS.imageCost,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}
```

**Firestore Rules Addition**:
```firestore
// Imagine quota tracking - read by owner, write by Cloud Function only
match /imagine_users/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if false;  // Cloud Function uses Admin SDK
}

// System budget tracking - admin only
match /system/{docId} {
  allow read, write: if false;  // Admin SDK only
}

// Generated images - public read, owner manage
match /imagined_images/{imageId} {
  allow read: if true;
  allow create: if request.auth != null &&
                   request.resource.data.userId == request.auth.uid;
  allow update, delete: if request.auth != null &&
                          resource.data.userId == request.auth.uid;
}
```

**Verification**: Unit tests with mock Firestore; transaction atomicity verified
**Rollback**: Remove quota-manager.js; image generation works but unbounded

---

### Phase 5: Storage Integration - MEDIUM RISK

**Goal**: Upload generated images to Firebase Storage with signed URLs
**Rationale**: Binary data handling; URL generation for gallery integration

**Modules**:

| Module | Files | Changes | Tests Required |
|--------|-------|---------|----------------|
| storage-manager.js | `functions/lib/storage-manager.js` | New file ~80 lines | `test_storage_manager.js` |

**storage-manager.js Structure**:
```javascript
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

async function uploadImage(base64Data, mimeType, metadata) {
  const bucket = admin.storage().bucket();
  const filename = `imagined/${metadata.userId}/${uuidv4()}.png`;
  const file = bucket.file(filename);

  // Decode base64 and upload
  const buffer = Buffer.from(base64Data, 'base64');

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
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return {
    path: filename,
    url: signedUrl,
  };
}

async function deleteImage(path) {
  const bucket = admin.storage().bucket();
  await bucket.file(path).delete();
}
```

**Verification**: Integration test with Firebase Storage emulator
**Rollback**: Remove storage-manager.js; images not persisted

---

### Phase 6: Cloud Function Endpoint - HIGH RISK

**Goal**: Create main imagineScenes Cloud Function with full request lifecycle
**Rationale**: Public-facing endpoint; all error paths must be handled

**Modules**:

| Module | Files | Changes | Tests Required |
|--------|-------|---------|----------------|
| imagineScenes.js | `functions/imagineScenes.js` | New file ~180 lines | `test_imagineScenes.js` |
| index.js | `functions/index.js` | +8 lines (export) | Verify deploy |

**imagineScenes.js Structure**:
```javascript
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { enhanceScene } = require('./lib/scene-enhancer');
const { generateImage } = require('./lib/image-generator');
const { checkQuota, recordImageGeneration } = require('./lib/quota-manager');
const { uploadImage } = require('./lib/storage-manager');
const { validateAnimalId } = require('./lib/animals');

const geminiKey = defineSecret('GEMINI_API_KEY');

const imagineScenes = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: [geminiKey],
    invoker: 'public',
  },
  async (req, res) => {
    // 1. CORS headers
    const allowedOrigins = [
      'https://lean-wintermute.github.io',
      'http://localhost:5000',
      'http://127.0.0.1:5000',
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // 2. Parse and validate request
      const { animal, seed, idToken } = req.body;

      if (!animal || !seed || !idToken) {
        res.status(400).json({
          response: 'Missing required fields: animal, seed, idToken',
          error: true,
        });
        return;
      }

      // 3. Verify Firebase Auth token
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (authError) {
        res.status(401).json({
          response: 'Invalid or expired authentication',
          error: true,
        });
        return;
      }
      const userId = decodedToken.uid;

      // 4. Validate animal
      if (!validateAnimalId(animal)) {
        res.status(400).json({
          response: `Unknown animal: ${animal}`,
          error: true,
        });
        return;
      }

      // 5. Validate seed
      if (typeof seed !== 'string' || seed.length === 0 || seed.length > 40) {
        res.status(400).json({
          response: 'Seed must be 1-40 characters',
          error: true,
        });
        return;
      }

      // 6. Check quota
      const quotaResult = await checkQuota(userId);
      if (!quotaResult.allowed) {
        res.status(429).json({
          response: quotaResult.reason === 'daily_limit'
            ? 'You\'ve used all 24 daily images. Try again tomorrow!'
            : 'The imagination engine is resting. Try again tomorrow!',
          error: true,
          rateLimited: true,
          retryAfter: quotaResult.retryAfter,
        });
        return;
      }

      // 7. Enhance scene
      const enhanced = await enhanceScene(animal, seed);

      // 8. Generate image
      const imageResult = await generateImage(enhanced.enhanced, animal);

      // 9. Upload to storage
      const storageResult = await uploadImage(
        imageResult.base64,
        imageResult.mimeType,
        { userId, animal, seed }
      );

      // 10. Save to Firestore
      const db = admin.firestore();
      const imageDoc = await db.collection('imagined_images').add({
        userId,
        animal,
        seed,
        enhancedPrompt: enhanced.enhanced,
        storagePath: storageResult.path,
        imageUrl: storageResult.url,
        eloScore: 1200,  // Starting Elo
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),  // 90 days
      });

      // 11. Record quota usage
      await recordImageGeneration(userId);

      // 12. Return success
      res.status(200).json({
        success: true,
        imageId: imageDoc.id,
        imageUrl: storageResult.url,
        enhancedPrompt: enhanced.enhanced,
        remaining: quotaResult.remaining - 1,
      });

    } catch (error) {
      console.error('imagineScenes error:', {
        error: error.message,
        stack: error.stack,
      });

      // Determine error type for user message
      let userMessage = 'Something went wrong creating your scene. Please try again.';
      if (error.message?.includes('SAFETY')) {
        userMessage = 'That scene idea couldn\'t be illustrated. Try a different seed!';
      } else if (error.message?.includes('blocklist')) {
        userMessage = 'That seed contains restricted content. Try something else!';
      }

      res.status(500).json({
        response: userMessage,
        error: true,
      });
    }
  }
);

module.exports = { imagineScenes };
```

**index.js Update**:
```javascript
// Add after line 19:
const geminiKey = defineSecret('GEMINI_API_KEY');

// Add after helpbot export:
const { imagineScenes } = require('./imagineScenes');
exports.imagineScenes = imagineScenes;
```

**Verification**: Full integration test with emulators; error paths verified
**Rollback**: Remove export from index.js; function not deployed

---

### Phase 7: UI Integration - HIGH RISK

**Goal**: Add animal selector, seed input, and sparkle badge to gallery
**Rationale**: User-facing changes; careful attention to existing UI patterns

**Modules**:

| Module | Files | Changes | Tests Required |
|--------|-------|---------|----------------|
| index.html | `deploy/index.html` | +120 lines | Manual UI test |
| image-catalog.json | `deploy/image-catalog.json` | +schema field | Verify parsing |

**UI Components**:

1. **Imagine Bar** (new section in existing UI):
```html
<div class="imagine-bar">
  <h3>Create Your Scene</h3>

  <div class="imagine-controls">
    <select id="animal-selector" class="animal-select">
      <option value="whale">Whale</option>
      <option value="panda">Panda</option>
      <option value="bear">Bear</option>
      <option value="lion">Lion</option>
    </select>

    <div class="seed-input-container">
      <input type="text"
             id="scene-seed"
             maxlength="40"
             placeholder="Describe a scene (e.g., 'sitting alone at a cafe')">
      <span class="char-counter">0/40</span>
    </div>

    <button id="imagine-btn" class="imagine-button">
      Imagine It
    </button>
  </div>

  <div class="imagine-status" id="imagine-status" style="display: none;">
    <div class="loading-spinner"></div>
    <span>Creating your scene...</span>
  </div>

  <div class="quota-display" id="quota-display">
    <span class="quota-remaining">24</span> scenes remaining today
  </div>
</div>
```

2. **Sparkle Badge** for generated images in gallery:
```css
.image-card.generated::after {
  content: '';
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background-image: url('data:image/svg+xml,...');  /* sparkle SVG */
}
```

3. **JavaScript Integration** (with anonymous auth fallback and progress UI):
```javascript
// Ensure user is authenticated (anonymous fallback)
async function ensureAuthenticated() {
  const auth = firebase.auth();
  if (auth.currentUser) {
    return auth.currentUser;
  }
  // Anonymous sign-in for users without account
  try {
    const result = await auth.signInAnonymously();
    console.log('Signed in anonymously:', result.user.uid);
    return result.user;
  } catch (error) {
    console.error('Anonymous auth failed:', error);
    throw new Error('Unable to authenticate. Please try again.');
  }
}

// Progress indicator with estimated time
function showProgress(phase, estimatedSeconds) {
  const statusEl = document.getElementById('imagine-status');
  const spinnerEl = statusEl.querySelector('.loading-spinner');
  const textEl = statusEl.querySelector('.status-text');

  statusEl.style.display = 'flex';

  const phases = {
    'enhancing': 'Enhancing your idea...',
    'generating': 'Creating your image...',
    'uploading': 'Saving to gallery...',
  };

  textEl.textContent = phases[phase] || 'Working...';

  // Show estimated time for long operations
  if (estimatedSeconds > 10) {
    textEl.textContent += ` (~${Math.round(estimatedSeconds)}s)`;
  }
}

async function imagineScene() {
  const animal = document.getElementById('animal-selector').value;
  const seed = document.getElementById('scene-seed').value.trim();
  const btn = document.getElementById('imagine-btn');

  if (!seed) {
    showError('Please enter a scene description');
    return;
  }

  // Disable button during generation
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    // Ensure authenticated (anonymous fallback)
    const user = await ensureAuthenticated();
    const idToken = await user.getIdToken();

    // Phase 1: Enhancement (~3s)
    showProgress('enhancing', 3);

    const response = await fetch(IMAGINE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ animal, seed, idToken }),
    });

    // Phase 2: Generation (~30-60s) - update UI after response starts
    showProgress('generating', 45);

    const result = await response.json();

    if (result.error) {
      showError(result.response);
      return;
    }

    // Phase 3: Gallery integration
    showProgress('uploading', 2);

    // Add to gallery with sparkle badge
    addGeneratedImage(result);
    updateQuotaDisplay(result.remaining);
    clearSeedInput();
    showSuccess('Your scene is ready!');

  } catch (error) {
    console.error('Imagine error:', error);
    showError(error.message || 'Failed to create scene. Please try again.');
  } finally {
    hideStatus();
    btn.disabled = false;
    btn.textContent = 'Imagine It';
  }
}

// Character counter for seed input
document.getElementById('scene-seed').addEventListener('input', (e) => {
  const counter = document.querySelector('.char-counter');
  const len = e.target.value.length;
  counter.textContent = `${len}/40`;
  counter.classList.toggle('at-limit', len >= 40);
});

// Error display in dedicated area
function showError(message) {
  const errorEl = document.getElementById('imagine-error');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  setTimeout(() => { errorEl.style.display = 'none'; }, 5000);
}

function showSuccess(message) {
  const successEl = document.getElementById('imagine-success');
  successEl.textContent = message;
  successEl.style.display = 'block';
  setTimeout(() => { successEl.style.display = 'none'; }, 3000);
}
```

**image-catalog.json Schema Update**:
```json
{
  "isGenerated": false  // New field for all existing images
}
```

**Verification**: Manual UI testing across devices; accessibility check
**Rollback**: Revert index.html to previous version

---

## Module Breakdown

| Order | Module | Files | Tests | Dependencies | Risk | Parallel |
|-------|--------|-------|-------|--------------|------|----------|
| 1 | animals.js | functions/lib/animals.js | test_animals.js | None | Low | Group A |
| 2 | constants.js | functions/lib/constants.js | N/A | None | Low | Group A |
| 3 | gemini.js | functions/lib/gemini.js | test_gemini.js | None | Low | Group A |
| 4 | scene-enhancer.js | functions/lib/scene-enhancer.js | test_scene_enhancer.js | animals.js, gemini.js | Low | Group B |
| 5 | image-generator.js | functions/lib/image-generator.js | test_image_generator.js | gemini.js | Med | Group B |
| 6 | quota-manager.js | functions/lib/quota-manager.js | test_quota_manager.js | None | Med | Group C |
| 7 | storage-manager.js | functions/lib/storage-manager.js | test_storage_manager.js | None | Med | Group C |
| 8 | imagineScenes.js | functions/imagineScenes.js | test_imagineScenes.js | All above | High | - |
| 9 | index.js update | functions/index.js | Deploy verify | imagineScenes.js | High | - |
| 10 | UI Integration | deploy/index.html | Manual test | Cloud Function | High | - |

---

## Agent Allocation

| Phase | Agent | Files | Parallel Safe | Memory Est |
|-------|-------|-------|---------------|------------|
| Phase 1-2 | sde | animals.js, constants.js, scene-enhancer.js, gemini.js | Yes | 300MB |
| Phase 3 | sde | image-generator.js | Yes | 300MB |
| Phase 4-5 | sde | quota-manager.js, storage-manager.js | Yes | 300MB |
| Tests | test-generator | test_*.js (all modules) | Yes | 300MB |
| Phase 6 | sde | imagineScenes.js, index.js | No | 300MB |
| Phase 7 | sde | index.html, image-catalog.json | No | 300MB |

**Total Parallel Budget**: 3 agents max, 900MB peak

---

## CLAUDE.md Compliance

| Rule Category | Status | Notes |
|---------------|--------|-------|
| Async I/O | N/A | Node.js (not Python) |
| Type Hints | N/A | JavaScript (use JSDoc for documentation) |
| Error Handling | OK | Specific error types; no bare catch |
| Logging | OK | console.error with structured context |
| Security | OK | defineSecret for API keys; input validation |
| Dict Access | N/A | JavaScript uses optional chaining (?.) |

**Note**: CLAUDE.md rules are Python-focused. For JavaScript Cloud Functions:
- Use `?.` optional chaining instead of `.get()`
- Use JSDoc comments for type documentation
- Follow existing helpbot patterns for consistency

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Gemini API rate limits | Medium | Medium | Implement backoff; user-facing quota prevents abuse |
| Safety filter triggers | Medium | Low | Retry with illustration style; graceful error message |
| Budget overrun | Low | High | Firestore transaction for atomic budget tracking |
| Image generation timeout | Medium | Medium | 120s timeout; retry with simpler prompt on timeout |
| Firebase Storage quota | Low | Medium | 90-day TTL on images; cleanup scheduled function |
| CORS misconfiguration | Low | High | Test with local dev; staged rollout |

---

## Success Criteria

- [ ] All unit tests passing (animals, scene-enhancer, gemini, image-generator, quota-manager, storage-manager)
- [ ] Integration test: full request lifecycle with Firebase emulators
- [ ] Coverage >= 80% on new JavaScript modules
- [ ] Firestore rules deployed and verified
- [ ] Cloud Function deployed and responding
- [ ] UI animal selector working on mobile + desktop
- [ ] Seed input validates 40-char limit
- [ ] Quota display shows remaining images
- [ ] Generated images appear in gallery with sparkle badge
- [ ] Elo voting works on generated images
- [ ] No CLAUDE.md violations (adapted for JavaScript)
- [ ] Budget cap tested: function returns error when $20 exceeded
- [ ] Safety retry tested: illustration style fallback works

---

## Deployment Checklist

- [ ] GEMINI_API_KEY added to Firebase Functions secrets
- [ ] `firestore.rules` updated and deployed
- [ ] `firestore.indexes.json` deployed (wait for index build)
- [ ] Cloud Function deployed (`firebase deploy --only functions:imagineScenes`)
- [ ] UI changes deployed to GitHub Pages
- [ ] Manual testing of full flow
- [ ] Rate limiting verification
- [ ] Budget cap verification (use test mode)
- [ ] Monitor Firebase console for errors post-launch

---

## Appendix: File Paths Summary

**New Files (8)**:
```
functions/lib/animals.js              (~80 lines)
functions/lib/constants.js            (~40 lines)
functions/lib/gemini.js               (~100 lines)
functions/lib/scene-enhancer.js       (~150 lines)
functions/lib/image-generator.js      (~120 lines)
functions/lib/quota-manager.js        (~120 lines)
functions/lib/storage-manager.js      (~80 lines)
functions/imagineScenes.js            (~180 lines)
```

**Modified Files (4)**:
```
functions/index.js                    (+8 lines)
deploy/index.html                     (+120 lines)
deploy/firestore.rules                (+20 lines)
firestore.indexes.json                (+8 lines)
```

**Test Files (6)**:
```
functions/test/test_animals.js
functions/test/test_gemini.js
functions/test/test_scene_enhancer.js
functions/test/test_image_generator.js
functions/test/test_quota_manager.js
functions/test/test_storage_manager.js
```

**Total Estimated Lines**: ~900 new, ~150 modified
