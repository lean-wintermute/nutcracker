# Nutcracker Architecture

## Overview

Nutcracker is a single-file web application for Elo-based image ranking. It prioritizes simplicity, offline-first operation, and zero-friction user experience.

## Use Cases

### Primary Use Cases

1. **Visual Preference Research**
   - Rank AI-generated images to identify preferred styles
   - Collect qualitative feedback on why images are preferred
   - Export results for analysis

2. **A/B Testing at Scale**
   - Compare variations of visual content
   - Statistical ranking via Elo system
   - Track which attributes drive preference

3. **Content Curation**
   - Crowdsource rankings from multiple users
   - Aggregate preferences via Firebase sync
   - Identify top performers

### User Workflows

```
Vote Flow:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  View Pair  │───►│  Click Vote │───►│ Save Rating │
└─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼ (every 3rd vote)
                   ┌─────────────┐
                   │ Feedback    │
                   │ Toast       │
                   └─────────────┘

Rankings Flow:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Click Tab  │───►│ View Sorted │───►│ Click Image │
└─────────────┘    └─────────────┘    └─────────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │ View Full   │    │  Download   │    │ Right-Click │
                   │ (new tab)   │    │  (button)   │    │ (context)   │
                   └─────────────┘    └─────────────┘    └─────────────┘
```

## Constraints

### Design Constraints

| Constraint | Rationale |
|------------|-----------|
| **Single HTML file** | Zero deployment complexity, works from file:// |
| **No build step** | Immediate editing, no toolchain |
| **No external runtime dependencies** | Works offline, no CDN failures |
| **localStorage primary** | Works without server, instant persistence |
| **Anonymous by default** | Zero friction, no signup barriers |

### Technical Constraints

| Constraint | Limit | Rationale |
|------------|-------|-----------|
| Max matches stored | 10,000 | Prevent localStorage bloat (~5MB limit) |
| Suggestion length | 500 chars | Reasonable feedback length |
| Toast duration | 8 seconds | WCAG timing requirements |
| Touch targets | 44px minimum | WCAG AA / mobile usability |
| Image format | PNG/JPG | Universal browser support |

### Security Constraints

| Constraint | Implementation |
|------------|----------------|
| XSS prevention | `escapeHtml()` on all dynamic content |
| CSP policy | `script-src 'self' 'unsafe-inline'` (single-file tradeoff) |
| No secrets in client | Firebase config is public (security via rules) |
| Input validation | Type checking on localStorage load |
| URL handling | `encodeURIComponent()` for file paths |

### Accessibility Constraints (WCAG 2.1 AA)

| Requirement | Implementation |
|-------------|----------------|
| Color contrast | 4.5:1 minimum for text |
| Keyboard navigation | Full app navigable via Tab/Enter/Escape |
| Focus indicators | 3px accent outline on :focus-visible |
| Screen readers | aria-live regions, proper roles |
| Timing | Pause on hover/focus, "Keep open" option |
| Reduced motion | `prefers-reduced-motion` media query |

## Technical Architecture

### Data Model

```
State
├── ratings: { [imageId]: number }     # Elo ratings (default 1500)
├── matches: Match[]                    # Vote history
└── currentPair: { left, right }       # Current comparison

Match
├── winner: string                      # Image ID
├── loser: string                       # Image ID
└── timestamp: number                   # Unix ms

FeedbackState
├── tags: { [imageId]: string[] }      # Tags per image
└── suggestions: Suggestion[]           # User suggestions

Suggestion
├── text: string                        # Max 500 chars
└── timestamp: number                   # Unix ms
```

### Elo Algorithm

```javascript
K_FACTOR = 32
DEFAULT_ELO = 1500

expectedScore(ratingA, ratingB) = 1 / (1 + 10^((ratingB - ratingA) / 400))

newWinnerRating = oldRating + K * (1 - expectedScore)
newLoserRating = oldRating + K * (0 - expectedScore)
```

### Pairing Algorithm

1. Count matches per image
2. Sort images by match count (ascending)
3. Select first image from under-voted half
4. Select second image randomly (avoiding same image)

This ensures balanced coverage while maintaining randomness.

## Firebase Integration (Optional)

### When to Use Firebase

- Multi-device sync for same user
- Aggregating votes from multiple users
- Persistent cloud backup
- Real-time collaboration

### Firebase Setup

#### 1. Create Firebase Project

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Create project at https://console.firebase.google.com
# Enable Firestore and Anonymous Authentication
```

#### 2. Get Configuration

From Firebase Console > Project Settings > Your Apps > Web App:

```javascript
// pragma: allowlist nextline secret
const firebaseConfig = {
  apiKey: "AIza...",  // pragma: allowlist secret
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123...",
  appId: "1:123...:web:abc..."
};
```

#### 3. Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Votes collection - anyone can write, read own
    match /votes/{voteId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null &&
                    request.auth.uid == resource.data.visitorId;
    }

    // Feedback collection
    match /feedback/{feedbackId} {
      allow create: if request.auth != null &&
                      request.resource.data.visitorId == request.auth.uid;
      allow read: if request.auth != null;
    }

    // Suggestions collection
    match /suggestions/{suggestionId} {
      allow create: if request.auth != null &&
                      request.resource.data.text.size() <= 500;
      allow read: if false; // Admin only
    }

    // Aggregated rankings (read-only, updated by cloud function)
    match /rankings/{imageId} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

#### 4. Integration Code

Replace the Firebase stub in `index.html`:

```html
<!-- Add before closing </body> tag -->
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
  import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
  import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

  const firebaseConfig = {
    // Your config here
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Anonymous auth
  let userId = null;
  signInAnonymously(auth).then((result) => {
    userId = result.user.uid;
    // Sync localStorage visitorId with Firebase UID
    localStorage.setItem('bearRanker_visitorId', userId);
  });

  // Override stub with real implementation
  window.firebaseAPI = {
    isReady: () => userId !== null,
    getVisitorId: () => userId,

    submitVote: async (winnerId, loserId) => {
      if (!userId) return false;
      try {
        await addDoc(collection(db, 'votes'), {
          visitorId: userId,
          winner: winnerId,
          loser: loserId,
          timestamp: serverTimestamp()
        });
        return true;
      } catch (e) {
        console.error('Vote sync failed:', e);
        return false;
      }
    },

    submitFeedback: async (imageId, tags) => {
      if (!userId) return false;
      try {
        await addDoc(collection(db, 'feedback'), {
          visitorId: userId,
          imageId,
          tags,
          timestamp: serverTimestamp()
        });
        return true;
      } catch (e) {
        console.error('Feedback sync failed:', e);
        return false;
      }
    },

    submitSuggestion: async (text) => {
      if (!userId) return false;
      try {
        await addDoc(collection(db, 'suggestions'), {
          visitorId: userId,
          text: text.substring(0, 500),
          timestamp: serverTimestamp()
        });
        return true;
      } catch (e) {
        console.error('Suggestion sync failed:', e);
        return false;
      }
    },

    resetIdentity: () => {
      auth.signOut().then(() => {
        localStorage.removeItem('bearRanker_visitorId');
        location.reload();
      });
    }
  };
</script>
```

#### 5. Update CSP for Firebase

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://www.gstatic.com;
  connect-src 'self' https://*.googleapis.com https://*.firebaseio.com;
  img-src 'self' data: blob:;
  style-src 'self' 'unsafe-inline';
  frame-ancestors 'none';
">
```

### Cloud Function for Aggregation (Optional)

```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.aggregateRankings = functions.firestore
  .document('votes/{voteId}')
  .onCreate(async (snap, context) => {
    const vote = snap.data();
    const db = admin.firestore();

    // Update winner
    await db.doc(`rankings/${vote.winner}`).set({
      wins: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Update loser
    await db.doc(`rankings/${vote.loser}`).set({
      losses: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
```

## Performance Considerations

| Area | Optimization |
|------|--------------|
| Image loading | `loading="lazy"` on leaderboard, `loading="eager"` on arena |
| Leaderboard render | Pre-compute win/loss in O(n) not O(n*m) |
| State persistence | Debounce saves, trim old matches |
| CSS animations | Use `transform` for GPU acceleration |
| Touch events | `passive: true` for scroll listeners |

## Testing Checklist

- [ ] Vote recording and Elo calculation
- [ ] localStorage persistence across refresh
- [ ] Keyboard navigation (Tab, Enter, Escape, Arrow keys)
- [ ] Screen reader announcements
- [ ] Mobile touch interactions
- [ ] Toast pause/resume on hover
- [ ] Swipe to dismiss toast
- [ ] Rankings click-to-view (tap on mobile, click on desktop)
- [ ] Rankings download button (desktop only, 768px+)
- [ ] Export JSON/CSV completeness
- [ ] Reset confirmation and cleanup
- [ ] Offline functionality (PWA)
- [ ] Undo last vote (30s window, Z/Ctrl+Z)
- [ ] Dark/Light theme toggle

## Implemented Features

- **PWA Support**: manifest.json + service worker with offline caching
- **Undo Vote**: 30-second window, keyboard shortcuts (Z, Ctrl+Z)
- **CSV Export**: Alongside JSON export in Rankings
- **Dark/Light Toggle**: System preference detection with manual override
- **Image Catalog**: Display names and descriptions for all 128 images

## Future Considerations

- **Image Lazy Generation**: Generate pairs on-demand for large image sets
- **Imagine Bar AI**: Connect to Haiku for prompt enhancement
- **Help Chatbot AI**: Connect to Haiku for FAQ responses
