import type { ContextDocument } from '../utils/contextSearch';
import type {
  ChatMessage,
  Conversation,
  DeviceSyncNode,
  ProjectFolder,
  ProviderConfig,
  WorkspaceMode,
} from '../types/workspace';
import { createStarterProjects } from '../utils/projects';
import { DEFAULT_UI_PREFS, type ThemeId, type UiPreferences } from '../utils/themes';

const DB_NAME = 'aetheris_offline_vault_v1';
const DB_VERSION = 1;
const STORE_KV = 'kv_store';

const KEY_CONVERSATIONS = 'aetheris_conversations';
const KEY_DOCUMENTS = 'aetheris_documents';
const KEY_PROVIDERS = 'aetheris_providers';
const KEY_ACTIVE_PROVIDER = 'aetheris_active_provider';
const KEY_THEME = 'aetheris_theme';
const KEY_MODE = 'aetheris_mode';
const KEY_E2EE_ENABLED = 'aetheris_e2ee_enabled';
const KEY_E2EE_JWK = 'aetheris_e2ee_jwk';
const KEY_E2EE_SALT = 'aetheris_e2ee_salt';
const KEY_DEVICES = 'aetheris_devices';
const KEY_SYNC_QUEUE = 'aetheris_sync_queue';
const KEY_UI_PREFS = 'aetheris_ui_prefs';
const KEY_ACTIVE_CONV_ID = 'luna_active_conv_id';
const KEY_COMPANION_MESSAGES = 'luna_companion_messages_v1';
const KEY_WORKSPACE_PREFS = 'luna_workspace_prefs_v1';
const KEY_PROJECTS = 'luna_projects_v1';
const KEY_ACTIVE_PROJECT_ID = 'luna_active_project_id_v1';

export interface WorkspaceRuntimePrefs {
  highThinking: boolean;
  webSearch: boolean;
  useDocContext: boolean;
  overlayEnabled: boolean;
}

export const DEFAULT_WORKSPACE_PREFS: WorkspaceRuntimePrefs = {
  highThinking: false,
  webSearch: false,
  useDocContext: false,
  overlayEnabled: false,
};

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini-flash',
    label: 'Google Gemini 4 Hydrogen',
    providerType: 'gemini',
    modelId: 'gemini-4-hydrogen',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    suggestedModels: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
    description: 'Multimodal reasoning, vision, and Google Search grounding (built-in server key).',
  },
  {
    id: 'gemini-lite',
    label: 'Google Gemini 3.1 Flash Lite',
    providerType: 'gemini',
    modelId: 'gemini-3.1-flash-lite',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    suggestedModels: ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
    description: 'Ultra-fast everyday responses & summaries (built-in server key).',
  },
  {
    id: 'openrouter-api',
    label: 'OpenRouter',
    providerType: 'openai_compatible',
    modelId: 'openai/gpt-4o-mini',
    endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    suggestedModels: [
      'openai/gpt-4o-mini',
      'anthropic/claude-sonnet-4',
      'deepseek/deepseek-chat-v3-0324',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    description: 'Unified API gateway to 200+ models with one API key.',
  },
  {
    id: 'openai-custom',
    label: 'OpenAI',
    providerType: 'openai_compatible',
    modelId: 'gpt-4o-mini',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/models',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o4-mini', 'gpt-4.1'],
    description: 'Official OpenAI Chat Completions API.',
  },
  {
    id: 'anthropic-custom',
    label: 'Anthropic Claude',
    providerType: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    endpointUrl: 'https://api.anthropic.com/v1/messages',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com/',
    suggestedModels: [
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-latest',
      'claude-3-5-haiku-latest',
    ],
    description: 'Official Anthropic Messages API.',
  },
  {
    id: 'groq-api',
    label: 'Groq',
    providerType: 'openai_compatible',
    modelId: 'llama-3.3-70b-versatile',
    endpointUrl: 'https://api.groq.com/openai/v1/chat/completions',
    apiKeyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs/models',
    suggestedModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'qwen/qwen3-32b',
    ],
    description: 'High-speed LPU inference for Llama & Qwen models.',
  },
  {
    id: 'deepseek-api',
    label: 'DeepSeek',
    providerType: 'openai_compatible',
    modelId: 'deepseek-chat',
    endpointUrl: 'https://api.deepseek.com/chat/completions',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    description: 'DeepSeek V3 & R1 reasoning API.',
  },
  {
    id: 'mistral-api',
    label: 'Mistral AI',
    providerType: 'openai_compatible',
    modelId: 'mistral-small-latest',
    endpointUrl: 'https://api.mistral.ai/v1/chat/completions',
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    docsUrl: 'https://docs.mistral.ai/',
    suggestedModels: [
      'mistral-small-latest',
      'mistral-large-latest',
      'codestral-latest',
    ],
    description: 'Mistral & Codestral European frontier models.',
  },
  {
    id: 'xai-api',
    label: 'xAI Grok',
    providerType: 'openai_compatible',
    modelId: 'grok-3-mini',
    endpointUrl: 'https://api.x.ai/v1/chat/completions',
    apiKeyUrl: 'https://console.x.ai/',
    docsUrl: 'https://docs.x.ai/',
    suggestedModels: ['grok-3-mini', 'grok-3-latest'],
    description: 'xAI Grok OpenAI-compatible API.',
  },
  {
    id: 'local-ollama',
    label: 'Local Ollama / LM Studio',
    providerType: 'ollama',
    modelId: 'llama3.2',
    endpointUrl: 'http://localhost:11434/api/chat',
    docsUrl: 'https://ollama.com/library',
    suggestedModels: ['llama3.2', 'qwen2.5-coder', 'mistral', 'gemma3'],
    description: 'Private local inference on your machine (no key required).',
  },
];

export const STARTER_DOCUMENTS: ContextDocument[] = [
  {
    id: 'doc_arch_overview',
    title: 'Luna Workspace Notes.md',
    docType: 'document',
    language: 'markdown',
    content: `# Luna Workspace Notes
- Local Vault: IndexedDB + localStorage keeps offline access to conversations and notes.
- End-to-End Encryption: AES-256-GCM encryption via Web Crypto API with PBKDF2-SHA256.`,
    updatedAt: Date.now() - 3600_000,
  },
];

export const STARTER_DEVICES: DeviceSyncNode[] = [
  {
    id: 'dev_web_browser',
    deviceName: 'Web Workspace (This Browser)',
    platform: 'web',
    companionMode: 'web_viewport',
    companionState: 'idle',
    lastSyncAt: Date.now(),
  },
  {
    id: 'dev_windows_overlay',
    deviceName: 'Windows Desktop Overlay',
    platform: 'windows',
    companionMode: 'overlay',
    companionState: 'idle',
    lastSyncAt: 0,
  },
  {
    id: 'dev_android_service',
    deviceName: 'Android Companion Service',
    platform: 'android',
    companionMode: 'background_service',
    companionState: 'idle',
    lastSyncAt: 0,
  },
];

export function createStarterConversations(): Conversation[] {
  const now = Date.now();
  return [
    {
      id: 'conv_new_default',
      title: 'New chat',
      mode: 'chat',
      providerId: 'gemini-flash',
      modelId: 'gemini-4-hydrogen',
      createdAt: now,
      updatedAt: now,
      messages: [],
    },
  ];
}

function mergeProviderCatalog(stored: ProviderConfig[]): ProviderConfig[] {
  const byId = new Map<string, ProviderConfig>();
  for (const p of stored) {
    if (p.id === 'gemini-argon' || p.id === 'gemini-carbon') continue;
    const catalogMatch = DEFAULT_PROVIDERS.find((d) => d.id === p.id);
    const migratedModel =
      p.providerType === 'gemini' && p.modelId === 'gemini-3.8-flash'
        ? 'gemini-4-hydrogen'
        : p.modelId;
    byId.set(p.id, {
      ...(catalogMatch ?? {}),
      ...p,
      // Always keep curated links, descriptions, and updated Gemini labels/models fresh
      label: p.providerType === 'gemini' && catalogMatch ? catalogMatch.label : p.label,
      modelId: migratedModel,
      customApiKey: p.providerType === 'gemini' ? undefined : p.customApiKey,
      apiKeyUrl: p.apiKeyUrl ?? catalogMatch?.apiKeyUrl,
      docsUrl: p.docsUrl ?? catalogMatch?.docsUrl,
      suggestedModels: p.suggestedModels ?? catalogMatch?.suggestedModels,
      description: p.description ?? catalogMatch?.description,
    });
  }

  const mergedDefaults = DEFAULT_PROVIDERS.map((def) => byId.get(def.id) ?? def);
  const customOnly = Array.from(byId.values()).filter(
    (p) => !DEFAULT_PROVIDERS.some((d) => d.id === p.id),
  );
  return [...mergedDefaults, ...customOnly];
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readonly');
      const store = tx.objectStore(STORE_KV);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getSavedThemeSync(): ThemeId {
  return lsGet<ThemeId>(KEY_THEME, 'obsidian');
}

export function getSavedUiPrefsSync(): UiPreferences {
  const stored = lsGet<Partial<UiPreferences>>(KEY_UI_PREFS, {});
  return { ...DEFAULT_UI_PREFS, ...stored };
}

export function getSavedModeSync(): WorkspaceMode {
  return lsGet<WorkspaceMode>(KEY_MODE, 'chat');
}

export function getSavedActiveConvIdSync(): string | null {
  return lsGet<string | null>(KEY_ACTIVE_CONV_ID, null);
}

export function getSavedCompanionMessagesSync(): ChatMessage[] {
  const stored = lsGet<ChatMessage[]>(KEY_COMPANION_MESSAGES, []);
  return Array.isArray(stored) ? stored : [];
}

export function getSavedWorkspacePrefsSync(): WorkspaceRuntimePrefs {
  const stored = lsGet<Partial<WorkspaceRuntimePrefs>>(KEY_WORKSPACE_PREFS, {});
  return { ...DEFAULT_WORKSPACE_PREFS, ...stored };
}

export function getSavedProjectsSync(): ProjectFolder[] {
  const stored = lsGet<ProjectFolder[]>(KEY_PROJECTS, []);
  return Array.isArray(stored) && stored.length > 0 ? stored : createStarterProjects();
}

export function getSavedActiveProjectIdSync(): string | null {
  return lsGet<string | null>(KEY_ACTIVE_PROJECT_ID, null);
}

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or private browsing; IndexedDB handles larger payloads
  }
}

export async function loadLocalState(): Promise<{
  conversations: Conversation[];
  documents: ContextDocument[];
  providers: ProviderConfig[];
  activeProviderId: string;
  themeId: ThemeId;
  uiPrefs: UiPreferences;
  mode: WorkspaceMode;
  e2eeEnabled: boolean;
  e2eeJwk: JsonWebKey | null;
  e2eeSalt: string | null;
  devices: DeviceSyncNode[];
}> {
  const [idbConvs, idbDocs] = await Promise.all([
    idbGet<Conversation[]>(KEY_CONVERSATIONS),
    idbGet<ContextDocument[]>(KEY_DOCUMENTS),
  ]);

  const lsConvs = lsGet<Conversation[] | null>(KEY_CONVERSATIONS, null);
  const lsDocs = lsGet<ContextDocument[] | null>(KEY_DOCUMENTS, null);

  const rawConvs =
    idbConvs && idbConvs.length > 0 ? idbConvs : lsConvs;
  const cleanedConvs = rawConvs
    ? rawConvs.filter(
        (c) =>
          !(
            c.id === 'conv_welcome' &&
            !c.messages.some((m) => m.role === 'user')
          ),
      )
    : null;
  const conversations =
    cleanedConvs && cleanedConvs.length > 0
      ? cleanedConvs
      : createStarterConversations();

  const documents =
    (idbDocs && idbDocs.length > 0 ? idbDocs : lsDocs) ?? STARTER_DOCUMENTS;

  const storedProviders = lsGet<ProviderConfig[]>(KEY_PROVIDERS, DEFAULT_PROVIDERS);
  const providers = mergeProviderCatalog(
    Array.isArray(storedProviders) ? storedProviders : DEFAULT_PROVIDERS,
  );
  const storedActiveId = lsGet<string>(KEY_ACTIVE_PROVIDER, 'gemini-flash');
  const activeProviderId =
    storedActiveId === 'gemini-argon' ||
    storedActiveId === 'gemini-carbon' ||
    !providers.some((p) => p.id === storedActiveId)
      ? 'gemini-flash'
      : storedActiveId;
  const themeId = lsGet<ThemeId>(KEY_THEME, 'obsidian');
  const uiPrefs = getSavedUiPrefsSync();
  const mode = lsGet<WorkspaceMode>(KEY_MODE, 'chat');
  const e2eeEnabled = lsGet<boolean>(KEY_E2EE_ENABLED, false);
  const e2eeJwk = lsGet<JsonWebKey | null>(KEY_E2EE_JWK, null);
  const e2eeSalt = lsGet<string | null>(KEY_E2EE_SALT, null);
  const devices = lsGet<DeviceSyncNode[]>(KEY_DEVICES, STARTER_DEVICES);

  return {
    conversations,
    documents,
    providers,
    activeProviderId,
    themeId,
    uiPrefs,
    mode,
    e2eeEnabled,
    e2eeJwk,
    e2eeSalt,
    devices,
  };
}

export async function saveLocalConversations(convs: Conversation[]): Promise<void> {
  lsSet(KEY_CONVERSATIONS, convs);
  await idbSet(KEY_CONVERSATIONS, convs);
}

export async function saveLocalDocuments(docs: ContextDocument[]): Promise<void> {
  lsSet(KEY_DOCUMENTS, docs);
  await idbSet(KEY_DOCUMENTS, docs);
}

export function saveLocalProviders(providers: ProviderConfig[], activeId: string): void {
  lsSet(KEY_PROVIDERS, providers);
  lsSet(KEY_ACTIVE_PROVIDER, activeId);
}

export function saveLocalTheme(themeId: ThemeId): void {
  lsSet(KEY_THEME, themeId);
}

export function saveLocalUiPrefs(prefs: UiPreferences): void {
  lsSet(KEY_UI_PREFS, prefs);
}

export function saveLocalMode(mode: WorkspaceMode): void {
  lsSet(KEY_MODE, mode);
}

export function saveLocalE2EEConfig(
  enabled: boolean,
  jwk: JsonWebKey | null,
  salt: string | null,
): void {
  lsSet(KEY_E2EE_ENABLED, enabled);
  lsSet(KEY_E2EE_JWK, jwk);
  lsSet(KEY_E2EE_SALT, salt);
}

export function saveLocalDevices(devices: DeviceSyncNode[]): void {
  lsSet(KEY_DEVICES, devices);
}

export function saveLocalActiveConvId(convId: string): void {
  lsSet(KEY_ACTIVE_CONV_ID, convId);
}

export function saveLocalCompanionMessages(msgs: ChatMessage[]): void {
  const trimmed = msgs.slice(-60);
  lsSet(KEY_COMPANION_MESSAGES, trimmed);
  void idbSet(KEY_COMPANION_MESSAGES, trimmed);
}

export function saveLocalWorkspacePrefs(prefs: WorkspaceRuntimePrefs): void {
  lsSet(KEY_WORKSPACE_PREFS, prefs);
}

export function saveLocalProjects(projects: ProjectFolder[]): void {
  lsSet(KEY_PROJECTS, projects);
  void idbSet(KEY_PROJECTS, projects);
}

export function saveLocalActiveProjectId(projectId: string | null): void {
  lsSet(KEY_ACTIVE_PROJECT_ID, projectId);
}

export interface PendingSyncOp {
  id: string;
  kind: 'conversation' | 'document' | 'device';
  payload: unknown;
  createdAt: number;
}

export function enqueueOfflineSync(op: PendingSyncOp): void {
  const queue = lsGet<PendingSyncOp[]>(KEY_SYNC_QUEUE, []);
  const filtered = queue.filter((q) => !(q.kind === op.kind && q.id === op.id));
  filtered.push(op);
  lsSet(KEY_SYNC_QUEUE, filtered);
}

export function popOfflineSyncQueue(): PendingSyncOp[] {
  const queue = lsGet<PendingSyncOp[]>(KEY_SYNC_QUEUE, []);
  lsSet(KEY_SYNC_QUEUE, []);
  return queue;
}
