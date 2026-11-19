import { formatUsd, growthOf } from "@potted/core";
import { ImageResponse } from "next/og";
import { Beanstalk } from "@/components/Beanstalk";
import { gameOf } from "./format";
import * as service from "./service";

/**
 * Share cards: the pictures a fan or a climber posts. Made on request from
 * the records, so a card always shows the latest pot and result, and is
 * used both as a page's preview image and as a download.
 */

export const CARD_SIZE = { width: 1200, height: 630 };

const BG = "#0a1628";
const INK = "#eef3fb";
const MUTED = "#9db0cc";
const FAINT = "#6f819c";
const GREEN = "#35c98b";

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function Bar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div style={{ display: "flex", width: 620, height: 14, borderRadius: 7, background: "#1c2c45", marginTop: 18 }}>
      <div style={{ display: "flex", width: `${Math.max(3, Math.min(100, ratio * 100))}%`, height: 14, borderRadius: 7, background: color }} />
    </div>
  );
}

function Footer({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: FAINT, marginTop: 26 }}>
      <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: GREEN, marginRight: 12 }} />
      {text}
    </div>
  );
}

/** "Ana planted $5 on Ryan's challenge": the card for one pledge, which follows the challenge to its result. */
export function pledgeCardFacts(pledgeId: string) {
  const pledge = service.pledgeById(pledgeId);
  if (!pledge) return undefined;
  const challenge = service.getChallenge(pledge.challengeId);
  const planter = service.getUser(pledge.userId);
  const streamer = service.getUser(challenge.streamerId);
  return { pledge, challenge, planter, streamer };
}

const RESULT: Record<string, { line: string; color: string }> = {
  open: { line: "It pays out only if they pull it off.", color: "#6f9bff" },
  locked: { line: "The attempt is on. It pays out only if they pull it off.", color: "#e9bb4d" },
  paid: { line: "They did it. The pot was paid out on Solana.", color: GREEN },
  failed: { line: "Missed this time. Every planter was refunded in full.", color: "#9aa7ba" },
};

export function pledgeCard(pledgeId: string): ImageResponse | undefined {
  const facts = pledgeCardFacts(pledgeId);
  if (!facts) return undefined;
  const { pledge, challenge, planter, streamer } = facts;
  const result = RESULT[challenge.status] ?? RESULT.open!;
  const growth = growthOf(challenge.totalMicro, challenge.goalMicro);
  const who = planter?.name ?? "A planter";
  const verb = challenge.status === "paid" ? "helped fund" : challenge.status === "failed" ? "backed" : "planted";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG, color: INK, padding: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 30 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
              {clip(who, 28)} {verb}
            </div>
            <div style={{ display: "flex", fontSize: 108, fontWeight: 700, lineHeight: 1, marginTop: 8, color: result.color }}>{formatUsd(pledge.amountMicro)}</div>
            <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 22 }}>
              on {clip(streamer?.name ?? "a streamer", 24)}&apos;s challenge · {gameOf(challenge).name}
            </div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, lineHeight: 1.15, marginTop: 10 }}>{clip(challenge.title, 80)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 28 }}>
              {formatUsd(challenge.totalMicro)}
              {challenge.goalMicro > 0 ? ` of ${formatUsd(challenge.goalMicro)}` : ""} in the pot
            </div>
            <Bar ratio={growth.ratio} color={result.color} />
            <div style={{ display: "flex", fontSize: 26, color: result.color, marginTop: 16 }}>{result.line}</div>
            <Footer text="Potted · fans fund the challenge, the result settles it" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <Beanstalk stage={growth.index} size={380} />
        </div>
      </div>
    ),
    CARD_SIZE,
  );
}

/** A climber's card: what is live now, and their record on Potted. */
export function streamerCard(handle: string): ImageResponse | undefined {
  const streamer = service.getStreamer(handle);
  if (!streamer) return undefined;
  const challenges = service.stageChallenges(streamer.id);
  const live = challenges.find((c) => c.status === "open" || c.status === "locked");
  const completed = challenges.filter((c) => c.status === "paid");
  const raised = completed.reduce((sum, c) => sum + c.totalMicro, 0);
  const planters = new Set(challenges.flatMap((c) => service.fundersOf(c.id).map((f) => f.userId))).size;
  const growth = live ? growthOf(live.totalMicro, live.goalMicro) : undefined;
  const stats: [string, string][] = [
    [formatUsd(raised), "earned from completed challenges"],
    [String(completed.length), completed.length === 1 ? "challenge completed" : "challenges completed"],
    [String(planters), planters === 1 ? "planter" : "planters"],
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG, color: INK, padding: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 30 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 84, height: 84, borderRadius: 42, background: "#1c2c45", border: `3px solid ${GREEN}`, alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 700 }}>
                {streamer.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 22 }}>
                <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>{clip(streamer.name, 22)}</div>
                <div style={{ display: "flex", fontSize: 26, color: MUTED }}>on Potted</div>
              </div>
            </div>
            {live ? (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
                <div style={{ display: "flex", fontSize: 26, color: live.status === "locked" ? "#e9bb4d" : "#6f9bff" }}>
                  {live.status === "locked" ? "ATTEMPT IN PROGRESS" : "OPEN FOR PLEDGES"}
                </div>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 700, lineHeight: 1.15, marginTop: 6 }}>{clip(live.title, 70)}</div>
                <div style={{ display: "flex", fontSize: 26, color: MUTED, marginTop: 10 }}>
                  {formatUsd(live.totalMicro)}
                  {live.goalMicro > 0 ? ` of ${formatUsd(live.goalMicro)}` : ""} in the pot
                </div>
                <Bar ratio={growth!.ratio} color={GREEN} />
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 34, color: MUTED, marginTop: 40 }}>Fans fund the challenges. The result settles them.</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex" }}>
              {stats.map(([value, label]) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", marginRight: 48 }}>
                  <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>{value}</div>
                  <div style={{ display: "flex", fontSize: 22, color: MUTED, maxWidth: 220 }}>{label}</div>
                </div>
              ))}
            </div>
            <Footer text="Potted · back a challenge, it pays only if they pull it off" />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <Beanstalk stage={growth?.index ?? Math.min(4, completed.length)} size={340} />
        </div>
      </div>
    ),
    CARD_SIZE,
  );
}
