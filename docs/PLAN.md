# Build plan

## Outcome

Make this process a competent Solana principal on the MPP HTTP path: it can
inspect a 402 challenge, refuse anything outside policy before signing, pay a
real Solana MPP charge once, print the receipt, restart, and refuse a second
payment beyond its ceiling.

## Milestones

1. **Policy seam** — landed in `src/policy.js`: `beforeSign` allowlists
   network/mint/recipient/ceiling and returns `{expectedNetwork, maxAmount}`
   for pay-kit `solana.charge`. Splits and missing recipient fail closed.
2. **Signer seam** — load the ignored standard Solana keypair through
   `@solana/pay-kit`/`@solana/kit`; expose only the public key in status.
3. **Charge client** — use the official Solana MPP client, not a hand-rolled
   transaction format; attach the credential and retry the original request.
   Do not wire `createPayKitClient().fetch()` directly as the guarded path: its
   convenience facade auto-pays MPP challenges but does not expose this
   process's amount/network/recipient ceiling. Put policy immediately before
   the SDK signing call and confirm the current low-level export surface first.
4. **Receipt + restart** — persist only safe audit state, reload the same
   principal, and prove a second spend is refused after process death.
5. **Live field report** — opt-in devnet/localnet first, then one carefully
   bounded mainnet payment only when a known seller and operator-approved
   ceiling exist. Record the raw challenge, selected method, receipt fields,
   and failure mode without recording secrets.
6. **Inference path** — evaluate Solana MPP `session` for token-metered
   inference after `charge` is proven. A session deposit/channel cap is a
   different control from the process-level ceiling; enforce both.

## Acceptance test for the first real pay

- The seller returns `402` with a `WWW-Authenticate: Payment` challenge.
- The selected method is native `solana`, intent `charge`.
- The challenge is bound to the requested resource and validated before sign.
- Network, USDC mint, recipient, amount, and optional splits match policy.
- The amount is within the remaining ceiling; otherwise no signature exists.
- The retry succeeds and the receipt/transaction signature is printed.
- Killing and restarting preserves the same pubkey and remaining ceiling.
- A second payment that would exceed the ceiling is refused before sign.

OpenRouter is a target integration, not a hard-coded assumption. The client
should be ready for it, but support is only declared after its live challenge
and receipt are observed.
