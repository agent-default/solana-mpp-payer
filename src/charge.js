import { beforeSign } from "./policy.js";

export function refuseFetchFacade(impl) {
  if (impl && typeof impl.fetch === "function") {
    throw new Error("refuse createPayKitClient().fetch()");
  }
}

/** Named factory: `@solana/mpp/client` `solana.charge` (pay-kit#298). Never pay-kit `fetch()`. */
export async function loadSolanaCharge(mod) {
  const m = mod ?? (await import("@solana/mpp/client"));
  refuseFetchFacade(m);
  refuseFetchFacade(m.default);
  const charge = m.solana?.charge ?? m.charge ?? m.default?.solana?.charge;
  if (typeof charge !== "function") {
    throw new Error("solana.charge not exported by @solana/mpp/client; refuse createPayKitClient().fetch()");
  }
  return charge;
}

/** Kwargs for inlined pay-kit `solana.charge`. Not `createPayKitClient().fetch()`. */
export function chargeArgs(seam, { rpcUrl, signer, broadcast = false } = {}) {
  if (seam?.expectedNetwork == null || seam.maxAmount == null) {
    throw new Error("beforeSign seam required; refuse before sign");
  }
  if (!rpcUrl) throw new Error("SOLANA_RPC_URL required; refuse before sign");
  if (!signer) throw new Error("signer required; refuse before sign");
  return {
    expectedNetwork: seam.expectedNetwork,
    maxAmount: seam.maxAmount,
    rpcUrl,
    signer,
    broadcast: broadcast === true,
  };
}

export function assertLivePay(env = process.env) {
  if (env.LIVE_PAY !== "1") throw new Error("LIVE_PAY=0; refuse before sign");
}

/** One in-process LIVE_PAY session. Held across the whole live flow, cleared in finally. */
let liveDepth = 0;
function acquireLive() {
  if (liveDepth > 0) throw new Error("LIVE_PAY already in flight; refuse before sign");
  liveDepth += 1;
}
function releaseLive() {
  liveDepth = Math.max(0, liveDepth - 1);
}

/** Named factory: `@solana/mpp/client` `solana.session` (metered escrow). Never pay-kit `fetch()`. */
export async function loadSolanaSession(mod) {
  const m = mod ?? (await import("@solana/mpp/client"));
  refuseFetchFacade(m);
  refuseFetchFacade(m.default);
  const session = m.solana?.session ?? m.session ?? m.default?.solana?.session;
  if (typeof session !== "function") {
    throw new Error("solana.session not exported by @solana/mpp/client; refuse createPayKitClient().fetch()");
  }
  return session;
}

/**
 * Session opener config. `deposit` is pinned to the ceiling seam, not the SDK
 * cap default. Pull is clientVoucher-only (assertPolicy). Default live opener
 * is createPaymentChannelSessionOpener.
 */
export function sessionOpen(seam, { rpcUrl, signer, expiresAt } = {}) {
  if (seam?.intent !== "session") throw new Error("session seam required; refuse before sign");
  if (seam.expectedNetwork == null || seam.maxAmount == null) {
    throw new Error("beforeSign seam required; refuse before sign");
  }
  if (!rpcUrl) throw new Error("SOLANA_RPC_URL required; refuse before sign");
  if (!signer) throw new Error("signer required; refuse before sign");
  const pull = (seam.hit?.request?.modes ?? []).includes("pull");
  return {
    mode: pull ? "pull" : "push",
    expectedNetwork: seam.expectedNetwork,
    deposit: seam.maxAmount,
    rpcUrl,
    signer,
    ...(expiresAt == null ? {} : { expiresAt }),
  };
}

/**
 * Policy, then session opener. Default: createPaymentChannelSessionOpener
 * (on-chain pull/clientVoucher). Inject sessionOpener in tests.
 */
export async function runSession(headers, policy, ctx = {}) {
  const seam = beforeSign(headers, policy);
  if (seam.intent !== "session") throw new Error("not a solana/session challenge; use runCharge");
  assertLivePay(ctx.env || process.env);
  refuseFetchFacade(ctx.sessionOpener);
  const held = ctx.liveHeld === true;
  if (!held) acquireLive();
  try {
    const open = sessionOpen(seam, ctx);
    const makeOpener =
      typeof ctx.sessionOpener === "function"
        ? ctx.sessionOpener
        : (await import("@solana/mpp/client")).createPaymentChannelSessionOpener;
    const opener = makeOpener({
      mode: open.mode,
      deposit: open.deposit,
      signer: open.signer,
      rpcUrl: open.rpcUrl,
    });
    if (opener?.deposit != null && BigInt(opener.deposit) !== seam.maxAmount) {
      throw new Error(`deposit ${opener.deposit} != seam ${seam.maxAmount}; refuse before sign`);
    }
    return { seam, open, opener };
  } finally {
    if (!held) releaseLive();
  }
}

/**
 * Policy, then `@solana/mpp/client` `solana.charge`. LIVE_PAY=0 still refuses.
 * Do not call the factory on the default path from tests.
 */
export async function runCharge(headers, policy, ctx = {}) {
  const seam = beforeSign(headers, policy);
  if (seam.intent === "session") {
    throw new Error("solana/session challenge: use runSession");
  }
  assertLivePay(ctx.env || process.env);
  refuseFetchFacade(ctx.solanaCharge);
  const args = chargeArgs(seam, ctx);
  const charge =
    typeof ctx.solanaCharge === "function"
      ? ctx.solanaCharge
      : await loadSolanaCharge(ctx.mppClient ?? ctx.payKitClient);
  return { seam, args, method: charge(args) };
}

function wwwAuthenticate(response) {
  const raw = response.headers.get("www-authenticate") || "";
  const parts = raw.split(/(?=Payment\s)/i).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error("402 missing WWW-Authenticate Payment; refuse before sign");
  return parts;
}

/**
 * Probe a seller, refuse before sign, then Mppx.fetch with the guarded method.
 * Not createPayKitClient().fetch(). Inject complete() in tests.
 */
export async function livePay(url, policy, ctx = {}) {
  if (!url) throw new Error("seller URL required; refuse before sign");
  assertLivePay(ctx.env || process.env);
  const rawFetch = ctx.rawFetch || fetch;
  const probe = await rawFetch(url);
  if (probe.status !== 402) throw new Error(`expected 402 from seller, got ${probe.status}; refuse before sign`);
  const out = await runCharge(wwwAuthenticate(probe), policy, ctx);
  if (typeof ctx.complete === "function") {
    return { ...out, status: await ctx.complete(url, out) };
  }
  const { Mppx } = await import("@solana/mpp/client");
  const mppx = Mppx.create({ methods: [out.method], polyfill: false });
  if (typeof mppx.fetch !== "function") throw new Error("Mppx.fetch missing; refuse before sign");
  const paid = await mppx.fetch(url);
  return { ...out, status: paid.status };
}

/**
 * Probe a session 402, refuse before sign, then createSessionFetch +
 * fetchWithSession. Not createPayKitClient().fetch(). Inject complete() in tests.
 */
export async function liveSession(url, policy, ctx = {}) {
  if (!url) throw new Error("seller URL required; refuse before sign");
  assertLivePay(ctx.env || process.env);
  acquireLive();
  try {
    return await liveSessionInner(url, policy, ctx);
  } finally {
    releaseLive();
  }
}

async function liveSessionInner(url, policy, ctx) {
  const rawFetch = ctx.rawFetch || fetch;
  const probe = await rawFetch(url);
  if (probe.status !== 402) throw new Error(`expected 402 from seller, got ${probe.status}; refuse before sign`);
  const out = await runSession(wwwAuthenticate(probe), policy, { ...ctx, liveHeld: true });
  if (BigInt(out.open.deposit) !== out.seam.maxAmount) {
    throw new Error(`deposit ${out.open.deposit} != seam ${out.seam.maxAmount}; refuse before sign`);
  }
  if (typeof ctx.complete === "function") {
    return { ...out, status: await ctx.complete(url, out) };
  }
  const makeFetch =
    typeof ctx.sessionFetch === "function"
      ? ctx.sessionFetch
      : (await import("@solana/mpp/client")).createSessionFetch;
  if (typeof makeFetch !== "function") throw new Error("createSessionFetch missing; refuse before sign");
  const client = makeFetch({ opener: out.opener, fetch: rawFetch });
  if (typeof client.fetchWithSession !== "function") {
    throw new Error("SessionFetchClient.fetchWithSession missing; refuse before sign");
  }
  const paid = await client.fetchWithSession(url);
  const meter = ctx.meter;
  if (Array.isArray(meter) && meter.length) {
    if (typeof client.recordCumulative !== "function" || typeof client.flush !== "function") {
      throw new Error("SessionFetchClient meter API missing; refuse before sign");
    }
    for (const n of meter) {
      client.recordCumulative(n, { force: true });
      await client.flush();
    }
  }
  return { ...out, status: paid.status, cumulative: client.cumulativeAmount };
}
