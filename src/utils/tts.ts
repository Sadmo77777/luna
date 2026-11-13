import { stripMarkdownForSpeech } from './conversationSummary';

let activeUtterance: SpeechSynthesisUtterance | null = null;

export function isSpeechSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisAvailable()) {
    try {
      window.speechSynthesis.cancel();
      activeUtterance = null;
    } catch {
      // ignore
    }
  }
}

export function isSpeaking(): boolean {
  if (!isSpeechSynthesisAvailable()) return false;
  return window.speechSynthesis.speaking;
}

export function listAvailableVoices(): Array<{ name: string; lang: string }> {
  if (!isSpeechSynthesisAvailable()) return [];
  try {
    return window.speechSynthesis
      .getVoices()
      .map((v) => ({ name: v.name, lang: v.lang }))
      .slice(0, 40);
  } catch {
    return [];
  }
}

export function speakAssistantMessage(
  content: string,
  options?: {
    rate?: number;
    pitch?: number;
    voiceName?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: unknown) => void;
  },
): boolean {
  if (!isSpeechSynthesisAvailable()) {
    options?.onError?.(new Error('Speech synthesis not available in this browser.'));
    return false;
  }

  const cleanText = stripMarkdownForSpeech(content);
  if (!cleanText || cleanText.length === 0) return false;

  stopSpeaking();

  try {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = options?.rate ?? 1.05;
    utterance.pitch = options?.pitch ?? 1.0;

    // Pick requested voice or best natural voice if available
    const voices = window.speechSynthesis.getVoices();
    const chosenVoice =
      (options?.voiceName
        ? voices.find((v) => v.name === options.voiceName)
        : undefined) ||
      voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'))) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];

    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }

    utterance.onstart = () => {
      options?.onStart?.();
    };

    utterance.onend = () => {
      activeUtterance = null;
      options?.onEnd?.();
    };

    utterance.onerror = (e) => {
      activeUtterance = null;
      options?.onError?.(e);
    };

    activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    activeUtterance = null;
    options?.onError?.(err);
    return false;
  }
}
