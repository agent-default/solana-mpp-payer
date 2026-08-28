import { checkSpend, mintFor, pickSolana } from "./lib.js";

export function normalizeNetwork(network) {
  const n = String(network || "mainnet").toLowerCase();
  if (n === "mainnet-beta" || n === "mainnet" || n.startsWith("solana:5eykt4")) return "mainnet";
  if (n === "devnet" || n.startsWith("solana:etwtr")) return "devnet";
  if (n === "testnet") return "testnet";
  if (n === "localnet" || n === "localhost") return "localnet";
  throw new Error(`unsupported network ${network}; refuse before sign`);
}

export function challengeNetwork(hit) {
  return normalizeNetwork(hit.request.methodDetails?.network ?? "mainnet");
}

export function policyFromPrincipal(p, extra = {}) {
  const network = normalizeNetwork(p.network);
  return {
    network,
    mint: p.mint || mintFor(network),
    recipient: extra.recipient || p.recipient || "",
    ceiling: BigInt(p.spend_ceiling_raw),
    allowMainnet: extra.allowMainnet === true,
  };
}

/** Gate immediately before pay-kit `solana.charge` (not `createPayKitClient().fetch()`). */
export function assertPolicy(hit, policy) {
  if (hit.method !== "solana" || hit.intent !== "charge") {
    throw new Error("not solana/charge; refuse before sign");
  }
  const network = challengeNetwork(hit);
  if (network === "mainnet" && !policy.allowMainnet) {
    throw new Error("mainnet refused; ALLOW_MAINNET=1 required");
  }
  if (network !== policy.network) {
    throw new Error(`network ${network} != policy ${policy.network}; refuse before sign`);
  }
  if (hit.request.currency !== policy.mint) {
    throw new Error("mint mismatch; refuse before sign");
  }
  if (!policy.recipient) throw new Error("no recipient allowlisted; refuse before sign");
  if (hit.request.recipient !== policy.recipient) {
    throw new Error("recipient mismatch; refuse before sign");
  }
  if (hit.request.methodDetails?.splits?.length) {
    throw new Error("splits refused before sign");
  }
  checkSpend(hit.amount, policy.ceiling);
  return { expectedNetwork: policy.network, maxAmount: policy.ceiling };
}

export function beforeSign(headers, policy) {
  const hit = pickSolana(headers);
  return { hit, ...assertPolicy(hit, policy) };
}
