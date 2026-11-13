import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_UI_PREFS,
  getTheme,
  resolveUiCssVars,
  WORKSPACE_THEMES,
} from './themes';

test('getTheme returns fallback obsidian theme for unknown id', () => {
  assert.equal(getTheme('nonexistent').id, 'obsidian');
  assert.equal(getTheme(undefined).id, 'obsidian');
});

test('all themes define dark/light polarity and 3 swatch colors', () => {
  const entries = Object.values(WORKSPACE_THEMES);
  assert.equal(entries.length, 5);
  for (const theme of entries) {
    assert.equal(typeof theme.isDark, 'boolean');
    assert.equal(theme.swatchColors.length, 3);
    assert.ok(theme.canvasBg.startsWith('#'));
  }
});

test('resolveUiCssVars applies custom accent, font, size, and width preferences', () => {
  assert.equal(DEFAULT_UI_PREFS.aiPersona, 'balanced');
  assert.equal(DEFAULT_UI_PREFS.responseLength, 'balanced');
  assert.equal(DEFAULT_UI_PREFS.autoSummarize, true);
  assert.equal(DEFAULT_UI_PREFS.ttsRate, 1.05);

  const vars = resolveUiCssVars(getTheme('obsidian'), {
    ...DEFAULT_UI_PREFS,
    accentHex: '#8b5cf6',
    fontFamily: 'serif',
    fontSize: 'large',
    chatWidth: 'wide',
  });
  assert.equal(vars['--app-accent-hex'], '#8b5cf6');
  assert.match(vars['--app-chat-font'], /Newsreader/);
  assert.equal(vars['--app-chat-size'], '16px');
  assert.equal(vars['--app-chat-max-w'], '56rem');
});
