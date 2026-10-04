# Requirements: hanashigemma

- Status: Approved <!-- Draft | In review | Approved -->
- Last updated: 2026-10-04
- Derived from: [product.md](product.md) (G-1 … G-5)

IDs are permanent: never renumber or reuse. Deprecate with ~~strikethrough~~ and a note.
Acceptance criteria use EARS style: `WHEN <trigger> [WHILE <state>] THE SYSTEM SHALL <response>`
(or `IF <unwanted condition> THEN THE SYSTEM SHALL <response>`). Each one must be testable.

Terms (see the product glossary): a **turn** is one learner message plus Gemma's
structured reply; the **backend** is the place Gemma runs (local Ollama or hosted).

Because Gemma's language quality can't be asserted by unit tests, criteria about model
output are tested in two ways: **contract** (the reply has the required shape, checked
automatically with a fake backend and by the schema validator) and **evaluation** (the
scripted runs and hand review defined in the product success metrics).

## Functional requirements

### REQ-001: Choose a roleplay scenario
- Story: As a learner, I want to pick a real-life situation to practise, so that the
  conversation matches what I'll actually face in Japan.
- Priority: Must
- Goals: G-1
- Acceptance criteria:
  - AC-001.1: WHEN the learner opens the app THE SYSTEM SHALL list exactly three
    scenarios — "Buying a train ticket at Shinjuku", "Ordering ramen at an izakaya",
    "Asking for directions in Kyoto" — each with an English title, a one-line goal for the
    learner and Gemma's role.
  - AC-001.2: WHEN the learner selects a scenario THE SYSTEM SHALL start a new
    conversation in which Gemma speaks first, in role, with a structured reply (REQ-003).
  - AC-001.3: IF a request names a scenario that does not exist THEN THE SYSTEM SHALL
    reject it with a client error and not call the model.

### REQ-002: Hold a roleplay conversation
- Story: As a learner, I want to reply to Gemma and have it answer in role, so that I can
  practise a full exchange at my own pace.
- Priority: Must
- Goals: G-1, G-3
- Acceptance criteria:
  - AC-002.1: WHEN the learner sends a message THE SYSTEM SHALL return Gemma's next
    in-role reply, generated with the scenario and all earlier turns of the conversation
    as context.
  - AC-002.2: WHILE a reply is being generated THE SYSTEM SHALL show a waiting indicator
    and disable sending a second message.
  - AC-002.3: IF the learner message is empty or only whitespace THEN THE SYSTEM SHALL not
    send it.
  - AC-002.4: IF the learner message is longer than 200 characters THEN THE SYSTEM SHALL
    reject it with a message stating the limit, without calling the model.
  - AC-002.5: IF the conversation reaches 30 learner messages THEN THE SYSTEM SHALL end
    the scene with a short closing message and offer to restart (REQ-009).
  - AC-002.6: WHEN Gemma replies in role THE SYSTEM SHALL use beginner-level Japanese
    (JLPT N5–N4 vocabulary) in desu/masu form, except fixed service phrases of the role
    (e.g. いらっしゃいませ). *(Evaluation.)*
  - AC-002.7: IF the learner writes off-topic or in English THEN THE SYSTEM SHALL stay in
    role and gently steer back to the scenario in Japanese. *(Evaluation.)*

### REQ-003: Structured, validated replies
- Story: As a learner, I want every Gemma turn to arrive in the same predictable layout,
  so that I always know where to look for help.
- Priority: Must
- Goals: G-2, G-4
- Acceptance criteria:
  - AC-003.1: WHEN Gemma produces a turn THE SYSTEM SHALL validate it against the reply
    schema, which contains: the Japanese reply split into segments with a hiragana
    reading for every segment containing kanji; romaji; English translation; 1–4
    breakdown items; 1–2 suggested replies; and an optional Gentle Fix (REQ-008).
  - AC-003.2: IF the model output is not valid against the schema THEN THE SYSTEM SHALL
    retry the generation once.
  - AC-003.3: IF the retry is also invalid THEN THE SYSTEM SHALL show a friendly error
    ("Gemma got tongue-tied — try again") with a retry button, keep the learner's message
    in the input, and not add a broken turn to the conversation.
  - AC-003.4: WHEN a turn passes validation THE SYSTEM SHALL check that the segments,
    joined, equal the Japanese reply text; IF they don't THEN THE SYSTEM SHALL treat the
    output as invalid (AC-003.2).

### REQ-004: Furigana on the Japanese reply
- Story: As a learner, I want readings above the kanji, so that I can read Gemma's reply
  without looking up every character.
- Priority: Must
- Goals: G-2
- Acceptance criteria:
  - AC-004.1: WHEN a Gemma turn is shown THE SYSTEM SHALL display the Japanese reply with
    the hiragana reading of every kanji segment as ruby text above it.
  - AC-004.2: WHEN the learner switches the furigana toggle off THE SYSTEM SHALL hide all
    ruby readings in the conversation, and show them again when it is switched on.
  - AC-004.3: WHEN the app loads THE SYSTEM SHALL have furigana switched on.

### REQ-005: Romaji and English on demand
- Story: As a learner, I want romaji and the translation hidden until I ask, so that I
  try to read the Japanese first.
- Priority: Must
- Goals: G-2
- Acceptance criteria:
  - AC-005.1: WHEN a Gemma turn is shown THE SYSTEM SHALL hide its romaji and English
    translation.
  - AC-005.2: WHEN the learner activates "Show romaji & English" on a turn THE SYSTEM
    SHALL reveal both for that turn only, and hide them again on a second activation.
  - AC-005.3: WHEN the learner switches on the global "Always show romaji & English"
    toggle THE SYSTEM SHALL reveal them for every turn, including new ones, until it is
    switched off.

### REQ-006: Gemma's Breakdown
- Story: As a learner, I want short explanations of the particles and phrases in Gemma's
  sentence, so that I understand *why* it is said that way.
- Priority: Must
- Goals: G-2
- Acceptance criteria:
  - AC-006.1: WHEN a Gemma turn is shown THE SYSTEM SHALL offer a collapsed "Gemma's
    Breakdown" section listing 1–4 items, each with a phrase and an English explanation.
  - AC-006.2: WHEN a breakdown item is validated THE SYSTEM SHALL require its phrase to
    appear in the Japanese reply; IF it does not THEN THE SYSTEM SHALL drop that item, and
    IF no items remain THEN treat the output as invalid (AC-003.2).
  - AC-006.3: WHEN the reply contains a particle among は, が, を, に, で, へ, と, も THE
    SYSTEM SHALL explain at least one of those particles in the breakdown. *(Evaluation.)*

### REQ-007: Suggested replies
- Story: As a learner, I want one or two natural replies I could say next, so that I
  never freeze on what to answer.
- Priority: Must
- Goals: G-3
- Acceptance criteria:
  - AC-007.1: WHEN a Gemma turn is shown THE SYSTEM SHALL show 1–2 suggested replies in
    Japanese, each with its romaji and English meaning available on demand (same rule as
    REQ-005).
  - AC-007.2: WHEN the learner selects a suggested reply THE SYSTEM SHALL copy its
    Japanese text into the message input without sending it, so the learner can edit it.
  - AC-007.3: WHEN suggested replies are generated THE SYSTEM SHALL keep them valid for the
    scene and in desu/masu form. *(Evaluation.)*

### REQ-008: Gentle Fix
- Story: As a learner, I want my mistakes corrected kindly with a reason, so that I learn
  without feeling rejected.
- Priority: Must
- Goals: G-3
- Acceptance criteria:
  - AC-008.1: WHEN the learner's message contains a mistake or unnatural phrasing THE
    SYSTEM SHALL show, above Gemma's reply, a Gentle Fix with: the learner's original
    sentence, the natural version, the issue type (particle, politeness, vocabulary,
    grammar or other) and a one- or two-sentence English explanation.
  - AC-008.2: WHEN a Gentle Fix is shown THE SYSTEM SHALL still continue the scene in the
    same turn, replying to the learner's intended meaning.
  - AC-008.3: WHEN the learner's message is natural and correct THE SYSTEM SHALL show no
    Gentle Fix.
  - AC-008.4: WHEN a Gentle Fix is shown THE SYSTEM SHALL use encouraging wording and
    never the words "wrong", "incorrect" or "error" in its visible label. *(Contract for
    the label; evaluation for the explanation.)*
  - AC-008.5: WHEN the 10 seeded mistakes of the evaluation set are sent THE SYSTEM SHALL
    produce a fix naming the actual issue for at least 8 of them. *(Evaluation.)*

### REQ-009: Restart or switch scenario
- Story: As a learner, I want to start over or try another scene, so that I can repeat a
  situation until I feel confident.
- Priority: Should
- Goals: G-1
- Acceptance criteria:
  - AC-009.1: WHEN the learner chooses "Restart" THE SYSTEM SHALL clear the conversation
    and start the same scenario again (AC-001.2).
  - AC-009.2: WHEN the learner chooses "Change scenario" THE SYSTEM SHALL clear the
    conversation and return to the scenario list.

### REQ-010: Choose where Gemma runs
- Story: As the builder, I want the same app to run with local Ollama or with a hosted
  Gemma endpoint, so that my friend can practise offline for free and judges can use a
  public link.
- Priority: Must
- Goals: G-4
- Acceptance criteria:
  - AC-010.1: WHEN the server starts THE SYSTEM SHALL read the backend (local or hosted)
    and the Gemma model name from configuration, with local Ollama as the default.
  - AC-010.2: IF the configuration is invalid (unknown backend, missing model name, or
    hosted backend without a credential) THEN THE SYSTEM SHALL refuse to start and print
    which setting is wrong, without printing secret values.
  - AC-010.3: IF the backend can't be reached or times out during a turn THEN THE SYSTEM
    SHALL show a message saying Gemma is unavailable (and, for the local backend, a hint
    to start Ollama), and keep the learner's message in the input.
  - AC-010.4: WHEN either backend is used THE SYSTEM SHALL produce the same reply schema
    and UI behaviour (REQ-003 … REQ-008).
  - AC-010.5: WHEN the app is running THE SYSTEM SHALL show which backend and model name
    are in use (e.g. "Gemma · local (Ollama)").

### REQ-011: Protect the public demo
- Story: As the builder, I want the hosted demo to limit usage, so that strangers can't
  run up costs or exhaust the hosted quota.
- Priority: Must
- Goals: G-4, G-5
- Acceptance criteria:
  - AC-011.1: IF a single client sends more than 10 turns per minute THEN THE SYSTEM
    SHALL refuse further turns for the rest of that minute with a "slow down" message.
  - AC-011.2: IF the demo has served 500 turns in the current UTC day THEN THE SYSTEM
    SHALL refuse new turns until the next UTC day with a message pointing to the offline
    setup in the README.
  - AC-011.3: WHEN the hosted model returns a quota or rate-limit error THE SYSTEM SHALL
    show the same "demo is busy" message as AC-011.2 instead of a generic error.
  - AC-011.4: WHILE running with the local backend THE SYSTEM SHALL not apply the daily
    cap (AC-011.2).

### REQ-012: About this app
- Story: As a judge, I want a short explanation of how Gemma is used, so that I can
  assess the project quickly.
- Priority: Could
- Goals: G-4, G-5
- Acceptance criteria:
  - AC-012.1: WHEN the visitor opens "About" THE SYSTEM SHALL show which Gemma model runs
    the app, the two ways to run it, that conversations are not stored, and a link to the
    repository.

## Non-functional requirements
| ID | Category | Requirement (measurable) | Verification |
|---|---|---|---|
| NFR-001 | Security | 0 secrets in the repository; the hosted model credential lives only in Secret Manager and reaches the service as an environment variable; all model and learner text is rendered as text, never as HTML; responses carry a Content-Security-Policy that forbids inline scripts and third-party script origins; 0 high/critical findings from `npm audit --audit-level=high` | gitleaks in pre-commit and CI; unit test that markup in model output is shown literally; header check test; CI audit step |
| NFR-002 | Privacy / data classification | Learner messages and model replies are **not stored** server-side and **never written to logs**; no cookies, analytics or third-party trackers; the only data kept is in the browser tab (A-1). Data classification: learner messages are *personal / confidential*, treated as transient | Test that log records contain none of the message text; review of response headers (no Set-Cookie) |
| NFR-003 | Availability | No SLO for v1. The demo is best-effort, scale-to-zero, and may be throttled by REQ-011. A health endpoint reports whether the server is up | Health endpoint test |
| NFR-004 | Performance | Waiting indicator appears ≤ 200 ms after send. Hosted backend: p95 turn latency ≤ 10 s (including one retry). Local backend: p95 ≤ 30 s on the builder's laptop with the chosen model. Server-side model timeout: 45 s per attempt | Evaluation run records per-turn latency; timeout unit test with a fake backend |
| NFR-005 | Scalability | Demo handles ≥ 5 concurrent conversations; at most 2 server instances | Manual load check with 5 parallel scripted conversations |
| NFR-006 | Cost | Total GCP spend ≤ 5 USD/month; hosted model used within its free tier [ASSUMPTION A-5]; budget alert at 50%, 90% and 100% of 5 USD; scale to zero when idle | Billing budget with alerts (set up per `docs/deploy.md`, ADR-0005); billing report after the challenge |
| NFR-007 | Observability | One structured (JSON) log record per turn with: request id, scenario id, backend, model name, latency ms, attempt count, validation result, error type — and no message content (NFR-002) | Unit test on the log record shape |
| NFR-008 | Compliance / licensing | Repository has an OSI-approved open-source license (Q-4); README states the Gemma Terms of Use apply to the model and links them; the hosted endpoint's terms allow a public demo (Q-3) | README review; license file present |
| NFR-009 | Accessibility | All controls usable by keyboard only; Japanese text marked `lang="ja"`; text contrast meets WCAG 2.2 AA (4.5:1); toggles expose their on/off state to screen readers | Automated accessibility check (axe) on the main screen with 0 serious/critical issues; keyboard walkthrough |
| NFR-010 | Compatibility | Works in the latest stable Chrome, Firefox and Safari on desktop, at widths ≥ 360 px | Manual check in the three browsers |
| NFR-011 | Maintainability | TypeScript strict; ≥ 80% line coverage on non-UI server and validation code; CI (lint, typecheck, test, audit) green on every merge | CI |

## Out of scope
Considered and rejected for v1 (see product non-goals):
- Speech input/output — adds browser API and model complexity beyond a weekend.
- Accounts, saved history, progress tracking — needs storage and auth; conflicts with
  NFR-002 simplicity.
- Selectable level or politeness, custom scenarios — multiplies prompt tuning and testing.
- Streaming token-by-token output — structured JSON must be complete before validation;
  the waiting indicator (AC-002.2) covers the wait.
- Separate content moderation service — relies on Gemma's built-in behaviour and a
  scenario-bound prompt (A-4).

## Open questions
- [ ] Q-1 … Q-3: see [product.md](product.md).
- [x] Q-4: Which open-source license for the repository? **Resolved 2026-10-04: MIT**
  (`LICENSE`), the simplest permissive license and common for challenge entries.

## Assumptions
- A-5: The hosted Gemma endpoint has a free tier large enough for 500 turns/day (to be
  verified with Q-3; if not, the daily cap in AC-011.2 is lowered).
