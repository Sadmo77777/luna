export type WorkspaceShortcutAction =
  | 'toggle_sidebar'
  | 'new_chat'
  | 'upload_files'
  | 'open_settings'
  | 'focus_composer'
  | 'focus_history_search';

export interface WorkspaceShortcutDef {
  id: WorkspaceShortcutAction;
  label: string;
  description: string;
  keysMac: string[];
  keysWin: string[];
}

export const WORKSPACE_SHORTCUTS: WorkspaceShortcutDef[] = [
  {
    id: 'new_chat',
    label: 'New chat',
    description: 'Start a fresh conversation',
    keysMac: ['⌘', '⇧', 'O'],
    keysWin: ['Ctrl', 'Shift', 'O'],
  },
  {
    id: 'upload_files',
    label: 'Upload or add files',
    description: 'Attach images, code, or documents to chat',
    keysMac: ['⌘', 'U'],
    keysWin: ['Ctrl', 'U'],
  },
  {
    id: 'toggle_sidebar',
    label: 'Toggle sidebar',
    description: 'Show or hide chat history sidebar',
    keysMac: ['⌘', 'B'],
    keysWin: ['Ctrl', 'B'],
  },
  {
    id: 'focus_composer',
    label: 'Focus chat input',
    description: 'Jump cursor straight into message box',
    keysMac: ['⇧', 'Esc'],
    keysWin: ['Shift', 'Esc'],
  },
  {
    id: 'focus_history_search',
    label: 'Search chats',
    description: 'Open sidebar and filter recent chats',
    keysMac: ['⌘', '⇧', 'S'],
    keysWin: ['Ctrl', 'Shift', 'S'],
  },
  {
    id: 'open_settings',
    label: 'Open settings',
    description: 'Configure AI, models, theme, and voice',
    keysMac: ['⌘', ','],
    keysWin: ['Ctrl', ','],
  },
];

export interface ShortcutKeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matchWorkspaceShortcut(
  e: ShortcutKeyEventLike,
): WorkspaceShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (e.key === 'Escape' && e.shiftKey && !mod && !e.altKey) {
    return 'focus_composer';
  }

  if (!mod || e.altKey) return null;

  if (key === 'b' && !e.shiftKey) {
    return 'toggle_sidebar';
  }
  if (key === 'u' && !e.shiftKey) {
    return 'upload_files';
  }
  if (key === 'o' && e.shiftKey) {
    return 'new_chat';
  }
  if (key === 's' && e.shiftKey) {
    return 'focus_history_search';
  }
  if (key === ',' && !e.shiftKey) {
    return 'open_settings';
  }

  return null;
}
