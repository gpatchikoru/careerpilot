import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthConfigurationError, authenticationMode, createCloudflareAccessVerifier } from '../lib/cloudflare-auth.ts';

const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const [pair, rotatedPair] = await Promise.all([
  crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']),
  crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']),
]);
const publicKey = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'current-key', alg: 'RS256', use: 'sig' };
const rotatedKey = { ...await crypto.subtle.exportKey('jwk', rotatedPair.publicKey), kid: 'rotated-key', alg: 'RS256', use: 'sig' };
const epoch = 1800000000;
const config = { CF_ACCESS_TEAM_DOMAIN: 'career-test.cloudflareaccess.com', CF_ACCESS_AUD: 'career-app-audience', OWNER_EMAIL: 'owner@example.com' };
const claims = { aud: [config.CF_ACCESS_AUD], iss: `https://${config.CF_ACCESS_TEAM_DOMAIN}`, email: config.OWNER_EMAIL, sub: 'owner-subject-123', type: 'app', nbf: epoch - 10, iat: epoch - 10, exp: epoch + 3600 };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

async function token(overrides = {}, headerOverrides = {}, signer = pair.privateKey) {
  const data = `${encode({ alg: 'RS256', typ: 'JWT', kid: publicKey.kid, ...headerOverrides })}.${encode({ ...claims, ...overrides })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signer, new TextEncoder().encode(data));
  return `${data}.${Buffer.from(signature).toString('base64url')}`;
}

function harness() {
  const state = { time: epoch * 1000, fetches: 0, keys: [publicKey], unavailable: false, response: null };
  const verify = createCloudflareAccessVerifier({
    now: () => state.time,
    fetch: async (url, options) => {
      state.fetches += 1;
      assert.equal(url, `https://${config.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
      assert.equal(options.redirect, 'manual', 'key fetches must not follow redirects');
      assert.equal(options.credentials, 'omit');
      assert.ok(options.signal instanceof AbortSignal);
      if (state.unavailable) throw new Error('Simulated key endpoint outage');
      return state.response?.() ?? Response.json({ keys: state.keys });
    },
  });
  const authenticate = (jwt, settings = config, extras = {}) => verify(new Headers({ ...extras, ...(jwt ? { 'cf-access-jwt-assertion': jwt } : {}) }), settings);
  return { state, authenticate, verify };
}

test('auth mode preserves the Sites default and fails closed for any unexpected explicit mode', () => {
  assert.equal(authenticationMode(undefined), 'sites');
  assert.equal(authenticationMode('sites'), 'sites');
  assert.equal(authenticationMode('cloudflare'), 'cloudflare');
  for (const value of ['', 'Cloudflare', 'none', ' cloudflare ', null, false]) {
    assert.throws(() => authenticationMode(value), AuthConfigurationError);
  }
});

test('a valid signed Access app token yields stable issuer-scoped identity from signed claims only', async () => {
  const { authenticate, state } = harness();
  const jwt = await token({ email: 'OWNER@example.com', name: 'Ada Lovelace' });
  const user = await authenticate(jwt, config, { 'cf-access-authenticated-user-email': 'attacker@example.com', 'oai-authenticated-user-id': 'attacker' });
  assert.deepEqual(user, { userId: 'cloudflare:career-test.cloudflareaccess.com:owner-subject-123', email: 'owner@example.com', displayName: 'Ada Lovelace', fullName: 'Ada Lovelace' });
  const withoutName = await authenticate(await token({ aud: config.CF_ACCESS_AUD }));
  assert.equal(withoutName.userId, user.userId);
  assert.equal(withoutName.fullName, null);
  assert.equal(withoutName.displayName, 'owner@example.com');
  assert.equal(state.fetches, 1);
});

test('identity headers and cookies cannot authenticate without a signed assertion', async () => {
  const { authenticate, state } = harness();
  assert.equal(await authenticate(null, config, {
    'cf-access-authenticated-user-email': config.OWNER_EMAIL,
    'oai-authenticated-user-id': 'fake-owner',
    'oai-authenticated-user-email': config.OWNER_EMAIL,
    cookie: `CF_Authorization=${await token()}`,
  }), null);
  assert.equal(state.fetches, 0);
});

test('modified claims, attacker signatures, and algorithm substitution are rejected', async () => {
  const { authenticate } = harness();
  const original = await token();
  const parts = original.split('.');
  parts[1] = encode({ ...claims, sub: 'stolen-account' });
  assert.equal(await authenticate(parts.join('.')), null);
  assert.equal(await authenticate(await token({}, {}, rotatedPair.privateKey)), null);
  for (const alg of ['none', 'HS256', 'RS512']) assert.equal(await authenticate(await token({}, { alg })), null);
  assert.equal(await authenticate(await token({}, { crit: ['custom'], custom: true })), null);
  assert.equal(await authenticate(await token({}, { b64: false })), null);
});

test('issuer, audience, owner, subject, app type, and token timing are enforced', async () => {
  const { authenticate, state } = harness();
  const invalidClaims = [
    { iss: 'https://attacker.cloudflareaccess.com' }, { iss: `${claims.iss}/` },
    { aud: ['another-app'] }, { aud: [config.CF_ACCESS_AUD, 1] }, { aud: undefined },
    { email: 'other@example.com' }, { email: `fake-${config.OWNER_EMAIL}` }, { email: undefined },
    { sub: '' }, { sub: undefined }, { sub: 'bad\nsubject' }, { sub: 's'.repeat(257) },
    { type: 'org' }, { type: undefined },
    { exp: epoch }, { exp: epoch - 1 }, { exp: String(epoch + 100) }, { exp: undefined },
    { nbf: epoch + 1 }, { nbf: 'yesterday' }, { nbf: undefined }, { nbf: -1 },
    { iat: epoch + 1 }, { iat: 'today' },
  ];
  for (const overrides of invalidClaims) assert.equal(await authenticate(await token(overrides)), null, JSON.stringify(overrides));
  assert.equal(state.fetches, 0, 'obviously invalid claims do not fetch keys');
  assert.ok(await authenticate(await token({ nbf: epoch })));
});

test('missing configuration and unsafe key endpoint domains fail closed before fetching', async () => {
  const { authenticate, state } = harness();
  const jwt = await token();
  for (const settings of [
    {}, { ...config, CF_ACCESS_TEAM_DOMAIN: undefined }, { ...config, CF_ACCESS_AUD: '' }, { ...config, OWNER_EMAIL: undefined },
    { ...config, CF_ACCESS_TEAM_DOMAIN: 1 }, { ...config, CF_ACCESS_AUD: false }, { ...config, OWNER_EMAIL: 2 },
    { ...config, OWNER_EMAIL: 'owner@example.com,other@example.com' },
    ...['evil.example', 'https://career-test.cloudflareaccess.com', 'career-test.cloudflareaccess.com.evil.example', 'career-test.cloudflareaccess.com/path', 'career-test.cloudflareaccess.com:443', 'career-test.cloudflareaccess.com@127.0.0.1', '-bad.cloudflareaccess.com'].map(CF_ACCESS_TEAM_DOMAIN => ({ ...config, CF_ACCESS_TEAM_DOMAIN })),
  ]) await assert.rejects(() => authenticate(jwt, settings), AuthConfigurationError);
  assert.equal(state.fetches, 0);
});

test('malformed and oversized JWTs are rejected without a key lookup', async () => {
  const { authenticate, state } = harness();
  for (const jwt of ['a'.repeat(16385), 'a.b', 'a.b.c.d', '!.e30.c2ln', `${encode([])}.${encode(claims)}.c2ln`, `${encode({ alg: 'RS256', kid: publicKey.kid })}.${encode([])}.c2ln`, `${encode({ alg: 'RS256', kid: publicKey.kid })}.${encode(claims)}.c2ln`]) {
    assert.equal(await authenticate(jwt), null);
  }
  assert.equal(state.fetches, 0);
});

test('token-supplied key URLs are ignored and only the configured issuer supplies signing keys', async () => {
  const { authenticate, state } = harness();
  const jwt = await token({}, { jku: 'https://attacker.example/keys', x5u: 'http://127.0.0.1/private', jwk: rotatedKey });
  assert.ok(await authenticate(jwt));
  assert.equal(state.fetches, 1);
});

test('JWKS cache deduplicates concurrent lookups and refreshes rotated keys with bounded frequency', async () => {
  const { authenticate, state } = harness();
  const jwt = await token();
  assert.ok((await Promise.all(Array.from({ length: 20 }, () => authenticate(jwt)))).every(Boolean));
  assert.equal(state.fetches, 1);
  const rotatedJwt = await token({}, { kid: rotatedKey.kid }, rotatedPair.privateKey);
  state.keys = [rotatedKey];
  for (let i = 0; i < 5; i++) assert.equal(await authenticate(rotatedJwt), null);
  assert.equal(state.fetches, 1, 'unrecognized key IDs cannot repeatedly trigger network work');
  state.time += 61000;
  assert.ok(await authenticate(rotatedJwt));
  assert.equal(state.fetches, 2);
  assert.equal(await authenticate(jwt), null, 'a removed key is not retained after refresh');
});

test('key endpoint outages fail closed and never extend expired cached keys', async () => {
  const { authenticate, state } = harness();
  const jwt = await token();
  assert.ok(await authenticate(jwt));
  state.time += 301000;
  state.unavailable = true;
  assert.equal(await authenticate(jwt), null);
  assert.equal(await authenticate(jwt), null);
  assert.equal(state.fetches, 2);
  state.unavailable = false;
  state.time += 61000;
  assert.ok(await authenticate(jwt));
  assert.equal(state.fetches, 3);
});

test('malformed, oversized, duplicate, or unsuitable signing keys are rejected', async () => {
  const jwt = await token();
  for (const response of [
    () => new Response('unavailable', { status: 503 }),
    () => new Response(null, { status: 302, headers: { location: 'https://attacker.example/keys' } }),
    () => new Response('{'),
    () => Response.json({ keys: [] }),
    () => Response.json({ keys: [publicKey, publicKey] }),
    () => Response.json({ keys: [{ ...publicKey, kty: 'EC' }] }),
    () => Response.json({ keys: [{ ...publicKey, alg: 'HS256' }] }),
    () => Response.json({ keys: [{ ...publicKey, use: 'enc' }] }),
    () => Response.json({ keys: [{ ...publicKey, n: 'AQAB' }] }),
    () => new Response(' '.repeat(65537)),
    () => Response.json({ keys: [publicKey] }, { headers: { 'content-length': '65537' } }),
  ]) {
    const { authenticate, state } = harness();
    state.response = response;
    assert.equal(await authenticate(jwt), null);
  }
});

test('a token that expires during key retrieval cannot establish a session', async () => {
  const { authenticate, state } = harness();
  state.response = () => {
    state.time += 2000;
    return Response.json({ keys: [publicKey] });
  };
  assert.equal(await authenticate(await token({ exp: epoch + 1 })), null);
});
