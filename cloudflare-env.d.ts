declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    ADMIN_EMAILS?: string;
    CAREERPILOT_AUTH_MODE?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    OWNER_EMAIL?: string;
    ASSETS?: Fetcher;
  }
}
