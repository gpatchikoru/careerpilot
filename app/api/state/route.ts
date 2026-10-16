import { authenticated, capabilities, ensureCandidate, failure, isAdmin, json, parseState, saveCandidate } from '@/lib/server';
import { ApiError, MAX_STATE_BYTES, guardOrigin, protectTeamMessages, readJson } from '@/lib/server-core';
import { stateUpdateSchema } from '@/lib/validation';

export async function GET() {
  try {
    const user = await authenticated();
    const candidate = await ensureCandidate(user);
    return json({ state: parseState(candidate), version: candidate.version, user: { id: user.userId, name: user.displayName, email: user.email, admin: isAdmin(user) }, capabilities: capabilities() });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated();
    const input = stateUpdateSchema.parse(await readJson(request));
    const candidate = await ensureCandidate(user);
    if (candidate.version !== input.version) throw new ApiError(409, 'Your workspace changed. Reload the latest version before saving again.', 'version_conflict');
    const state = protectTeamMessages(input.state, parseState(candidate));
    if (new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_STATE_BYTES) throw new ApiError(413, 'Your workspace is full. Remove old documents or job descriptions before saving.');
    const version = await saveCandidate(user.userId, state, input.version);
    return json({ version });
  } catch (error) { return failure(error); }
}
