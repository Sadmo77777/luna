import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLunaSystemPrompt,
  formatPromptWithAttachments,
  LUNA_CREATOR_IDENTITY,
} from './systemPrompt';
import type { FileAttachment } from '../types/workspace';

test('all workspace modes include required creator identity', () => {
  for (const mode of ['chat', 'agent', 'companion'] as const) {
    const prompt = buildLunaSystemPrompt({ mode });
    assert.ok(
      prompt.includes(LUNA_CREATOR_IDENTITY),
      `Expected mode ${mode} to include creator identity`,
    );
  }
});

test('agent mode includes tool_call protocol and companion mode includes pose tags', () => {
  const agentPrompt = buildLunaSystemPrompt({
    mode: 'agent',
    activeTheme: 'obsidian',
    contextSection: 'package.json snippet',
  });
  assert.ok(agentPrompt.includes('<tool_call>'));
  assert.ok(agentPrompt.includes('package.json snippet'));

  const companionPrompt = buildLunaSystemPrompt({
    mode: 'companion',
    customInstructions: 'Speak concisely.',
    aiPersona: 'coder',
    responseLength: 'short',
    preferredName: 'Alex',
  });
  assert.ok(companionPrompt.includes('<pose>thinking</pose>'));
  assert.ok(companionPrompt.includes('Speak concisely.'));
  assert.ok(companionPrompt.includes('Alex'));
  assert.ok(companionPrompt.includes('coder'));
  assert.ok(companionPrompt.includes('Preferred length'));
});

test('formatPromptWithAttachments formats local files and fetched URLs cleanly', () => {
  const attachments: FileAttachment[] = [
    {
      id: 'f1',
      name: 'notes.txt',
      mimeType: 'text/plain',
      size: 18,
      content: 'hello world notes',
      kind: 'file',
    },
    {
      id: 'u1',
      name: 'example.com',
      mimeType: 'text/html',
      size: 24,
      content: 'Example domain summary.',
      kind: 'url',
      sourceUrl: 'https://example.com',
    },
  ];
  const combined = formatPromptWithAttachments('Summarize these', attachments);
  assert.ok(combined.startsWith('Summarize these'));
  assert.ok(combined.includes('notes.txt'));
  assert.ok(combined.includes('hello world notes'));
  assert.ok(combined.includes('https://example.com'));
  assert.ok(combined.includes('Example domain summary.'));
});
