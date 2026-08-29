import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { Mppx, solana } from "@solana/mpp/server";

const HOST = "127.0.0.1";
const PORT = Number(process.env.MPP_FIXTURE_PORT || 4173);
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const NETWORK = "devnet";
const MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const RECIPIENT = process.env.MPP_FIXTURE_RECIPIENT;
const AMOUNT = "10000";
const PATH = "/quote/AAPL";

if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  throw new Error("MPP_FIXTURE_PORT must be an integer between 1024 and 65535");
}
if (!RECIPIENT) {
  throw new Error("MPP_FIXTURE_RECIPIENT is required; refuse to start");
}

const mppx = Mppx.create({
  realm: "mpp-devnet-loopback",
  secretKey: randomBytes(32).toString("hex"),
  methods: [
    solana.charge({
      currency: MINT,
      decimals: 6,
      network: NETWORK,
      recipient: RECIPIENT,
      rpcUrl: RPC_URL,
    }),
  ],
});
const payment = mppx.charge({
  amount: AMOUNT,
  currency: MINT,
  description: "MPP devnet loopback quote",
});

function toRequest(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  return new Request(`http://${HOST}:${PORT}${req.url || PATH}`, {
    method: req.method || "GET",
    headers,
  });
}

async function sendResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      await sendResponse(res, Response.json({ ok: true, network: NETWORK, mint: MINT, amount: AMOUNT }));
      return;
    }
    if (req.method !== "GET" || new URL(req.url || PATH, `http://${HOST}:${PORT}`).pathname !== PATH) {
      await sendResponse(res, new Response("Not found", { status: 404 }));
      return;
    }

    const result = await payment(toRequest(req));
    if (result.status === 402) {
      await sendResponse(res, result.challenge);
      return;
    }
    await sendResponse(res, result.withReceipt(Response.json({
      quote: "AAPL",
      source: "devnet-loopback",
      paid: true,
    })));
  } catch {
    // Never expose or log credentials, signed transactions, or payment headers.
    await sendResponse(res, new Response("Internal Server Error", { status: 500 }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`MPP_LOOPBACK_READY host=${HOST} port=${PORT} path=${PATH} network=${NETWORK} mint=${MINT} amount=${AMOUNT} recipient=${RECIPIENT}`);
});

function close() {
  server.close(() => process.exit(0));
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
