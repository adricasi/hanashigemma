# 0003. Gemma 4 models and structured output

- Status: Accepted
- Date: 2026-10-04

## Context
The brief suggested Gemma 2 (2B/9B). As of October 2026, Gemma 4 is available both in
the Ollama library (`gemma4:e2b`, `e4b`, `12b`, `26b`, `31b`) and on the Gemini API
(`gemma-4-26b-a4b-it`, `gemma-4-31b-it`, free tier only, no paid tier). Every turn must be
a JSON object that matches one schema (REQ-003), with readings for kanji (REQ-004).
Ollama accepts a JSON schema in its `format` field. The Gemma documentation for the Gemini
API shows system instructions but does not document structured output (JSON schema) for
Gemma models.

## Decision
- Local default: `gemma4:e4b`; `gemma4:e2b` for laptops with little memory. Configurable
  with `GEMMA_MODEL`.
- Hosted default: `gemma-4-26b-a4b-it` (mixture of experts with about 4B active
  parameters, chosen for latency, NFR-004); `gemma-4-31b-it` is the fallback if quality is
  too low.
- Structured output: the prompt asks for JSON only, matching the schema, with an example.
  Ollama also gets the JSON schema in `format`. On both backends the server validates the
  reply with zod, applies cross-checks, and retries once with the validation error fed back
  to the model.

## Consequences
- The app doesn't depend on an undocumented Gemini API feature.
- Validation plus one retry may double latency on bad turns; the evaluation script
  measures the schema pass rate (≥ 95%) and p95 latency.
- Readings for kanji come from the model and can be wrong; this is accepted for v1. A
  dictionary-based reading generator is a possible later improvement.
- Model names are configuration, so moving to another Gemma version needs no code change.
- The hosted free tier may use demo content to improve Google products; the UI and README
  say so (design.md, Security design).
