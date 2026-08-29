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

/**
 * Policy, then `@solana/mpp/client` `solana.charge`. LIVE_PAY=0 still refuses.
 * Do not call the factory on the default path from tests.
 */
export async function runCharge(headers, policy, ctx = {}) {
  const seam = beforeSign(headers, policy);
  assertLivePay(ctx.env || process.env);
  refuseFetchFacade(ctx.solanaCharge);
  const args = chargeArgs(seam, ctx);
  const charge =
    typeof ctx.solanaCharge === "function"
      ? ctx.solanaCharge
      : await loadSolanaCharge(ctx.mppClient ?? ctx.payKitClient);
  return { seam, args, method: charge(args) };
}
