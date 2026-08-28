# Security policy

This repository handles a signing key and payment authorization. Do not upload
wallet files, `.env` files, RPC API keys, or live receipts containing private
metadata.

- Use a throwaway devnet/localnet wallet.
- Keep `data/` and all key material out of version control.
- Keep the spend ceiling at zero unless a test explicitly requires spending.
- Review network, mint, recipient, and amount before enabling a live payment.
- Live tests are opt-in (`LIVE_PAY=1`) and are not part of default CI.

If a vulnerability is found, do not open a public issue with key material or
an exploitable challenge. Preserve a minimal reproduction and report it
privately to the maintainer.
