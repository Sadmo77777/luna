# Luna

Luna is a web-based AI assistant with a React + TypeScript client and an Express server. The project includes streamed model responses, configurable model providers, voice-related functionality, an agent workspace, local conversation storage, and optional account-backed synchronization.

> **Project status:** This README describes the code currently present in this repository. It is not a guarantee that every feature is production-ready. Verify behavior in the application before relying on it.

## Contents

- [Features and architecture](docs/ARCHITECTURE.md)
- [Setup and configuration](docs/CONFIGURATION.md)
- [Development workflow](docs/DEVELOPMENT.md)
- [HTTP API reference](docs/API.md)
- [Security notes](SECURITY.md)

## Requirements

- Node.js compatible with the versions required by the dependencies in `package.json`
- npm (or another compatible package manager)
- A Gemini API key for the server's default Gemini provider
- Optional: PostgreSQL and Firebase configuration for the corresponding persistence and authentication features

Check the package manager lockfile before choosing a package manager. The repository currently includes `bun.lock`.

## Quick start

```bash
git clone git@github.com:Sadmo77777/luna.git
cd luna
npm install
```

Create a local `.env` file in the repository root and set at least:

```dotenv
GEMINI_API_KEY=replace_with_your_key
PORT=3000
```

Start the development server:

```bash
npm run dev
```

Open the local URL printed by the server (normally `http://localhost:3000`).

The server calls `dotenv.config()`, which loads `.env` by default. Do not assume `.env.local` is loaded by the server.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the TypeScript Express/Vite development server |
| `npm run build` | Build the frontend with Vite |
| `npm run preview` | Preview the built frontend |
| `npm run lint` | Run TypeScript checking (`tsc --noEmit`) |
| `npm run clean` | Remove generated build output |

There is no dedicated `test` script in the current `package.json`. Some test files exist in `src/`; use the project's configured test runner only after confirming one is installed and configured.

## Configuration at a glance

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-side Gemini API key |
| `PORT` | Express server port; defaults to `3000` |
| `APP_URL` | Public application URL used in selected provider request headers |
| `SQL_HOST` | PostgreSQL host |
| `SQL_USER` | PostgreSQL user |
| `SQL_PASSWORD` | PostgreSQL password |
| `SQL_DB_NAME` | PostgreSQL database name |
| `SQL_ADMIN_USER` | Database migration/admin user, if used by the Drizzle configuration |
| `SQL_ADMIN_PASSWORD` | Database migration/admin password, if used by the Drizzle configuration |

See [Configuration](docs/CONFIGURATION.md) for details. Never commit real credentials.

## Contributing

1. Create a branch for your change.
2. Keep changes focused and document new configuration or API behavior.
3. Run `npm run lint` and `npm run build`.
4. Add or update tests when changing logic that has test coverage.
5. Open a pull request describing the behavior change and how it was verified.

## License

See [LICENSE](LICENSE).
