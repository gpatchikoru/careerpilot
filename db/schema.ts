import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const candidateStates = sqliteTable('candidate_states', {
  userId: text('user_id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
}, table => [index('candidate_states_updated_idx').on(table.updatedAt)]);

export const privateFiles = sqliteTable('private_files', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  objectKey: text('object_key').notNull(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [index('private_files_user_idx').on(table.userId)]);

// One counter row per user and action; upsert increments are atomic in D1.
export const rateLimits = sqliteTable('rate_limits', {
  userId: text('user_id').notNull(),
  action: text('action').notNull(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
}, table => [primaryKey({ columns: [table.userId, table.action] })]);
