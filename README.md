# solana-mpp-payer

A headless process that pays native MPP `solana/charge` from Solana USDC
with a hard pre-sign spend ceiling.

## Status

`beforeSign` allowlists network, mint, recipient, and ceiling, then
`chargeArgs` feeds `{ expectedNetwork, maxAmount }` into
`solana.charge` from [`@solana/mpp/client`](https://www.npmjs.com/package/@solana/mpp)
(the factory named on [pay-kit#298](https://github.com/solana-foundation/pay-kit/issues/298)).

`createPayKitClient().fetch()` is refused on the guarded path. It auto-pays
and cannot take those kwargs. `@solana/pay-kit` is used for the file Signer
only.

Default network is `devnet`. `init` starts the ceiling at `0` (refuse all
spends). Set it with `ceiling <raw-base-units>`. Mainnet requires
`ALLOW_MAINNET=1`. `LIVE_PAY=0` until an opt-in charge; this tree does not
broadcast by default.

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

## OpenRouter status

The current MPP OpenRouter endpoint advertises Tempo charge/session offers,
not native Solana `solana/charge`. This payer refuses it before signing; see
[`OPENROUTER.md`](docs/OPENROUTER.md). A normal OpenRouter API-key request is a
separate billing path.

## License

MIT
