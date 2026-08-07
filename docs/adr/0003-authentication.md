# ADR-0003: Authentication

## Status

Accepted (Phase 0)

## Context

Auth måste fungera för web och framtida native iOS, samt kunna utökas med passkeys/MFA. Browser-only cookie sessions som enda modell skapar inlåsning.

## Decision

- Använd **access token + refresh token**-modell (JWT eller opaka tokens — detaljval i Phase 1).
- Refresh tokens lagras säkert server-side (hash) med rotation och revocation.
- Access tokens är kortlivade och bär `userId` (+ ev. session id); household context väljs/valideras server-side.
- V1: email/password (eller liknande enkel säker lokal auth) räcker som foundation.
- Arkitektur förbereds för passkeys/MFA utan omskrivning av authorization layer.

## Consequences

- `apps/web` och framtida `apps/mobile` delar samma token-kontrakt via `api-client`.
- Logout / member leave / password change revokerar refresh tokens.
- CSRF-skydd behövs om cookies används för web; Bearer header-flöde för native.

## Alternatives considered

- NextAuth browser-session only — rejected as sole strategy.
- Pure server sessions in Redis without refresh rotation — weaker for mobile; may complement but not replace revocation design.
