import { fileURLToPath } from 'node:url';
const [command, ...args] = process.argv.slice(2);
if (!['dev', 'build'].includes(command)) throw new Error('Expected dev or build.');
process.env.CAREERPILOT_DEPLOY_TARGET = 'cloudflare';
process.env.NEXT_PUBLIC_CAREERPILOT_BASE_PATH = '/careercopilot';
process.env.NEXT_PUBLIC_CAREERPILOT_AUTH_MODE = 'cloudflare';
process.argv = [process.execPath, fileURLToPath(new URL('./run-framework.mjs', import.meta.url)), command, ...args];
await import('./run-framework.mjs');
