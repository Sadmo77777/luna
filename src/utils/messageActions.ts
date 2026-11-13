import type { ChatMessage, ImageAttachment } from '../types/workspace';

export type MessageFeedback = 'good' | 'bad';

export function toggleMessageFeedback(
  messages: ChatMessage[],
  messageId: string,
  rating: MessageFeedback,
): ChatMessage[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const nextFeedback = m.feedback === rating ? null : rating;
    return { ...m, feedback: nextFeedback };
  });
}

export interface RegeneratePlan {
  historyUpToUser: ChatMessage[];
  userText: string;
  userImages: ImageAttachment[];
}

export function prepareRegenerate(
  messages: ChatMessage[],
  assistantMessageId: string,
): RegeneratePlan | null {
  const targetIdx = messages.findIndex(
    (m) => m.id === assistantMessageId && m.role === 'assistant',
  );
  if (targetIdx === -1) return null;

  for (let i = targetIdx - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate.role === 'user') {
      return {
        historyUpToUser: messages.slice(0, i + 1),
        userText: candidate.content,
        userImages: candidate.images ?? [],
      };
    }
  }
  return null;
}

export interface EditResubmitPlan {
  historyWithEditedUser: ChatMessage[];
  editedText: string;
  editedImages: ImageAttachment[];
  isFirstUserMessage: boolean;
}

export function prepareEditResubmit(
  messages: ChatMessage[],
  userMessageId: string,
  nextContent: string,
): EditResubmitPlan | null {
  const trimmed = nextContent.trim();
  const targetIdx = messages.findIndex(
    (m) => m.id === userMessageId && m.role === 'user',
  );
  if (targetIdx === -1) return null;

  const target = messages[targetIdx];
  const images = target.images ?? [];
  if (!trimmed && images.length === 0) return null;

  const updatedUser: ChatMessage = {
    ...target,
    content: trimmed,
  };
  const firstUserIdx = messages.findIndex((m) => m.role === 'user');
  return {
    historyWithEditedUser: [...messages.slice(0, targetIdx), updatedUser],
    editedText: trimmed,
    editedImages: images,
    isFirstUserMessage: targetIdx === firstUserIdx,
  };
}
