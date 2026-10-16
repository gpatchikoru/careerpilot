import { authenticated, bucket, database, enforceRate, failure, json, ownedFile } from '@/lib/server';
import { ApiError, MAX_FILE_BYTES, guardOrigin, readBounded, safeFilename, validateUpload } from '@/lib/server-core';

export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated();
    const storage = bucket();
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new ApiError(415, 'Choose a PDF or TXT resume to upload.');
    const bytes = await readBounded(request, MAX_FILE_BYTES + 32_768);
    const parsed = await new Response(bytes.buffer as ArrayBuffer, { headers: { 'content-type': request.headers.get('content-type')! } }).formData();
    const file = parsed.get('file');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') throw new ApiError(400, 'Choose a PDF or TXT resume first.');
    const content = new Uint8Array(await file.arrayBuffer());
    const mime = validateUpload(file.name, file.type, content);
    await enforceRate(user.userId, 'upload-day', 30, 86_400_000);
    const count = await database().prepare('SELECT COUNT(*) AS total FROM private_files WHERE user_id = ?').bind(user.userId).first<{ total: number }>();
    if ((count?.total ?? 0) >= 100) throw new ApiError(400, 'Your account has reached the limit of 100 uploaded files.');
    const id = crypto.randomUUID();
    const name = safeFilename(file.name);
    const objectKey = `resumes/${id}`;
    await storage.put(objectKey, content.buffer as ArrayBuffer, { httpMetadata: { contentType: mime }, customMetadata: { owner: user.userId } });
    try {
      await database().prepare('INSERT INTO private_files (id, user_id, object_key, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, user.userId, objectKey, name, mime, file.size, new Date().toISOString()).run();
    } catch (error) { await storage.delete(objectKey); throw error; }
    return json({ id, name }, 201);
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  try {
    const user = await authenticated();
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new ApiError(400, 'Choose an uploaded file.');
    const file = await ownedFile(user.userId, id);
    const object = await bucket().get(file.object_key);
    if (!object) throw new ApiError(404, 'This file is no longer available.');
    return new Response(object.body, { headers: {
      'Content-Type': file.mime, 'Content-Length': String(file.size), 'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="resume.${file.mime === 'application/pdf' ? 'pdf' : 'txt'}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  } catch (error) { return failure(error); }
}
