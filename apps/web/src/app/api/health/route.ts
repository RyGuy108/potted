import { opsStatus } from "@/lib/ops";
import { schedulerStatus } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

/**
 * For the host's health check and for a quick look: whether the background
 * job is running, when data was last saved and backed up, and whether a
 * second server is using the same data. Nothing secret. Always 200, so a
 * redeploy (old and new server briefly overlapping) never fails the host's
 * health check; a shared data folder shows as a warning instead.
 */
export function GET() {
  const ops = opsStatus();
  const scheduler = schedulerStatus();
  return Response.json({
    ok: true,
    now: Date.now(),
    scheduler,
    ...ops,
    ...(ops.otherServer ? { warning: "Another server is using the same data folder. Run exactly one." } : {}),
  });
}
