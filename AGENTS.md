# Working agreement for solana-mpp-payer

Public repo: `agent-default/solana-mpp-payer`. Package later, if needed:
`@agent-default/solana-mpp-payer`.

Keep all product code in this repository. Do not add an x402-only client,
facilitator, Bazaar wrapper, or a second payment rail.

- Guarded factory: `@solana/mpp/client` `solana.charge` (`expectedNetwork`,
  `maxAmount`). File signer stays `@solana/pay-kit`. Do not use
  `createPayKitClient().fetch()` as the guarded path (pay-kit#298).
- Treat every MPP challenge as hostile: allowlist network, USDC mint, and
  recipient; enforce the ceiling before creating or signing a transaction.
  Session pull is `clientVoucher` only; deposit is the process ceiling.
- Do not log private keys, full credentials, or raw signed transactions.
- Default `devnet` and ceiling `0`. Mainnet needs `ALLOW_MAINNET=1`.
- `LIVE_PAY=0` until an opt-in fixture exists.
- Run `npm test` before handoff. Network tests must be opt-in.
