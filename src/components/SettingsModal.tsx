import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  KeyRound,
  Keyboard as KeyboardIcon,
  Lock,
  LogIn,
  LogOut,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Unlock,
  User as UserIcon,
  Volume2,
  X,
} from 'lucide-react';
import type {
  DeviceSyncNode,
  ProviderConfig,
} from '../types/workspace';
import { playStreamCompletePing } from '../utils/audioEffects';
import { WORKSPACE_SHORTCUTS } from '../utils/shortcuts';
import {
  listAvailableVoices,
  speakAssistantMessage,
  stopSpeaking,
} from '../utils/tts';
import {
  ACCENT_PRESETS,
  DEFAULT_UI_PREFS,
  WORKSPACE_THEMES,
  type AiPersonaId,
  type ThemeId,
  type UiPreferences,
} from '../utils/themes';

export type SettingsTabId =
  | 'e2ee'
  | 'themes'
  | 'ai'
  | 'providers'
  | 'voice'
  | 'keyboard'
  | 'data';

interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTabId;
  onClose: () => void;
  user?: User | null;
  devices?: DeviceSyncNode[];
  onSignIn?: () => void;
  onSignOut?: () => void;
  activeThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  uiPrefs: UiPreferences;
  onChangeUiPrefs: (prefs: UiPreferences) => void;
  highThinking: boolean;
  onToggleHighThinking: () => void;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  useDocContext: boolean;
  onToggleUseDocContext: () => void;
  providers: ProviderConfig[];
  activeProviderId: string;
  onSelectProvider: (id: string) => void;
  onUpdateProvider: (updated: ProviderConfig) => void;
  onAddCustomProvider: (provider: ProviderConfig) => void;
  onDeleteCustomProvider?: (id: string) => void;
  e2eeEnabled: boolean;
  e2eeFingerprint: string | null;
  onEnableE2EEPassphrase: (passphrase: string) => Promise<void>;
  onEnableRandomVaultKey: () => Promise<void>;
  onDisableE2EE: () => void;
  stats?: {
    conversationCount: number;
    documentCount: number;
    companionTurnCount: number;
  };
  onExportActiveChat?: () => void;
  onExportAllChats?: () => void;
  onClearAllChats?: () => void;
}

const PERSONA_OPTIONS: Array<{
  id: AiPersonaId;
  title: string;
  desc: string;
  temp: number;
}> = [
  { id: 'balanced', title: 'Balanced', desc: 'Clear, adaptable, and grounded', temp: 0.7 },
  { id: 'concise', title: 'Concise', desc: 'Direct answers, zero filler', temp: 0.4 },
  { id: 'coder', title: 'Coder', desc: 'TypeScript-first, types & edge cases', temp: 0.3 },
  { id: 'creative', title: 'Creative', desc: 'Vivid ideas & expressive prose', temp: 1.0 },
  { id: 'tutor', title: 'Tutor', desc: 'Patient step-by-step guidance', temp: 0.6 },
];

const QUICK_INSTRUCTION_CHIPS: Array<{ label: string; text: string }> = [
  { label: 'TypeScript first', text: 'Prefer strict TypeScript with clean types and practical examples.' },
  { label: 'Bullet takeaways', text: 'Lead with a 2-sentence TL;DR, then concise bullet points.' },
  { label: 'Explain why', text: 'Briefly explain trade-offs behind technical choices.' },
  { label: 'Simple English', text: 'Use plain, everyday language without unnecessary jargon.' },
];

const CATEGORIES: Array<{
  id: SettingsTabId;
  section: 0 | 1 | 2;
  label: string;
  shortLabel: string;
  keywords: string;
}> = [
  {
    id: 'e2ee',
    section: 0,
    label: 'Account',
    shortLabel: 'Account',
    keywords: 'account name profile google sign in sync devices encryption aes vault passphrase key',
  },
  {
    id: 'themes',
    section: 1,
    label: 'Appearance',
    shortLabel: 'Appearance',
    keywords: 'dark light color mode theme preset accent main color font size width ui',
  },
  {
    id: 'ai',
    section: 1,
    label: 'Personalization',
    shortLabel: 'AI',
    keywords: 'persona tone instructions prompt temperature tokens thinking search memory summary',
  },
  {
    id: 'providers',
    section: 1,
    label: 'Models & APIs',
    shortLabel: 'Models',
    keywords: 'gemini openrouter openai anthropic claude groq deepseek mistral ollama api key model',
  },
  {
    id: 'voice',
    section: 1,
    label: 'Voice & Audio',
    shortLabel: 'Voice',
    keywords: 'tts speech chime sound ping read aloud rate pitch voice',
  },
  {
    id: 'keyboard',
    section: 1,
    label: 'Keyboard',
    shortLabel: 'Keys',
    keywords: 'keyboard shortcut hotkey keybinding enter send sidebar upload new chat focus',
  },
  {
    id: 'data',
    section: 2,
    label: 'Data & Privacy',
    shortLabel: 'Data',
    keywords: 'export markdown json backup clear reset storage chats privacy delete',
  },
];

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2"
      style={{
        backgroundColor: checked
          ? 'var(--app-accent-hex)'
          : 'var(--app-border-color)',
      }}
    >
      <span
        className={`inline-block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

export function SettingsModal({
  open,
  initialTab = 'e2ee',
  onClose,
  user,
  devices = [],
  onSignIn,
  onSignOut,
  activeThemeId,
  onSelectTheme,
  uiPrefs,
  onChangeUiPrefs,
  highThinking,
  onToggleHighThinking,
  webSearch,
  onToggleWebSearch,
  useDocContext,
  onToggleUseDocContext,
  providers,
  activeProviderId,
  onSelectProvider,
  onUpdateProvider,
  onAddCustomProvider,
  onDeleteCustomProvider,
  e2eeEnabled,
  e2eeFingerprint,
  onEnableE2EEPassphrase,
  onEnableRandomVaultKey,
  onDisableE2EE,
  stats,
  onExportActiveChat,
  onExportAllChats,
  onClearAllChats,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('e2ee');
  const [query, setQuery] = useState('');
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [e2eeStatus, setE2eeStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [voices, setVoices] = useState<Array<{ name: string; lang: string }>>([]);

  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('https://openrouter.ai/api/v1/chat/completions');
  const [customModel, setCustomModel] = useState('openai/gpt-4o-mini');
  const [customType, setCustomType] = useState<'openai_compatible' | 'anthropic' | 'ollama'>('openai_compatible');
  const [customToken, setCustomToken] = useState('');

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setConfirmClear(false);
    setQuery('');
    setCopiedId(false);
    const refreshVoices = () => setVoices(listAvailableVoices());
    refreshVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
      return () => {
        window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVoices);
        stopSpeaking();
        setTestingVoice(false);
      };
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const matchingTabs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return CATEGORIES.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q),
    );
  }, [query]);

  if (!open) return null;

  const activeProvider =
    providers.find((p) => p.id === activeProviderId) ?? providers[0];
  const isSearching = Boolean(query.trim());
  const shouldShowTab = (id: SettingsTabId) => {
    if (!isSearching) return activeTab === id;
    return matchingTabs?.some((m) => m.id === id) ?? false;
  };

  const handleSetPassphrase = async () => {
    if (passphrase.trim().length < 4) {
      setE2eeStatus('Enter a passphrase with at least 4 characters.');
      return;
    }
    await onEnableE2EEPassphrase(passphrase.trim());
    setPassphrase('');
    setE2eeStatus('AES-256-GCM vault key derived and active.');
  };

  const handleAddEndpoint = () => {
    if (!customName.trim() || !customUrl.trim()) return;
    const id = `custom_${Date.now()}`;
    onAddCustomProvider({
      id,
      label: customName.trim(),
      providerType: customType,
      endpointUrl: customUrl.trim(),
      modelId: customModel.trim() || 'default',
      customApiKey: customToken.trim() || undefined,
    });
    onSelectProvider(id);
    setCustomName('');
    setCustomToken('');
    setShowAddEndpoint(false);
  };

  const vaultDisplayId = e2eeFingerprint || 'luna-local-workspace';
  const handleCopyId = async () => {
    try {
      await navigator.clipboard?.writeText(vaultDisplayId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1600);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const renderCategoryIcon = (id: SettingsTabId) => {
    switch (id) {
      case 'e2ee':
        return <UserIcon className="w-4 h-4 shrink-0" />;
      case 'themes':
        return <Palette className="w-4 h-4 shrink-0 icon-wiggle" />;
      case 'ai':
        return <Sparkles className="w-4 h-4 shrink-0 icon-sparkle" />;
      case 'providers':
        return <Server className="w-4 h-4 shrink-0 icon-code" />;
      case 'voice':
        return <Volume2 className="w-4 h-4 shrink-0 icon-chat" />;
      case 'keyboard':
        return <KeyboardIcon className="w-4 h-4 shrink-0 icon-code" />;
      case 'data':
        return <Database className="w-4 h-4 shrink-0" />;
    }
  };

  const avatarInitial = (
    uiPrefs.preferredName?.[0] ||
    user?.displayName?.[0] ||
    user?.email?.[0] ||
    'L'
  ).toUpperCase();

  const currentTheme = WORKSPACE_THEMES[activeThemeId];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center md:p-6 bg-black/55 backdrop-blur-[2px] animate-fade-up"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full h-[100dvh] md:h-[min(740px,88dvh)] md:max-w-[920px] md:rounded-2xl md:border md:shadow-2xl overflow-hidden flex flex-col md:flex-row theme-transition"
        style={{
          backgroundColor: 'var(--app-canvas-bg)',
          borderColor: 'var(--app-border-color)',
          color: 'var(--app-text-primary)',
        }}
      >
        {/* Mobile Header & Pill Tabs */}
        <div
          className="md:hidden border-b px-4 py-3 space-y-2.5 shrink-0"
          style={{
            borderColor: 'var(--app-border-color)',
            backgroundColor: 'var(--app-surface-bg)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-editorial text-lg font-medium">Settings</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs"
            style={{
              borderColor: 'var(--app-border-color)',
              backgroundColor: 'var(--app-canvas-bg)',
            }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings"
              aria-label="Search settings mobile"
              className="w-full bg-transparent text-xs focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear mobile settings search"
                className="p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {!isSearching && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {CATEGORIES.map((cat) => {
                const active = activeTab === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveTab(cat.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border shrink-0"
                    style={{
                      borderColor: active
                        ? 'var(--app-accent-hex)'
                        : 'var(--app-border-color)',
                      backgroundColor: active
                        ? 'var(--app-elevated-bg)'
                        : 'transparent',
                      color: active
                        ? 'var(--app-text-primary)'
                        : 'var(--app-text-muted)',
                    }}
                  >
                    {renderCategoryIcon(cat.id)}
                    <span>{cat.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Left Navigation Rail (Claude Settings Layout) */}
        <aside
          className="hidden md:flex w-60 shrink-0 border-r flex-col px-3.5 pt-5 pb-3"
          style={{
            borderColor: 'var(--app-border-color)',
            backgroundColor: 'var(--app-surface-bg)',
          }}
        >
          <h2 className="font-editorial text-xl font-medium px-2 pb-3.5 tracking-tight">
            Settings
          </h2>

          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs mb-3"
            style={{
              borderColor: 'var(--app-border-color)',
              backgroundColor: 'var(--app-canvas-bg)',
            }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search settings"
              className="w-full bg-transparent text-xs focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear settings search"
                className="p-0.5 rounded hover:opacity-80"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <nav aria-label="Settings sections" className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {[0, 1, 2].map((sectionIdx) => (
              <div
                key={sectionIdx}
                className={sectionIdx > 0 ? 'pt-2 border-t space-y-0.5' : 'space-y-0.5'}
                style={{ borderColor: 'var(--app-border-color)' }}
              >
                {CATEGORIES.filter((c) => c.section === sectionIdx).map((cat) => {
                  const active = !isSearching && activeTab === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setActiveTab(cat.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13.5px] font-medium text-left transition-colors hover:bg-black/5 dark:hover:bg-white/[0.06]"
                      style={{
                        backgroundColor: active
                          ? 'var(--app-elevated-bg)'
                          : 'transparent',
                        color: active
                          ? 'var(--app-text-primary)'
                          : 'var(--app-text-muted)',
                      }}
                    >
                      {renderCategoryIcon(cat.id)}
                      <span className="truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom quick link matching Claude's "API keys ↗" */}
          <div
            className="pt-2.5 mt-2 border-t"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveTab('providers');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-medium hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <span>API keys</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </aside>

        {/* Right Content Pane with Crisp Top-Right Close */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="hidden md:flex absolute top-4 right-5 z-10 w-8 h-8 rounded-full items-center justify-center hover:bg-black/5 dark:hover:bg-white/[0.08] transition-colors"
            style={{ color: 'var(--app-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 sm:px-9 sm:py-7">
            <div className="max-w-2xl space-y-8 pb-8 text-sm">
              {isSearching && matchingTabs && matchingTabs.length === 0 && (
                <div
                  className="py-12 text-center text-xs"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  No settings match &ldquo;{query}&rdquo;.
                </div>
              )}

              {/* 1. ACCOUNT & VAULT (Claude Account screenshot + ChatGPT Details + E2EE) */}
              {shouldShowTab('e2ee') && (
                <section className="space-y-8">
                  <div>
                    <h3 className="text-[15px] font-semibold mb-1">Profile</h3>
                    <div
                      className="divide-y"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div
                        className="py-4 flex items-center justify-between gap-4"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <div>
                          <div className="text-[13.5px] font-medium">Profile photo</div>
                          <div
                            className="text-xs mt-0.5"
                            style={{ color: 'var(--app-text-muted)' }}
                          >
                            Shown in sidebar &amp; workspace greetings
                          </div>
                        </div>
                        <span
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0 shadow-xs"
                          style={{ backgroundColor: 'var(--app-accent-hex)' }}
                        >
                          {avatarInitial}
                        </span>
                      </div>

                      <div
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <div>
                          <div className="text-[13.5px] font-medium">Google account</div>
                          <div
                            className="text-xs mt-0.5"
                            style={{ color: 'var(--app-text-muted)' }}
                          >
                            {user?.email || 'Sign in to sync chats across devices'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {user?.displayName && (
                            <span className="text-[13px]">{user.displayName}</span>
                          )}
                          {user ? (
                            onSignOut && (
                              <button
                                type="button"
                                onClick={onSignOut}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium text-rose-500 hover:bg-rose-500/10"
                                style={{ borderColor: 'var(--app-border-color)' }}
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>Log out</span>
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={onSignIn}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-90"
                              style={{ backgroundColor: 'var(--app-accent-hex)' }}
                            >
                              <LogIn className="w-3.5 h-3.5 icon-chat" />
                              <span>Sign in</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <label htmlFor="luna-preferred-name" className="text-[13.5px] font-medium">
                          What should Luna call you?
                        </label>
                        <input
                          id="luna-preferred-name"
                          type="text"
                          aria-label="Account preferred name"
                          value={uiPrefs.preferredName}
                          onChange={(e) =>
                            onChangeUiPrefs({ ...uiPrefs, preferredName: e.target.value })
                          }
                          placeholder={user?.displayName || 'Luna User'}
                          className="sm:w-56 bg-transparent sm:text-right text-[13.5px] px-2.5 py-1.5 rounded-lg border focus:outline-none"
                          style={{
                            borderColor: 'var(--app-border-color)',
                            color: 'var(--app-text-primary)',
                          }}
                        />
                      </div>

                      <div
                        className="py-4 flex items-center justify-between gap-3"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <span className="text-[13.5px] font-medium">Workspace ID</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="font-mono text-xs truncate max-w-[200px]"
                            style={{ color: 'var(--app-text-muted)' }}
                          >
                            {vaultDisplayId}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCopyId()}
                            aria-label="Copy workspace ID"
                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.06]"
                            style={{ color: 'var(--app-text-muted)' }}
                          >
                            {copiedId ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Where you're active (Claude Account style table) */}
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="text-[15px] font-semibold">Where you&apos;re active</h3>
                      <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                        {user ? 'Cloud Sync + Local' : 'Local IndexedDB'}
                      </span>
                    </div>
                    <div
                      className="overflow-x-auto border-t text-xs"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr
                            className="border-b text-[11px] font-normal"
                            style={{
                              borderColor: 'var(--app-border-color)',
                              color: 'var(--app-text-muted)',
                            }}
                          >
                            <th className="py-2.5 pr-4 font-normal">Device</th>
                            <th className="py-2.5 px-3 font-normal">Platform</th>
                            <th className="py-2.5 pl-3 font-normal text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: 'var(--app-border-color)' }}>
                          {(devices.length > 0
                            ? devices
                            : [
                                {
                                  id: 'web-local',
                                  deviceName: 'This Browser',
                                  platform: 'web' as const,
                                  companionMode: 'web_viewport' as const,
                                  companionState: 'idle' as const,
                                  lastSyncAt: Date.now(),
                                },
                              ]
                          ).map((dev) => {
                            const isCurrent = dev.platform === 'web';
                            return (
                              <tr
                                key={dev.id}
                                style={{ borderColor: 'var(--app-border-color)' }}
                              >
                                <td className="py-3 pr-4 font-medium flex items-center gap-2">
                                  <span>{dev.deviceName}</span>
                                  {isCurrent && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-sky-500/15 text-sky-500">
                                      Current
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 capitalize" style={{ color: 'var(--app-text-muted)' }}>
                                  {dev.platform}
                                </td>
                                <td className="py-3 pl-3 text-right capitalize" style={{ color: 'var(--app-text-muted)' }}>
                                  {dev.companionMode.replace('_', ' ')} ·{' '}
                                  {isCurrent ? 'Active now' : dev.e2eeFingerprint ? 'Encrypted' : 'Ready'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Encryption & Security */}
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        {e2eeEnabled ? (
                          <Lock className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Unlock className="w-4 h-4 text-amber-500" />
                        )}
                        <h3 className="text-[15px] font-semibold">AES-256-GCM Encryption</h3>
                      </div>
                      {e2eeEnabled && (
                        <button
                          type="button"
                          onClick={onDisableE2EE}
                          className="text-xs font-medium text-rose-500 hover:underline"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                    <p className="text-xs mb-3" style={{ color: 'var(--app-text-muted)' }}>
                      {e2eeEnabled
                        ? 'Chats and workspace notes are encrypted locally before cloud sync.'
                        : 'Set a shared passphrase to encrypt synced history across devices.'}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Shared vault passphrase..."
                        aria-label="Shared vault passphrase"
                        className="flex-1 rounded-xl border px-3 py-2 text-xs focus:outline-none"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSetPassphrase()}
                        className="px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap text-white"
                        style={{ backgroundColor: 'var(--app-accent-hex)' }}
                      >
                        Enable passphrase
                      </button>
                      <button
                        type="button"
                        onClick={() => void onEnableRandomVaultKey()}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-medium whitespace-nowrap hover:bg-black/5 dark:hover:bg-white/[0.05]"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <KeyRound className="w-3.5 h-3.5 icon-wiggle" />
                        <span>256-bit key</span>
                      </button>
                    </div>
                    {e2eeStatus && (
                      <div className="mt-2 text-xs font-medium text-emerald-500">
                        {e2eeStatus}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* 2. APPEARANCE (ChatGPT thumbnails + Claude hairline rows) */}
              {shouldShowTab('themes') && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-[15px] font-semibold">Appearance</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                      Customize Light/Dark mode, theme preset, main accent color, and typography.
                    </p>
                  </div>

                  <div className="divide-y" style={{ borderColor: 'var(--app-border-color)' }}>
                    {/* Color Mode Visual Thumbnails (ChatGPT style) */}
                    <div
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Color mode</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Switch between Light UI and Dark UI
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => onSelectTheme('daylight')}
                          aria-label="Light UI color mode"
                          aria-pressed={!currentTheme?.isDark}
                          className="relative w-20 h-14 rounded-xl border-2 p-1.5 overflow-hidden bg-[#f8fafc] transition-colors"
                          style={{
                            borderColor: !currentTheme?.isDark
                              ? 'var(--app-accent-hex)'
                              : 'var(--app-border-color)',
                          }}
                        >
                          <div className="h-full rounded-lg bg-white border border-slate-200 p-1.5 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <span className="w-2 h-2 rounded-full bg-slate-300" />
                              <span className="w-5 h-1.5 rounded-full bg-blue-500/80" />
                            </div>
                            <div className="space-y-1">
                              <div className="w-8 h-1 rounded-full bg-slate-300" />
                              <div className="w-11 h-1 rounded-full bg-slate-200" />
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectTheme('obsidian')}
                          aria-label="Dark UI color mode"
                          aria-pressed={currentTheme?.isDark}
                          className="relative w-20 h-14 rounded-xl border-2 p-1.5 overflow-hidden bg-[#141413] transition-colors"
                          style={{
                            borderColor: currentTheme?.isDark
                              ? 'var(--app-accent-hex)'
                              : 'var(--app-border-color)',
                          }}
                        >
                          <div className="h-full rounded-lg bg-[#1e1e1c] border border-[#2f2f2b] p-1.5 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <span className="w-2 h-2 rounded-full bg-neutral-600" />
                              <span
                                className="w-5 h-1.5 rounded-full"
                                style={{ backgroundColor: 'var(--app-accent-hex)' }}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="w-8 h-1 rounded-full bg-neutral-500" />
                              <div className="w-11 h-1 rounded-full bg-neutral-700" />
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Theme Preset */}
                    <div
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Theme preset</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Curated palette for chat and editor surfaces
                        </div>
                      </div>
                      <select
                        aria-label="Theme preset"
                        value={activeThemeId}
                        onChange={(e) => onSelectTheme(e.target.value as ThemeId)}
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium focus:outline-none"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {Object.values(WORKSPACE_THEMES).map((theme) => (
                          <option key={theme.id} value={theme.id}>
                            {theme.name} ({theme.isDark ? 'Dark' : 'Light'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Main Color Swatches */}
                    <div
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Main color</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Send button, voice indicator &amp; active highlights
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ACCENT_PRESETS.map((preset) => {
                          const active =
                            (uiPrefs.accentHex || currentTheme?.accentHex || '').toLowerCase() ===
                            preset.hex.toLowerCase();
                          return (
                            <button
                              key={preset.hex}
                              type="button"
                              aria-label={`Color ${preset.label}`}
                              title={preset.label}
                              onClick={() =>
                                onChangeUiPrefs({ ...uiPrefs, accentHex: preset.hex })
                              }
                              className="w-6 h-6 rounded-full border flex items-center justify-center transition-transform hover:scale-105"
                              style={{
                                backgroundColor: preset.hex,
                                borderColor: active
                                  ? 'var(--app-text-primary)'
                                  : 'rgba(128,128,128,0.28)',
                              }}
                            >
                              {active && <Check className="w-3 h-3 text-white" />}
                            </button>
                          );
                        })}
                        <label
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border cursor-pointer text-[11px] font-medium"
                          style={{
                            borderColor: 'var(--app-border-color)',
                            backgroundColor: 'var(--app-surface-bg)',
                          }}
                        >
                          <span>Custom</span>
                          <input
                            type="color"
                            aria-label="Custom main color"
                            value={uiPrefs.accentHex || currentTheme?.accentHex || '#d97757'}
                            onChange={(e) =>
                              onChangeUiPrefs({ ...uiPrefs, accentHex: e.target.value })
                            }
                            className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
                          />
                        </label>
                        {uiPrefs.accentHex && (
                          <button
                            type="button"
                            onClick={() => onChangeUiPrefs({ ...uiPrefs, accentHex: '' })}
                            className="text-xs hover:underline pl-1"
                            style={{ color: 'var(--app-text-muted)' }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Font */}
                    <div
                      className="py-3.5 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <span className="text-[13.5px] font-medium">Font</span>
                      <div
                        className="flex rounded-xl p-0.5 border text-xs"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {(['sans', 'serif', 'mono'] as const).map((font) => (
                          <button
                            key={font}
                            type="button"
                            onClick={() => onChangeUiPrefs({ ...uiPrefs, fontFamily: font })}
                            className="px-3 py-1 rounded-lg capitalize font-medium transition-colors"
                            style={{
                              backgroundColor:
                                uiPrefs.fontFamily === font
                                  ? 'var(--app-elevated-bg)'
                                  : 'transparent',
                              color:
                                uiPrefs.fontFamily === font
                                  ? 'var(--app-text-primary)'
                                  : 'var(--app-text-muted)',
                            }}
                          >
                            {font}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Size */}
                    <div
                      className="py-3.5 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <span className="text-[13.5px] font-medium">Text size</span>
                      <div
                        className="flex rounded-xl p-0.5 border text-xs"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {(['compact', 'default', 'large'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => onChangeUiPrefs({ ...uiPrefs, fontSize: sz })}
                            className="px-3 py-1 rounded-lg font-medium transition-colors"
                            style={{
                              backgroundColor:
                                uiPrefs.fontSize === sz
                                  ? 'var(--app-elevated-bg)'
                                  : 'transparent',
                              color:
                                uiPrefs.fontSize === sz
                                  ? 'var(--app-text-primary)'
                                  : 'var(--app-text-muted)',
                            }}
                          >
                            {sz === 'compact' ? 'S' : sz === 'default' ? 'M' : 'L'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Chat Width */}
                    <div
                      className="py-3.5 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <span className="text-[13.5px] font-medium">Chat column width</span>
                      <div
                        className="flex rounded-xl p-0.5 border text-xs"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {(['focused', 'wide'] as const).map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => onChangeUiPrefs({ ...uiPrefs, chatWidth: w })}
                            className="px-3 py-1 rounded-lg capitalize font-medium transition-colors"
                            style={{
                              backgroundColor:
                                uiPrefs.chatWidth === w
                                  ? 'var(--app-elevated-bg)'
                                  : 'transparent',
                              color:
                                uiPrefs.chatWidth === w
                                  ? 'var(--app-text-primary)'
                                  : 'var(--app-text-muted)',
                            }}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* 3. PERSONALIZATION & AI */}
              {shouldShowTab('ai') && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-[15px] font-semibold">Personalization</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                      Tailor Luna&apos;s tone, reasoning depth, and default capabilities across workspaces.
                    </p>
                  </div>

                  <div className="divide-y" style={{ borderColor: 'var(--app-border-color)' }}>
                    <div
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Assistant persona</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          {PERSONA_OPTIONS.find((p) => p.id === uiPrefs.aiPersona)?.desc}
                        </div>
                      </div>
                      <select
                        aria-label="Assistant persona"
                        value={uiPrefs.aiPersona}
                        onChange={(e) => {
                          const found = PERSONA_OPTIONS.find((p) => p.id === e.target.value);
                          onChangeUiPrefs({
                            ...uiPrefs,
                            aiPersona: e.target.value as AiPersonaId,
                            temperature: found?.temp ?? uiPrefs.temperature,
                          });
                        }}
                        className="rounded-xl border px-3 py-1.5 text-xs font-medium focus:outline-none"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {PERSONA_OPTIONS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <span className="text-[13.5px] font-medium">Response detail</span>
                      <div
                        className="flex rounded-xl p-0.5 border text-xs"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {(['short', 'balanced', 'detailed'] as const).map((len) => (
                          <button
                            key={len}
                            type="button"
                            onClick={() =>
                              onChangeUiPrefs({ ...uiPrefs, responseLength: len })
                            }
                            className="px-3 py-1 rounded-lg capitalize font-medium transition-colors"
                            style={{
                              backgroundColor:
                                uiPrefs.responseLength === len
                                  ? 'var(--app-elevated-bg)'
                                  : 'transparent',
                              color:
                                uiPrefs.responseLength === len
                                  ? 'var(--app-text-primary)'
                                  : 'var(--app-text-muted)',
                            }}
                          >
                            {len}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Creativity (Temperature)</div>
                        <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--app-text-muted)' }}>
                          {uiPrefs.temperature.toFixed(1)} ·{' '}
                          {uiPrefs.temperature <= 0.4
                            ? 'Precise'
                            : uiPrefs.temperature >= 1.0
                              ? 'Creative'
                              : 'Balanced'}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.1}
                        aria-label="Creativity temperature"
                        value={uiPrefs.temperature}
                        onChange={(e) =>
                          onChangeUiPrefs({
                            ...uiPrefs,
                            temperature: Number(e.target.value),
                          })
                        }
                        className="sm:w-52 accent-[var(--app-accent-hex)] cursor-pointer"
                      />
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <span className="text-[13.5px] font-medium">Max response length</span>
                      <div
                        className="flex rounded-xl p-0.5 border text-xs"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {[512, 1024, 2048, 4096, 8192].map((limit) => (
                          <button
                            key={limit}
                            type="button"
                            onClick={() =>
                              onChangeUiPrefs({ ...uiPrefs, maxOutputTokens: limit })
                            }
                            className="px-2.5 py-1 rounded-lg font-medium transition-colors"
                            style={{
                              backgroundColor:
                                uiPrefs.maxOutputTokens === limit
                                  ? 'var(--app-elevated-bg)'
                                  : 'transparent',
                              color:
                                uiPrefs.maxOutputTokens === limit
                                  ? 'var(--app-text-primary)'
                                  : 'var(--app-text-muted)',
                            }}
                          >
                            {limit >= 1024 ? `${limit / 1024}k` : limit}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <span className="text-[13.5px] font-medium">Conversation memory</span>
                      <div
                        className="flex rounded-xl p-0.5 border text-xs"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {[
                          { label: '6', val: 6 },
                          { label: '12', val: 12 },
                          { label: '20', val: 20 },
                          { label: 'All', val: 0 },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() =>
                              onChangeUiPrefs({ ...uiPrefs, historyLimit: opt.val })
                            }
                            className="px-2.5 py-1 rounded-lg font-medium transition-colors"
                            style={{
                              backgroundColor:
                                uiPrefs.historyLimit === opt.val
                                  ? 'var(--app-elevated-bg)'
                                  : 'transparent',
                              color:
                                uiPrefs.historyLimit === opt.val
                                  ? 'var(--app-text-primary)'
                                  : 'var(--app-text-muted)',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-4"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Live web search</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Ground answers with live search facts
                        </div>
                      </div>
                      <Switch checked={webSearch} onChange={onToggleWebSearch} label="Live web search" />
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-4"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">High thinking mode</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Deeper multi-step reasoning on complex tasks
                        </div>
                      </div>
                      <Switch checked={highThinking} onChange={onToggleHighThinking} label="High thinking mode" />
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-4"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Workspace memory</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Include saved local workspace notes in context
                        </div>
                      </div>
                      <Switch checked={useDocContext} onChange={onToggleUseDocContext} label="Workspace memory" />
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-4"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Auto chat titles</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Generate concise sidebar summaries automatically
                        </div>
                      </div>
                      <Switch
                        checked={uiPrefs.autoSummarize}
                        onChange={() =>
                          onChangeUiPrefs({ ...uiPrefs, autoSummarize: !uiPrefs.autoSummarize })
                        }
                        label="Auto chat titles"
                      />
                    </div>
                  </div>

                  {/* Custom System Instructions */}
                  <div className="space-y-2.5 pt-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="luna-custom-instructions" className="text-[13.5px] font-medium">
                        Custom instructions
                      </label>
                      {uiPrefs.customInstructions.trim() && (
                        <button
                          type="button"
                          onClick={() =>
                            onChangeUiPrefs({ ...uiPrefs, customInstructions: '' })
                          }
                          className="text-xs hover:underline"
                          style={{ color: 'var(--app-text-muted)' }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <textarea
                      id="luna-custom-instructions"
                      rows={3}
                      value={uiPrefs.customInstructions}
                      onChange={(e) =>
                        onChangeUiPrefs({
                          ...uiPrefs,
                          customInstructions: e.target.value,
                        })
                      }
                      placeholder="Add preferred formatting, coding style, language, or guidelines..."
                      className="w-full rounded-xl border p-3 text-xs resize-y focus:outline-none"
                      style={{
                        borderColor: 'var(--app-border-color)',
                        backgroundColor: 'var(--app-surface-bg)',
                        color: 'var(--app-text-primary)',
                      }}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_INSTRUCTION_CHIPS.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => {
                            const existing = uiPrefs.customInstructions.trim();
                            if (existing.includes(chip.text)) return;
                            onChangeUiPrefs({
                              ...uiPrefs,
                              customInstructions: existing
                                ? `${existing}\n${chip.text}`
                                : chip.text,
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] hover:opacity-90"
                          style={{
                            borderColor: 'var(--app-border-color)',
                            backgroundColor: 'var(--app-surface-bg)',
                          }}
                        >
                          <Plus className="w-3 h-3 icon-plus" />
                          <span>{chip.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* 4. MODELS & APIS */}
              {shouldShowTab('providers') && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-[15px] font-semibold">Models &amp; APIs</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                      Built-in Google Gemini models work out of the box with no user API key required. Connect your own API keys below for OpenRouter, OpenAI, Anthropic, Groq, DeepSeek, Mistral, xAI, or local Ollama.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {providers.map((p) => {
                      const selected = p.id === activeProviderId;
                      const isCustom = p.id.startsWith('custom_');
                      const hasKey = Boolean(p.customApiKey?.trim());
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-1 rounded-xl border transition-colors"
                          style={{
                            borderColor: selected
                              ? 'var(--app-accent-hex)'
                              : 'var(--app-border-color)',
                            backgroundColor: selected
                              ? 'var(--app-elevated-bg)'
                              : 'var(--app-surface-bg)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setShowApiKey(false);
                              onSelectProvider(p.id);
                            }}
                            className="flex-1 flex items-center justify-between px-3 py-2.5 text-left min-w-0 rounded-xl"
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="font-medium text-xs flex items-center gap-2 min-w-0">
                                <span className="truncate">{p.label}</span>
                                {p.providerType === 'gemini' ? (
                                  <span className="text-[10px] font-normal shrink-0" style={{ color: 'var(--app-text-muted)' }}>
                                    Built-in
                                  </span>
                                ) : hasKey ? (
                                  <span className="text-[10px] font-medium text-emerald-500 shrink-0">
                                    Key saved
                                  </span>
                                ) : null}
                              </div>
                              <div className="font-mono text-[10px] truncate mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                                {p.modelId}
                              </div>
                            </div>
                            {selected && (
                              <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--app-accent-hex)' }} />
                            )}
                          </button>
                          {isCustom && onDeleteCustomProvider && (
                            <button
                              type="button"
                              onClick={() => onDeleteCustomProvider(p.id)}
                              aria-label={`Delete ${p.label}`}
                              className="p-2 mr-1 rounded-lg text-rose-500 hover:bg-rose-500/15 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {activeProvider && activeProvider.providerType === 'gemini' && (
                    <div
                      className="rounded-xl border p-4 space-y-2.5 text-xs"
                      style={{
                        borderColor: 'var(--app-border-color)',
                        backgroundColor: 'var(--app-surface-bg)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{activeProvider.label}</span>
                        {activeProvider.docsUrl && (
                          <a
                            href={activeProvider.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium hover:underline shrink-0"
                            style={{ color: 'var(--app-accent-hex)' }}
                          >
                            <span>Google AI Docs</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <p style={{ color: 'var(--app-text-muted)' }}>
                        {activeProvider.description || 'Managed automatically on the server. No API key entry required.'}
                      </p>
                      {activeProvider.suggestedModels && activeProvider.suggestedModels.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {activeProvider.suggestedModels.map((modelOpt) => {
                            const isCurrent = activeProvider.modelId === modelOpt;
                            return (
                              <button
                                key={modelOpt}
                                type="button"
                                onClick={() =>
                                  onUpdateProvider({ ...activeProvider, modelId: modelOpt })
                                }
                                className="px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-colors"
                                style={{
                                  borderColor: isCurrent
                                    ? 'var(--app-accent-hex)'
                                    : 'var(--app-border-color)',
                                  backgroundColor: isCurrent
                                    ? 'var(--app-elevated-bg)'
                                    : 'transparent',
                                  color: isCurrent
                                    ? 'var(--app-text-primary)'
                                    : 'var(--app-text-muted)',
                                }}
                              >
                                {modelOpt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeProvider && activeProvider.providerType !== 'gemini' && (
                    <div
                      className="rounded-xl border p-4 space-y-3 text-xs"
                      style={{
                        borderColor: 'var(--app-border-color)',
                        backgroundColor: 'var(--app-surface-bg)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-sm">{activeProvider.label}</span>
                        <div className="flex items-center gap-3">
                          {activeProvider.apiKeyUrl && (
                            <a
                              href={activeProvider.apiKeyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium hover:underline whitespace-nowrap"
                              style={{ color: 'var(--app-accent-hex)' }}
                            >
                              <span>Get API key</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {activeProvider.docsUrl && (
                            <a
                              href={activeProvider.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:underline whitespace-nowrap"
                              style={{ color: 'var(--app-text-muted)' }}
                            >
                              <span>API Docs</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      {activeProvider.description && (
                        <p style={{ color: 'var(--app-text-muted)' }}>{activeProvider.description}</p>
                      )}

                      <label className="space-y-1 block">
                        <span style={{ color: 'var(--app-text-muted)' }}>Endpoint URL</span>
                        <input
                          type="url"
                          value={activeProvider.endpointUrl || ''}
                          onChange={(e) =>
                            onUpdateProvider({ ...activeProvider, endpointUrl: e.target.value })
                          }
                          className="w-full rounded-lg border px-2.5 py-2 font-mono text-xs focus:outline-none"
                          style={{
                            borderColor: 'var(--app-border-color)',
                            backgroundColor: 'var(--app-canvas-bg)',
                          }}
                        />
                      </label>

                      <div className="space-y-1.5">
                        <label className="space-y-1 block">
                          <span style={{ color: 'var(--app-text-muted)' }}>Model ID</span>
                          <input
                            type="text"
                            value={activeProvider.modelId}
                            onChange={(e) =>
                              onUpdateProvider({ ...activeProvider, modelId: e.target.value })
                            }
                            className="w-full rounded-lg border px-2.5 py-2 font-mono text-xs focus:outline-none"
                            style={{
                              borderColor: 'var(--app-border-color)',
                              backgroundColor: 'var(--app-canvas-bg)',
                            }}
                          />
                        </label>
                        {activeProvider.suggestedModels && activeProvider.suggestedModels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {activeProvider.suggestedModels.map((modelOpt) => {
                              const isCurrent = activeProvider.modelId === modelOpt;
                              return (
                                <button
                                  key={modelOpt}
                                  type="button"
                                  onClick={() =>
                                    onUpdateProvider({ ...activeProvider, modelId: modelOpt })
                                  }
                                  className="px-2 py-0.5 rounded-md border font-mono text-[10px]"
                                  style={{
                                    borderColor: isCurrent
                                      ? 'var(--app-accent-hex)'
                                      : 'var(--app-border-color)',
                                    backgroundColor: isCurrent
                                      ? 'var(--app-elevated-bg)'
                                      : 'transparent',
                                    color: isCurrent
                                      ? 'var(--app-text-primary)'
                                      : 'var(--app-text-muted)',
                                  }}
                                >
                                  {modelOpt}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <span className="block" style={{ color: 'var(--app-text-muted)' }}>
                          {activeProvider.providerType === 'ollama'
                            ? 'API Key (optional for local Ollama)'
                            : 'Your API Key (stored locally)'}
                        </span>
                        <div className="relative flex items-center">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={activeProvider.customApiKey || ''}
                            onChange={(e) =>
                              onUpdateProvider({ ...activeProvider, customApiKey: e.target.value })
                            }
                            placeholder={
                              activeProvider.providerType === 'ollama'
                                ? 'Leave blank for local server'
                                : 'Paste your API key...'
                            }
                            className="w-full rounded-lg border pl-2.5 pr-9 py-2 font-mono text-xs focus:outline-none"
                            style={{
                              borderColor: 'var(--app-border-color)',
                              backgroundColor: 'var(--app-canvas-bg)',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey((v) => !v)}
                            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                            className="absolute right-2 p-1 rounded hover:opacity-80"
                            style={{ color: 'var(--app-text-muted)' }}
                          >
                            {showApiKey ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowAddEndpoint((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium hover:opacity-85"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    <Plus className="w-3.5 h-3.5 icon-plus" />
                    <span>Add custom or local endpoint</span>
                  </button>

                  {showAddEndpoint && (
                    <div
                      className="rounded-xl border p-4 space-y-2.5 text-xs"
                      style={{
                        borderColor: 'var(--app-border-color)',
                        backgroundColor: 'var(--app-surface-bg)',
                      }}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder="Label (e.g. Local LM)"
                          className="rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none"
                          style={{
                            borderColor: 'var(--app-border-color)',
                            backgroundColor: 'var(--app-canvas-bg)',
                          }}
                        />
                        <select
                          value={customType}
                          onChange={(e) =>
                            setCustomType(
                              e.target.value as 'openai_compatible' | 'anthropic' | 'ollama',
                            )
                          }
                          className="rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                          style={{
                            borderColor: 'var(--app-border-color)',
                            backgroundColor: 'var(--app-canvas-bg)',
                          }}
                        >
                          <option value="openai_compatible">OpenAI-Compatible</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="ollama">Local Ollama</option>
                        </select>
                      </div>
                      <input
                        type="url"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="Endpoint URL"
                        className="w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs focus:outline-none"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-canvas-bg)',
                        }}
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          placeholder="Model ID"
                          className="flex-1 rounded-lg border px-2.5 py-1.5 font-mono text-xs focus:outline-none"
                          style={{
                            borderColor: 'var(--app-border-color)',
                            backgroundColor: 'var(--app-canvas-bg)',
                          }}
                        />
                        <input
                          type="password"
                          value={customToken}
                          onChange={(e) => setCustomToken(e.target.value)}
                          placeholder="API key (optional)"
                          className="flex-1 rounded-lg border px-2.5 py-1.5 font-mono text-xs focus:outline-none"
                          style={{
                            borderColor: 'var(--app-border-color)',
                            backgroundColor: 'var(--app-canvas-bg)',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddEndpoint}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white"
                        style={{ backgroundColor: 'var(--app-accent-hex)' }}
                      >
                        Save endpoint
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* 5. VOICE & AUDIO */}
              {shouldShowTab('voice') && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-[15px] font-semibold">Voice &amp; Audio</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                      Tune streaming UI chimes and customize Luna&apos;s spoken replies.
                    </p>
                  </div>

                  <div className="divide-y" style={{ borderColor: 'var(--app-border-color)' }}>
                    <div
                      className="py-4 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Streaming audio chimes</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Soft ping when Luna starts and finishes streaming
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={() => playStreamCompletePing(true)}
                          className="px-2.5 py-1 rounded-lg border text-xs hover:bg-black/5 dark:hover:bg-white/[0.06]"
                          style={{ borderColor: 'var(--app-border-color)' }}
                        >
                          Test ping
                        </button>
                        <Switch
                          checked={uiPrefs.soundEffects}
                          onChange={() =>
                            onChangeUiPrefs({ ...uiPrefs, soundEffects: !uiPrefs.soundEffects })
                          }
                          label="Streaming audio chimes"
                        />
                      </div>
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Auto read replies aloud (TTS)</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Speak responses automatically with Web Speech TTS
                        </div>
                      </div>
                      <Switch
                        checked={uiPrefs.autoReadAloud}
                        onChange={() =>
                          onChangeUiPrefs({ ...uiPrefs, autoReadAloud: !uiPrefs.autoReadAloud })
                        }
                        label="Auto read replies aloud (TTS)"
                      />
                    </div>

                    <div
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <label htmlFor="luna-tts-voice" className="text-[13.5px] font-medium">
                        Speech voice
                      </label>
                      <select
                        id="luna-tts-voice"
                        value={uiPrefs.ttsVoiceName}
                        onChange={(e) =>
                          onChangeUiPrefs({ ...uiPrefs, ttsVoiceName: e.target.value })
                        }
                        className="sm:max-w-[280px] rounded-xl border px-3 py-1.5 text-xs focus:outline-none"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        <option value="">System Default (Best Natural Voice)</option>
                        {voices.map((v) => (
                          <option key={`${v.name}-${v.lang}`} value={v.name}>
                            {v.name} ({v.lang})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Speech speed</div>
                        <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          {uiPrefs.ttsRate.toFixed(2)}x
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0.7}
                        max={1.6}
                        step={0.05}
                        aria-label="Speech speed"
                        value={uiPrefs.ttsRate}
                        onChange={(e) =>
                          onChangeUiPrefs({ ...uiPrefs, ttsRate: Number(e.target.value) })
                        }
                        className="sm:w-52 accent-[var(--app-accent-hex)] cursor-pointer"
                      />
                    </div>

                    <div
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Speech pitch</div>
                        <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          {uiPrefs.ttsPitch.toFixed(2)}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0.7}
                        max={1.4}
                        step={0.05}
                        aria-label="Speech pitch"
                        value={uiPrefs.ttsPitch}
                        onChange={(e) =>
                          onChangeUiPrefs({ ...uiPrefs, ttsPitch: Number(e.target.value) })
                        }
                        className="sm:w-52 accent-[var(--app-accent-hex)] cursor-pointer"
                      />
                    </div>

                    <div
                      className="py-4 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <span className="text-[13.5px] font-medium">Preview voice</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (testingVoice) {
                            stopSpeaking();
                            setTestingVoice(false);
                          } else {
                            const ok = speakAssistantMessage(
                              'Hello! I am Luna, ready to help whenever you need me.',
                              {
                                rate: uiPrefs.ttsRate,
                                pitch: uiPrefs.ttsPitch,
                                voiceName: uiPrefs.ttsVoiceName || undefined,
                                onStart: () => setTestingVoice(true),
                                onEnd: () => setTestingVoice(false),
                                onError: () => setTestingVoice(false),
                              },
                            );
                            if (ok) setTestingVoice(true);
                          }
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-medium hover:bg-black/5 dark:hover:bg-white/[0.06]"
                        style={{
                          borderColor: 'var(--app-border-color)',
                          backgroundColor: 'var(--app-surface-bg)',
                        }}
                      >
                        {testingVoice ? (
                          <>
                            <Square className="w-3.5 h-3.5 text-rose-500" />
                            <span>Stop preview</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" style={{ color: 'var(--app-accent-hex)' }} />
                            <span>Play sample</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* 6. KEYBOARD SHORTCUTS */}
              {shouldShowTab('keyboard') && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-[15px] font-semibold">Keyboard</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                      Quick shortcuts across chats, uploads, and panels.
                    </p>
                  </div>

                  <div className="divide-y" style={{ borderColor: 'var(--app-border-color)' }}>
                    <div
                      className="py-4 flex items-center justify-between gap-4"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Enter key sends message</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          When off, press Ctrl/Cmd + Enter to send
                        </div>
                      </div>
                      <Switch
                        checked={uiPrefs.enterToSend}
                        onChange={() =>
                          onChangeUiPrefs({ ...uiPrefs, enterToSend: !uiPrefs.enterToSend })
                        }
                        label="Enter key sends message"
                      />
                    </div>

                    {WORKSPACE_SHORTCUTS.map((sc) => (
                      <div
                        key={sc.id}
                        className="py-3.5 flex items-center justify-between gap-3"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium">{sc.label}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                            {sc.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {sc.keysWin.map((keyCap) => (
                            <kbd
                              key={keyCap}
                              className="px-2 py-0.5 rounded-md border text-[11px] font-mono"
                              style={{
                                borderColor: 'var(--app-border-color)',
                                backgroundColor: 'var(--app-surface-bg)',
                                color: 'var(--app-text-primary)',
                              }}
                            >
                              {keyCap}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 7. DATA & PRIVACY */}
              {shouldShowTab('data') && (
                <section className="space-y-6">
                  <div>
                    <h3 className="text-[15px] font-semibold">Data &amp; Privacy</h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                      Export transcripts, inspect saved workspace counts, or clear local data.
                    </p>
                  </div>

                  {stats && (
                    <div
                      className="flex items-center justify-between py-3 px-4 rounded-xl border text-xs"
                      style={{
                        borderColor: 'var(--app-border-color)',
                        backgroundColor: 'var(--app-surface-bg)',
                      }}
                    >
                      <span>
                        <strong className="font-semibold tabular-nums">{stats.conversationCount}</strong>{' '}
                        <span style={{ color: 'var(--app-text-muted)' }}>chats</span>
                      </span>
                      <span>
                        <strong className="font-semibold tabular-nums">{stats.documentCount}</strong>{' '}
                        <span style={{ color: 'var(--app-text-muted)' }}>notes &amp; files</span>
                      </span>
                      <span>
                        <strong className="font-semibold tabular-nums">{stats.companionTurnCount}</strong>{' '}
                        <span style={{ color: 'var(--app-text-muted)' }}>companion turns</span>
                      </span>
                    </div>
                  )}

                  <div className="divide-y" style={{ borderColor: 'var(--app-border-color)' }}>
                    {onExportActiveChat && (
                      <div
                        className="py-4 flex items-center justify-between gap-3"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <div>
                          <div className="text-[13.5px] font-medium">Export current conversation</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                            Save active thread as clean Markdown (.md)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onExportActiveChat}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-black/5 dark:hover:bg-white/[0.06]"
                          style={{ borderColor: 'var(--app-border-color)' }}
                        >
                          <Download className="w-3.5 h-3.5 icon-send" />
                          <span>Export</span>
                        </button>
                      </div>
                    )}

                    {onExportAllChats && (
                      <div
                        className="py-4 flex items-center justify-between gap-3"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <div>
                          <div className="text-[13.5px] font-medium">Backup all chats</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                            Download full local workspace archive (.json)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={onExportAllChats}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-black/5 dark:hover:bg-white/[0.06]"
                          style={{ borderColor: 'var(--app-border-color)' }}
                        >
                          <FileJson className="w-3.5 h-3.5 icon-code" />
                          <span>Backup</span>
                        </button>
                      </div>
                    )}

                    <div
                      className="py-4 flex items-center justify-between gap-3"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    >
                      <div>
                        <div className="text-[13.5px] font-medium">Reset preferences</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                          Restore default main color, persona, and voice rate
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChangeUiPrefs({ ...DEFAULT_UI_PREFS })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-black/5 dark:hover:bg-white/[0.06]"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <RotateCcw className="w-3.5 h-3.5 icon-wiggle" />
                        <span>Reset</span>
                      </button>
                    </div>

                    {onClearAllChats && (
                      <div
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        style={{ borderColor: 'var(--app-border-color)' }}
                      >
                        <div>
                          <div className="text-[13.5px] font-medium text-rose-500">Clear all local chats</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                            Permanently erase saved conversations on this browser
                          </div>
                        </div>
                        {!confirmClear ? (
                          <button
                            type="button"
                            onClick={() => setConfirmClear(true)}
                            className="px-4 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shrink-0"
                          >
                            Delete
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setConfirmClear(false)}
                              className="px-3 py-1 rounded-full border text-xs"
                              style={{ borderColor: 'var(--app-border-color)' }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onClearAllChats();
                                setConfirmClear(false);
                              }}
                              className="px-3.5 py-1 rounded-full bg-rose-600 text-white text-xs font-medium"
                            >
                              Confirm delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Safety indicator */}
              {e2eeEnabled && activeTab === 'e2ee' && (
                <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--app-text-muted)' }}>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Client-side WebCrypto vault active</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
