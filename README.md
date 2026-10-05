# HanashiGemma (話Gemma)

A patient, low-anxiety Japanese conversation partner, built for a friend who is learning
Japanese and freezes in real conversations. You pick a real-life scene, Gemma plays the
other person, and every line comes with the help a beginner needs — **running entirely on
your own laptop** with Google's open-weight **Gemma 4** model through
[Ollama](https://ollama.com).

> Built for the DEV Hacktoberfest Weekend Challenge: *Build for a Friend*.

## What it does

Pick one of three scenes — **buying a train ticket at Shinjuku**, **ordering ramen at an
izakaya**, **asking for directions in Kyoto** — and talk. Every Gemma turn shows:

- **Furigana** — hiragana readings above the kanji (switchable).
- **Romaji and English** — hidden by default so you try to read first; one click per line,
  or "Always show" for every line.
- **Gemma's Breakdown** — the particles and phrases in that line, explained in English.
- **Suggested replies** — one or two things you could say next; click one to put it in
  your message box and edit it.
- **Gentle Fix** — when your Japanese is off, an encouraging card shows what you wrote, a
  more natural version and why, and the scene simply continues. Don't know how to say
  something yet? **Type it in English** and the Gentle Fix shows you the Japanese.

Gemma speaks beginner Japanese (JLPT N5–N4, polite desu/masu form) and stays in role.

## Run it on your laptop (offline, private, free)

You need [Node.js](https://nodejs.org) 22.9 or newer and [Ollama](https://ollama.com).

```bash
ollama pull gemma4:e4b          # about 6.6 GB; on a smaller laptop: gemma4:e2b
git clone https://github.com/adricasi/hanashigemma.git
cd hanashigemma
npm ci && npm run build
npm start                       # then open http://localhost:8080
```

With `gemma4:e2b`, start it as `GEMMA_MODEL=gemma4:e2b npm start`. Once the model is pulled,
no internet connection is needed.

## Privacy

- **Local mode (default):** your messages go from the browser to the app and to Ollama on
  the same computer — nothing leaves it. Nothing is stored: the conversation lives in the
  browser tab and is gone when you reload.
- The server never logs what you write; logs contain only timing and status metadata.
- **Hosted demo mode** (optional, `GEMMA_BACKEND=gemini`) sends messages to Google's Gemini
  API, whose free tier may use them to improve Google products. The app says so on screen.

## How it works

```
Browser (vanilla TypeScript)  ──POST /api/turn──▶  Node.js + Hono server  ──▶  Gemma 4
  scene, history, message                           prompt + JSON schema        (Ollama locally,
  ◀── validated reply (furigana, romaji, English,   zod validation + 1 retry     Gemini API hosted)
      breakdown, suggestions, Gentle Fix)
```

- Gemma answers in **structured JSON** (Ollama's `format` with a JSON schema): the reply
  split into segments with readings, romaji, English, breakdown, suggestions and an
  optional fix.
- The server **validates every reply** (the segments must spell the reply exactly,
  breakdown phrases must appear in it, readings must be hiragana) and retries once with the
  reason; a broken turn is never shown.
- The model is configuration: swap `gemma4:e4b` for any Gemma 4 size with one variable.

| Setting | Default | Meaning |
|---|---|---|
| `GEMMA_BACKEND` | `ollama` | `ollama` (local) or `gemini` (hosted Gemini API) |
| `GEMMA_MODEL` | `gemma4:e4b` / `gemma-4-26b-a4b-it` | Model name for the backend |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Where Ollama listens |
| `GEMINI_API_KEY` | — | Required for `gemini`; keep it out of files |
| `PORT` / `HOST` | `8080` / `127.0.0.1` | Where the app listens (localhost only by default) |
| `PER_MINUTE_LIMIT` / `DAILY_TURN_CAP` | `10` / `500` | Demo limits (daily cap: hosted only) |

The container image and the Cloud Run demo setup are described in
[docs/deploy.md](docs/deploy.md).

## Development

```bash
npm test                         # Vitest (unit, API with a fake model, UI with happy-dom)
npm run lint && npm run typecheck
npm run build
```

TypeScript (strict), Hono, zod, Vitest. No real model calls in tests. The specification
(requirements with acceptance criteria, design, task plan) is in [docs/spec](docs/spec/)
and architecture decisions in [docs/adr](docs/adr/). [INDEX.md](INDEX.md) maps where each
part of the code lives.

## License

Code: [MIT](LICENSE). The Gemma model is provided under the
[Gemma Terms of Use](https://ai.google.dev/gemma/terms).
