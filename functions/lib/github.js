/**
 * GitHub Issues integration
 *
 * Creates and updates issues in the Nutcracker repository
 * with deduplication and priority management.
 */

const { Octokit } = require('@octokit/rest');

const GITHUB_CONFIG = {
  owner: 'lean-wintermute',
  repo: 'nutcracker',
};

/**
 * Get GitHub token from environment.
 * @returns {string|undefined} Token
 */
function getGitHubToken() {
  return process.env.GITHUB_TOKEN;
}

/**
 * Creates a new issue or updates an existing one.
 *
 * @param {Object} classification - LLM classification result
 * @param {string} message - Original user message
 * @param {Object} systemContext - Device/browser context
 * @returns {Promise<Object>} Result with action and issue details
 */
async function createOrUpdateIssue(classification, message, systemContext) {
  const token = getGitHubToken();

  if (!token) {
    console.error('GitHub token not configured');
    return { action: 'FAILED', error: 'GitHub not configured' };
  }

  const octokit = new Octokit({ auth: token });

  try {
    // Ensure required labels exist in the repo
    await ensureLabelsExist(octokit, classification);

    // Check for duplicate/similar existing issues
    const dupeCheck = await findSimilarIssues(octokit, classification);

    if (dupeCheck.isDuplicate) {
      // Add comment to existing issue
      const existingIssue = dupeCheck.issue;

      await octokit.issues.createComment({
        ...GITHUB_CONFIG,
        issue_number: existingIssue.number,
        body: formatDuplicateComment(message, systemContext, classification),
      });

      // Check if priority should be upgraded based on report frequency
      const upgrade = await checkPriorityUpgrade(
        octokit,
        existingIssue,
        classification
      );

      // Reopen if recently closed (within 30 days)
      if (existingIssue.state === 'closed' && existingIssue.closed_at) {
        const daysClosed =
          (Date.now() - new Date(existingIssue.closed_at).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysClosed < 30) {
          await octokit.issues.update({
            ...GITHUB_CONFIG,
            issue_number: existingIssue.number,
            state: 'open',
          });
        }
      }

      return {
        action: 'ADDED_TO_EXISTING',
        issueNumber: existingIssue.number,
        issueUrl: existingIssue.html_url,
        priorityUpgraded: upgrade.upgraded,
      };
    }

    // Create new issue
    const issueData = formatNewIssue(classification, message, systemContext);

    const response = await octokit.issues.create({
      ...GITHUB_CONFIG,
      title: issueData.title,
      body: issueData.body,
      labels: issueData.labels,
    });

    return {
      action: 'CREATED',
      issueNumber: response.data.number,
      issueUrl: response.data.html_url,
    };
  } catch (error) {
    console.error('GitHub error:', error.message);
    return { action: 'FAILED', error: error.message };
  }
}

/**
 * Ensures required labels exist in the repository.
 * Creates them if missing.
 */
async function ensureLabelsExist(octokit, _classification) {
  const requiredLabels = {
    'P1-critical': { color: 'b60205', description: 'Critical: crashes, data loss' },
    'P2-high': { color: 'ff9f1c', description: 'High: major feature broken' },
    'P3-medium': { color: 'fbca04', description: 'Medium: feature impaired' },
    'P4-low': { color: 'c5def5', description: 'Low: minor issue' },
    bug: { color: 'd73a4a', description: "Something isn't working" },
    enhancement: { color: 'a2eeef', description: 'New feature or request' },
    'user-submitted': { color: 'bfdadc', description: 'Submitted via helpbot' },
    'needs-triage': { color: 'ffffff', description: 'Needs manual review' },
    // Component labels
    voting: { color: '1d76db', description: 'Voting functionality' },
    rankings: { color: '0e8a16', description: 'Rankings display' },
    pwa: { color: '5319e7', description: 'PWA/offline features' },
    ui: { color: 'f9d0c4', description: 'User interface' },
    accessibility: { color: '0052cc', description: 'Accessibility issues' },
  };

  try {
    // Get existing labels
    const { data: existingLabels } = await octokit.issues.listLabelsForRepo({
      ...GITHUB_CONFIG,
      per_page: 100,
    });
    const existingNames = new Set(existingLabels.map((l) => l.name.toLowerCase()));

    // Create missing labels
    for (const [name, config] of Object.entries(requiredLabels)) {
      if (!existingNames.has(name.toLowerCase())) {
        try {
          await octokit.issues.createLabel({
            ...GITHUB_CONFIG,
            name,
            color: config.color,
            description: config.description,
          });
        } catch (e) {
          // Label might already exist with different case - ignore
          if (e.status !== 422) {
            console.warn(`Could not create label ${name}:`, e.message);
          }
        }
      }
    }
  } catch (error) {
    console.warn('Error ensuring labels:', error.message);
    // Continue - labels are nice to have but not critical
  }
}

/**
 * Searches for similar existing issues to avoid duplicates.
 *
 * @param {Octokit} octokit - GitHub client
 * @param {Object} classification - Classification result
 * @returns {Promise<Object>} Duplicate check result
 */
async function findSimilarIssues(octokit, classification) {
  // Extract significant keywords from title
  const keywords = classification.title
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !isStopWord(w))
    .slice(0, 3);

  if (keywords.length === 0) {
    return { isDuplicate: false };
  }

  const query = `repo:${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo} is:issue ${keywords.join(' ')}`;

  try {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: query,
      per_page: 10,
      sort: 'updated',
      order: 'desc',
    });

    // Check each result for similarity
    for (const issue of data.items) {
      const similarity = jaccardSimilarity(
        classification.title.toLowerCase().split(/\W+/),
        issue.title.toLowerCase().split(/\W+/)
      );

      // Also check component match for higher confidence
      const componentMatch = issue.labels.some(
        (l) => l.name === classification.component
      );

      // Higher threshold if component doesn't match
      const threshold = componentMatch ? 0.4 : 0.6;

      if (similarity > threshold) {
        return { isDuplicate: true, issue };
      }
    }
  } catch (e) {
    console.error('GitHub search error:', e.message);
  }

  return { isDuplicate: false };
}

/**
 * Calculates Jaccard similarity between two word arrays.
 */
function jaccardSimilarity(arr1, arr2) {
  const set1 = new Set(arr1.filter((w) => w.length > 2 && !isStopWord(w)));
  const set2 = new Set(arr2.filter((w) => w.length > 2 && !isStopWord(w)));

  if (set1.size === 0 || set2.size === 0) {
    return 0;
  }

  const intersection = [...set1].filter((x) => set2.has(x));
  const union = new Set([...set1, ...set2]);

  return intersection.length / union.size;
}

/**
 * Checks if a word is a common stop word.
 */
function isStopWord(word) {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'are',
    'but',
    'not',
    'you',
    'all',
    'can',
    'had',
    'her',
    'was',
    'one',
    'our',
    'out',
    'has',
    'have',
    'been',
    'when',
    'will',
    'more',
    'with',
    'they',
    'this',
    'that',
    'from',
    'what',
    'which',
    'their',
    'would',
    'there',
    'could',
    'about',
    'image',
    'images',
    'app',
    'application',
  ]);
  return stopWords.has(word);
}

/**
 * Checks if issue priority should be upgraded based on report count.
 */
async function checkPriorityUpgrade(octokit, issue, newClassification) {
  const priorityLabels = ['P1-critical', 'P2-high', 'P3-medium', 'P4-low'];
  const currentLabel = issue.labels.find((l) =>
    priorityLabels.includes(l.name)
  );
  const currentPriority = currentLabel ? parseInt(currentLabel.name[1]) : 4;
  const newPriority = parseInt(newClassification.priority[1]);

  // Count previous reports (comments with "Additional Report" header)
  let reportCount = 1;
  try {
    const { data: comments } = await octokit.issues.listComments({
      ...GITHUB_CONFIG,
      issue_number: issue.number,
      per_page: 100,
    });
    reportCount =
      comments.filter((c) => c.body.includes('Additional Report')).length + 1;
  } catch (e) {
    console.warn('Error counting comments:', e.message);
  }

  let shouldUpgrade = false;
  let upgradeTo = currentPriority;

  // Upgrade if new report has higher priority
  if (newPriority < currentPriority) {
    shouldUpgrade = true;
    upgradeTo = newPriority;
  }
  // Auto-upgrade based on report frequency
  else if (reportCount >= 10 && currentPriority > 1) {
    shouldUpgrade = true;
    upgradeTo = 1;
  } else if (reportCount >= 5 && currentPriority > 2) {
    shouldUpgrade = true;
    upgradeTo = 2;
  } else if (reportCount >= 3 && currentPriority > 3) {
    shouldUpgrade = true;
    upgradeTo = 3;
  }

  if (shouldUpgrade) {
    const newLabel = priorityLabels.find((l) => l.startsWith(`P${upgradeTo}`));
    const labels = issue.labels
      .map((l) => l.name)
      .filter((l) => !priorityLabels.includes(l));
    labels.push(newLabel);

    try {
      await octokit.issues.update({
        ...GITHUB_CONFIG,
        issue_number: issue.number,
        labels,
      });

      await octokit.issues.createComment({
        ...GITHUB_CONFIG,
        issue_number: issue.number,
        body: `**Priority upgraded to ${newLabel}**\n\nReason: ${reportCount} user reports received${newPriority < currentPriority ? ' and a higher-priority report' : ''}.`,
      });
    } catch (e) {
      console.error('Error upgrading priority:', e.message);
    }
  }

  return { upgraded: shouldUpgrade, newPriority: `P${upgradeTo}` };
}

/**
 * Formats a new GitHub issue from classification and user input.
 */
function formatNewIssue(classification, message, systemContext) {
  const typeLabel = classification.type === 'bug' ? 'bug' : 'enhancement';
  const priorityLabel = `${classification.priority}-${getPriorityName(classification.priority)}`;

  // Build label list with deduplication
  const labels = [
    typeLabel,
    priorityLabel,
    'user-submitted',
    classification.component,
    ...(classification.labels || []),
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  const body = `## ${classification.type === 'bug' ? 'Bug Report' : 'Feature Request'}

**Summary:** ${classification.summary || message.slice(0, 200)}

### User Message
> ${escapeMarkdown(message)}

### System Context
| Property | Value |
|----------|-------|
| Platform | ${systemContext?.platform || 'Unknown'} ${systemContext?.osVersion || ''} |
| Browser | ${systemContext?.browser || 'Unknown'} ${systemContext?.browserVersion || ''} |
| Device | ${systemContext?.deviceType || 'Unknown'} |
| PWA Mode | ${systemContext?.isPWA ? 'Yes' : 'No'} |
| Online | ${systemContext?.isOnline !== false ? 'Yes' : 'No'} |

### Classification
- **Confidence:** ${(classification.confidence * 100).toFixed(0)}%
- **Component:** ${classification.component}
- **Priority:** ${classification.priority}

---
*Submitted via Helpbot on ${new Date().toISOString()}*`;

  return {
    title: classification.title || message.slice(0, 80),
    body,
    labels,
  };
}

/**
 * Formats a comment to add to an existing issue.
 */
function formatDuplicateComment(message, systemContext, classification) {
  return `### Additional Report Received

**Type:** ${classification.type === 'bug' ? 'Bug Report' : 'Feedback'}
**Priority Assessment:** ${classification.priority}
**Confidence:** ${(classification.confidence * 100).toFixed(0)}%

> ${escapeMarkdown(message)}

| Platform | Browser | Device |
|----------|---------|--------|
| ${systemContext?.platform || '?'} ${systemContext?.osVersion || ''} | ${systemContext?.browser || '?'} ${systemContext?.browserVersion || ''} | ${systemContext?.deviceType || '?'} |

---
*Reported via Helpbot on ${new Date().toISOString()}*`;
}

/**
 * Gets human-readable priority name.
 */
function getPriorityName(priority) {
  const names = { P1: 'critical', P2: 'high', P3: 'medium', P4: 'low' };
  return names[priority] || 'low';
}

/**
 * Escapes markdown special characters in user input.
 */
function escapeMarkdown(text) {
  return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}

module.exports = { createOrUpdateIssue };
