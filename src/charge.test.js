import { test } from "node:test";
import assert from "node:assert/strict";
import { createPayKitClient } from "@solana/pay-kit/client";
import { USDC_DEVNET } from "./lib.js";
import { beforeSign } from "./policy.js";
import { chargeArgs, runCharge } from "./charge.js";

const RECIPIENT = "11111111111111111111111111111111";
function hdr() {
  const request = { amount: "10000", currency: USDC_DEVNET, recipient: RECIPIENT, methodDetails: { network: "devnet" } };
  return `Payment id="a", realm="r", method="solana", intent="charge", request="${Buffer.from(JSON.stringify(request)).toString("base64url")}"`;
}
const policy = { network: "devnet", mint: USDC_DEVNET, recipient: RECIPIENT, ceiling: 10000n, allowMainnet: false };

test("chargeArgs feeds beforeSign into solana.charge kwargs", () => {
  const seam = beforeSign([hdr()], policy);
  const args = chargeArgs(seam, { rpcUrl: "https://example.invalid", signer: { pubkey: "x" } });
  assert.equal(args.expectedNetwork, "devnet");
  assert.equal(args.maxAmount, 10000n);
  assert.equal(args.broadcast, false);
  assert.equal(typeof createPayKitClient, "function");
});

test("runCharge refuses live path and unrestricted fetch", async () => {
  await assert.rejects(runCharge([hdr()], policy, { env: { LIVE_PAY: "0" } }), /LIVE_PAY=0/);
  const calls = [];
  await assert.rejects(
    runCharge([hdr()], policy, { env: { LIVE_PAY: "1" }, rpcUrl: "https://example.invalid", signer: { pubkey: "x" } }),
    /refuse createPayKitClient\(\)\.fetch/,
  );
  const out = await runCharge([hdr()], policy, {
    env: { LIVE_PAY: "1" },
    rpcUrl: "https://example.invalid",
    signer: { pubkey: "x" },
    solanaCharge: (a) => {
      calls.push(a);
      return "method";
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedNetwork, "devnet");
  assert.equal(calls[0].maxAmount, 10000n);
  assert.equal(out.method, "method");
});
