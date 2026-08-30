# solana-mpp-payer

A headless process that pays native MPP `solana/charge` from Solana USDC
with a hard pre-sign spend ceiling.

Not Link CLI. Not `createPayKitClient().fetch()`. The guarded factory is
`solana.charge` from [`@solana/mpp/client`](https://www.npmjs.com/package/@solana/mpp)
(`expectedNetwork`, `maxAmount`). `@solana/pay-kit` is the file Signer only.

## Status

Default network is `devnet`. `init` starts the ceiling at `0`. Set it with
`ceiling <raw-base-units>`. Mainnet requires `ALLOW_MAINNET=1`. `LIVE_PAY=0`
until an opt-in `pay` or `session`. This tree does not broadcast by default.

`solana/session` is gated (pull is `clientVoucher` only). The session deposit
is the leash itself — `min(challenge cap, ceiling)` — asserted on the seam and
re-checked against the built opener before sign. `LIVE_PAY` is single-flight:
a second overlapping session refuses before sign. See
[`docs/SESSION-DEPOSIT.md`](docs/SESSION-DEPOSIT.md).

First bounded live charge: [`docs/FIELD-REPORT.md`](docs/FIELD-REPORT.md).
Loopback seller: [`docs/DEVNET-FIXTURE.md`](docs/DEVNET-FIXTURE.md).

## Quickstart

```sh
npm ci
npm test
node src/main.js init
node src/main.js ceiling 10000
node src/main.js status
```

```sh
node src/main.js pick 'Payment id="x", realm="r", method="solana", intent="charge", request="<b64url>"'
node src/main.js charge '<WWW-Authenticate…>'
LIVE_PAY=1 node src/main.js pay http://127.0.0.1:4173/quote/AAPL
LIVE_PAY=1 node src/main.js session http://127.0.0.1:4173/session/AAPL
```

Fixture (localhost seller, one terminal):

```sh
MPP_FIXTURE_RECIPIENT="$RECIPIENT" node fixtures/devnet-seller.mjs
```

`data/` is gitignored. Keystore is a 64-byte Solana JSON keypair, mode `0600`.
Do not commit keys or `.env`.

## Policy (refuse before sign)

- missing or mismatched recipient
- mint mismatch (devnet Circle USDC, not mainnet mint)
- network mismatch
- mainnet without `ALLOW_MAINNET=1`
- splits
- amount / session cap over ceiling
- session pull unless `pullVoucherStrategy=clientVoucher`

## OpenRouter

The current MPP OpenRouter endpoint advertises **Tempo** charge/session, not
native `solana/charge`. This payer refuses it before signing. See
[`docs/OPENROUTER.md`](docs/OPENROUTER.md). A normal OpenRouter API-key request
is a different billing path.

## License

MIT
