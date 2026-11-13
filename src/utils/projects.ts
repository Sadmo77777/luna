import type { Conversation, ProjectFolder } from '../types/workspace';

export function createStarterProjects(): ProjectFolder[] {
  const now = Date.now();
  return [
    {
      id: 'proj_luna',
      name: 'Luna',
      description: 'Core workspace & agent tasks',
      pinned: true,
      defaultMode: 'agent',
      createdAt: now - 86_400_000,
      updatedAt: now - 3_600_000,
    },
  ];
}

export function createProjectFolder(
  name: string,
  options: {
    description?: string;
    pinned?: boolean;
    defaultMode?: 'chat' | 'agent';
    existing?: ProjectFolder[];
  } = {},
): ProjectFolder | null {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (!cleanName) return null;

  const duplicate = (options.existing ?? []).find(
    (p) => p.name.toLowerCase() === cleanName.toLowerCase(),
  );
  if (duplicate) return duplicate;

  const now = Date.now();
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  return {
    id: `proj_${slug || 'folder'}_${now.toString(36)}`,
    name: cleanName,
    description: options.description?.trim() || undefined,
    pinned: options.pinned ?? true,
    defaultMode: options.defaultMode ?? 'agent',
    createdAt: now,
    updatedAt: now,
  };
}

export function filterConversationsByQueryAndProject(
  conversations: Conversation[],
  query: string,
  projectId: string | null,
  getPreview: (c: Conversation) => string | null,
): Conversation[] {
  const q = query.trim().toLowerCase();
  return conversations.filter((c) => {
    if (projectId && c.projectId !== projectId) return false;
    if (!q) return true;
    if (c.title.toLowerCase().includes(q)) return true;
    const preview = getPreview(c);
    return preview ? preview.toLowerCase().includes(q) : false;
  });
}

export function partitionPinnedConversations(
  conversations: Conversation[],
): { pinned: Conversation[]; regular: Conversation[] } {
  const pinned: Conversation[] = [];
  const regular: Conversation[] = [];
  for (const conv of conversations) {
    if (conv.pinned) {
      pinned.push(conv);
    } else {
      regular.push(conv);
    }
  }
  return { pinned, regular };
}

export function formatReasoningEffortLabel(highThinking: boolean): 'High' | 'Standard' {
  return highThinking ? 'High' : 'Standard';
}

export function shortenModelLabel(label: string): string {
  return label
    .replace(/^Google\s+/i, '')
    .replace(/^Anthropic\s+/i, '')
    .replace(/^OpenAI\s+/i, '')
    .trim();
}
