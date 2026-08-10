# Security — Family Financial OS

## 1. Stance

Zero trust för känsliga operationer. Ekonomisk data är högkänslig.

## 2. Requirements (baseline)

| Krav | Detalj |
|---|---|
| Passwords | Aldrig plaintext; modern hashing (t.ex. argon2/bcrypt) |
| Secrets | Aldrig i repo; environment variables; production secret manager/KMS-ready |
| Connector tokens | Krypteras i production |
| Input validation | Zod vid API-gräns |
| DB access | Parameteriserad (ORM); household-scoped queries |
| Rate limiting | Auth och känsliga endpoints |
| Secure headers | Helmet/motsvarande |
| CSRF | Där relevant (cookie-baserade flöden) |
| Sessions | Token revocation; refresh token-rotation |
| Request IDs | Korrelation i logs |
| Least privilege | Roller + privacy policies |
| Logs | Inga känsliga ekonomiska rådata i onödan |
| Audit | Betydelsefulla ändringar + AI-handlingar |

## 3. Auth architecture

Se [ADR-0003](./adr/0003-authentication.md).

- Access token + refresh token (eller ekvivalent)
- Fungerar för web och framtida native iOS
- Förberedd för passkeys/MFA
- Inte beroende av browser-only session state

V1: enkel men säker auth foundation.

## 4. Authorization

1. Authenticated user
2. Household membership
3. Role (OWNER/ADMIN/ADULT/VIEWER/CHILD)
4. Privacy policy för personliga entities (FULL_DETAILS / AGGREGATES_ONLY / …)
5. Feature flags där relevant

**IDOR-skydd:** varje query filtrerar på `householdId` från session/token-context — aldrig lita på client-supplied household utan medlemskapskontroll.

## 5. Data isolation

Se [DOMAIN_INVARIANTS](./DOMAIN_INVARIANTS.md) §3 och [PRIVACY_MODEL](./PRIVACY_MODEL.md).

## 6. Document & AI safety

- PDF/email/web content = untrusted
- AI får aldrig tolka dokumentinstruktioner som systeminstruktioner
- Skydd förbereds för: prompt injection, malicious links, SSRF, manipulated invoices, unsafe file types, hidden instructions
- AI använder endast definierade tools — ingen godtycklig DB-access
- AI får inte utföra finansiella side effects (betalningar, trades, policy changes, bilköp, etc.)

## 7. Connector security (framtida)

Authenticated browser connectors:

- Användaren autentiserar själv (BankID etc.)
- Systemet ber aldrig om BankID-kod
- Lagrar aldrig BankID credentials
- Session state endast krypterat senare om tekniskt säkert, juridiskt tillåtet och tillåtet av tjänstens regler

V1: mock connection states only.

## 8. Vehicle market data rights

Market connector metadata måste inkludera license, permittedUse, prohibitedUse, attribution, retention, geographicCoverage, refreshLimit, termsVersion, lastLegalReviewAt.

Ingen marketplace scraping i V1. Anta aldrig att publika annonser får skrapas/lagras obegränsat.

## 9. Transport & headers

- TLS i production
- HSTS, CSP (rimlig baseline), X-Content-Type-Options, Referrer-Policy
- CORS strikt för web origins

## 10. Object storage

MinIO/S3: privata buckets, signed URLs med kort TTL för dokument, virus/type checks införs i dokumentfas.

## 11. Jobs

Jobs household-scoped; payload utan onödiga secrets; idempotency keys; ingen eskalering av privileges via job payload manipulation.

## 12. Health endpoints

`/health`, `/health/ready`, `/health/live` — ingen känslig data i responses.
