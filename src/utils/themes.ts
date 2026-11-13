export type ThemeId =
  | 'obsidian'
  | 'midnight'
  | 'daylight'
  | 'emerald-ink'
  | 'paper-warm';

export interface WorkspaceTheme {
  id: ThemeId;
  name: string;
  isDark: boolean;
  canvasBg: string;
  surfaceBg: string;
  elevatedBg: string;
  borderColor: string;
  textPrimary: string;
  textMuted: string;
  accentBg: string;
  accentText: string;
  accentHex: string;
  swatchColors: [string, string, string];
}

export const WORKSPACE_THEMES: Record<ThemeId, WorkspaceTheme> = {
  obsidian: {
    id: 'obsidian',
    name: 'Warm Charcoal',
    isDark: true,
    canvasBg: '#141413',
    surfaceBg: '#1c1c1a',
    elevatedBg: '#262623',
    borderColor: '#2f2f2b',
    textPrimary: '#eeeeec',
    textMuted: '#9a9992',
    accentBg: '#3b82f6',
    accentText: '#ffffff',
    accentHex: '#d97757',
    swatchColors: ['#141413', '#262623', '#d97757'],
  },
  midnight: {
    id: 'midnight',
    name: 'Aether Indigo',
    isDark: true,
    canvasBg: '#0d1021',
    surfaceBg: '#141933',
    elevatedBg: '#1d2447',
    borderColor: '#2d3766',
    textPrimary: '#eef2ff',
    textMuted: '#9aa5d6',
    accentBg: '#6366f1',
    accentText: '#ffffff',
    accentHex: '#818cf8',
    swatchColors: ['#0d1021', '#1d2447', '#818cf8'],
  },
  daylight: {
    id: 'daylight',
    name: 'Architectural Light',
    isDark: false,
    canvasBg: '#f8fafc',
    surfaceBg: '#ffffff',
    elevatedBg: '#f1f5f9',
    borderColor: '#e2e8f0',
    textPrimary: '#0f172a',
    textMuted: '#475569',
    accentBg: '#2563eb',
    accentText: '#ffffff',
    accentHex: '#2563eb',
    swatchColors: ['#f8fafc', '#ffffff', '#2563eb'],
  },
  'emerald-ink': {
    id: 'emerald-ink',
    name: 'Forest Terminal',
    isDark: true,
    canvasBg: '#091311',
    surfaceBg: '#0f1f1c',
    elevatedBg: '#172e29',
    borderColor: '#23443d',
    textPrimary: '#ecfdf5',
    textMuted: '#8fb9ad',
    accentBg: '#059669',
    accentText: '#ffffff',
    accentHex: '#10b981',
    swatchColors: ['#091311', '#172e29', '#10b981'],
  },
  'paper-warm': {
    id: 'paper-warm',
    name: 'Studio Daylight',
    isDark: false,
    canvasBg: '#f6f4ef',
    surfaceBg: '#fcfbf8',
    elevatedBg: '#ede9df',
    borderColor: '#dcd6c8',
    textPrimary: '#1c1917',
    textMuted: '#57534e',
    accentBg: '#1d4ed8',
    accentText: '#ffffff',
    accentHex: '#1d4ed8',
    swatchColors: ['#f6f4ef', '#fcfbf8', '#1d4ed8'],
  },
};

export type AiPersonaId =
  | 'balanced'
  | 'concise'
  | 'coder'
  | 'creative'
  | 'tutor';

export interface UiPreferences {
  accentHex: string; // empty string = theme default
  soundEffects: boolean; // subtle ping on stream start and complete
  autoReadAloud: boolean; // Web Speech TTS read aloud assistant replies
  ttsVoiceName: string; // empty string = auto natural voice
  ttsRate: number; // 0.7 - 1.6
  ttsPitch: number; // 0.7 - 1.4
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: 'compact' | 'default' | 'large';
  chatWidth: 'focused' | 'wide';
  showSuggestions: boolean;
  enterToSend: boolean;
  autoSummarize: boolean;
  aiPersona: AiPersonaId;
  responseLength: 'short' | 'balanced' | 'detailed';
  preferredName: string;
  maxOutputTokens: number;
  temperature: number;
  historyLimit: number; // 0 = unlimited
  customInstructions: string;
}

export const DEFAULT_UI_PREFS: UiPreferences = {
  accentHex: '',
  soundEffects: true,
  autoReadAloud: false,
  ttsVoiceName: '',
  ttsRate: 1.05,
  ttsPitch: 1.0,
  fontFamily: 'sans',
  fontSize: 'default',
  chatWidth: 'focused',
  showSuggestions: true,
  enterToSend: true,
  autoSummarize: true,
  aiPersona: 'balanced',
  responseLength: 'balanced',
  preferredName: '',
  maxOutputTokens: 2048,
  temperature: 0.7,
  historyLimit: 20,
  customInstructions: '',
};

export const ACCENT_PRESETS: Array<{ label: string; hex: string }> = [
  { label: 'Coral Sunset', hex: '#d97757' },
  { label: 'Electric Indigo', hex: '#6366f1' },
  { label: 'Ocean Blue', hex: '#2563eb' },
  { label: 'Emerald Green', hex: '#10b981' },
  { label: 'Amber Gold', hex: '#f59e0b' },
  { label: 'Rose Pink', hex: '#f43f5e' },
  { label: 'Slate Neutral', hex: '#64748b' },
];

export function resolveUiCssVars(
  theme: WorkspaceTheme,
  prefs: UiPreferences = DEFAULT_UI_PREFS,
): Record<string, string> {
  const effectiveAccent = prefs.accentHex?.trim() || theme.accentHex;
  const fontMap: Record<UiPreferences['fontFamily'], string> = {
    sans: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    serif: '"Newsreader", Georgia, "Times New Roman", serif',
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  };
  const sizeMap: Record<UiPreferences['fontSize'], string> = {
    compact: '13.5px',
    default: '14.5px',
    large: '16px',
  };
  const widthMap: Record<UiPreferences['chatWidth'], string> = {
    focused: '42rem',
    wide: '56rem',
  };

  return {
    '--app-canvas-bg': theme.canvasBg,
    '--app-surface-bg': theme.surfaceBg,
    '--app-elevated-bg': theme.elevatedBg,
    '--app-border-color': theme.borderColor,
    '--app-text-primary': theme.textPrimary,
    '--app-text-muted': theme.textMuted,
    '--app-accent-bg': effectiveAccent,
    '--app-accent-text': theme.accentText,
    '--app-accent-hex': effectiveAccent,
    '--app-chat-font': fontMap[prefs.fontFamily] ?? fontMap.sans,
    '--app-chat-size': sizeMap[prefs.fontSize] ?? sizeMap.default,
    '--app-chat-max-w': widthMap[prefs.chatWidth] ?? widthMap.focused,
  };
}

export function getTheme(id?: string | null): WorkspaceTheme {
  if (id && id in WORKSPACE_THEMES) {
    return WORKSPACE_THEMES[id as ThemeId];
  }
  return WORKSPACE_THEMES.obsidian;
}

export function applyThemeToDocument(
  theme: WorkspaceTheme,
  prefs: UiPreferences = DEFAULT_UI_PREFS,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme.isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  const vars = resolveUiCssVars(theme, prefs);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}
