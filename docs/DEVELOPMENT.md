# Development Guide

## Setup

```bash
git clone git@github.com:Sadmo77777/luna.git
cd luna
npm install
```

Create `.env` in the repository root with the required local settings. At minimum, the server's default Gemini client expects `GEMINI_API_KEY`.

## Run locally

```bash
npm run dev
```

The `dev` script runs `tsx server.ts`. Open the local address printed by the server.

## Validate changes

```bash
npm run lint
npm run build
```

Important: despite its name, the current `lint` script runs `tsc --noEmit`; it is a TypeScript check, not ESLint. The package also has an ESLint configuration, but the `lint` script does not currently invoke it.

The current `package.json` does not define a `test` script. Test files are present under `src/`; check the installed tooling and project configuration before choosing a test command.

## Git workflow

Use a feature branch rather than committing experimental work directly to `main`:

```bash
git switch main
git pull --ff-only
git switch -c docs/improve-project-docs

# Make and review changes
git status
git diff --check
git diff

git add README.md SECURITY.md docs/
git commit -m "docs: improve project documentation"
git push -u origin docs/improve-project-docs
```

Then open a pull request on GitHub. If you are the repository owner and intentionally want to update `main` directly, confirm that the working tree is clean and that the branch is up to date before pushing.

## Documentation rules

- Describe behavior that exists in code; label planned behavior as planned.
- Add new environment variables to `docs/CONFIGURATION.md` and the README table.
- Update `docs/API.md` when routes or request/response contracts change.
- Never include real tokens, credentials, personal data, or private deployment URLs.
- Include verification steps for changes that affect setup or deployment.

## Troubleshooting

### `GEMINI_API_KEY` is missing

Check that `.env` is in the repository root and that the variable name is exact. Restart the server after editing it.

### Changes do not appear

Confirm the app is running from the intended checkout, check the terminal output, and run `git status` to make sure the edited files are in the repository.

### Git push is rejected

Run `git status` and `git pull --ff-only` first. Do not use `git push --force` to bypass a rejected push. Resolve the branch divergence or open a pull request.
