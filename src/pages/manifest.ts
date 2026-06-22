import type { PageModule } from './types';

export type PageKey = 'admin' | 'article' | 'connect' | 'home' | 'mediaEditor' | 'media' | 'players' | 'profile' | 'schedule' | 'standings' | 'stats' | 'teams';

export const pageLoaders: Record<PageKey, () => Promise<{ default: PageModule }>> = {
  admin: () => import('./routes/admin'),
  article: () => import('./routes/article'),
  connect: () => import('./routes/connect'),
  home: () => import('./routes/home'),
  mediaEditor: () => import('./routes/mediaEditor'),
  media: () => import('./routes/media'),
  players: () => import('./routes/players'),
  profile: () => import('./routes/profile'),
  schedule: () => import('./routes/schedule'),
  standings: () => import('./routes/standings'),
  stats: () => import('./routes/stats'),
  teams: () => import('./routes/teams')
};
