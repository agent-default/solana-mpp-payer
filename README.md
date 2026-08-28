# solana-mpp-payer

A headless process that pays native MPP `solana/charge` from Solana USDC
with a hard pre-sign spend ceiling.

## Status

`beforeSign` allowlists network, mint, recipient, and ceiling, then
`chargeArgs` produces `{ expectedNetwork, maxAmount }` for a low-level
`solana.charge` call.

`@solana/pay-kit/client` currently exports only `createPayKitClient().fetch()`,
which auto-pays and does not take those kwargs. This process refuses that
facade. Inject `solana.charge` (or an upstream `solana.charge` export) so
`runCharge` can pass `expectedNetwork` and `maxAmount`. `LIVE_PAY=1` is
still required.

Tracking the required client export: [pay-kit#298](https://github.com/solana-foundation/pay-kit/issues/298).

Default network is `devnet`. Ceiling starts at `0` (refuse all spends).
Mainnet requires `ALLOW_MAINNET=1`.

## Quickstart

```sh
npm ci
npm test
node src/main.js init
node src/main.js status
```

```sh
node src/main.js pick 'Payment id="x", realm="r", method="solana", intent="charge", request="<b64url>"'
```

`data/` is gitignored. The keystore is a 64-byte Solana JSON keypair, mode
`0600`. Do not commit keys or `.env`.

## Policy (refuse before sign)

- missing or mismatched recipient
- mint mismatch (devnet Circle USDC, not mainnet mint)
- network mismatch
- mainnet without `ALLOW_MAINNET=1`
- splits
- amount over ceiling

## License

MIT
