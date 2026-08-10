import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferMerchantCandidate,
  shouldAutoAccept,
  SYSTEM_MERCHANT_RULES,
} from "./merchant-rules";
import { transactionSignature } from "./signature";

/** Build the inference input the way the service does, from a bank description. */
function candidateFor(description: string, transactionCount = 10) {
  const signature = transactionSignature(description);
  return inferMerchantCandidate({
    tokens: signature.tokens,
    opaque: signature.opaque,
    transactionCount,
  });
}

describe("system merchant rules", () => {
  it("names the merchants a Swedish statement states plainly", () => {
    assert.equal(candidateFor("NETFLIX.COM")?.merchant, "Netflix");
    assert.equal(candidateFor("SPOTIFY AB STOCKHOLM")?.merchant, "Spotify");
    assert.equal(candidateFor("ICA MAXI STORMARKNAD")?.merchant, "ICA");
    assert.equal(candidateFor("OKQ8 HANINGE")?.merchant, "OKQ8");
    assert.equal(candidateFor("APOTEKET AB")?.merchant, "Apoteket");
  });

  it("carries a category and an explanation with every candidate", () => {
    const candidate = candidateFor("NETFLIX.COM")!;
    assert.equal(candidate.categoryKey, "lifestyle.subscriptions");
    assert.equal(candidate.subscriptionLikely, true);
    assert.equal(candidate.source, "SYSTEM_RULE");
    assert.match(candidate.evidence, /NETFLIX/);
  });

  it("gives an opaque reference no merchant at all", () => {
    assert.equal(candidateFor("46700280624"), null);
    assert.equal(candidateFor("5484664022"), null);
  });

  it("returns null rather than guessing at an unknown merchant", () => {
    assert.equal(candidateFor("BUTIK AB GÖTEBORG"), null);
    assert.equal(candidateFor("BG MAX INBETALNING"), null);
  });

  it("refuses when two rules both match, rather than tossing a coin", () => {
    // A description naming two catalogued merchants supports neither conclusion.
    const ambiguous = inferMerchantCandidate({
      tokens: ["NETFLIX", "SPOTIFY"],
      opaque: false,
      transactionCount: 10,
    });
    assert.equal(ambiguous, null);
  });

  it("requires every token of a rule, not just one", () => {
    // "MAX" alone must not become the burger chain.
    assert.equal(candidateFor("MAX MATTSSON"), null);
    assert.equal(candidateFor("MAX BURGERS AB")?.merchant, "Max");
  });

  it("is less confident about a single sighting than an established pattern", () => {
    const once = candidateFor("NETFLIX.COM", 1)!;
    const often = candidateFor("NETFLIX.COM", 40)!;
    assert.ok(often.confidence > once.confidence);
  });

  it("holds back the merchants that bill for unrelated things", () => {
    // Apple is confidently Apple and not confidently a subscription; it must not
    // auto-file a laptop purchase under subscriptions.
    const apple = candidateFor("APPLE COM BILL")!;
    assert.equal(apple.merchant, "Apple");
    assert.equal(shouldAutoAccept(apple), false, "Apple goes to review, not straight in");

    const netflix = candidateFor("NETFLIX.COM")!;
    assert.equal(shouldAutoAccept(netflix), true);
  });

  it("keeps the catalogue small and free of ordinary words", () => {
    assert.ok(
      SYSTEM_MERCHANT_RULES.length < 40,
      "this is a seed, not an attempt to enumerate Swedish retail",
    );
    for (const rule of SYSTEM_MERCHANT_RULES) {
      for (const token of rule.tokens) {
        assert.ok(token.length >= 2, `${rule.merchant} has a one-character token`);
        assert.equal(token, token.toUpperCase(), `${rule.merchant} token must be upper case`);
      }
      assert.ok(rule.confidence > 0.5 && rule.confidence <= 1);
    }
  });
});
