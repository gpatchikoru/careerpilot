import { authenticated, bucket, enforceRate, failure, json, ownedFile, runtimeSecret } from '@/lib/server';
import { ApiError, aiInstructions, aiUserText, extractResponseText, guardOrigin, readJson } from '@/lib/server-core';
import { aiSchema } from '@/lib/validation';

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated();
    const input = aiSchema.parse(await readJson(request, 160_000));
    const content: ({ type: 'input_text'; text: string } | { type: 'input_file'; filename: string; file_data: string })[] = [{ type: 'input_text', text: aiUserText(input) }];
    if (input.fileId) {
      const file = await ownedFile(user.userId, input.fileId);
      const object = await bucket().get(file.object_key);
      if (!object) throw new ApiError(404, 'Please upload your resume again.');
      if (file.mime === 'text/plain') {
        const text = await object.text();
        if (text.length > 60000) throw new ApiError(400, 'This resume is too long. Please upload a shorter resume with up to 60,000 characters.');
        return json({ text });
      }
      content.push({ type: 'input_file', filename: file.name, file_data: `data:application/pdf;base64,${encodeBase64(new Uint8Array(await object.arrayBuffer()))}` });
    }
    const apiKey = runtimeSecret('OPENAI_API_KEY');
    if (!apiKey) throw new ApiError(503, 'AI tools are not configured yet. Your workspace and saved documents are still available.', 'ai_unavailable');
    await enforceRate(user.userId, 'ai-minute', 5, 60_000);
    await enforceRate(user.userId, 'ai-day', 30, 86_400_000);
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-5.4-mini', instructions: aiInstructions(input.task), input: [{ role: 'user', content }], max_output_tokens: 5000, reasoning: { effort: 'low' }, store: false }),
        signal: AbortSignal.timeout(50_000),
      });
    } catch (error) {
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new ApiError(504, 'AI took too long to respond. Please try again with a shorter resume or description.', 'ai_timeout');
      throw new ApiError(502, 'The AI service is temporarily unreachable. Please try again.', 'ai_unavailable');
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new ApiError(503, 'The AI connection needs attention from the site owner.', 'ai_configuration');
      if (response.status === 429) {
        const detail = await response.json().catch(() => ({})) as { error?: { code?: string; type?: string } };
        if (detail.error?.type === 'insufficient_quota' || ['insufficient_quota','credit_balance_exhausted'].includes(detail.error?.code || '')) throw new ApiError(503, 'AI billing credit is exhausted. The site owner needs to add API credit before generation can run.', 'ai_billing');
        throw new ApiError(429, 'The AI provider is receiving too many requests. Please try again later.', 'ai_rate_limited');
      }
      if (response.status === 400 || response.status === 413) throw new ApiError(400, 'The AI service could not read this input. Try a shorter resume or paste the text instead.', 'ai_input');
      throw new ApiError(502, 'The AI service could not complete this request. Please try again.', 'ai_unavailable');
    }
    const body = await response.json() as { status?: string };
    const text = extractResponseText(body);
    if (body.status === 'incomplete') throw new ApiError(502, 'The AI response was incomplete. Try a shorter resume or job description.', 'ai_incomplete');
    if (!text) throw new ApiError(502, 'No text was returned. Please try again.', 'ai_empty');
    return json({ text });
  } catch (error) { return failure(error); }
}
