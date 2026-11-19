import { formatUsd, growthOf } from "@potted/core";
import { ImageResponse } from "next/og";
import { Beanstalk } from "@/components/Beanstalk";
import { gameOf } from "@/lib/format";
import * as service from "@/lib/service";

export const dynamic = "force-dynamic";
export const alt = "A Potted challenge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "Open for pledges", color: "#6f9bff" },
  locked: { label: "Attempt in progress", color: "#e9bb4d" },
  paid: { label: "Completed and paid", color: "#35c98b" },
  failed: { label: "Refunded", color: "#9aa7ba" },
};

/** The picture shown when a challenge link is shared. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const challenge = service.getChallenge(id);
  const streamer = service.getUser(challenge.streamerId);
  const funders = service.fundersOf(challenge.id);
  const growth = growthOf(challenge.totalMicro, challenge.goalMicro);
  const status = STATUS[challenge.status]!;
  const title = challenge.title.length > 110 ? `${challenge.title.slice(0, 107)}…` : challenge.title;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a1628", color: "#eef3fb", padding: 56 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 40 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 26, color: "#9db0cc" }}>
              {streamer?.name ?? "A streamer"} · {gameOf(challenge).name}
            </div>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, lineHeight: 1.15, marginTop: 18 }}>{title}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <div style={{ display: "flex", fontSize: 76, fontWeight: 700 }}>{formatUsd(challenge.totalMicro)}</div>
              <div style={{ display: "flex", fontSize: 28, color: "#9db0cc", marginLeft: 18 }}>
                from {funders.length} {funders.length === 1 ? "fan" : "fans"}
              </div>
            </div>
            <div style={{ display: "flex", fontSize: 30, color: status.color, marginTop: 10 }}>{status.label}</div>
            <div style={{ display: "flex", fontSize: 24, color: "#6f819c", marginTop: 26 }}>Potted · fans fund the challenge, the result settles it</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <Beanstalk stage={growth.index} size={400} />
        </div>
      </div>
    ),
    size,
  );
}
