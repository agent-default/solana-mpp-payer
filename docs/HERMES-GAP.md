# Hermes MPP integration gap

This note captures the baseline of the installed official Hermes
`mpp-agent` skill (version `0.1.0`) so this project can measure the missing
Solana-principal path without changing Hermes or importing another agent tree.

## What the existing skill assumes

1. **Client choice:** Link CLI, Tempo Wallet, Privy Agent CLI, AgentCash, or
   `mppx`; it has no Solana-native keypair/pay-kit option.
2. **Fast path:** `mppx account create` owns account setup and its own config;
   it does not consume this process's `data/keystore/id.json`.
3. **Challenge example:** the documented MPP challenge is Tempo-shaped
   (`method`/wallet choice is not Solana-specific).
4. **Rail selection:** a Stripe `method="stripe"` challenge goes to Link;
   other challenges go to mppx or Tempo. There is no Solana challenge branch.
5. **Spend controls:** persistent controls are described as Tempo Wallet UI
   behavior; this process needs a local hard ceiling that refuses before sign
   and survives restart.

## The complement this repository builds

Use the official Solana MPP client surface (`@solana/pay-kit/client`) with the
standard keypair created by `npm run init`. The adapter must select native
Solana MPP, validate the exact USDC/network/recipient/amount policy, sign only
after the ceiling passes, retry the original request, and emit a safe receipt.

This is an implementation gap, not a claim that the Hermes skill or MPP
protocol is frozen. Re-check the upstream skill before publishing or proposing
an integration.
