import { administrator, database, failure, getCandidate, json, parseState, saveCandidate, type CandidateRow } from '@/lib/server';
import { ApiError, MAX_STATE_BYTES, TEAM_AUTHOR, guardOrigin, readJson } from '@/lib/server-core';
import { adminUpdateSchema } from '@/lib/validation';

export async function GET(request: Request) {
  try {
    await administrator();
    const offset = Math.max(0, Math.min(100_000, Number(new URL(request.url).searchParams.get('offset')) || 0));
    const rows = await database().prepare('SELECT user_id, email, display_name, state, version, updated_at FROM candidate_states ORDER BY updated_at DESC LIMIT 31 OFFSET ?').bind(Math.floor(offset)).all<CandidateRow>();
    const users = rows.results.slice(0, 30).map(row => {
      const state = parseState(row);
      return { id: row.user_id, name: state.profile.name || row.display_name, email: row.email, profile: state.profile, applicationsCount: state.applications.length, applications: state.applications, messages: state.messages, lastActivity: row.updated_at, version: row.version };
    });
    return json({ users, nextOffset: rows.results.length > 30 ? offset + 30 : null });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    guardOrigin(request);
    await administrator();
    const input = adminUpdateSchema.parse(await readJson(request, 10_000));
    const candidate = await getCandidate(input.userId);
    if (!candidate) throw new ApiError(404, 'This candidate workspace was not found.');
    if (candidate.version !== input.version) throw new ApiError(409, 'This candidate workspace changed. Refresh the queue before saving.', 'version_conflict');
    const state = parseState(candidate);
    const now = new Date().toISOString();
    if (input.message) {
      if (state.messages.length >= 500) throw new ApiError(400, 'This support conversation has reached its message limit.');
      state.messages.push({ id: crypto.randomUUID(), text: input.message, date: now, author: TEAM_AUTHOR });
    }
    if (input.applicationId && input.status) {
      const application = state.applications.find(item => item.id === input.applicationId);
      if (!application) throw new ApiError(404, 'This application was not found in the candidate workspace.');
      application.status = input.status;
      application.history = [...application.history, { status: input.status, date: now }].slice(-100);
    }
    if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_STATE_BYTES) throw new ApiError(413, 'This workspace is full. Ask the candidate to remove old documents.');
    return json({ version: await saveCandidate(input.userId, state, input.version) });
  } catch (error) { return failure(error); }
}
