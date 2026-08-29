import { home, init, loadPrincipal, loadPrincipalSigner, setCeiling } from "./lib.js";
import { livePay, runCharge } from "./charge.js";
import { beforeSign, policyFromPrincipal } from "./policy.js";

const dir = home();
const [cmd, ...rest] = process.argv.slice(2);

try {
  if (cmd === "init") {
    const p = await init(dir);
    console.log(`pubkey ${p.pubkey} ceiling 0`);
  } else if (cmd === "status") {
    const { principal: p, signer } = await loadPrincipalSigner(dir);
    console.log(`pubkey ${signer.pubkey} ceiling ${p.spend_ceiling_raw} network ${p.network}`);
  } else if (cmd === "pick") {
    if (!rest.length) throw new Error("pick <WWW-Authenticate...>");
    const p = await loadPrincipal(dir);
    const seam = beforeSign(
      rest,
      policyFromPrincipal(p, {
        recipient: process.env.MPP_RECIPIENT || p.recipient,
        allowMainnet: process.env.ALLOW_MAINNET === "1",
      }),
    );
    console.log(
      `method ${seam.hit.method} intent ${seam.hit.intent} amount ${seam.hit.amount} recipient ${seam.hit.request.recipient} expectedNetwork ${seam.expectedNetwork} maxAmount ${seam.maxAmount}`,
    );
  } else if (cmd === "ceiling") {
    if (!rest.length) throw new Error("ceiling <raw-base-units>");
    const p = await setCeiling(dir, rest[0]);
    console.log(`pubkey ${p.pubkey} ceiling ${p.spend_ceiling_raw}`);
  } else if (cmd === "charge") {
    if (!rest.length) throw new Error("charge <WWW-Authenticate...>");
    const { principal: p, signer } = await loadPrincipalSigner(dir);
    const out = await runCharge(
      rest,
      policyFromPrincipal(p, {
        recipient: process.env.MPP_RECIPIENT || p.recipient,
        allowMainnet: process.env.ALLOW_MAINNET === "1",
      }),
      { rpcUrl: process.env.SOLANA_RPC_URL, signer: signer.signer },
    );
    console.log(`charged expectedNetwork ${out.args.expectedNetwork} maxAmount ${out.args.maxAmount}`);
  } else if (cmd === "pay") {
    if (!rest.length) throw new Error("pay <seller-url>");
    const { principal: p, signer } = await loadPrincipalSigner(dir);
    const out = await livePay(
      rest[0],
      policyFromPrincipal(p, {
        recipient: process.env.MPP_RECIPIENT || p.recipient,
        allowMainnet: process.env.ALLOW_MAINNET === "1",
      }),
      {
        rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
        signer: signer.signer,
        broadcast: true,
      },
    );
    console.log(
      `paid status ${out.status} amount ${out.seam.hit.amount} recipient ${out.seam.hit.request.recipient} network ${out.args.expectedNetwork}`,
    );
  } else {
    throw new Error("usage: node src/main.js init|status|pick|ceiling|charge|pay");
  }
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
