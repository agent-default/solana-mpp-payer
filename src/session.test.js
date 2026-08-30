import { test } from "node:test";
import assert from "node:assert/strict";
import { USDC, USDC_DEVNET } from "./lib.js";
import { liveSession, loadSolanaSession, runCharge, runSession, sessionOpen } from "./charge.js";
import { beforeSign } from "./policy.js";

const RECIPIENT = "11111111111111111111111111111111";
const policy = { network: "devnet", mint: USDC_DEVNET, recipient: RECIPIENT, ceiling: 10000n, allowMainnet: false };

function sessionHdr({ cap = "10000", currency = USDC_DEVNET, recipient = RECIPIENT, operator = RECIPIENT, network = "devnet", modes, pullVoucherStrategy } = {}) {
  const request = {
    cap, currency, recipient, operator, network,
    ...(modes ? { modes } : {}),
    ...(pullVoucherStrategy ? { pullVoucherStrategy } : {}),
  };
  return `Payment id="a", realm="r", method="solana", intent="session", request="${Buffer.from(JSON.stringify(request)).toString("base64url")}"`;
}
function chargeHdr() {
  const request = { amount: "10000", currency: USDC_DEVNET, recipient: RECIPIENT, methodDetails: { network: "devnet" } };
  return `Payment id="a", realm="r", method="solana", intent="charge", request="${Buffer.from(JSON.stringify(request)).toString("base64url")}"`;
}

test("sessionOpen pins the deposit to min(cap, ceiling) and is push-mode", () => {
  const seam = beforeSign([sessionHdr({ cap: "9000" })], policy);
  const open = sessionOpen(seam, { rpcUrl: "https://example.invalid", signer: { pubkey: "x" } });
  assert.equal(open.mode, "push");
  assert.equal(open.expectedNetwork, "devnet");
  assert.equal(open.deposit, 9000n); // seam.maxAmount = min(cap 9000, ceiling 10000)
  const seamAtCap = beforeSign([sessionHdr({ cap: "10000" })], policy);
  assert.equal(sessionOpen(seamAtCap, { rpcUrl: "x", signer: { pubkey: "x" } }).deposit, 10000n);
});

test("sessionOpen is pull when the challenge is clientVoucher pull", () => {
  const seam = beforeSign(
    [sessionHdr({ cap: "9000", modes: ["pull"], pullVoucherStrategy: "clientVoucher" })],
    policy,
  );
  const open = sessionOpen(seam, { rpcUrl: "https://example.invalid", signer: { pubkey: "x" } });
  assert.equal(open.mode, "pull");
  assert.equal(open.deposit, 9000n); // the seam, not a second copy of the ceiling
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

test("liveSession meters cumulative amounts through SessionFetchClient", async () => {
  const url = "https://example.invalid/session";
  const recorded = [];
  const rawFetch = async () =>
    new Response("payment_required", { status: 402, headers: { "WWW-Authenticate": sessionHdr() } });
  const out = await liveSession(url, policy, {
    env: { LIVE_PAY: "1" },
    rpcUrl: "https://example.invalid",
    signer: { pubkey: "x" },
    rawFetch,
    sessionOpener: () => async () => ({ payload: { action: "open" }, session: {} }),
    meter: [100n, 200n, 300n],
    sessionFetch: () => ({
      fetchWithSession: async () => new Response("ok", { status: 200 }),
      recordCumulative: (n, o) => recorded.push([n, o?.force === true]),
      flush: async () => null,
      get cumulativeAmount() {
        return String(recorded.at(-1)?.[0] ?? 0);
      },
    }),
  });
  assert.deepEqual(recorded, [[100n, true], [200n, true], [300n, true]]);
  assert.equal(out.status, 200);
  assert.equal(out.cumulative, "300");
});

test("loadSolanaSession resolves the named factory and refuses the fetch facade", async () => {
  const stub = (a) => a;
  assert.equal(await loadSolanaSession({ solana: { session: stub } }), stub);
  assert.equal(typeof (await loadSolanaSession()), "function");
  assert.equal(typeof USDC, "string");
  await assert.rejects(loadSolanaSession({ fetch: async () => {} }), /refuse createPayKitClient\(\)\.fetch/);
});

test("assertPolicy bounds a session seam by min(cap, ceiling); over-cap still throws", () => {
  assert.equal(beforeSign([sessionHdr({ cap: "9000" })], policy).maxAmount, 9000n);
  assert.equal(beforeSign([sessionHdr({ cap: "10000" })], policy).maxAmount, 10000n);
  assert.throws(() => beforeSign([sessionHdr({ cap: "10001" })], policy), /exceeds ceiling/);
  // charge kwargs keep the ceiling as maxAmount (unchanged path).
  assert.equal(beforeSign([chargeHdr()], policy).maxAmount, 10000n);
});

test("runSession refuses a stub opener whose built deposit misses the seam", async () => {
  await assert.rejects(
    runSession([sessionHdr({ cap: "9000" })], policy, {
      env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" },
      sessionOpener: (cfg) => ({ deposit: "20000", mode: cfg.mode }), // SDK cap fallback shape
    }),
    /deposit 20000 != seam 9000; refuse before sign/,
  );
});

test("liveSession refuses a function opener whose built payload deposit misses the seam", async () => {
  const url = "https://example.invalid/session";
  const rawFetch = async () =>
    new Response("payment_required", { status: 402, headers: { "WWW-Authenticate": sessionHdr() } });
  let reachedFetch = false;
  await assert.rejects(
    liveSession(url, policy, {
      env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" }, rawFetch,
      sessionOpener: () => async () => ({ payload: { deposit: "20000" }, session: {} }),
      sessionFetch: (cfg) => ({
        fetchWithSession: async () => {
          await cfg.opener({ challenge: {} }); // SDK invokes the opener before sign
          reachedFetch = true;
          return new Response("ok", { status: 200 });
        },
      }),
    }),
    /deposit 20000 != seam 10000; refuse before sign/,
  );
  assert.equal(reachedFetch, false); // refused before the fetch could complete
});

test("liveSession accepts a function opener whose payload deposit matches the seam", async () => {
  const url = "https://example.invalid/session";
  const rawFetch = async () =>
    new Response("payment_required", { status: 402, headers: { "WWW-Authenticate": sessionHdr() } });
  const out = await liveSession(url, policy, {
    env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" }, rawFetch,
    sessionOpener: () => async () => ({ payload: { deposit: "10000" }, session: {} }),
    sessionFetch: (cfg) => ({
      fetchWithSession: async () => {
        await cfg.opener({ challenge: {} });
        return new Response("ok", { status: 200 });
      },
    }),
  });
  assert.equal(out.status, 200);
});

test("liveSession refuses a paid 402 that flips one identity field; opener and signer stay cold", async () => {
  const url = "https://example.invalid/session";
  const OTHER = "22222222222222222222222222222222";
  const flips = [
    { over: { recipient: OTHER }, msg: /recipient mismatch/ },
    { over: { currency: USDC }, msg: /mint mismatch/ },
    { over: { network: "mainnet" }, msg: /mainnet refused/ },
    { over: { cap: "9000" }, msg: /paid challenge != probe seam; refuse before sign/ }, // within ceiling, identity catch
    { over: { pullVoucherStrategy: "operatedVoucher" }, msg: /paid challenge != probe seam/ },
  ];
  for (const { over, msg } of flips) {
    let calls = 0;
    let signed = 0;
    let opened = 0;
    const rawFetch = async () => {
      calls++;
      return new Response("payment_required", {
        status: 402,
        headers: { "WWW-Authenticate": sessionHdr(calls === 1 ? {} : { ...over }) },
      });
    };
    await assert.rejects(
      liveSession(url, policy, {
        env: { LIVE_PAY: "1" }, rpcUrl: "x",
        signer: { pubkey: "x", signTransactions: () => { signed++; } },
        rawFetch,
        sessionOpener: () => async () => {
          opened++;
          return {};
        },
        sessionFetch: (cfg) => ({
          fetchWithSession: async () => cfg.fetch(url),
        }),
      }),
      msg,
    );
    assert.equal(signed, 0, `signer called after refuse: ${JSON.stringify(over)}`);
    assert.equal(opened, 0, `opener invoked after refuse: ${JSON.stringify(over)}`);
  }
});

test("liveSession accepts a paid 402 identical to the probe seam", async () => {
  const url = "https://example.invalid/session";
  let calls = 0;
  const rawFetch = async () => {
    calls++;
    return new Response("payment_required", {
      status: 402,
      headers: { "WWW-Authenticate": sessionHdr() },
    });
  };
  const out = await liveSession(url, policy, {
    env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" }, rawFetch,
    sessionOpener: () => async () => ({ payload: { deposit: "10000" }, session: {} }),
    sessionFetch: (cfg) => ({
      fetchWithSession: async () => {
        await cfg.fetch(url); // SDK round: same challenge again
        await cfg.opener({ challenge: {} });
        return new Response("ok", { status: 200 });
      },
    }),
  });
  assert.equal(calls, 2);
  assert.equal(out.status, 200);
});

test("liveSession refuses a function opener whose result is missing a deposit", async () => {
  const url = "https://example.invalid/session";
  const rawFetch = async () =>
    new Response("payment_required", { status: 402, headers: { "WWW-Authenticate": sessionHdr() } });
  await assert.rejects(
    liveSession(url, policy, {
      env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" }, rawFetch,
      sessionOpener: () => async () => ({ payload: { action: "open" }, session: {} }),
      sessionFetch: (cfg) => ({
        fetchWithSession: async () => {
          await cfg.opener({ challenge: {} });
          return new Response("ok", { status: 200 });
        },
      }),
    }),
    /opener result missing deposit; refuse before sign/,
  );
});

test("two overlapping liveSession calls refuse; the in-flight one completes", async () => {
  const url = "https://example.invalid/session";
  const rawFetch = async () =>
    new Response("payment_required", { status: 402, headers: { "WWW-Authenticate": sessionHdr() } });
  let release;
  const gate = new Promise((r) => { release = r; });
  const first = liveSession(url, policy, {
    env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" }, rawFetch,
    sessionOpener: () => async () => ({ payload: { action: "open" }, session: {} }),
    complete: async () => { await gate; return 200; },
  });
  await assert.rejects(
    liveSession(url, policy, { env: { LIVE_PAY: "1" }, rawFetch }),
    /LIVE_PAY already in flight; refuse before sign/,
  );
  release();
  assert.equal((await first).status, 200);
  // mutex cleared in finally: the next session may open
  const out = await liveSession(url, policy, {
    env: { LIVE_PAY: "1" }, rpcUrl: "x", signer: { pubkey: "x" }, rawFetch,
    sessionOpener: () => async () => ({}),
    complete: async () => 200,
  });
  assert.equal(out.status, 200);
});
