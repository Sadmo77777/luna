import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdaptiveSuggestions } from './suggestions';
import type { Conversation } from '../types/workspace';

function makeConv(id: string, title: string, userTexts: string[]): Conversation {
  return {
    id,
    title,
    mode: 'chat',
    providerId: 'gemini-flash',
    modelId: 'gemini-3.8-flash',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: userTexts.map((t, i) => ({
      id: `${id}_${i}`,
      role: 'user',
      content: t,
      createdAt: Date.now(),
    })),
  };
}

test('first-time user gets clean greeting and zero suggestions', () => {
  const starterOnly = makeConv('conv_welcome', 'Workspace Capabilities & Quick Start', []);
  const res = buildAdaptiveSuggestions([starterOnly], [], 'Alex');
  assert.equal(res.isFirstTime, true);
  assert.equal(res.greeting, 'Hello, Alex');
  assert.deepEqual(res.suggestions, []);
});

test('early user gets up to 2 tailored suggestions', () => {
  const conv = makeConv('c1', 'Mobile UI polish', [
    'Help me improve my mobile UI theme and layout',
  ]);
  const res = buildAdaptiveSuggestions([conv]);
  assert.equal(res.isFirstTime, false);
  assert.equal(res.greeting, 'Back at it');
  assert.equal(res.suggestions.length, 2);
  assert.ok(res.suggestions[0].includes('Mobile UI polish'));
});

test('returning user gets 3 topic-adapted suggestions', () => {
  const convs = [
    makeConv('c1', 'TypeScript search helper', [
      'Debug this TypeScript function and fix the API error',
      'Write a test for the React bug',
      'Refactor the code cleanly',
    ]),
  ];
  const res = buildAdaptiveSuggestions(convs);
  assert.equal(res.isFirstTime, false);
  assert.equal(res.suggestions.length, 3);
  assert.ok(
    res.suggestions.some((s) => /code|edge cases|TypeScript/i.test(s)),
  );
});
