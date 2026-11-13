# Configuration

## Environment file

The server calls `dotenv.config()` from the repository root. By default, this loads `.env`.

1. Copy or create `.env` in the repository root.
2. Add only the variables needed for the services you enable.
3. Keep `.env` out of version control.
4. Restart the server after changing environment variables.

Example:

```dotenv
GEMINI_API_KEY=replace_with_your_key
PORT=3000
APP_URL=http://localhost:3000

# PostgreSQL (only if database-backed features are enabled)
SQL_HOST=127.0.0.1
SQL_USER=luna
SQL_PASSWORD=replace_me
SQL_DB_NAME=luna

# Drizzle/admin credentials, if required by your migration setup
SQL_ADMIN_USER=luna_admin
SQL_ADMIN_PASSWORD=replace_me
```

Do not copy this example's placeholder values into a production deployment.

## Variables

| Variable | Required when | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Using the server's default Gemini client | Secret key for Gemini API access |
| `PORT` | Optional | HTTP port; server defaults to `3000` |
| `APP_URL` | Using provider integrations that send app-identification headers | Public URL identifying the application |
| `SQL_HOST` | Using PostgreSQL | Database hostname |
| `SQL_USER` | Using PostgreSQL | Application database username |
| `SQL_PASSWORD` | Using PostgreSQL | Application database password |
| `SQL_DB_NAME` | Using PostgreSQL | Database name |
| `SQL_ADMIN_USER` | Running configured administrative/migration operations | Database admin username |
| `SQL_ADMIN_PASSWORD` | Running configured administrative/migration operations | Database admin password |

The exact variables consumed by a particular operation can change. Check `server.ts`, `src/db/`, and the Drizzle configuration before deploying.

## Firebase

The repository includes `firebase-applet-config.json` and Firebase client initialization in `src/lib/firebase.ts`. Treat browser Firebase configuration as public application configuration, not as a server secret. Security depends on correct Firebase Authentication setup, Firestore rules, and authorization checks.

Server-side Firebase Admin initialization is separate. Configure it using the supported deployment credential mechanism for the environment; never commit a service-account private key.

## Model providers

The server initializes its default Gemini client from `GEMINI_API_KEY`. It also supports custom provider settings in requests for provider types such as:

- `gemini`
- `openai_compatible`
- `anthropic`
- `ollama`

A custom provider may require an endpoint URL, model ID, and API key. Local Ollama endpoints generally do not require a key, while remote services usually do. Keep keys private and use HTTPS for remote endpoints.

## Database and TLS

Review `src/db/drizzle.config.ts` and `src/db/index.ts` before deployment. Do not assume a development database connection setting is appropriate for production. Use the database provider's recommended TLS configuration and least-privilege credentials.
