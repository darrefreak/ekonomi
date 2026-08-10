import assert from "node:assert/strict";
import { test } from "node:test";
import {
  matchMerchant,
  normalizeMerchantText,
  suggestAliasFromRaw,
} from "./normalize";

const merchants = [
  {
    id: "m1",
    canonicalName: "ICA Maxi Haninge",
    aliases: ["ICA MAXI HANINGE", "ICA MAXI 1234", "ICA MAXI"],
    userVerified: true,
  },
  {
    id: "m2",
    canonicalName: "Netflix",
    aliases: ["NETFLIX.COM"],
  },
];

test("normalization strips noise and legal suffixes", () => {
  const n = normalizeMerchantText("ICA MAXI HANINGE 1234 AB");
  assert.ok(!n.normalizedText.includes("1234"));
  assert.ok(!n.normalizedText.includes("AB"));
  assert.ok(n.tokens.includes("ICA"));
});

test("exact alias match with high confidence", () => {
  const r = matchMerchant("ICA MAXI HANINGE 1234", merchants);
  assert.ok(r.match);
  assert.equal(r.match!.merchantId, "m1");
  assert.ok(r.match!.confidence >= 0.9);
  assert.equal(r.rawDescription, "ICA MAXI HANINGE 1234");
});

test("ICA SVERIGE AB style maps via normalization rules when alias/canonical align", () => {
  const withSverige = [
    ...merchants,
    {
      id: "m3",
      canonicalName: "ICA",
      aliases: ["ICA SVERIGE"],
    },
  ];
  const r = matchMerchant("ICA SVERIGE AB", withSverige);
  assert.ok(r.match);
  assert.equal(r.match!.canonicalName, "ICA");
});

test("false-merge protection: unrelated string does not match", () => {
  const r = matchMerchant("HELT ANNAN BUTIK XYZ", merchants);
  assert.equal(r.match, null);
  assert.equal(r.needsReview, true);
});

test("raw description preserved and alias suggestion deterministic", () => {
  const raw = "ica maxi haninge 9999";
  const r = matchMerchant(raw, merchants);
  assert.equal(r.rawDescription, raw);
  assert.equal(suggestAliasFromRaw(raw), normalizeMerchantText(raw).normalizedText);
});

test("low-confidence unmatched goes to review", () => {
  const r = matchMerchant("OKAND MERCHANT POS 42", merchants);
  assert.equal(r.match, null);
  assert.equal(r.needsReview, true);
});
