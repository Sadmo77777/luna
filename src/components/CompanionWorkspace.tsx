import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Laptop,
  Layers,
  Mic,
  MicOff,
  Smartphone,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import type {
  ChatMessage,
  CompanionAnimState,
  DeviceSyncNode,
} from '../types/workspace';
import type { MessageFeedback } from '../utils/messageActions';
import { ActivityTrace, StreamingAnswerIndicator } from './ActivityTrace';
import { Companion3DCanvas } from './Companion3DCanvas';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageActionBar } from './MessageActionBar';

interface CompanionWorkspaceProps {
  animState: CompanionAnimState;
  messages: ChatMessage[];
  isStreaming: boolean;
  devices: DeviceSyncNode[];
  e2eeFingerprint: string | null;
  overlayEnabled: boolean;
  enterToSend?: boolean;
  isDark?: boolean;
  active?: boolean;
  ttsOptions?: { rate?: number; pitch?: number; voiceName?: string };
  onToggleOverlay: () => void;
  onSetCompanionState?: (state: CompanionAnimState) => void;
  onSendCompanionMessage: (text: string) => void;
  onRateMessage?: (messageId: string, rating: MessageFeedback) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onEditUserMessage?: (messageId: string, newContent: string) => void;
  onSyncDeviceMode: (
    platform: 'windows' | 'android' | 'web',
    mode: 'overlay' | 'background_service' | 'web_viewport',
  ) => void;
}

export function CompanionWorkspace({
  animState,
  messages,
  isStreaming,
  devices,
  e2eeFingerprint,
  overlayEnabled,
  enterToSend = true,
  isDark = true,
  active = true,
  ttsOptions,
  onToggleOverlay,
  onSetCompanionState,
  onSendCompanionMessage,
  onRateMessage,
  onRegenerateMessage,
  onEditUserMessage,
  onSyncDeviceMode,
}: CompanionWorkspaceProps) {
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [dialogueCollapsed, setDialogueCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [lastSyncedId, setLastSyncedId] = useState<string | null>(null);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const logRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dictationPrefixRef = useRef('');

  const latestAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.content.trim()) return m.content;
    }
    return undefined;
  }, [messages]);

  const handleDictateTranscript = useCallback((spoken: string) => {
    const prefix = dictationPrefixRef.current;
    setInput(prefix ? `${prefix} ${spoken}` : spoken);
  }, []);

  const handleVoiceSubmit = useCallback(
    (spokenText: string) => {
      setDialogueCollapsed(false);
      onSendCompanionMessage(spokenText);
    },
    [onSendCompanionMessage],
  );

  const {
    isDictating,
    isTranscribing,
    voiceMode,
    voicePhase,
    muted,
    liveTranscript,
    voiceError,
    clearVoiceError,
    toggleDictation,
    toggleVoiceMode,
    toggleMute,
    tapToListen,
  } = useVoiceAssistant({
    isStreaming,
    latestAssistantText,
    onDictateTranscript: handleDictateTranscript,
    onVoiceSubmit: handleVoiceSubmit,
  });

  useEffect(() => {
    if (!voiceMode || !onSetCompanionState) return;
    if (voicePhase === 'thinking') onSetCompanionState('thinking');
    else if (voicePhase === 'speaking') onSetCompanionState('talking');
    else onSetCompanionState('idle');
  }, [voiceMode, voicePhase, onSetCompanionState]);

  const handleMicClick = () => {
    if (!isDictating) {
      dictationPrefixRef.current = input.trim();
    }
    toggleDictation();
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = Math.max(120, Math.round(window.innerHeight * 0.35));
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
  }, [input]);

  useEffect(() => {
    if (logRef.current && !dialogueCollapsed) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, dialogueCollapsed]);

  const send = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    setDialogueCollapsed(false);
    onSendCompanionMessage(text);
  };

  const triggerDeviceSync = (
    platform: 'windows' | 'android',
    mode: 'overlay' | 'background_service',
  ) => {
    onSyncDeviceMode(platform, mode);
    setLastSyncedId(platform);
    setTimeout(() => setLastSyncedId(null), 1800);
  };

  return (
    <div
      className="relative w-full h-full min-h-0 overflow-hidden theme-transition"
      style={{ backgroundColor: isDark ? '#2a2a28' : '#f5f6fa' }}
    >
      {/* Full-bleed Interactive 3D Companion Stage */}
      <Companion3DCanvas animState={animState} isDark={isDark} active={active} />

      {/* Minimal Top-Right Controls */}
      <div className="absolute top-3 right-3.5 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDevicesOpen((v) => !v)}
          aria-expanded={devicesOpen}
          className={`btn-lift flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border backdrop-blur-sm transition-colors whitespace-nowrap ${
            isDark
              ? 'bg-[#1c1c1a]/75 hover:bg-[#1c1c1a] text-[#eeeeec] border-white/15'
              : 'bg-white/90 hover:bg-white text-slate-700 border-slate-200/80'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Devices</span>
        </button>

        <button
          type="button"
          onClick={onToggleOverlay}
          aria-label="Toggle Desktop Overlay"
          aria-pressed={overlayEnabled}
          className="btn-lift flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border backdrop-blur-sm whitespace-nowrap transition-colors"
          style={{
            backgroundColor: overlayEnabled
              ? 'var(--app-accent-hex)'
              : isDark
                ? 'rgba(28, 28, 26, 0.78)'
                : 'rgba(255, 255, 255, 0.9)',
            color: overlayEnabled
              ? '#ffffff'
              : isDark
                ? '#eeeeec'
                : '#334155',
            borderColor: overlayEnabled
              ? 'transparent'
              : isDark
                ? 'rgba(255, 255, 255, 0.15)'
                : 'rgba(226, 232, 240, 0.85)',
          }}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{overlayEnabled ? 'Overlay On' : 'Overlay'}</span>
        </button>
      </div>

      {/* Devices & Cross-Platform Sync Popover */}
      {devicesOpen && (
        <div
          role="dialog"
          aria-label="Companion devices and sync"
          className="absolute top-12 right-3.5 z-30 w-[calc(100vw-28px)] max-w-xs rounded-2xl p-4 shadow-2xl border space-y-4 text-xs"
          style={{
            backgroundColor: 'var(--app-surface-bg)',
            borderColor: 'var(--app-border-color)',
            color: 'var(--app-text-primary)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Cross-Platform Sync</span>
            <button
              type="button"
              onClick={() => setDevicesOpen(false)}
              aria-label="Close devices panel"
              className="p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p
            className="text-[11px] leading-relaxed"
            style={{ color: 'var(--app-text-muted)' }}
          >
            Push Luna&apos;s active pose and E2EE memory between desktop overlay
            and mobile background service.
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => triggerDeviceSync('windows', 'overlay')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--app-elevated-bg)' }}
            >
              <div className="flex items-center gap-2.5">
                <Laptop className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <div className="font-medium">Windows Overlay</div>
                  <div
                    className="text-[11px]"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    Always-on-top desktop widget
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-medium text-sky-400 flex items-center gap-1">
                {lastSyncedId === 'windows' ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Synced
                  </>
                ) : (
                  'Sync'
                )}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                triggerDeviceSync('android', 'background_service')
              }
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--app-elevated-bg)' }}
            >
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-medium">Android Background</div>
                  <div
                    className="text-[11px]"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    Mobile service &amp; wake sync
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                {lastSyncedId === 'android' ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Synced
                  </>
                ) : (
                  'Sync'
                )}
              </span>
            </button>
          </div>

          <div
            className="space-y-1.5 pt-2.5 border-t"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            <div className="flex items-center justify-between font-medium">
              <span>Devices ({devices.length})</span>
              {e2eeFingerprint && (
                <span
                  className="font-mono text-[11px]"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  {e2eeFingerprint.slice(0, 9)}
                </span>
              )}
            </div>
            <div
              className="max-h-36 overflow-y-auto divide-y"
              style={{ borderColor: 'var(--app-border-color)' }}
            >
              {devices.map((dev) => (
                <div
                  key={dev.id}
                  className="py-1.5 flex items-center justify-between gap-2"
                  style={{ borderColor: 'var(--app-border-color)' }}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{dev.deviceName}</div>
                    <div
                      className="text-[11px] tabular-nums"
                      style={{ color: 'var(--app-text-muted)' }}
                    >
                      {dev.platform} · {dev.companionMode.replace('_', ' ')} ·{' '}
                      {dev.companionState.replace('_', ' ')}
                    </div>
                  </div>
                  <span
                    className="text-[11px] tabular-nums shrink-0"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    {dev.lastSyncAt > 0
                      ? new Date(dev.lastSyncAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Ready to pair'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Dialogue & Pill Composer (Desktop + Phone Ready) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-3 sm:px-6 pb-3 sm:pb-5 gap-2">
        {messages.length > 0 && (
          <div className="pointer-events-auto w-full max-w-xl">
            <div className="flex justify-end mb-1">
              <button
                type="button"
                onClick={() => setDialogueCollapsed((v) => !v)}
                className="btn-lift flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border shadow-sm backdrop-blur-sm"
                style={{
                  backgroundColor: isDark
                    ? 'rgba(20, 20, 19, 0.84)'
                    : 'rgba(255, 255, 255, 0.92)',
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(15, 23, 42, 0.12)',
                  color: isDark ? '#eeeeec' : '#0f172a',
                }}
              >
                {dialogueCollapsed ? (
                  <>
                    <ChevronUp className="w-3 h-3" /> Show chat ({messages.length})
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" /> Hide chat
                  </>
                )}
              </button>
            </div>

            {!dialogueCollapsed && (
              <div
                ref={logRef}
                className="max-h-44 overflow-y-auto rounded-2xl px-4 py-3 space-y-3 shadow-xl border backdrop-blur-md"
                style={{
                  backgroundColor: isDark
                    ? 'rgba(20, 20, 19, 0.88)'
                    : 'rgba(255, 255, 255, 0.92)',
                  borderColor: isDark
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(15, 23, 42, 0.12)',
                  color: isDark ? '#eeeeec' : '#0f172a',
                }}
              >
                {messages.map((m, idx) => {
                  const isActivelyStreaming =
                    isStreaming && idx === messages.length - 1;
                  const isSelected = selectedMsgId === m.id;
                  const isEditing = editingMsgId === m.id;
                  const handlePress = (e: React.MouseEvent) => {
                    if (window.getSelection()?.toString().trim()) return;
                    if ((e.target as HTMLElement).closest('button, a, textarea, input')) return;
                    if (isActivelyStreaming && !m.content.trim()) return;
                    setSelectedMsgId((prev) => (prev === m.id ? null : m.id));
                  };

                  return m.role === 'user' ? (
                    <div
                      key={m.id}
                      data-testid={`companion-message-${m.id}`}
                      className="flex flex-col items-end min-w-0 animate-fade-up"
                    >
                      <div
                        onClick={handlePress}
                        className={`rounded-2xl px-3.5 py-1.5 text-xs max-w-[85%] min-w-0 cursor-pointer ${
                          isEditing ? 'w-full' : ''
                        }`}
                        style={{
                          backgroundColor: isDark ? '#2a2a27' : '#e2e8f0',
                          color: isDark ? '#eeeeec' : '#0f172a',
                        }}
                      >
                        {isEditing ? (
                          <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              aria-label="Edit companion message"
                              rows={2}
                              autoFocus
                              className={`w-full resize-y rounded-lg border px-2 py-1 text-xs focus:outline-none ${
                                isDark
                                  ? 'border-white/15 bg-black/20 text-[#eeeeec]'
                                  : 'border-slate-300 bg-white text-slate-900'
                              }`}
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMsgId(null);
                                  setEditingText('');
                                }}
                                className={`btn-lift px-2 py-0.5 rounded-full text-[11px] border ${
                                  isDark
                                    ? 'border-white/15 text-[#c9c8c0]'
                                    : 'border-slate-300 text-slate-600'
                                }`}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!editingText.trim()}
                                onClick={() => {
                                  onEditUserMessage?.(m.id, editingText);
                                  setEditingMsgId(null);
                                  setEditingText('');
                                  setSelectedMsgId(null);
                                }}
                                className="btn-lift px-2 py-0.5 rounded-full text-[11px] font-medium disabled:opacity-40"
                                style={{
                                  backgroundColor: 'var(--app-accent-hex)',
                                  color: '#ffffff',
                                }}
                              >
                                Save &amp; Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                            {m.content}
                          </p>
                        )}
                      </div>
                      {isSelected && !isEditing && (
                        <MessageActionBar
                          role="user"
                          content={m.content}
                          compact
                          compactLight={!isDark}
                          disabled={isStreaming}
                          onEdit={
                            onEditUserMessage
                              ? () => {
                                  setEditingMsgId(m.id);
                                  setEditingText(m.content);
                                }
                              : undefined
                          }
                        />
                      )}
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      data-testid={`companion-message-${m.id}`}
                      onClick={handlePress}
                      className="text-xs leading-relaxed w-full min-w-0 space-y-1.5 animate-fade-up cursor-pointer"
                    >
                      {m.activitySteps && m.activitySteps.length > 0 && (
                        <ActivityTrace steps={m.activitySteps} compact />
                      )}
                      {m.content ? (
                        <>
                          <MarkdownRenderer content={m.content} />
                          <StreamingAnswerIndicator
                            active={isActivelyStreaming}
                            hasContent
                            compact
                          />
                        </>
                      ) : (
                        <StreamingAnswerIndicator
                          active={isActivelyStreaming}
                          hasContent={false}
                          compact
                        />
                      )}
                      {isSelected && !isActivelyStreaming && m.content.trim() && (
                        <MessageActionBar
                          role="assistant"
                          content={m.content}
                          feedback={m.feedback}
                          compact
                          compactLight={!isDark}
                          disabled={isStreaming}
                          ttsOptions={ttsOptions}
                          onRate={
                            onRateMessage
                              ? (rating) => onRateMessage(m.id, rating)
                              : undefined
                          }
                          onRegenerate={
                            onRegenerateMessage
                              ? () => {
                                  setSelectedMsgId(null);
                                  onRegenerateMessage(m.id);
                                }
                              : undefined
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {voiceError && !voiceMode && (
          <div
            role="status"
            className="pointer-events-auto w-full max-w-xl px-3.5 py-2 rounded-2xl border text-xs flex items-center justify-between gap-2 backdrop-blur-md animate-pop-in"
            style={{
              backgroundColor: isDark
                ? 'rgba(28, 28, 26, 0.9)'
                : 'rgba(255, 255, 255, 0.95)',
              borderColor: isDark
                ? 'rgba(255, 255, 255, 0.12)'
                : 'rgba(15, 23, 42, 0.12)',
              color: isDark ? '#d4d4ce' : '#334155',
            }}
          >
            <span className="truncate">{voiceError}</span>
            <button
              type="button"
              onClick={clearVoiceError}
              aria-label="Dismiss companion voice notice"
              className="btn-lift p-0.5 rounded hover:opacity-80 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {voiceMode && (
          <div
            data-testid="companion-voice-panel"
            className="pointer-events-auto w-full max-w-xl rounded-3xl px-4 py-2.5 flex items-center justify-between gap-3 border backdrop-blur-md shadow-xl animate-pop-in"
            style={{
              backgroundColor: isDark
                ? 'rgba(24, 24, 22, 0.92)'
                : 'rgba(255, 255, 255, 0.95)',
              borderColor: isDark
                ? 'rgba(255, 255, 255, 0.14)'
                : 'rgba(15, 23, 42, 0.12)',
              color: isDark ? '#eeeeec' : '#0f172a',
            }}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                {voicePhase !== 'idle' && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full animate-voice-ring"
                    style={{ backgroundColor: 'var(--app-accent-hex)' }}
                  />
                )}
                <span
                  className="relative w-8 h-8 rounded-full flex items-center justify-center gap-0.5"
                  style={{
                    backgroundColor:
                      voicePhase === 'idle'
                        ? isDark
                          ? '#2a2a27'
                          : '#e2e8f0'
                        : 'var(--app-accent-hex)',
                    color: voicePhase === 'idle' && !isDark ? '#475569' : '#ffffff',
                  }}
                >
                  {[0, 120, 240, 360].map((delay) => (
                    <span
                      key={delay}
                      className={`w-0.5 rounded-full bg-current ${
                        voicePhase !== 'idle' ? 'h-3 animate-voice-bar' : 'h-1.5 opacity-60'
                      }`}
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">
                  {muted
                    ? 'Voice muted'
                    : voicePhase === 'listening'
                      ? 'Luna is listening…'
                      : voicePhase === 'thinking'
                        ? 'Luna is thinking…'
                        : voicePhase === 'speaking'
                          ? 'Luna is speaking…'
                          : 'Companion voice ready'}
                </div>
                <p
                  className="text-[11px] truncate"
                  style={{ color: isDark ? '#a6a59e' : '#64748b' }}
                >
                  {voiceError ||
                    liveTranscript ||
                    (muted
                      ? 'Tap unmute to continue talking'
                      : voicePhase === 'idle'
                        ? 'Tap Listen to speak again'
                        : 'Hands-free voice conversation active')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {voicePhase === 'idle' && !muted && (
                <button
                  type="button"
                  onClick={tapToListen}
                  aria-label="Resume companion listening"
                  className="btn-lift px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{
                    backgroundColor: 'var(--app-accent-hex)',
                    color: '#ffffff',
                  }}
                >
                  Listen
                </button>
              )}
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute companion voice' : 'Mute companion voice'}
                className={`btn-lift w-7 h-7 rounded-full flex items-center justify-center ${
                  isDark ? 'hover:bg-white/10 text-[#c9c8c0]' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                {muted ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={toggleVoiceMode}
                aria-label="End companion voice mode"
                className={`btn-lift w-7 h-7 rounded-full flex items-center justify-center ${
                  isDark ? 'hover:bg-white/10 text-[#c9c8c0]' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <div
          className="pointer-events-auto w-full max-w-xl flex items-center gap-1.5 rounded-[26px] px-3.5 py-2 shadow-xl border backdrop-blur-md min-h-[48px]"
          style={{
            backgroundColor: isDark
              ? 'rgba(28, 28, 26, 0.92)'
              : 'rgba(255, 255, 255, 0.94)',
            borderColor: isDark
              ? 'rgba(255, 255, 255, 0.12)'
              : 'rgba(15, 23, 42, 0.12)',
            color: isDark ? '#eeeeec' : '#0f172a',
          }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                ((enterToSend && !e.shiftKey) || (!enterToSend && (e.metaKey || e.ctrlKey)))
              ) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              isTranscribing
                ? 'Transcribing...'
                : isDictating
                  ? 'Listening...'
                  : 'Talk to Luna...'
            }
            aria-label="Companion chat input"
            className={`flex-1 min-w-0 resize-none bg-transparent py-1 px-1 text-sm leading-6 focus:outline-none ${
              isDark ? 'placeholder:text-[#9a9992]' : 'placeholder:text-slate-400'
            }`}
            style={{ color: isDark ? '#eeeeec' : '#0f172a', maxHeight: '35dvh' }}
          />
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isTranscribing}
            aria-label="Dictate companion message"
            aria-pressed={isDictating}
            className={`relative w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-40 ${
              isDictating
                ? 'ring-2 ring-rose-400/70'
                : isDark
                  ? 'hover:bg-white/10'
                  : 'hover:bg-slate-100'
            }`}
            style={{
              color: isDictating ? '#fb7185' : isDark ? '#b7b6ae' : '#64748b',
            }}
          >
            {isDictating && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-rose-500/25 animate-mic-wave"
              />
            )}
            {isDictating ? (
              <MicOff className="w-4 h-4 relative icon-wiggle" />
            ) : (
              <Mic className="w-4 h-4 relative icon-wiggle" />
            )}
          </button>
          {input.trim() ? (
            <button
              type="button"
              disabled={isStreaming}
              onClick={send}
              aria-label="Send companion message"
              className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-35 transition-all shrink-0 animate-pop-in"
              style={{
                backgroundColor: 'var(--app-accent-hex)',
                color: '#ffffff',
              }}
            >
              <ArrowUp className="w-4 h-4 icon-send" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleVoiceMode}
              aria-label="Toggle companion voice mode"
              aria-pressed={voiceMode}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all hover:opacity-90"
              style={{
                backgroundColor: voiceMode
                  ? 'var(--app-accent-hex)'
                  : isDark
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(15, 23, 42, 0.08)',
                color: voiceMode ? '#ffffff' : isDark ? '#eeeeec' : '#334155',
              }}
            >
              <AudioLines className="w-4 h-4 icon-sparkle" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
