import { beforeSign } from "./policy.js";

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
  const args = chargeArgs(seam, ctx);
  const charge = ctx.solanaCharge;
  if (typeof charge !== "function") {
    throw new Error("solana.charge not exported by @solana/pay-kit/client; refuse createPayKitClient().fetch()");
  }
  return { seam, args, method: charge(args) };
}
