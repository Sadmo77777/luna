import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessage } from '../types/workspace';
import {
  prepareEditResubmit,
  prepareRegenerate,
  toggleMessageFeedback,
} from './messageActions';

const sampleMessages: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'Hello Luna', createdAt: 1 },
  { id: 'a1', role: 'assistant', content: 'Hi there!', createdAt: 2 },
  { id: 'u2', role: 'user', content: 'Explain caching', createdAt: 3 },
  { id: 'a2', role: 'assistant', content: 'Caching stores frequent results.', createdAt: 4 },
];

test('toggleMessageFeedback sets and clears feedback cleanly', () => {
  const markedGood = toggleMessageFeedback(sampleMessages, 'a2', 'good');
  assert.equal(markedGood[3].feedback, 'good');
  assert.equal(markedGood[1].feedback, undefined);

  const cleared = toggleMessageFeedback(markedGood, 'a2', 'good');
  assert.equal(cleared[3].feedback, null);

  const switched = toggleMessageFeedback(markedGood, 'a2', 'bad');
  assert.equal(switched[3].feedback, 'bad');
});

test('prepareRegenerate slices history up to preceding user message', () => {
  const plan = prepareRegenerate(sampleMessages, 'a1');
  assert.ok(plan);
  assert.equal(plan.historyUpToUser.length, 1);
  assert.equal(plan.historyUpToUser[0].id, 'u1');
  assert.equal(plan.userText, 'Hello Luna');

  const secondPlan = prepareRegenerate(sampleMessages, 'a2');
  assert.ok(secondPlan);
  assert.equal(secondPlan.historyUpToUser.length, 3);
  assert.equal(secondPlan.userText, 'Explain caching');

  assert.equal(prepareRegenerate(sampleMessages, 'u1'), null);
  assert.equal(prepareRegenerate(sampleMessages, 'missing'), null);
});

test('prepareEditResubmit updates user message and truncates later turns', () => {
  const plan = prepareEditResubmit(sampleMessages, 'u1', '  Hello edited Luna  ');
  assert.ok(plan);
  assert.equal(plan.isFirstUserMessage, true);
  assert.equal(plan.editedText, 'Hello edited Luna');
  assert.equal(plan.historyWithEditedUser.length, 1);
  assert.equal(plan.historyWithEditedUser[0].content, 'Hello edited Luna');

  const secondEdit = prepareEditResubmit(sampleMessages, 'u2', 'Explain LRU caching');
  assert.ok(secondEdit);
  assert.equal(secondEdit.isFirstUserMessage, false);
  assert.equal(secondEdit.historyWithEditedUser.length, 3);
  assert.equal(secondEdit.historyWithEditedUser[2].content, 'Explain LRU caching');

  assert.equal(prepareEditResubmit(sampleMessages, 'u1', '   '), null);
});
