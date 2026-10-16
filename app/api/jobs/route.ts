import { authenticated, enforceRate, failure, json } from '@/lib/server';
import { ApiError, BOARDS, normalizeJob } from '@/lib/server-core';

export async function GET(request: Request) {
  try {
    const user = await authenticated();
    const board = new URL(request.url).searchParams.get('board') ?? 'figma';
    if (!Object.hasOwn(BOARDS, board)) throw new ApiError(400, 'Choose a supported company board.', 'invalid_board');
    await enforceRate(user.userId, 'jobs-hour', 60, 3_600_000);
    let response: Response;
    try {
      response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000), redirect: 'manual' });
    } catch { throw new ApiError(502, 'This company’s job board is temporarily unreachable. Please try another company.'); }
    if (!response.ok) throw new ApiError(502, 'This company’s job board is unavailable right now. Please try another company.');
    const body = await response.json() as { jobs?: Record<string, unknown>[] };
    if (!Array.isArray(body.jobs)) throw new ApiError(502, 'This company’s job board returned an unexpected response.');
    const jobs = body.jobs.slice(0, 50).map(job => normalizeJob(job, board)).filter(Boolean);
    return json({ jobs, source: 'Greenhouse', company: BOARDS[board], fetchedAt: new Date().toISOString() });
  } catch (error) { return failure(error); }
}
