import { User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type {
  CompanionAnimState,
  Conversation,
  DeviceSyncNode,
} from '../types/workspace';
import type { ContextDocument } from '../utils/contextSearch';
import { decryptText, encryptText } from '../utils/crypto';
import { enqueueOfflineSync, popOfflineSyncQueue } from './localStore';

async function getBearerHeaders(user: User): Promise<Record<string, string>> {
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function syncSessionWithServer(user: User): Promise<{
  activeTheme?: string;
  e2eeSalt?: string | null;
} | null> {
  if (!navigator.onLine) return null;
  try {
    const headers = await getBearerHeaders(user);
    const res = await fetch('/api/sync/session', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export async function syncConversationToCloud(
  user: User | null,
  conversation: Conversation,
  vaultKey: CryptoKey | null,
): Promise<void> {
  if (!user) return;
  if (!navigator.onLine) {
    enqueueOfflineSync({
      id: conversation.id,
      kind: 'conversation',
      payload: conversation,
      createdAt: Date.now(),
    });
    return;
  }

  let safeTitle = conversation.title.slice(0, 512);
  let convIv: string | null = null;
  const encryptedMessages = await Promise.all(
    conversation.messages.map(async (m) => {
      if (vaultKey) {
        const enc = await encryptText(m.content, vaultKey);
        return {
          id: m.id,
          role: m.role,
          content: enc.ciphertext,
          encrypted: true,
          iv: enc.iv,
          metadata: {
            modelUsed: m.modelUsed,
            thinkingUsed: m.thinkingUsed,
            sources: m.sources,
          },
        };
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        encrypted: false,
        iv: null,
        metadata: {
          modelUsed: m.modelUsed,
          thinkingUsed: m.thinkingUsed,
          sources: m.sources,
        },
      };
    }),
  );

  if (vaultKey) {
    const encTitle = await encryptText(conversation.title, vaultKey);
    safeTitle = encTitle.ciphertext.slice(0, 512);
    convIv = encTitle.iv;
  }

  // 1. Persist to Cloud SQL PostgreSQL via backend API
  try {
    const headers = await getBearerHeaders(user);
    await fetch('/api/sync/conversations', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        conversation: {
          id: conversation.id,
          title: safeTitle,
          mode: conversation.mode,
          providerId: conversation.providerId,
          modelId: conversation.modelId,
          encrypted: Boolean(vaultKey),
          iv: convIv,
          pinned: Boolean(conversation.pinned),
        },
        messages: encryptedMessages,
      }),
    });
  } catch {
    enqueueOfflineSync({
      id: conversation.id,
      kind: 'conversation',
      payload: conversation,
      createdAt: Date.now(),
    });
  }

  // 2. Mirror real-time state to Firestore for cross-platform Windows & Android sync
  const fsPath = `users/${user.uid}/conversations/${conversation.id}`;
  try {
    const lastMsg = encryptedMessages[encryptedMessages.length - 1];
    const ref = doc(db, 'users', user.uid, 'conversations', conversation.id);
    await setDoc(
      ref,
      {
        id: conversation.id,
        userId: user.uid,
        title: safeTitle,
        mode: conversation.mode,
        providerId: conversation.providerId,
        modelId: conversation.modelId,
        encrypted: Boolean(vaultKey),
        ...(convIv ? { iv: convIv } : {}),
        ...(lastMsg
          ? { lastMessageCiphertext: lastMsg.content.slice(0, 65000) }
          : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fsPath);
  }
}

export async function syncDocumentToCloud(
  user: User | null,
  document: ContextDocument,
  vaultKey: CryptoKey | null,
): Promise<void> {
  if (!user || !navigator.onLine) return;
  try {
    const headers = await getBearerHeaders(user);
    let content = document.content;
    let iv: string | null = null;
    if (vaultKey) {
      const enc = await encryptText(document.content, vaultKey);
      content = enc.ciphertext;
      iv = enc.iv;
    }
    await fetch('/api/sync/documents', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: document.id,
        title: document.title,
        docType: document.docType,
        language: document.language ?? 'markdown',
        content,
        encrypted: Boolean(vaultKey),
        iv,
      }),
    });
  } catch {
    // Keep locally saved
  }
}

export async function syncDevicePresence(
  user: User | null,
  device: DeviceSyncNode,
): Promise<void> {
  if (!user || !navigator.onLine) return;
  try {
    const headers = await getBearerHeaders(user);
    await fetch('/api/sync/devices', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: device.id,
        deviceName: device.deviceName,
        platform: device.platform,
        companionMode: device.companionMode,
        e2eeFingerprint: device.e2eeFingerprint ?? null,
      }),
    });
  } catch {
    // Ignore transient network errors
  }

  const fsPath = `users/${user.uid}/devices/${device.id}`;
  try {
    await setDoc(
      doc(db, 'users', user.uid, 'devices', device.id),
      {
        id: device.id,
        userId: user.uid,
        deviceName: device.deviceName,
        platform: device.platform,
        companionMode: device.companionMode,
        companionState: device.companionState,
        ...(device.e2eeFingerprint
          ? { e2eeFingerprint: device.e2eeFingerprint }
          : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, fsPath);
  }
}

export function subscribeToCrossPlatformDevices(
  user: User,
  onDevices: (devices: DeviceSyncNode[]) => void,
): Unsubscribe {
  const path = `users/${user.uid}/devices`;
  const q = query(
    collection(db, 'users', user.uid, 'devices'),
    orderBy('updatedAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DeviceSyncNode[] = [];
      snapshot.forEach((snap) => {
        const d = snap.data();
        list.push({
          id: String(d.id || snap.id),
          deviceName: String(d.deviceName || 'Device'),
          platform: (d.platform as 'windows' | 'android' | 'web') || 'web',
          companionMode:
            (d.companionMode as 'overlay' | 'background_service' | 'web_viewport') ||
            'web_viewport',
          companionState: (d.companionState as CompanionAnimState) || 'idle',
          e2eeFingerprint: d.e2eeFingerprint ? String(d.e2eeFingerprint) : undefined,
          lastSyncAt: d.updatedAt?.toMillis?.() ?? Date.now(),
        });
      });
      if (list.length > 0) onDevices(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export async function flushOfflineSyncQueue(
  user: User,
  vaultKey: CryptoKey | null,
): Promise<number> {
  if (!navigator.onLine) return 0;
  const queued = popOfflineSyncQueue();
  let synced = 0;
  for (const item of queued) {
    if (item.kind === 'conversation') {
      await syncConversationToCloud(user, item.payload as Conversation, vaultKey);
      synced++;
    } else if (item.kind === 'document') {
      await syncDocumentToCloud(user, item.payload as ContextDocument, vaultKey);
      synced++;
    } else if (item.kind === 'device') {
      await syncDevicePresence(user, item.payload as DeviceSyncNode);
      synced++;
    }
  }
  return synced;
}

export async function tryDecryptTitle(
  title: string,
  iv: string | undefined,
  vaultKey: CryptoKey | null,
): Promise<string> {
  if (!iv || !vaultKey) return title;
  try {
    return await decryptText(title, iv, vaultKey);
  } catch {
    return title;
  }
}
