/**
 * LLM-based message classifier
 *
 * Uses Claude Haiku to classify user messages into categories
 * and extract structured metadata for issue creation.
 */

const Anthropic = require('@anthropic-ai/sdk');

/**
 * Get Anthropic API key from environment.
 * @returns {string|undefined} API key
 */
function getApiKey() {
  return process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
}

const CLASSIFICATION_PROMPT = `You are a classifier for the Christmas Stories (Nutcracker) app helpbot. This is a web app where users rank Nutcracker ballet images.

Analyze this user message and output JSON:

<user_message>
{{message}}
</user_message>

<system_context>
Platform: {{platform}} {{osVersion}}
Browser: {{browser}} {{browserVersion}}
Device: {{deviceType}}
</system_context>

<few_shot_examples>
Example 1 (bug): "The app crashes when I try to vote on the last image pair"
{"type":"bug","confidence":0.95,"priority":"P1","component":"voting","labels":["bug"],"title":"App crashes on final image pair vote","summary":"App crashes when voting on the last comparison.","is_valid":true}

Example 2 (bug): "Images won't load, just showing blank boxes"
{"type":"bug","confidence":0.9,"priority":"P2","component":"images","labels":["bug"],"title":"Images not loading - blank boxes displayed","summary":"Images fail to load and display as blank boxes.","is_valid":true}

Example 3 (feedback): "It would be great to have a shuffle button to randomize the order"
{"type":"feedback","confidence":0.95,"priority":"P4","component":"voting","labels":["enhancement"],"title":"Add shuffle button to randomize comparison order","summary":"User requests a shuffle feature for randomizing image order.","is_valid":true}

Example 4 (feedback): "Love the app! Maybe add keyboard shortcuts for faster voting?"
{"type":"feedback","confidence":0.9,"priority":"P4","component":"accessibility","labels":["enhancement","accessibility"],"title":"Add keyboard shortcuts for voting","summary":"Suggestion to add keyboard shortcuts for faster voting.","is_valid":true}

Example 5 (question): "How do I see my final rankings after voting?"
{"type":"question","confidence":0.95,"priority":"P4","component":"rankings","labels":[],"title":"How to view final rankings","summary":"User asking how to access final rankings after voting.","is_valid":true}

Example 6 (question): "Can I undo a vote if I clicked the wrong one?"
{"type":"question","confidence":0.9,"priority":"P4","component":"undo","labels":[],"title":"How to undo a vote","summary":"User asking if they can undo an incorrect vote.","is_valid":true}

Example 7 (off_topic): "What's the weather like today?"
{"type":"off_topic","confidence":0.99,"priority":"P4","component":"other","labels":[],"title":"Off-topic: weather inquiry","summary":"Message unrelated to the app.","is_valid":false}

Example 8 (off_topic): "Can you help me book a flight to Paris?"
{"type":"off_topic","confidence":0.99,"priority":"P4","component":"other","labels":[],"title":"Off-topic: travel booking request","summary":"Message completely unrelated to the Nutcracker app.","is_valid":false}
</few_shot_examples>

Output this JSON structure ONLY (no other text):
{
  "type": "bug" | "feedback" | "question" | "off_topic",
  "confidence": 0.0-1.0,
  "priority": "P1" | "P2" | "P3" | "P4",
  "component": "voting" | "rankings" | "export" | "undo" | "theme" | "pwa" | "firebase" | "accessibility" | "ui" | "images" | "other",
  "labels": ["label1", "label2"],
  "title": "Concise issue title (max 80 chars)",
  "summary": "One sentence summary",
  "is_valid": true | false
}

Classification rules:
- type="bug" if something is broken, not working, crashes, shows errors
- type="feedback" if suggestion, feature request, opinion, or improvement idea
- type="question" if asking how to use the app or how something works
- type="off_topic" if completely unrelated to the app (weather, jokes, etc.)

Validation rules:
- is_valid=false for spam, abuse, gibberish, or completely off-topic
- is_valid=true for legitimate app-related messages even if negative

Priority rules:
- P1=critical: app crashes, data loss, security issues, completely unusable
- P2=high: major feature broken, significant functionality impaired
- P3=medium: feature partially works, workaround exists, UX problems
- P4=low: minor issues, cosmetic, nice-to-have improvements
- For feedback/feature requests, default to P4 unless user describes urgent need

Component detection:
- "voting" for comparison/voting issues
- "rankings" for leaderboard/Elo display issues
- "export" for sharing/saving functionality
- "undo" for undo feature issues
- "theme" for light/dark mode
- "pwa" for installation, offline, caching
- "firebase" for sync/auth issues
- "accessibility" for screen reader, keyboard nav
- "ui" for general interface issues
- "images" for image loading/display
- "other" if unclear

Labels to consider:
- bug, enhancement (based on type)
- mobile, desktop, tablet (based on device)
- safari, chrome, firefox, edge (based on browser)
- ios, android, macos, windows (based on platform)
- accessibility (if accessibility-related)
- performance (if about speed/lag)

<self_validation>
Before outputting, verify your response:
1. "type" is exactly one of: bug, feedback, question, off_topic
2. "confidence" is a number between 0.0 and 1.0
3. "priority" is exactly one of: P1, P2, P3, P4
4. "component" is one of the allowed values listed above
5. "labels" is an array (can be empty)
6. "title" is a string under 80 characters
7. "summary" is a single sentence
8. "is_valid" is true or false
If any field is invalid, fix it before responding.
</self_validation>

Output ONLY the JSON object, no explanation or markdown.`;

/**
 * Classifies user input using Claude Haiku.
 *
 * @param {string} message - User's message
 * @param {Object} systemContext - Device/browser context
 * @param {Object} additionalContext - Conversation context
 * @returns {Promise<Object>} Classification result
 */
async function classifyInput(message, systemContext, _additionalContext) {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error('Anthropic API key not configured');
    return createFallbackClassification(message);
  }

  const anthropic = new Anthropic({ apiKey });

  const prompt = CLASSIFICATION_PROMPT.replace('{{message}}', escapeForPrompt(message))
    .replace('{{platform}}', systemContext?.platform || 'Unknown')
    .replace('{{osVersion}}', systemContext?.osVersion || '')
    .replace('{{browser}}', systemContext?.browser || 'Unknown')
    .replace('{{browserVersion}}', systemContext?.browserVersion || '')
    .replace('{{deviceType}}', systemContext?.deviceType || 'Unknown');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';

    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in classification response:', text);
      return createFallbackClassification(message);
    }

    const json = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!json.type || !json.priority) {
      console.error('Invalid classification response:', json);
      return createFallbackClassification(message);
    }

    // Ensure labels is an array
    json.labels = Array.isArray(json.labels) ? json.labels : [];

    // Add needs-triage if low confidence
    if (json.confidence < 0.7) {
      if (!json.labels.includes('needs-triage')) {
        json.labels.push('needs-triage');
      }
    }

    // Ensure title doesn't exceed limit
    if (json.title) {
      json.title = json.title.slice(0, 80);
    }

    return json;
  } catch (error) {
    console.error('Classification error:', error.message);
    return createFallbackClassification(message);
  }
}

/**
 * Creates a fallback classification when LLM fails.
 *
 * @param {string} message - Original message
 * @returns {Object} Fallback classification
 */
function createFallbackClassification(message) {
  // Heuristic classification with expanded keyword detection
  const lowerMessage = message.toLowerCase();

  // Severity keywords for priority assignment
  const criticalKeywords = ['crash', 'data loss', 'lost my', 'disappeared', 'all gone'];
  const highSeverityKeywords = ['freeze', 'frozen', 'stuck', 'not responding', 'black screen', 'white screen', 'blank screen'];
  const mediumSeverityKeywords = ['slow', 'lag', 'laggy', 'loading forever', 'spinning', 'takes forever'];

  // Helper: check if message contains both words (for flexible phrase matching)
  const hasWordPair = (word1, word2) =>
    lowerMessage.includes(word1) && lowerMessage.includes(word2);

  // Screen issue detection (handles "screen is black", "black nothing shows", etc.)
  const hasScreenIssue =
    hasWordPair('black', 'screen') ||
    hasWordPair('white', 'screen') ||
    hasWordPair('blank', 'screen');

  // Bug indicators
  const bugKeywords = [
    'bug', 'broken', 'error', "doesn't work", "can't", 'not working',
    'crash', 'crashed', 'crashing',
    'freeze', 'freezes', 'frozen', 'freezing',
    'stuck', 'hang', 'hanging', 'hung',
    'slow', 'lag', 'laggy', 'sluggish',
    'data loss', 'lost my', 'lost all', 'disappeared', 'gone',
    'blank', 'black screen', 'white screen', 'empty',
    'spinning', 'loading forever', 'never loads', 'infinite loading',
    'not responding', 'unresponsive',
    'fail', 'failed', 'failing',
  ];

  // Feedback/feature request indicators
  const feedbackKeywords = [
    'suggest', 'suggestion', 'would be nice', 'feature', 'please add',
    'wish', 'hope', 'hoping',
    'could you', 'can you add', 'should have', 'should add',
    'missing', 'need', 'needs', 'want', 'wanted',
    'love if', 'would love', 'it would be great',
    'hate that', 'hate how', 'annoying that',
    'improve', 'improvement', 'better if',
    'consider adding', 'how about adding',
  ];

  // Off-topic indicators
  const offTopicKeywords = [
    'weather', 'forecast', 'temperature',
    'sports', 'football', 'basketball', 'soccer', 'baseball',
    'news', 'politics', 'election', 'president', 'congress',
    'recipe', 'cook', 'cooking', 'food recipe',
    'joke', 'tell me a joke', 'funny',
    'tell me about', 'what is', 'who is', 'explain',
    'write me', 'write a', 'poem', 'story',
    'translate', 'translation',
  ];

  let type = 'question';
  let priority = 'P4';

  // Check for off-topic first
  const isOffTopic = offTopicKeywords.some((kw) => lowerMessage.includes(kw));
  if (isOffTopic) {
    type = 'off_topic';
    priority = 'P4';
  } else {
    // Check for bugs (keywords OR screen issue word pairs)
    const isBug = bugKeywords.some((kw) => lowerMessage.includes(kw)) || hasScreenIssue;
    if (isBug) {
      type = 'bug';

      // Assign priority based on severity
      const isCritical = criticalKeywords.some((kw) => lowerMessage.includes(kw));
      const isHighSeverity = highSeverityKeywords.some((kw) => lowerMessage.includes(kw)) || hasScreenIssue;
      const isMediumSeverity = mediumSeverityKeywords.some((kw) => lowerMessage.includes(kw));

      if (isCritical) {
        priority = 'P2'; // Critical issues get P2 (P1 reserved for security/total outage)
      } else if (isHighSeverity) {
        priority = 'P2';
      } else if (isMediumSeverity) {
        priority = 'P3';
      } else {
        priority = 'P3'; // Default bug priority
      }
    } else {
      // Check for feedback
      const isFeedback = feedbackKeywords.some((kw) => lowerMessage.includes(kw));
      if (isFeedback) {
        type = 'feedback';
        priority = 'P4';
      }
    }
  }

  return {
    type,
    confidence: 0.3,
    priority,
    component: 'other',
    labels: ['needs-triage'],
    title: message.slice(0, 80),
    summary: message.slice(0, 200),
    is_valid: type !== 'off_topic',
  };
}

/**
 * Escapes special characters in user input for safe prompt inclusion.
 * Prevents prompt injection by escaping XML-like tags and template syntax.
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeForPrompt(text) {
  return text
    // Escape XML/HTML-like tags that could close our tags
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Escape template syntax
    .replace(/{{/g, '{ {')
    .replace(/}}/g, '} }')
    // Neutralize potential instruction injection patterns
    .replace(/\[INST\]/gi, '[inst]')
    .replace(/\[\/INST\]/gi, '[/inst]')
    .replace(/<<SYS>>/gi, '<<sys>>')
    .replace(/<<\/SYS>>/gi, '<</sys>>')
    // Limit to first 2000 chars to prevent token exhaustion
    .slice(0, 2000);
}

module.exports = { classifyInput };
