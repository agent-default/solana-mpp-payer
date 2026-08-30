# Devnet loopback fixture

This fixture is an opt-in, localhost-only seller for one real Circle USDC
`solana/charge` on Solana devnet. It is not AgentCash, x402, Surfpool, or a
production seller.

The fixture requires a recipient whose Circle-USDC associated token account
already exists. Create that ATA before starting the seller; the primary MPP
client charge intentionally does not create a recipient ATA.

```sh
cd /home/twzrd/mpp
FIXTURE_TMP=$(mktemp -d -p /tmp mpp-seller.XXXXXX)
chmod 700 "$FIXTURE_TMP"
solana-keygen new --no-bip39-passphrase --silent --outfile "$FIXTURE_TMP/recipient.json"
chmod 600 "$FIXTURE_TMP/recipient.json"
RECIPIENT=$(solana-keygen pubkey "$FIXTURE_TMP/recipient.json")
```

The recipient private key is not used by the seller and must not be committed
or sent anywhere. Create its ATA, paying rent from the MPP principal:

```sh
spl-token create-account \
  4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
  --owner "$RECIPIENT" \
  --fee-payer data/keystore/id.json \
  --url devnet
```

Start the fixture in one terminal:

```sh
MPP_FIXTURE_RECIPIENT="$RECIPIENT" \
node fixtures/devnet-seller.mjs
```

Session 402s must advertise an **ephemeral operator** generated at boot
(in-memory signer, never disk, never the payer keystore). Do not set
`MPP_FIXTURE_OPERATOR` to the payer pubkey — that was the proof failure:
the 402 named the payer as operator while the seller held no key, so the
partially signed open never broadcast.

The fixture sets `openTxSubmitter: 'server'` and
`paymentChannelPayerSigner` to that ephemeral signer so
`/session/AAPL` (and `/__402/session/*`) co-sign + broadcast the open.
READY log may print `operator=<pubkey>` only. Fail boot if the operator
cannot pay rent/fees (devnet airdrop or pre-funded SOL on that pubkey).

In another terminal, confirm the unpaid native MPP challenge:

```sh
curl -i http://127.0.0.1:4173/quote/AAPL
```

It must advertise `method="solana"`, `intent="charge"`, network `devnet`,
Circle mint `4zMMC9…`, and amount `10000`. `GET /session/AAPL` is the
push-only `solana/session` 402 (`cap` 10000). Then run exactly one guarded
charge; a session open is a separate increment (`node src/main.js session`):

```sh
LIVE_PAY=1 \
MPP_RECIPIENT="$RECIPIENT" \
node src/main.js pay http://127.0.0.1:4173/quote/AAPL
```

The payer still enforces the stored ceiling and the devnet/mint/recipient
allowlist immediately before `solana.charge`. `LIVE_PAY` remains `0` by
default; do not use `MPP_HOME=~/.agentcash` or omit `--url devnet` from CLI
commands. Remove the temporary recipient keypair when finished:

```sh
shred -u -- "$FIXTURE_TMP/recipient.json"
rmdir -- "$FIXTURE_TMP"
```
