import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  AudioLines,
  BookOpen,
  ChevronDown,
  ExternalLink,
  FileText,
  Folders,
  Globe,
  ImagePlus,
  Link2,
  Lock,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Plus,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import type {
  Conversation,
  FileAttachment,
  ImageAttachment,
  ProjectFolder,
  ProviderConfig,
} from '../types/workspace';
import { buildAdaptiveSuggestions } from '../utils/suggestions';
import type { MessageFeedback } from '../utils/messageActions';
import type { AiPersonaId, ThemeId } from '../utils/themes';
import { ActivityTrace, StreamingAnswerIndicator } from './ActivityTrace';
import { ComposerMenu } from './ComposerMenu';
import { InlineModelPopover } from './InlineModelPopover';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageActionBar } from './MessageActionBar';

interface ChatWorkspaceProps {
  conversation: Conversation;
  allConversations: Conversation[];
  providers: ProviderConfig[];
  activeProvider: ProviderConfig;
  projects?: ProjectFolder[];
  isStreaming: boolean;
  highThinking: boolean;
  webSearch: boolean;
  useDocContext: boolean;
  e2eeEnabled: boolean;
  userName?: string | null;
  enterToSend?: boolean;
  ttsOptions?: { rate?: number; pitch?: number; voiceName?: string };
  activeThemeId?: ThemeId;
  activeAccentHex?: string;
  activePersona?: AiPersonaId;
  onSelectProvider?: (id: string) => void;
  onSelectTheme?: (id: ThemeId) => void;
  onSelectAccent?: (hex: string) => void;
  onSelectPersona?: (persona: AiPersonaId) => void;
  onAssignProject?: (projectId: string | undefined) => void;
  onCreateProject?: (name: string) => void;
  onExportActiveChat?: () => void;
  onToggleHighThinking: () => void;
  onToggleWebSearch: () => void;
  onToggleUseDocContext: () => void;
  onSendMessage: (text: string, images: ImageAttachment[], files?: FileAttachment[]) => void;
  onStopStreaming: () => void;
  onRateMessage?: (messageId: string, rating: MessageFeedback) => void;
  onRegenerateMessage?: (messageId: string) => void;
  onEditUserMessage?: (messageId: string, newContent: string) => void;
  onOpenProviders: () => void;
  onOpenAgentSandbox?: () => void;
  onRunInSandbox: (code: string, language: string) => void;
}

export function ChatWorkspace({
  conversation,
  allConversations,
  providers,
  activeProvider,
  projects = [],
  isStreaming,
  highThinking,
  webSearch,
  useDocContext,
  e2eeEnabled,
  userName,
  enterToSend = true,
  ttsOptions,
  activeThemeId,
  activeAccentHex,
  activePersona,
  onSelectProvider,
  onSelectTheme,
  onSelectAccent,
  onSelectPersona,
  onAssignProject,
  onCreateProject,
  onExportActiveChat,
  onToggleHighThinking,
  onToggleWebSearch,
  onToggleUseDocContext,
  onSendMessage,
  onStopStreaming,
  onRateMessage,
  onRegenerateMessage,
  onEditUserMessage,
  onOpenProviders,
  onOpenAgentSandbox,
  onRunInSandbox,
}: ChatWorkspaceProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [canExpandComposer, setCanExpandComposer] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const uploadAllInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const dictationPrefixRef = useRef('');
  const userScrolledUpRef = useRef<boolean>(false);

  const { isFirstTime, greeting } = useMemo(
    () => buildAdaptiveSuggestions(allConversations, undefined, userName),
    [allConversations, userName],
  );

  const latestAssistantText = useMemo(() => {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
      const m = conversation.messages[i];
      if (m.role === 'assistant' && m.content.trim()) return m.content;
    }
    return undefined;
  }, [conversation.messages]);

  const handleDictateTranscript = useCallback((spoken: string) => {
    const prefix = dictationPrefixRef.current;
    setInput(prefix ? `${prefix} ${spoken}` : spoken);
  }, []);

  const handleVoiceSubmit = useCallback(
    (spokenText: string) => {
      onSendMessage(spokenText, []);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    },
    [onSendMessage],
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

  const handleMicClick = () => {
    if (!isDictating) {
      dictationPrefixRef.current = input.trim();
    }
    toggleDictation();
  };

  // Auto-expand textarea cleanly up to 50% of viewport height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const resize = () => {
      el.style.height = 'auto';
      const maxH = Math.max(160, Math.round(window.innerHeight * 0.5));
      const nextH = Math.min(el.scrollHeight, maxH);
      el.style.height = `${nextH}px`;
      el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
      setCanExpandComposer(el.scrollHeight >= 72 || input.length >= 120);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [input]);

  // Focus expanded editor and allow Escape to collapse
  useEffect(() => {
    if (!composerExpanded) return;
    expandedTextareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setComposerExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [composerExpanded]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distance > 80;
    setShowScrollBottom(isUp);
    userScrolledUpRef.current = isUp;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    userScrolledUpRef.current = false;
    setShowScrollBottom(false);
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: isStreaming ? 'smooth' : 'auto',
    });
  }, [conversation.messages, isStreaming]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const readFilesIntoComposer = async (files: File[]) => {
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(file);
        });
        const base64 = dataUrl.split(',')[1] || '';
        if (base64) {
          setAttachments((prev) => [
            ...prev,
            {
              id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              mimeType: file.type,
              data: base64,
              previewUrl: dataUrl,
            },
          ]);
        }
        continue;
      }

      // Text, code, CSV, JSON, Markdown, XML, SQL, logs
      const rawText = await file.text().catch(() => '');
      if (rawText) {
        const MAX_CHARS = 40000;
        const clipped =
          rawText.length > MAX_CHARS
            ? `${rawText.slice(0, MAX_CHARS)}\n\n... (truncated from ${rawText.length} chars)`
            : rawText;
        setFileAttachments((prev) => [
          ...prev,
          {
            id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            mimeType: file.type || 'text/plain',
            size: file.size,
            content: clipped,
            kind: 'file',
          },
        ]);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await readFilesIntoComposer(files);
    }
  };

  const handleUnifiedFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files || []);
    await readFilesIntoComposer(files);
    e.target.value = '';
    setAddSheetOpen(false);
  };

  const handleTakeScreenshot = async () => {
    setCaptureNotice(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCaptureNotice('Screen capture is not supported in this browser — upload an image instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 120));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      track?.stop();
      stream.getTracks().forEach((t) => t.stop());
      const base64 = dataUrl.split(',')[1] || '';
      if (base64) {
        setAttachments((prev) => [
          ...prev,
          {
            id: `shot_${Date.now()}`,
            name: `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.png`,
            mimeType: 'image/png',
            data: base64,
            previewUrl: dataUrl,
          },
        ]);
      }
    } catch {
      setCaptureNotice('Screen capture cancelled.');
    }
  };

  const handleAttachUrl = async (rawUrl: string): Promise<string | null> => {
    const raw = rawUrl.trim();
    if (!raw) return 'Enter a URL first.';
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const resp = await fetch('/api/agent/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'fetch_url', args: { url: normalized } }),
      });
      const data = (await resp.json()) as { ok?: boolean; output?: string };
      if (!data.ok || !data.output) {
        return data.output || 'Unable to fetch this URL.';
      }
      let hostLabel = normalized;
      try {
        const u = new URL(normalized);
        hostLabel = `${u.hostname}${u.pathname !== '/' ? u.pathname : ''}`;
      } catch {
        // fallback
      }
      setFileAttachments((prev) => [
        ...prev,
        {
          id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: hostLabel.slice(0, 48),
          mimeType: 'text/html',
          size: data.output!.length,
          content: data.output!,
          kind: 'url',
          sourceUrl: normalized,
        },
      ]);
      return null;
    } catch {
      return 'Could not connect to URL fetcher.';
    }
  };

  const submit = () => {
    const trimmed = input.trim();
    const hasMedia = attachments.length > 0 || fileAttachments.length > 0;
    if ((!trimmed && !hasMedia) || isStreaming) return;
    const fallbackPrompt =
      attachments.length > 0
        ? 'Analyze the attached photo in detail.'
        : 'Analyze the attached file/page content and summarize the key points.';
    onSendMessage(trimmed || fallbackPrompt, attachments, fileAttachments);
    setInput('');
    setAttachments([]);
    setFileAttachments([]);
    setAddSheetOpen(false);
    setComposerExpanded(false);
    userScrolledUpRef.current = false;
    setShowScrollBottom(false);
    setTimeout(() => scrollToBottom(true), 60);
  };

  const isEmpty = conversation.messages.length === 0;

  const composerCluster = (
    <div className="mx-auto w-full" style={{ maxWidth: 'var(--app-chat-max-w)' }}>
      {(attachments.length > 0 || fileAttachments.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2 px-1 animate-fade-up">
          {attachments.map((img) => (
            <div
              key={img.id}
              className="group relative flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-2xl border shadow-sm transition-all hover:border-white/30"
              style={{
                backgroundColor: 'var(--app-surface-bg)',
                borderColor: 'var(--app-border-color)',
              }}
            >
              <img
                src={img.previewUrl}
                alt={img.name}
                referrerPolicy="no-referrer"
                className="w-10 h-10 object-cover rounded-xl border border-white/10 shrink-0"
              />
              <div className="min-w-0 max-w-[130px] sm:max-w-[180px]">
                <div className="text-xs font-medium truncate" title={img.name}>
                  {img.name}
                </div>
                <div
                  className="text-[10px] uppercase font-mono"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  {img.mimeType.replace('image/', '')}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${img.name}`}
                onClick={() =>
                  setAttachments((prev) => prev.filter((item) => item.id !== img.id))
                }
                className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors ml-0.5"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {fileAttachments.map((file) => (
            <div
              key={file.id}
              className="group relative flex items-center gap-2.5 pl-2.5 pr-2.5 py-1.5 rounded-2xl border shadow-sm transition-all hover:border-white/30"
              style={{
                backgroundColor: 'var(--app-surface-bg)',
                borderColor: 'var(--app-border-color)',
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--app-elevated-bg)' }}
              >
                {file.kind === 'url' ? (
                  <Link2 className="w-4 h-4" style={{ color: 'var(--app-accent-hex)' }} />
                ) : (
                  <FileText className="w-4 h-4" style={{ color: 'var(--app-accent-hex)' }} />
                )}
              </div>
              <div className="min-w-0 max-w-[140px] sm:max-w-[200px]">
                <div className="text-xs font-medium truncate" title={file.name}>
                  {file.name}
                </div>
                <div
                  className="text-[10px] font-mono tabular-nums"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  {file.kind === 'url'
                    ? 'web context'
                    : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() =>
                  setFileAttachments((prev) => prev.filter((item) => item.id !== file.id))
                }
                className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {captureNotice && (
        <div
          role="status"
          className="mb-2 px-3 py-1.5 rounded-2xl border text-xs flex items-center justify-between gap-2 animate-fade-up"
          style={{
            borderColor: 'var(--app-border-color)',
            backgroundColor: 'var(--app-surface-bg)',
            color: 'var(--app-text-muted)',
          }}
        >
          <span>{captureNotice}</span>
          <button
            type="button"
            onClick={() => setCaptureNotice(null)}
            aria-label="Dismiss notice"
            className="p-0.5 rounded hover:opacity-80"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {(webSearch || useDocContext || conversation.projectId) && (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1.5 text-[11px]">
          {conversation.projectId && (
            <button
              type="button"
              onClick={() => onAssignProject?.(undefined)}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border"
              style={{
                borderColor: 'var(--app-border-color)',
                backgroundColor: 'var(--app-surface-bg)',
                color: 'var(--app-text-primary)',
              }}
            >
              <Folders className="w-3 h-3" style={{ color: 'var(--app-accent-hex)' }} />
              <span>
                {projects.find((p) => p.id === conversation.projectId)?.name ?? 'Project'}
              </span>
              <X className="w-2.5 h-2.5 opacity-60" />
            </button>
          )}
          {webSearch && (
            <button
              type="button"
              onClick={onToggleWebSearch}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border"
              style={{
                borderColor: 'color-mix(in srgb, var(--app-accent-hex) 40%, var(--app-border-color))',
                backgroundColor: 'color-mix(in srgb, var(--app-accent-hex) 10%, var(--app-surface-bg))',
                color: 'var(--app-accent-hex)',
              }}
            >
              <Globe className="w-3 h-3" />
              <span>Web search</span>
              <X className="w-2.5 h-2.5 opacity-75" />
            </button>
          )}
          {useDocContext && (
            <button
              type="button"
              onClick={onToggleUseDocContext}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border"
              style={{
                borderColor: 'var(--app-border-color)',
                backgroundColor: 'var(--app-surface-bg)',
                color: 'var(--app-text-muted)',
              }}
            >
              <BookOpen className="w-3 h-3" />
              <span>Memory</span>
              <X className="w-2.5 h-2.5 opacity-75" />
            </button>
          )}
        </div>
      )}

      {voiceError && !voiceMode && (
        <div
          role="status"
          className="mb-2 px-3 py-2 rounded-2xl border text-xs flex items-center justify-between gap-2 animate-pop-in"
          style={{
            borderColor: 'var(--app-border-color)',
            backgroundColor: 'var(--app-surface-bg)',
            color: 'var(--app-text-muted)',
          }}
        >
          <span className="truncate">{voiceError}</span>
          <button
            type="button"
            onClick={clearVoiceError}
            aria-label="Dismiss voice notice"
            className="p-0.5 rounded hover:opacity-80 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {voiceMode && (
        <div
          data-testid="chat-voice-panel"
          className="mb-2.5 rounded-3xl border px-4 py-3 flex items-center justify-between gap-3 animate-pop-in theme-transition"
          style={{
            borderColor: 'var(--app-border-color)',
            backgroundColor: 'var(--app-surface-bg)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              {voicePhase !== 'idle' && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full animate-voice-ring"
                  style={{ backgroundColor: 'var(--app-accent-hex)' }}
                />
              )}
              <span
                className="relative w-9 h-9 rounded-full flex items-center justify-center gap-0.5"
                style={{
                  backgroundColor:
                    voicePhase === 'idle'
                      ? 'var(--app-elevated-bg)'
                      : 'var(--app-accent-hex)',
                  color:
                    voicePhase === 'idle' ? 'var(--app-text-muted)' : '#ffffff',
                }}
              >
                {[0, 120, 240, 360].map((delay) => (
                  <span
                    key={delay}
                    className={`w-0.5 rounded-full bg-current ${
                      voicePhase !== 'idle' ? 'h-3.5 animate-voice-bar' : 'h-1.5 opacity-60'
                    }`}
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium flex items-center gap-1.5">
                <span>
                  {muted
                    ? 'Voice muted'
                    : voicePhase === 'listening'
                      ? 'Listening…'
                      : voicePhase === 'thinking'
                        ? 'Thinking…'
                        : voicePhase === 'speaking'
                          ? 'Speaking…'
                          : 'Voice mode ready'}
                </span>
              </div>
              <p
                className="text-[11px] truncate"
                style={{ color: 'var(--app-text-muted)' }}
              >
                {voiceError ||
                  liveTranscript ||
                  (muted
                    ? 'Tap unmute to resume hands-free conversation'
                    : voicePhase === 'idle'
                      ? 'Tap Listen to start another turn'
                      : 'Speak naturally — Luna replies aloud')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {voicePhase === 'idle' && !muted && (
              <button
                type="button"
                onClick={tapToListen}
                aria-label="Resume listening"
                className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-opacity hover:opacity-90"
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
              aria-label={muted ? 'Unmute voice mode' : 'Mute voice mode'}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              style={{ color: 'var(--app-text-muted)' }}
            >
              {muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleVoiceMode}
              aria-label="End voice mode"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <ComposerMenu
          open={addSheetOpen}
          onClose={() => setAddSheetOpen(false)}
          onUploadFiles={() => uploadAllInputRef.current?.click()}
          onTakeScreenshot={() => void handleTakeScreenshot()}
          projects={projects}
          activeProjectId={conversation.projectId}
          onSelectProject={(projectId) => onAssignProject?.(projectId)}
          onCreateProject={(name) => onCreateProject?.(name)}
          onAttachUrl={handleAttachUrl}
          webSearch={webSearch}
          onToggleWebSearch={onToggleWebSearch}
          highThinking={highThinking}
          onToggleHighThinking={onToggleHighThinking}
          useDocContext={useDocContext}
          onToggleUseDocContext={onToggleUseDocContext}
          activeThemeId={activeThemeId}
          onSelectTheme={onSelectTheme}
          activeAccentHex={activeAccentHex}
          onSelectAccent={onSelectAccent}
          activePersona={activePersona}
          onSelectPersona={onSelectPersona}
          onOpenAgentSandbox={onOpenAgentSandbox}
          canExportChat={conversation.messages.length > 0}
          onExportChat={onExportActiveChat}
        />

        {/* Claude-inspired clean multi-row composer card */}
        <div
          className="rounded-[24px] border px-3.5 pt-2.5 pb-2 shadow-sm theme-transition"
          style={{
            borderColor: 'var(--app-border-color)',
            backgroundColor: 'var(--app-surface-bg)',
          }}
        >
          <div className="flex items-start gap-2">
            <textarea
              ref={textareaRef}
              data-luna-composer="true"
              rows={isEmpty ? 2 : 1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  ((enterToSend && !e.shiftKey) || (!enterToSend && (e.metaKey || e.ctrlKey)))
                ) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={
                isTranscribing
                  ? 'Transcribing voice...'
                  : isDictating
                    ? 'Listening...'
                    : webSearch
                      ? 'Search the web with Luna...'
                      : 'How can I help you today?'
              }
              aria-label="Chat message input"
              className="flex-1 min-w-0 resize-none bg-transparent text-[14.5px] leading-6 py-0.5 focus:outline-none"
              style={{
                color: 'var(--app-text-primary)',
                maxHeight: '50dvh',
              }}
            />

            {canExpandComposer && (
              <button
                type="button"
                onClick={() => setComposerExpanded(true)}
                aria-label="Expand message editor"
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Composer Bottom Utility Row: [+ Chat | Agent] ... [Model Effort v] [Mic] [Voice/Send] */}
          <div className="flex items-center justify-between gap-2 pt-1.5">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setModelPopoverOpen(false);
                  setAddSheetOpen((v) => !v);
                }}
                aria-label="Add to chat"
                aria-expanded={addSheetOpen}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 hover:bg-black/5 dark:hover:bg-white/[0.08]"
                style={{
                  backgroundColor: addSheetOpen ? 'var(--app-elevated-bg)' : 'transparent',
                  color: 'var(--app-text-primary)',
                }}
              >
                <Plus
                  className={`w-4 h-4 no-icon-anim transition-transform duration-150 ${
                    addSheetOpen ? 'rotate-45' : ''
                  }`}
                />
              </button>

              {onOpenAgentSandbox && (
                <div
                  className="hidden sm:inline-flex items-center p-0.5 rounded-xl text-xs"
                  style={{ backgroundColor: 'var(--app-canvas-bg)' }}
                >
                  <span
                    className="px-2.5 py-1 rounded-lg font-medium"
                    style={{
                      backgroundColor: 'var(--app-elevated-bg)',
                      color: 'var(--app-text-primary)',
                    }}
                  >
                    Chat
                  </span>
                  <button
                    type="button"
                    onClick={onOpenAgentSandbox}
                    className="px-2.5 py-1 rounded-lg font-medium hover:opacity-90"
                    style={{ color: 'var(--app-text-muted)' }}
                  >
                    Agent
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <InlineModelPopover
                open={modelPopoverOpen}
                onToggleOpen={() => {
                  setAddSheetOpen(false);
                  setModelPopoverOpen((v) => !v);
                }}
                onClose={() => setModelPopoverOpen(false)}
                providers={providers}
                activeProvider={activeProvider}
                onSelectProvider={onSelectProvider}
                highThinking={highThinking}
                onToggleHighThinking={onToggleHighThinking}
                onOpenModelsSettings={onOpenProviders}
              />

              <button
                type="button"
                onClick={handleMicClick}
                disabled={isTranscribing}
                aria-label="Dictate message with microphone"
                aria-pressed={isDictating}
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:bg-black/5 dark:hover:bg-white/[0.08] disabled:opacity-40 ${
                  isDictating ? 'animate-mic-wave ring-2 ring-rose-500/80 bg-rose-500/15' : ''
                }`}
                style={{
                  color: isDictating ? '#fb7185' : 'var(--app-text-muted)',
                }}
              >
                {isDictating ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4 icon-wiggle" />
                )}
              </button>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopStreaming}
                  aria-label="Stop response streaming"
                  className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : input.trim() || attachments.length > 0 || fileAttachments.length > 0 ? (
                <button
                  type="button"
                  onClick={submit}
                  aria-label="Send message"
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:opacity-90 shadow-sm animate-pop-in"
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
                  aria-label="Toggle voice mode"
                  aria-pressed={voiceMode}
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:bg-black/5 dark:hover:bg-white/[0.08]"
                  style={{
                    backgroundColor: voiceMode
                      ? 'var(--app-accent-hex)'
                      : 'transparent',
                    color: voiceMode ? '#ffffff' : 'var(--app-text-primary)',
                  }}
                >
                  <AudioLines className="w-4 h-4 icon-wave" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-full min-h-0 relative"
    >
      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-xs flex items-center justify-center p-6 border-2 border-dashed border-[var(--app-accent-hex)] pointer-events-none">
          <div className="bg-[var(--app-surface-bg)] border border-[var(--app-border-color)] px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3 animate-pop-in">
            <ImagePlus className="w-5 h-5 text-[var(--app-accent-hex)]" />
            <span className="text-sm font-medium">Drop photos or files to attach</span>
          </div>
        </div>
      )}
      {/* Minimal Sub-header when inside active thread */}
      {!isEmpty && (
        <div
          className="flex items-center justify-between gap-3 px-4 sm:px-8 py-2.5 border-b text-xs min-w-0 theme-transition"
          style={{ borderColor: 'var(--app-border-color)' }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h2 className="font-medium text-sm truncate">
              {conversation.title}
            </h2>
            {e2eeEnabled && (
              <Lock
                className="w-3 h-3 shrink-0"
                style={{ color: 'var(--app-text-muted)' }}
                aria-label="End-to-end encrypted"
              />
            )}
          </div>
          <button
            type="button"
            onClick={onOpenProviders}
            className="text-xs truncate max-w-[180px] shrink-0 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--app-text-muted)' }}
          >
            {activeProvider.label}
          </button>
        </div>
      )}

      {/* Main Message Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 ${
          isEmpty ? 'flex flex-col py-6' : 'py-6'
        }`}
      >
        {isEmpty ? (
          <div
            className="mt-auto mb-auto pt-20 sm:pt-32 pb-6 w-full mx-auto flex flex-col"
            style={{ maxWidth: 'var(--app-chat-max-w)' }}
          >
            <div className="flex items-center justify-center gap-3 mb-6 sm:mb-7">
              <img
                src="/luna-mark.svg"
                alt="Luna"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg shrink-0"
              />
              <h2 className="font-editorial text-[27px] sm:text-[34px] font-normal tracking-tight text-center">
                {isFirstTime
                  ? userName
                    ? `You're here, ${userName}!`
                    : "You're here!"
                  : greeting}
              </h2>
            </div>

            {composerCluster}
          </div>
        ) : (
          <div
            className="mx-auto w-full min-w-0 space-y-6"
            style={{
              maxWidth: 'var(--app-chat-max-w)',
              fontFamily: 'var(--app-chat-font)',
              fontSize: 'var(--app-chat-size)',
            }}
          >
            {conversation.messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const isActivelyStreaming =
                isStreaming && idx === conversation.messages.length - 1;
              const isSelected = selectedMsgId === msg.id;
              const isEditing = editingMsgId === msg.id;

              const handlePressMessage = (e: React.MouseEvent) => {
                if (window.getSelection()?.toString().trim()) return;
                if ((e.target as HTMLElement).closest('button, a, textarea, input')) return;
                if (isActivelyStreaming && !msg.content.trim()) return;
                setSelectedMsgId((prev) => (prev === msg.id ? null : msg.id));
              };

              if (isUser) {
                return (
                  <div
                    key={msg.id}
                    data-testid={`chat-message-${msg.id}`}
                    className="flex flex-col items-end min-w-0 animate-fade-up"
                  >
                    <div
                      onClick={handlePressMessage}
                      className={`rounded-3xl px-4 py-2.5 max-w-[85%] sm:max-w-[76%] min-w-0 theme-transition cursor-pointer ${
                        isEditing ? 'w-full sm:w-[76%]' : ''
                      }`}
                      style={{
                        backgroundColor: 'var(--app-elevated-bg)',
                        color: 'var(--app-text-primary)',
                      }}
                    >
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.images.map((img) => (
                            <img
                              key={img.id}
                              src={img.previewUrl}
                              alt={img.name}
                              referrerPolicy="no-referrer"
                              className="w-28 h-28 object-cover rounded-xl border border-white/10"
                            />
                          ))}
                        </div>
                      )}
                      {msg.files && msg.files.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {msg.files.map((f) => (
                            <div
                              key={f.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] max-w-full"
                              style={{
                                borderColor: 'var(--app-border-color)',
                                backgroundColor: 'var(--app-surface-bg)',
                                color: 'var(--app-text-muted)',
                              }}
                            >
                              {f.kind === 'url' ? (
                                <Link2 className="w-3 h-3 shrink-0" />
                              ) : (
                                <FileText className="w-3 h-3 shrink-0" />
                              )}
                              <span className="truncate max-w-[180px]">{f.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {isEditing ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            aria-label="Edit user message"
                            rows={3}
                            autoFocus
                            className="w-full resize-y rounded-xl border px-3 py-2 text-sm bg-transparent focus:outline-none"
                            style={{
                              borderColor: 'var(--app-border-color)',
                              color: 'var(--app-text-primary)',
                            }}
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsgId(null);
                                setEditingText('');
                              }}
                              className="px-3 py-1 rounded-full text-xs border hover:opacity-85"
                              style={{
                                borderColor: 'var(--app-border-color)',
                                color: 'var(--app-text-muted)',
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!editingText.trim() && !(msg.images && msg.images.length > 0)}
                              onClick={() => {
                                onEditUserMessage?.(msg.id, editingText);
                                setEditingMsgId(null);
                                setEditingText('');
                                setSelectedMsgId(null);
                              }}
                              className="px-3 py-1 rounded-full text-xs font-medium disabled:opacity-40"
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
                        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">
                          {msg.content}
                        </p>
                      )}
                    </div>

                    {isSelected && !isEditing && (
                      <MessageActionBar
                        role="user"
                        content={msg.content}
                        disabled={isStreaming}
                        onEdit={
                          onEditUserMessage
                            ? () => {
                                setEditingMsgId(msg.id);
                                setEditingText(msg.content);
                              }
                            : undefined
                        }
                      />
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  data-testid={`chat-message-${msg.id}`}
                  onClick={handlePressMessage}
                  className="space-y-2 w-full min-w-0 animate-fade-up cursor-pointer rounded-2xl"
                >
                  {msg.activitySteps && msg.activitySteps.length > 0 && (
                    <ActivityTrace steps={msg.activitySteps} />
                  )}

                  {msg.content ? (
                    <>
                      <MarkdownRenderer
                        content={msg.content}
                        onRunInSandbox={onRunInSandbox}
                      />
                      <StreamingAnswerIndicator
                        active={isActivelyStreaming}
                        hasContent
                        thinking={highThinking}
                      />
                    </>
                  ) : (
                    <StreamingAnswerIndicator
                      active={isActivelyStreaming}
                      hasContent={false}
                      thinking={highThinking}
                    />
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div
                      className="pt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]"
                      style={{ color: 'var(--app-text-muted)' }}
                    >
                      <span>Sources:</span>
                      {msg.sources.map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline hover:opacity-80"
                        >
                          {src.title}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ))}
                    </div>
                  )}

                  {isSelected && !isActivelyStreaming && msg.content.trim() && (
                    <MessageActionBar
                      role="assistant"
                      content={msg.content}
                      feedback={msg.feedback}
                      disabled={isStreaming}
                      ttsOptions={ttsOptions}
                      onRate={
                        onRateMessage
                          ? (rating) => onRateMessage(msg.id, rating)
                          : undefined
                      }
                      onRegenerate={
                        onRegenerateMessage
                          ? () => {
                              setSelectedMsgId(null);
                              onRegenerateMessage(msg.id);
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Unified Hidden File Input for Ctrl+U Upload */}
      <input
        ref={uploadAllInputRef}
        data-luna-upload="true"
        type="file"
        accept="image/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.sql,.yml,.yaml,.log,.xml,.sh"
        multiple
        onChange={handleUnifiedFileChange}
        className="hidden"
        aria-label="Upload or add files"
      />

      {/* Full-Screen Composer Overlay */}
      {composerExpanded && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{
            backgroundColor: 'var(--app-canvas-bg)',
            color: 'var(--app-text-primary)',
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Expanded message editor"
        >
          <div
            className="flex items-center justify-between px-4 sm:px-6 h-12 border-b shrink-0"
            style={{ borderColor: 'var(--app-border-color)' }}
          >
            <span className="text-xs font-medium" style={{ color: 'var(--app-text-muted)' }}>
              {activeProvider.label}
            </span>
            <button
              type="button"
              onClick={() => setComposerExpanded(false)}
              aria-label="Collapse message editor"
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              style={{ color: 'var(--app-text-primary)' }}
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          <div
            className="flex-1 w-full mx-auto px-4 sm:px-8 py-4 flex flex-col min-h-0"
            style={{ maxWidth: 'var(--app-chat-max-w)' }}
          >
            <textarea
              ref={expandedTextareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Write your message..."
              aria-label="Expanded chat message input"
              className="flex-1 w-full resize-none bg-transparent text-base leading-relaxed focus:outline-none"
              style={{
                color: 'var(--app-text-primary)',
                fontFamily: 'var(--app-chat-font)',
              }}
            />

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 py-2">
                {attachments.map((img) => (
                  <div key={img.id} className="relative">
                    <img
                      src={img.previewUrl}
                      alt={img.name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 object-cover rounded-xl border"
                      style={{ borderColor: 'var(--app-border-color)' }}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${img.name}`}
                      onClick={() =>
                        setAttachments((prev) =>
                          prev.filter((item) => item.id !== img.id),
                        )
                      }
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-neutral-900 text-white flex items-center justify-center border border-neutral-700"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className="flex items-center justify-between pt-3 border-t"
              style={{ borderColor: 'var(--app-border-color)' }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddSheetOpen(true)}
                  aria-label="Add to chat"
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
                {webSearch && (
                  <button
                    type="button"
                    onClick={onToggleWebSearch}
                    className="px-2.5 py-1 rounded-full text-xs border"
                    style={{
                      borderColor: 'var(--app-border-color)',
                      color: 'var(--app-text-muted)',
                    }}
                  >
                    Web
                  </button>
                )}
                {highThinking && (
                  <button
                    type="button"
                    onClick={onToggleHighThinking}
                    className="px-2.5 py-1 rounded-full text-xs border"
                    style={{
                      borderColor: 'var(--app-border-color)',
                      color: 'var(--app-text-muted)',
                    }}
                  >
                    Think
                  </button>
                )}
              </div>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopStreaming}
                  aria-label="Stop response streaming"
                  className="btn-lift w-9 h-9 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!input.trim() && attachments.length === 0 && fileAttachments.length === 0}
                  aria-label="Send message"
                  className="btn-lift w-9 h-9 rounded-full flex items-center justify-center hover:opacity-90 disabled:opacity-30"
                  style={{
                    backgroundColor: 'var(--app-accent-hex)',
                    color: '#ffffff',
                  }}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Anchored popover handled inside composer wrapper below */}

      {/* Quick Go Down Button */}
      {showScrollBottom && conversation.messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to latest message"
          className="btn-lift absolute bottom-24 right-5 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg border text-xs font-medium backdrop-blur-md animate-fade-up"
          style={{
            backgroundColor: 'var(--app-surface-bg)',
            borderColor: 'var(--app-border-color)',
            color: 'var(--app-text-primary)',
          }}
        >
          <ChevronDown className="w-3.5 h-3.5" />
          <span>Latest</span>
          {isStreaming && (
            <span
              className="w-2 h-2 rounded-full animate-stream-orb"
              style={{ backgroundColor: 'var(--app-accent-hex)' }}
            />
          )}
        </button>
      )}

      {/* Bottom Composer for active conversations (hidden when centered on empty screen) */}
      {!isEmpty && (
        <div className="px-4 pb-5 pt-2 shrink-0">
          {composerCluster}
        </div>
      )}
    </div>
  );
}
