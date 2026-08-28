import { beforeSign } from "./policy.js";

export function refuseFetchFacade(impl) {
  if (impl && typeof impl.fetch === "function") {
    throw new Error("refuse createPayKitClient().fetch()");
  }
}

/** Use an injected or upstream `solana.charge`. Never the auto-pay fetch client. */
export async function loadSolanaCharge(mod) {
  const m = mod ?? (await import("@solana/pay-kit/client"));
  refuseFetchFacade(m);
  refuseFetchFacade(m.default);
  const charge = m.solana?.charge ?? m.charge ?? m.default?.solana?.charge;
  if (typeof charge !== "function") {
    throw new Error("solana.charge not exported by @solana/pay-kit/client; refuse createPayKitClient().fetch()");
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

/**
 * Policy, then low-level charge. `@solana/pay-kit/client` only exports
 * unrestricted `fetch()` — inject `solanaCharge` until that export exists.
 */
export async function runCharge(headers, policy, ctx = {}) {
  const seam = beforeSign(headers, policy);
  assertLivePay(ctx.env || process.env);
  refuseFetchFacade(ctx.solanaCharge);
  const args = chargeArgs(seam, ctx);
  const charge = typeof ctx.solanaCharge === "function" ? ctx.solanaCharge : await loadSolanaCharge(ctx.payKitClient);
  return { seam, args, method: charge(args) };
}
