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
      model: 'claude-3-5-haiku-20241022',
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
  // Simple heuristic classification
  const lowerMessage = message.toLowerCase();

  let type = 'question';
  if (
    lowerMessage.includes('bug') ||
    lowerMessage.includes('broken') ||
    lowerMessage.includes('error') ||
    lowerMessage.includes("doesn't work") ||
    lowerMessage.includes("can't")
  ) {
    type = 'bug';
  } else if (
    lowerMessage.includes('suggest') ||
    lowerMessage.includes('would be nice') ||
    lowerMessage.includes('feature') ||
    lowerMessage.includes('please add')
  ) {
    type = 'feedback';
  }

  return {
    type,
    confidence: 0.3,
    priority: type === 'bug' ? 'P3' : 'P4',
    component: 'other',
    labels: ['needs-triage'],
    title: message.slice(0, 80),
    summary: message.slice(0, 200),
    is_valid: true,
  };
}

/**
 * Escapes special characters in user input for safe prompt inclusion.
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeForPrompt(text) {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{{/g, '{ {')
    .replace(/}}/g, '} }');
}

module.exports = { classifyInput };
