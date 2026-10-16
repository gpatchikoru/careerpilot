# Cloudflare deployment

Target: [https://patchikoru.com/careercopilot](https://patchikoru.com/careercopilot). This guide describes the standalone Worker setup; it does not assert a completed deployment. The app is for the owner's job search, profile, resumes, cover letters, and application tracking. It has no customer payment or interview interface.

Use Cloudflare account `6c5f5b21b975712bc87d33d76e1efbee`. Cloudflare DNS and registrar ownership have been verified. The existing portfolio remains hosted by `gpatchikoru/gpatchikoru.github.io` at the domain root.

## Provisioned resources (2026-10-16)

- Access application `CareerPilot Personal` protects `patchikoru.com/careercopilot` with inherited protection for child paths. Its only Allow policy matches `girish5f9@gmail.com`. HTTP-only and path-scoped cookies are enabled.
- Team domain: `yellow-salad-1b22.cloudflareaccess.com`; the application AUD is recorded in the Worker configuration.
- D1 database `careerpilot-personal`: `38686ea6-8d97-4c91-9cdb-7cac60e2ae11`. The initial SQL migration was applied through the D1 console to the empty database and recorded in `d1_migrations`; all three application tables and the migration entry were verified. Do not replay that migration.
- R2 bucket `careerpilot-private-resumes` exists with public access disabled.
- Worker publication, DNS proxy routing, and runtime AI secret setup still need completion.

## Configure before deployment

1. In that account, create or select a D1 database and a private R2 bucket. In `wrangler.careerpilot.jsonc`, bind the actual database as `DB` and the bucket as `BUCKET`. Replace the placeholder database UUID with the returned ID and confirm both resource names. Keep R2 public access disabled. Resource creation and final IDs are not implied by the example configuration.
2. Create a self-hosted Cloudflare Access application covering **both** `patchikoru.com/careercopilot` and every path beneath it, including API and asset paths. Add an Allow policy for the exact email `girish5f9@gmail.com`. Use no public or bypass policy for this app. Confirm the root path and descendants are covered by the same application/AUD; a wildcard-only path must not leave the root open. See [Cloudflare application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/).
3. Copy the actual team domain and application AUD into the runtime variables below. The team domain is the bare hostname, without `https://` or a trailing slash. Keep these nonsecret values in the source configuration so a later deployment does not replace dashboard values with blanks.
4. Confirm the existing portfolio DNS record is proxied through Cloudflare without changing its GitHub Pages origin. Keep the Worker route `patchikoru.com/careercopilot*`, `workers_dev: false`, and `preview_urls: false`. The adapter accepts only the exact app path or descendants; a match such as `/careercopilot-blog` is forwarded to the existing origin.

| Runtime setting | Value |
| --- | --- |
| `CAREERPILOT_AUTH_MODE` | `cloudflare` |
| `CF_ACCESS_TEAM_DOMAIN` | Actual bare team hostname, in the form `team.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Actual AUD from this Access application's settings |
| `OWNER_EMAIL` | `girish5f9@gmail.com` |
| `OPENAI_API_KEY` | Optional Worker secret for AI features; never a public build variable |

The adapter validates the Access token's signature, issuer, audience, validity times, application type, and owner email. Missing authentication configuration returns 503; a missing or invalid token returns 401. It does not trust identity-only headers or fall back to Sites authentication. Cloudflare describes origin-side token verification in [Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

Store `OPENAI_API_KEY` in the Worker's runtime secrets. Existing Sites secrets do not transfer automatically. Do not commit the key or put it in a `NEXT_PUBLIC_`/`VITE_` variable. API credit is required for AI output; customer payment processing is not required. Leave the legacy `ADMIN_EMAILS` allowlist unset for ordinary personal use.

## Build, initialize schema, deploy

Run commands from the repository directory containing `package.json`. Do not deploy while resource IDs or Access settings are placeholders. Finish the Access policy before connecting an automatic production deployment.

```sh
npm ci
npm run typecheck
npm test
npm run build:cloudflare
npm run test:cloudflare
```

The build script selects the standalone adapter and sets `NEXT_PUBLIC_CAREERPILOT_BASE_PATH=/careercopilot` and `NEXT_PUBLIC_CAREERPILOT_AUTH_MODE=cloudflare`. These are public routing/authentication-mode settings, not credentials. It writes deployable output and the generated configuration to `dist/server/wrangler.json`. The default Sites build also writes to `dist/`, so rebuild the Cloudflare target immediately before deploying if another build ran afterward.

For a newly provisioned database, apply the repository's schema migrations before the first deployment:

```sh
npx wrangler d1 migrations apply DB --remote --config wrangler.careerpilot.jsonc
```

This creates the schema without importing any Sites user data. Do not replay SQL manually against an existing initialized database; inspect its migration history and apply only pending migrations. See [D1 migration commands](https://developers.cloudflare.com/workers/wrangler/commands/d1/).

After the actual bindings, owner-only Access policy, runtime settings, and schema are ready, publish the freshly built standalone output:

```sh
npx wrangler deploy --config dist/server/wrangler.json
```

For GitHub-connected Workers Builds, use these settings after setup is complete:

| Setting | Value |
| --- | --- |
| Repository | `gpatchikoru/careerpilot` |
| Root directory | Repository root, containing `package.json` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npx wrangler deploy --config dist/server/wrangler.json` |
| Preview builds | Disabled |

Apply pending database migrations before deploying code that needs them. Build variables do not become runtime variables; configure runtime secrets separately. See [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Verify the hosted result

- Signed out, the app root, an app API URL, and an app asset URL all require Access sign-in.
- The owner's allowed email opens the workspace; another identity is denied. The Worker rejects requests with missing, expired, or invalid Access tokens.
- The portfolio at `/` still loads. `/careercopilot-blog` reaches the existing origin rather than this app.
- Save and reload a profile and application, then upload and download a private resume. Verify AI generation only after API credit is available.
- Confirm `workers.dev`, preview URLs, and R2 public access remain disabled.

`npm run dev:cloudflare` runs the local standalone adapter at `/careercopilot` with authentication checks intact; it has no local Access bypass. Use the default Sites development command for the existing local sign-in simulation.

The original owner-only Sites project is retained and unpublished. Its default build and identity integration remain available. Standalone Cloudflare identities and storage are separate; switching targets does not migrate saved data. Existing legacy interview records are preserved in the schema, without a visible interview interface.
