# Security Policy

## Reporting a vulnerability

Please do not publish exploitable details in a public issue. Contact the repository owner privately through GitHub's security reporting feature, if enabled, or another private channel agreed with the maintainer. Include the affected version/commit, impact, reproduction conditions, and any suggested mitigation. Do not include real user data or secrets.

## Secrets and configuration

- Keep `.env` files, API keys, database passwords, Firebase Admin credentials, and private keys out of Git.
- Use environment variables or a trusted secret manager for server-side secrets.
- Rotate any credential that was accidentally committed or shared. Removing it from the latest commit does not invalidate the exposed credential.
- The client-side Firebase app configuration is not equivalent to a Firebase Admin service-account key. Apply restrictive Firebase security rules and never put Admin credentials in browser code.
- Do not paste private SSH keys (`id_ed25519`) into issues, chats, or source files. Only the `.pub` public key belongs in GitHub's SSH-key settings.

## Application security notes

- Review authentication and authorization on every server route before deploying publicly.
- Treat user-supplied prompts, model output, uploaded content, and agent instructions as untrusted input.
- Keep agent command execution constrained to the intended workspace and approved commands. Do not remove validation or path restrictions without a security review.
- Validate and limit request sizes, file uploads, provider endpoint URLs, and rate of requests.
- Avoid logging API keys, access tokens, private prompts, or sensitive user content.
- Use HTTPS in deployed environments and secure database connections.
- Review Firestore rules and database permissions whenever data models or sync behavior change.

## Scope and disclosure

This document is a baseline project policy, not a security audit or a claim that the application is secure. Reporters should allow maintainers reasonable time to investigate and prepare a fix before public disclosure.
