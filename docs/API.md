# HTTP API Reference

This document summarizes the Express routes currently defined in `server.ts`. It is a route inventory, not a complete OpenAPI contract. Request schemas and response payloads can evolve; inspect the implementation before building a client against them.

## Conventions

- Base URL: the server origin, normally `http://localhost:3000` in local development.
- JSON requests should use `Content-Type: application/json` unless the route expects another format.
- Protected synchronization routes use Firebase ID-token authentication through `requireAuth`.
- Chat streaming uses Server-Sent Events (SSE); clients should read the response as a stream rather than expecting one JSON document.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health/status response |
| `POST` | `/api/chat/stream` | Stream an assistant response |
| `POST` | `/api/chat/summarize` | Summarize conversation content |
| `POST` | `/api/voice/transcribe` | Transcribe supplied audio |
| `POST` | `/api/agent/exec` | Execute a validated agent operation |
| `POST` | `/api/agent/run` | Run an agent request |
| `POST` | `/api/sync/session` | Synchronize session/user state |
| `PUT` | `/api/sync/preferences` | Update user preferences |
| `POST` | `/api/sync/conversations` | Create or update a conversation |
| `DELETE` | `/api/sync/conversations/:id` | Delete a conversation |
| `POST` | `/api/sync/documents` | Create or update a document |
| `DELETE` | `/api/sync/documents/:id` | Delete a document |
| `POST` | `/api/sync/devices` | Register/update a device |
| `GET` | `*` | Frontend/fallback handler |

## Authentication

The synchronization route group is protected by Firebase token middleware in the current implementation. Send a valid Firebase ID token using the authorization format expected by `src/middleware/auth.ts` (commonly `Authorization: Bearer <ID_TOKEN>`).

Do not infer that every other API route has the same authentication requirement. Check the route registration and middleware chain in `server.ts` before exposing an endpoint publicly.

## Streaming chat

`POST /api/chat/stream` returns streamed events. The server writes SSE frames in the form:

```text
data: {"type":"...","...":"..."}

```

The implementation emits event types such as metadata, token chunks, and errors. A client should:
1. Send the request with the required message/provider options.
2. Read the response body incrementally.
3. Parse complete `data:` frames.
4. Handle error events and connection termination.

The exact request fields and event payloads are defined by the route implementation in `server.ts`; keep this document updated when those contracts change.

## Agent routes

`POST /api/agent/exec` and `POST /api/agent/run` are sensitive operations. The server uses shared command/path validation helpers. Treat them as privileged application functionality, keep access appropriately restricted, and do not bypass validation for convenience.

## Error handling

Clients should handle non-2xx HTTP responses, network failures, malformed event frames, and application-level error events. Avoid displaying raw internal stack traces to end users.
