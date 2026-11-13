import type { ChatMessage, Conversation } from '../types/workspace';

export interface AdaptiveSuggestionsResult {
  isFirstTime: boolean;
  greeting: string;
  suggestions: string[];
}

interface TopicRule {
  id: string;
  keywords: RegExp;
  prompts: [string, string];
}

const TOPIC_RULES: TopicRule[] = [
  {
    id: 'coding',
    keywords: /\b(code|bug|debug|typescript|javascript|react|python|api|function|error|css|html|build|refactor|test)\b/i,
    prompts: [
      'Review and simplify my latest code approach',
      'Spot potential edge cases or bugs in what we discussed',
    ],
  },
  {
    id: 'design',
    keywords: /\b(ui|ux|design|layout|theme|color|font|mobile|screen|style|button|animation)\b/i,
    prompts: [
      'Suggest ways to make the layout cleaner and easier to use',
      'Refine spacing, typography, and visual hierarchy for my idea',
    ],
  },
  {
    id: 'writing',
    keywords: /\b(write|draft|email|essay|story|edit|rewrite|tone|summary|summarize|notes|message)\b/i,
    prompts: [
      'Tighten the clarity and flow of my draft',
      'Turn my rough notes into a clear, structured outline',
    ],
  },
  {
    id: 'planning',
    keywords: /\b(plan|roadmap|steps|organize|schedule|project|idea|brainstorm|goal|compare|decide)\b/i,
    prompts: [
      'Break this down into simple, actionable next steps',
      'Compare pros, cons, and trade-offs for my options',
    ],
  },
  {
    id: 'learning',
    keywords: /\b(explain|why|how|what|learn|understand|concept|difference|example|guide)\b/i,
    prompts: [
      'Explain the core concept with a concrete everyday example',
      'Quiz me or give a quick mental model to remember this',
    ],
  },
];

function extractRecentTopicLabel(
  conversations: Conversation[],
  userMessages: ChatMessage[],
): string | null {
  const activeTitled = conversations.find(
    (c) =>
      c.messages.some((m) => m.role === 'user') &&
      c.title &&
      c.title !== 'New chat' &&
      c.title !== 'New Conversation' &&
      c.title !== 'Workspace Capabilities & Quick Start',
  );
  const raw = activeTitled?.title || userMessages[userMessages.length - 1]?.content || '';
  const cleaned = raw.replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
  if (cleaned.length < 4) return null;
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 39).trim()}...`;
}

export function buildAdaptiveSuggestions(
  conversations: Conversation[],
  extraMessages: ChatMessage[] = [],
  userName?: string | null,
): AdaptiveSuggestionsResult {
  const convUserMsgs = conversations.flatMap((c) =>
    c.messages.filter((m) => m.role === 'user' && m.content.trim().length > 0),
  );
  const extraUserMsgs = extraMessages.filter(
    (m) => m.role === 'user' && m.content.trim().length > 0,
  );
  const allUserMsgs = [...convUserMsgs, ...extraUserMsgs];
  const count = allUserMsgs.length;

  // First-time user: clean, welcoming, zero suggestion clutter
  if (count === 0) {
    return {
      isFirstTime: true,
      greeting: userName ? `Hello, ${userName}` : "What's on your mind?",
      suggestions: [],
    };
  }

  const greeting = userName ? `Back at it, ${userName}` : 'Back at it';
  const combinedText = allUserMsgs
    .slice(-15)
    .map((m) => m.content)
    .join('\n');

  const scoredTopics = TOPIC_RULES.map((rule) => {
    const matches = combinedText.match(new RegExp(rule.keywords.source, 'gi'));
    return { rule, score: matches ? matches.length : 0 };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const recentTopic = extractRecentTopicLabel(conversations, allUserMsgs);
  const suggestions: string[] = [];

  if (recentTopic) {
    suggestions.push(`Continue with "${recentTopic}"`);
  }

  for (const { rule } of scoredTopics) {
    for (const candidate of rule.prompts) {
      if (!suggestions.includes(candidate)) {
        suggestions.push(candidate);
        break;
      }
    }
    if (suggestions.length >= 3) break;
  }

  const fallbacks = [
    'Brainstorm fresh ideas for what I am working on',
    'Help me think through a decision step by step',
    'Summarize the key points from our recent chats',
  ];

  for (const fb of fallbacks) {
    if (suggestions.length >= (count <= 2 ? 2 : 3)) break;
    if (!suggestions.includes(fb)) {
      suggestions.push(fb);
    }
  }

  const maxCount = count <= 2 ? 2 : 3;
  return {
    isFirstTime: false,
    greeting,
    suggestions: suggestions.slice(0, maxCount),
  };
}
