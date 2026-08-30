import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPayKitClient } from "@solana/pay-kit/client";
import { init, loadSigner, USDC_DEVNET } from "./lib.js";
import { beforeSign } from "./policy.js";
import { chargeArgs, livePay, loadSolanaCharge, runCharge } from "./charge.js";

const RECIPIENT = "11111111111111111111111111111111";
function hdr({ amount = "10000", currency = USDC_DEVNET, recipient = RECIPIENT, network = "devnet" } = {}) {
  const request = { amount, currency, recipient, methodDetails: { network } };
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

test("livePay probes 402, refuses LIVE_PAY=0, and does not use pay-kit fetch", async () => {
  const url = "https://example.invalid/paid";
  await assert.rejects(livePay(url, policy, { env: { LIVE_PAY: "0" } }), /LIVE_PAY=0/);
  const rawFetch = async () =>
    new Response("payment_required", {
      status: 402,
      headers: { "WWW-Authenticate": hdr() },
    });
  const out = await livePay(url, policy, {
    env: { LIVE_PAY: "1" },
    rpcUrl: "https://example.invalid",
    signer: { pubkey: "x" },
    rawFetch,
    solanaCharge: (a) => a,
    complete: async () => 200,
  });
  assert.equal(out.status, 200);
  assert.equal(out.args.expectedNetwork, "devnet");
  assert.equal(out.args.maxAmount, 10000n);
  await assert.rejects(
    livePay(url, policy, {
      env: { LIVE_PAY: "1" },
      rpcUrl: "https://example.invalid",
      signer: { pubkey: "x" },
      rawFetch,
      solanaCharge: { fetch: async () => {} },
    }),
    /refuse createPayKitClient\(\)\.fetch/,
  );
});

test("livePay refuses a paid 402 that flips one field; the signer stays cold", async () => {
  const url = "https://example.invalid/paid";
  const { generateKeyPairSigner } = await import("@solana/kit");
  const inner = await generateKeyPairSigner();
  let signed = 0;
  // Proxy: the SDK assigns onto the signer during method setup; absorb that
  // and keep serving the counting spy.
  const signer = new Proxy({}, {
    get(_t, p) {
      if (p === "signTransactions") {
        return async (...a) => {
          signed++;
          return inner.signTransactions(...a);
        };
      }
      return inner[p];
    },
    set(_t, _p, _v) { return true; },
    has(_t, p) { return p in inner; },
  });
  for (const { paid, msg } of [
    { paid: { recipient: "22222222222222222222222222222222" }, msg: /recipient mismatch/ },
    { paid: { amount: "9000" }, msg: /paid challenge != probe seam/ },
  ]) {
    let calls = 0;
    signed = 0;
    const rawFetch = async () => {
      calls++;
      return new Response("payment_required", {
        status: 402,
        headers: { "WWW-Authenticate": calls === 1 ? hdr() : hdr(paid) },
      });
    };
    await assert.rejects(
      livePay(url, policy, {
        env: { LIVE_PAY: "1" },
        rpcUrl: "https://example.invalid",
        signer,
        rawFetch,
      }),
      msg,
    );
    assert.equal(signed, 0);
    assert.equal(calls, 2);
  }
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
