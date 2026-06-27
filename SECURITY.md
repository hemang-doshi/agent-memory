# Security Policy

Agent Memory stores local project memory in `.agent-memory/`. Treat that directory as local state. It may contain project rules, command policies, evidence summaries, and other workflow metadata.

## Supported Versions

Security fixes target the active development branch until V1 release versioning is finalized.

## Reporting A Vulnerability

Please report suspected vulnerabilities privately to the project maintainers. If this repository is hosted on GitHub, use GitHub's private vulnerability reporting when enabled. Otherwise, contact the maintainer through the repository owner profile.

Do not open a public issue containing exploit details, secrets, or sensitive local database contents.

## Local Data Guidance

- Do not commit `.agent-memory/`.
- Do not store passwords, API keys, tokens, certificates, private keys, or one-off sensitive task details as memory.
- Review candidate memory before approval.
- Use `forget` to archive memory that should no longer be injected.
- Delete the local `.agent-memory/` directory only when you intentionally want to remove all local project memory.

## Current Safety Controls

- Obvious secrets are rejected in direct memory writes and candidate proposals.
- Blocked or redacted memories are excluded from packets.
- Archived, rejected, and superseded memories are excluded from default retrieval.
- Command preflight can warn or block based on explicit command policy memory.

These controls are defensive checks, not a substitute for secret scanning or repository security review.
