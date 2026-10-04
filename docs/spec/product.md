# Product: hanashigemma

- Status: Approved <!-- Draft | In review | Approved -->
- Last updated: 2026-10-04

HanashiGemma (話Gemma) is a low-anxiety Japanese conversation and immersion coach powered
by Gemma, Google's open-weight model. It is a submission to the Hacktoberfest Weekend
Challenge "Build for a Friend" (category: Best Use of Gemma), built for one friend who has
just started learning Japanese.

## Problem
Beginner Japanese learners hit two hurdles:

1. **Wall of text and nuance.** Kanji and particles (は vs が, に vs で) are overwhelming
   without a breakdown in context. Textbooks rarely explain *why* a particle or politeness
   level was chosen in a real sentence.
2. **Conversation anxiety.** Beginners freeze when they have to compose a sentence,
   because textbook phrases don't match real situations and they fear making mistakes in
   front of native speakers.

Existing apps either drill multiple-choice exercises or drop learners into native text
without explanation. What's missing is a patient practice partner: realistic situations,
explanations on demand, and corrections that don't feel like failure.

## Users and personas
| Persona | Needs | Current pain |
|---|---|---|
| **Learner** — the friend, an adult absolute beginner (JLPT N5–N4 level), studying on a laptop | Practise realistic everyday exchanges at their own pace; understand each sentence; get corrected without judgement | Freezes in conversation; can't tell why a particle or politeness level is right; textbook phrases feel unnatural |
| **Judge / visitor** — Hacktoberfest judges and DEV readers | Try the app in under a minute from a link and see clearly how Gemma is used | No time to install a local model |
| **Builder** — the repo author | Ship a working, clear MVP in one weekend | Limited time; must avoid infrastructure that can slip |

## Goals
- G-1: Let a beginner hold a short, realistic roleplay conversation in Japanese with Gemma
  as a patient partner.
- G-2: Make every Gemma line understandable on demand (furigana, romaji, translation,
  breakdown of particles and nuance), with the helpers hidden by default so the learner
  isn't tempted to lean on them.
- G-3: Lower conversation anxiety: always offer a next reply to try, and correct mistakes
  gently ("Gentle Fix") instead of rejecting them.
- G-4: Showcase Gemma (the "Best Use of Gemma" category): runs fully offline on a laptop
  via Ollama, and is also reachable from a public demo link.
- G-5: Submit on time with a clear README, a demo video and a public repo.

## Success metrics
| Metric | Target | How it is measured |
|---|---|---|
| Structured output reliability | ≥ 95% of Gemma turns pass schema validation (after at most one automatic retry) | Scripted evaluation run of ≥ 20 turns per scenario against the chosen model |
| Scenario completion | The friend completes each of the 3 scenarios with ≥ 5 exchanges each | Manual session with the friend, noted in the submission |
| Gentle Fix usefulness | ≥ 8 of 10 seeded learner mistakes (wrong particle, wrong politeness) get a corrected sentence plus an explanation that names the issue | Fixed list of 10 mistaken sentences, reviewed by hand |
| Demo reach | A visitor can start a conversation from the demo URL with no install | Opening the demo link in a fresh browser |
| Submission | Submitted before the challenge deadline (Q-1) with repo, demo URL and video | DEV post published |

## Scope
### In scope (this version)
- Three fixed roleplay scenarios: buying a train ticket at Shinjuku, ordering ramen at an
  izakaya, asking for directions in Kyoto.
- One learner level: beginner (JLPT N5–N4 vocabulary), polite desu/masu form by default
  (scenario staff may use set keigo phrases such as いらっしゃいませ).
- Three-tier output for every Gemma turn: Japanese with furigana; romaji and English
  translation (hidden by default, toggleable); "Gemma's Breakdown" of particles and
  nuance, plus 1–2 suggested replies.
- Gentle Fix: when the learner's Japanese is wrong or unnatural, Gemma shows the natural
  phrasing and explains the particle or politeness choice, then continues the scene.
- Learner input typed in Japanese (kana/kanji via the OS input method); romaji input is
  accepted on a best-effort basis [ASSUMPTION A-3]; English or romaji input gets a Gentle
  Fix showing the Japanese version (AC-008.6), so visitors without Japanese can play.
- Two ways to run Gemma behind one interface: local Ollama (default, offline) and a hosted
  Gemma endpoint used by the public demo.
- Public demo on Google Cloud (scale-to-zero web service), plus a README with local
  setup.

### Non-goals (explicitly out of scope)
- Speech input or output (speech recognition, text-to-speech).
- User accounts, login, saved history or progress tracking across sessions.
- Spaced repetition, flashcards, quizzes or scoring.
- Level selection, politeness selection, or custom scenarios written by the user.
- Fine-tuning Gemma.
- Self-hosting Gemma on GPUs in the cloud (Cloud Run GPU, Vertex AI endpoints).
- Mobile apps; the web UI only needs to be usable on a laptop browser (mobile is a bonus).
- Languages other than Japanese, and UI languages other than English.

## Constraints
- **Deadline:** one weekend of build time (~2 days, roughly 12–16 hours). The exact
  submission deadline is open (Q-1).
- **Mandated technology:** must use Gemma (challenge rule for "Best Use of Gemma").
- **Stack (from the repo scaffold):** TypeScript (strict) on Node.js LTS; Terraform on
  Google Cloud for anything hosted.
- **Budget:** near-zero. Local use is free; the hosted demo must fit a small monthly cap
  (number set in requirements, NFR-006).
- **Public repository:** no secrets in the repo; the hosted model credential is kept in a
  secret manager.
- **Privacy:** learner messages are not stored by the app.

## Glossary
| Term | Meaning |
|---|---|
| Gemma | Google's family of open-weight language models |
| Ollama | A local runtime for open-weight models on a laptop |
| Scenario | A fixed roleplay setting with a role for Gemma (e.g. ramen shop staff) and a goal for the learner |
| Turn | One learner message plus Gemma's structured reply |
| Furigana | Small hiragana readings shown above kanji (HTML ruby text) |
| Romaji | Japanese written in Latin letters |
| Breakdown | Short explanations of the particles, words and nuance in Gemma's sentence |
| Suggested replies | 1–2 natural sentences the learner can send next |
| Gentle Fix | Correction of the learner's sentence: natural phrasing plus a reason, without rejecting the turn |
| Keigo / desu-masu / casual | Japanese politeness levels: honorific/humble, standard polite, plain |
| JLPT N5–N4 | The two beginner levels of the Japanese-Language Proficiency Test |

## Open questions
- [x] Q-1: What is the exact submission deadline (date and time zone) of the Hacktoberfest
  Weekend Challenge? → **2026-10-05 06:59 UTC** (08:59 CEST), per the official DEV
  challenge page.
- [ ] Q-2: Which Gemma version and size should be used locally and in the hosted demo? The
  brief names Gemma 2 (2B/9B); newer Gemma releases may follow instructions and Japanese
  better. To be verified against what Ollama and the hosted API offer (design phase).
- [ ] Q-3: Which hosted Gemma endpoint does the demo use, and what are its free-tier
  limits and terms (allowed in a public demo)? To be verified in design.

## Assumptions
<!-- Anything decided without confirmation. Mark in text as [ASSUMPTION A-n]. -->
- A-1: The conversation lives only in the browser tab; reloading the page starts over.
- A-2: The hosted demo may be rate-limited or paused when the budget is reached; the
  offline Ollama path is the main experience.
- A-3: Learners type Japanese with their OS input method; romaji input is passed to Gemma
  as-is, and its handling is not guaranteed.
- A-4: Content safety relies on Gemma's built-in behaviour plus a scenario-bound system
  prompt; no separate moderation service in v1.
