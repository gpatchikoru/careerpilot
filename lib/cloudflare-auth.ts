import type { ChatGPTUser } from '../app/chatgpt-auth';

export type CloudflareAccessSettings = {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
};

export class AuthConfigurationError extends Error {
  constructor() {
    super('Authentication is not configured correctly.');
    this.name = 'AuthConfigurationError';
  }
}

export function authenticationMode(value: unknown): 'sites' | 'cloudflare' {
  if (value === undefined || value === 'sites') return 'sites';
  if (value === 'cloudflare') return 'cloudflare';
  throw new AuthConfigurationError();
}

function configuration(settings: CloudflareAccessSettings) {
  const teamDomain = typeof settings.CF_ACCESS_TEAM_DOMAIN === 'string' ? settings.CF_ACCESS_TEAM_DOMAIN.trim().toLowerCase() : undefined;
  const audience = typeof settings.CF_ACCESS_AUD === 'string' ? settings.CF_ACCESS_AUD.trim() : undefined;
  const ownerEmail = typeof settings.OWNER_EMAIL === 'string' ? settings.OWNER_EMAIL.trim().toLowerCase() : undefined;
  // A fixed HTTPS Cloudflare host prevents token-controlled key URLs and SSRF.
  if (!teamDomain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(teamDomain)
    || !audience || !/^[A-Za-z0-9_-]{1,256}$/.test(audience)
    || !ownerEmail || ownerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new AuthConfigurationError();
  }
  return { teamDomain, issuer: `https://${teamDomain}`, audience, ownerEmail };
}

const MAX_TOKEN_LENGTH = 16 * 1024;
const MAX_JWKS_BYTES = 64 * 1024;
const CACHE_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
    && value.trim() === value && !/[\u0000-\u0020\u007f]/.test(value);
}

function decodeSegment(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('Invalid token encoding');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function jsonSegment(value: string): Record<string, unknown> {
  const result: unknown = JSON.parse(decoder.decode(decodeSegment(value)));
  if (!object(result)) throw new Error('Invalid token data');
  return result;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Key endpoint unavailable');
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) > MAX_JWKS_BYTES) throw new Error('Key response too large');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JWKS_BYTES) {
        await reader.cancel();
        throw new Error('Key response too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(decoder.decode(bytes));
}

type KeyCache = {
  keys: Map<string, CryptoKey>;
  expiresAt: number;
  refreshAfter: number;
  pending?: Promise<void>;
};

/** Verify Access application tokens without trusting any identity-only headers. */
export function createCloudflareAccessVerifier(dependencies: { fetch?: typeof fetch; now?: () => number } = {}) {
  const fetchKeys = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
  const now = dependencies.now ?? Date.now;
  const cache = new Map<string, KeyCache>();

  async function verificationKey(issuer: string, kid: string): Promise<CryptoKey | undefined> {
    let entry = cache.get(issuer);
    if (!entry) {
      // Configuration normally uses one issuer; keep memory bounded if it changes.
      if (cache.size >= 8) cache.delete(cache.keys().next().value!);
      entry = { keys: new Map(), expiresAt: 0, refreshAfter: 0 };
      cache.set(issuer, entry);
    }
    if (now() < entry.expiresAt && entry.keys.has(kid)) return entry.keys.get(kid);
    if (!entry.pending && now() >= entry.refreshAfter) {
      const current = entry;
      current.refreshAfter = now() + REFRESH_INTERVAL_MS;
      current.pending = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetchKeys(`${issuer}/cdn-cgi/access/certs`, {
            headers: { Accept: 'application/json' }, redirect: 'manual', credentials: 'omit', signal: controller.signal,
          });
          const jwks = await boundedJson(response);
          if (!object(jwks) || !Array.isArray(jwks.keys) || jwks.keys.length < 1 || jwks.keys.length > 8) throw new Error('Invalid key set');
          const keys = new Map<string, CryptoKey>();
          for (const key of jwks.keys) {
            if (!object(key) || !boundedString(key.kid, 256) || keys.has(key.kid) || key.kty !== 'RSA'
              || (key.alg !== undefined && key.alg !== 'RS256') || (key.use !== undefined && key.use !== 'sig')
              || (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify')))
              || !boundedString(key.n, 1400) || !boundedString(key.e, 16)) throw new Error('Invalid signing key');
            const modulus = decodeSegment(key.n);
            if (modulus.length < 256 || modulus.length > 1024) throw new Error('Invalid RSA key size');
            const imported = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: key.n, e: key.e, alg: 'RS256', ext: true, key_ops: ['verify'] },
              { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
            keys.set(key.kid, imported);
          }
          current.keys = keys;
          current.expiresAt = now() + CACHE_MS;
        } catch {
          // Outages and malformed responses never extend the life of cached keys.
        } finally {
          clearTimeout(timeout);
        }
      })().finally(() => { current.pending = undefined; });
    }
    await entry.pending;
    return now() < entry.expiresAt ? entry.keys.get(kid) : undefined;
  }

  return async function getCloudflareAccessUser(requestHeaders: Pick<Headers, 'get'>, settings: CloudflareAccessSettings): Promise<ChatGPTUser | null> {
    // Misconfiguration is distinct from an invalid login and never falls back to Sites.
    const config = configuration(settings);
    const token = requestHeaders.get('Cf-Access-Jwt-Assertion');
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const header = jsonSegment(parts[0]);
      if (header.alg !== 'RS256' || !boundedString(header.kid, 256) || header.crit !== undefined
        || (header.b64 !== undefined && header.b64 !== true)) return null;
      const claims = jsonSegment(parts[1]);
      const seconds = Math.floor(now() / 1000);
      const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
      if (claims.iss !== config.issuer || claims.type !== 'app'
        || !Array.isArray(audiences) || audiences.length > 32 || !audiences.every(item => boundedString(item, 256)) || !audiences.includes(config.audience)
        || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= seconds
        || typeof claims.nbf !== 'number' || !Number.isSafeInteger(claims.nbf) || claims.nbf < 0 || claims.nbf > seconds || claims.nbf >= claims.exp
        || (claims.iat !== undefined && (typeof claims.iat !== 'number' || !Number.isSafeInteger(claims.iat) || claims.iat < 0 || claims.iat > seconds))
        || !boundedString(claims.sub, 256) || !boundedString(claims.email, 254) || claims.email.toLowerCase() !== config.ownerEmail) return null;
      const signature = decodeSegment(parts[2]);
      if (signature.length < 256 || signature.length > 1024) return null;
      const key = await verificationKey(config.issuer, header.kid);
      if (!key || !await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, encoder.encode(`${parts[0]}.${parts[1]}`))) return null;
      // Time may have advanced while the key endpoint was being contacted.
      if (claims.exp <= Math.floor(now() / 1000)) return null;
      const fullName = typeof claims.name === 'string' && claims.name.trim().length > 0 && claims.name.length <= 200
        && !/[\u0000-\u001f\u007f]/.test(claims.name) ? claims.name.trim() : null;
      return {
        userId: `cloudflare:${config.teamDomain}:${encodeURIComponent(claims.sub)}`,
        email: config.ownerEmail,
        displayName: fullName ?? config.ownerEmail,
        fullName,
      };
    } catch {
      return null;
    }
  };
}

export const getCloudflareAccessUser = createCloudflareAccessVerifier();
