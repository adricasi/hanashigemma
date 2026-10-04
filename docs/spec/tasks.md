# Tasks: hanashigemma

- Status: Approved <!-- Draft | In review | Approved -->
- Last updated: 2026-10-04
- Implements: [design.md](design.md) · [requirements.md](requirements.md)

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.
Order = implementation order. Each task is a small vertical slice, references the
requirements it serves, and has an objective "Done when".

**Time box.** Deadline 2026-10-05 06:59 UTC (08:59 CEST). Estimates are build hours.
Milestones 1–3 (~10 h) give a deployable app with all Must requirements. If time runs
short, cut from the bottom of Milestone 3 first; the submission only needs a video **or**
a deployed link, and Milestone 1 already produces a public URL.

## Milestone 0: Prerequisites (human, ~30 min, before T-001)
- [x] T-000: Prepare the machine and accounts
  - Requirements: — (enables everything)
  - Scope: install Node.js LTS inside WSL (`nvm install --lts`), `rm -rf node_modules &&
    npm ci`; install Ollama and `ollama pull gemma4:e4b` (or `gemma4:e2b`); create or pick
    a GCP project with billing; create a Gemini API key in AI Studio and note the Gemma 4
    rate limits (closes Q-3); choose the license (Q-4, default MIT).
  - Done when: `which npm` is not under `/mnt/c`; `npm test` passes; `ollama run
    gemma4:e4b "こんにちは"` answers; the key and project id are ready (not in the repo).

## Milestone 1: Walking skeleton — local and public (~4 h)
- [x] T-001: Server skeleton with config, health and scenario list (~1 h)
  - Requirements: REQ-001 (AC-001.1), REQ-010 (AC-010.1, AC-010.2, AC-010.5), NFR-001
    (headers), NFR-003, NFR-007
  - Depends on: T-000
  - Scope: add `hono`, `@hono/node-server`, `zod`; `src/server/` (app, config loader,
    logger, security headers, `/healthz`, `/api/config`), `src/scenarios.ts`;
    `public/` UI shell listing the 3 scenarios and the backend badge; `npm start`;
    remove the `greet` example.
  - Done when: tests for AC-001.1, AC-010.1, AC-010.2, AC-010.5, the CSP header and the
    log record shape pass; `npm run lint && npm run typecheck && npm test` green;
    `npm start` shows the scenario list at `http://localhost:8080`.

- [x] T-002: First Gemma turn end to end with Ollama (~2 h) — **riskiest: JSON reliability**
  - Requirements: REQ-001 (AC-001.2, AC-001.3), REQ-002 (AC-002.1–AC-002.4), REQ-003,
    REQ-010 (AC-010.3, AC-010.4), NFR-004 (timeout)
  - Depends on: T-001
  - Scope: reply schema + validator (all cross-checks), prompt builder, model adapter
    interface + Ollama adapter (JSON schema in `format`, 45 s timeout), turn handler with
    one retry, `POST /api/turn` with request limits and error codes; UI shows Gemma's
    opening line and replies as plain Japanese text, waiting indicator, error messages
    that keep the input.
  - Done when: tests for AC-001.2, AC-001.3, AC-002.1–AC-002.4, AC-003.1–AC-003.4,
    AC-010.3 and the timeout pass (fake adapter + stub HTTP server); a manual session
    with real `gemma4:e4b` completes 5 turns in one scenario; checks green.

- [x] T-003: Hosted Gemma adapter, demo limits and container (~1 h)
  - Requirements: REQ-010 (AC-010.4), REQ-011, NFR-001, NFR-005
  - Depends on: T-002
  - Scope: Gemini API adapter (`generateContent` via `fetch`, code-fence stripping, 429 →
    `demo_busy`), in-memory rate limiter (per client per minute, per UTC day, hosted
    only), hosted-mode privacy notice in the UI; multi-stage `Dockerfile` +
    `.dockerignore`; `docs/deploy.md` with the gcloud commands of design.md.
  - Done when: tests for AC-010.4 (both adapters produce the same reply type),
    AC-011.1–AC-011.4 pass; `docker build .` succeeds and the container answers
    `/healthz` locally; checks green.

- [ ] T-004: First public deploy on Cloud Run (human, ~30 min)
  - Requirements: G-4 (demo reach), NFR-006
  - Depends on: T-003
  - Scope: the human runs the one-time setup and `gcloud run deploy` from
    `docs/deploy.md`; billing budget created.
  - Done when: the Cloud Run URL opens in a fresh browser, a scenario starts and one turn
    succeeds with hosted Gemma; the budget exists; the URL is noted in
    `docs/spec/progress.md`.

## Milestone 2: The learning experience (~4 h)
- [ ] T-005: Furigana and romaji/English toggles (~1 h)
  - Requirements: REQ-004, REQ-005, NFR-009 (toggle state, `lang="ja"`)
  - Depends on: T-002
  - Scope: ruby rendering from segments, global furigana toggle (on by default), per-turn
    "Show romaji & English" and global "Always show" (on by default on the hosted backend,
    AC-005.5); text-only rendering helpers.
  - Done when: tests for AC-004.1–AC-004.3, AC-005.2–AC-005.5 and "markup in model output
    is shown literally" (NFR-001) pass with happy-dom; checks green.

- [ ] T-006: Gemma's Breakdown and suggested replies (~1 h)
  - Requirements: REQ-006, REQ-007
  - Depends on: T-005
  - Scope: collapsed Breakdown section; suggestion chips that fill the input without
    sending; prompt tuning so a particle is explained when present.
  - Done when: tests for AC-006.1, AC-006.2, AC-007.1, AC-007.2 pass; manual check of
    AC-006.3 and AC-007.3 on 5 turns; checks green.

- [ ] T-007: Gentle Fix (~1.5 h)
  - Requirements: REQ-008 (incl. AC-008.6), REQ-002 (AC-002.8)
  - Depends on: T-006
  - Scope: prompt rules for detecting mistakes and continuing the scene; Gentle Fix card
    (original, natural version, issue type, explanation) above the reply with an
    encouraging fixed label; English or romaji input gets a fix with the Japanese version
    (AC-008.6); seed file with the 10 mistaken sentences.
  - Done when: tests for AC-008.1–AC-008.4 and AC-008.6 (contract) pass; manual run of the 10 seeded
    mistakes gives ≥ 8 correct fixes (AC-008.5), recorded in `progress.md`; checks green.

- [ ] T-008: Scene flow and About panel (~0.5 h)
  - Requirements: REQ-009, REQ-002 (AC-002.5), REQ-012
  - Depends on: T-005
  - Scope: Restart / Change scenario; closing message at the 30th learner message;
    About panel (model, two run modes, no storage, hosted-mode caveat, repo link).
  - Done when: tests for AC-009.1, AC-009.2, AC-002.5, AC-012.1 pass; checks green.

## Milestone 3: Ship (~2 h, human-heavy)
- [ ] T-009: Accessibility pass, README and release (~1 h)
  - Requirements: NFR-008, NFR-009, NFR-010, G-5
  - Depends on: T-004, T-007, T-008
  - Scope: keyboard walkthrough and axe check (fix serious/critical issues); README
    (what it is, local setup with Ollama, demo link, privacy note, Gemma Terms of Use
    link, license); `LICENSE` file; redeploy (human).
  - Done when: axe reports 0 serious/critical issues; keyboard-only walkthrough of one
    scenario works; app checked in Chrome, Firefox and Safari (or the browsers available,
    noted); deployed URL serves the final version.

- [ ] T-010: Evaluation run, demo video and DEV post (human-led, ~1 h)
  - Requirements: success metrics in product.md; ACs marked *Evaluation*; G-5
  - Depends on: T-009
  - Scope: optional `npm run eval` script (≥ 20 turns per scenario: schema pass rate,
    retries, p95 latency) — **first thing to cut** if short of time, replaced by a manual
    10-turn check; record a 1–2 min video (one scenario with a Gentle Fix); write the DEV
    post from the challenge template with tags `devchallenge`, `weekendchallenge`,
    `hf26challenge`.
  - Done when: the DEV post is published before 2026-10-05 06:59 UTC with repo link, demo
    URL and video.

## Later (after the deadline, not required for submission)
- [ ] T-011: Port the demo infrastructure to Terraform (`infra/`): APIs, secret
  container, service account + IAM, Cloud Run service, billing budget; plan → review →
  human apply (ADR-0005).
- [ ] T-012: Stretch — self-host Gemma with Ollama on Cloud Run GPU and point the app at it
  (design.md, Stretch).
- [ ] T-013: Deploy from CI with Workload Identity Federation.
- [ ] T-014: Remove or make the demo private after judging (ADR-0004).
