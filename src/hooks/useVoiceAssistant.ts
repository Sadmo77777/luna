import { useCallback, useEffect, useRef, useState } from 'react';
import { stripMarkdownForSpeech } from '../utils/conversationSummary';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

interface UseVoiceAssistantOptions {
  isStreaming: boolean;
  latestAssistantText?: string;
  onDictateTranscript: (text: string, isFinal: boolean) => void;
  onVoiceSubmit: (text: string) => void;
  onPhaseChange?: (phase: VoicePhase) => void;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceAssistant({
  isStreaming,
  latestAssistantText,
  onDictateTranscript,
  onVoiceSubmit,
  onPhaseChange,
}: UseVoiceAssistantOptions) {
  const [isDictating, setIsDictating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const [muted, setMuted] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceModeRef = useRef(false);
  const mutedRef = useRef(false);
  const waitingForReplyRef = useRef(false);
  const wasStreamingRef = useRef(false);
  const finalVoiceTextRef = useRef('');

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    onPhaseChange?.(voicePhase);
  }, [voicePhase, onPhaseChange]);

  const stopAudioTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const stopSpeechOutput = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore already-stopped recognition
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    stopAudioTracks();
    setIsDictating(false);
  }, [stopAudioTracks]);

  const startMediaRecorderDictation = useCallback(
    async (mode: 'dictate' | 'voice') => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setVoiceError('Microphone speech input is not supported in this browser.');
        setVoicePhase('idle');
        setIsDictating(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        const chunks: BlobPart[] = [];
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };

        recorder.onstop = async () => {
          stopAudioTracks();
          setIsDictating(false);
          if (chunks.length === 0) return;
          setIsTranscribing(true);
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
              reader.readAsDataURL(blob);
            });
            if (!base64) return;
            const resp = await fetch('/api/voice/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: blob.type || 'audio/webm',
              }),
            });
            const data = (await resp.json()) as { text?: string; error?: string };
            if (!resp.ok || data.error) {
              setVoiceError(data.error || 'Could not transcribe audio.');
              if (mode === 'voice') setVoicePhase('idle');
              return;
            }
            const spoken = (data.text || '').trim();
            if (spoken) {
              if (mode === 'voice' && voiceModeRef.current) {
                waitingForReplyRef.current = true;
                setVoicePhase('thinking');
                onVoiceSubmit(spoken);
              } else {
                onDictateTranscript(spoken, true);
              }
            }
          } catch {
            setVoiceError('Unable to transcribe recorded audio.');
          } finally {
            setIsTranscribing(false);
          }
        };

        recorder.start();
        if (mode === 'dictate') setIsDictating(true);
        else setVoicePhase('listening');
      } catch {
        setVoiceError('Microphone permission denied or unavailable.');
        setIsDictating(false);
        if (mode === 'voice') setVoicePhase('idle');
      }
    },
    [onDictateTranscript, onVoiceSubmit, stopAudioTracks],
  );

  const startVoiceListening = useCallback(() => {
    if (!voiceModeRef.current || mutedRef.current) return;
    setVoiceError(null);
    setLiveTranscript('');
    finalVoiceTextRef.current = '';

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      // Fallback: let user record a clip via MediaRecorder
      void startMediaRecorderDictation('voice');
      return;
    }

    try {
      stopSpeechOutput();
      const rec = new Ctor();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-US';
      recognitionRef.current = rec;
      setVoicePhase('listening');

      rec.onresult = (event) => {
        let interim = '';
        let finals = '';
        for (let i = 0; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) finals += `${piece} `;
          else interim += piece;
        }
        const combined = `${finals}${interim}`.trim();
        setLiveTranscript(combined);
        if (finals.trim()) {
          finalVoiceTextRef.current = finals.trim();
        }
      };

      rec.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setVoiceError('Microphone permission denied.');
          setVoicePhase('idle');
        } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          setVoiceError(`Voice input error: ${ev.error}`);
          setVoicePhase('idle');
        }
      };

      rec.onend = () => {
        recognitionRef.current = null;
        if (!voiceModeRef.current || mutedRef.current) return;
        const spoken = finalVoiceTextRef.current.trim();
        if (spoken) {
          setLiveTranscript(spoken);
          waitingForReplyRef.current = true;
          setVoicePhase('thinking');
          onVoiceSubmit(spoken);
        } else {
          // Idle silence while still unmuted — keep orb ready cleanly
          setVoicePhase('idle');
        }
      };

      rec.start();
    } catch {
      setVoiceError('Unable to start voice listening.');
      setVoicePhase('idle');
    }
  }, [onVoiceSubmit, startMediaRecorderDictation, stopSpeechOutput]);

  const speakAndResume = useCallback(
    (rawText: string) => {
      const clean = stripMarkdownForSpeech(rawText);
      if (!clean || !voiceModeRef.current) {
        if (voiceModeRef.current && !mutedRef.current) startVoiceListening();
        return;
      }
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        if (voiceModeRef.current && !mutedRef.current) startVoiceListening();
        return;
      }
      stopSpeechOutput();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.02;
      utterance.onstart = () => {
        if (voiceModeRef.current) setVoicePhase('speaking');
      };
      utterance.onend = () => {
        if (voiceModeRef.current && !mutedRef.current) {
          startVoiceListening();
        } else {
          setVoicePhase('idle');
        }
      };
      utterance.onerror = () => {
        if (voiceModeRef.current && !mutedRef.current) {
          startVoiceListening();
        } else {
          setVoicePhase('idle');
        }
      };
      setVoicePhase('speaking');
      window.speechSynthesis.speak(utterance);
    },
    [startVoiceListening, stopSpeechOutput],
  );

  // Detect end of assistant response while Voice Mode is waiting for reply
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      if (voiceModeRef.current && waitingForReplyRef.current) {
        waitingForReplyRef.current = false;
        if (latestAssistantText) {
          speakAndResume(latestAssistantText);
        } else if (!mutedRef.current) {
          startVoiceListening();
        }
      }
    }
  }, [isStreaming, latestAssistantText, speakAndResume, startVoiceListening]);

  // Dictation button handler (fills composer text, does NOT auto-submit)
  const toggleDictation = useCallback(() => {
    setVoiceError(null);
    if (isDictating) {
      stopListening();
      return;
    }
    if (voiceMode) {
      setVoiceMode(false);
      stopSpeechOutput();
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      void startMediaRecorderDictation('dictate');
      return;
    }

    try {
      const rec = new Ctor();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-US';
      recognitionRef.current = rec;
      setIsDictating(true);
      let latestSpoken = '';

      rec.onresult = (event) => {
        let combined = '';
        let hasFinal = false;
        for (let i = 0; i < event.results.length; i++) {
          combined += event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) hasFinal = true;
        }
        latestSpoken = combined.trim();
        if (latestSpoken) {
          onDictateTranscript(latestSpoken, hasFinal);
        }
      };

      rec.onerror = (ev) => {
        setIsDictating(false);
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setVoiceError('Microphone permission denied.');
        } else if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
          setVoiceError(`Dictation error: ${ev.error}`);
        }
      };

      rec.onend = () => {
        recognitionRef.current = null;
        setIsDictating(false);
        if (latestSpoken) {
          onDictateTranscript(latestSpoken, true);
        }
      };

      rec.start();
    } catch {
      setIsDictating(false);
      setVoiceError('Unable to access microphone.');
    }
  }, [
    isDictating,
    onDictateTranscript,
    startMediaRecorderDictation,
    stopListening,
    stopSpeechOutput,
    voiceMode,
  ]);

  const toggleVoiceMode = useCallback(() => {
    setVoiceError(null);
    if (voiceMode) {
      setVoiceMode(false);
      voiceModeRef.current = false;
      waitingForReplyRef.current = false;
      stopListening();
      stopSpeechOutput();
      setVoicePhase('idle');
      setLiveTranscript('');
      return;
    }
    stopListening();
    setMuted(false);
    mutedRef.current = false;
    setVoiceMode(true);
    voiceModeRef.current = true;
    startVoiceListening();
  }, [startVoiceListening, stopListening, stopSpeechOutput, voiceMode]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (next) {
        stopListening();
        stopSpeechOutput();
        setVoicePhase('idle');
      } else if (voiceModeRef.current) {
        startVoiceListening();
      }
      return next;
    });
  }, [startVoiceListening, stopListening, stopSpeechOutput]);

  useEffect(() => {
    return () => {
      stopListening();
      stopSpeechOutput();
    };
  }, [stopListening, stopSpeechOutput]);

  return {
    isDictating,
    isTranscribing,
    voiceMode,
    voicePhase,
    muted,
    liveTranscript,
    voiceError,
    clearVoiceError: () => setVoiceError(null),
    toggleDictation,
    toggleVoiceMode,
    toggleMute,
    tapToListen: startVoiceListening,
  };
}
