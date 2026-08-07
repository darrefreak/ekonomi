# Threat Model — Family Financial OS

## 1. Assets

| Asset | Känslighet |
|---|---|
| Household financial transactions & balances | Critical |
| Personal account details within household | Critical |
| Auth credentials / refresh tokens | Critical |
| Future connector tokens / sessions | Critical |
| Documents (invoices, tax, salary) | Critical |
| AI conversation context with financial data | High |
| Audit logs | High |
| Mock/demo data | Low (men får inte läcka till andra hushåll) |

## 2. Actors

- Legitimate household members (various roles)
- Malicious household member (insider curiosity / abuse)
- External attacker (internet)
- Compromised client device
- Malicious document/content (prompt injection, malware)
- Future compromised connector / third party
- Honest-but-curious operator/admin (minimize exposure)

## 3. Trust boundaries

```
[Browser / future iOS] 
        │ TLS
        ▼
[API gateway / NestJS]
        │ authz + household scope
        ▼
[Postgres] [Redis] [MinIO] [Workers]
        │
        ▼ (future)
[External connectors] — untrusted
```

`financial-engine` är trust-neutral pure compute (inga secrets, ingen I/O).

## 4. Key threats & mitigations

| Threat | Mitigation |
|---|---|
| IDOR / cross-household access | Mandatory household scope; membership checks; tests |
| Privilege escalation via role | Server-side role checks; OWNER-only destructive ops |
| Personal data leakage to co-members | Privacy policies (AGGREGATES_ONLY etc.) |
| Token theft | Short-lived access tokens; rotating refresh; secure storage; revocation |
| Brute force auth | Rate limits; lockout/backoff |
| Injection (SQL/NoSQL) | Parameterized ORM; Zod validation |
| SSRF via document URLs (future) | URL allowlists; block private ranges; fetch via controlled worker |
| Prompt injection via documents | Treat docs as data; structured extract only; tool sandbox |
| AI unauthorized actions | Hard deny list; no payment/trade tools; audit |
| Duplicate financial distortion | Fingerprints, external IDs, reconciliation |
| Job replay abuse | Idempotency keys; household binding |
| Secret leakage in logs/repo | Structured redaction; .gitignore; secret manager |
| Supply chain | Lockfile; minimal deps; audit in later phases |
| Marketplace illegal scraping | No scraping V1; license metadata required later |

## 5. Abuse cases inside household

1. VIEWER försöker läsa partnerns personliga merchants → blocked by privacy policy.
2. CHILD försöker ändra budget/policies → denied.
3. Member leaves household → access revoked; personal data separation flow (design).
4. Ex-member använder gammal token → refresh revoked.

## 6. Residual risks (accepted for V1 architecture)

- V1 auth är “enkel säker” — MFA/passkeys kommer senare.
- Demo mode måste skyddas från att förväxlas med production data.
- AI mock tools kan ge felaktiga *förklaringar* om data är ofullständig — mitigera med coverage/freshness i brief.

## 7. Review cadence

Uppdatera threat model vid:

- intro av riktiga connectors
- document parsing
- AI tool expansion
- payments/automation LEVEL 3+
- native mobile auth
