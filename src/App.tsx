import { lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { LegacyPage } from './LegacyPage';
import { pageLoaders, type PageKey } from './pages/manifest';

const lazyPages = {} as Record<PageKey, LazyExoticComponent<ComponentType>>;

for (const key of Object.keys(pageLoaders) as PageKey[]) {
  lazyPages[key] = lazy(async () => {
      const module = await pageLoaders[key]();
      return {
        default: () => <LegacyPage page={module.default} />
      };
    });
}

function routeToPage(pathname: string): PageKey | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/index') return 'home';
  if (path.startsWith('/teams/')) return 'teams';
  if (path.startsWith('/coaches/')) return 'coaches';
  if (path.startsWith('/media/article/')) return 'article';
  if (path === '/media/editor') return 'mediaEditor';

  const firstSegment = path.slice(1).split('/')[0].replace(/\.html$/, '');
  const key = firstSegment.replace(/-([a-z])/g, (_match, char) => char.toUpperCase()) as PageKey;

  return key in pageLoaders ? key : null;
}

export function App() {
  const pageKey = routeToPage(window.location.pathname);

  if (!pageKey) {
    return (
      <main className="react-not-found">
        <h1>Page not found</h1>
        <a href="/">Return home</a>
      </main>
    );
  }

  const Page = lazyPages[pageKey];

  return (
    <Suspense fallback={<div />}>
      <Page key={pageKey} />
    </Suspense>
  );
}
