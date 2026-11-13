import { Brain, Check, ChevronDown, Settings2 } from 'lucide-react';
import type { ProviderConfig } from '../types/workspace';
import {
  formatReasoningEffortLabel,
  shortenModelLabel,
} from '../utils/projects';

interface InlineModelPopoverProps {
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  providers: ProviderConfig[];
  activeProvider: ProviderConfig;
  onSelectProvider?: (id: string) => void;
  highThinking: boolean;
  onToggleHighThinking: () => void;
  onOpenModelsSettings: () => void;
}

export function InlineModelPopover({
  open,
  onToggleOpen,
  onClose,
  providers,
  activeProvider,
  onSelectProvider,
  highThinking,
  onToggleHighThinking,
  onOpenModelsSettings,
}: InlineModelPopoverProps) {
  const shortModel = shortenModelLabel(activeProvider.label);
  const effortLabel = formatReasoningEffortLabel(highThinking);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label="Select model and reasoning effort"
        aria-expanded={open}
        className="h-8 px-2.5 rounded-full inline-flex items-center gap-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/[0.07] transition-colors"
        style={{ color: 'var(--app-text-primary)' }}
      >
        <span className="font-medium truncate max-w-[125px] sm:max-w-[170px]">
          {shortModel}
        </span>
        <span
          className="text-[11px] font-normal shrink-0"
          style={{
            color: highThinking
              ? 'var(--app-accent-hex)'
              : 'var(--app-text-muted)',
          }}
        >
          {effortLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          style={{ color: 'var(--app-text-muted)' }}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="Model and reasoning effort"
            className="absolute right-0 bottom-full mb-2 z-40 w-[268px] max-w-[calc(100vw-24px)] rounded-2xl border p-2 shadow-2xl animate-popover-up theme-transition space-y-2"
            style={{
              borderColor: 'var(--app-border-color)',
              backgroundColor: 'var(--app-surface-bg)',
              color: 'var(--app-text-primary)',
            }}
          >
            {/* Reasoning Effort Toggle Row */}
            <div className="p-1 rounded-xl space-y-1">
              <div
                className="px-2 pt-0.5 text-[10px] font-medium uppercase tracking-wide flex items-center gap-1.5"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <Brain className="w-3 h-3" />
                <span>Reasoning effort</span>
              </div>
              <div
                className="grid grid-cols-2 gap-1 p-1 rounded-xl"
                style={{ backgroundColor: 'var(--app-canvas-bg)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (highThinking) onToggleHighThinking();
                  }}
                  className="py-1.5 px-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: !highThinking
                      ? 'var(--app-surface-bg)'
                      : 'transparent',
                    color: !highThinking
                      ? 'var(--app-text-primary)'
                      : 'var(--app-text-muted)',
                  }}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!highThinking) onToggleHighThinking();
                  }}
                  className="py-1.5 px-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: highThinking
                      ? 'var(--app-surface-bg)'
                      : 'transparent',
                    color: highThinking
                      ? 'var(--app-accent-hex)'
                      : 'var(--app-text-muted)',
                  }}
                >
                  High
                </button>
              </div>
            </div>

            <div
              className="border-t pt-1.5 space-y-0.5 max-h-52 overflow-y-auto"
              style={{ borderColor: 'var(--app-border-color)' }}
            >
              <div
                className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide"
                style={{ color: 'var(--app-text-muted)' }}
              >
                Model
              </div>
              {providers.map((prov) => {
                const selected = prov.id === activeProvider.id;
                const needsKey =
                  prov.providerType !== 'gemini' &&
                  prov.providerType !== 'ollama' &&
                  !prov.customApiKey?.trim();
                return (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => {
                      if (needsKey) {
                        onClose();
                        onOpenModelsSettings();
                        return;
                      }
                      onSelectProvider?.(prov.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs hover:bg-black/5 dark:hover:bg-white/[0.06]"
                    style={{
                      backgroundColor: selected
                        ? 'var(--app-elevated-bg)'
                        : 'transparent',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {shortenModelLabel(prov.label)}
                      </div>
                      <div
                        className="text-[10px] truncate"
                        style={{ color: 'var(--app-text-muted)' }}
                      >
                        {needsKey ? 'Add API key to use' : prov.modelId}
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

            <div
              className="border-t pt-1.5"
              style={{ borderColor: 'var(--app-border-color)' }}
            >
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenModelsSettings();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs hover:bg-black/5 dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <Settings2 className="w-3.5 h-3.5 shrink-0" />
                <span>Configure APIs &amp; custom models</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
