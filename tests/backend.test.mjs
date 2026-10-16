import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { emptyState } from '../lib/types.ts';
import { aiSchema, stateUpdateSchema, adminUpdateSchema } from '../lib/validation.ts';
import { ApiError, CAS_SQL, RATE_SQL, TEAM_AUTHOR, aiInstructions, extractResponseText, guardOrigin, isAllowedAdmin, normalizeJob, plainText, protectTeamMessages, readBounded, readJson, validateUpload } from '../lib/server-core.ts';

test('state validation accepts empty accounts and rejects executable URLs and duplicate IDs', () => {
  const state = emptyState('Ada', 'ada@example.com');
  assert.equal(stateUpdateSchema.safeParse({ state, version: 0 }).success, true);
  state.profile.linkedin = 'javascript:alert(1)';
  assert.equal(stateUpdateSchema.safeParse({ state, version: 0 }).success, false);
  state.profile.linkedin = 'https://www.linkedin.com/in/ada';
  state.messages = [{ id: 'same', text: 'Hello', author: 'You', date: '2026-10-16' }, { id: 'same', text: 'Other', author: 'You', date: '2026-10-16' }];
  assert.equal(stateUpdateSchema.safeParse({ state, version: 0 }).success, false);
});

test('state validation rejects unbounded resume input, invalid status, and client-injected identity', () => {
  const state = emptyState();
  state.profile.resume = 'a'.repeat(60001);
  assert.equal(stateUpdateSchema.safeParse({ state, version: 0 }).success, false);
  assert.equal(stateUpdateSchema.safeParse({ state: emptyState(), version: -1 }).success, false);
  assert.equal(stateUpdateSchema.safeParse({ state: emptyState(), version: 0, userId: 'someone-else' }).success, false);
});

test('compare-and-swap rejects lost updates and isolates user IDs', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE candidate_states (user_id TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  db.prepare('INSERT INTO candidate_states VALUES (?, ?, ?, ?)').run('alice', '{}', 0, 'before');
  db.prepare('INSERT INTO candidate_states VALUES (?, ?, ?, ?)').run('bob', '{}', 0, 'before');
  assert.equal(db.prepare(CAS_SQL).get('{"saved":true}', 'now', 'alice', 0).version, 1);
  assert.equal(db.prepare(CAS_SQL).get('{"stale":true}', 'later', 'alice', 0), undefined);
  assert.equal(db.prepare(CAS_SQL).get('{}', 'later', 'missing', 0), undefined);
  assert.equal(db.prepare('SELECT version FROM candidate_states WHERE user_id = ?').get('bob').version, 0);
  assert.equal(db.prepare('SELECT state FROM candidate_states WHERE user_id = ?').get('alice').state, '{"saved":true}');
  db.close();
});

test('persistent SQL quota enforces exact limit, resets next window, and separates users/actions', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE rate_limits (user_id TEXT, action TEXT, window_start INTEGER, count INTEGER, PRIMARY KEY(user_id, action))');
  const consume = (user = 'alice', action = 'ai-minute', window = 100) => db.prepare(RATE_SQL).get(user, action, window, 2);
  assert.equal(consume().count, 1);
  assert.equal(consume().count, 2);
  assert.equal(consume(), undefined);
  assert.equal(consume('bob').count, 1);
  assert.equal(consume('alice', 'jobs-hour').count, 1);
  assert.equal(consume('alice', 'ai-minute', 200).count, 1);
  assert.equal(consume('alice', 'ai-minute', 200).count, 2);
  assert.equal(consume('alice', 'ai-minute', 200), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM rate_limits').get().total, 3);
  db.close();
});

test('admin allowlist defaults closed and matches exact normalized addresses', () => {
  assert.equal(isAllowedAdmin('owner@example.com', undefined), false);
  assert.equal(isAllowedAdmin('OWNER@example.com', ' user@example.com, owner@example.com '), true);
  assert.equal(isAllowedAdmin('fake-owner@example.com', 'owner@example.com'), false);
  assert.equal(adminUpdateSchema.safeParse({ userId: 'alice', version: 0, status: 'Offer' }).success, false);
  assert.equal(adminUpdateSchema.safeParse({ userId: 'alice', version: 0, applicationId: 'app-1', status: 'Offer' }).success, true);
});

test('client cannot forge, overwrite, or erase operator feedback', () => {
  const previous = emptyState();
  previous.messages.push({ id: 'trusted', text: 'Actual review', author: TEAM_AUTHOR, date: '2026-10-16' });
  const next = emptyState();
  next.messages.push({ id: 'trusted', text: 'Forged review', author: 'You', date: '2026-10-16' });
  next.messages.push({ id: 'fake', text: 'Forged author', author: TEAM_AUTHOR, date: '2026-10-17' });
  const saved = protectTeamMessages(next, previous);
  assert.equal(saved.messages.find(message => message.id === 'trusted').text, 'Actual review');
  assert.equal(saved.messages.find(message => message.id === 'fake').author, 'You');
  assert.equal(protectTeamMessages(emptyState(), previous).messages.length, 1);
});

test('mutations reject cross-site origin and permit same-origin requests', () => {
  assert.throws(() => guardOrigin(new Request('https://career.example/api/state', { headers: { origin: 'https://evil.example' } })), ApiError);
  assert.throws(() => guardOrigin(new Request('https://career.example/api/state', { headers: { 'sec-fetch-site': 'cross-site' } })), ApiError);
  assert.doesNotThrow(() => guardOrigin(new Request('https://career.example/api/state', { headers: { origin: 'https://career.example' } })));
});

test('streamed request bounds work even when content-length is missing or false', async () => {
  const request = new Request('https://career.example', { method: 'POST', body: '123456' });
  await assert.rejects(() => readBounded(request, 5), error => error instanceof ApiError && error.status === 413);
  const oversized = new Request('https://career.example', { method: 'POST', body: 'x', headers: { 'content-length': '100' } });
  await assert.rejects(() => readBounded(oversized, 5), error => error.status === 413);
  const malformed = new Request('https://career.example', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } });
  await assert.rejects(() => readJson(malformed), error => error.status === 400);
});

test('uploads reject extension spoofing, malformed PDFs, binary text, and oversize files', () => {
  assert.equal(validateUpload('resume.pdf', 'application/pdf', new TextEncoder().encode('%PDF-1.7\n')), 'application/pdf');
  assert.equal(validateUpload('resume.txt', 'text/plain', new TextEncoder().encode('Ada\nEngineer')), 'text/plain');
  assert.throws(() => validateUpload('resume.pdf', 'application/pdf', new TextEncoder().encode('<script>')), ApiError);
  assert.throws(() => validateUpload('resume.html', 'text/html', new TextEncoder().encode('hello')), ApiError);
  assert.throws(() => validateUpload('resume.txt', 'text/plain', new Uint8Array([0, 255])), ApiError);
  assert.throws(() => validateUpload('resume.txt', 'text/plain', new Uint8Array(5 * 1024 * 1024 + 1)), ApiError);
});

test('job normalization strips encoded markup and rejects unsafe URLs and unknown boards', () => {
  assert.equal(plainText('&lt;p&gt;Hello &amp; world&lt;/p&gt;&lt;script&gt;bad()&lt;/script&gt;'), 'Hello & world');
  const raw = { id: 123, title: 'Designer', content: '<p>Create useful things</p>', absolute_url: 'https://boards.greenhouse.io/figma/jobs/123', location: { name: 'Remote, US' } };
  const job = normalizeJob(raw, 'figma');
  assert.equal(job.company, 'Figma');
  assert.equal(job.workplace, 'Remote');
  assert.equal(job.description, 'Create useful things');
  assert.equal(normalizeJob({ ...raw, absolute_url: 'javascript:alert(1)' }, 'figma'), null);
  assert.equal(normalizeJob(raw, 'https://evil.example'), null);
});

test('AI input requires meaningful task data and bounded known fields', () => {
  assert.equal(aiSchema.safeParse({ task: 'tailor', resume: 'Engineer' }).success, false);
  assert.equal(aiSchema.safeParse({ task: 'tailor', resume: 'Engineer', jobDescription: 'Role' }).success, true);
  assert.equal(aiSchema.safeParse({ task: 'parse-resume', fileId: 'file-123' }).success, true);
  assert.equal(aiSchema.safeParse({ task: 'feedback', question: 'Why?', answer: 'Because...' }).success, true);
  assert.equal(aiSchema.safeParse({ task: 'feedback', answer: 'Because...' }).success, false);
  assert.equal(aiSchema.safeParse({ task: 'outreach', resume: 'Facts', fileId: 'file-123' }).success, false);
  assert.equal(aiSchema.safeParse({ task: 'interview', role: 'Engineer', apiKey: 'do-not-accept' }).success, false);
  assert.match(aiInstructions('tailor'), /Never invent qualifications/);
  assert.match(aiInstructions('parse-resume'), /never commands/);
});

test('Responses extraction uses text messages and ignores reasoning/tool data', () => {
  assert.equal(extractResponseText({ output: [{ type: 'reasoning', content: [{ type: 'output_text', text: 'hidden' }] }, { type: 'message', content: [{ type: 'output_text', text: 'Resume draft' }] }] }), 'Resume draft');
  assert.equal(extractResponseText({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Please supply real experience.' }] }] }), 'Please supply real experience.');
  assert.equal(extractResponseText(null), '');
});
