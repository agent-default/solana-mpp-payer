# Session deposit must equal the leash

Incident (devnet, 2026-08-29): one `LIVE_PAY=1` pull/`clientVoucher` loopback
reported `deposit 10000` while the principal ATA lost **40000** raw Circle
USDC. Chain shows **two** `transferChecked` of **20000** into two channel
token accounts (`3fAJMnk6…`, `4tR1erEP…`), ~30s apart. Merchant ATA stayed 0
(escrow, not a merchant credit). Charge `4oyrb4bp…` (10000 raw) is unrelated
and held the ceiling.

`checkSpend` only sees the 402 JSON. It never sees the instruction amount.
`sessionOpen` sets `deposit: seam.maxAmount` and `assertPolicy` sets
`maxAmount: policy.ceiling` (not `min(cap, ceiling)`). The SDK builds
`deposit = parameters.deposit ?? request.cap`. Observed ix amount was **2×**
the seam. A second open is either a second process or a second client open;
`LIVE_PAY` has no mutex.

This is a **leash bug**, not a docs miss. Do not run another live session
until the tests below pass. Do not add Tempo/OpenRouter/x402. Do not use
`createPayKitClient().fetch()`.

## Rules

1. **Deposit = `min(challenge cap, ceiling)`.** After `checkSpend(cap, ceiling)`,
   `assertPolicy` must return `maxAmount: min(hit.amount, policy.ceiling)`
   (same bigint). `sessionOpen.deposit` is that value, never a second copy of
   the ceiling and never the raw cap if cap > ceiling (that path already
   throws). Charge `maxAmount` stays the ceiling for `solana.charge` kwargs
   (unchanged).

2. **Refuse if the built open does not match.**
   `createPaymentChannelSessionOpener` returns a **function**, not `{ deposit }`.
   The live SDK shape is:

   `async ({ challenge }) => { const open = await buildOpenPaymentChannelTransaction(…); return { payload: session.openPaymentChannelAction({ deposit: open.deposit, … }), session, source }; }`

   Keep the existing object-opener guard (`opener?.deposit != null`). Do not
   loosen it. **Both shapes refuse:**
   - object `{ deposit: "20000" }` (already in `3bfbe0f`)
   - async function returning `{ payload: { deposit: "20000" } }` (this wrap)

   Put the wrap **inside `liveSessionInner` before `fetchWithSession`**: await
   `opener({ challenge })` (or equivalent), refuse if
   `BigInt(result.payload?.deposit ?? result.session?.deposit ?? "") !== seam.maxAmount`.
   Throw `deposit … != seam …; refuse before sign`. Do not broadcast a mismatch.
   Mutex: still `acquireLive` / `releaseLive` in `finally` exactly as shipped;
   `liveHeld` still avoids self-deadlock. Do not move the mutex.

   The object stub alone does **not** cover the live SDK.

3. **One in-process live session.** Module-level mutex: a second
   `liveSession`/`runSession` with `LIVE_PAY=1` while one is in flight throws
   `LIVE_PAY already in flight; refuse before sign`. Clear in `finally`.
   Tests inject; they must not deadlock.

4. **Pull stays `clientVoucher` only.** `operatedVoucher` and bare pull still
   refuse. No push-channel opener exists in `@solana/mpp@0.7.0`; do not fake
   one.

## Tests (must drive shipped functions)

- `assertPolicy` on a session with `cap=9000`, ceiling `10000` →
  `maxAmount === 9000n`. `cap=10000` → `10000n`. `cap=10001` still throws.
- `sessionOpen` deposit equals that `maxAmount` for pull+`clientVoucher`.
- Keep the `3bfbe0f` object stub `{ deposit: "20000" }` — still throws.
- **Also** `liveSession` / `runSession` with an **async function** stub that
  returns `{ payload: { deposit: "20000" } }` against a mismatched seam
  **throws** (do not call through to fetch).
- Happy path: function stub returns `{ payload: { deposit } }` matching
  `min(cap, ceiling)`; does not throw.
- Two overlapping `liveSession(..., { env: { LIVE_PAY: "1" }, complete })`
  calls: the second throws in-flight. Use a hanging `complete` then resolve.

No live RPC in `npm test`. No hardcoded tx signatures as pass criteria.

## One throwaway proof (operator, after wrap tests)

Only after Grok says the **function-opener** tests are the real path **and**
the fixture advertises a signer it actually holds (`openTxSubmitter=server`,
ephemeral operator — see `docs/DEVNET-FIXTURE.md`). The 2026-08-30 shot
returned HTTP 200 / CLI `deposit 10000` with **no** new `transferChecked`:
the 402 named the payer as operator and the seller held no key. Do not run
another live session until that fixture ships. Then:

1. New recipient ATA, `--url devnet`.
2. One seller (`MPP_FIXTURE_RECIPIENT` only). Operator is an **ephemeral
   in-memory signer** the fixture generates at boot (`openTxSubmitter=server`).
   Do **not** set `MPP_FIXTURE_OPERATOR` to the payer pubkey.
3. **One** `LIVE_PAY=1` `node src/main.js session` (no `MPP_SESSION_METER`).
4. Stop. Read the single new `transferChecked` into the channel ATA.
   Amount **must** equal `min(cap, ceiling)` (10000 with current principal).
5. If it is not, revert the live opener to injected-only / ephemeral and
   do not ship.

Do not run this proof from a second window. Do not meter 100/200/300 on the
proof shot (that was the protocol test; this shot is deposit identity).

## Out of scope

OpenRouter, Tempo, AgentCash, intel bounce, veto/cosign, `ALLOW_MAINNET`,
closing or sweeping existing channel ATAs from the incident (`5KAdN4Sp…`,
`5dsD3RAu…`). Those leftover 15000-raw accounts are operator cleanup later.
