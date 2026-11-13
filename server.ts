import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import vm from 'vm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  extractAgentToolCalls,
  isSafeWorkspacePath,
  stripStreamingToolTags,
  validateSafeShellCommand,
} from './src/utils/agentParser.ts';
import { buildLunaSystemPrompt } from './src/utils/systemPrompt.ts';
import {
  deleteUserConversation,
  deleteUserDocument,
  getOrCreateUser,
  listUserConversations,
  listUserDevices,
  listUserDocuments,
  updateUserPreferences,
  upsertConversation,
  upsertDevice,
  upsertDocument,
  upsertMessage,
} from './src/db/repository.ts';

const execFileAsync = promisify(execFile);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface IncomingMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  images?: Array<{ mimeType: string; data: string }>;
}

interface CustomProviderConfig {
  providerType: 'gemini' | 'openai_compatible' | 'anthropic' | 'ollama';
  endpointUrl?: string;
  customApiKey?: string;
  modelId?: string;
}

function isAllowedEndpointUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // Block cloud metadata IP SSRF
    if (parsed.hostname === '169.254.169.254' || parsed.hostname === 'metadata.google.internal') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function writeSse(res: express.Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function extractReadableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Request failed.');
  try {
    const outer = JSON.parse(raw) as { error?: { message?: string } | string };
    const inner = typeof outer?.error === 'string' ? outer.error : outer?.error?.message;
    if (inner) {
      try {
        const nested = JSON.parse(inner) as { error?: { message?: string } };
        if (nested?.error?.message) return nested.error.message;
      } catch {
        return inner;
      }
    }
  } catch {
    // not JSON
  }
  return raw;
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('timed out')
  );
}

async function* openGeminiStreamWithTimeout<T>(
  openStream: () => Promise<AsyncIterable<T>>,
  timeoutMs: number,
  modelLabel: string,
): AsyncGenerator<T> {
  const firstStep = await Promise.race([
    (async () => {
      const stream = await openStream();
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      return { iterator, first };
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${modelLabel} timed out before first token`)), timeoutMs),
    ),
  ]);
  if (firstStep.first.done) return;
  yield firstStep.first.value;
  while (true) {
    const next = await firstStep.iterator.next();
    if (next.done) break;
    yield next.value;
  }
}

const PRIMARY_GEMINI_MODEL = 'gemini-4-hydrogen';
const FAST_GEMINI_MODEL = 'gemini-3.1-flash-lite';

function isGemini4Model(modelName: string): boolean {
  return (
    modelName === 'gemini-4-hydrogen' ||
    modelName === 'gemini-4-argon' ||
    modelName === 'gemini-4-carbon'
  );
}

function resolveGeminiModel(requestedModel: string | undefined, highThinking: boolean, hasImages: boolean): string {
  if (hasImages || highThinking) {
    return PRIMARY_GEMINI_MODEL;
  }
  if (requestedModel === 'gemini-3.8-flash') {
    return PRIMARY_GEMINI_MODEL;
  }
  if (
    requestedModel === PRIMARY_GEMINI_MODEL ||
    requestedModel === FAST_GEMINI_MODEL
  ) {
    return requestedModel;
  }
  return PRIMARY_GEMINI_MODEL;
}

async function streamCustomProvider(
  res: express.Response,
  provider: CustomProviderConfig,
  fullSystemInstruction: string,
  messages: IncomingMessage[],
  genOptions?: { temperature?: number; maxOutputTokens?: number },
): Promise<boolean> {
  const endpoint = provider.endpointUrl?.trim() || '';
  if (!endpoint || !isAllowedEndpointUrl(endpoint)) {
    writeSse(res, {
      type: 'error',
      error: 'Please configure a valid HTTP/HTTPS endpoint URL in Settings -> Models & API endpoints.',
    });
    res.end();
    return false;
  }

  const requiresKey =
    provider.providerType !== 'ollama' &&
    !endpoint.includes('localhost') &&
    !endpoint.includes('127.0.0.1');
  if (requiresKey && !provider.customApiKey?.trim()) {
    writeSse(res, {
      type: 'error',
      error: `Missing API key for ${provider.modelId || 'this provider'}. Add your key in Settings -> Models & API endpoints.`,
    });
    res.end();
    return false;
  }

  const maxTokens =
    typeof genOptions?.maxOutputTokens === 'number'
      ? Math.max(128, Math.min(8192, Math.round(genOptions.maxOutputTokens)))
      : 4096;
  const temp =
    typeof genOptions?.temperature === 'number'
      ? Math.max(0, Math.min(1.5, genOptions.temperature))
      : undefined;

  if (provider.providerType === 'anthropic') {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.customApiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.modelId || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        ...(temp !== undefined ? { temperature: Math.min(1, temp) } : {}),
        stream: true,
        system: fullSystemInstruction,
        messages: messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errTxt = await upstream.text();
      writeSse(res, {
        type: 'error',
        error: `Anthropic endpoint error (${upstream.status}): ${errTxt}`,
      });
      res.end();
      return false;
    }

    writeSse(res, { type: 'meta', model: provider.modelId || 'claude', thinking: false });
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed?.delta?.text;
          if (typeof delta === 'string' && delta.length > 0) {
            writeSse(res, { type: 'token', text: delta });
          }
        } catch {
          // ignore partial SSE JSON
        }
      }
    }
    return true;
  }

  // OpenRouter, OpenAI-compatible, or Ollama endpoint
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.customApiKey) {
    headers.Authorization = `Bearer ${provider.customApiKey}`;
  }
  if (endpoint.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
    headers['X-Title'] = 'Luna';
  }

  const formattedMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      if (m.images && m.images.length > 0 && provider.providerType === 'openai_compatible') {
        return {
          role: m.role,
          content: [
            { type: 'text', text: m.content || 'Analyze the attached image.' },
            ...m.images.map((img) => ({
              type: 'image_url',
              image_url: {
                url: `data:${img.mimeType || 'image/jpeg'};base64,${img.data}`,
              },
            })),
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

  const modelName =
    provider.modelId ||
    (provider.providerType === 'ollama' ? 'llama3.2' : 'openai/gpt-4o-mini');

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName,
      stream: true,
      max_tokens: maxTokens,
      ...(temp !== undefined ? { temperature: temp } : {}),
      messages: [
        { role: 'system', content: fullSystemInstruction },
        ...formattedMessages,
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errTxt = await upstream.text();
    writeSse(res, {
      type: 'error',
      error: `Custom endpoint error (${upstream.status}): ${errTxt}`,
    });
    res.end();
    return false;
  }

  writeSse(res, { type: 'meta', model: modelName, thinking: false });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('data: ')) {
        const raw = trimmed.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            writeSse(res, { type: 'token', text: delta });
          }
        } catch {
          // ignore
        }
      } else {
        // Ollama NDJSON format
        try {
          const parsed = JSON.parse(trimmed);
          const content = parsed?.message?.content ?? parsed?.response;
          if (typeof content === 'string' && content.length > 0) {
            writeSse(res, { type: 'token', text: content });
          }
        } catch {
          // ignore
        }
      }
    }
  }
  return true;
}

function isPublicHttpUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      h === '::1' ||
      h.startsWith('10.') ||
      h.startsWith('192.168.') ||
      h.startsWith('169.254.') ||
      h === 'metadata.google.internal' ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function executeServerAgentTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; output: string }> {
  const cwd = process.cwd();

  if (tool === 'list_files') {
    const rel = String(args.path ?? '.').trim() || '.';
    if (rel !== '.' && !isSafeWorkspacePath(rel)) {
      return { ok: false, output: `Restricted directory path: ${rel}` };
    }
    const target = path.resolve(cwd, rel);
    if (!target.startsWith(cwd)) {
      return { ok: false, output: 'Path traversal blocked.' };
    }
    try {
      const entries = await fs.readdir(target, { withFileTypes: true });
      const lines = entries
        .filter(
          (e) =>
            !e.name.startsWith('.env') &&
            e.name !== 'node_modules' &&
            e.name !== '.git' &&
            e.name !== 'firebase-applet-config.json',
        )
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
        .map((e) => `${e.isDirectory() ? '[dir] ' : '      '}${e.name}`);
      return { ok: true, output: lines.join('\n') || '(empty directory)' };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : 'Unable to list directory.' };
    }
  }

  if (tool === 'read_file') {
    const rel = String(args.path ?? '').trim();
    if (!isSafeWorkspacePath(rel)) {
      return { ok: false, output: `Access denied or invalid path: ${rel}` };
    }
    const target = path.resolve(cwd, rel);
    if (!target.startsWith(cwd)) {
      return { ok: false, output: 'Path traversal blocked.' };
    }
    try {
      const text = await fs.readFile(target, 'utf-8');
      const truncated =
        text.length > 8000
          ? `${text.slice(0, 8000)}\n\n... (truncated, ${text.length} total chars)`
          : text;
      return { ok: true, output: truncated };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : 'File read failed.' };
    }
  }

  if (tool === 'run_shell') {
    const rawCmd = String(args.command ?? '').trim();
    const check = validateSafeShellCommand(rawCmd);
    if (!check.ok) {
      return { ok: false, output: check.error };
    }
    try {
      const { stdout, stderr } = await execFileAsync(check.command, check.args, {
        cwd,
        timeout: 5000,
        maxBuffer: 256 * 1024,
      });
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
      const output =
        combined.length > 4500
          ? `${combined.slice(0, 4500)}\n... (truncated)`
          : combined || '(command completed with no output)';
      return { ok: true, output };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const msg = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').slice(0, 2000);
      return { ok: false, output: msg || 'Command failed.' };
    }
  }

  if (tool === 'run_js') {
    const code = String(args.code ?? '');
    if (!code.trim()) {
      return { ok: false, output: 'No JavaScript code provided.' };
    }
    const logs: string[] = [];
    const formatArgs = (vals: unknown[]) =>
      vals
        .map((v) => {
          if (typeof v === 'object' && v !== null) {
            try {
              return JSON.stringify(v);
            } catch {
              return String(v);
            }
          }
          return String(v);
        })
        .join(' ');
    const sandbox = {
      console: {
        log: (...a: unknown[]) => logs.push(formatArgs(a)),
        info: (...a: unknown[]) => logs.push(formatArgs(a)),
        warn: (...a: unknown[]) => logs.push(`[warn] ${formatArgs(a)}`),
        error: (...a: unknown[]) => logs.push(`[error] ${formatArgs(a)}`),
      },
      Math,
      JSON,
      Date,
      Array,
      Object,
      Number,
      String,
      Boolean,
      RegExp,
      Map,
      Set,
    };
    try {
      const wrapped = `(function(){\n${code}\n})()`;
      const result = vm.runInNewContext(wrapped, sandbox, { timeout: 1000 });
      if (result !== undefined) {
        logs.push(
          `Return value: ${
            typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
          }`,
        );
      }
      return { ok: true, output: logs.join('\n') || '(executed cleanly, no output)' };
    } catch (err) {
      return {
        ok: false,
        output: err instanceof Error ? err.message : 'JS execution error.',
      };
    }
  }

  if (tool === 'fetch_url') {
    const url = String(args.url ?? '').trim();
    if (!isPublicHttpUrl(url)) {
      return { ok: false, output: `Blocked or invalid public URL: ${url}` };
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Luna-Agent/1.0' },
      });
      clearTimeout(timer);
      const ct = response.headers.get('content-type') || '';
      const raw = await response.text();
      if (!response.ok) {
        return { ok: false, output: `HTTP ${response.status}: ${raw.slice(0, 1000)}` };
      }
      if (ct.includes('application/json')) {
        try {
          const pretty = JSON.stringify(JSON.parse(raw), null, 2);
          return { ok: true, output: pretty.slice(0, 6000) };
        } catch {
          return { ok: true, output: raw.slice(0, 6000) };
        }
      }
      const textOnly = raw
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { ok: true, output: textOnly.slice(0, 6000) || '(empty body)' };
    } catch (err) {
      return { ok: false, output: err instanceof Error ? err.message : 'URL fetch failed.' };
    }
  }

  return { ok: false, output: `Unknown tool: ${tool}` };
}

async function streamSingleAgentTurn(opts: {
  provider: CustomProviderConfig;
  systemInstruction: string;
  messages: IncomingMessage[];
  highThinking: boolean;
  webSearch: boolean;
  onRawUpdate: (rawText: string) => void;
  onError: (msg: string) => void;
}): Promise<{
  fullText: string;
  sources: Array<{ title: string; uri: string }>;
  failed: boolean;
}> {
  const { provider, systemInstruction, messages, highThinking, webSearch, onRawUpdate, onError } = opts;
  let fullText = '';
  const sources: Array<{ title: string; uri: string }> = [];
  const seenUris = new Set<string>();

  if (provider.providerType && provider.providerType !== 'gemini') {
    const endpoint = provider.endpointUrl?.trim() || '';
    if (!endpoint || !isAllowedEndpointUrl(endpoint)) {
      onError('Please configure a valid HTTP/HTTPS endpoint URL in Settings -> Models & API endpoints.');
      return { fullText: '', sources, failed: true };
    }
    const requiresKey =
      provider.providerType !== 'ollama' &&
      !endpoint.includes('localhost') &&
      !endpoint.includes('127.0.0.1');
    if (requiresKey && !provider.customApiKey?.trim()) {
      onError(`Missing API key for ${provider.modelId || 'this provider'}. Add your key in Settings -> Models & API endpoints.`);
      return { fullText: '', sources, failed: true };
    }

    if (provider.providerType === 'anthropic') {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider.customApiKey || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.modelId || 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          stream: true,
          system: systemInstruction,
          messages: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
      });
      if (!upstream.ok || !upstream.body) {
        const errTxt = await upstream.text();
        onError(`Anthropic endpoint error (${upstream.status}): ${errTxt}`);
        return { fullText: '', sources, failed: true };
      }
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            const delta = parsed?.delta?.text;
            if (typeof delta === 'string' && delta.length > 0) {
              fullText += delta;
              onRawUpdate(fullText);
            }
          } catch {
            // ignore
          }
        }
      }
      return { fullText, sources, failed: false };
    }

    // OpenRouter / OpenAI-compatible / Ollama
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider.customApiKey) {
      headers.Authorization = `Bearer ${provider.customApiKey}`;
    }
    if (endpoint.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
      headers['X-Title'] = 'Luna';
    }
    const modelName =
      provider.modelId || (provider.providerType === 'ollama' ? 'llama3.2' : 'openai/gpt-4o-mini');

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        stream: true,
        messages: [
          { role: 'system', content: systemInstruction },
          ...messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errTxt = await upstream.text();
      onError(`Custom endpoint error (${upstream.status}): ${errTxt}`);
      return { fullText: '', sources, failed: true };
    }
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('data: ')) {
          const raw = trimmed.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              fullText += delta;
              onRawUpdate(fullText);
            }
          } catch {
            // ignore
          }
        } else {
          try {
            const parsed = JSON.parse(trimmed);
            const delta = parsed?.message?.content ?? parsed?.response;
            if (typeof delta === 'string' && delta.length > 0) {
              fullText += delta;
              onRawUpdate(fullText);
            }
          } catch {
            // ignore
          }
        }
      }
    }
    return { fullText, sources, failed: false };
  }

  // Gemini free-tier compatible with automatic fallback on 503/429
  const cleanedMessages = messages.filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim(),
  );
  const contents = cleanedMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const primaryModel = resolveGeminiModel(provider.modelId, highThinking, false);
  const runGeminiModel = async (modelToUse: string, allowThinking: boolean) => {
    const config: Record<string, unknown> = {
      systemInstruction,
    };
    if (allowThinking && modelToUse === PRIMARY_GEMINI_MODEL) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    }
    if (webSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const stream =
      modelToUse === PRIMARY_GEMINI_MODEL
        ? openGeminiStreamWithTimeout(
            () =>
              ai.models.generateContentStream({
                model: modelToUse,
                contents,
                config,
              }),
            7000,
            modelToUse,
          )
        : await ai.models.generateContentStream({
            model: modelToUse,
            contents,
            config,
          });

    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        onRawUpdate(fullText);
      }
      const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(groundingChunks)) {
        for (const g of groundingChunks) {
          const uri = g?.web?.uri;
          const title = g?.web?.title || uri;
          if (uri && !seenUris.has(uri)) {
            seenUris.add(uri);
            sources.push({ title: String(title), uri: String(uri) });
          }
        }
      }
    }
  };

  try {
    await runGeminiModel(primaryModel, highThinking);
  } catch (err) {
    if (!fullText && primaryModel !== FAST_GEMINI_MODEL && isTransientGeminiError(err)) {
      try {
        await runGeminiModel(FAST_GEMINI_MODEL, false);
      } catch (fallbackErr) {
        onError(extractReadableError(fallbackErr));
        return { fullText: '', sources, failed: true };
      }
    } else {
      onError(extractReadableError(err));
      return { fullText: '', sources, failed: true };
    }
  }

  return { fullText, sources, failed: false };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Real-time SSE chat streaming endpoint (Gemini + Custom/OpenAI/Claude/Local endpoints)
  app.post('/api/chat/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const {
      messages = [],
      systemInstruction = '',
      contextChunks = [],
      highThinking = false,
      webSearch = false,
      provider = { providerType: 'gemini', modelId: PRIMARY_GEMINI_MODEL },
    } = req.body as {
      messages?: IncomingMessage[];
      systemInstruction?: string;
      contextChunks?: Array<{ title: string; docType: string; text: string }>;
      highThinking?: boolean;
      webSearch?: boolean;
      provider?: CustomProviderConfig;
      temperature?: number;
      maxOutputTokens?: number;
    };
    const temperature =
      typeof (req.body as { temperature?: number }).temperature === 'number'
        ? Math.max(0, Math.min(1.5, (req.body as { temperature: number }).temperature))
        : undefined;
    const maxOutputTokens =
      typeof (req.body as { maxOutputTokens?: number }).maxOutputTokens === 'number'
        ? Math.max(128, Math.min(8192, Math.round((req.body as { maxOutputTokens: number }).maxOutputTokens)))
        : undefined;

    try {
      const contextText =
        contextChunks.length > 0
          ? `\n\nRelevant Workspace Context (Documents & Codebase):\n${contextChunks
              .map((c, idx) => `[${idx + 1}] ${c.title} (${c.docType}):\n${c.text}`)
              .join('\n\n')}`
          : '';

      const fullSystemInstruction = [
        systemInstruction ||
          buildLunaSystemPrompt({
            mode: 'chat',
            highThinking: Boolean(highThinking),
            webSearch: Boolean(webSearch),
          }),
        contextText,
      ]
        .filter(Boolean)
        .join('\n');

      // Custom external / local endpoints (OpenRouter / OpenAI / Claude / Ollama)
      if (provider.providerType && provider.providerType !== 'gemini') {
        const ok = await streamCustomProvider(
          res,
          provider,
          fullSystemInstruction,
          messages,
          { temperature, maxOutputTokens },
        );
        if (ok) {
          writeSse(res, {
            type: 'done',
            model: provider.modelId || provider.providerType,
          });
          res.end();
        }
        return;
      }

      // Gemini (@google/genai) server-side streaming
      if (!process.env.GEMINI_API_KEY) {
        writeSse(res, {
          type: 'error',
          error: 'Gemini API key is not configured in Settings > Secrets.',
        });
        res.end();
        return;
      }

      const hasImages = messages.some((m) => m.images && m.images.length > 0);
      let selectedModel = resolveGeminiModel(provider.modelId, Boolean(highThinking), hasImages);

      const contents = messages
        .filter(
          (m) =>
            (m.role === 'user' || m.role === 'assistant') &&
            (Boolean(m.content?.trim()) || Boolean(m.images && m.images.length > 0)),
        )
        .map((m) => {
          const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
          if (m.images && m.images.length > 0) {
            for (const img of m.images) {
              parts.push({
                inlineData: {
                  mimeType: img.mimeType || 'image/jpeg',
                  data: img.data,
                },
              });
            }
          }
          parts.push({ text: m.content || 'Analyze the provided input.' });
          return {
            role: m.role === 'assistant' ? 'model' : 'user',
            parts,
          };
        });

      const buildConfig = (modelName: string, allowThinking: boolean): Record<string, unknown> => {
        const config: Record<string, unknown> = {
          systemInstruction: fullSystemInstruction,
        };
        // Gemini 4 models reject temperature/topP/topK and mix thinking tokens into maxOutputTokens
        if (!isGemini4Model(modelName)) {
          if (temperature !== undefined) {
            config.temperature = temperature;
          }
          if (maxOutputTokens !== undefined) {
            config.maxOutputTokens = maxOutputTokens;
          }
        }
        if (allowThinking && modelName === PRIMARY_GEMINI_MODEL) {
          config.thinkingConfig = {
            thinkingLevel: ThinkingLevel.HIGH,
          };
        }
        if (webSearch) {
          config.tools = [{ googleSearch: {} }];
        }
        return config;
      };

      const sources: Array<{ title: string; uri: string }> = [];
      const seenUris = new Set<string>();
      let emittedText = false;

      const runChatModel = async (modelName: string, allowThinking: boolean) => {
        writeSse(res, {
          type: 'meta',
          model: modelName,
          thinking: allowThinking && modelName === PRIMARY_GEMINI_MODEL,
        });
        const stream =
          modelName === PRIMARY_GEMINI_MODEL
            ? openGeminiStreamWithTimeout(
                () =>
                  ai.models.generateContentStream({
                    model: modelName,
                    contents,
                    config: buildConfig(modelName, allowThinking),
                  }),
                7000,
                modelName,
              )
            : await ai.models.generateContentStream({
                model: modelName,
                contents,
                config: buildConfig(modelName, allowThinking),
              });
        for await (const chunk of stream) {
          if (chunk.text) {
            emittedText = true;
            writeSse(res, { type: 'token', text: chunk.text });
          }
          const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(groundingChunks)) {
            for (const g of groundingChunks) {
              const uri = g?.web?.uri;
              const title = g?.web?.title || uri;
              if (uri && !seenUris.has(uri)) {
                seenUris.add(uri);
                sources.push({ title: String(title), uri: String(uri) });
              }
            }
          }
        }
      };

      try {
        await runChatModel(selectedModel, Boolean(highThinking));
      } catch (primaryErr) {
        if (
          !emittedText &&
          selectedModel !== FAST_GEMINI_MODEL &&
          isTransientGeminiError(primaryErr)
        ) {
          selectedModel = FAST_GEMINI_MODEL;
          await runChatModel(selectedModel, false);
        } else {
          throw primaryErr;
        }
      }

      if (sources.length > 0) {
        writeSse(res, { type: 'grounding', sources });
      }
      writeSse(res, { type: 'done', model: selectedModel });
      res.end();
    } catch (error: unknown) {
      const message = extractReadableError(error);
      console.error('Chat stream error:', error);
      writeSse(res, { type: 'error', error: message });
      res.end();
    }
  });

  // Concise chat title & summary endpoint (distills AI/chat content, never echoes raw user prompt)
  app.post('/api/chat/summarize', async (req, res) => {
    try {
      const { messages = [] } = req.body as { messages?: IncomingMessage[] };
      const assistantSnippet = messages
        .filter((m) => m.role === 'assistant' && m.content?.trim())
        .slice(-2)
        .map((m) => m.content.trim().slice(0, 500))
        .join('\n');
      const userSnippet = messages
        .filter((m) => m.role === 'user' && m.content?.trim())
        .slice(0, 2)
        .map((m) => m.content.trim().slice(0, 200))
        .join('\n');

      if (!assistantSnippet && !userSnippet) {
        res.status(400).json({ error: 'No conversation text to summarize.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.json({ title: null, summary: null });
        return;
      }

      const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: [
                  'Return ONLY valid JSON with keys "title" and "summary".',
                  '"title": 2 to 5 plain topic words describing the assistant answer/subject (NEVER copy user gibberish or raw prompt).',
                  '"summary": 1 crisp sentence under 55 characters summarizing the AI answer/conversation outcome.',
                  '',
                  `Context topic: ${userSnippet}`,
                  `AI Response: ${assistantSnippet}`,
                ].join('\n'),
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 80,
          temperature: 0.2,
        },
      });

      const raw = (result.text ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      const parsed = JSON.parse(raw) as { title?: string; summary?: string };
      res.json({
        title: typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 52) : null,
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 80) : null,
      });
    } catch {
      res.json({ title: null, summary: null });
    }
  });

  // Voice-to-text transcription fallback when browser SpeechRecognition is unavailable
  app.post('/api/voice/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Missing recorded audio payload.' });
        return;
      }
      if (!process.env.GEMINI_API_KEY) {
        res.status(400).json({
          error: 'Voice transcription requires a server API key or browser speech recognition.',
        });
        return;
      }
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          {
            text: 'Transcribe the spoken audio accurately. Output only the transcribed words with punctuation, and nothing else.',
          },
        ],
      });
      res.json({ text: (response.text ?? '').trim() });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Transcription failed.',
      });
    }
  });

  // Direct safe workspace command & script execution endpoint for Agent / Terminal
  app.post('/api/agent/exec', async (req, res) => {
    try {
      const { tool, args = {} } = req.body as {
        tool?: string;
        args?: Record<string, unknown>;
      };
      if (!tool) {
        res.status(400).json({ ok: false, output: 'Missing tool name.' });
        return;
      }
      const result = await executeServerAgentTool(tool, args);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({
        ok: false,
        output: error instanceof Error ? error.message : 'Execution error.',
      });
    }
  });

  // Conversational Autonomous Agent endpoint (multi-turn chat + real command/tool execution)
  app.post('/api/agent/run', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const {
      messages = [],
      goal = '',
      contextChunks = [],
      webSearch = true,
      highThinking = true,
      activeTheme = 'obsidian',
      customInstructions = '',
      provider = { providerType: 'gemini', modelId: PRIMARY_GEMINI_MODEL },
    } = req.body as {
      messages?: IncomingMessage[];
      goal?: string;
      contextChunks?: Array<{ title: string; docType: string; text: string }>;
      webSearch?: boolean;
      highThinking?: boolean;
      activeTheme?: string;
      customInstructions?: string;
      provider?: CustomProviderConfig;
    };

    try {
      const baseHistory: IncomingMessage[] =
        messages.length > 0
          ? messages.filter(
              (m) => (m.role === 'user' || m.role === 'assistant') && Boolean(m.content?.trim()),
            )
          : goal.trim()
            ? [{ role: 'user', content: goal.trim() }]
            : [];

      if (baseHistory.length === 0) {
        writeSse(res, { type: 'error', error: 'No prompt or message provided.' });
        res.end();
        return;
      }

      if (
        (!provider.providerType || provider.providerType === 'gemini') &&
        !process.env.GEMINI_API_KEY
      ) {
        writeSse(res, {
          type: 'error',
          error:
            'Gemini API key is not configured in Settings > Secrets. Select OpenRouter, OpenAI, Claude, or a local endpoint in Settings -> Models & API endpoints, or use /sh, /js, /ls, /cat, /fetch directly.',
        });
        res.end();
        return;
      }

      const contextSection =
        contextChunks.length > 0
          ? contextChunks
              .map((c, i) => `### Context ${i + 1}: ${c.title} (${c.docType})\n${c.text}`)
              .join('\n\n')
          : 'No local workspace documents attached.';

      const agentSystem = buildLunaSystemPrompt({
        mode: 'agent',
        highThinking: Boolean(highThinking),
        webSearch: Boolean(webSearch),
        activeTheme,
        contextSection,
        customInstructions,
      });

      const modelLabel =
        provider.providerType && provider.providerType !== 'gemini'
          ? provider.modelId || provider.providerType
          : resolveGeminiModel(provider.modelId, Boolean(highThinking), false);

      writeSse(res, { type: 'meta', model: modelLabel, thinking: Boolean(highThinking) });

      let workingHistory = [...baseHistory];
      let prosePrefix = '';
      const allSources: Array<{ title: string; uri: string }> = [];
      const seenUris = new Set<string>();
      const MAX_STEPS = 4;

      for (let step = 0; step < MAX_STEPS; step++) {
        const turnResult = await streamSingleAgentTurn({
          provider,
          systemInstruction: agentSystem,
          messages: workingHistory,
          highThinking: Boolean(highThinking),
          webSearch: Boolean(webSearch),
          onRawUpdate: (rawStep) => {
            const visible = stripStreamingToolTags(rawStep);
            const combined = [prosePrefix, visible].filter(Boolean).join('\n\n');
            writeSse(res, { type: 'draft', text: combined });
          },
          onError: (errMsg) => {
            writeSse(res, { type: 'error', error: errMsg });
          },
        });

        if (turnResult.failed) {
          res.end();
          return;
        }

        for (const src of turnResult.sources) {
          if (!seenUris.has(src.uri)) {
            seenUris.add(src.uri);
            allSources.push(src);
          }
        }

        const { cleanText, calls } = extractAgentToolCalls(turnResult.fullText);
        if (cleanText) {
          prosePrefix = [prosePrefix, cleanText].filter(Boolean).join('\n\n');
          writeSse(res, { type: 'draft', text: prosePrefix });
        }

        if (calls.length === 0) {
          break;
        }

        const observations: string[] = [];
        for (const call of calls.slice(0, 4)) {
          const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          writeSse(res, {
            type: 'tool_start',
            id: toolId,
            tool: call.tool,
            args: call.args,
          });

          if (
            call.tool === 'run_sandbox' ||
            call.tool === 'save_doc' ||
            call.tool === 'set_theme' ||
            call.tool === 'set_companion_state'
          ) {
            writeSse(res, {
              type: 'action',
              action: call.tool,
              payload: call.args,
            });
            const summary = `Executed workspace action "${call.tool}" in browser.`;
            writeSse(res, {
              type: 'tool_result',
              id: toolId,
              tool: call.tool,
              status: 'done',
              output: summary,
            });
            observations.push(`[Tool ${call.tool} result]: ${summary}`);
          } else {
            const execRes = await executeServerAgentTool(call.tool, call.args);
            writeSse(res, {
              type: 'tool_result',
              id: toolId,
              tool: call.tool,
              status: execRes.ok ? 'done' : 'error',
              output: execRes.output,
            });
            observations.push(`[Tool ${call.tool} ${execRes.ok ? 'ok' : 'error'}]:\n${execRes.output}`);
          }
        }

        workingHistory = [
          ...workingHistory,
          { role: 'assistant', content: turnResult.fullText },
          {
            role: 'user',
            content: `Tool execution observations:\n${observations.join('\n\n')}\n\nContinue answering the user's request clearly based on these results. Do not repeat raw <tool_call> tags unless another tool call is needed.`,
          },
        ];
      }

      if (!prosePrefix.trim()) {
        writeSse(res, {
          type: 'error',
          error: 'The model returned an empty response. Please try again or switch models in Settings.',
        });
        res.end();
        return;
      }

      if (allSources.length > 0) {
        writeSse(res, { type: 'grounding', sources: allSources });
      }
      writeSse(res, { type: 'done', model: modelLabel });
      res.end();
    } catch (error: unknown) {
      const message = extractReadableError(error);
      console.error('Agent run error:', error);
      writeSse(res, { type: 'error', error: message });
      res.end();
    }
  });

  // Cloud SQL PostgreSQL sync endpoints (protected by Firebase ID token)
  app.post('/api/sync/session', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@user.local`;
      const user = await getOrCreateUser(
        uid,
        email,
        req.user!.name ?? null,
        req.user!.picture ?? null,
      );
      const [conversations, documents, devices] = await Promise.all([
        listUserConversations(uid),
        listUserDocuments(uid),
        listUserDevices(uid),
      ]);
      res.json({ user, conversations, documents, devices });
    } catch (error: unknown) {
      console.error('Sync session error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to synchronize session.',
      });
    }
  });

  app.put('/api/sync/preferences', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { activeTheme, e2eeSalt } = req.body as {
        activeTheme?: string;
        e2eeSalt?: string;
      };
      const updated = await updateUserPreferences(uid, activeTheme, e2eeSalt);
      res.json({ user: updated });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save preferences.',
      });
    }
  });

  app.post('/api/sync/conversations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { conversation, messages: msgList } = req.body as {
        conversation: {
          id: string;
          title: string;
          mode: string;
          providerId: string;
          modelId: string;
          encrypted: boolean;
          iv?: string | null;
          pinned?: boolean;
        };
        messages?: Array<{
          id: string;
          role: string;
          content: string;
          encrypted: boolean;
          iv?: string | null;
          metadata?: Record<string, unknown> | null;
        }>;
      };

      const savedConv = await upsertConversation(uid, conversation);
      if (Array.isArray(msgList)) {
        for (const msg of msgList) {
          await upsertMessage(uid, {
            ...msg,
            conversationId: conversation.id,
          });
        }
      }
      res.json({ conversation: savedConv });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync conversation.',
      });
    }
  });

  app.delete('/api/sync/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteUserConversation(req.user!.uid, String(req.params.id));
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete conversation.',
      });
    }
  });

  app.post('/api/sync/documents', requireAuth, async (req: AuthRequest, res) => {
    try {
      const docRow = await upsertDocument(req.user!.uid, req.body);
      res.json({ document: docRow });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync document.',
      });
    }
  });

  app.delete('/api/sync/documents/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteUserDocument(req.user!.uid, String(req.params.id));
      res.json({ ok: true });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete document.',
      });
    }
  });

  app.post('/api/sync/devices', requireAuth, async (req: AuthRequest, res) => {
    try {
      const device = await upsertDevice(req.user!.uid, req.body);
      res.json({ device });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync device.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Luna server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
