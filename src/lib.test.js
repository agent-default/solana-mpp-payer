import { test } from "node:test";
import assert from "node:assert/strict";
import { USDC, b58encode, checkSpend, pickSolana } from "./lib.js";

const req = Buffer.from(JSON.stringify({ amount: "10000", currency: USDC, recipient: "11111111111111111111111111111111" })).toString("base64url");
const sol = `Payment id="a", realm="r", method="solana", intent="charge", request="${req}"`;
const tempo = `Payment id="b", realm="r", method="tempo", intent="charge", request="${req}"`;

test("policy", () => {
  assert.equal(b58encode(new Uint8Array(32)), "11111111111111111111111111111111");
  assert.throws(() => checkSpend(1n, 0n));
  checkSpend(5n, 5n);
  assert.throws(() => checkSpend(6n, 5n));
  const hit = pickSolana([tempo, sol]);
  assert.equal(hit.method, "solana");
  assert.equal(hit.amount, 10000n);
  assert.throws(() => pickSolana([tempo]));
});
