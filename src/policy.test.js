import { test } from "node:test";
import assert from "node:assert/strict";
import { USDC, USDC_DEVNET, pickSolana } from "./lib.js";
import { assertPolicy, beforeSign, policyFromPrincipal } from "./policy.js";

const RECIPIENT = "11111111111111111111111111111111";

function hdr({ amount = "10000", currency = USDC_DEVNET, recipient = RECIPIENT, network = "devnet", splits, method = "solana" } = {}) {
  const request = { amount, currency, recipient, methodDetails: { network, ...(splits ? { splits } : {}) } };
  return `Payment id="a", realm="r", method="${method}", intent="charge", request="${Buffer.from(JSON.stringify(request)).toString("base64url")}"`;
}

function policy(over = {}) {
  return { network: "devnet", mint: USDC_DEVNET, recipient: RECIPIENT, ceiling: 10000n, allowMainnet: false, ...over };
}

test("beforeSign passes expectedNetwork and maxAmount for pay-kit solana.charge", () => {
  const seam = beforeSign([hdr()], policy());
  assert.equal(seam.expectedNetwork, "devnet");
  assert.equal(seam.maxAmount, 10000n);
  assert.equal(seam.hit.method, "solana");
});

test("assertPolicy refuses hostile fields", () => {
  const hit = (h) => pickSolana([h]);
  assert.throws(() => assertPolicy(hit(hdr({ network: "mainnet" })), policy()), /mainnet refused/);
  assert.throws(() => assertPolicy(hit(hdr({ network: "mainnet" })), policy({ network: "mainnet" })), /ALLOW_MAINNET/);
  assert.throws(() => assertPolicy(hit(hdr({ network: "mainnet" })), policy({ network: "mainnet", mint: USDC, allowMainnet: true })), /mint mismatch/);
  assert.throws(() => assertPolicy(hit(hdr({ currency: USDC })), policy()), /mint mismatch/);
  assert.throws(() => assertPolicy(hit(hdr()), policy({ recipient: "" })), /no recipient/);
  assert.throws(() => assertPolicy(hit(hdr({ recipient: "22222222222222222222222222222222" })), policy()), /recipient mismatch/);
  assert.throws(() => assertPolicy(hit(hdr({ splits: [{ amount: "1" }] })), policy()), /splits/);
  assert.throws(() => assertPolicy(hit(hdr({ amount: "10001" })), policy()), /exceeds ceiling/);
  assert.doesNotThrow(() => assertPolicy(hit(hdr({ network: "mainnet", currency: USDC })), policy({ network: "mainnet", mint: USDC, allowMainnet: true })));
});

test("policyFromPrincipal is fail-closed on recipient", () => {
  const p = policyFromPrincipal({ network: "devnet", mint: USDC_DEVNET, spend_ceiling_raw: 0 });
  assert.equal(p.recipient, "");
  assert.throws(() => beforeSign([hdr()], p), /no recipient/);
});
