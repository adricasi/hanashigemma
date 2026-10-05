# Project index

Where to find each part of HanashiGemma. For what the app does and how to run it, see the
[README](README.md).

## How a turn flows

```
public/index.html ─ src/client/main.ts ─ conversation.ts ─ turn-api.ts ──POST /api/turn──┐
                                                                                          │
src/server/app.ts ─ turn-request.ts (validate) ─ rate-limit.ts ─ server/turn.ts ◄─────────┘
                                                                     │
                                         prompt.ts + scenarios.ts ───┤ build messages
                                         model/factory.ts ───────────┤ Ollama or Gemini API
                                         reply.ts ───────────────────┘ validate, retry once
```

The browser keeps the conversation and sends it with every message; the server is stateless
(ADR-0002). Gemma is not fine-tuned: its behaviour comes from the prompt plus validation.

## Server — `src/`

| File | What it does |
|---|---|
| `main.ts` | Entry point: loads config, creates the model adapter and the app, starts the server. |
| `config.ts` | Reads and validates environment variables (`GEMMA_BACKEND`, model, limits). See `.env.example`. |
| `scenarios.ts` | The 3 fixed roleplay scenarios and the part of them the browser may see. |
| `prompt.ts` | **Gemma's instructions**: system prompt, conversation history and the retry prompt. Change Gemma's behaviour here. |
| `reply.ts` | zod schema for a Gemma turn (furigana segments, breakdown, suggestions, Gentle Fix) and the cross-checks (REQ-003). |
| `turn-request.ts` | Validates the `POST /api/turn` body: message ≤ 200 chars, ≤ 30 learner messages. |
| `server/app.ts` | Hono app: routes (`/healthz`, `/api/config`, `/api/turn`, static files), body size limit, security headers. |
| `server/turn.ts` | One turn: call the model, validate, retry once, return a friendly error otherwise. |
| `server/rate-limit.ts` | In-memory limits: 10 turns/min per client, daily cap on the hosted backend (REQ-011). |
| `server/client-key.ts` | Works out which client a request comes from, for the rate limit (never logged). |
| `server/logger.ts` | Turn logs with metadata only, never message content (NFR-007). |

### Model adapters — `src/model/`

| File | What it does |
|---|---|
| `adapter.ts` | The `ModelAdapter` interface and `ModelUnavailableError`. |
| `factory.ts` | Picks the adapter from `GEMMA_BACKEND`. |
| `ollama.ts` | Local Gemma (`gemma4:e4b`) through Ollama `/api/chat`, with the reply schema as `format`. |
| `gemini.ts` | Hosted Gemma (`gemma-4-26b-a4b-it`) through the Gemini API, used by the public demo. |
| `http.ts` | Shared JSON POST with timeout (45 s) and output-token cap. |

## Browser UI — `public/` and `src/client/`

| File | What it does |
|---|---|
| `public/index.html`, `public/styles.css` | The page and its styles (no framework). |
| `src/client/main.ts` | Browser entry point: loads `/api/config`, shows the scenario picker, starts a scene. |
| `src/client/config.ts` | Parses the server config; backend badge text and translation defaults. |
| `src/client/header.ts` | Backend badge and the hosted-demo privacy notice. |
| `src/client/conversation.ts` | One scene: message input, conversation history, limits, sending turns. |
| `src/client/turn-api.ts` | Calls `POST /api/turn`; types of the reply the UI renders. |
| `src/client/render-turn.ts` | Renders a Gemma turn: furigana (`<ruby>`), romaji/English, Breakdown, suggestions, Gentle Fix. Text only, never `innerHTML` (NFR-001). |

The client is compiled separately with `src/client/tsconfig.json`.

## Tests — `test/`

Vitest, mostly one file per module (`server.test.ts` covers `server/app.ts`; most UI tests
are in `test/client/` with happy-dom, and `limits.test.ts` checks client and server limits
agree). `fixtures.ts` holds a valid sample reply and a fake model adapter;
`adapter-parity.test.ts` checks both backends behave the same. No real model or network
calls.

## Documentation — `docs/`

| Path | What it holds |
|---|---|
| `spec/product.md` | Why: the friend, goals, non-goals, constraints. |
| `spec/requirements.md` | What: requirements and acceptance criteria (REQ-nnn, AC-nnn.n, NFR-nnn). |
| `spec/design.md` | How: architecture, data model, model call contract, security design. |
| `spec/tasks.md` | The plan: tasks T-nnn and their status. |
| `adr/` | Architecture decisions: stateless server and adapter (0002), Gemma 4 models and structured output (0003), public demo on Cloud Run (0004), gcloud deploy with Terraform deferred (0005). |
| `deploy.md` | How a human deploys the demo to Cloud Run. |

## Deployment and infrastructure

| Path | What it holds |
|---|---|
| `Dockerfile`, `.dockerignore`, `.gcloudignore` | The container used locally and on Cloud Run. |
| `infra/` | Terraform skeleton (providers, variables, labels). No resources yet; porting the demo is task T-011. |

## Tooling and CI

| Path | What it holds |
|---|---|
| `package.json` | Scripts: `test`, `lint`, `typecheck`, `build`, `start`, `format`. |
| `tsconfig*.json` | Compiler settings (`tsconfig.build.json` for `dist/`). |
| `eslint.config.js`, `.prettierrc.json`, `.editorconfig` | Lint and formatting. |
| `vitest.config.ts` | Test runner and coverage. |
| `.pre-commit-config.yaml` | Pre-commit hooks, including the gitleaks secret scan. |
| `.github/workflows/` | CI: Node checks, Terraform checks, security scans. |
| `.github/dependabot.yml` | Dependency updates. |
