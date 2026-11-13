export interface ExecutableCodeBlock {
  language: string;
  code: string;
}

export interface ParsedTerminalCommand {
  command: string;
  args: string[];
  raw: string;
}

export function parseTerminalCommand(input: string): ParsedTerminalCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return { command: '', args: [], raw: '' };
  }
  const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const cleaned = parts.map((p) =>
    (p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))
      ? p.slice(1, -1)
      : p,
  );
  return {
    command: (cleaned[0] ?? '').toLowerCase(),
    args: cleaned.slice(1),
    raw: trimmed,
  };
}

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
}

const ALLOWED_SHELL_COMMANDS = new Set([
  'ls',
  'pwd',
  'date',
  'node',
  'wc',
  'head',
  'tail',
  'grep',
  'cat',
  'echo',
  'find',
  'git',
]);

export function isSafeWorkspacePath(targetPath: string): boolean {
  const normalized = targetPath.trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    return false;
  }
  const lower = normalized.toLowerCase();
  if (
    lower === '.env' ||
    lower.startsWith('.env.') ||
    lower.includes('/.env') ||
    lower.includes('node_modules') ||
    lower.includes('.git/') ||
    lower === '.git' ||
    lower.includes('serviceaccount') ||
    lower.includes('firebase-applet-config.json')
  ) {
    return false;
  }
  return true;
}

export function validateSafeShellCommand(
  rawInput: string,
): { ok: true; command: string; args: string[] } | { ok: false; error: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: 'Empty command.' };
  }
  if (/[;&|`$<>]/.test(trimmed)) {
    return {
      ok: false,
      error: 'Shell operators (;|&`$><) are blocked for workspace safety.',
    };
  }
  const parsed = parseTerminalCommand(trimmed);
  if (!ALLOWED_SHELL_COMMANDS.has(parsed.command)) {
    return {
      ok: false,
      error: `Command "${parsed.command}" is not allowlisted. Allowed: ${Array.from(ALLOWED_SHELL_COMMANDS).join(', ')}`,
    };
  }
  for (const arg of parsed.args) {
    const lower = arg.toLowerCase();
    if (
      lower.includes('.env') ||
      lower.includes('..') ||
      lower.includes('firebase-applet-config')
    ) {
      return { ok: false, error: `Access to "${arg}" is restricted.` };
    }
  }
  if (parsed.command === 'git' && parsed.args[0] && !['status', 'log', 'diff', 'branch'].includes(parsed.args[0])) {
    return { ok: false, error: 'Only read-only git subcommands (status, log, diff, branch) are allowed.' };
  }
  return { ok: true, command: parsed.command, args: parsed.args };
}

export function extractAgentToolCalls(text: string): {
  cleanText: string;
  calls: AgentToolCall[];
} {
  const calls: AgentToolCall[] = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  const cleanText = text
    .replace(regex, (_full, inner: string) => {
      try {
        const parsed = JSON.parse(inner.trim()) as {
          tool?: unknown;
          args?: unknown;
        };
        if (typeof parsed.tool === 'string' && parsed.tool.trim()) {
          calls.push({
            tool: parsed.tool.trim(),
            args:
              parsed.args && typeof parsed.args === 'object' && !Array.isArray(parsed.args)
                ? (parsed.args as Record<string, unknown>)
                : {},
          });
        }
      } catch {
        // ignore malformed tool call JSON
      }
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanText, calls };
}

export function stripStreamingToolTags(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<tool_call>[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type CompanionPoseTag = 'idle' | 'talking' | 'using_tool' | 'thinking';

const VALID_POSES = new Set<CompanionPoseTag>([
  'idle',
  'talking',
  'using_tool',
  'thinking',
]);

export function extractCompanionPose(text: string): {
  cleanText: string;
  pose: CompanionPoseTag | null;
} {
  let latestPose: CompanionPoseTag | null = null;
  const withoutComplete = text.replace(/<pose>\s*([^<]+?)\s*<\/pose>/gi, (_full, inner: string) => {
    const normalized = inner.trim().toLowerCase().replace(/\s+/g, '_') as CompanionPoseTag;
    if (VALID_POSES.has(normalized)) {
      latestPose = normalized;
    }
    return '';
  });

  const cleanText = withoutComplete
    .replace(/<pose>[\s\S]*$/i, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanText, pose: latestPose };
}

export function extractExecutableBlocks(markdown: string): ExecutableCodeBlock[] {
  const regex = /```(html|javascript|js|typescript|ts|css)?\s*\n([\s\S]*?)```/gi;
  const blocks: ExecutableCodeBlock[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    const language = (match[1] ?? 'javascript').toLowerCase();
    const code = match[2].trim();
    if (code.length > 0) {
      blocks.push({ language, code });
    }
  }
  return blocks;
}

export function buildSandboxHtml(code: string, language: string): string {
  const normalized = language.toLowerCase();
  if (normalized === 'html') {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; margin: 0; color: #0f172a; background: #ffffff; }
</style>
<script>
  (function() {
    const send = (level, args) => {
      try {
        parent.postMessage({ source: 'aetheris-sandbox', level, text: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') }, '*');
      } catch (e) {}
    };
    ['log', 'warn', 'error', 'info'].forEach(fn => {
      const orig = console[fn];
      console[fn] = function(...args) { send(fn, args); orig.apply(console, args); };
    });
    window.onerror = function(msg, src, line, col) {
      send('error', [msg + ' (line ' + line + ':' + col + ')']);
    };
  })();
</script>
</head>
<body>
${code}
</body>
</html>`;
  }

  const strippedCode =
    normalized === 'ts' || normalized === 'typescript'
      ? code
          .replace(/:\s*(string|number|boolean|any|void|unknown|never|Record<[^>]+>)/g, '')
          .replace(/interface\s+\w+\s*\{[\s\S]*?\}/g, '')
          .replace(/type\s+\w+\s*=[^;\n]+;?/g, '')
      : code;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 14px; margin: 0; color: #e2e8f0; background: #0f172a; font-size: 13px; }
  .line { padding: 4px 0; border-bottom: 1px solid rgba(148,163,184,0.12); white-space: pre-wrap; word-break: break-word; }
  .err { color: #f87171; }
  .warn { color: #fbbf24; }
  .ok { color: #34d399; }
</style>
</head>
<body>
<div id="out"></div>
<script>
  (function() {
    const out = document.getElementById('out');
    const append = (level, text) => {
      try {
        parent.postMessage({ source: 'aetheris-sandbox', level, text }, '*');
      } catch (e) {}
    };
    ['log', 'warn', 'error', 'info'].forEach(fn => {
      console[fn] = function(...args) {
        append(fn, args.map(a => {
          if (typeof a === 'object' && a !== null) {
            try { return JSON.stringify(a, null, 2); } catch { return String(a); }
          }
          return String(a);
        }).join(' '));
      };
    });
    try {
      const result = (function() {
        ${strippedCode}
      })();
      if (result !== undefined) {
        append('log', 'Return value: ' + (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)));
      }
      const badge = document.createElement('div');
      badge.className = 'line ok';
      badge.textContent = 'Isolated JS execution completed cleanly — output bridged to console below.';
      out.appendChild(badge);
    } catch (err) {
      const errDiv = document.createElement('div');
      errDiv.className = 'line err';
      errDiv.textContent = err && err.message ? err.message : String(err);
      out.appendChild(errDiv);
      append('error', err && err.message ? err.message : String(err));
    }
  })();
</script>
</body>
</html>`;
}
