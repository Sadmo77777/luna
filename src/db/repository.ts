import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  conversations,
  devices,
  documents,
  messages,
  users,
} from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null,
  photoUrl?: string | null,
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
        photoUrl: photoUrl ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
          photoUrl: photoUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function updateUserPreferences(
  uid: string,
  activeTheme?: string,
  e2eeSalt?: string,
) {
  try {
    const updates: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (activeTheme) updates.activeTheme = activeTheme;
    if (e2eeSalt) updates.e2eeSalt = e2eeSalt;

    const result = await db
      .update(users)
      .set(updates)
      .where(eq(users.uid, uid))
      .returning();

    return result[0] ?? null;
  } catch (error) {
    console.error('Database error in updateUserPreferences:', error);
    throw new Error('Failed to update user preferences.', { cause: error });
  }
}

export async function listUserConversations(uid: string) {
  try {
    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userUid, uid))
      .orderBy(desc(conversations.updatedAt));

    const msgRows = await db
      .select()
      .from(messages)
      .where(eq(messages.userUid, uid))
      .orderBy(messages.createdAt);

    const byConv = new Map<string, typeof msgRows>();
    for (const msg of msgRows) {
      const arr = byConv.get(msg.conversationId) ?? [];
      arr.push(msg);
      byConv.set(msg.conversationId, arr);
    }

    return convRows.map((c) => ({
      ...c,
      messages: byConv.get(c.id) ?? [],
    }));
  } catch (error) {
    console.error('Database error in listUserConversations:', error);
    throw new Error('Failed to load conversations from database.', { cause: error });
  }
}

export async function upsertConversation(
  uid: string,
  payload: {
    id: string;
    title: string;
    mode: string;
    providerId: string;
    modelId: string;
    encrypted: boolean;
    iv?: string | null;
    pinned?: boolean;
  },
) {
  try {
    const result = await db
      .insert(conversations)
      .values({
        id: payload.id,
        userUid: uid,
        title: payload.title,
        mode: payload.mode,
        providerId: payload.providerId,
        modelId: payload.modelId,
        encrypted: payload.encrypted,
        iv: payload.iv ?? null,
        pinned: payload.pinned ?? false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          title: payload.title,
          mode: payload.mode,
          providerId: payload.providerId,
          modelId: payload.modelId,
          encrypted: payload.encrypted,
          iv: payload.iv ?? null,
          pinned: payload.pinned ?? false,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database error in upsertConversation:', error);
    throw new Error('Failed to save conversation.', { cause: error });
  }
}

export async function deleteUserConversation(uid: string, conversationId: string) {
  try {
    await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userUid, uid),
        ),
      );
  } catch (error) {
    console.error('Database error in deleteUserConversation:', error);
    throw new Error('Failed to delete conversation.', { cause: error });
  }
}

export async function upsertMessage(
  uid: string,
  payload: {
    id: string;
    conversationId: string;
    role: string;
    content: string;
    encrypted: boolean;
    iv?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  try {
    const result = await db
      .insert(messages)
      .values({
        id: payload.id,
        conversationId: payload.conversationId,
        userUid: uid,
        role: payload.role,
        content: payload.content,
        encrypted: payload.encrypted,
        iv: payload.iv ?? null,
        metadata: payload.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          content: payload.content,
          encrypted: payload.encrypted,
          iv: payload.iv ?? null,
          metadata: payload.metadata ?? null,
        },
      })
      .returning();

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(conversations.id, payload.conversationId),
          eq(conversations.userUid, uid),
        ),
      );

    return result[0];
  } catch (error) {
    console.error('Database error in upsertMessage:', error);
    throw new Error('Failed to save message.', { cause: error });
  }
}

export async function listUserDocuments(uid: string) {
  try {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.userUid, uid))
      .orderBy(desc(documents.updatedAt));
  } catch (error) {
    console.error('Database error in listUserDocuments:', error);
    throw new Error('Failed to load workspace documents.', { cause: error });
  }
}

export async function upsertDocument(
  uid: string,
  payload: {
    id: string;
    title: string;
    docType: string;
    language?: string;
    content: string;
    encrypted: boolean;
    iv?: string | null;
  },
) {
  try {
    const result = await db
      .insert(documents)
      .values({
        id: payload.id,
        userUid: uid,
        title: payload.title,
        docType: payload.docType,
        language: payload.language ?? 'markdown',
        content: payload.content,
        encrypted: payload.encrypted,
        iv: payload.iv ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: documents.id,
        set: {
          title: payload.title,
          docType: payload.docType,
          language: payload.language ?? 'markdown',
          content: payload.content,
          encrypted: payload.encrypted,
          iv: payload.iv ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database error in upsertDocument:', error);
    throw new Error('Failed to save workspace document.', { cause: error });
  }
}

export async function deleteUserDocument(uid: string, documentId: string) {
  try {
    await db
      .delete(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userUid, uid)));
  } catch (error) {
    console.error('Database error in deleteUserDocument:', error);
    throw new Error('Failed to delete workspace document.', { cause: error });
  }
}

export async function listUserDevices(uid: string) {
  try {
    return await db
      .select()
      .from(devices)
      .where(eq(devices.userUid, uid))
      .orderBy(desc(devices.lastSyncAt));
  } catch (error) {
    console.error('Database error in listUserDevices:', error);
    throw new Error('Failed to load registered devices.', { cause: error });
  }
}

export async function upsertDevice(
  uid: string,
  payload: {
    id: string;
    deviceName: string;
    platform: string;
    companionMode: string;
    e2eeFingerprint?: string | null;
  },
) {
  try {
    const result = await db
      .insert(devices)
      .values({
        id: payload.id,
        userUid: uid,
        deviceName: payload.deviceName,
        platform: payload.platform,
        companionMode: payload.companionMode,
        e2eeFingerprint: payload.e2eeFingerprint ?? null,
        lastSyncAt: new Date(),
      })
      .onConflictDoUpdate({
        target: devices.id,
        set: {
          deviceName: payload.deviceName,
          platform: payload.platform,
          companionMode: payload.companionMode,
          e2eeFingerprint: payload.e2eeFingerprint ?? null,
          lastSyncAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database error in upsertDevice:', error);
    throw new Error('Failed to register sync device.', { cause: error });
  }
}
