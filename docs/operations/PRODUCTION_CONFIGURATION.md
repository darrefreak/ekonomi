# Production configuration contract

What a production process requires before it will serve a request, and what
happens when it does not have it.

This is deliberately not a cloud deployment guide. It is the contract between
the application and whatever runs it, so that a deployment either works or
refuses to start — never something in between.

## The rule

`assertProductionConfiguration()` runs before anything else in both
`apps/api/src/main.ts` and `apps/api/src/worker.ts`. When `NODE_ENV=production`
and the environment does not satisfy the contract, the process logs every
problem it found and exits with status 1.

There is no fallback to a development value and no silently generated secret.
A generated secret would sign tokens that stop working at the next restart and
across replicas, which is a worse failure than not starting.

Outside production the contract is not enforced, so a laptop and the test suite
keep working with defaults.

## Required variables

| Variable | Purpose | Rejected when |
|---|---|---|
| `JWT_ACCESS_SECRET` | signs access tokens | missing, a known placeholder, shorter than 32 characters, fewer than 12 distinct characters, or containing whitespace or control characters |
| `DATABASE_URL` | PostgreSQL connection | missing, or not a `postgres:`/`postgresql:` URL |
| `REDIS_URL` | queues and scheduled jobs | missing, or not a `redis:`/`rediss:` URL |
| `CORS_ORIGIN` | browser origins allowed to call the API | missing, `*`, not an `http(s)` origin, or pointing at localhost |
| `S3_ENDPOINT` | object storage for documents | missing, or not an `http(s)` URL |
| `S3_ACCESS_KEY` | object storage credential | missing |
| `S3_SECRET_KEY` | object storage credential | missing |
| `S3_BUCKET` | bucket holding uploaded documents | missing |

`FFOS_ALLOW_DB_RESET=true` is refused in production outright: it permits a
destructive schema reset, which has no legitimate production use.

### Optional

| Variable | Default | Notes |
|---|---|---|
| `JWT_REFRESH_SECRET` | unset | **Not used for signing.** Refresh tokens are opaque random strings stored and revoked in the database (ADR-0003). If it is set anyway it is still validated, so an unused weak value cannot quietly become a used one later. |
| `JWT_ACCESS_TTL` | `15m` | access token lifetime |
| `JWT_REFRESH_TTL` | `30d` | refresh token lifetime |
| `FFOS_RATE_LIMIT` | `120` | requests per minute per client |
| `API_PORT` | `3001` | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | unset | invitation email; invitations cannot be delivered without it |
| `WEB_ORIGIN` | unset | used to build links in outbound email |

## The three environments

| | `development` | `test` | `production` |
|---|---|---|---|
| Configuration contract | not enforced | not enforced | enforced at boot, fails closed |
| Signing secret | generated per machine into `.env` | fixed value in `.env.test` | operator-supplied, validated |
| Database | `ffos_dev` | `ffos_test`, required by the test runner | operator-supplied |
| `FFOS_ALLOW_DB_RESET` | permitted | permitted | refused |
| Rate limit | raised for end-to-end runs | raised | `120`/minute |

## Generating secrets

```bash
openssl rand -base64 48
```

For a local stack, generate once into the gitignored `.env`:

```bash
pnpm secrets:dev
```

This repository does not contain a working signing secret. It used to ship
`dev-access-secret-change-me` in `docker-compose.yml`, which meant every
checkout signed tokens with a string published on the internet, and any
deployment that forgot to override it inherited the same key. Compose now reads
the value from `.env` and refuses to start the stack when it is absent.

Rules that follow from this:

- never commit a generated secret, in any file, including `.env.example`;
- never echo one — `pnpm secrets:dev` prints which variables it wrote, not what
  it wrote, and the boot-time validator names the variable and the reason but
  never the value;
- treat any secret that has appeared in a log, a terminal recording or a chat
  message as burned, and rotate it.

## Rotating the access secret

Access tokens are signed with a single key. The application does not verify
against a set of keys, so there is no overlap window:

**Rotating `JWT_ACCESS_SECRET` invalidates every active access token
immediately.** Every signed-in user's next API call returns `401`.

That is acceptable for V1 because of how the two token types differ:

- **Access tokens** are signed, short-lived (`15m` by default) and not stored.
  Rotation invalidates all of them.
- **Refresh tokens** are opaque random strings stored in `refresh_tokens` and
  are *not* signed. Rotation does not affect them.

So a rotation is disruptive but not destructive: the web client's next refresh
exchanges the still-valid refresh token for an access token signed with the new
key, and the user continues. A user actively using the app sees at most one
failed request.

Procedure:

1. Generate a new secret with `openssl rand -base64 48`.
2. Replace `JWT_ACCESS_SECRET` in the deployment's secret store.
3. Restart the API and worker. Both validate the new value at boot and refuse
   to start if it is unusable, so a bad rotation fails visibly rather than
   taking down authentication.
4. If the old secret was exposed rather than rotated on schedule, also revoke
   the refresh tokens (`delete from refresh_tokens`), which forces every user
   to sign in again. Rotation alone does not do this.

Supporting overlapping old and new verification keys would remove the
disruption. That needs a key-id in the token header and a verifier that accepts
a set of keys. It is not built, and V1 does not pretend otherwise.

## Verifying a deployment

`scripts/pilot/production-secret.py` boots the built image under
`NODE_ENV=production` in a series of configurations and asserts the contract
end to end: that a published placeholder, a missing secret, a weak secret, a
malformed secret, a missing service URL and an enabled database reset each stop
the process; that a correctly configured one starts; and that tokens signed
with the placeholder, with another secret, edited after signing, expired, or
unsigned are all rejected while a genuinely issued session works.
