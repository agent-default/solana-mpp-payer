# Architecture

```text
HTTP seller
    │ 402 + WWW-Authenticate: Payment
    ▼
challenge decoder ──► policy gate ──X──► refuse before sign
    │                       │
    │                       └──────────► Solana MPP charge client
    │                                      │
    └──────────── retry + Payment receipt ◄┘

data/principal.json  = public identity, network, mint, ceiling/accounting
data/keystore/id.json = 64-byte Solana keypair, mode 0600, ignored by git
```

The process is the principal. The seller is untrusted. The MPP challenge is
data, not authorization to spend. The policy gate must validate at least:

- method `solana` and intent `charge` for milestone one;
- expected network and canonical USDC mint;
- exact recipient and any declared split recipients;
- positive integer base-unit amount;
- challenge expiry, resource binding, replay state, and any fee fields;
- remaining process ceiling, before transaction construction or signing.

The official Solana MPP implementation supports both one-time `charge` and
off-chain-voucher-backed `session`. We start with charge because it yields one
easy-to-audit transaction. Session is appropriate later for high-frequency
inference, but its escrow cap and close/refund lifecycle need separate tests.

The code currently contains the decoder, `beforeSign` policy gate, and
`chargeArgs` kwargs. Do not call `createPayKitClient().fetch()` as the
guarded path.
