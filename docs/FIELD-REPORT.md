# Solana MPP field report

Status: run — chain-verified. Behavioral fields marked *(pending)* need
first-hand confirmation from the session that executed the run; everything
else here is reconstructed from the on-chain transaction and the repo.

This is the record for the first bounded live payment. Keep it factual and
redact secrets. Do not paste private keys, RPC API keys, raw signed
transactions, or customer/request bodies.

## Run metadata

- Date/time (UTC): 2026-08-29 03:18:58 (block time, slot 489693367)
- Git commit: `cbfe235` (`fixtures/devnet-seller.mjs` + `docs/DEVNET-FIXTURE.md`; committed 03:21:32Z, ~3 min after the run — the fixture code was used just before it landed)
- Package versions: `@solana/mpp@0.7.0`, `@solana/pay-kit` (from `package-lock.json`); exact `npm ls` at run time *(pending)*
- Network: `devnet`
- RPC provider (name only): public `api.devnet.solana.com` (payer + fixture default) unless `SOLANA_RPC_URL` was set *(pending)*
- Seller URL/route: `http://127.0.0.1:4173/quote/AAPL` (loopback fixture, its only paid route)
- Process pubkey: `A83BZ6GVTeW3fVMJHp4WeB9NH22NMQ9VQzz6p35SXNoB`
- Ceiling before payment (USDC base units): `10000` (persisted `spend_ceiling_raw`)

## Challenge observed

- HTTP status: `402` (fixture returns 402 on every unpaid request)
- Challenge method: `solana`
- Intent: `charge`
- Currency/mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle devnet USDC)
- Amount (base units): `10000` (0.01 USDC) — exactly the ceiling
- Recipient: dest ATA `TsVhXp5vA3oyn9Wx5NwmKcSg9rqy4pg6jerczBmD4pj`, owner `AoPAum8bHLBE2fioYRRxCCMkXqTovyQPUTu6ndbPrpWC`
- Expiry/resource binding checked: handled by `@solana/mpp/client`; not chain-visible *(pending)*
- Why native Solana MPP rather than x402 or Stripe SPT: `WWW-Authenticate: Payment … method="solana", intent="charge"` with a Solana SPL-token `transferChecked` settlement on devnet; no x402 `402` JSON envelope, no Stripe rail. Fixture is `@solana/mpp/server`.

## Result

- Policy decision: allowed — `assertPolicy` passed (network `devnet` = policy, mint match, recipient allowlisted via `MPP_RECIPIENT`, amount `10000` == ceiling so `checkSpend` passes)
- Signed or refused before sign: signed and broadcast — principal `A83BZ6GV…` sole signer; instructions ComputeBudget ×2 + Token `transferChecked`; `err: None`
- Retry status: `200` with receipt body expected from the fixture (`result.withReceipt(...)`) *(pending confirm)*
- Receipt status: `@solana/mpp/client` receipt; not chain-visible *(pending)*
- Transaction signature: `4oyrb4bpwxbz2ekNEZPziDeEWaxr4z8rkzRtYdNzkvkkxR1ZESkgm3fb3amc6ekKi66QprLBpJWhaTn3C4Atf9q7`
- Amount charged: `10000` base units (0.01 USDC)
- Ceiling after payment: `10000` (policy value unchanged; principal USDC balance 1.00 → 0.99)
- Restart preserved pubkey and ceiling: *(pending — not recorded)*
- Second over-ceiling attempt refused before sign: *(pending — not recorded; unit-tested via `assertPolicy` `amount "10001"` → `exceeds ceiling`)*

## Notes and next action

- Failure mode or surprising behavior: none on-chain (`err: None`). Latent bug in `a08be1d` `livePay` (`refuseFetchFacade(mppx)` always threw, killing the real path) was fixed in this same commit `cbfe235`.
- Upstream issue/spec link: pay-kit#298 (client factory), `mpp.dev/payment-methods/solana/charge`
- Decision: proceed — first guarded devnet charge landed at exactly the ceiling. `docs/DEVNET-FIXTURE.md` says exactly one; no further charge without explicit operator go.
