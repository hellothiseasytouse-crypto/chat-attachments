# NOXEN Console

A standalone Vite + React terminal workspace connected to NOXEN's live chat API.

## Features

- Live model responses from NOXEN Core, Nova, Swift, and Studio.
- Terminal-style command interface, model selection, automatic routing, and sequential `/bench` runs.
- No typewriter effect or chat-style response animations.
- Transcript export, clear, and stop controls.

## Runtime architecture

The browser sends requests to this project's same-origin `/api/chat` relay. The relay forwards a strict allowlist of request fields to the canonical NOXEN endpoint:

`https://noxenlabs.vercel.app/api/chat`

Provider credentials remain on the NOXEN server. They are never copied into this repository or exposed to the browser. Studio Plus is intentionally unavailable in this standalone lab because its backend requires a verified owner session; use Studio Plus from the signed-in NOXEN app.

The main NOXEN website and its frontend are not modified by this project.

## Run locally

```bash
npm install
npm run dev
```

For local use, set up a local serverless-function emulator or deploy to Vercel; the `api/chat.ts` relay is a Vercel Function.

## Build

```bash
npm run build
```
