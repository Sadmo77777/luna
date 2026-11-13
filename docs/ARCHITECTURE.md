# Architecture

## High-level design

Luna is organized as a browser client and a Node.js server:

```text
Browser
  ├─ React + TypeScript UI
  ├─ Local conversation/storage utilities
  ├─ Firebase client integration
  └─ HTTP requests / streamed responses
          │
          ▼
Express server (`server.ts`)
  ├─ Gemini and configurable provider requests
  ├─ Agent request handling and command validation
  ├─ Voice transcription endpoint
  ├─ Authentication middleware for protected sync operations
  └─ PostgreSQL access through Drizzle
```

This is a conceptual map of the current code, not a deployment topology requirement.

## Client

The frontend entry point is `src/main.tsx`; the main application is `src/App.tsx`. UI features are split across `src/components/`, including chat, agent workspace, settings, and companion-related components.

Useful implementation areas:

- `src/lib/localStore.ts` — browser-side local persistence helpers.
- `src/lib/firebase.ts` — Firebase client initialization.
- `src/lib/syncService.ts` — client synchronization operations.
- `src/hooks/useVoiceAssistant.ts` — voice assistant hook.
- `src/utils/` — shared helpers, parsers, crypto utilities, and tests.

Local browser storage and remote synchronization are distinct mechanisms. Do not assume that all conversations are automatically uploaded or that all stored data is end-to-end encrypted; inspect the relevant call path and settings before making such claims.

## Server

`server.ts` creates the Express application and configures environment loading. It coordinates model-provider requests, streaming responses, agent operations, voice transcription, and synchronization routes.

`src/middleware/auth.ts` contains the Firebase token authentication middleware used by protected routes.

## Data layer

- `src/db/schema.ts` defines the Drizzle database schema.
- `src/db/index.ts` initializes database access.
- `src/db/repository.ts` contains persistence operations.
- `src/db/drizzle.config.ts` configures Drizzle tooling.

The database is PostgreSQL-backed when configured. The client also has local persistence and Firebase-related synchronization code; these should not be conflated into one storage system.

## Model providers

The server uses `@google/genai` and reads `GEMINI_API_KEY` for its default Gemini client. The server also contains provider handling for configured endpoints, including OpenAI-compatible, Anthropic-style, and Ollama-compatible requests. Provider configuration may include a provider type, endpoint URL, model ID, and an optional key.

Only use trusted provider endpoints. The server includes endpoint validation, but deployments should still apply network egress controls and review endpoint handling.

## Agent execution

Agent-related code is split between server request handling and shared parsing/validation helpers in `src/utils/agentParser.ts`. The parser includes command validation and workspace-path checks. These controls are security boundaries: changes to them require tests and a security review.

## Where to make changes

| Concern | Main location |
| --- | --- |
| App composition | `src/App.tsx` |
| UI components | `src/components/` |
| Global styles | `src/index.css` |
| Client persistence | `src/lib/localStore.ts` |
| Firebase client | `src/lib/firebase.ts` |
| Sync client | `src/lib/syncService.ts` |
| Server and HTTP routes | `server.ts` |
| Authentication middleware | `src/middleware/auth.ts` |
| Database schema/repository | `src/db/` |
| Agent parsing/validation | `src/utils/agentParser.ts` |
