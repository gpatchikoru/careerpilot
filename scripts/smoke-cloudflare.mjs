import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, Response } from 'miniflare';

// Exercise the built Worker with disposable storage and locally signed fixtures.
// This does not add an authentication bypass or contact production services.
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const key = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'smoke', alg: 'RS256', use: 'sig' };
const bindings = { CAREERPILOT_AUTH_MODE: 'cloudflare', CF_ACCESS_TEAM_DOMAIN: 'career-test.cloudflareaccess.com', CF_ACCESS_AUD: 'smoke-audience', OWNER_EMAIL: 'owner@example.com' };
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const payload = `${encode({ alg: 'RS256', kid: key.kid })}.${encode({ iss: `https://${bindings.CF_ACCESS_TEAM_DOMAIN}`, aud: [bindings.CF_ACCESS_AUD], sub: 'smoke-owner', email: bindings.OWNER_EMAIL, type: 'app', nbf: now - 10, exp: now + 600 })}`;
const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(payload));
const headers = { 'cf-access-jwt-assertion': `${payload}.${Buffer.from(signature).toString('base64url')}` };
const mf = new Miniflare({
  modules: (await readdir('dist/server', { recursive: true })).filter(path => /\.m?js$/.test(path)).sort((a, b) => a === 'index.js' ? -1 : b === 'index.js' ? 1 : a.localeCompare(b)).map(path => ({ type: 'ESModule', path: `dist/server/${path}` })), modulesRoot: 'dist/server',
  modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'], fallthrough: true }],
  compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], bindings,
  d1Databases: ['DB'], r2Buckets: ['BUCKET'],
  assets: { directory: 'dist/client', binding: 'ASSETS', routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true } },
  outboundService: async request => {
    const url = new URL(request.url);
    if (url.hostname === bindings.CF_ACCESS_TEAM_DOMAIN && url.pathname === '/cdn-cgi/access/certs') return Response.json({ keys: [key] });
    if (url.hostname === 'patchikoru.com') return new Response('portfolio-origin');
    throw new Error(`Unexpected outbound request: ${url.origin}`);
  },
});
try {
  const db = await mf.getD1Database('DB');
  const migration = await readFile('drizzle/0000_sleepy_red_wolf.sql', 'utf8');
  for (const sql of migration.split('--> statement-breakpoint').map(x => x.trim()).filter(Boolean)) await db.prepare(sql).run();
  const request = (path, init = {}) => mf.dispatchFetch(`https://patchikoru.com${path}`, { ...init, headers: { ...headers, ...init.headers } });
  assert.equal((await mf.dispatchFetch('https://patchikoru.com/careercopilot/api/state')).status, 401);
  const redirect = await request('/careercopilot', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  const page = await request('/careercopilot/');
  assert.equal(page.status, 200);
  const html = await page.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/careercopilot\/[^"?]+(?:\.js|\.css|\.svg))/g)].map(x => x[1]))];
  assert.ok(assets.length > 1, 'HTML must reference prefixed assets');
  for (const path of assets) assert.equal((await request(path)).status, 200, `Asset ${path}`);
  const stateResponse = await request('/careercopilot/api/state');
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.user.email, bindings.OWNER_EMAIL);
  const saved = await request('/careercopilot/api/state', { method: 'PUT', headers: { Origin: 'https://patchikoru.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ state: state.state, version: state.version }) });
  assert.equal(saved.status, 200);
  assert.equal((await (await request('/careercopilot/api/state')).json()).version, state.version + 1);
  assert.equal(await (await request('/careercopilot-blog')).text(), 'portfolio-origin');
  console.log(`Cloudflare smoke passed: protected routes, page, ${assets.length} assets, D1 save/reload, portfolio fallthrough.`);
} finally { await mf.dispose(); }
