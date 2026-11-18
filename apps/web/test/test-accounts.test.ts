import { describe, expect, it } from "vitest";
import { ledger } from "../src/lib/ledger";
import { addSampleHistory, removeSample } from "../src/lib/sample-data";
import * as service from "../src/lib/service";
import { db, resetForTests } from "../src/lib/store";
import { TEST_ACCOUNTS } from "../src/lib/test-accounts";

describe("test accounts", () => {
  it("are created once, funded, and outlive the demo sample", async () => {
    resetForTests();
    process.env.POTTED_TEST_ACCOUNTS = "on";
    ledger();
    ledger();
    for (const t of TEST_ACCOUNTS) expect(db().users.filter((u) => u.id === t.id)).toHaveLength(1);
    expect(service.getStreamer("testclimber")?.id).toBe("u_t_climber1");
    expect(service.getUser("u_t_keeper2")?.role).toBe("mod");
    await new Promise((r) => setTimeout(r, 10));
    expect(await service.balanceOf(service.getUser("u_t_planter1")!)).toBe(50_000_000);
    addSampleHistory(db());
    removeSample(db());
    for (const t of TEST_ACCOUNTS) expect(service.getUser(t.id)).toBeDefined();
    process.env.POTTED_TEST_ACCOUNTS = "off";
  });
});
