import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  USDC,
  USDC_DEVNET,
  b58encode,
  checkSpend,
  init,
  loadPrincipal,
  parseCeiling,
  pickSolana,
  setCeiling,
} from "./lib.js";
import { beforeSign, policyFromPrincipal } from "./policy.js";

const req = Buffer.from(JSON.stringify({ amount: "10000", currency: USDC, recipient: "11111111111111111111111111111111" })).toString("base64url");
const sol = `Payment id="a", realm="r", method="solana", intent="charge", request="${req}"`;
const tempo = `Payment id="b", realm="r", method="tempo", intent="charge", request="${req}"`;

test("policy", () => {
  assert.equal(b58encode(new Uint8Array(32)), "11111111111111111111111111111111");
  assert.throws(() => checkSpend(1n, 0n));
  checkSpend(5n, 5n);
  assert.throws(() => checkSpend(6n, 5n));
  const hit = pickSolana([tempo, sol]);
  assert.equal(hit.method, "solana");
  assert.equal(hit.amount, 10000n);
  assert.throws(() => pickSolana([tempo]));
});

test("setCeiling persists raw units and does not rewrite the keystore", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mpp-ceiling-"));
  const configuredNetwork = process.env.SOLANA_NETWORK;
  delete process.env.SOLANA_NETWORK;
  try {
    const created = await init(dir);
    assert.equal(created.spend_ceiling_raw, 0);
    assert.throws(() => parseCeiling("-1"));
    assert.throws(() => parseCeiling("1.5"));
    assert.throws(() => parseCeiling("0x10"));
    const keyPath = join(dir, "keystore", "id.json");
    const before = await readFile(keyPath);
    const raised = await setCeiling(dir, "10000");
    assert.equal(raised.spend_ceiling_raw, 10000);
    assert.equal((await loadPrincipal(dir)).spend_ceiling_raw, 10000);
    assert.equal((await stat(join(dir, "principal.json"))).mode & 0o777, 0o600);
    assert.deepEqual(await readFile(keyPath), before);
    const hdr = `Payment id="a", realm="r", method="solana", intent="charge", request="${Buffer.from(JSON.stringify({ amount: "10000", currency: USDC_DEVNET, recipient: "11111111111111111111111111111111", methodDetails: { network: "devnet" } })).toString("base64url")}"`;
    const policy = policyFromPrincipal(raised, { recipient: "11111111111111111111111111111111" });
    assert.equal(beforeSign([hdr], policy).maxAmount, 10000n);
    await setCeiling(dir, "9999");
    const lowered = policyFromPrincipal(await loadPrincipal(dir), { recipient: "11111111111111111111111111111111" });
    assert.throws(() => beforeSign([hdr], lowered), /exceeds ceiling/);
  } finally {
    if (configuredNetwork === undefined) delete process.env.SOLANA_NETWORK;
    else process.env.SOLANA_NETWORK = configuredNetwork;
    await chmod(dir, 0o700);
    await rm(dir, { recursive: true, force: true });
  }
});
