"use client";

import { type ReactNode, useState } from "react";
import LineSidebar from "./LineSidebar";

export interface GameGroup {
  /** Shown in the sidebar, with its count. */
  label: string;
  count: number;
  /** The cards for this group, rendered on the server. */
  node: ReactNode;
}

/**
 * A long list split by game: a line sidebar on the left picks the game, its
 * cards show on the right. "All" comes first. On narrow screens the sidebar
 * sits above the cards.
 */
export function GroupedByGame({ groups, all }: { groups: GameGroup[]; all: ReactNode }) {
  const [active, setActive] = useState(0);
  const total = groups.reduce((sum, g) => sum + g.count, 0);
  const labels = [`All · ${total}`, ...groups.map((g) => `${g.label} · ${g.count}`)];
  return (
    <div className="grouped">
      <LineSidebar
        items={labels}
        accentColor="#e6c9a3"
        textColor="#aaa298"
        markerColor="#4a3f35"
        showIndex={false}
        proximityRadius={70}
        maxShift={12}
        markerLength={28}
        markerGap={12}
        itemGap={14}
        fontSize={0.95}
        smoothing={90}
        defaultActive={0}
        onItemClick={(index) => setActive(index)}
        className="grouped-sidebar"
      />
      <div className="grouped-body" aria-live="polite">
        {active === 0 ? all : groups[active - 1]?.node}
      </div>
    </div>
  );
}
