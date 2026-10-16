import vinext from 'vinext';
import type { UserConfig } from 'vite';

// Separate from Sites: this deployment runs in the domain owner's Cloudflare account.
export async function cloudflareConfig(): Promise<UserConfig> {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= 'false';
  process.env.WRANGLER_SEND_METRICS ??= 'false';
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.WRANGLER_REGISTRY_PATH ??= '.wrangler/dev-registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    server: { host: '127.0.0.1', watch: { useFsEvents: false, usePolling: true } },
    plugins: [vinext(), cloudflare({
      configPath: './wrangler.careerpilot.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      inspectorPort: false,
    })],
  };
}
