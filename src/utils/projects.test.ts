import test from 'node:test';
import assert from 'node:assert/strict';
import type { Conversation, ProjectFolder } from '../types/workspace';
import {
  createProjectFolder,
  createStarterProjects,
  filterConversationsByQueryAndProject,
  formatReasoningEffortLabel,
  partitionPinnedConversations,
  shortenModelLabel,
} from './projects';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: overrides.id ?? 'c1',
    title: overrides.title ?? 'Test Chat',
    mode: 'chat',
    providerId: 'gemini-flash',
    modelId: 'gemini-4-hydrogen',
    messages: [],
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

test('createProjectFolder trims names and deduplicates case-insensitively', () => {
  const starter: ProjectFolder[] = createStarterProjects();
  assert.equal(createProjectFolder('   ', { existing: starter }), null);

  const dup = createProjectFolder('  luna ', { existing: starter });
  assert.equal(dup?.id, 'proj_luna');

  const fresh = createProjectFolder('  Atlas   Agent  ', { existing: starter });
  assert.ok(fresh);
  assert.equal(fresh.name, 'Atlas Agent');
  assert.equal(fresh.pinned, true);
  assert.equal(fresh.defaultMode, 'agent');
});

test('filterConversationsByQueryAndProject respects projectId and query', () => {
  const convs = [
    makeConv({ id: '1', title: 'Landing UI', projectId: 'proj_luna' }),
    makeConv({ id: '2', title: 'Family Trip', projectId: 'proj_family' }),
    makeConv({ id: '3', title: 'Quick Question' }),
  ];
  const byProject = filterConversationsByQueryAndProject(convs, '', 'proj_luna', () => null);
  assert.deepEqual(byProject.map((c) => c.id), ['1']);

  const byQuery = filterConversationsByQueryAndProject(convs, 'trip', null, () => null);
  assert.deepEqual(byQuery.map((c) => c.id), ['2']);
});

test('partitionPinnedConversations separates pinned chats while preserving order', () => {
  const convs = [
    makeConv({ id: 'a', pinned: false }),
    makeConv({ id: 'b', pinned: true }),
    makeConv({ id: 'c', pinned: true }),
  ];
  const { pinned, regular } = partitionPinnedConversations(convs);
  assert.deepEqual(pinned.map((c) => c.id), ['b', 'c']);
  assert.deepEqual(regular.map((c) => c.id), ['a']);
});

test('formatReasoningEffortLabel and shortenModelLabel format cleanly', () => {
  assert.equal(formatReasoningEffortLabel(false), 'Standard');
  assert.equal(formatReasoningEffortLabel(true), 'High');
  assert.equal(shortenModelLabel('Google Gemini 4 Hydrogen'), 'Gemini 4 Hydrogen');
  assert.equal(shortenModelLabel('Anthropic Claude'), 'Claude');
});
