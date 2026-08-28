import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Signer } from "@solana/pay-kit";
import { init } from "./lib.js";

test("initializer writes a pay-kit-compatible private key with safe modes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mpp-test-"));
  const configuredNetwork = process.env.SOLANA_NETWORK;
  delete process.env.SOLANA_NETWORK;
  try {
    const principal = await init(dir);
    const keyPath = join(dir, "keystore", "id.json");
    const signer = await Signer.file(keyPath);

    assert.equal(signer.pubkey, principal.pubkey);
    assert.equal(principal.network, "devnet");
    assert.equal(principal.mint, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    assert.equal(JSON.parse(await readFile(keyPath, "utf8")).length, 64);
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
    assert.equal((await stat(join(dir, "keystore"))).mode & 0o777, 0o700);
    assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    assert.equal((await stat(join(dir, "principal.json"))).mode & 0o777, 0o600);
  } finally {
    if (configuredNetwork === undefined) delete process.env.SOLANA_NETWORK;
    else process.env.SOLANA_NETWORK = configuredNetwork;
    await chmod(dir, 0o700);
    await rm(dir, { recursive: true, force: true });
  }
});
