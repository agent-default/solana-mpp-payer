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
  // session carries `network` top-level; charge nests it under methodDetails.
  return normalizeNetwork(hit.request.network ?? hit.request.methodDetails?.network ?? "mainnet");
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

/** Gate immediately before pay-kit `solana.charge` / `solana.session` (not `createPayKitClient().fetch()`). */
export function assertPolicy(hit, policy) {
  if (hit.method !== "solana" || (hit.intent !== "charge" && hit.intent !== "session")) {
    throw new Error("not solana charge/session; refuse before sign");
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
  if ((hit.request.splits ?? hit.request.methodDetails?.splits)?.length) {
    throw new Error("splits refused before sign");
  }
  if (hit.intent === "session" && (hit.request.modes ?? []).includes("pull")) {
    if (hit.request.pullVoucherStrategy !== "clientVoucher") {
      throw new Error("pull-mode session requires pullVoucherStrategy=clientVoucher; refuse before sign");
    }
  }
  // charge: bound the one-shot amount. session: bound the escrow cap.
  checkSpend(hit.amount, policy.ceiling);
  // Session deposit is the leash itself: min(challenge cap, ceiling). Charge
  // keeps the ceiling as solana.charge maxAmount (kwargs unchanged).
  const maxAmount =
    hit.intent === "session"
      ? (hit.amount < policy.ceiling ? hit.amount : policy.ceiling)
      : policy.ceiling;
  return { expectedNetwork: policy.network, maxAmount, intent: hit.intent };
}

export function beforeSign(headers, policy) {
  const hit = pickSolana(headers);
  return { hit, ...assertPolicy(hit, policy) };
}

/** Canonical identity of a challenge hit, for probe-vs-paid comparison. */
export function challengeIdentity(hit) {
  return {
    intent: hit.intent,
    recipient: hit.request.recipient,
    mint: hit.request.currency,
    network: challengeNetwork(hit),
    amount: hit.amount, // charge amount or session cap, bigint
    splits: hit.request.splits ?? hit.request.methodDetails?.splits ?? [],
    pullVoucherStrategy: hit.request.pullVoucherStrategy ?? null,
  };
}

/** True only when the paid challenge is the challenge the probe seam approved. */
export function sameChallenge(probe, paid) {
  return (
    probe.intent === paid.intent &&
    probe.recipient === paid.recipient &&
    probe.mint === paid.mint &&
    probe.network === paid.network &&
    probe.amount === paid.amount &&
    (paid.splits?.length ?? 0) === 0 &&
    (paid.pullVoucherStrategy ?? null) === (probe.pullVoucherStrategy ?? null)
  );
}
