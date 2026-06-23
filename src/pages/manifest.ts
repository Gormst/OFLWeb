import type { PageModule } from './types';

export type PageKey = 'admin' | 'article' | 'authRedirect' | 'boxScore' | 'connect' | 'home' | 'mediaEditor' | 'media' | 'pickEms' | 'players' | 'privacyPolicy' | 'profile' | 'schedule' | 'standings' | 'stats' | 'teams' | 'termsOfService';

export const pageLoaders: Record<PageKey, () => Promise<{ default: PageModule }>> = {
  admin: () => import('./routes/admin'),
  article: () => import('./routes/article'),
  authRedirect: () => import('./routes/authRedirect'),
  boxScore: () => import('./routes/boxScore'),
  connect: () => import('./routes/connect'),
  home: () => import('./routes/home'),
  mediaEditor: () => import('./routes/mediaEditor'),
  media: () => import('./routes/media'),
  pickEms: () => import('./routes/pickEms'),
  players: () => import('./routes/players'),
  privacyPolicy: () => import('./routes/privacyPolicy'),
  profile: () => import('./routes/profile'),
  schedule: () => import('./routes/schedule'),
  standings: () => import('./routes/standings'),
  stats: () => import('./routes/stats'),
  teams: () => import('./routes/teams'),
  termsOfService: () => import('./routes/termsOfService')
};
