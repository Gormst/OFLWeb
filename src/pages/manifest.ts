import type { LegacyPageData } from './types';

export type PageKey = "admin" | "article" | "coaches" | "connect" | "home" | "mediaEditor" | "media" | "players" | "profile" | "schedule" | "standings" | "stats" | "teams";

export const pageLoaders: Record<PageKey, () => Promise<{ default: LegacyPageData }>> = {
  "admin": () => import('./routes/admin'),
  "article": () => import('./routes/article'),
  "coaches": () => import('./routes/coaches'),
  "connect": () => import('./routes/connect'),
  "home": () => import('./routes/home'),
  "mediaEditor": () => import('./routes/mediaEditor'),
  "media": () => import('./routes/media'),
  "players": () => import('./routes/players'),
  "profile": () => import('./routes/profile'),
  "schedule": () => import('./routes/schedule'),
  "standings": () => import('./routes/standings'),
  "stats": () => import('./routes/stats'),
  "teams": () => import('./routes/teams')
};
