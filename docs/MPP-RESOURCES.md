# MPP development resources

Verified 2026-08-28. Pin package versions in `package-lock.json`; revisit this
page when the MPP/Solana SDKs release.

## Canonical protocol

- [MPP overview](https://mpp.dev/overview) — HTTP 402 flow and concepts.
- [MPP protocol specifications](https://github.com/tempoxyz/mpp-specs) —
  core, intents, methods, and extensions.
- [Rendered specifications](https://paymentauth.org) — readable protocol and
  method drafts.
- [MPP security guidance](https://mpp.dev/advanced/security) — credential,
  secret, replay, and transport considerations.
- [Managing agent spend](https://mpp.dev/guides/managing-agent-spend) —
  operator-facing spend-control patterns.

## Solana implementation

- [Solana MPP method](https://mpp.dev/payment-methods/solana) — native SOL/SPL
  MPP overview, including charge vs session.
- [Solana charge](https://mpp.dev/payment-methods/solana/charge) — first
  milestone: one-time transaction/receipt flow.
- [Solana session](https://mpp.dev/payment-methods/solana/session) —
  escrow-backed cumulative vouchers for later metered inference.
- [`@solana/pay-kit`](https://github.com/solana-foundation/pay-kit) — current
  TypeScript surface for Solana MPP; the old `@solana/mpp` package is
  deprecated.
- [`@solana/kit`](https://github.com/anza-xyz/kit) — Solana JavaScript API,
  signer, transaction, and RPC primitives.
- [`mppx`](https://github.com/wevm/mppx) — TypeScript MPP core/client/server
  SDK and protocol transport.
- [Hermes `mpp-agent` skill](https://github.com/NousResearch/hermes-agent/tree/main/optional-skills/payments/mpp-agent)
  — installed operator reference; its current client menu assumes Link,
  Tempo, Privy, AgentCash, or mppx and does not yet expose this Solana
  keypair/pay-kit path. See [`HERMES-GAP.md`](HERMES-GAP.md).

## Local workflow

The repository uses the official packages directly. Avoid copying SDK source
into this tree. When behavior is unclear, make a small fixture or conformance
test and link the exact upstream spec section in the test/documentation.
