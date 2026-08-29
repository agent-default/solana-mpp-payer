# OpenRouter MPP compatibility

Checked 2026-08-29 against the live MPP service and catalog.

## Observed service

The listed MPP endpoint is:

```text
POST https://openrouter.mpp.tempo.xyz/v1/chat/completions
```

An unpaid request returned HTTP 402 with three offers for the same model
request:

- `method="tempo"`, `intent="charge"`
- `method="tempo"`, `intent="charge"` (a second currency offer)
- `method="tempo"`, `intent="session"`

The live offers specified Tempo chain ID `4217` and a Tempo token. The service
catalog likewise describes OpenRouter as a Tempo `session` service. It did not
advertise native `method="solana"`, Solana devnet, or Circle devnet USDC.

## Compatibility decision

This repository is a Solana-only payer for Circle USDC. Its guarded seam is

```text
402 challenge -> beforeSign -> @solana/mpp/client solana.charge -> Mppx.fetch
```

Therefore the current OpenRouter endpoint is intentionally refused by
`pickSolana` before a signer or payment method is created. A standard
`openrouter.ai` API-key request is a different billing path and is not proof of
MPP support for this payer.

No Tempo account was created, no second wallet or rail was added, and no
OpenRouter payment was attempted. Do not use AgentCash, x402, Surfpool, or an
`MPP_SANDBOX` override to turn this mismatch into a passing test.

## To reopen

Revisit this file only when one of these is true:

1. OpenRouter advertises a native Solana `solana/charge` offer compatible with
   this process's devnet/mainnet policy; or
2. the product scope explicitly authorizes a separate Tempo payer and its
   funding, signer, ceiling, and receipt verification plan.

Until then, the completed loopback proof remains the evidence for the native
Solana rail, and OpenRouter remains an external compatibility gap.
