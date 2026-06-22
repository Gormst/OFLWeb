import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { LegacyPage } from './LegacyPage';
import { pageLoaders, type PageKey } from './pages/manifest';
import { isLegacyPageData } from './pages/types';
import { SharedFooter } from './SharedFooter';
import { SharedHeader } from './SharedHeader';

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
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
      const module = await pageLoaders[key]();
      const PageModule = module.default;
      return {
        default: isLegacyPageData(PageModule)
          ? () => <LegacyPage page={PageModule} />
          : PageModule
      };
    });
}

function routeToPage(pathname: string): PageKey | null {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/index') return 'home';
  if (path.startsWith('/teams/')) return 'teams';
  if (path.startsWith('/box-score/')) return 'boxScore';
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
    <RouteErrorBoundary>
      <Suspense fallback={null}>
        <div className="ofl-app-shell">
          <SharedHeader />
          <div className="ofl-page-shell">
            <Page key={pageKey} />
          </div>
          <SharedFooter />
        </div>
      </Suspense>
    </RouteErrorBoundary>
  );
}
