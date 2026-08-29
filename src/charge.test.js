import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPayKitClient } from "@solana/pay-kit/client";
import { init, loadSigner, USDC_DEVNET } from "./lib.js";
import { beforeSign } from "./policy.js";
import { chargeArgs, loadSolanaCharge, runCharge } from "./charge.js";

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
  await assert.rejects(
    runCharge([hdr()], policy, {
      env: { LIVE_PAY: "1" },
      rpcUrl: "https://example.invalid",
      signer: { pubkey: "x" },
      solanaCharge: { fetch: async () => {} },
    }),
    /refuse createPayKitClient\(\)\.fetch/,
  );
  const calls = [];
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

test("loadSolanaCharge uses @solana/mpp/client solana.charge and still refuses fetch", async () => {
  const stub = (a) => a;
  const loaded = await loadSolanaCharge({ solana: { charge: stub } });
  assert.equal(loaded, stub);
  const named = await loadSolanaCharge();
  assert.equal(typeof named, "function");
  assert.equal(typeof createPayKitClient, "function");
  await assert.rejects(loadSolanaCharge({ fetch: async () => {} }), /refuse createPayKitClient\(\)\.fetch/);
});

test("runCharge receives the protocol signer loaded from the ignored file key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mpp-charge-test-"));
  try {
    await init(dir);
    const signer = await loadSigner(dir);
    const out = await runCharge([hdr()], policy, {
      env: { LIVE_PAY: "1" },
      rpcUrl: "https://example.invalid",
      signer: signer.signer,
      solanaCharge: (args) => {
        assert.equal(args.signer, signer.signer);
        return "method";
      },
    });
    assert.equal(out.method, "method");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
