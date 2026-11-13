import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Brain,
  ChevronDown,
  ExternalLink,
  Folders,
  Globe,
  Maximize2,
  Minimize2,
  Play,
  Square,
  X,
} from 'lucide-react';
import type {
  AgentStepEvent,
  AgentToolEvent,
  ChatMessage,
  CompanionAnimState,
  Conversation,
  GroundingSource,
  ProjectFolder,
  ProviderConfig,
} from '../types/workspace';
import { mapToolToActivity } from '../utils/activity';
import {
  buildSandboxHtml,
  parseTerminalCommand,
} from '../utils/agentParser';
import { agentToolReadCache, contextSearchCache } from '../utils/cache';
import { playStreamCompletePing, playStreamStartPing } from '../utils/audioEffects';
import { speakAssistantMessage } from '../utils/tts';
import {
  retrieveRelevantChunks,
  type ContextDocument,
} from '../utils/contextSearch';
import { buildAdaptiveSuggestions } from '../utils/suggestions';
import {
  prepareEditResubmit,
  prepareRegenerate,
  toggleMessageFeedback,
  type MessageFeedback,
} from '../utils/messageActions';
import type { ThemeId } from '../utils/themes';
import { WORKSPACE_THEMES } from '../utils/themes';
import { ActivityTrace, StreamingAnswerIndicator } from './ActivityTrace';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageActionBar } from './MessageActionBar';

interface AgentWorkspaceProps {
  activeProvider: ProviderConfig;
  activeTheme: ThemeId;
  activeProject?: ProjectFolder | null;
  customInstructions?: string;
  messages: ChatMessage[];
  allConversations?: Conversation[];
  enterToSend?: boolean;
  showSuggestions?: boolean;
  soundEffects?: boolean;
  autoReadAloud?: boolean;
  onChangeMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  documents: ContextDocument[];
  onAddDocument: (doc: ContextDocument) => void;
  onDeleteDocument?: (id: string) => void;
  sandboxCode: string;
  sandboxLang: 'javascript' | 'html';
  onChangeSandbox: (code: string, lang: 'javascript' | 'html') => void;
  onSelectTheme: (id: ThemeId) => void;
  onSetCompanionState: (state: CompanionAnimState) => void;
}

interface SandboxLog {
  id: string;
  level: string;
  text: string;
}

export function AgentWorkspace({
  activeProvider,
  activeTheme,
  activeProject,
  customInstructions,
  messages,
  allConversations = [],
  enterToSend = true,
  showSuggestions = true,
  soundEffects = true,
  autoReadAloud = false,
  onChangeMessages,
  documents,
  onAddDocument,
  sandboxCode,
  sandboxLang,
  onChangeSandbox,
  onSelectTheme,
  onSetCompanionState,
}: AgentWorkspaceProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [canExpandComposer, setCanExpandComposer] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [highThinking, setHighThinking] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const userScrolledUpRef = useRef<boolean>(false);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distance > 80;
    setShowScrollBottom(isUp);
    userScrolledUpRef.current = isUp;
  };

  const scrollToBottom = (smooth = true) => {
    userScrolledUpRef.current = false;
    setShowScrollBottom(false);
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: isRunning ? 'smooth' : 'auto',
    });
  }, [messages, isRunning]);

  const { suggestions: adaptiveSuggestions } = useMemo(
    () => buildAdaptiveSuggestions(allConversations, messages),
    [allConversations, messages],
  );

  // Auto-expand composer textarea up to 50% of viewport height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const resize = () => {
      el.style.height = 'auto';
      const maxH = Math.max(160, Math.round(window.innerHeight * 0.5));
      const nextH = Math.min(el.scrollHeight, maxH);
      el.style.height = `${nextH}px`;
      el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
      setCanExpandComposer(el.scrollHeight >= 72 || chatInput.length >= 120);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [chatInput]);

  useEffect(() => {
    if (!composerExpanded) return;
    expandedTextareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setComposerExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [composerExpanded]);

  const [sandboxSrcDoc, setSandboxSrcDoc] = useState<string>(() =>
    buildSandboxHtml(sandboxCode, sandboxLang),
  );
  const [sandboxRunKey, setSandboxRunKey] = useState(1);
  const [sandboxLogs, setSandboxLogs] = useState<SandboxLog[]>([]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data && ev.data.source === 'aetheris-sandbox') {
        setSandboxLogs((prev) => [
          ...prev.slice(-49),
          {
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            level: String(ev.data.level || 'log'),
            text: String(ev.data.text || ''),
          },
        ]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const executeSandbox = (codeToRun = sandboxCode, langToRun = sandboxLang) => {
    setSandboxLogs([]);
    setSandboxSrcDoc(buildSandboxHtml(codeToRun, langToRun));
    setSandboxRunKey((k) => k + 1);
  };

  const callServerExec = async (
    tool: string,
    args: Record<string, unknown>,
  ): Promise<{ ok: boolean; output: string }> => {
    const cacheable = tool === 'list_files' || tool === 'read_file';
    const cacheKey = cacheable ? `${tool}:${JSON.stringify(args)}` : '';
    if (cacheable) {
      const cached = agentToolReadCache.get(cacheKey);
      if (cached) return cached;
    }
    const resp = await fetch('/api/agent/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    });
    const data = (await resp.json()) as { ok?: boolean; output?: string };
    const result = {
      ok: Boolean(data.ok),
      output: String(data.output ?? '(no output)'),
    };
    if (cacheable && result.ok) {
      agentToolReadCache.set(cacheKey, result);
    }
    return result;
  };

  const applyClientAction = (action: string, payload: Record<string, unknown>) => {
    if (action === 'run_sandbox') {
      const code = String(payload.code ?? '');
      const lang = payload.language === 'html' ? 'html' : 'javascript';
      if (code.trim()) {
        onChangeSandbox(code, lang);
        setPreviewOpen(true);
        executeSandbox(code, lang);
      }
    } else if (action === 'save_doc') {
      const title = String(payload.title ?? 'agent-note.md').trim();
      const content = String(payload.content ?? '');
      const docType = payload.docType === 'codebase' ? 'codebase' : 'document';
      if (content.trim()) {
        onAddDocument({
          id: `doc_${Date.now()}`,
          title,
          docType,
          content,
          updatedAt: Date.now(),
        });
      }
    } else if (action === 'set_theme') {
      const rawTheme = String(payload.themeId ?? '').toLowerCase();
      const map: Record<string, ThemeId> = {
        obsidian: 'obsidian',
        midnight: 'midnight',
        'aether-indigo': 'midnight',
        daylight: 'daylight',
        'emerald-ink': 'emerald-ink',
        'forest-terminal': 'emerald-ink',
        'paper-warm': 'paper-warm',
        'studio-daylight': 'paper-warm',
      };
      const nextId = map[rawTheme] ?? (rawTheme in WORKSPACE_THEMES ? (rawTheme as ThemeId) : null);
      if (nextId) onSelectTheme(nextId);
    } else if (action === 'set_companion_state') {
      const raw = String(payload.state ?? 'idle');
      if (
        raw === 'idle' ||
        raw === 'talking' ||
        raw === 'using_tool' ||
        raw === 'thinking'
      ) {
        onSetCompanionState(raw);
      }
    }
  };

  const runDirectSlashCommand = async (rawCmd: string): Promise<boolean> => {
    const trimmed = rawCmd.trim();
    if (!trimmed.startsWith('/')) return false;

    const normalized = trimmed.slice(1).trim();
    const parsed = parseTerminalCommand(normalized);
    const cmd = parsed.command;
    const rest = normalized.slice(cmd.length).trim();

    if (cmd === 'clear') {
      onChangeMessages(() => []);
      return true;
    }

    const userMsg: ChatMessage = {
      id: `ag_${Date.now()}_u`,
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };

    if (cmd === 'help') {
      const helpText = [
        '**Direct Agent Commands**',
        '- `/ls [dir]` — List workspace files',
        '- `/cat <path>` — Read a workspace file or indexed context document',
        '- `/sh <cmd>` — Run safe shell inspection (`ls`, `pwd`, `node`, `wc`, `grep`, `find`, `git status`)',
        '- `/js <code>` — Execute JavaScript on server Node VM',
        '- `/fetch <url>` — Fetch a public HTTP/HTTPS page or JSON API',
        '- `/run` — Execute the current Sandbox editor code',
        '- `/clear` — Clear conversation',
      ].join('\n');
      onChangeMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `ag_${Date.now()}_a`,
          role: 'assistant',
          content: helpText,
          createdAt: Date.now(),
        },
      ]);
      return true;
    }

    if (cmd === 'run') {
      setPreviewOpen(true);
      executeSandbox();
      onChangeMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `ag_${Date.now()}_a`,
          role: 'assistant',
          content: `Executed current **${sandboxLang}** code in the Isolated Sandbox.`,
          createdAt: Date.now(),
        },
      ]);
      return true;
    }

    let toolName = '';
    let args: Record<string, unknown> = {};
    if (cmd === 'ls') {
      toolName = 'list_files';
      args = { path: rest || '.' };
    } else if (cmd === 'cat') {
      toolName = 'read_file';
      args = { path: rest };
    } else if (cmd === 'sh') {
      toolName = 'run_shell';
      args = { command: rest };
    } else if (cmd === 'js') {
      toolName = 'run_js';
      args = { code: rest };
    } else if (cmd === 'fetch') {
      toolName = 'fetch_url';
      args = { url: rest };
    } else {
      return false;
    }

    const toolId = `tool_${Date.now()}`;
    const assistantId = `ag_${Date.now()}_a`;
    const initialTool: AgentToolEvent = {
      id: toolId,
      tool: toolName,
      args,
      status: 'running',
    };
    const runningMeta = mapToolToActivity(toolName, 'running', args);
    const initialStep: AgentStepEvent = {
      id: toolId,
      ...runningMeta,
      timestamp: Date.now(),
      status: 'running',
    };

    onChangeMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        toolEvents: [initialTool],
        activitySteps: [initialStep],
      },
    ]);

    try {
      const result = await callServerExec(toolName, args);
      const nextStatus = result.ok ? 'done' : 'error';
      const doneMeta = mapToolToActivity(toolName, nextStatus, args, result.output);
      onChangeMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: result.ok
                  ? `\`\`\`text\n${result.output}\n\`\`\``
                  : `**Command error:** ${result.output}`,
                toolEvents: [
                  {
                    ...initialTool,
                    status: nextStatus,
                    output: result.output,
                  },
                ],
                activitySteps: [
                  {
                    id: toolId,
                    ...doneMeta,
                    timestamp: initialStep.timestamp,
                    status: nextStatus,
                  },
                ],
              }
            : m,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution failed.';
      const errMeta = mapToolToActivity(toolName, 'error', args, msg);
      onChangeMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `**Execution failed:** ${msg}`,
                toolEvents: [{ ...initialTool, status: 'error', output: msg }],
                activitySteps: [
                  {
                    id: toolId,
                    ...errMeta,
                    timestamp: initialStep.timestamp,
                    status: 'error',
                  },
                ],
              }
            : m,
        ),
      );
    }
    return true;
  };

  const runAgentFromHistory = async (historyForApi: ChatMessage[]) => {
    const lastUser = historyForApi[historyForApi.length - 1];
    if (!lastUser) return;
    const trimmed = lastUser.content.trim();
    const assistantId = `ag_${Date.now()}_a`;
    const docSig = documents.map((d) => `${d.id}:${d.updatedAt}`).join(',');
    const searchCacheKey = `agent:${trimmed}:${docSig}`;
    let chunks = contextSearchCache.get(searchCacheKey) as
      | ReturnType<typeof retrieveRelevantChunks>
      | undefined;
    if (!chunks) {
      chunks = retrieveRelevantChunks(trimmed, documents, 4);
      contextSearchCache.set(searchCacheKey, chunks);
    }

    const initialSteps: AgentStepEvent[] = [];
    if (chunks.length > 0) {
      initialSteps.push({
        id: 'step_mem_read',
        kind: 'memory',
        label: 'Checking workspace memory',
        detail: `${chunks.length} matched doc${chunks.length > 1 ? 's' : ''}`,
        timestamp: Date.now(),
        status: 'done',
      });
    }
    if (webSearch) {
      initialSteps.push({
        id: 'step_search',
        kind: 'search',
        label: 'Searching the web',
        timestamp: Date.now(),
        status: 'running',
      });
    }
    if (highThinking) {
      initialSteps.push({
        id: 'step_think',
        kind: 'thinking',
        label: 'Thinking deeply',
        timestamp: Date.now(),
        status: 'running',
      });
    }

    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      modelUsed:
        activeProvider.providerType === 'gemini' && highThinking
          ? 'gemini-4-hydrogen'
          : activeProvider.modelId,
      thinkingUsed: highThinking,
      toolEvents: [],
      activitySteps: initialSteps,
    };

    onChangeMessages(() => [...historyForApi, assistantPlaceholder]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);

    const abort = new AbortController();
    abortRef.current = abort;
    setIsRunning(true);
    let hasError = false;
    let aborted = false;
    let hasPlayedStartPing = false;
    let fullAgentText = '';

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          messages: historyForApi.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          contextChunks: chunks.map((c) => ({
            title: c.title,
            docType: c.docType,
            text: c.text,
          })),
          webSearch,
          highThinking,
          activeTheme,
          customInstructions: customInstructions?.trim() || undefined,
          provider: activeProvider,
        }),
      });

      if (!response.ok || !response.body) {
        const errBody = await response.text().catch(() => '');
        throw new Error(errBody || `Agent endpoint returned HTTP ${response.status}.`);
      }

      const reader = response.body.getReader();
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
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw) as {
              type: string;
              model?: string;
              thinking?: boolean;
              text?: string;
              id?: string;
              tool?: string;
              args?: Record<string, unknown>;
              status?: 'running' | 'done' | 'error';
              output?: string;
              action?: string;
              payload?: Record<string, unknown>;
              sources?: GroundingSource[];
              error?: string;
            };

            if (!hasPlayedStartPing && (ev.type === 'draft' || ev.type === 'tool_start' || ev.type === 'meta')) {
              playStreamStartPing(soundEffects);
              hasPlayedStartPing = true;
            }

            if (ev.type === 'meta') {
              onChangeMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        modelUsed: ev.model ?? m.modelUsed,
                        thinkingUsed: Boolean(ev.thinking),
                      }
                    : m,
                ),
              );
            } else if (ev.type === 'draft') {
              if (ev.text) fullAgentText = ev.text;
              onChangeMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: ev.text ?? '',
                        activitySteps: (m.activitySteps ?? []).map((s) =>
                          s.id === 'step_think' && s.status === 'running'
                            ? { ...s, status: 'done', label: 'Thought through request' }
                            : s,
                        ),
                      }
                    : m,
                ),
              );
            } else if (ev.type === 'tool_start' && ev.id && ev.tool) {
              const evt: AgentToolEvent = {
                id: ev.id,
                tool: ev.tool,
                args: ev.args,
                status: 'running',
              };
              const stepMeta = mapToolToActivity(ev.tool, 'running', ev.args);
              const nextStep: AgentStepEvent = {
                id: ev.id,
                ...stepMeta,
                timestamp: Date.now(),
                status: 'running',
              };
              onChangeMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolEvents: [...(m.toolEvents ?? []), evt],
                        activitySteps: [
                          ...(m.activitySteps ?? []).map((s) =>
                            s.id === 'step_think' && s.status === 'running'
                              ? { ...s, status: 'done' as const, label: 'Thought through request' }
                              : s,
                          ),
                          nextStep,
                        ],
                      }
                    : m,
                ),
              );
            } else if (ev.type === 'tool_result' && ev.id) {
              onChangeMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const targetTool = (m.toolEvents ?? []).find((t) => t.id === ev.id);
                  const nextStatus = ev.status ?? 'done';
                  const mapped = mapToolToActivity(
                    ev.tool ?? targetTool?.tool ?? 'command',
                    nextStatus,
                    targetTool?.args,
                    ev.output,
                  );
                  return {
                    ...m,
                    toolEvents: (m.toolEvents ?? []).map((t) =>
                      t.id === ev.id
                        ? {
                            ...t,
                            status: nextStatus,
                            output: ev.output,
                          }
                        : t,
                    ),
                    activitySteps: (m.activitySteps ?? []).map((s) =>
                      s.id === ev.id
                        ? { ...s, ...mapped, status: nextStatus }
                        : s,
                    ),
                  };
                }),
              );
            } else if (ev.type === 'action' && ev.action) {
              applyClientAction(ev.action, ev.payload ?? {});
            } else if (ev.type === 'grounding' && ev.sources) {
              onChangeMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        sources: ev.sources,
                        activitySteps: (m.activitySteps ?? []).map((s) =>
                          s.id === 'step_search'
                            ? {
                                ...s,
                                status: 'done',
                                label: 'Searched the web',
                                detail: `${ev.sources?.length ?? 0} source(s)`,
                              }
                            : s,
                        ),
                      }
                    : m,
                ),
              );
            } else if (ev.type === 'error') {
              hasError = true;
              const errMsg = ev.error || 'Agent encountered an error.';
              onChangeMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content
                          ? `${m.content}\n\n**Error:** ${errMsg}`
                          : `**Error:** ${errMsg}`,
                        activitySteps: [
                          ...(m.activitySteps ?? []).map((s) =>
                            s.status === 'running' ? { ...s, status: 'error' as const } : s,
                          ),
                          {
                            id: `step_err_${Date.now()}`,
                            kind: 'error',
                            label: 'Agent run failed',
                            detail: activeProvider.label,
                            output: errMsg,
                            timestamp: Date.now(),
                            status: 'error',
                          },
                        ],
                      }
                    : m,
                ),
              );
            }
          } catch {
            // ignore incomplete SSE line
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        aborted = true;
      } else {
        hasError = true;
        const msg = err instanceof Error ? err.message : 'Agent stream failed.';
        onChangeMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: m.content || `**Error:** ${msg}`,
                  activitySteps: [
                    ...(m.activitySteps ?? []).map((s) =>
                      s.status === 'running' ? { ...s, status: 'error' as const } : s,
                    ),
                    {
                      id: `step_err_${Date.now()}`,
                      kind: 'error',
                      label: 'Connection failed',
                      detail: activeProvider.label,
                      output: msg,
                      timestamp: Date.now(),
                      status: 'error',
                    },
                  ],
                }
              : m,
          ),
        );
      }
    } finally {
      onChangeMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          const settled = (m.activitySteps ?? []).map((s) =>
            s.status === 'running'
              ? { ...s, status: hasError ? ('error' as const) : ('done' as const) }
              : s,
          );
          if (!hasError && !aborted && m.content.trim()) {
            const hasMemorySave = settled.some(
              (s) => s.kind === 'memory' && s.label.toLowerCase().includes('saved'),
            );
            if (!hasMemorySave) {
              settled.push({
                id: `step_mem_save_${Date.now()}`,
                kind: 'memory',
                label: 'Saved to memory',
                detail: 'Agent history',
                timestamp: Date.now(),
                status: 'done',
              });
            }
          }
          return { ...m, activitySteps: settled };
        }),
      );
      if (!hasError && !aborted) {
        playStreamCompletePing(soundEffects);
        if (autoReadAloud && fullAgentText.trim()) {
          speakAssistantMessage(fullAgentText);
        }
      }
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleSendAgentMessage = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isRunning) return;
    setChatInput('');
    setComposerExpanded(false);

    if (await runDirectSlashCommand(trimmed)) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      return;
    }

    const userMsg: ChatMessage = {
      id: `ag_${Date.now()}_u`,
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };
    await runAgentFromHistory([...messages, userMsg]);
  };

  const handleRateAgentMessage = (messageId: string, rating: MessageFeedback) => {
    onChangeMessages((prev) => toggleMessageFeedback(prev, messageId, rating));
  };

  const handleRegenerateAgentMessage = async (assistantMessageId: string) => {
    if (isRunning) return;
    const plan = prepareRegenerate(messages, assistantMessageId);
    if (!plan) return;
    if (plan.userText.trim().startsWith('/')) {
      onChangeMessages(() => plan.historyUpToUser.slice(0, -1));
      await runDirectSlashCommand(plan.userText);
      return;
    }
    await runAgentFromHistory(plan.historyUpToUser);
  };

  const handleEditAgentUserMessage = async (userMessageId: string, nextContent: string) => {
    if (isRunning) return;
    const plan = prepareEditResubmit(messages, userMessageId, nextContent);
    if (!plan) return;
    if (plan.editedText.startsWith('/')) {
      onChangeMessages(() => plan.historyWithEditedUser.slice(0, -1));
      await runDirectSlashCommand(plan.editedText);
      return;
    }
    await runAgentFromHistory(plan.historyWithEditedUser);
  };

  return (
    <div className="flex h-full min-h-0 relative">
      {/* Main Conversational Agent Stream */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Minimal Header when messages or preview active */}
        {(messages.length > 0 || previewOpen) && (
          <div
            className="flex items-center justify-between gap-2 px-4 sm:px-8 py-2.5 border-b text-xs"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Agent</span>
                <span style={{ color: 'var(--app-text-muted)' }}>
                  · {activeProvider.label}
                </span>
                {activeProject && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px]"
                    style={{
                      borderColor: 'var(--app-border-color)',
                      backgroundColor: 'var(--app-surface-bg)',
                      color: 'var(--app-text-primary)',
                    }}
                  >
                    <Folders className="w-3 h-3" style={{ color: 'var(--app-accent-hex)' }} />
                    <span>{activeProject.name}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPreviewOpen((v) => !v)}
                  className="text-xs opacity-75 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  {previewOpen ? 'Hide preview' : 'Preview'}
                </button>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChangeMessages(() => [])}
                    className="text-xs opacity-75 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Message Area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-6"
          >
            {messages.length === 0 ? (
              <div
                className="h-full min-h-[260px] flex flex-col items-center justify-center text-center mx-auto space-y-6"
                style={{ maxWidth: 'var(--app-chat-max-w)' }}
              >
                <img
                  src="/luna-mark.svg"
                  alt="Luna"
                  className="w-11 h-11 rounded-xl"
                />
                <div className="space-y-2">
                  <h2 className="font-editorial text-2xl sm:text-3xl font-normal tracking-tight">
                    {activeProject ? `Luna Agent · ${activeProject.name}` : 'Luna Agent'}
                  </h2>
                  <p
                    className="text-xs max-w-md mx-auto leading-relaxed"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    Ask naturally to inspect files, compute results, or build interactive previews.
                  </p>
                </div>
              {showSuggestions && adaptiveSuggestions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  {adaptiveSuggestions.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void handleSendAgentMessage(prompt)}
                      className="btn-lift px-3.5 py-2 rounded-2xl border text-xs text-left max-w-[250px] transition-opacity hover:opacity-85"
                      style={{
                        borderColor: 'var(--app-border-color)',
                        backgroundColor: 'var(--app-surface-bg)',
                        color: 'var(--app-text-muted)',
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="mx-auto w-full min-w-0 space-y-6"
              style={{
                maxWidth: 'var(--app-chat-max-w)',
                fontFamily: 'var(--app-chat-font)',
                fontSize: 'var(--app-chat-size)',
              }}
            >
              {messages.map((msg, idx) => {
                const isActivelyStreaming =
                  isRunning && idx === messages.length - 1;
                const isSelected = selectedMsgId === msg.id;
                const isEditing = editingMsgId === msg.id;

                const handlePressMessage = (e: React.MouseEvent) => {
                  if (window.getSelection()?.toString().trim()) return;
                  if ((e.target as HTMLElement).closest('button, a, textarea, input')) return;
                  if (isActivelyStreaming && !msg.content.trim()) return;
                  setSelectedMsgId((prev) => (prev === msg.id ? null : msg.id));
                };

                if (msg.role === 'user') {
                  return (
                    <div
                      key={msg.id}
                      data-testid={`agent-message-${msg.id}`}
                      className="flex flex-col items-end min-w-0 animate-fade-up"
                    >
                      <div
                        onClick={handlePressMessage}
                        className={`rounded-3xl px-4 py-2.5 max-w-[85%] sm:max-w-[76%] min-w-0 theme-transition cursor-pointer ${
                          isEditing ? 'w-full sm:w-[76%]' : ''
                        }`}
                        style={{
                          backgroundColor: 'var(--app-elevated-bg)',
                          color: 'var(--app-text-primary)',
                        }}
                      >
                        {isEditing ? (
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              aria-label="Edit agent message"
                              rows={3}
                              autoFocus
                              className="w-full resize-y rounded-xl border px-3 py-2 text-sm bg-transparent focus:outline-none"
                              style={{
                                borderColor: 'var(--app-border-color)',
                                color: 'var(--app-text-primary)',
                              }}
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMsgId(null);
                                  setEditingText('');
                                }}
                                className="px-3 py-1 rounded-full text-xs border hover:opacity-85"
                                style={{
                                  borderColor: 'var(--app-border-color)',
                                  color: 'var(--app-text-muted)',
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!editingText.trim()}
                                onClick={() => {
                                  void handleEditAgentUserMessage(msg.id, editingText);
                                  setEditingMsgId(null);
                                  setEditingText('');
                                  setSelectedMsgId(null);
                                }}
                                className="px-3 py-1 rounded-full text-xs font-medium disabled:opacity-40"
                                style={{
                                  backgroundColor: 'var(--app-accent-hex)',
                                  color: '#ffffff',
                                }}
                              >
                                Save &amp; Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">
                            {msg.content}
                          </p>
                        )}
                      </div>

                      {isSelected && !isEditing && (
                        <MessageActionBar
                          role="user"
                          content={msg.content}
                          disabled={isRunning}
                          onEdit={() => {
                            setEditingMsgId(msg.id);
                            setEditingText(msg.content);
                          }}
                        />
                      )}
                    </div>
                  );
                }

                const resolvedSteps: AgentStepEvent[] =
                  msg.activitySteps && msg.activitySteps.length > 0
                    ? msg.activitySteps
                    : (msg.toolEvents ?? []).map((t) => ({
                        id: t.id,
                        ...mapToolToActivity(t.tool, t.status, t.args, t.output),
                        timestamp: msg.createdAt,
                        status: t.status,
                      }));

                return (
                  <div
                    key={msg.id}
                    data-testid={`agent-message-${msg.id}`}
                    onClick={handlePressMessage}
                    className="space-y-2.5 w-full min-w-0 animate-fade-up cursor-pointer rounded-2xl"
                  >
                    {resolvedSteps.length > 0 && (
                      <ActivityTrace steps={resolvedSteps} />
                    )}

                    {msg.content ? (
                      <>
                        <MarkdownRenderer
                          content={msg.content}
                          onRunInSandbox={(code, lang) => {
                            const normalized = lang === 'html' ? 'html' : 'javascript';
                            onChangeSandbox(code, normalized);
                            setPreviewOpen(true);
                            executeSandbox(code, normalized);
                          }}
                        />
                        <StreamingAnswerIndicator
                          active={isActivelyStreaming}
                          hasContent
                          thinking={highThinking}
                        />
                      </>
                    ) : (
                      <StreamingAnswerIndicator
                        active={isActivelyStreaming}
                        hasContent={false}
                        thinking={highThinking}
                      />
                    )}

                    {msg.sources && msg.sources.length > 0 && (
                      <div
                        className="pt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"
                        style={{ color: 'var(--app-text-muted)' }}
                      >
                        <span>Sources:</span>
                        {msg.sources.map((src) => (
                          <a
                            key={src.uri}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 underline hover:opacity-80"
                          >
                            {src.title}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ))}
                      </div>
                    )}

                    {isSelected && !isActivelyStreaming && msg.content.trim() && (
                      <MessageActionBar
                        role="assistant"
                        content={msg.content}
                        feedback={msg.feedback}
                        disabled={isRunning}
                        onRate={(rating) => handleRateAgentMessage(msg.id, rating)}
                        onRegenerate={() => {
                          setSelectedMsgId(null);
                          void handleRegenerateAgentMessage(msg.id);
                        }}
                      />
                    )}
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Full-Screen Expanded Agent Composer */}
        {composerExpanded && (
          <div
            className="fixed inset-0 z-50 flex flex-col"
            style={{
              backgroundColor: 'var(--app-canvas-bg)',
              color: 'var(--app-text-primary)',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Expanded agent editor"
          >
            <div
              className="flex items-center justify-between px-4 sm:px-6 h-12 border-b shrink-0"
              style={{ borderColor: 'var(--app-border-color)' }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
                Luna Agent · {activeProvider.label}
              </span>
              <button
                type="button"
                onClick={() => setComposerExpanded(false)}
                aria-label="Collapse agent editor"
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
            <div
              className="flex-1 w-full mx-auto px-4 sm:px-8 py-4 flex flex-col min-h-0"
              style={{ maxWidth: 'var(--app-chat-max-w)' }}
            >
              <textarea
                ref={expandedTextareaRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Write a task for Luna Agent..."
                aria-label="Expanded agent chat input"
                className="flex-1 w-full resize-none bg-transparent text-base leading-relaxed focus:outline-none"
                style={{
                  color: 'var(--app-text-primary)',
                  fontFamily: 'var(--app-chat-font)',
                }}
              />
              <div
                className="flex items-center justify-between pt-3 border-t"
                style={{ borderColor: 'var(--app-border-color)' }}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHighThinking((v) => !v)}
                    aria-pressed={highThinking}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: highThinking ? 'var(--app-elevated-bg)' : 'transparent',
                      color: highThinking ? 'var(--app-text-primary)' : 'var(--app-text-muted)',
                    }}
                  >
                    <Brain className="w-3.5 h-3.5" />
                    <span>Think</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWebSearch((v) => !v)}
                    aria-pressed={webSearch}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: webSearch ? 'var(--app-elevated-bg)' : 'transparent',
                      color: webSearch ? 'var(--app-text-primary)' : 'var(--app-text-muted)',
                    }}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Web</span>
                  </button>
                </div>
                {isRunning ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    aria-label="Stop agent run"
                    className="w-9 h-9 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!chatInput.trim()}
                    onClick={() => void handleSendAgentMessage(chatInput)}
                    aria-label="Send agent message"
                    className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30"
                    style={{
                      backgroundColor: 'var(--app-accent-hex)',
                      color: '#ffffff',
                    }}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quick Go Down Button */}
        {showScrollBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            aria-label="Scroll to latest agent message"
            className="btn-lift absolute bottom-24 right-5 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg border text-xs font-medium backdrop-blur-md transition-all animate-fade-up"
            style={{
              backgroundColor: 'var(--app-surface-bg)',
              borderColor: 'var(--app-border-color)',
              color: 'var(--app-text-primary)',
            }}
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Latest</span>
            {isRunning && (
              <span
                className="w-2 h-2 rounded-full animate-stream-orb"
                style={{ backgroundColor: 'var(--app-accent-hex)' }}
              />
            )}
          </button>
        )}

        {/* Clean Floating Agent Composer */}
        <div className="px-4 pb-5 pt-2 shrink-0">
          <div
            className="mx-auto rounded-[26px] border px-3.5 py-2.5 space-y-1.5 theme-transition"
            style={{
              maxWidth: 'var(--app-chat-max-w)',
              borderColor: 'var(--app-border-color)',
              backgroundColor: 'var(--app-surface-bg)',
            }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  ((enterToSend && !e.shiftKey) || (!enterToSend && (e.metaKey || e.ctrlKey)))
                ) {
                  e.preventDefault();
                  void handleSendAgentMessage(chatInput);
                }
              }}
              placeholder="Give Luna Agent a task..."
              aria-label="Agent chat input"
              className="w-full resize-none bg-transparent text-sm leading-6 px-1 py-0.5 focus:outline-none"
              style={{
                color: 'var(--app-text-primary)',
                maxHeight: '50dvh',
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHighThinking((v) => !v)}
                  aria-pressed={highThinking}
                  className="btn-lift flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: highThinking
                      ? 'var(--app-elevated-bg)'
                      : 'transparent',
                    color: highThinking
                      ? 'var(--app-text-primary)'
                      : 'var(--app-text-muted)',
                  }}
                >
                  <Brain className="w-3.5 h-3.5" />
                  <span>Think</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWebSearch((v) => !v)}
                  aria-pressed={webSearch}
                  className="btn-lift flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: webSearch
                      ? 'var(--app-elevated-bg)'
                      : 'transparent',
                    color: webSearch
                      ? 'var(--app-text-primary)'
                      : 'var(--app-text-muted)',
                  }}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Web</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {canExpandComposer && (
                  <button
                    type="button"
                    onClick={() => setComposerExpanded(true)}
                    aria-label="Expand agent editor"
                    className="btn-lift w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors hover:bg-white/10"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {isRunning ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    aria-label="Stop agent run"
                    className="btn-lift w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shrink-0"
                  >
                    <Square className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!chatInput.trim()}
                    onClick={() => void handleSendAgentMessage(chatInput)}
                    aria-label="Send agent message"
                    className="btn-lift w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30 transition-all shrink-0"
                    style={{
                      backgroundColor: chatInput.trim()
                        ? 'var(--app-accent-hex)'
                        : 'var(--app-text-primary)',
                      color: chatInput.trim() ? '#ffffff' : 'var(--app-canvas-bg)',
                    }}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* On-Demand Isolated Preview Drawer (hidden unless triggered) */}
      {previewOpen && (
        <div
          className="fixed inset-y-0 right-0 z-30 w-full max-w-md lg:static lg:w-[420px] flex flex-col border-l shadow-2xl lg:shadow-none"
          style={{
            borderColor: 'var(--app-border-color)',
            backgroundColor: 'var(--app-surface-bg)',
          }}
        >
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 border-b text-xs"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            <span className="font-medium">Live Preview</span>
            <div className="flex items-center gap-2">
              <select
                aria-label="Sandbox runtime language"
                value={sandboxLang}
                onChange={(e) =>
                  onChangeSandbox(
                    sandboxCode,
                    e.target.value as 'javascript' | 'html',
                  )
                }
                className="rounded-lg border px-2 py-1 text-xs"
                style={{
                  borderColor: 'var(--app-border-color)',
                  backgroundColor: 'var(--app-canvas-bg)',
                  color: 'var(--app-text-primary)',
                }}
              >
                <option value="javascript">JavaScript</option>
                <option value="html">HTML</option>
              </select>
              <button
                type="button"
                onClick={() => executeSandbox()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap"
              >
                <Play className="w-3 h-3" />
                <span>Run</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
                className="p-1 rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <textarea
            value={sandboxCode}
            onChange={(e) => onChangeSandbox(e.target.value, sandboxLang)}
            aria-label="Sandbox code editor"
            spellCheck={false}
            className="h-44 w-full resize-none p-3 font-mono text-xs border-b focus:outline-none"
            style={{
              borderColor: 'var(--app-border-color)',
              backgroundColor: 'var(--app-canvas-bg)',
              color: 'var(--app-text-primary)',
            }}
          />

          <div className="flex-1 min-h-0 flex flex-col">
            <iframe
              key={sandboxRunKey}
              title="Isolated Code Execution Sandbox"
              sandbox="allow-scripts"
              srcDoc={sandboxSrcDoc}
              className="w-full flex-1 border-0 bg-neutral-950"
            />
            {sandboxLogs.length > 0 && (
              <div
                className="max-h-28 overflow-y-auto p-2.5 border-t font-mono text-[11px] space-y-0.5"
                style={{ borderColor: 'var(--app-border-color)' }}
              >
                {sandboxLogs.map((l) => (
                  <div
                    key={l.id}
                    className={
                      l.level === 'error'
                        ? 'text-rose-400'
                        : l.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }
                  >
                    {l.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
