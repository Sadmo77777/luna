import { useState } from 'react';
import {
  AlertCircle,
  BookmarkCheck,
  Brain,
  Check,
  ChevronRight,
  Code2,
  FileText,
  FolderSearch,
  Globe,
  Loader2,
  Palette,
  Play,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { ActivityKind, AgentStepEvent } from '../types/workspace';
import { summarizeActivitySteps } from '../utils/activity';

function StepIcon({
  kind,
  status,
}: {
  kind: ActivityKind;
  status: 'running' | 'done' | 'error';
}) {
  if (status === 'error') {
    return <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />;
  }
  const pulse = status === 'running' ? 'animate-pulse' : '';
  const color = status === 'running' ? 'var(--app-accent-hex)' : 'var(--app-text-muted)';
  const style = { color };

  switch (kind) {
    case 'thinking':
      return <Brain className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'memory':
      return <BookmarkCheck className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'search':
    case 'web':
      return <Globe className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'command':
      return <Terminal className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'code':
      return <Code2 className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'file':
      return <FileText className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'folder':
      return <FolderSearch className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'sandbox':
      return <Play className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'theme':
      return <Palette className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'companion':
      return <Sparkles className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />;
    default:
      return <Terminal className={`w-3.5 h-3.5 shrink-0 ${pulse}`} style={style} />;
  }
}

export function ActivityTrace({
  steps,
  compact = false,
}: {
  steps?: AgentStepEvent[];
  compact?: boolean;
}) {
  const [expandedAll, setExpandedAll] = useState(false);
  const [openStepIds, setOpenStepIds] = useState<Record<string, boolean>>({});

  if (!steps || steps.length === 0) return null;

  const hasRunning = steps.some((s) => s.status === 'running');
  const hasError = steps.some((s) => s.status === 'error');
  const showRows = hasRunning || hasError || expandedAll;

  return (
    <div className="space-y-1.5 min-w-0 animate-fade-up" data-testid="ai-activity-trace">
      {!hasRunning && !hasError && (
        <button
          type="button"
          onClick={() => setExpandedAll((v) => !v)}
          aria-expanded={expandedAll}
          className={`btn-lift inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border transition-colors hover:opacity-90 ${
            compact
              ? 'bg-slate-900/5 border-slate-900/10 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-[#c9c8c0]'
              : ''
          }`}
          style={
            compact
              ? undefined
              : {
                  borderColor: 'var(--app-border-color)',
                  backgroundColor: 'var(--app-surface-bg)',
                  color: 'var(--app-text-muted)',
                }
          }
        >
          <StepIcon kind={steps[steps.length - 1].kind} status="done" />
          <span className="truncate max-w-[260px] sm:max-w-[380px]">
            {summarizeActivitySteps(steps)}
          </span>
          <ChevronRight
            className={`w-3 h-3 shrink-0 transition-transform ${
              expandedAll ? 'rotate-90' : ''
            }`}
          />
        </button>
      )}

      {showRows && (
        <div className="space-y-1">
          {steps.map((step) => {
            const isFailed = step.status === 'error';
            const isRunning = step.status === 'running';
            const hasExpandableBody = Boolean(step.output || (isFailed && step.detail));
            const open = openStepIds[step.id] ?? isFailed;

            return (
              <div
                key={step.id}
                data-testid={`activity-step-${step.kind}-${step.status}`}
                className={`rounded-xl border text-xs overflow-hidden theme-transition ${
                  isFailed
                    ? 'border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-950/35'
                    : compact
                      ? 'border-slate-200 bg-white/85 dark:border-white/12 dark:bg-[#1c1c1a]/70'
                      : ''
                }`}
                style={
                  isFailed || compact
                    ? undefined
                    : {
                        borderColor: 'var(--app-border-color)',
                        backgroundColor: 'var(--app-surface-bg)',
                      }
                }
              >
                <button
                  type="button"
                  disabled={!hasExpandableBody}
                  onClick={() => {
                    if (!hasExpandableBody) return;
                    setOpenStepIds((prev) => ({
                      ...prev,
                      [step.id]: !open,
                    }));
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left ${
                    hasExpandableBody
                      ? 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5'
                      : 'cursor-default'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <StepIcon kind={step.kind} status={step.status} />
                    <span
                      className={`font-medium shrink-0 ${
                        isFailed
                          ? 'text-rose-800 dark:text-rose-300'
                          : compact
                            ? 'text-slate-900 dark:text-[#eeeeec]'
                            : ''
                      }`}
                      style={
                        isFailed || compact
                          ? undefined
                          : { color: 'var(--app-text-primary)' }
                      }
                    >
                      {step.label}
                    </span>
                    {step.detail && (
                      <span
                        className={`truncate font-mono text-[11px] ${
                          isFailed
                            ? 'text-rose-700/80 dark:text-rose-200/80'
                            : compact
                              ? 'text-slate-500 dark:text-[#a6a59e]'
                              : ''
                        }`}
                        style={
                          isFailed || compact
                            ? undefined
                            : { color: 'var(--app-text-muted)' }
                        }
                      >
                        {step.detail}
                      </span>
                    )}
                  </div>

                  <span className="flex items-center gap-1 shrink-0 text-[11px]">
                    {isRunning ? (
                      <Loader2
                        className="w-3.5 h-3.5 animate-spin"
                        style={{ color: 'var(--app-accent-hex)' }}
                      />
                    ) : isFailed ? (
                      <span className="text-rose-600 dark:text-rose-400 font-medium">
                        Failed
                      </span>
                    ) : (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    )}
                    {hasExpandableBody && (
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${
                          open ? 'rotate-90' : ''
                        }`}
                        style={{ color: 'var(--app-text-muted)' }}
                      />
                    )}
                  </span>
                </button>

                {open && (step.output || (isFailed && step.detail)) && (
                  <pre
                    className={`px-3 py-2 border-t font-mono text-[11px] whitespace-pre-wrap [overflow-wrap:anywhere] max-h-48 overflow-y-auto ${
                      isFailed
                        ? 'border-rose-200 text-rose-900 dark:border-rose-500/25 dark:text-rose-200'
                        : ''
                    }`}
                    style={
                      isFailed
                        ? undefined
                        : {
                            borderColor: 'var(--app-border-color)',
                            color: 'var(--app-text-muted)',
                          }
                    }
                  >
                    {step.output || step.detail}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StreamingAnswerIndicator({
  active,
  hasContent,
  thinking = false,
  compact = false,
}: {
  active: boolean;
  hasContent: boolean;
  thinking?: boolean;
  compact?: boolean;
}) {
  if (!active) return null;

  if (!hasContent) {
    return (
      <div
        data-testid="streaming-typing-indicator"
        className="inline-flex items-center gap-2 py-1 text-xs animate-fade-up"
        style={{ color: compact ? '#c9c8c0' : 'var(--app-text-muted)' }}
      >
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          {[0, 140, 280].map((delay) => (
            <span
              key={delay}
              className="w-1.5 h-1.5 rounded-full animate-typing-dot"
              style={{
                backgroundColor: 'var(--app-accent-hex)',
                animationDelay: `${delay}ms`,
              }}
            />
          ))}
        </span>
        <span>{thinking ? 'Thinking…' : 'Responding…'}</span>
      </div>
    );
  }

  return (
    <div
      data-testid="streaming-cursor-orb"
      className="inline-flex items-center gap-1.5 pt-1"
      aria-label="Streaming response"
    >
      <span
        className="inline-block w-2 h-2 rounded-full animate-stream-orb"
        style={{ backgroundColor: 'var(--app-accent-hex)' }}
      />
    </div>
  );
}
