import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { GlobalLiveMiniViewer } from './GlobalLiveMiniViewer';
import { LegacyPage } from './LegacyPage';
import { pageLoaders, type PageKey } from './pages/manifest';
import { isLegacyPageData } from './pages/types';
import { RedzoneChat } from './RedzoneChat';
import { SharedFooter } from './SharedFooter';
import { SharedHeader } from './SharedHeader';

function isStaleRouteChunkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!isStaleRouteChunkError(error)) return;
    const key = 'ofl_stale_chunk_reload';
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
    window.location.reload();
  }

  render() {
    if (this.state.error) {
      return (
        <main className="react-not-found">
          <h1>Page failed to load</h1>
          <p>[ROUTE_RENDER_FAILED] {this.state.error.message}</p>
          <a href="/">Return home</a>
        </main>
      );
    }

    return this.props.children;
  }
}

const lazyPages = {} as Record<PageKey, LazyExoticComponent<ComponentType>>;

for (const key of Object.keys(pageLoaders) as PageKey[]) {
  lazyPages[key] = lazy(async () => {
      try {
      const module = await pageLoaders[key]();
      const PageModule = module.default;
      return {
        default: isLegacyPageData(PageModule)
          ? () => <LegacyPage page={PageModule} />
          : PageModule
      };
      } catch (error) {
        if (isStaleRouteChunkError(error) && sessionStorage.getItem('ofl_stale_chunk_reload') !== '1') {
          sessionStorage.setItem('ofl_stale_chunk_reload', '1');
          window.location.reload();
        }
        throw error;
      }
    });
}

function routeToPage(pathname: string): PageKey | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/index') return 'home';
  if (path === '/auth/redirect') return 'authRedirect';
  if (path.startsWith('/teams/')) return 'teams';
  if (path.startsWith('/box-score/')) return 'boxScore';
  if (path.startsWith('/media/article/')) return 'article';
  if (path === '/media/editor') return 'mediaEditor';

  const firstSegment = path.slice(1).split('/')[0].replace(/\.html$/, '');
  const key = firstSegment.replace(/-([a-z])/g, (_match, char) => char.toUpperCase()) as PageKey;

  return key in pageLoaders ? key : null;
}

export function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [locationKey, setLocationKey] = useState(window.location.pathname + window.location.search + window.location.hash);

  useEffect(() => {
    sessionStorage.removeItem('ofl_stale_chunk_reload');
  }, [locationKey]);

  useEffect(() => {
    function syncPath() {
      setPathname(window.location.pathname);
      setLocationKey(window.location.pathname + window.location.search + window.location.hash);
      window.scrollTo({ top: 0, left: 0 });
    }

    window.addEventListener('popstate', syncPath);
    return () => {
      window.removeEventListener('popstate', syncPath);
    };
  }, []);

  const pageKey = routeToPage(pathname);

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
    <RouteErrorBoundary key={locationKey}>
      <Suspense fallback={null}>
        <div className="ofl-app-shell">
          <SharedHeader />
          <div className="ofl-page-shell">
            <Page key={`${pageKey}:${locationKey}`} />
          </div>
          <SharedFooter />
          <RedzoneChat pathname={pathname} />
          <GlobalLiveMiniViewer pathname={pathname} />
        </div>
      </Suspense>
    </RouteErrorBoundary>
  );
}
