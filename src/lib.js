import { generateKeyPairSync } from "node:crypto";
import { access, chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Signer } from "@solana/pay-kit";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const home = () => process.env.MPP_HOME || "data";
export const keystorePath = (dir) => join(dir, "keystore", "id.json");
export const mintFor = (network) =>
  network === "mainnet" || network === "mainnet-beta" ? USDC : USDC_DEVNET;

export function b58encode(u8) {
  let z = 0;
  while (z < u8.length && u8[z] === 0) z++;
  const d = [];
  for (let i = z; i < u8.length; i++) {
    let carry = u8[i];
    for (let j = 0; j < d.length; j++) {
      carry += d[j] << 8;
      d[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      d.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return "1".repeat(z) + d.reverse().map((n) => B58[n]).join("");
}

export function checkSpend(amount, ceiling) {
  if (amount <= 0n) throw new Error("amount 0");
  if (amount > ceiling) throw new Error(`spend ${amount} exceeds ceiling ${ceiling}; refuse before sign`);
}

function b64urlJson(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64"));
}

export function parseChallenge(header) {
  const s = String(header).replace(/^\s*WWW-Authenticate:\s*/i, "").trim();
  if (!/^payment\s/i.test(s)) throw new Error("not Payment scheme");
  const params = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  let m;
  while ((m = re.exec(s.slice(s.indexOf(" ") + 1)))) params[m[1]] = m[2] ?? m[3];
  for (const k of ["id", "realm", "method", "intent", "request"]) {
    if (!params[k]) throw new Error(`missing ${k}`);
  }
  return { ...params, request: b64urlJson(params.request) };
}

export function pickSolana(headers) {
  const parsed = headers.map(parseChallenge);
  const hit = parsed.find((c) => c.method === "solana" && c.intent === "charge");
  if (!hit) throw new Error(`no solana/charge challenge (got ${parsed.map((c) => `${c.method}/${c.intent}`).join(", ") || "none"})`);
  return { ...hit, amount: BigInt(hit.request.amount) };
}

export async function init(dir) {
  const path = join(dir, "principal.json");
  try {
    await access(path);
    throw new Error(`${path} already exists; refuse to clobber`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const rawPub = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  const seed = privateKey.export({ type: "pkcs8", format: "der" }).subarray(-32);
  const keyPath = keystorePath(dir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  await mkdir(join(dir, "keystore"), { recursive: true, mode: 0o700 });
  await chmod(join(dir, "keystore"), 0o700);
  await writeFile(keyPath, JSON.stringify([...Buffer.concat([seed, rawPub])]));
  await chmod(keyPath, 0o600);
  const principal = {
    pubkey: b58encode(rawPub),
    spend_ceiling_raw: 0,
    network: process.env.SOLANA_NETWORK || "devnet",
    mint: mintFor(process.env.SOLANA_NETWORK || "devnet"),
  };
  await writeFile(path, JSON.stringify(principal, null, 2) + "\n");
  await chmod(path, 0o600);
  return principal;
}

export async function loadPrincipal(dir) {
  const path = join(dir, "principal.json");
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") throw new Error(`missing ${path}; run init`);
    throw e;
  }
}

/** Load only the ignored local file key; never log or return its bytes. */
export async function loadSigner(dir) {
  const path = keystorePath(dir);
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error(`${path} must be a file; refuse signer`);
    if ((info.mode & 0o777) !== 0o600) throw new Error(`${path} must be mode 0600; refuse signer`);
    return await Signer.file(path);
  } catch (e) {
    if (e.code === "ENOENT") throw new Error(`missing ${path}; run init`);
    throw e;
  }
}

/** Bind the file key to the local principal before it can reach a charge path. */
export async function loadPrincipalSigner(dir) {
  const principal = await loadPrincipal(dir);
  const signer = await loadSigner(dir);
  if (signer.pubkey !== principal.pubkey) {
    throw new Error("keystore pubkey does not match principal; refuse signer");
  }
  return { principal, signer };
}
