# Paid 402 must equal the probe seam

`440b0dd` is current. Deposit wrap + mutex + `min(cap, ceiling)` stand. Do not
revert. Do not treat this as a security boundary.

`livePay` / `liveSession` run `beforeSign` on the **probe** 402, then
`Mppx.fetch` / `fetchWithSession` takes a **second** challenge. The SDK only
forwards `expectedNetwork` and `maxAmount`. Recipient, mint, and splits are
not bound on that round. `@solana/mpp@0.7.0` `solana.charge` also only checks
amount + network. A seller can serve a clean first 402 and a different paid
one. Session wrap compares `payload.deposit` to the **first** seam, then the
opener is invoked with whatever challenge `createSessionFetch` fetched next.

Nothing compares a canonical tx to what was approved immediately before the
signature. Tests do not spy the signer after refusal. The throwaway proof
never produced a `transferChecked`.

Convenience-client auto-pay still has no ceiling. Do not claim this process cannot be bypassed.
Do not add a deprecation essay. Do not `LIVE_PAY` from GLM.

## Rules

1. **Canonicalize the probe.** After the first `beforeSign`, store
   `{ intent, recipient, mint, network, amount, splits, pullVoucherStrategy }`
   from `seam.hit` (amount = charge amount or session cap).

2. **Re-policy the paid 402.** Wrap `rawFetch` (or the fetch passed into
   `Mppx.create` / `createSessionFetch`) so a subsequent 402 is parsed with
   `wwwAuthenticate` + `pickSolana` + `assertPolicy` against the **same**
   `policy`. Then refuse unless those canonical fields equal the probe
   (bigint amount, no splits still, pull still `clientVoucher` only).
   Throw `paid challenge != probe seam; refuse before sign` **before**
   `solana.charge` / opener / sign.

3. **Do not replace the deposit wrap.** Function `payload.deposit` vs seam
   and object `opener.deposit` stay. This slice is identity of the **second
   402**, not another deposit parser.

4. **Signer is not called on refuse.** Tests inject a signer whose
   `signTransactions` / `signTransaction` (or the object you actually pass)
   increments a counter. A swapped paid 402 must throw **and** leave that
   counter at 0.

## Tests (shipped `livePay` / `liveSession`)

Probe 402 is the existing good header. Second response (via `rawFetch` call
count or a queue) is a 402 whose request changes **one** of: recipient, mint,
amount/cap, network. Must throw; `complete` / `sessionFetch.fetchWithSession`
/ signer must not succeed. Charge `maxAmount` kwargs remain the ceiling.

No RPC. No veto files. ≤150 LOC. `src/charge.js` + tests only unless a tiny
helper in `policy.js` is cleaner (`sameChallenge(probeHit, paidHit)`).

## Out of scope

Parsing the built Solana ix vs seam (still operator proof). Sweeping
`5KAdN4Sp…` / `5dsD3RAu…`. OpenRouter, Tempo, pay-kit `fetch()`, README
deprecation, `LIVE_PAY=1`.
