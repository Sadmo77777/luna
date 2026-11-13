import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  Camera,
  Check,
  ChevronRight,
  Code2,
  Download,
  FolderPlus,
  Folders,
  GitBranch,
  Globe,
  Link2,
  Loader2,
  Palette,
  Paperclip,
  Plug,
  Plus,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { ProjectFolder } from '../types/workspace';
import {
  ACCENT_PRESETS,
  WORKSPACE_THEMES,
  type AiPersonaId,
  type ThemeId,
} from '../utils/themes';

type SubmenuId =
  | null
  | 'project'
  | 'github'
  | 'skills'
  | 'connectors'
  | 'design'
  | 'plugins';

interface ComposerMenuProps {
  open: boolean;
  onClose: () => void;
  onUploadFiles: () => void;
  onTakeScreenshot: () => void;
  projects: ProjectFolder[];
  activeProjectId?: string;
  onSelectProject: (projectId: string | undefined) => void;
  onCreateProject: (name: string) => void;
  onAttachUrl: (url: string) => Promise<string | null>;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  highThinking: boolean;
  onToggleHighThinking: () => void;
  useDocContext: boolean;
  onToggleUseDocContext: () => void;
  activeThemeId?: ThemeId;
  onSelectTheme?: (id: ThemeId) => void;
  activeAccentHex?: string;
  onSelectAccent?: (hex: string) => void;
  activePersona?: AiPersonaId;
  onSelectPersona?: (persona: AiPersonaId) => void;
  onOpenAgentSandbox?: () => void;
  canExportChat?: boolean;
  onExportChat?: () => void;
}

const SKILL_ITEMS: Array<{ id: AiPersonaId; name: string; desc: string }> = [
  { id: 'balanced', name: 'Balanced Assistant', desc: 'Clear & adaptable replies' },
  { id: 'concise', name: 'Concise Brief', desc: 'Direct takeaways, zero filler' },
  { id: 'coder', name: 'Code Architect', desc: 'TypeScript-first, edge-case rigor' },
  { id: 'creative', name: 'Creative Writer', desc: 'Vivid framing & fresh prose' },
  { id: 'tutor', name: 'Step-by-step Tutor', desc: 'Guided explanations' },
];

export function ComposerMenu({
  open,
  onClose,
  onUploadFiles,
  onTakeScreenshot,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onAttachUrl,
  webSearch,
  onToggleWebSearch,
  highThinking,
  onToggleHighThinking,
  useDocContext,
  onToggleUseDocContext,
  activeThemeId,
  onSelectTheme,
  activeAccentHex,
  onSelectAccent,
  activePersona,
  onSelectPersona,
  onOpenAgentSandbox,
  canExportChat,
  onExportChat,
}: ComposerMenuProps) {
  const [submenu, setSubmenu] = useState<SubmenuId>(null);
  const [projectQuery, setProjectQuery] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [githubValue, setGithubValue] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSubmenu(null);
      setNewProjectOpen(false);
      setUrlError(null);
    }
  }, [open]);

  if (!open) return null;

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectQuery.trim().toLowerCase()),
  );

  const handleSubmitUrl = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (!trimmed || urlBusy) return;
    setUrlBusy(true);
    setUrlError(null);
    const err = await onAttachUrl(trimmed);
    setUrlBusy(false);
    if (err) {
      setUrlError(err);
    } else {
      setUrlValue('');
      setGithubValue('');
      onClose();
    }
  };

  const handleCreateProject = () => {
    const clean = newProjectName.trim();
    if (!clean) return;
    onCreateProject(clean);
    setNewProjectName('');
    setNewProjectOpen(false);
    onClose();
  };

  const renderSubmenuContent = (kind: Exclude<SubmenuId, null>) => {
    if (kind === 'project') {
      return (
        <div className="p-2 space-y-2">
          <div className="px-1.5">
            <input
              type="text"
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              placeholder="Search or create a project"
              aria-label="Search or create a project"
              className="w-full rounded-xl border px-2.5 py-1.5 text-xs focus:outline-none"
              style={{
                borderColor: 'var(--app-border-color)',
                backgroundColor: 'var(--app-canvas-bg)',
                color: 'var(--app-text-primary)',
              }}
            />
          </div>

          <div
            className="border-t pt-1.5 space-y-0.5"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            {newProjectOpen ? (
              <div className="px-1.5 py-1 space-y-1.5">
                <input
                  type="text"
                  autoFocus
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateProject();
                    }
                  }}
                  placeholder="Project folder name..."
                  aria-label="New project folder name"
                  className="w-full rounded-xl border px-2.5 py-1.5 text-xs focus:outline-none"
                  style={{
                    borderColor: 'var(--app-border-color)',
                    backgroundColor: 'var(--app-canvas-bg)',
                  }}
                />
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewProjectOpen(false)}
                    className="px-2 py-1 rounded-lg text-[11px] border"
                    style={{
                      borderColor: 'var(--app-border-color)',
                      color: 'var(--app-text-muted)',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!newProjectName.trim()}
                    onClick={handleCreateProject}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: 'var(--app-accent-hex)' }}
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (projectQuery.trim()) {
                    onCreateProject(projectQuery.trim());
                    setProjectQuery('');
                    onClose();
                  } else {
                    setNewProjectOpen(true);
                  }
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {projectQuery.trim()
                    ? `Create "${projectQuery.trim()}"`
                    : 'New project'}
                </span>
              </button>
            )}

            <div className="max-h-48 overflow-y-auto space-y-0.5 pt-0.5">
              {filteredProjects.map((proj) => {
                const selected = activeProjectId === proj.id;
                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => {
                      onSelectProject(selected ? undefined : proj.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/[0.06]"
                    style={{
                      backgroundColor: selected
                        ? 'var(--app-elevated-bg)'
                        : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Folders
                        className="w-3.5 h-3.5 shrink-0 icon-folder"
                        style={{ color: 'var(--app-text-muted)' }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">
                          {proj.name}
                        </div>
                        {proj.description && (
                          <div
                            className="text-[10px] truncate"
                            style={{ color: 'var(--app-text-muted)' }}
                          >
                            {proj.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {selected && (
                      <Check
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: 'var(--app-accent-hex)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (kind === 'github') {
      return (
        <div className="p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <GitBranch
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: 'var(--app-accent-hex)' }}
            />
            <span className="text-xs font-medium">Add from GitHub</span>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>
            Paste a public GitHub repo, file, or README URL to pull its contents into chat context.
          </p>
          <input
            type="url"
            autoFocus
            value={githubValue}
            onChange={(e) => {
              setGithubValue(e.target.value);
              if (urlError) setUrlError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmitUrl(githubValue);
              }
            }}
            placeholder="https://github.com/owner/repo"
            aria-label="GitHub repository or file URL"
            className="w-full rounded-xl border px-2.5 py-1.5 text-xs focus:outline-none"
            style={{
              borderColor: 'var(--app-border-color)',
              backgroundColor: 'var(--app-canvas-bg)',
            }}
          />
          {urlError && (
            <div className="text-[11px] text-rose-500">{urlError}</div>
          )}
          <button
            type="button"
            disabled={!githubValue.trim() || urlBusy}
            onClick={() => void handleSubmitUrl(githubValue)}
            className="w-full py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--app-accent-hex)' }}
          >
            {urlBusy && <Loader2 className="w-3 h-3 animate-spin" />}
            <span>{urlBusy ? 'Fetching repository...' : 'Attach GitHub link'}</span>
          </button>
        </div>
      );
    }

    if (kind === 'skills') {
      return (
        <div className="p-1.5 space-y-0.5">
          {SKILL_ITEMS.map((item) => {
            const active = activePersona === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectPersona?.(item.id);
                  onClose();
                }}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/[0.06]"
                style={{
                  backgroundColor: active ? 'var(--app-elevated-bg)' : 'transparent',
                }}
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{item.name}</div>
                  <div
                    className="text-[10px] truncate"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    {item.desc}
                  </div>
                </div>
                {active && (
                  <Check
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--app-accent-hex)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      );
    }

    if (kind === 'connectors') {
      return (
        <div className="p-3 space-y-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Link2
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--app-accent-hex)' }}
              />
              <span className="text-xs font-medium">Fetch web page URL</span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="url"
                value={urlValue}
                onChange={(e) => {
                  setUrlValue(e.target.value);
                  if (urlError) setUrlError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSubmitUrl(urlValue);
                  }
                }}
                placeholder="https://example.com/article"
                aria-label="Public URL to attach"
                className="flex-1 min-w-0 rounded-xl border px-2.5 py-1.5 text-xs focus:outline-none"
                style={{
                  borderColor: 'var(--app-border-color)',
                  backgroundColor: 'var(--app-canvas-bg)',
                }}
              />
              <button
                type="button"
                disabled={!urlValue.trim() || urlBusy}
                onClick={() => void handleSubmitUrl(urlValue)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-white disabled:opacity-40 flex items-center gap-1"
                style={{ backgroundColor: 'var(--app-accent-hex)' }}
              >
                {urlBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Attach</span>
              </button>
            </div>
            {urlError && (
              <div className="text-[11px] text-rose-500">{urlError}</div>
            )}
          </div>

          <div
            className="pt-2 border-t flex items-center justify-between gap-2"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            <button
              type="button"
              onClick={onToggleUseDocContext}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
            >
              <div className="flex items-center gap-2">
                <BookOpen
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--app-text-muted)' }}
                />
                <span className="text-xs font-medium">Workspace notes</span>
              </div>
              {useDocContext && (
                <Check
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--app-accent-hex)' }}
                />
              )}
            </button>
          </div>
        </div>
      );
    }

    if (kind === 'design') {
      return (
        <div className="p-2.5 space-y-2.5">
          <div className="space-y-1">
            <div
              className="px-1 text-[10px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--app-text-muted)' }}
            >
              Theme
            </div>
            {(Object.keys(WORKSPACE_THEMES) as ThemeId[]).map((id) => {
              const t = WORKSPACE_THEMES[id];
              const active = activeThemeId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTheme?.(id)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06]"
                  style={{
                    backgroundColor: active ? 'var(--app-elevated-bg)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border shrink-0"
                      style={{
                        backgroundColor: t.canvasBg,
                        borderColor: t.accentHex,
                      }}
                    />
                    <span className="font-medium">{t.name}</span>
                  </div>
                  {active && (
                    <Check
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: 'var(--app-accent-hex)' }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div
            className="pt-2 border-t space-y-1.5"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            <div
              className="px-1 text-[10px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--app-text-muted)' }}
            >
              Main Color
            </div>
            <div className="flex flex-wrap gap-1.5 px-1">
              {ACCENT_PRESETS.map((preset) => {
                const selected =
                  activeAccentHex?.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    aria-label={`Set main color ${preset.label}`}
                    onClick={() => onSelectAccent?.(preset.hex)}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      selected ? 'ring-2 ring-offset-1 scale-110' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // plugins
    return (
      <div className="p-1.5 space-y-0.5">
        {onOpenAgentSandbox && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAgentSandbox();
            }}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
          >
            <div className="flex items-center gap-2.5">
              <Code2 className="w-3.5 h-3.5 icon-code" />
              <span>Code Sandbox &amp; Agent</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>
        )}

        {canExportChat && onExportChat && (
          <button
            type="button"
            onClick={() => {
              onExportChat();
              onClose();
            }}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
          >
            <div className="flex items-center gap-2.5">
              <Download className="w-3.5 h-3.5 icon-send" />
              <span>Export conversation (.md)</span>
            </div>
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/20 sm:bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute left-0 bottom-full mb-2.5 z-40 flex items-end gap-2 max-w-[calc(100vw-24px)]">
        {/* Primary Claude-style Menu */}
        <div
          role="menu"
          aria-label="Add to chat menu"
          className="w-[248px] max-h-[min(340px,calc(100dvh-260px))] sm:max-h-[min(460px,calc(100dvh-115px))] overflow-y-auto rounded-2xl border p-1.5 shadow-2xl animate-popover-up theme-transition"
          style={{
            borderColor: 'var(--app-border-color)',
            backgroundColor: 'var(--app-surface-bg)',
            color: 'var(--app-text-primary)',
          }}
        >
          {submenu && (
            <div className="sm:hidden pb-1 mb-1 border-b" style={{ borderColor: 'var(--app-border-color)' }}>
              <button
                type="button"
                onClick={() => setSubmenu(null)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium hover:bg-black/5 dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
              {renderSubmenuContent(submenu)}
            </div>
          )}

          <div className={submenu ? 'hidden sm:block' : 'block'}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onUploadFiles();
                onClose();
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
            >
              <span className="flex items-center gap-2.5">
                <Paperclip className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                <span>Upload or add files</span>
              </span>
              <span
                className="text-[11px] font-mono"
                style={{ color: 'var(--app-text-muted)' }}
              >
                Ctrl+U
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onTakeScreenshot();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
            >
              <Camera className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
              <span>Take a screenshot</span>
            </button>

            <button
              type="button"
              role="menuitem"
              aria-expanded={submenu === 'project'}
              onClick={() => setSubmenu('project')}
              onMouseEnter={() => {
                if (window.innerWidth >= 640) setSubmenu('project');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
              style={{
                backgroundColor:
                  submenu === 'project' ? 'var(--app-elevated-bg)' : undefined,
              }}
            >
              <span className="flex items-center gap-2.5">
                <FolderPlus className="w-4 h-4 shrink-0 icon-folder" style={{ color: 'var(--app-text-muted)' }} />
                <span>Add to project</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            </button>

            <button
              type="button"
              role="menuitem"
              aria-expanded={submenu === 'github'}
              onClick={() => setSubmenu('github')}
              onMouseEnter={() => {
                if (window.innerWidth >= 640) setSubmenu('github');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
              style={{
                backgroundColor:
                  submenu === 'github' ? 'var(--app-elevated-bg)' : undefined,
              }}
            >
              <span className="flex items-center gap-2.5">
                <GitBranch className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                <span>Add from GitHub</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            </button>

            <div
              className="my-1 border-t"
              style={{ borderColor: 'var(--app-border-color)' }}
            />

            <button
              type="button"
              role="menuitem"
              aria-expanded={submenu === 'skills'}
              onClick={() => setSubmenu('skills')}
              onMouseEnter={() => {
                if (window.innerWidth >= 640) setSubmenu('skills');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
              style={{
                backgroundColor:
                  submenu === 'skills' ? 'var(--app-elevated-bg)' : undefined,
              }}
            >
              <span className="flex items-center gap-2.5">
                <Wand2 className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                <span>Skills</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            </button>

            <button
              type="button"
              role="menuitem"
              aria-expanded={submenu === 'connectors'}
              onClick={() => setSubmenu('connectors')}
              onMouseEnter={() => {
                if (window.innerWidth >= 640) setSubmenu('connectors');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
              style={{
                backgroundColor:
                  submenu === 'connectors' ? 'var(--app-elevated-bg)' : undefined,
              }}
            >
              <span className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 shrink-0 icon-sparkle" style={{ color: 'var(--app-text-muted)' }} />
                <span>Connectors</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            </button>

            <button
              type="button"
              role="menuitem"
              aria-expanded={submenu === 'design'}
              onClick={() => setSubmenu('design')}
              onMouseEnter={() => {
                if (window.innerWidth >= 640) setSubmenu('design');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
              style={{
                backgroundColor:
                  submenu === 'design' ? 'var(--app-elevated-bg)' : undefined,
              }}
            >
              <span className="flex items-center gap-2.5">
                <Palette className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                <span>Design system</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            </button>

            <button
              type="button"
              role="menuitem"
              aria-expanded={submenu === 'plugins'}
              onClick={() => setSubmenu('plugins')}
              onMouseEnter={() => {
                if (window.innerWidth >= 640) setSubmenu('plugins');
              }}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
              style={{
                backgroundColor:
                  submenu === 'plugins' ? 'var(--app-elevated-bg)' : undefined,
              }}
            >
              <span className="flex items-center gap-2.5">
                <Plug className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                <span>Plugins</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
            </button>

            <div
              className="my-1 border-t"
              style={{ borderColor: 'var(--app-border-color)' }}
            />

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={webSearch}
              onClick={onToggleWebSearch}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
            >
              <span className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                <span>Web search</span>
              </span>
              {webSearch && (
                <Check
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--app-accent-hex)' }}
                />
              )}
            </button>

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={highThinking}
              onClick={onToggleHighThinking}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
            >
              <span className="flex items-center gap-2.5">
                <Brain className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                <span>Deep thinking</span>
              </span>
              {highThinking && (
                <Check
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--app-accent-hex)' }}
                />
              )}
            </button>

            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={useDocContext}
              onClick={onToggleUseDocContext}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-[13px] hover:bg-black/5 dark:hover:bg-white/[0.06] text-left"
            >
              <span className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--app-text-muted)' }} />
                <span>Memory</span>
              </span>
              {useDocContext && (
                <Check
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--app-accent-hex)' }}
                />
              )}
            </button>
          </div>
        </div>

        {/* Cascading Submenu Card on Desktop */}
        {submenu && (
          <div
            className="hidden sm:block w-[256px] rounded-2xl border shadow-2xl animate-submenu-in theme-transition"
            style={{
              borderColor: 'var(--app-border-color)',
              backgroundColor: 'var(--app-surface-bg)',
              color: 'var(--app-text-primary)',
            }}
          >
            {renderSubmenuContent(submenu)}
          </div>
        )}
      </div>
    </>
  );
}
