import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentStepEvent } from '../types/workspace';
import { mapToolToActivity, summarizeActivitySteps } from './activity';

test('mapToolToActivity formats running, done, and failed tool states cleanly', () => {
  const runningCmd = mapToolToActivity('run_shell', 'running', { command: 'ls -la' });
  assert.equal(runningCmd.kind, 'command');
  assert.equal(runningCmd.label, 'Running command');
  assert.equal(runningCmd.detail, 'ls -la');

  const failedCmd = mapToolToActivity('run_shell', 'error', { command: 'rm -rf /' }, 'Blocked');
  assert.equal(failedCmd.kind, 'command');
  assert.equal(failedCmd.label, 'Command failed');
  assert.equal(failedCmd.output, 'Blocked');

  const memorySave = mapToolToActivity('save_doc', 'done', { title: 'architecture.md' });
  assert.equal(memorySave.kind, 'memory');
  assert.equal(memorySave.label, 'Saved to memory');
  assert.equal(memorySave.detail, 'architecture.md');
});

test('summarizeActivitySteps creates concise collapsed summary', () => {
  const steps: AgentStepEvent[] = [
    { id: '1', kind: 'thinking', label: 'Thinking deeply', timestamp: 1, status: 'done' },
    { id: '2', kind: 'memory', label: 'Saved to memory', timestamp: 2, status: 'done' },
  ];
  assert.equal(summarizeActivitySteps(steps), '2 steps · Thinking deeply, Saved to memory');
  assert.equal(summarizeActivitySteps([steps[0]]), 'Thinking deeply');
});
