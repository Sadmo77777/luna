import test from 'node:test';
import assert from 'node:assert/strict';
import { matchWorkspaceShortcut, WORKSPACE_SHORTCUTS } from './shortcuts';

test('WORKSPACE_SHORTCUTS covers every core navigation shortcut', () => {
  const ids = WORKSPACE_SHORTCUTS.map((s) => s.id);
  assert.deepEqual(ids, [
    'new_chat',
    'upload_files',
    'toggle_sidebar',
    'focus_composer',
    'focus_history_search',
    'open_settings',
  ]);
});

test('matchWorkspaceShortcut matches Ctrl/Cmd+B, Ctrl/Cmd+U, Ctrl/Cmd+Shift+O, Shift+Esc, Ctrl/Cmd+,', () => {
  assert.equal(
    matchWorkspaceShortcut({ key: 'b', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }),
    'toggle_sidebar',
  );
  assert.equal(
    matchWorkspaceShortcut({ key: 'u', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }),
    'upload_files',
  );
  assert.equal(
    matchWorkspaceShortcut({ key: 'O', ctrlKey: false, metaKey: true, shiftKey: true, altKey: false }),
    'new_chat',
  );
  assert.equal(
    matchWorkspaceShortcut({ key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: true, altKey: false }),
    'focus_composer',
  );
  assert.equal(
    matchWorkspaceShortcut({ key: ',', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }),
    'open_settings',
  );
  assert.equal(
    matchWorkspaceShortcut({ key: 's', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }),
    'focus_history_search',
  );
});

test('matchWorkspaceShortcut ignores unmodified keys or mismatched modifiers', () => {
  assert.equal(
    matchWorkspaceShortcut({ key: 'b', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }),
    null,
  );
  assert.equal(
    matchWorkspaceShortcut({ key: 'o', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }),
    null,
  );
  assert.equal(
    matchWorkspaceShortcut({ key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }),
    null,
  );
});
