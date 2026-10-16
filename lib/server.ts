import { env } from 'cloudflare:workers';
import { ZodError } from 'zod';
import { getChatGPTUser, type ChatGPTUser } from '@/app/chatgpt-auth';
import { emptyState, type AppState } from './types';
import { ApiError, CAS_SQL, RATE_SQL, isAllowedAdmin } from './server-core';

export type CandidateRow = { user_id: string; email: string; display_name: string; state: string; version: number; updated_at: string };
export type FileRow = { id: string; user_id: string; object_key: string; name: string; mime: string; size: number; created_at: string };

export function runtimeSecret(name: 'OPENAI_API_KEY' | 'ADMIN_EMAILS'): string | undefined {
  const value = env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : process.env[name]?.trim() || undefined;
}

export function database(): D1Database {
  if (!env.DB) throw new ApiError(503, 'Account storage is not configured yet. Please contact the site owner.', 'storage_unavailable');
  return env.DB;
}

export function bucket(): R2Bucket {
  if (!env.BUCKET) throw new ApiError(503, 'File uploads are not configured yet. You can paste resume text instead.', 'storage_unavailable');
  return env.BUCKET;
}

export function capabilities() {
  return { ai: Boolean(runtimeSecret('OPENAI_API_KEY')), storage: Boolean(env.BUCKET && env.DB), billing: false };
}

export async function authenticated(): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, 'Sign in to use your private workspace.', 'sign_in_required');
  return user;
}

export function isAdmin(user: ChatGPTUser): boolean { return isAllowedAdmin(user.email, runtimeSecret('ADMIN_EMAILS')); }

export async function administrator(): Promise<ChatGPTUser> {
  const user = await authenticated();
  if (!isAdmin(user)) throw new ApiError(403, 'Operator access is restricted to authorized team members.', 'forbidden');
  return user;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

export function failure(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status, error.status === 429 ? { 'Retry-After': '60' } : {});
  if (error instanceof ZodError) return json({ error: error.issues[0]?.message ?? 'Please check the information you entered.', code: 'invalid_input' }, 400);
  // Never return upstream bodies, SQL, stack traces, credentials, or private candidate data.
  return json({ error: 'We could not complete that request. Please try again.', code: 'server_error' }, 500);
}

export async function getCandidate(userId: string): Promise<CandidateRow | null> {
  return database().prepare('SELECT user_id, email, display_name, state, version, updated_at FROM candidate_states WHERE user_id = ?').bind(userId).first<CandidateRow>();
}

export async function ensureCandidate(user: ChatGPTUser): Promise<CandidateRow> {
  const db = database();
  await db.prepare('INSERT OR IGNORE INTO candidate_states (user_id, email, display_name, state, version, updated_at) VALUES (?, ?, ?, ?, 0, ?)')
    .bind(user.userId, user.email, user.displayName, JSON.stringify(emptyState(user.fullName ?? '', user.email)), new Date().toISOString()).run();
  const candidate = await getCandidate(user.userId);
  if (!candidate) throw new ApiError(503, 'Your workspace could not be loaded. Please try again.');
  return candidate;
}

export function parseState(candidate: CandidateRow): AppState { return JSON.parse(candidate.state) as AppState; }

export async function saveCandidate(userId: string, state: AppState, version: number): Promise<number> {
  const saved = await database().prepare(CAS_SQL).bind(JSON.stringify(state), new Date().toISOString(), userId, version).first<{ version: number }>();
  if (!saved) throw new ApiError(409, 'Your workspace changed in another tab or by your career team. Reload the latest version before saving again.', 'version_conflict');
  return saved.version;
}

export async function enforceRate(userId: string, action: string, limit: number, windowMs: number): Promise<void> {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const result = await database().prepare(RATE_SQL).bind(userId, action, windowStart, limit).first<{ count: number }>();
  if (!result) throw new ApiError(429, action === 'ai-day' ? 'You have reached the daily limit of 30 AI requests. Please try again tomorrow.' : 'You have reached this feature’s request limit. Please try again later.', 'rate_limited');
}

export async function ownedFile(userId: string, fileId: string): Promise<FileRow> {
  const file = await database().prepare('SELECT id, user_id, object_key, name, mime, size, created_at FROM private_files WHERE id = ? AND user_id = ?').bind(fileId, userId).first<FileRow>();
  if (!file) throw new ApiError(404, 'This file is unavailable in your account.', 'file_not_found');
  return file;
}
