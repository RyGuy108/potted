import { type Challenge, MAX_USD, formatUsd, growthOf } from "@potted/core";
import { gameOf } from "./format";
import { ledger } from "./ledger";
import * as service from "./service";
import type { SolanaLedger } from "./solana-ledger";

/**
 * Solana Actions ("Blinks"). Each challenge has an Action URL that wallets
 * and X (through Dialect) unfurl into a card with pledge buttons, so a fan
 * can back a challenge from a post without opening Potted. The fan signs
 * with their own wallet; the money goes into the same escrow as any pledge.
 * See https://solana.com/docs/advanced/actions.
 */

export const ACTION_VERSION = "2.4";

/** CAIP-2 ids: which chain the wallet should sign for. */
const CHAINS: Record<string, string> = {
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "mainnet-beta": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  testnet: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
};

export function actionHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
    "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
    "X-Action-Version": ACTION_VERSION,
    "X-Blockchain-Ids": CHAINS[process.env.SOLANA_CLUSTER || "devnet"] ?? CHAINS.devnet!,
  };
}

export function actionJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: actionHeaders() });
}

/** Errors in the shape wallets show to the user. */
export function actionError(message: string, status = 400): Response {
  return actionJson({ message }, status);
}

/** The site's public address, for the absolute links an Action must use. */
export function baseOf(request: Request): string {
  const fixed = process.env.POTTED_PUBLIC_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function actionUrl(base: string, challengeId: string): string {
  return `${base}/api/actions/pledge/${encodeURIComponent(challengeId)}`;
}

/** Opens the Action in Dialect's viewer, which works without the X extension. */
export function dialUrl(base: string, challengeId: string): string {
  const cluster = process.env.SOLANA_CLUSTER || "devnet";
  return `https://dial.to/?action=${encodeURIComponent(`solana-action:${actionUrl(base, challengeId)}`)}&cluster=${cluster}`;
}

export function solanaLedger(): SolanaLedger | undefined {
  const l = ledger();
  return l.kind === "solana" ? (l as unknown as SolanaLedger) : undefined;
}

const AMOUNTS = [1, 5, 10];

/** The card a wallet or X shows for one challenge. Disabled once pledging closes, or on a simulated ledger. */
export function actionCard(challenge: Challenge, base: string) {
  const streamer = service.getUser(challenge.streamerId);
  const settings = streamer ? service.settingsOf(streamer) : undefined;
  const minUsd = settings?.minPledgeUsd ?? 1;
  const goal = challenge.goalMicro > 0 ? ` of ${formatUsd(challenge.goalMicro)}` : "";
  const href = (amount: string) => `${actionUrl(base, challenge.id)}?amount=${amount}`;
  const open = challenge.status === "open" && challenge.deadline > Date.now();
  const onChain = Boolean(solanaLedger());
  const reason = !onChain ? "This Potted server runs a simulated ledger, so pledges from a wallet are off." : !open ? "Pledging has closed for this challenge." : undefined;
  return {
    type: "action",
    icon: `${actionUrl(base, challenge.id)}/icon`,
    title: challenge.title,
    description: `Back ${streamer?.name ?? "this streamer"}'s ${gameOf(challenge).name} challenge. ${formatUsd(challenge.totalMicro)}${goal} pledged so far. Your money waits in escrow on Solana: it pays out only if they pull it off, and comes back to your wallet if they miss.`,
    label: "Pledge",
    ...(reason ? { disabled: true, error: { message: reason } } : {}),
    links: {
      actions: [
        ...AMOUNTS.filter((a) => a >= minUsd).map((a) => ({ type: "transaction", label: `Pledge $${a}`, href: href(String(a)) })),
        {
          type: "transaction",
          label: "Pledge",
          href: href("{amount}"),
          parameters: [{ type: "number", name: "amount", label: `Amount in USDC (from $${minUsd})`, required: true, min: minUsd, max: MAX_USD }],
        },
      ],
    },
  };
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Splits a title into at most `lines` lines of about `width` characters. */
function wrap(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if ((line + " " + word).trim().length > width && line) {
      out.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) out.push(line);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = `${out[lines - 1]!.slice(0, width - 1).trimEnd()}…`;
  }
  return out;
}

/** The square image on the card: the challenge, its pot and a beanstalk that grows with it. */
export function actionIcon(challenge: Challenge): string {
  const streamer = service.getUser(challenge.streamerId);
  const growth = growthOf(challenge.totalMicro, challenge.goalMicro);
  const lines = wrap(challenge.title, 22, 3);
  const height = 120 + growth.ratio * 300;
  const leaves = Array.from({ length: Math.max(1, Math.round(growth.ratio * 6)) }, (_, i) => {
    const y = 560 - (i + 1) * (height / 7);
    const side = i % 2 === 0 ? 1 : -1;
    return `<path d="M 520 ${y} q ${side * 46} -10 ${side * 62} -44 q ${side * -40} 0 ${side * -62} 44 z" fill="#3ecf8e" opacity="0.9"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1813"/><stop offset="1" stop-color="#0c0a08"/></linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.7" r="0.6"><stop offset="0" stop-color="#3ecf8e" stop-opacity="0.22"/><stop offset="1" stop-color="#3ecf8e" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <rect width="600" height="600" fill="url(#glow)"/>
  <text x="44" y="70" font-family="ui-monospace, Menlo, monospace" font-size="20" letter-spacing="4" fill="#e6c9a3">POTTED · ${escapeXml((streamer?.name ?? "").toUpperCase())}</text>
  ${lines.map((l, i) => `<text x="44" y="${140 + i * 46}" font-family="Inter, Helvetica, Arial, sans-serif" font-size="38" font-weight="700" fill="#faf7f2">${escapeXml(l)}</text>`).join("")}
  <path d="M 520 560 C 490 ${560 - height * 0.33}, 550 ${560 - height * 0.66}, 520 ${560 - height}" stroke="#2f9e6c" stroke-width="10" fill="none" stroke-linecap="round"/>
  ${leaves}
  <path d="M 470 560 h 100 l -12 40 h -76 z" fill="#5a3d26"/>
  <text x="44" y="470" font-family="ui-monospace, Menlo, monospace" font-size="64" fill="#faf7f2">${escapeXml(formatUsd(challenge.totalMicro))}</text>
  <text x="44" y="510" font-family="Inter, Helvetica, Arial, sans-serif" font-size="22" fill="#a89f94">${challenge.goalMicro > 0 ? `of ${escapeXml(formatUsd(challenge.goalMicro))} · ` : ""}held in escrow on Solana</text>
  <rect x="44" y="540" width="360" height="12" rx="6" fill="#faf7f2" fill-opacity="0.1"/>
  <rect x="44" y="540" width="${Math.round(360 * growth.ratio)}" height="12" rx="6" fill="#3ecf8e"/>
</svg>`;
}
