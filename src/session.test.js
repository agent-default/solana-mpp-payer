import { test } from "node:test";
import assert from "node:assert/strict";
import { USDC, USDC_DEVNET } from "./lib.js";
import { liveSession, loadSolanaSession, runCharge, runSession, sessionOpen } from "./charge.js";
import { beforeSign } from "./policy.js";

const RECIPIENT = "11111111111111111111111111111111";
const policy = { network: "devnet", mint: USDC_DEVNET, recipient: RECIPIENT, ceiling: 10000n, allowMainnet: false };

function sessionHdr({ cap = "10000", currency = USDC_DEVNET, recipient = RECIPIENT, operator = RECIPIENT, network = "devnet", modes } = {}) {
  const request = { cap, currency, recipient, operator, network, ...(modes ? { modes } : {}) };
  return `Payment id="a", realm="r", method="solana", intent="session", request="${Buffer.from(JSON.stringify(request)).toString("base64url")}"`;
}
function chargeHdr() {
  const request = { amount: "10000", currency: USDC_DEVNET, recipient: RECIPIENT, methodDetails: { network: "devnet" } };
  return `Payment id="a", realm="r", method="solana", intent="charge", request="${Buffer.from(JSON.stringify(request)).toString("base64url")}"`;
}

test("sessionOpen pins the deposit to the ceiling seam and is push-mode", () => {
  const seam = beforeSign([sessionHdr({ cap: "9000" })], policy);
  const open = sessionOpen(seam, { rpcUrl: "https://example.invalid", signer: { pubkey: "x" } });
  assert.equal(open.mode, "push");
  assert.equal(open.expectedNetwork, "devnet");
  assert.equal(open.deposit, 10000n); // seam.maxAmount (ceiling), not the 9000 cap
});

test("sessionOpen refuses a non-session seam and missing rpc/signer", () => {
  assert.throws(() => sessionOpen({ intent: "charge", expectedNetwork: "devnet", maxAmount: 1n }, { rpcUrl: "x", signer: {} }), /session seam required/);
  const seam = beforeSign([sessionHdr()], policy);
  assert.throws(() => sessionOpen(seam, { signer: {} }), /SOLANA_RPC_URL required/);
  assert.throws(() => sessionOpen(seam, { rpcUrl: "x" }), /signer required/);
});

test("runSession gates LIVE_PAY, refuses the fetch facade, and builds the opener", async () => {
  await assert.rejects(runSession([sessionHdr()], policy, { env: { LIVE_PAY: "0" } }), /LIVE_PAY=0/);
  await assert.rejects(
    runSession([sessionHdr()], policy, {
      env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" },
      sessionOpener: { fetch: async () => {} },
    }),
    /refuse createPayKitClient\(\)\.fetch/,
  );
  const calls = [];
  const out = await runSession([sessionHdr()], policy, {
    env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" },
    sessionOpener: (cfg) => { calls.push(cfg); return "opener-fn"; },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].mode, "push");
  assert.equal(calls[0].deposit, 10000n);
  assert.equal(out.opener, "opener-fn");
  assert.equal(out.seam.intent, "session");
  assert.equal(out.open.deposit, 10000n);
});

test("runSession refuses a charge challenge; runCharge refuses a session challenge", async () => {
  await assert.rejects(
    runSession([chargeHdr()], policy, { env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: {} }),
    /use runCharge/,
  );
  await assert.rejects(
    runCharge([sessionHdr()], policy, { env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: {} }),
    /use runSession/,
  );
});

test("liveSession probes 402, refuses LIVE_PAY=0, and drives via injected complete", async () => {
  const url = "https://example.invalid/session";
  await assert.rejects(liveSession(url, policy, { env: { LIVE_PAY: "0" } }), /LIVE_PAY=0/);
  const rawFetch = async () =>
    new Response("payment_required", { status: 402, headers: { "WWW-Authenticate": sessionHdr() } });
  const out = await liveSession(url, policy, {
    env: { LIVE_PAY: "1" },
    rpcUrl: "https://example.invalid",
    signer: { pubkey: "x" },
    rawFetch,
    sessionOpener: () => async () => ({ payload: { action: "open" }, session: {} }),
    complete: async (_u, built) => {
      assert.equal(built.seam.intent, "session");
      assert.equal(built.open.deposit, 10000n);
      assert.equal(built.open.mode, "push");
      return 200;
    },
  });
  assert.equal(out.status, 200);
  assert.equal(out.seam.intent, "session");
});

test("loadSolanaSession resolves the named factory and refuses the fetch facade", async () => {
  const stub = (a) => a;
  assert.equal(await loadSolanaSession({ solana: { session: stub } }), stub);
  assert.equal(typeof (await loadSolanaSession()), "function");
  assert.equal(typeof USDC, "string");
  await assert.rejects(loadSolanaSession({ fetch: async () => {} }), /refuse createPayKitClient\(\)\.fetch/);
});
