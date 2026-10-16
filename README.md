# CareerPilot

A full-stack career workspace for discovering opportunities, preparing tailored documents, tracking applications, and practicing interviews. Built as an original application inspired by the publicly advertised workflows of ApplyRyt, NextGenApply, and Hustle Hive.

## Working features

- Sign in with ChatGPT and per-user cloud workspaces.
- Profile and job preferences; configurable application goals.
- Live public Greenhouse job import from supported company boards, manual opportunity entry, search, location filters, bookmarks, and skills overlap.
- Application pipeline, status history, notes, next steps, board/list views, CSV export, and weekly activity reports.
- Editable master resume, private PDF uploads, TXT import, AI PDF text extraction, per-job resume tailoring, cover letters, keyword/ATS feedback, outreach drafts, and profile reviews.
- Saved document library with text downloads and browser Print / PDF.
- Interview calendar, calendar-file export, generated practice questions, and answer feedback.
- Support requests, service-interest records, and an allowlisted specialist workspace for replies and application review.
- Durable D1 records, R2 files, server-only AI calls, bounded input validation, request quotas, cross-origin mutation checks, and optimistic save conflicts.

## Product boundaries

This is a working first version, not a complete recreation of the three services' private systems. Those services use human recruiters and application specialists. CareerPilot does not employ recruiters, submit applications to employers, send emails, charge subscriptions, or promise job outcomes. Employer links open the original career site. Users or authorized operators record actual submissions afterward.

Payment processing, staffed services, email/SMS delivery, scheduled external job feeds, and employer-specific automated submission connectors are not connected. AI reviews are model-generated guidance, not a verified ATS score or human evaluation. Anonymous local preview shows clearly labeled fictional sample data; signed-in users start with empty private workspaces.

## Stack and hosting

React 19, TypeScript, Vinext/Vite, Cloudflare Workers, D1, R2, and the OpenAI Responses API (`gpt-5.4-mini`). The supplied Sites build integration owns hosted identity and resource provisioning. GitHub stores source and runs CI. GitHub Pages cannot run this application's server routes, private storage, or AI calls.

The private deployment is managed by Sites via `.openai/hosting.json`. The source hosting repository and the GitHub mirror are separate. A GitHub push runs validation and produces a build artifact; it does not automatically publish a new Sites version. Publish through the Sites workflow after source changes. Do not deploy the Worker on an arbitrary public host while trusting client-supplied `oai-authenticated-*` headers: Sites dispatch supplies and validates those identity headers.

## Local development

Requires Node 22.13+ (Node 24 recommended).

```sh
npm ci
npm run db:generate  # only after changing the schema
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_sleepy_red_wolf.sql
npm run dev
```

Use the printed loopback URL. The starter provides a local-only sign-in simulation at `/signin-with-chatgpt?return_to=/`. It is not included in production.

Optional runtime variables: `OPENAI_API_KEY` enables AI; `ADMIN_EMAILS` is a comma-separated, exact-email allowlist for operators. Keep all secret env files untracked. For this workspace, the approved key file lives two directories above the app; start local development with `node --env-file=../../.env.local scripts/run-framework.mjs dev`. Vite passes those values only to the development Worker; production secrets are configured in Sites. Never use `VITE_` or `NEXT_PUBLIC_` for secrets.

The securely provisioned key expires after 30 days. Rotate the hosted secret before expiration. Never use the key pasted into the chat; it should be revoked.

## Validation

```sh
npx tsc --noEmit
node --experimental-strip-types --test tests/backend.test.mjs
npm run build
```

Tests cover real SQLite compare-and-swap and atomic quota semantics, user isolation, operator-message integrity, admin allowlists, origin checks, bounded streamed inputs, upload validation, job sanitization, and AI response extraction. GitHub Actions runs these checks and uploads the built Worker artifact.

## Limits and maintenance

Per account: 250 stored jobs, 300 applications, 100 documents, 150 interviews, 500 support messages, and 1.5 MB serialized workspace. Job imports preserve existing records, import up to 50 openings at a time, and stop before workspace size limits. Files are PDF/TXT, 5 MB each, 100 stored files per account. AI calls are limited to 5/minute and 30/day. AI provider usage charges and provider quotas apply.

Deleting a document removes its library record; its original uploaded file remains in private storage. A file/account retention-and-deletion policy and administrative removal workflow are required before wider commercial rollout. Stored files are accessible only to their owning signed-in user. Operators can access candidate profile/resume text and conversations only when their sign-in email is allowlisted.

Database migrations are schema-only. Do not replay an already applied migration or rewrite migration history. Use new migrations for schema changes.

## References reviewed

- https://applyryt.com/
- https://nextgenapply.ai/products
- https://hustlehive.ai/profile-evaluation

No private competitor dashboards, proprietary source, logos, testimonials, or success statistics were copied.
