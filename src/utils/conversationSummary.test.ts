import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConversationPreview,
  buildConversationTitleFromReply,
  stripMarkdownForSpeech,
} from './conversationSummary';
import type { Conversation } from '../types/workspace';

function makeConv(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  summary?: string,
): Conversation {
  return {
    id: 'c1',
    title: 'New Conversation',
    summary,
    mode: 'chat',
    providerId: 'gemini-flash',
    modelId: 'gemini-3.8-flash',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: messages.map((m, i) => ({
      id: `m_${i}`,
      role: m.role,
      content: m.content,
      createdAt: Date.now(),
    })),
  };
}

test('buildConversationPreview returns null when no assistant reply or summary exists', () => {
  assert.equal(buildConversationPreview(makeConv([])), null);
  assert.equal(
    buildConversationPreview(makeConv([{ role: 'user', content: 'My raw first message' }])),
    null,
  );
});

test('buildConversationPreview uses stored summary or distills assistant reply cleanly', () => {
  const fromStored = buildConversationPreview(
    makeConv(
      [{ role: 'user', content: 'Random gibberish prompt' }],
      'Explains local AES-GCM key storage clearly.',
    ),
  );
  assert.equal(fromStored, 'Explains local AES-GCM key storage clearly.');

  const preview = buildConversationPreview(
    makeConv([
      { role: 'user', content: 'How does E2EE work?' },
      {
        role: 'assistant',
        content:
          'Sure! ### Summary\nYour chats use **AES-256-GCM** encryption locally before syncing.',
      },
    ]),
    52,
  );
  assert.ok(preview !== null);
  assert.ok(!preview.includes('###'));
  assert.ok(!preview.includes('**'));
  assert.ok(!preview.startsWith('Sure'));
  assert.ok(!preview.includes('How does E2EE work'));
  assert.ok(preview.length <= 53);
});

test('buildConversationTitleFromReply derives concise title from assistant response and skips errors', () => {
  const title = buildConversationTitleFromReply(
    'Of course! **Debouncing async search** prevents stale race conditions.',
  );
  assert.equal(title, 'Debouncing async search prevents stale');
  assert.equal(
    buildConversationTitleFromReply('**Error:** API key not valid.'),
    null,
  );
  assert.equal(
    buildConversationTitleFromReply('**Offline mode:** Reconnect to stream.'),
    null,
  );
});

test('stripMarkdownForSpeech removes code fences and formatting symbols', () => {
  const spoken = stripMarkdownForSpeech(
    'Here is **your** result:\n```ts\nconst a = 1;\n```\nCheck [docs](https://example.com).',
  );
  assert.equal(
    spoken,
    'Here is your result: code snippet omitted. Check docs.',
  );
});
