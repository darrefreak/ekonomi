# Financial Calendar

The Financial Calendar (`/calendar`) makes the next 7–90 days of money
tangible: every known or expected event on its day, and the **projected
accessible cash after each day**.

## Event sources and double-counting rules

`GET /api/v1/calendar?householdId=…&days=90` merges, in priority order:

1. **Future-dated actual transactions** (`FUTURE_TRANSACTION`, Känd);
2. **Subscription charges** with a scheduled next date (`SUBSCRIPTION_CHARGE`, Förväntad);
3. **Contract renewals** (`CONTRACT_RENEWAL`, Förväntad);
4. **Expected recurring transactions** (`EXPECTED_RECURRING`, Förväntad) —
   skipped when the same recurring stream already produced a subscription
   charge or is fulfilled by a future actual transaction;
5. **Salary estimate** (`SALARY_ESTIMATE`, Uppskattad) — only when no recurring
   income stream covers the same window;
6. **Goal target dates** (`GOAL_TARGET`) where applicable.

One underlying obligation appears exactly once. Each event carries a
confidence class — **KNOWN / EXPECTED / ESTIMATED** — surfaced in the UI as
Känd / Förväntad / Uppskattad badges, and expected events carry an amount band
(`lowMinor`–`highMinor`) instead of pretending to know the exact amount.

## Projected balance

The projection starts from today's accessible cash (liquid accounts) and walks
forward day by day, adding each day's net point estimate. The response includes
`lowestPoint` — the tightest day in the horizon — which the UI shows as the
planning headline. Window summaries for 7/30/60/90 days give inflow, outflow,
net and end balance.

The method is listed in the response (`method[]`) and rendered under
**"Så räknade vi"** on the page.

## Presentation

- **Timeline list is the default** on both mobile and desktop: days in order,
  events per day, projected closing balance per day.
- A compact **month grid** is available as a toggle; tapping a day shows its
  events. Mobile is never forced into tiny month cells.
- Horizon toggle: 7 / 30 / 60 / 90 days.
- Every event with a drill target links to it (transaction detail or the
  recurring surface).

## Integration

- Dashboard "Kommande" links to the calendar.
- The recurring/subscriptions page links to the calendar ("Visa i kalendern").
- The Weekly Review's "Nästa vecka" section is fed by the same service.
