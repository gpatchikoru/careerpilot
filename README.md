# CareerPilot

A private career workspace for the owner's personal job search: discovering opportunities, maintaining a profile, preparing tailored resumes and cover letters, and tracking applications. Built as an original application inspired by the publicly advertised workflows of ApplyRyt, NextGenApply, and Hustle Hive.

## Working features

- Private saved workspace with owner-only authentication: Cloudflare Access for the custom-domain target, or ChatGPT sign-in for the retained Sites target.
- Profile and job preferences; configurable application goals.
- Live public Greenhouse job import from supported company boards, manual opportunity entry, search, location filters, bookmarks, and skills overlap.
- Application pipeline, status history, notes, next steps, board/list views, CSV export, and weekly activity reports.
- Editable master resume, private PDF uploads, TXT import, AI PDF text extraction, per-job resume tailoring, cover letters, keyword/ATS feedback, outreach drafts, and profile reviews.
- Saved document library with text downloads and browser Print / PDF.
- Personal help covering job discovery, profile editing, resume and cover-letter preparation, and application tracking.
- Durable D1 records, R2 files, server-only AI calls, bounded input validation, request quotas, cross-origin mutation checks, and optimistic save conflicts.

## Product boundaries

CareerPilot is intended solely for the owner's personal use. Customer subscriptions, payment processing, recruiter services, and an operator interface are outside its scope. No payment service or customer billing setup is required. Interview preparation, scheduling, practice, and calendar exports are also outside the current scope.

Employer links open the original career site. The owner submits applications there and records the actual submissions in CareerPilot. The app does not submit applications or send outreach emails automatically. AI reviews are model-generated guidance, not a verified ATS score or human evaluation. Anonymous local preview shows clearly labeled fictional sample data; a new signed-in workspace starts empty.

AI features use the OpenAI API and require available API credit. These provider usage costs are separate from payment processing in CareerPilot and from a ChatGPT subscription. The last live API check returned an exhausted-credit error, so generated AI output remains unverified until the API project has credit. Manual job tracking, profile editing, and document editing do not require AI calls.

## Stack and hosting

React 19, TypeScript, Vinext/Vite, Cloudflare Workers, D1, R2, and the OpenAI Responses API (`gpt-5.4-mini`). GitHub stores source and runs CI. GitHub Pages continues to serve the portfolio; a Worker is required for this app's server routes, private storage, and AI calls.

The deployment target is [patchikoru.com/careercopilot](https://patchikoru.com/careercopilot), using the owner's Cloudflare account and Cloudflare Access. The standalone adapter is configured in `wrangler.careerpilot.jsonc`. Complete the real resource bindings and owner-only Access setup in [the Cloudflare guide](docs/CLOUDFLARE.md) before deployment. This documentation does not claim the target is live.

The Worker route is `patchikoru.com/careercopilot*`. Its path guard serves only `/careercopilot` and its descendants, forwarding other matches to the existing GitHub Pages origin. The portfolio remains at `patchikoru.com`; no new subdomain is required. Cloudflare is the domain's verified DNS provider and registrar.

The existing private Sites project is retained under `.openai/hosting.json` and remains unpublished. The default `npm run build` and `npm run dev` use that integration. A GitHub push alone does not publish a Sites version. Sites identity headers are trusted only in the Sites adapter; the standalone adapter validates Cloudflare Access JWTs and the owner's email. Neither target automatically migrates saved user data to the other.

## Local development

Requires Node 22.13+ (Node 24 recommended).

```sh
npm ci
npm run db:generate  # only after changing the schema
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sleepy_red_wolf.sql
npm run dev
```

Use the printed loopback URL. The Sites starter provides a local-only sign-in simulation at `/signin-with-chatgpt?return_to=/`. It is not included in production. `npm run dev:cloudflare` and `npm run build:cloudflare` select the separate custom-domain adapter at `/careercopilot`; that adapter retains its Access authentication checks. See [Cloudflare setup](docs/CLOUDFLARE.md) for its runtime settings.

Optional runtime variable: `OPENAI_API_KEY` enables AI when the API project has available credit. The backend retains legacy administrative routes gated by the `ADMIN_EMAILS` exact-email allowlist; they are not needed for personal use and have no visible operator workspace. Keep all secret env files untracked. For this workspace, the approved key file lives two directories above the app; start local development with `node --env-file=../../.env.local scripts/run-framework.mjs dev`. Vite passes those values only to the development Worker. Configure production secrets in the selected hosting target's secret store; existing Sites secrets do not transfer to the standalone Worker. Never use `VITE_` or `NEXT_PUBLIC_` for secrets.

The securely provisioned key expires after 30 days. Rotate the hosted secret before expiration. Never use the key pasted into the chat; it should be revoked.

## Validation

```sh
npx tsc --noEmit
npm test
npm run build
npm run build:cloudflare
```

Tests cover real SQLite compare-and-swap and atomic quota semantics, user isolation, legacy admin allowlists, origin checks, bounded streamed inputs, upload validation, job sanitization, AI response extraction, and Cloudflare Access authentication. Build each target separately: both commands write to `dist/`, so deploy only the output from the intended target's latest build. GitHub validation is separate from hosted publication.

## Limits and maintenance

Per account: 250 stored jobs, 300 applications, 100 documents, and 1.5 MB serialized workspace. Job imports preserve existing records, import up to 50 openings at a time, and stop before workspace size limits. Files are PDF/TXT, 5 MB each, 100 stored files per account. AI calls are limited to 5/minute and 30/day. AI provider usage charges and provider quotas apply.

Deleting a document removes its library record; its original uploaded file remains in private storage. Stored files are accessible only to their owning signed-in user. Legacy administrative routes can access profile/resume text and conversations only when the signed-in email is explicitly allowlisted; leave `ADMIN_EMAILS` unset unless those internal routes are needed.

Legacy saved interview records are preserved for compatibility, but the app has no interview interface. This scope reduction does not change the database schema or require a migration.

Database migrations are schema-only. Do not replay an already applied migration or rewrite migration history. Use new migrations for schema changes.

## References reviewed

- https://applyryt.com/
- https://nextgenapply.ai/products
- https://hustlehive.ai/profile-evaluation

No private competitor dashboards, proprietary source, logos, testimonials, or success statistics were copied.
