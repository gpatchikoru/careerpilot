import handler from 'vinext/server/fetch-handler';
import { getCloudflareAccessUser, AuthConfigurationError } from '../lib/cloudflare-auth';

const BASE_PATH = '/careercopilot';
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    // A wildcard route also matches names such as /careercopilot-blog.
    // Let those requests continue to the existing GitHub Pages origin.
    if (url.pathname !== BASE_PATH && !url.pathname.startsWith(`${BASE_PATH}/`)) return fetch(request);
    try {
      if (env.CAREERPILOT_AUTH_MODE !== 'cloudflare') throw new AuthConfigurationError();
      const user = await getCloudflareAccessUser(request.headers, env);
      if (!user) return new Response('Sign in through Cloudflare Access to open your private CareerPilot workspace.', {
        status: 401, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8' },
      });
      if (url.pathname === BASE_PATH) {
        url.pathname += '/';
        return Response.redirect(url.toString(), 308);
      }
      // Authenticate before serving assets. Vite emits chunks below the base
      // path, while public/ files remain at the asset directory root.
      if (env.ASSETS && (url.pathname.startsWith(`${BASE_PATH}/_next/static/`) || url.pathname === `${BASE_PATH}/favicon.svg`)) {
        if (url.pathname === `${BASE_PATH}/favicon.svg`) url.pathname = '/favicon.svg';
        const asset = await env.ASSETS.fetch(new Request(url, request));
        const response = new Response(asset.body, asset);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
      return handler.fetch(request, env, ctx);
    } catch (error) {
      return new Response(error instanceof AuthConfigurationError ? 'Private access is not configured yet.' : 'Unable to open the private workspace. Please try again.', {
        status: error instanceof AuthConfigurationError ? 503 : 500,
        headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
