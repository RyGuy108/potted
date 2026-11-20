export interface StreamEntry {
  id: string;
  title: string;
  startsAt: string;
  url: string;
  source: "manual" | "twitch";
}
export interface AccountProfile {
  bio?: string;
  avatarUrl?: string;
  website?: string;
  timezone?: string;
  interests?: string;
  /** Fan profiles are private until explicitly published. */
  publicProfile?: boolean;
  showSchedule?: boolean;
  showHistory?: boolean;
  manual?: Partial<Record<"name" | "bio" | "avatar", boolean>>;
  source?: string;
  importedAt?: number;
  schedule?: StreamEntry[];
  history?: StreamEntry[];
  notifications?: { community: boolean; awards: boolean };
  twitch?: {
    subject: string;
    login: string;
    syncedAt: number;
    schedule: StreamEntry[];
    history: StreamEntry[];
    warnings: string[];
  };
}
