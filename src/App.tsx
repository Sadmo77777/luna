import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Check,
  ChevronDown,
  Code2,
  FolderPlus,
  Folders,
  GripHorizontal,
  LogIn,
  LogOut,
  MessageCircle,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquarePen,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { AgentWorkspace } from './components/AgentWorkspace';
import { ChatWorkspace } from './components/ChatWorkspace';
import { Companion3DCanvas } from './components/Companion3DCanvas';
import { CompanionWorkspace } from './components/CompanionWorkspace';
import { SettingsModal, type SettingsTabId } from './components/SettingsModal';
import { playStreamCompletePing, playStreamStartPing } from './utils/audioEffects';
import { speakAssistantMessage } from './utils/tts';
import {
  auth,
  googleAuthProvider,
  validateFirestoreConnection,
} from './lib/firebase';
import {
  createStarterConversations,
  DEFAULT_PROVIDERS,
  getSavedActiveConvIdSync,
  getSavedActiveProjectIdSync,
  getSavedCompanionMessagesSync,
  getSavedModeSync,
  getSavedProjectsSync,
  getSavedThemeSync,
  getSavedUiPrefsSync,
  getSavedWorkspacePrefsSync,
  loadLocalState,
  saveLocalActiveConvId,
  saveLocalActiveProjectId,
  saveLocalCompanionMessages,
  saveLocalConversations,
  saveLocalDevices,
  saveLocalDocuments,
  saveLocalE2EEConfig,
  saveLocalMode,
  saveLocalProjects,
  saveLocalProviders,
  saveLocalTheme,
  saveLocalUiPrefs,
  saveLocalWorkspacePrefs,
  STARTER_DEVICES,
  STARTER_DOCUMENTS,
} from './lib/localStore';
import {
  flushOfflineSyncQueue,
  subscribeToCrossPlatformDevices,
  syncConversationToCloud,
  syncDevicePresence,
  syncDocumentToCloud,
  syncSessionWithServer,
} from './lib/syncService';
import type {
  AgentStepEvent,
  ChatMessage,
  CompanionAnimState,
  Conversation,
  DeviceSyncNode,
  FileAttachment,
  GroundingSource,
  ImageAttachment,
  ProjectFolder,
  ProviderConfig,
  WorkspaceMode,
} from './types/workspace';
import { extractCompanionPose } from './utils/agentParser';
import { contextSearchCache, warmStaticAssetCache } from './utils/cache';
import {
  buildConversationPreview,
  buildConversationTitleFromReply,
} from './utils/conversationSummary';
import {
  prepareEditResubmit,
  prepareRegenerate,
  toggleMessageFeedback,
  type MessageFeedback,
} from './utils/messageActions';
import {
  createProjectFolder,
  filterConversationsByQueryAndProject,
  partitionPinnedConversations,
} from './utils/projects';
import {
  retrieveRelevantChunks,
  type ContextDocument,
} from './utils/contextSearch';
import {
  buildLunaSystemPrompt,
  formatPromptWithAttachments,
} from './utils/systemPrompt';
import {
  computeKeyFingerprint,
  deriveVaultKey,
  exportKeyJwk,
  generateDeviceVaultKey,
  generateSaltBase64,
  importKeyJwk,
} from './utils/crypto';
import {
  applyThemeToDocument,
  getTheme,
  type ThemeId,
  type UiPreferences,
} from './utils/themes';
import { matchWorkspaceShortcut } from './utils/shortcuts';

const DEFAULT_SANDBOX_CODE = `// Isolated Luna Sandbox
const metrics = [
  { module: "Chat Streaming", latencyMs: 42 },
  { module: "E2EE AES-GCM", latencyMs: 4 },
  { module: "3D Companion Rig", latencyMs: 16 },
];
console.log("Workspace modules:", metrics);
return metrics.reduce((acc, m) => acc + m.latencyMs, 0);`;

const AGENT_MESSAGES_KEY = 'luna_agent_messages_v1';

function loadSavedAgentMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(AGENT_MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [mode, setMode] = useState<WorkspaceMode>(() => getSavedModeSync());
  const [companionMounted, setCompanionMounted] = useState<boolean>(
    () => getSavedModeSync() === 'companion',
  );
  const [themeId, setThemeId] = useState<ThemeId>(() => getSavedThemeSync());
  const [uiPrefs, setUiPrefs] = useState<UiPreferences>(() => getSavedUiPrefsSync());
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    createStarterConversations(),
  );
  const [activeConvId, setActiveConvId] = useState<string>(
    () => getSavedActiveConvIdSync() ?? 'conv_new_default',
  );
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>(() =>
    loadSavedAgentMessages(),
  );
  const [documents, setDocuments] = useState<ContextDocument[]>(STARTER_DOCUMENTS);
  const [providers, setProviders] = useState<ProviderConfig[]>(DEFAULT_PROVIDERS);
  const [activeProviderId, setActiveProviderId] = useState<string>('gemini-flash');
  const [devices, setDevices] = useState<DeviceSyncNode[]>(STARTER_DEVICES);

  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  void authBusy;

  // Chat / Tool Toggles (cached across reloads)
  const initialRuntimePrefs = useMemo(() => getSavedWorkspacePrefsSync(), []);
  const [highThinking, setHighThinking] = useState(initialRuntimePrefs.highThinking);
  const [webSearch, setWebSearch] = useState(initialRuntimePrefs.webSearch);
  const [useDocContext, setUseDocContext] = useState(initialRuntimePrefs.useDocContext);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);

  // Companion State & Movable Overlay (cached across reloads)
  const [companionState, setCompanionState] = useState<CompanionAnimState>('idle');
  const [companionMessages, setCompanionMessages] = useState<ChatMessage[]>(() =>
    getSavedCompanionMessagesSync(),
  );
  const [overlayEnabled, setOverlayEnabled] = useState(initialRuntimePrefs.overlayEnabled);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number }>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    return { x: Math.max(16, w - 256), y: Math.max(64, h - 304) };
  });
  const dragStateRef = useRef<{
    dragging: boolean;
    offsetX: number;
    offsetY: number;
  }>({ dragging: false, offsetX: 0, offsetY: 0 });

  // Agent Sandbox State
  const [sandboxCode, setSandboxCode] = useState(DEFAULT_SANDBOX_CODE);
  const [sandboxLang, setSandboxLang] = useState<'javascript' | 'html'>('javascript');

  // E2EE State
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [e2eeFingerprint, setE2eeFingerprint] = useState<string | null>(null);

  // UI Navigation & Modal State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [projects, setProjects] = useState<ProjectFolder[]>(() => getSavedProjectsSync());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    getSavedActiveProjectIdSync(),
  );
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false);
  const [newProjectInput, setNewProjectInput] = useState('');
  const [pinnedSectionOpen, setPinnedSectionOpen] = useState(true);
  const [chatsSectionOpen, setChatsSectionOpen] = useState(true);
  const [searchBarOpen, setSearchBarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const [historyFilter, setHistoryFilter] = useState('');
  const [pressedConvId, setPressedConvId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('ai');

  useEffect(() => {
    try {
      localStorage.setItem(AGENT_MESSAGES_KEY, JSON.stringify(agentMessages.slice(-60)));
    } catch {
      // ignore storage quota issues
    }
  }, [agentMessages]);

  useEffect(() => {
    saveLocalWorkspacePrefs({
      highThinking,
      webSearch,
      useDocContext,
      overlayEnabled,
    });
  }, [highThinking, webSearch, useDocContext, overlayEnabled]);

  useEffect(() => {
    saveLocalActiveConvId(activeConvId);
  }, [activeConvId]);

  useEffect(() => {
    saveLocalCompanionMessages(companionMessages);
  }, [companionMessages]);

  // Pre-warm static assets and Companion 3D stage during idle so entering Companion is instant
  useEffect(() => {
    const warm = () => {
      setCompanionMounted(true);
      void warmStaticAssetCache([
        '/luna-mark.svg',
        '/manifest.json',
        '/assets/aistudio/Gemini_Generated_Image_qgk88yqgk88yqgk8_27539a54.jpeg',
      ]);
    };
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(warm, { timeout: 500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(warm, 250);
    return () => window.clearTimeout(timer);
  }, []);

  // Keep overlay clamped inside window on resize
  useEffect(() => {
    const clamp = () => {
      setOverlayPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - 236, prev.x)),
        y: Math.max(8, Math.min(window.innerHeight - 280, prev.y)),
      }));
    };
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  // Hydrate offline-first state from IndexedDB + localStorage
  useEffect(() => {
    let mounted = true;
    void validateFirestoreConnection();
    void loadLocalState().then(async (saved) => {
      if (!mounted) return;
      setConversations(saved.conversations);
      const savedConvId = getSavedActiveConvIdSync();
      const matchedConv = savedConvId
        ? saved.conversations.find((c) => c.id === savedConvId)
        : null;
      setActiveConvId(matchedConv?.id ?? saved.conversations[0]?.id ?? 'conv_new_default');
      setDocuments(saved.documents);
      setProviders(saved.providers);
      setActiveProviderId(saved.activeProviderId);
      setThemeId(saved.themeId);
      setUiPrefs(saved.uiPrefs);
      applyThemeToDocument(getTheme(saved.themeId), saved.uiPrefs);
      setMode(saved.mode);
      if (saved.mode === 'companion') setCompanionMounted(true);
      setDevices(saved.devices);
      setE2eeEnabled(saved.e2eeEnabled);

      if (saved.e2eeEnabled && saved.e2eeJwk) {
        try {
          const imported = await importKeyJwk(saved.e2eeJwk);
          const fp = await computeKeyFingerprint(imported);
          if (mounted) {
            setVaultKey(imported);
            setE2eeFingerprint(fp);
          }
        } catch {
          // ignore corrupted JWK
        }
      }
    });

    const syncViewport = () => {
      const vv = window.visualViewport;
      if (vv && vv.height > 0) {
        setViewportHeight(Math.round(vv.height));
      } else {
        setViewportHeight(null);
      }
    };
    syncViewport();
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);

    return () => {
      mounted = false;
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', syncViewport);
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(getTheme(themeId), uiPrefs);
  }, [themeId, uiPrefs]);

  useEffect(() => {
    let unsubDevices: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (unsubDevices) {
        unsubDevices();
        unsubDevices = null;
      }
      if (nextUser) {
        await syncSessionWithServer(nextUser);
        await flushOfflineSyncQueue(nextUser, vaultKey);
        unsubDevices = subscribeToCrossPlatformDevices(nextUser, (cloudDevs) => {
          setDevices(cloudDevs);
          saveLocalDevices(cloudDevs);
        });
      }
    });
    return () => {
      unsubAuth();
      if (unsubDevices) unsubDevices();
    };
  }, [vaultKey]);

  const activeConversation = useMemo(
    () =>
      conversations.find((c) => c.id === activeConvId) ??
      conversations[0] ??
      createStarterConversations()[0],
    [conversations, activeConvId],
  );

  const activeProvider = useMemo(
    () =>
      providers.find((p) => p.id === activeProviderId) ??
      providers[0] ??
      DEFAULT_PROVIDERS[0],
    [providers, activeProviderId],
  );

  const filteredConversations = useMemo(
    () =>
      filterConversationsByQueryAndProject(
        conversations,
        historyFilter,
        activeProjectId,
        buildConversationPreview,
      ),
    [conversations, historyFilter, activeProjectId],
  );

  const { pinned: pinnedConversations, regular: regularConversations } = useMemo(
    () => partitionPinnedConversations(filteredConversations),
    [filteredConversations],
  );

  const pinnedProjects = useMemo(
    () => projects.filter((p) => p.pinned),
    [projects],
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const persistConversations = useCallback(
    (next: Conversation[], updatedConv?: Conversation) => {
      setConversations(next);
      void saveLocalConversations(next);
      if (updatedConv && user) {
        void syncConversationToCloud(user, updatedConv, vaultKey);
      }
    },
    [user, vaultKey],
  );

  const handleCreateProject = useCallback(
    (name: string): ProjectFolder | null => {
      const created = createProjectFolder(name, {
        existing: projects,
        pinned: true,
        defaultMode: mode === 'agent' ? 'agent' : 'chat',
      });
      if (!created) return null;
      const exists = projects.some((p) => p.id === created.id);
      if (!exists) {
        const next = [created, ...projects];
        setProjects(next);
        saveLocalProjects(next);
      }
      return created;
    },
    [projects, mode],
  );

  const handleAssignConversationProject = useCallback(
    (convId: string, projectId: string | undefined) => {
      const next = conversations.map((c) =>
        c.id === convId ? { ...c, projectId, updatedAt: Date.now() } : c,
      );
      const updated = next.find((c) => c.id === convId);
      persistConversations(next, updated);
    },
    [conversations, persistConversations],
  );

  const handleTogglePinConversation = useCallback(
    (convId: string) => {
      const next = conversations.map((c) =>
        c.id === convId ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c,
      );
      const updated = next.find((c) => c.id === convId);
      persistConversations(next, updated);
      setPressedConvId(null);
    },
    [conversations, persistConversations],
  );

  const activeThemeIsDark = useMemo(() => getTheme(themeId).isDark, [themeId]);

  const handleModeChange = (nextMode: WorkspaceMode) => {
    if (nextMode === 'companion') {
      setCompanionMounted(true);
    }
    setMode(nextMode);
    saveLocalMode(nextMode);
    setSidebarOpen(false);
  };

  const handleCreateConversation = (explicitProjectId?: string | null) => {
    const id = `conv_${Date.now()}`;
    const targetProject =
      explicitProjectId !== undefined
        ? explicitProjectId ?? undefined
        : activeProjectId ?? undefined;
    const newConv: Conversation = {
      id,
      title: 'New chat',
      mode: 'chat',
      providerId: activeProvider.id,
      modelId: activeProvider.modelId,
      projectId: targetProject,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [newConv, ...conversations];
    persistConversations(next, newConv);
    setActiveConvId(id);
    handleModeChange('chat');
  };

  const handleDeleteConversation = (id: string) => {
    setPressedConvId(null);
    const remaining = conversations.filter((c) => c.id !== id);
    const next =
      remaining.length > 0 ? remaining : createStarterConversations();
    persistConversations(next);
    if (activeConvId === id) {
      setActiveConvId(next[0].id);
    }
    if (user && navigator.onLine) {
      void user.getIdToken().then((token) =>
        fetch(`/api/sync/conversations/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => undefined),
      );
    }
  };

  const summarizeConversationInBackground = useCallback(
    async (convId: string, msgs: ChatMessage[]) => {
      if (!uiPrefs.autoSummarize || !navigator.onLine) return;
      const hasAssistant = msgs.some(
        (m) =>
          m.role === 'assistant' &&
          m.content.trim() &&
          !/^\*\*(?:Error|Connection error|Offline mode):\*\*/i.test(m.content.trim()),
      );
      if (!hasAssistant) return;
      try {
        const resp = await fetch('/api/chat/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: msgs.slice(-4).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { title?: string | null; summary?: string | null };
        if (!data.title && !data.summary) return;

        setConversations((prev) => {
          const next = prev.map((c) => {
            if (c.id !== convId) return c;
            const keepCustomTitle =
              c.title &&
              c.title !== 'New Conversation' &&
              c.title !== 'New chat' &&
              !c.title.startsWith('Workspace Capabilities');
            return {
              ...c,
              title: !keepCustomTitle && data.title ? data.title : c.title,
              summary: data.summary ?? c.summary,
              updatedAt: Date.now(),
            };
          });
          const target = next.find((c) => c.id === convId);
          void saveLocalConversations(next);
          if (target && user) {
            void syncConversationToCloud(user, target, vaultKey);
          }
          return next;
        });
      } catch {
        // non-blocking polish; fallback preview already comes from assistant chat text
      }
    },
    [uiPrefs.autoSummarize, user, vaultKey],
  );

  const streamChatCompletion = async (
    historyForApi: ChatMessage[],
    assistantPlaceholderId: string,
    onDelta: (
      text: string,
      meta?: {
        model?: string;
        thinking?: boolean;
        sources?: GroundingSource[];
        activitySteps?: AgentStepEvent[];
      },
    ) => void,
    onDone: (finalText: string, activitySteps: AgentStepEvent[]) => void,
    targetMode: 'chat' | 'companion' = 'chat',
  ) => {
    const abort = new AbortController();
    streamAbortRef.current = abort;
    setIsStreaming(true);

    // Normal Chat only injects workspace notes when the user explicitly opts in via Connectors
    const lastUserMessage = [...historyForApi].reverse().find((m) => m.role === 'user');
    let contextChunks: ReturnType<typeof retrieveRelevantChunks> = [];
    if (targetMode === 'chat' && useDocContext && lastUserMessage?.content.trim()) {
      const docSig = documents.map((d) => `${d.id}:${d.updatedAt}`).join(',');
      const cacheKey = `chat:${lastUserMessage.content.trim()}:${docSig}`;
      const cached = contextSearchCache.get(cacheKey) as
        | ReturnType<typeof retrieveRelevantChunks>
        | undefined;
      if (cached) {
        contextChunks = cached;
      } else {
        contextChunks = retrieveRelevantChunks(lastUserMessage.content.trim(), documents, 4);
        contextSearchCache.set(cacheKey, contextChunks);
      }
    }

    let fullText = '';
    let modelMeta: string | undefined;
    let thinkingMeta = false;
    let sourceMeta: GroundingSource[] | undefined;
    let hasError = false;
    let aborted = false;

    let steps: AgentStepEvent[] = [];
    if (contextChunks.length > 0) {
      steps.push({
        id: 'step_mem_read',
        kind: 'memory',
        label: 'Checking workspace notes',
        detail: `${contextChunks.length} matched note${contextChunks.length > 1 ? 's' : ''}`,
        timestamp: Date.now(),
        status: 'done',
      });
    }
    if (webSearch) {
      steps.push({
        id: 'step_search',
        kind: 'search',
        label: 'Searching the web',
        timestamp: Date.now(),
        status: 'running',
      });
    }
    if (highThinking) {
      steps.push({
        id: 'step_think',
        kind: 'thinking',
        label: 'Thinking deeply',
        timestamp: Date.now(),
        status: 'running',
      });
    }

    const markStep = (
      id: string,
      status: 'running' | 'done' | 'error',
      label?: string,
      detail?: string,
      output?: string,
    ) => {
      steps = steps.map((s) =>
        s.id === id
          ? {
              ...s,
              status,
              label: label ?? s.label,
              detail: detail ?? s.detail,
              output: output ?? s.output,
            }
          : s,
      );
    };

    if (steps.length > 0) {
      onDelta('', { activitySteps: [...steps] });
    }

    const limitedHistory =
      uiPrefs.historyLimit > 0
        ? historyForApi.slice(-uiPrefs.historyLimit)
        : historyForApi;

    const hasAttachments = limitedHistory.some(
      (m) => (m.images && m.images.length > 0) || (m.files && m.files.length > 0),
    );
    const mergedSystemInstruction = buildLunaSystemPrompt({
      mode: targetMode,
      highThinking,
      webSearch,
      hasAttachments,
      customInstructions: uiPrefs.customInstructions,
      aiPersona: uiPrefs.aiPersona,
      responseLength: uiPrefs.responseLength,
      preferredName: uiPrefs.preferredName || user?.displayName?.split(' ')[0] || undefined,
    });

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          messages: limitedHistory.map((m) => ({
            role: m.role,
            content:
              m.role === 'user'
                ? formatPromptWithAttachments(m.content, m.files)
                : m.content,
            images: m.images?.map((img) => ({
              mimeType: img.mimeType,
              data: img.data,
            })),
          })),
          systemInstruction: mergedSystemInstruction,
          contextChunks: contextChunks.map((c) => ({
            title: c.title,
            docType: c.docType,
            text: c.text,
          })),
          highThinking,
          webSearch,
          temperature: uiPrefs.temperature,
          maxOutputTokens: uiPrefs.maxOutputTokens,
          provider: activeProvider,
        }),
      });

      if (!response.body) {
        throw new Error('Streaming response body unavailable.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasPlayedStartPing = false;

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
            const ev = JSON.parse(raw);
            if (!hasPlayedStartPing && (ev.type === 'token' || ev.type === 'meta' || ev.type === 'grounding')) {
              playStreamStartPing(uiPrefs.soundEffects);
              hasPlayedStartPing = true;
            }
            if (ev.type === 'meta') {
              modelMeta = ev.model;
              thinkingMeta = Boolean(ev.thinking);
            } else if (ev.type === 'token') {
              markStep('step_think', 'done', 'Thought through request');
              fullText += ev.text;
              onDelta(fullText, {
                model: modelMeta,
                thinking: thinkingMeta,
                sources: sourceMeta,
                activitySteps: [...steps],
              });
            } else if (ev.type === 'grounding') {
              sourceMeta = ev.sources;
              markStep(
                'step_search',
                'done',
                'Searched the web',
                `${Array.isArray(ev.sources) ? ev.sources.length : 0} source(s)`,
              );
              onDelta(fullText, {
                model: modelMeta,
                thinking: thinkingMeta,
                sources: sourceMeta,
                activitySteps: [...steps],
              });
            } else if (ev.type === 'error') {
              hasError = true;
              const errMsg = String(ev.error || 'Provider stream failed.');
              steps = steps.map((s) =>
                s.status === 'running' ? { ...s, status: 'error' } : s,
              );
              steps.push({
                id: `step_err_${Date.now()}`,
                kind: 'error',
                label: 'Response failed',
                detail: activeProvider.label,
                output: errMsg,
                timestamp: Date.now(),
                status: 'error',
              });
              fullText = `**Error:** ${errMsg}`;
              onDelta(fullText, {
                model: modelMeta,
                activitySteps: [...steps],
              });
            }
          } catch {
            // ignore incomplete SSE line
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        aborted = true;
        steps = steps.map((s) =>
          s.status === 'running' ? { ...s, status: 'done' } : s,
        );
      } else {
        hasError = true;
        const errMsg = !navigator.onLine
          ? 'Offline — saved locally in IndexedDB.'
          : err instanceof Error
            ? err.message
            : 'Unable to reach AI stream.';
        steps = steps.map((s) =>
          s.status === 'running' ? { ...s, status: 'error' } : s,
        );
        steps.push({
          id: `step_err_${Date.now()}`,
          kind: 'error',
          label: navigator.onLine ? 'Connection failed' : 'Offline mode',
          detail: activeProvider.label,
          output: errMsg,
          timestamp: Date.now(),
          status: 'error',
        });
        fullText =
          fullText ||
          (navigator.onLine
            ? `**Connection error:** ${errMsg}`
            : '**Offline mode:** Your message has been saved locally in IndexedDB. Reconnect to stream a cloud response.');
        onDelta(fullText, {
          model: modelMeta,
          activitySteps: [...steps],
        });
      }
    } finally {
      if (!hasError && !aborted) {
        steps = steps.map((s) =>
          s.status === 'running' ? { ...s, status: 'done' } : s,
        );
        if (fullText.trim()) {
          steps.push({
            id: `step_mem_save_${Date.now()}`,
            kind: 'memory',
            label: e2eeEnabled ? 'Saved to encrypted memory' : 'Saved to memory',
            detail: user ? 'Synced & cached' : 'Local vault',
            timestamp: Date.now(),
            status: 'done',
          });
        }
        playStreamCompletePing(uiPrefs.soundEffects);
        if (uiPrefs.autoReadAloud && fullText.trim()) {
          speakAssistantMessage(fullText, {
            rate: uiPrefs.ttsRate,
            pitch: uiPrefs.ttsPitch,
            voiceName: uiPrefs.ttsVoiceName || undefined,
          });
        }
      }
      setIsStreaming(false);
      streamAbortRef.current = null;
      void assistantPlaceholderId;
      onDone(fullText, [...steps]);
    }
  };

  const handleSendChatMessage = async (
    text: string,
    images: ImageAttachment[],
    files: FileAttachment[] = [],
  ) => {
    const conv = activeConversation;
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
      images: images.length > 0 ? images : undefined,
      files: files.length > 0 ? files : undefined,
    };
    const assistantId = `msg_${Date.now()}_a`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      modelUsed:
        activeProvider.providerType === 'gemini' && (images.length > 0 || highThinking)
          ? 'gemini-4-hydrogen'
          : activeProvider.modelId,
      thinkingUsed: highThinking,
    };

    const history = [...conv.messages, userMsg];
    const initialUpdated: Conversation = {
      ...conv,
      messages: [...history, assistantPlaceholder],
      updatedAt: Date.now(),
    };

    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? initialUpdated : c)),
    );

    await streamChatCompletion(
      history,
      assistantId,
      (partialText, meta) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== conv.id) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: partialText,
                      modelUsed: meta?.model ?? m.modelUsed,
                      thinkingUsed: meta?.thinking ?? m.thinkingUsed,
                      sources: meta?.sources ?? m.sources,
                      activitySteps: meta?.activitySteps ?? m.activitySteps,
                    }
                  : m,
              ),
              updatedAt: Date.now(),
            };
          }),
        );
      },
      (finalText, activitySteps) => {
        const finalHistory = [
          ...history,
          { ...assistantPlaceholder, content: finalText, activitySteps },
        ];
        const fallbackTitle =
          conv.title === 'New Conversation' || conv.title === 'New chat'
            ? buildConversationTitleFromReply(finalText) ??
              buildConversationTitleFromReply(userMsg.content) ??
              conv.title
            : conv.title;

        setConversations((prev) => {
          const finalList = prev.map((c) => {
            if (c.id !== conv.id) return c;
            return {
              ...c,
              title: fallbackTitle,
              messages: c.messages.map((m) =>
                m.id === assistantId
                  ? { ...m, content: finalText, activitySteps }
                  : m,
              ),
              updatedAt: Date.now(),
            };
          });
          const target = finalList.find((c) => c.id === conv.id);
          void saveLocalConversations(finalList);
          if (target && user) {
            void syncConversationToCloud(user, target, vaultKey);
          }
          return finalList;
        });
        void summarizeConversationInBackground(conv.id, finalHistory);
      },
    );
  };

  const handleSendCompanionMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `comp_${Date.now()}_u`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    const assistantId = `comp_${Date.now()}_a`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    };

    const history = [...companionMessages, userMsg];
    setCompanionMessages([...history, assistantMsg]);
    setCompanionState('thinking');

    await streamChatCompletion(
      history,
      assistantId,
      (partial, meta) => {
        const { cleanText, pose } = extractCompanionPose(partial);
        if (pose) {
          setCompanionState(pose);
        } else if (cleanText.length > 0) {
          setCompanionState('talking');
        }
        setCompanionMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: cleanText,
                  activitySteps: meta?.activitySteps ?? m.activitySteps,
                }
              : m,
          ),
        );
      },
      (finalRaw, activitySteps) => {
        const { cleanText, pose } = extractCompanionPose(finalRaw);
        setCompanionMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: cleanText, activitySteps }
              : m,
          ),
        );
        if (pose && pose !== 'idle') {
          setCompanionState(pose);
          setTimeout(() => setCompanionState('idle'), 2600);
        } else {
          setTimeout(() => setCompanionState('idle'), 1200);
        }
      },
      'companion',
    );
  };

  const runChatFromHistory = async (
    conv: Conversation,
    history: ChatMessage[],
    updatedTitle?: string,
  ) => {
    const assistantId = `msg_${Date.now()}_a`;
    const lastUser = history[history.length - 1];
    const hasImages = Boolean(lastUser?.images && lastUser.images.length > 0);
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      modelUsed:
        activeProvider.providerType === 'gemini' && (hasImages || highThinking)
          ? 'gemini-4-hydrogen'
          : activeProvider.modelId,
      thinkingUsed: highThinking,
    };

    const nextConv: Conversation = {
      ...conv,
      title: updatedTitle ?? conv.title,
      messages: [...history, assistantPlaceholder],
      updatedAt: Date.now(),
    };
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? nextConv : c)),
    );

    await streamChatCompletion(
      history,
      assistantId,
      (partialText, meta) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== conv.id) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: partialText,
                      modelUsed: meta?.model ?? m.modelUsed,
                      thinkingUsed: meta?.thinking ?? m.thinkingUsed,
                      sources: meta?.sources ?? m.sources,
                      activitySteps: meta?.activitySteps ?? m.activitySteps,
                    }
                  : m,
              ),
              updatedAt: Date.now(),
            };
          }),
        );
      },
      (finalText, activitySteps) => {
        setConversations((prev) => {
          const finalList = prev.map((c) => {
            if (c.id !== conv.id) return c;
            const autoTitle =
              c.title === 'New Conversation' || c.title === 'New chat'
                ? buildConversationTitleFromReply(finalText) ??
                  buildConversationTitleFromReply(lastUser?.content ?? '') ??
                  c.title
                : c.title;
            return {
              ...c,
              title: autoTitle,
              messages: c.messages.map((m) =>
                m.id === assistantId
                  ? { ...m, content: finalText, activitySteps }
                  : m,
              ),
              updatedAt: Date.now(),
            };
          });
          const target = finalList.find((c) => c.id === conv.id);
          void saveLocalConversations(finalList);
          if (target && user) {
            void syncConversationToCloud(user, target, vaultKey);
          }
          return finalList;
        });
        void summarizeConversationInBackground(conv.id, [
          ...history,
          { ...assistantPlaceholder, content: finalText, activitySteps },
        ]);
      },
    );
  };

  const handleRateChatMessage = (messageId: string, rating: MessageFeedback) => {
    const conv = activeConversation;
    const next = conversations.map((c) =>
      c.id === conv.id
        ? { ...c, messages: toggleMessageFeedback(c.messages, messageId, rating), updatedAt: Date.now() }
        : c,
    );
    const updated = next.find((c) => c.id === conv.id);
    persistConversations(next, updated);
  };

  const handleRegenerateChatMessage = async (assistantMessageId: string) => {
    if (isStreaming) return;
    const conv = activeConversation;
    const plan = prepareRegenerate(conv.messages, assistantMessageId);
    if (!plan) return;
    await runChatFromHistory(conv, plan.historyUpToUser);
  };

  const handleEditChatUserMessage = async (userMessageId: string, newContent: string) => {
    if (isStreaming) return;
    const conv = activeConversation;
    const plan = prepareEditResubmit(conv.messages, userMessageId, newContent);
    if (!plan) return;
    const resetTitle =
      plan.isFirstUserMessage && !conv.title.startsWith('Workspace Capabilities')
        ? 'New Conversation'
        : conv.title;
    await runChatFromHistory(conv, plan.historyWithEditedUser, resetTitle);
  };

  const runCompanionFromHistory = async (history: ChatMessage[]) => {
    const assistantId = `comp_${Date.now()}_a`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    };
    setCompanionMessages([...history, assistantMsg]);
    setCompanionState('thinking');

    await streamChatCompletion(
      history,
      assistantId,
      (partial, meta) => {
        const { cleanText, pose } = extractCompanionPose(partial);
        if (pose) {
          setCompanionState(pose);
        } else if (cleanText.length > 0) {
          setCompanionState('talking');
        }
        setCompanionMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: cleanText,
                  activitySteps: meta?.activitySteps ?? m.activitySteps,
                }
              : m,
          ),
        );
      },
      (finalRaw, activitySteps) => {
        const { cleanText, pose } = extractCompanionPose(finalRaw);
        setCompanionMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: cleanText, activitySteps }
              : m,
          ),
        );
        if (pose && pose !== 'idle') {
          setCompanionState(pose);
          setTimeout(() => setCompanionState('idle'), 2600);
        } else {
          setTimeout(() => setCompanionState('idle'), 1200);
        }
      },
      'companion',
    );
  };

  const handleRateCompanionMessage = (messageId: string, rating: MessageFeedback) => {
    setCompanionMessages((prev) => toggleMessageFeedback(prev, messageId, rating));
  };

  const handleRegenerateCompanionMessage = async (assistantMessageId: string) => {
    if (isStreaming) return;
    const plan = prepareRegenerate(companionMessages, assistantMessageId);
    if (!plan) return;
    await runCompanionFromHistory(plan.historyUpToUser);
  };

  const handleEditCompanionUserMessage = async (userMessageId: string, newContent: string) => {
    if (isStreaming) return;
    const plan = prepareEditResubmit(companionMessages, userMessageId, newContent);
    if (!plan) return;
    await runCompanionFromHistory(plan.historyWithEditedUser);
  };

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error ? err.message : 'Google sign-in failed.',
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
  };

  const handleEnablePassphraseE2EE = async (passphrase: string) => {
    const salt = generateSaltBase64();
    const key = await deriveVaultKey(passphrase, salt);
    const jwk = await exportKeyJwk(key);
    const fp = await computeKeyFingerprint(key);
    setVaultKey(key);
    setE2eeEnabled(true);
    setE2eeFingerprint(fp);
    saveLocalE2EEConfig(true, jwk, salt);
  };

  const handleEnableRandomVaultKey = async () => {
    const key = await generateDeviceVaultKey();
    const jwk = await exportKeyJwk(key);
    const fp = await computeKeyFingerprint(key);
    setVaultKey(key);
    setE2eeEnabled(true);
    setE2eeFingerprint(fp);
    saveLocalE2EEConfig(true, jwk, null);
  };

  const handleDisableE2EE = () => {
    setVaultKey(null);
    setE2eeEnabled(false);
    setE2eeFingerprint(null);
    saveLocalE2EEConfig(false, null, null);
  };

  const handleSyncDeviceMode = (
    platform: 'windows' | 'android' | 'web',
    companionMode: 'overlay' | 'background_service' | 'web_viewport',
  ) => {
    const devId =
      platform === 'windows'
        ? 'dev_windows_overlay'
        : platform === 'android'
          ? 'dev_android_service'
          : 'dev_web_browser';
    const nextDevices = devices.map((d) =>
      d.id === devId
        ? {
            ...d,
            companionMode,
            companionState,
            e2eeFingerprint: e2eeFingerprint ?? undefined,
            lastSyncAt: Date.now(),
          }
        : d,
    );
    setDevices(nextDevices);
    saveLocalDevices(nextDevices);
    const target = nextDevices.find((d) => d.id === devId);
    if (target && user) {
      void syncDevicePresence(user, target);
    }
  };

  const openSettingsTab = (tab: SettingsTabId) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const handleExportActiveChat = () => {
    const conv = activeConversation;
    const md = conv.messages
      .map((m) => `### ${m.role === 'user' ? 'You' : 'Luna'}\n\n${m.content}`)
      .join('\n\n---\n\n');
    const blob = new Blob([md || `# ${conv.title}\n`], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(conv.title || 'luna-chat').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllChats = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        conversations,
        companionMessages,
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `luna-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAllChats = () => {
    const fresh = createStarterConversations();
    persistConversations(fresh);
    setActiveConvId(fresh[0].id);
    setCompanionMessages([]);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = matchWorkspaceShortcut(e);
      if (!action) return;

      if (action === 'toggle_sidebar') {
        e.preventDefault();
        if (window.innerWidth >= 768) {
          setDesktopSidebarOpen((v) => !v);
        } else {
          setSidebarOpen((v) => !v);
        }
      } else if (action === 'new_chat') {
        e.preventDefault();
        setSettingsOpen(false);
        const id = `conv_${Date.now()}`;
        const newConv: Conversation = {
          id,
          title: 'New Conversation',
          mode: 'chat',
          providerId: activeProvider.id,
          modelId: activeProvider.modelId,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const next = [newConv, ...conversations];
        persistConversations(next, newConv);
        setActiveConvId(id);
        setMode('chat');
        saveLocalMode('chat');
        setSidebarOpen(false);
        requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>('[data-luna-composer="true"]')?.focus();
        });
      } else if (action === 'upload_files') {
        e.preventDefault();
        setSettingsOpen(false);
        if (mode !== 'chat') {
          setMode('chat');
          saveLocalMode('chat');
        }
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>('[data-luna-upload="true"]')?.click();
        });
      } else if (action === 'open_settings') {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      } else if (action === 'focus_composer') {
        e.preventDefault();
        setSettingsOpen(false);
        document.querySelector<HTMLTextAreaElement>('[data-luna-composer="true"]')?.focus();
      } else if (action === 'focus_history_search') {
        e.preventDefault();
        setSettingsOpen(false);
        setSearchBarOpen(true);
        if (window.innerWidth >= 768) {
          setDesktopSidebarOpen(true);
        } else {
          setSidebarOpen(true);
        }
        requestAnimationFrame(() => historySearchInputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeProvider.id, activeProvider.modelId, conversations, mode, persistConversations]);

  const handleToggleQuickLightDark = () => {
    const nextTheme: ThemeId = activeThemeIsDark ? 'daylight' : 'obsidian';
    setThemeId(nextTheme);
    saveLocalTheme(nextTheme);
  };

  const renderConversationRow = (conv: Conversation) => {
    const active = conv.id === activeConversation.id && mode === 'chat';
    const isPressed = pressedConvId === conv.id;
    const convProject = conv.projectId
      ? projects.find((p) => p.id === conv.projectId)
      : null;
    const clearLongPress = () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    return (
      <div
        key={conv.id}
        data-testid={`sidebar-conv-${conv.id}`}
        onContextMenu={(e) => {
          e.preventDefault();
          setPressedConvId((prev) => (prev === conv.id ? null : conv.id));
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('[data-conv-toggle], [data-conv-remove]')) {
            return;
          }
          longPressFiredRef.current = false;
          clearLongPress();
          longPressTimerRef.current = window.setTimeout(() => {
            longPressFiredRef.current = true;
            setPressedConvId((prev) => (prev === conv.id ? null : conv.id));
          }, 420);
        }}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        className="group rounded-xl px-2.5 py-1.5 text-[13px] transition-colors select-none"
        style={{
          backgroundColor:
            active || isPressed ? 'var(--app-elevated-bg)' : 'transparent',
        }}
      >
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (longPressFiredRef.current) {
                longPressFiredRef.current = false;
                return;
              }
              setActiveConvId(conv.id);
              handleModeChange('chat');
              setSidebarOpen(false);
            }}
            className="flex-1 flex items-center gap-2 text-left min-w-0 py-0.5"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                backgroundColor: active
                  ? 'var(--app-accent-hex)'
                  : 'var(--app-text-muted)',
                opacity: active ? 1 : 0.45,
              }}
            />
            <span className="truncate flex-1 font-normal">{conv.title}</span>
            {convProject && !activeProjectId && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0"
                style={{
                  backgroundColor: 'var(--app-canvas-bg)',
                  color: 'var(--app-text-muted)',
                }}
              >
                {convProject.name}
              </span>
            )}
          </button>

          <button
            type="button"
            data-conv-toggle="true"
            aria-label={`Options for '${conv.title}'`}
            aria-expanded={isPressed}
            onClick={(e) => {
              e.stopPropagation();
              setPressedConvId((prev) => (prev === conv.id ? null : conv.id));
            }}
            className={`p-1 rounded-lg transition-opacity shrink-0 ${
              isPressed
                ? 'opacity-100 bg-black/5 dark:bg-white/10'
                : 'opacity-55 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'
            }`}
            style={{ color: 'var(--app-text-muted)' }}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {isPressed && (
          <div
            data-testid={`sidebar-conv-actions-${conv.id}`}
            className="mt-1.5 pt-1.5 border-t flex items-center justify-end gap-1.5 animate-fade-up"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            <button
              type="button"
              onClick={() => handleTogglePinConversation(conv.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border hover:opacity-85"
              style={{
                borderColor: 'var(--app-border-color)',
                color: conv.pinned ? 'var(--app-accent-hex)' : 'var(--app-text-muted)',
              }}
            >
              <Pin className="w-3 h-3" />
              <span>{conv.pinned ? 'Unpin' : 'Pin'}</span>
            </button>
            <button
              type="button"
              data-conv-remove="true"
              aria-label={`Remove '${conv.title}'`}
              onClick={() => handleDeleteConversation(conv.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remove</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex flex-row w-screen overflow-hidden theme-transition"
      style={{
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
        maxHeight: viewportHeight ? `${viewportHeight}px` : '100dvh',
        backgroundColor: 'var(--app-canvas-bg)',
        color: 'var(--app-text-primary)',
      }}
    >
      <div
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-[1px] md:hidden transition-opacity duration-250 ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
      />

      {/* Claude-inspired Full-Height Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 md:static md:z-auto w-64 flex-col border-r shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarOpen ? 'flex translate-x-0 shadow-2xl md:shadow-none' : 'flex -translate-x-full md:translate-x-0'
        } ${desktopSidebarOpen ? 'md:flex' : 'md:hidden'}`}
        style={{
          borderColor: 'var(--app-border-color)',
          backgroundColor: 'var(--app-surface-bg)',
        }}
      >
          {/* Editorial Brand Header + Collapse */}
          <div className="px-3.5 pt-3.5 pb-2 flex items-center justify-between gap-2">
            <a
              href="#workspace"
              onClick={(e) => {
                e.preventDefault();
                handleModeChange('chat');
              }}
              className="flex items-center gap-2 text-lg font-editorial font-medium tracking-tight whitespace-nowrap px-1"
            >
              <img
                src="/luna-mark.svg"
                alt="Luna logo"
                className="w-5 h-5 rounded-md shrink-0"
              />
              <span>Luna</span>
            </a>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setDesktopSidebarOpen(false)}
                aria-label="Hide sidebar"
                title="Hide sidebar (Ctrl+B)"
                className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <PanelLeft className="w-4 h-4 icon-panel" />
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
                className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Primary Top Action List */}
          <nav
            aria-label="Primary workspace navigation"
            className="px-2.5 py-1 space-y-0.5 text-[13.5px]"
          >
            <button
              type="button"
              onClick={() => {
                handleCreateConversation();
                setSidebarOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl font-medium transition-colors text-left hover:bg-black/5 dark:hover:bg-white/[0.07]"
              style={{ color: 'var(--app-text-primary)' }}
            >
              <Plus className="w-4 h-4 shrink-0 icon-plus" />
              <span>New</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSearchBarOpen((prev) => !prev);
                requestAnimationFrame(() => historySearchInputRef.current?.focus());
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl font-normal transition-colors text-left hover:bg-black/5 dark:hover:bg-white/[0.06]"
              style={{
                backgroundColor: searchBarOpen ? 'var(--app-elevated-bg)' : 'transparent',
                color: searchBarOpen ? 'var(--app-text-primary)' : 'var(--app-text-muted)',
              }}
            >
              <Search className="w-4 h-4 shrink-0 icon-wiggle" />
              <span>Search</span>
            </button>

            <button
              type="button"
              aria-expanded={projectsPanelOpen}
              onClick={() => setProjectsPanelOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl font-normal transition-colors text-left hover:bg-black/5 dark:hover:bg-white/[0.06]"
              style={{
                backgroundColor:
                  projectsPanelOpen || activeProjectId
                    ? 'var(--app-elevated-bg)'
                    : 'transparent',
                color:
                  projectsPanelOpen || activeProjectId
                    ? 'var(--app-text-primary)'
                    : 'var(--app-text-muted)',
              }}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Folders className="w-4 h-4 shrink-0 icon-folder" />
                <span className="truncate">
                  {activeProject ? `Projects · ${activeProject.name}` : 'Projects'}
                </span>
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                  projectsPanelOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                handleModeChange('agent');
                setSidebarOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl font-normal transition-colors text-left hover:bg-black/5 dark:hover:bg-white/[0.06]"
              style={{
                backgroundColor:
                  mode === 'agent' ? 'var(--app-elevated-bg)' : 'transparent',
                color:
                  mode === 'agent'
                    ? 'var(--app-text-primary)'
                    : 'var(--app-text-muted)',
              }}
            >
              <Code2 className="w-4 h-4 shrink-0 icon-code" />
              <span>Agent</span>
            </button>

            <button
              type="button"
              onPointerEnter={() => setCompanionMounted(true)}
              onClick={() => {
                handleModeChange('companion');
                setSidebarOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl font-normal transition-colors text-left hover:bg-black/5 dark:hover:bg-white/[0.06]"
              style={{
                backgroundColor:
                  mode === 'companion'
                    ? 'var(--app-elevated-bg)'
                    : 'transparent',
                color:
                  mode === 'companion'
                    ? 'var(--app-text-primary)'
                    : 'var(--app-text-muted)',
              }}
            >
              <Sparkles className="w-4 h-4 shrink-0 icon-sparkle" />
              <span>Companion</span>
            </button>

            <button
              type="button"
              onClick={() => openSettingsTab('ai')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl font-normal transition-colors text-left hover:bg-black/5 dark:hover:bg-white/[0.06]"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <SlidersHorizontal className="w-4 h-4 shrink-0 icon-wiggle" />
              <span>Customize</span>
            </button>
          </nav>

          {/* Expandable Project Folders Drawer (for Agent & Chats) */}
          {projectsPanelOpen && (
            <div
              className="mx-2.5 mt-1 mb-1.5 rounded-2xl border p-2 space-y-1.5 animate-fade-up"
              style={{
                borderColor: 'var(--app-border-color)',
                backgroundColor: 'var(--app-canvas-bg)',
              }}
            >
              <div className="flex items-center justify-between px-1">
                <span
                  className="text-[11px] font-medium"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  Project folders
                </span>
                {activeProjectId && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveProjectId(null);
                      saveLocalActiveProjectId(null);
                    }}
                    className="text-[10px] hover:underline"
                    style={{ color: 'var(--app-accent-hex)' }}
                  >
                    Show all
                  </button>
                )}
              </div>

              <div className="space-y-0.5 max-h-36 overflow-y-auto">
                {projects.map((proj) => {
                  const selected = activeProjectId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-xl text-xs"
                      style={{
                        backgroundColor: selected
                          ? 'var(--app-elevated-bg)'
                          : 'transparent',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const nextId = selected ? null : proj.id;
                          setActiveProjectId(nextId);
                          saveLocalActiveProjectId(nextId);
                        }}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        <Folders
                          className="w-3.5 h-3.5 shrink-0 icon-folder"
                          style={{
                            color: selected
                              ? 'var(--app-accent-hex)'
                              : 'var(--app-text-muted)',
                          }}
                        />
                        <span className="truncate font-medium">{proj.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveProjectId(proj.id);
                          saveLocalActiveProjectId(proj.id);
                          handleModeChange('agent');
                        }}
                        title={`Open ${proj.name} in Agent`}
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-medium hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                        style={{ color: 'var(--app-accent-hex)' }}
                      >
                        Agent
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 pt-1 border-t" style={{ borderColor: 'var(--app-border-color)' }}>
                <input
                  type="text"
                  value={newProjectInput}
                  onChange={(e) => setNewProjectInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newProjectInput.trim()) {
                      e.preventDefault();
                      const created = handleCreateProject(newProjectInput);
                      if (created) {
                        setActiveProjectId(created.id);
                        saveLocalActiveProjectId(created.id);
                      }
                      setNewProjectInput('');
                    }
                  }}
                  placeholder="New project folder..."
                  aria-label="Create new project folder"
                  className="flex-1 min-w-0 bg-transparent px-2 py-1 text-[11px] rounded-lg focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!newProjectInput.trim()}
                  onClick={() => {
                    const created = handleCreateProject(newProjectInput);
                    if (created) {
                      setActiveProjectId(created.id);
                      saveLocalActiveProjectId(created.id);
                    }
                    setNewProjectInput('');
                  }}
                  aria-label="Add project folder"
                  className="p-1.5 rounded-lg disabled:opacity-35 hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: 'var(--app-accent-hex)' }}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Search input bar when Search toggled or actively filtering */}
          {(searchBarOpen || historyFilter.trim().length > 0) && (
            <div className="px-3 pt-1 pb-1.5 animate-fade-up">
              <div
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs border"
                style={{
                  backgroundColor: 'var(--app-canvas-bg)',
                  borderColor: 'var(--app-border-color)',
                }}
              >
                <Search
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--app-text-muted)' }}
                />
                <input
                  ref={historySearchInputRef}
                  type="text"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  placeholder="Filter chats..."
                  aria-label="Filter chat history"
                  className="w-full bg-transparent focus:outline-none text-xs"
                />
                {historyFilter && (
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('')}
                    aria-label="Clear filter"
                    className="p-0.5 rounded hover:opacity-80"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Pinned + Chats Scrollable Sections */}
          <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-3">
            {(pinnedProjects.length > 0 || pinnedConversations.length > 0) && (
              <div>
                <button
                  type="button"
                  onClick={() => setPinnedSectionOpen((v) => !v)}
                  className="w-full px-2 py-1 flex items-center gap-1 text-[11px] font-medium hover:opacity-85"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  <span>Pinned</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-150 ${
                      pinnedSectionOpen ? '' : '-rotate-90'
                    }`}
                  />
                </button>
                {pinnedSectionOpen && (
                  <div className="space-y-0.5 mt-0.5">
                    {pinnedProjects.map((proj) => {
                      const selected = activeProjectId === proj.id;
                      return (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            const nextId = selected ? null : proj.id;
                            setActiveProjectId(nextId);
                            saveLocalActiveProjectId(nextId);
                            handleModeChange(proj.defaultMode === 'agent' ? 'agent' : 'chat');
                          }}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] text-left hover:bg-black/5 dark:hover:bg-white/[0.06]"
                          style={{
                            backgroundColor: selected
                              ? 'var(--app-elevated-bg)'
                              : 'transparent',
                            color: 'var(--app-text-primary)',
                          }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Folders
                              className="w-3.5 h-3.5 shrink-0 icon-folder"
                              style={{ color: 'var(--app-text-muted)' }}
                            />
                            <span className="truncate font-medium">{proj.name}</span>
                          </span>
                          <span
                            className="text-[10px] shrink-0"
                            style={{ color: 'var(--app-text-muted)' }}
                          >
                            Project
                          </span>
                        </button>
                      );
                    })}
                    {pinnedConversations.map(renderConversationRow)}
                  </div>
                )}
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setChatsSectionOpen((v) => !v)}
                className="w-full px-2 py-1 flex items-center justify-between gap-1 text-[11px] font-medium hover:opacity-85"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <span className="flex items-center gap-1">
                  <span>Chats</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-150 ${
                      chatsSectionOpen ? '' : '-rotate-90'
                    }`}
                  />
                </span>
                {activeProject && (
                  <span className="text-[10px]" style={{ color: 'var(--app-accent-hex)' }}>
                    {activeProject.name}
                  </span>
                )}
              </button>
              {chatsSectionOpen && (
                <div className="space-y-0.5 mt-0.5">
                  {regularConversations.length > 0 ? (
                    regularConversations.map(renderConversationRow)
                  ) : (
                    <div
                      className="px-2.5 py-2 text-[11px]"
                      style={{ color: 'var(--app-text-muted)' }}
                    >
                      No chats in this filter yet.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Claude-style Sleek Account Footer + Popover */}
          <div
            className="relative p-2 border-t"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            {accountMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setAccountMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  aria-label="Account menu"
                  className="absolute left-2 right-2 bottom-full mb-2 z-40 rounded-2xl border p-1.5 shadow-2xl animate-popover-up space-y-0.5"
                  style={{
                    borderColor: 'var(--app-border-color)',
                    backgroundColor: 'var(--app-surface-bg)',
                    color: 'var(--app-text-primary)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      openSettingsTab('e2ee');
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
                  >
                    <Settings className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
                    <span>Account &amp; Vault</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      openSettingsTab('themes');
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
                    <span>Appearance &amp; Main Color</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      openSettingsTab('providers');
                    }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
                  >
                    <Check className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
                    <span>Models &amp; APIs</span>
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: 'var(--app-border-color)' }} />
                  {user ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void handleSignOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06] text-left text-rose-500"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log out</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void handleGoogleSignIn();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
                    >
                      <LogIn className="w-3.5 h-3.5" style={{ color: 'var(--app-accent-hex)' }} />
                      <span>Sign in with Google</span>
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
                className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors text-left"
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                  style={{ backgroundColor: 'var(--app-accent-hex)' }}
                >
                  {(uiPrefs.preferredName?.[0] || user?.displayName?.[0] || user?.email?.[0] || 'L').toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium truncate">
                    {uiPrefs.preferredName.trim() || user?.displayName || 'Luna User'}
                  </div>
                  <div
                    className="text-[11px] truncate"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    {e2eeEnabled ? 'Vault' : user ? 'Synced' : 'Local'}
                  </div>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                    accountMenuOpen ? 'rotate-180' : ''
                  }`}
                  style={{ color: 'var(--app-text-muted)' }}
                />
              </button>

              <button
                type="button"
                onClick={() => openSettingsTab('e2ee')}
                aria-label="Open workspace settings"
                title="Settings (Ctrl+,)"
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 hover:bg-black/5 dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <Settings className="w-4 h-4 icon-wiggle" />
              </button>
            </div>
          </div>
        </aside>

        {/* Right Main Column: Minimal Header + Active Mode Viewport */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          <header
            className="sticky top-0 z-30 flex items-center justify-between gap-3 px-3 sm:px-5 h-12 shrink-0 theme-transition"
            style={{
              backgroundColor: 'var(--app-canvas-bg)',
            }}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-label="Toggle navigation sidebar"
                aria-expanded={sidebarOpen}
                className="md:hidden w-8 h-8 rounded-lg flex flex-col items-center justify-center gap-[4px] hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
              >
                <span
                  className={`block w-4 h-[1.75px] rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    sidebarOpen ? 'translate-y-[5.75px] rotate-45' : ''
                  }`}
                />
                <span
                  className={`block w-4 h-[1.75px] rounded-full bg-current transition-all duration-200 ${
                    sidebarOpen ? 'opacity-0 scale-x-0' : 'opacity-100'
                  }`}
                />
                <span
                  className={`block w-4 h-[1.75px] rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    sidebarOpen ? '-translate-y-[5.75px] -rotate-45' : ''
                  }`}
                />
              </button>

              {!desktopSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setDesktopSidebarOpen(true)}
                  aria-label="Show sidebar"
                  title="Show sidebar (Ctrl+B)"
                  className="hidden md:inline-flex w-8 h-8 rounded-lg items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  <PanelLeft className="w-4 h-4 icon-panel" />
                </button>
              )}

              <button
                type="button"
                onClick={() => openSettingsTab('providers')}
                aria-label={`Switch model (${activeProvider.label})`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-medium hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors min-w-0"
              >
                <span
                  className={`font-editorial text-base font-medium tracking-tight shrink-0 ${
                    desktopSidebarOpen ? 'md:hidden' : ''
                  }`}
                >
                  Luna
                </span>
                <span
                  className="text-[13px] font-medium truncate max-w-[160px] sm:max-w-[260px]"
                  style={{ color: 'var(--app-text-primary)' }}
                >
                  {activeProvider.label}
                </span>
                <ChevronDown
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--app-text-muted)' }}
                />
              </button>

              {activeProject && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border"
                  style={{
                    borderColor: 'var(--app-border-color)',
                    backgroundColor: 'var(--app-surface-bg)',
                    color: 'var(--app-text-muted)',
                  }}
                >
                  <Folders className="w-3 h-3" style={{ color: 'var(--app-accent-hex)' }} />
                  <span>{activeProject.name}</span>
                  <button
                    type="button"
                    aria-label={`Clear active project ${activeProject.name}`}
                    onClick={() => {
                      setActiveProjectId(null);
                      saveLocalActiveProjectId(null);
                    }}
                    className="hover:opacity-80"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!desktopSidebarOpen && (
                <button
                  type="button"
                  onClick={() => handleCreateConversation()}
                  aria-label="New chat"
                  title="New chat (Ctrl+Shift+O)"
                  className="hidden md:inline-flex w-8 h-8 rounded-lg items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  <SquarePen className="w-4 h-4 icon-pen" />
                </button>
              )}
              <button
                type="button"
                onClick={() => handleCreateConversation()}
                aria-label="Start new chat"
                className="md:hidden w-8 h-8 rounded-lg inline-flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <SquarePen className="w-4 h-4 icon-pen" />
              </button>
              <button
                type="button"
                onClick={handleToggleQuickLightDark}
                aria-label={activeThemeIsDark ? 'Switch to Light UI' : 'Switch to Dark UI'}
                title={activeThemeIsDark ? 'Switch to Light UI' : 'Switch to Dark UI'}
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: 'var(--app-text-muted)' }}
              >
                {activeThemeIsDark ? (
                  <Sun className="w-4 h-4 icon-sparkle" />
                ) : (
                  <Moon className="w-4 h-4 icon-wiggle" />
                )}
              </button>
            </div>
          </header>

          {authError && (
            <div className="px-4 py-2 bg-rose-950/90 text-rose-200 text-xs flex items-center justify-between border-b border-rose-800">
              <span>{authError}</span>
              <button
                type="button"
                onClick={() => setAuthError(null)}
                aria-label="Dismiss auth error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Active Mode Viewport */}
          <main className="flex-1 min-w-0 min-h-0 relative">
          {mode === 'chat' && (
            <ChatWorkspace
              conversation={activeConversation}
              allConversations={conversations}
              providers={providers}
              activeProvider={activeProvider}
              projects={projects}
              isStreaming={isStreaming}
              highThinking={highThinking}
              webSearch={webSearch}
              useDocContext={useDocContext}
              e2eeEnabled={e2eeEnabled}
              userName={uiPrefs.preferredName.trim() || user?.displayName?.split(' ')[0] || null}
              enterToSend={uiPrefs.enterToSend}
              ttsOptions={{
                rate: uiPrefs.ttsRate,
                pitch: uiPrefs.ttsPitch,
                voiceName: uiPrefs.ttsVoiceName || undefined,
              }}
              activeThemeId={themeId}
              activeAccentHex={uiPrefs.accentHex || getTheme(themeId).accentHex}
              activePersona={uiPrefs.aiPersona}
              onSelectProvider={(id) => {
                setActiveProviderId(id);
                saveLocalProviders(providers, id);
              }}
              onSelectTheme={(id) => {
                setThemeId(id);
                saveLocalTheme(id);
              }}
              onSelectAccent={(hex) => {
                const next = { ...uiPrefs, accentHex: hex };
                setUiPrefs(next);
                saveLocalUiPrefs(next);
              }}
              onSelectPersona={(persona) => {
                const next = { ...uiPrefs, aiPersona: persona };
                setUiPrefs(next);
                saveLocalUiPrefs(next);
              }}
              onAssignProject={(projectId) =>
                handleAssignConversationProject(activeConversation.id, projectId)
              }
              onCreateProject={(name) => {
                const created = handleCreateProject(name);
                if (created) {
                  handleAssignConversationProject(activeConversation.id, created.id);
                }
              }}
              onExportActiveChat={handleExportActiveChat}
              onToggleHighThinking={() => setHighThinking((v) => !v)}
              onToggleWebSearch={() => setWebSearch((v) => !v)}
              onToggleUseDocContext={() => setUseDocContext((v) => !v)}
              onSendMessage={(text, imgs, files) =>
                void handleSendChatMessage(text, imgs, files)
              }
              onStopStreaming={() => streamAbortRef.current?.abort()}
              onRateMessage={handleRateChatMessage}
              onRegenerateMessage={(id) => void handleRegenerateChatMessage(id)}
              onEditUserMessage={(id, nextText) => void handleEditChatUserMessage(id, nextText)}
              onOpenProviders={() => openSettingsTab('providers')}
              onOpenAgentSandbox={() => handleModeChange('agent')}
              onRunInSandbox={(code, lang) => {
                setSandboxCode(code);
                setSandboxLang(lang === 'html' ? 'html' : 'javascript');
                handleModeChange('agent');
              }}
            />
          )}

          {mode === 'agent' && (
            <AgentWorkspace
              activeProvider={activeProvider}
              activeTheme={themeId}
              activeProject={activeProject}
              customInstructions={uiPrefs.customInstructions}
              messages={agentMessages}
              allConversations={conversations}
              enterToSend={uiPrefs.enterToSend}
              showSuggestions={uiPrefs.showSuggestions}
              soundEffects={uiPrefs.soundEffects}
              autoReadAloud={uiPrefs.autoReadAloud}
              onChangeMessages={setAgentMessages}
              documents={documents}
              onAddDocument={(doc) => {
                const next = [doc, ...documents];
                setDocuments(next);
                void saveLocalDocuments(next);
                if (user) void syncDocumentToCloud(user, doc, vaultKey);
              }}
              onDeleteDocument={(id) => {
                const next = documents.filter((d) => d.id !== id);
                setDocuments(next);
                void saveLocalDocuments(next);
              }}
              sandboxCode={sandboxCode}
              sandboxLang={sandboxLang}
              onChangeSandbox={(c, l) => {
                setSandboxCode(c);
                setSandboxLang(l);
              }}
              onSelectTheme={(id) => {
                setThemeId(id);
                saveLocalTheme(id);
              }}
              onSetCompanionState={setCompanionState}
            />
          )}

          {companionMounted && (
            <div
              className={
                mode === 'companion'
                  ? 'h-full w-full'
                  : 'absolute inset-0 pointer-events-none opacity-0 invisible -z-10'
              }
              aria-hidden={mode !== 'companion'}
            >
              <CompanionWorkspace
                animState={companionState}
                messages={companionMessages}
                isStreaming={isStreaming}
                devices={devices}
                e2eeFingerprint={e2eeFingerprint}
                overlayEnabled={overlayEnabled}
                enterToSend={uiPrefs.enterToSend}
                isDark={activeThemeIsDark}
                active={mode === 'companion'}
                ttsOptions={{
                  rate: uiPrefs.ttsRate,
                  pitch: uiPrefs.ttsPitch,
                  voiceName: uiPrefs.ttsVoiceName || undefined,
                }}
                onToggleOverlay={() => setOverlayEnabled((v) => !v)}
                onSetCompanionState={setCompanionState}
                onSendCompanionMessage={(text) =>
                  void handleSendCompanionMessage(text)
                }
                onRateMessage={handleRateCompanionMessage}
                onRegenerateMessage={(id) => void handleRegenerateCompanionMessage(id)}
                onEditUserMessage={(id, nextText) => void handleEditCompanionUserMessage(id, nextText)}
                onSyncDeviceMode={handleSyncDeviceMode}
              />
            </div>
          )}
        </main>
      </div>

      {/* Movable Always-on-Top Companion Overlay */}
      {overlayEnabled && (
        <div
          className="fixed z-50 w-56 h-68 rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
          style={{
            left: `${overlayPos.x}px`,
            top: `${overlayPos.y}px`,
            borderColor: 'var(--app-border-color)',
            backgroundColor: activeThemeIsDark ? '#2a2a28' : '#d6dce9',
          }}
          data-testid="desktop-companion-overlay"
        >
          <div
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              dragStateRef.current = {
                dragging: true,
                offsetX: e.clientX - overlayPos.x,
                offsetY: e.clientY - overlayPos.y,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragStateRef.current.dragging) return;
              const nextX = Math.max(
                8,
                Math.min(
                  window.innerWidth - 232,
                  e.clientX - dragStateRef.current.offsetX,
                ),
              );
              const nextY = Math.max(
                8,
                Math.min(
                  window.innerHeight - 280,
                  e.clientY - dragStateRef.current.offsetY,
                ),
              );
              setOverlayPos({ x: nextX, y: nextY });
            }}
            onPointerUp={(e) => {
              dragStateRef.current.dragging = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            className="flex items-center justify-between px-3 py-1.5 border-b border-slate-300/60 bg-slate-200/90 text-slate-700 text-[11px] cursor-grab active:cursor-grabbing select-none touch-none"
            data-testid="overlay-drag-handle"
          >
            <div className="flex items-center gap-1.5 font-medium">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Luna · {companionState.replace('_', ' ')}</span>
            </div>
            <button
              type="button"
              onClick={() => setOverlayEnabled(false)}
              aria-label="Close companion overlay"
              className="p-0.5 rounded hover:bg-slate-300/60 text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Companion3DCanvas animState={companionState} compact isDark={activeThemeIsDark} />
          </div>
        </div>
      )}

      {/* Full-Screen Settings Studio */}
      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        user={user}
        devices={devices}
        onSignIn={() => void handleGoogleSignIn()}
        onSignOut={() => void handleSignOut()}
        activeThemeId={themeId}
        onSelectTheme={(id) => {
          setThemeId(id);
          saveLocalTheme(id);
        }}
        uiPrefs={uiPrefs}
        onChangeUiPrefs={(nextPrefs) => {
          setUiPrefs(nextPrefs);
          saveLocalUiPrefs(nextPrefs);
        }}
        highThinking={highThinking}
        onToggleHighThinking={() => setHighThinking((v) => !v)}
        webSearch={webSearch}
        onToggleWebSearch={() => setWebSearch((v) => !v)}
        useDocContext={useDocContext}
        onToggleUseDocContext={() => setUseDocContext((v) => !v)}
        providers={providers}
        activeProviderId={activeProviderId}
        onSelectProvider={(id) => {
          setActiveProviderId(id);
          saveLocalProviders(providers, id);
        }}
        onUpdateProvider={(updated) => {
          const next = providers.map((p) =>
            p.id === updated.id ? updated : p,
          );
          setProviders(next);
          saveLocalProviders(next, activeProviderId);
        }}
        onAddCustomProvider={(newProv) => {
          const next = [...providers, newProv];
          setProviders(next);
          setActiveProviderId(newProv.id);
          saveLocalProviders(next, newProv.id);
        }}
        onDeleteCustomProvider={(id) => {
          const next = providers.filter((p) => p.id !== id);
          const nextActive = activeProviderId === id ? 'gemini-flash' : activeProviderId;
          setProviders(next);
          setActiveProviderId(nextActive);
          saveLocalProviders(next, nextActive);
        }}
        e2eeEnabled={e2eeEnabled}
        e2eeFingerprint={e2eeFingerprint}
        onEnableE2EEPassphrase={handleEnablePassphraseE2EE}
        onEnableRandomVaultKey={handleEnableRandomVaultKey}
        onDisableE2EE={handleDisableE2EE}
        stats={{
          conversationCount: conversations.length,
          documentCount: documents.length,
          companionTurnCount: companionMessages.length,
        }}
        onExportActiveChat={handleExportActiveChat}
        onExportAllChats={handleExportAllChats}
        onClearAllChats={handleClearAllChats}
      />
    </div>
  );
}
