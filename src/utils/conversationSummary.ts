import type { Conversation } from '../types/workspace';

function stripMarkdownToPlainText(raw: string): string {
  return raw
    .replace(/<pose>[\s\S]*?<\/pose>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s+/g, ' ')
    .replace(/^\s*[-*+>]\s+/gm, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripConversationalPreamble(text: string): string {
  return text
    .replace(/^(?:welcome to luna[.!\s-]*|sure|of course|certainly|absolutely|happy to help|here(?:'s| is)|yes|okay|hi there|hello)[!,.:;\s-]+/i, '')
    .trim();
}

export function buildConversationPreview(
  conversation: Conversation,
  maxLength = 46,
): string | null {
  if (conversation.summary?.trim()) {
    const plainSummary = stripMarkdownToPlainText(conversation.summary);
    if (plainSummary.length <= maxLength) return plainSummary;
    const sliced = plainSummary.slice(0, maxLength - 1);
    const lastSpace = sliced.lastIndexOf(' ');
    const clipped = lastSpace > maxLength * 0.55 ? sliced.slice(0, lastSpace) : sliced;
    return `${clipped.trim()}…`;
  }

  // Summarize from assistant chat text — never echo the user's raw first message verbatim
  const assistantMsgs = conversation.messages.filter(
    (m) =>
      m.role === 'assistant' &&
      m.content.trim().length > 0 &&
      !/^\*\*(?:Error|Connection error|Offline mode):\*\*/i.test(m.content.trim()),
  );
  if (assistantMsgs.length === 0) return null;

  const latestAssistant = assistantMsgs[assistantMsgs.length - 1];
  const rawPlain = stripMarkdownToPlainText(latestAssistant.content);
  const plain = stripConversationalPreamble(rawPlain) || rawPlain;
  if (!plain) return null;
  if (plain.length <= maxLength) return plain;

  const sliced = plain.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const clipped = lastSpace > maxLength * 0.55 ? sliced.slice(0, lastSpace) : sliced;
  return `${clipped.trim()}…`;
}

export function buildConversationTitleFromReply(
  assistantText: string,
  maxWords = 5,
): string | null {
  const trimmed = assistantText.trim();
  if (
    !trimmed ||
    /^\*\*(?:Error|Connection error|Offline mode):\*\*/i.test(trimmed)
  ) {
    return null;
  }
  const rawPlain = stripMarkdownToPlainText(trimmed);
  const cleaned = stripConversationalPreamble(rawPlain) || rawPlain;
  if (!cleaned) return null;

  // Take first clause/sentence and extract up to maxWords concise words
  const firstClause = cleaned.split(/[.!?\n;]/)[0]?.trim() ?? '';
  const words = firstClause
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);

  if (words.length === 0) return null;
  const candidate = words.join(' ');
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

export function stripMarkdownForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' code snippet omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
