import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSandboxHtml,
  extractAgentToolCalls,
  extractCompanionPose,
  extractExecutableBlocks,
  isSafeWorkspacePath,
  parseTerminalCommand,
  stripStreamingToolTags,
  validateSafeShellCommand,
} from './agentParser';

test('parseTerminalCommand handles quoted arguments cleanly', () => {
  const parsed = parseTerminalCommand('ask "inspect auth middleware" --deep');
  assert.equal(parsed.command, 'ask');
  assert.deepEqual(parsed.args, ['inspect auth middleware', '--deep']);
});

test('extractExecutableBlocks pulls fenced JS and HTML blocks', () => {
  const md = [
    'Here is a test snippet:',
    '```javascript',
    'console.log(2 + 2);',
    '```',
    'And markup:',
    '```html',
    '<div>Hello</div>',
    '```',
  ].join('\n');
  const blocks = extractExecutableBlocks(md);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].language, 'javascript');
  assert.equal(blocks[1].language, 'html');
});

test('buildSandboxHtml wraps JS and HTML safely with console bridge', () => {
  const jsHtml = buildSandboxHtml('console.log("ok")', 'javascript');
  assert.ok(jsHtml.includes('aetheris-sandbox'));
  assert.ok(jsHtml.includes('console.log("ok")'));

  const rawHtml = buildSandboxHtml('<h1>Demo</h1>', 'html');
  assert.ok(rawHtml.includes('<h1>Demo</h1>'));
});

test('extractAgentToolCalls parses tool_call XML blocks and strips tags', () => {
  const raw = 'Checking files now.\n<tool_call>{"tool":"run_shell","args":{"command":"ls src"}}</tool_call>\nDone.';
  const { cleanText, calls } = extractAgentToolCalls(raw);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool, 'run_shell');
  assert.equal(calls[0].args.command, 'ls src');
  assert.equal(cleanText, 'Checking files now.\n\nDone.');
  assert.equal(stripStreamingToolTags('Hi <tool_call>{"tool":"run_js"'), 'Hi');
});

test('isSafeWorkspacePath blocks sensitive files and traversal', () => {
  assert.equal(isSafeWorkspacePath('src/App.tsx'), true);
  assert.equal(isSafeWorkspacePath('.env'), false);
  assert.equal(isSafeWorkspacePath('../etc/passwd'), false);
  assert.equal(isSafeWorkspacePath('firebase-applet-config.json'), false);
});

test('validateSafeShellCommand allows safe read commands and blocks operators', () => {
  const okRes = validateSafeShellCommand('ls -la src');
  assert.equal(okRes.ok, true);
  const badOp = validateSafeShellCommand('ls && rm -rf /');
  assert.equal(badOp.ok, false);
  const badCmd = validateSafeShellCommand('rm package.json');
  assert.equal(badCmd.ok, false);
});

test('extractCompanionPose parses pose tags and strips partial streaming tags', () => {
  const full = '<pose>thinking</pose> Let me check that for you. <pose>talking</pose> Here is what I found!';
  const res = extractCompanionPose(full);
  assert.equal(res.pose, 'talking');
  assert.equal(res.cleanText, 'Let me check that for you. Here is what I found!');

  const usingTool = extractCompanionPose('<pose>using tool</pose> Working on it... <pose>idle');
  assert.equal(usingTool.pose, 'using_tool');
  assert.equal(usingTool.cleanText, 'Working on it...');
});
