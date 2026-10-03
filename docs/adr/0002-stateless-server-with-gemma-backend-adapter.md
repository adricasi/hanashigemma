# 0002. Stateless server with a Gemma backend adapter

- Status: Accepted
- Date: 2026-10-04

## Context
HanashiGemma must run fully offline on a laptop with Ollama (the friend's main use) and
also from a public demo link for judges (REQ-010, G-4). The build window is one weekend,
with the submission deadline on 2026-10-05 06:59 UTC. The hosted Gemma API key must not
reach the browser (NFR-001), and the demo needs server-side usage limits (REQ-011).

Options considered (see design.md, "Options considered"): one stateless Node server with
an adapter; a static site calling the models from the browser; self-hosting Gemma on
Cloud Run GPUs.

## Decision
We build one TypeScript server (Node.js 22, Hono) that serves a framework-free static UI
and one API endpoint, `POST /api/turn`. The server keeps no conversation state: the
browser sends the scenario id, the history and the new message on every turn. Model
access goes through a small adapter interface with two implementations, Ollama
(`/api/chat`) and the Gemini API (`generateContent`), chosen by the `GEMMA_BACKEND`
environment variable.

## Consequences
- The same code runs locally and on Cloud Run; only configuration differs.
- No database, sessions or cookies, which keeps the privacy story simple (NFR-002).
- The API key and the rate limits stay on the server.
- Each request carries the whole history, bounded to 30 learner messages (AC-002.5), so
  payloads stay small.
- In-memory rate counters reset when the instance restarts; this is acceptable for a demo
  (see ADR-0004).
- No UI framework: less to install and learn under the deadline, at the cost of writing a
  few DOM helpers by hand.
