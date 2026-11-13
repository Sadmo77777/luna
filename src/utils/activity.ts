import type { ActivityKind, AgentStepEvent } from '../types/workspace';

export function mapToolToActivity(
  toolName: string,
  status: 'running' | 'done' | 'error',
  args?: Record<string, unknown>,
  output?: string,
): {
  kind: ActivityKind;
  label: string;
  detail?: string;
  output?: string;
} {
  const cleanDetail = (raw: unknown): string | undefined => {
    if (raw === undefined || raw === null) return undefined;
    const str = String(raw).trim();
    return str ? str.slice(0, 72) : undefined;
  };

  switch (toolName) {
    case 'run_shell':
      return {
        kind: 'command',
        label:
          status === 'running'
            ? 'Running command'
            : status === 'error'
              ? 'Command failed'
              : 'Ran command',
        detail: cleanDetail(args?.command),
        output,
      };
    case 'run_js':
      return {
        kind: 'code',
        label:
          status === 'running'
            ? 'Running script'
            : status === 'error'
              ? 'Script failed'
              : 'Ran script',
        detail: cleanDetail(args?.code)?.replace(/\s+/g, ' '),
        output,
      };
    case 'read_file':
      return {
        kind: 'file',
        label:
          status === 'running'
            ? 'Reading file'
            : status === 'error'
              ? 'File read failed'
              : 'Read file',
        detail: cleanDetail(args?.path),
        output,
      };
    case 'list_files':
      return {
        kind: 'folder',
        label:
          status === 'running'
            ? 'Scanning files'
            : status === 'error'
              ? 'File scan failed'
              : 'Scanned files',
        detail: cleanDetail(args?.path ?? '.'),
        output,
      };
    case 'fetch_url':
      return {
        kind: 'web',
        label:
          status === 'running'
            ? 'Fetching page'
            : status === 'error'
              ? 'Page fetch failed'
              : 'Fetched page',
        detail: cleanDetail(args?.url),
        output,
      };
    case 'save_doc':
      return {
        kind: 'memory',
        label:
          status === 'running'
            ? 'Saving to memory'
            : status === 'error'
              ? 'Memory save failed'
              : 'Saved to memory',
        detail: cleanDetail(args?.title),
        output,
      };
    case 'run_sandbox':
      return {
        kind: 'sandbox',
        label:
          status === 'running'
            ? 'Updating preview'
            : status === 'error'
              ? 'Preview failed'
              : 'Updated preview',
        detail: cleanDetail(args?.language),
        output,
      };
    case 'set_theme':
      return {
        kind: 'theme',
        label:
          status === 'running'
            ? 'Changing theme'
            : status === 'error'
              ? 'Theme change failed'
              : 'Updated theme',
        detail: cleanDetail(args?.themeId),
        output,
      };
    case 'set_companion_state':
      return {
        kind: 'companion',
        label:
          status === 'running'
            ? 'Updating companion'
            : status === 'error'
              ? 'Companion update failed'
              : 'Updated companion',
        detail: cleanDetail(args?.state),
        output,
      };
    default:
      return {
        kind: 'command',
        label:
          status === 'running'
            ? `Running ${toolName}`
            : status === 'error'
              ? `${toolName} failed`
              : `Completed ${toolName}`,
        detail: args
          ? Object.values(args)
              .map((v) => String(v))
              .join(' ')
              .slice(0, 72) || undefined
          : undefined,
        output,
      };
  }
}

export function summarizeActivitySteps(steps: AgentStepEvent[]): string {
  if (steps.length === 0) return '';
  if (steps.length === 1) return steps[0].label;
  const labels = steps.slice(0, 3).map((s) => s.label);
  const extra = steps.length > 3 ? ` +${steps.length - 3}` : '';
  return `${steps.length} steps · ${labels.join(', ')}${extra}`;
}
