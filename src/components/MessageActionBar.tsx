import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { MessageFeedback } from '../utils/messageActions';
import {
  isSpeechSynthesisAvailable,
  speakAssistantMessage,
  stopSpeaking,
} from '../utils/tts';

interface MessageActionBarProps {
  role: 'user' | 'assistant';
  content: string;
  feedback?: MessageFeedback | null;
  disabled?: boolean;
  compact?: boolean;
  compactLight?: boolean;
  ttsOptions?: {
    rate?: number;
    pitch?: number;
    voiceName?: string;
  };
  onRate?: (rating: MessageFeedback) => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
}

export function MessageActionBar({
  role,
  content,
  feedback,
  disabled = false,
  compact = false,
  compactLight = false,
  ttsOptions,
  onRate,
  onRegenerate,
  onEdit,
}: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (speaking) {
        stopSpeaking();
      }
    };
  }, [speaking]);

  const handleToggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      const ok = speakAssistantMessage(content, {
        rate: ttsOptions?.rate,
        pitch: ttsOptions?.pitch,
        voiceName: ttsOptions?.voiceName,
        onStart: () => setSpeaking(true),
        onEnd: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
      if (ok) setSpeaking(true);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fallback for restricted clipboard contexts
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const btnBase = compact
    ? 'btn-lift inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors border'
    : 'btn-lift inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium transition-colors border';

  const neutralStyle = compact
    ? compactLight
      ? {
          borderColor: 'rgba(15, 23, 42, 0.14)',
          backgroundColor: 'rgba(15, 23, 42, 0.05)',
          color: '#475569',
        }
      : {
          borderColor: 'rgba(255, 255, 255, 0.14)',
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          color: '#d4d4ce',
        }
    : {
        borderColor: 'var(--app-border-color)',
        backgroundColor: 'var(--app-surface-bg)',
        color: 'var(--app-text-muted)',
      };

  const activeStyle = {
    borderColor: 'var(--app-accent-hex)',
    backgroundColor: 'var(--app-elevated-bg)',
    color: compact ? (compactLight ? '#0f172a' : '#ffffff') : 'var(--app-text-primary)',
  };

  if (role === 'user') {
    return (
      <div
        data-testid="message-action-bar-user"
        onClick={(e) => e.stopPropagation()}
        className="flex flex-wrap items-center justify-end gap-1.5 pt-1.5 animate-fade-up"
      >
        {onEdit && (
          <button
            type="button"
            disabled={disabled}
            onClick={onEdit}
            aria-label="Edit message"
            className={`${btnBase} hover:opacity-90 disabled:opacity-40`}
            style={neutralStyle}
          >
            <Pencil className="w-3 h-3" />
            <span>Edit</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label="Copy message"
          className={`${btnBase} hover:opacity-90`}
          style={copied ? activeStyle : neutralStyle}
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="message-action-bar-assistant"
      onClick={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center gap-1.5 pt-1.5 animate-fade-up"
    >
      {onRate && (
        <>
          <button
            type="button"
            onClick={() => onRate('bad')}
            aria-label="Bad response"
            aria-pressed={feedback === 'bad'}
            className={`${btnBase} hover:opacity-90`}
            style={feedback === 'bad' ? activeStyle : neutralStyle}
          >
            <ThumbsDown className="w-3 h-3" />
            <span>Bad</span>
          </button>
          <button
            type="button"
            onClick={() => onRate('good')}
            aria-label="Good response"
            aria-pressed={feedback === 'good'}
            className={`${btnBase} hover:opacity-90`}
            style={feedback === 'good' ? activeStyle : neutralStyle}
          >
            <ThumbsUp className="w-3 h-3" />
            <span>Good</span>
          </button>
        </>
      )}
      {onRegenerate && (
        <button
          type="button"
          disabled={disabled}
          onClick={onRegenerate}
          aria-label="Regenerate response"
          className={`${btnBase} hover:opacity-90 disabled:opacity-40`}
          style={neutralStyle}
        >
          <RotateCcw className="w-3 h-3" />
          <span>Regenerate</span>
        </button>
      )}
      <button
        type="button"
        disabled={disabled || !isSpeechSynthesisAvailable()}
        onClick={handleToggleSpeak}
        aria-label={speaking ? 'Stop speaking' : 'Read aloud with text to speech'}
        title={isSpeechSynthesisAvailable() ? 'Read message aloud' : 'Speech synthesis unavailable in this browser'}
        className={`${btnBase} hover:opacity-90 disabled:opacity-40`}
        style={speaking ? activeStyle : neutralStyle}
      >
        {speaking ? (
          <VolumeX className="w-3.5 h-3.5 text-rose-400" />
        ) : (
          <Volume2 className="w-3.5 h-3.5" />
        )}
        <span>{speaking ? 'Stop' : 'Speak'}</span>
      </button>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label="Copy response"
        className={`${btnBase} hover:opacity-90`}
        style={copied ? activeStyle : neutralStyle}
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
}
