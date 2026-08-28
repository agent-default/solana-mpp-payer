import { home, init, loadPrincipal, loadPrincipalSigner } from "./lib.js";
import { runCharge } from "./charge.js";
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
  } else {
    throw new Error("usage: node src/main.js init|status|pick|charge");
  }
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
