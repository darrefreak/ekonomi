# Contextual Advisor

The AI Advisor is available throughout the product, not only on `/advisor`.

## Surface

`AdvisorPanel` is mounted in the app shell: a floating **"Fråga rådgivaren"**
button opens a right-side panel on desktop and a bottom sheet on mobile
(`role="dialog"`, Escape closes, backdrop closes). The panel is hidden when the
`AI` feature flag is off and on the advisor page itself.

## Page context

When the panel sends a message it attaches a **safe structured context**:

```json
{ "page": "subscriptions", "entityType": "subscription", "entityId": "…" }
```

The context is a route name and optional entity reference — never page
content, never amounts. `advisorPageContextSchema` bounds every field.
On the server, `selectToolsForMessage` uses the context to bias which
allowlisted read-only tools are offered to the model, so a question asked from
the liquidity page reaches the liquidity tools even if the wording is vague.

## Grounding

Nothing changes in the grounding model: the advisor answers **only** from
deterministic tool output, cites its sources (each reply carries citations with
in-product links) and exposes the tool trace. Numbers never come from the
model. If a question cannot be answered by the available tools, the advisor
says so.

## Contextual suggestions

The panel offers page-specific starter questions, e.g.:

- Mat/What Changed: "Varför har utgifterna förändrats?"
- Likviditet: "Varför behöver jag så stor buffert?"
- Kalender: "Vilken period ser mest ansträngd ut?"
- Abonnemang: "Vilka abonnemang har blivit dyrast?"
- Fordon: "När är det mest rationellt att byta bil?"

## Proactive intelligence

Proactive surfacing continues to come from the deterministic side: the
Financial Brief's ranked findings, the notifications surface and the
opportunities detector. The advisor does not push unsolicited messages.

## Tone and write actions

Tone is calm, clear and non-judgmental — no roasting, guilt or manufactured
urgency. The advisor is read-only; any prepared change (budget adjustment,
category correction, rule creation) must be presented as an exact proposal and
executed by the user through the normal UI actions. The panel footer states
this explicitly.
