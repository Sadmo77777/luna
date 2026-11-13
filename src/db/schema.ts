import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  activeTheme: text('active_theme').notNull().default('obsidian'),
  e2eeSalt: text('e2ee_salt'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    userUid: text('user_uid').notNull(),
    title: text('title').notNull(),
    mode: text('mode').notNull().default('chat'), // 'chat' | 'agent' | 'companion'
    providerId: text('provider_id').notNull().default('gemini'),
    modelId: text('model_id').notNull().default('gemini-4-hydrogen'),
    encrypted: boolean('encrypted').notNull().default(false),
    iv: text('iv'),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_conversations_user_updated').on(table.userUid, table.updatedAt),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userUid: text('user_uid').notNull(),
    role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
    content: text('content').notNull(),
    encrypted: boolean('encrypted').notNull().default(false),
    iv: text('iv'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_messages_conv_created').on(table.conversationId, table.createdAt),
    index('idx_messages_user').on(table.userUid),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    userUid: text('user_uid').notNull(),
    title: text('title').notNull(),
    docType: text('doc_type').notNull().default('document'), // 'document' | 'codebase' | 'note'
    language: text('language').default('markdown'),
    content: text('content').notNull(),
    encrypted: boolean('encrypted').notNull().default(false),
    iv: text('iv'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_documents_user_updated').on(table.userUid, table.updatedAt)],
);

export const devices = pgTable(
  'devices',
  {
    id: text('id').primaryKey(),
    userUid: text('user_uid').notNull(),
    deviceName: text('device_name').notNull(),
    platform: text('platform').notNull(), // 'windows' | 'android' | 'web'
    companionMode: text('companion_mode').notNull().default('web_viewport'),
    e2eeFingerprint: text('e2ee_fingerprint'),
    lastSyncAt: timestamp('last_sync_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_devices_user').on(table.userUid)],
);

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));
