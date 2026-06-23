import { useEffect, useId, useMemo, useRef, useState } from 'react';

type Team = {
  id?: string;
  name?: string;
  abbreviation?: string;
  logo_url?: string;
};

type Game = {
  id: string;
  home_team_id?: string;
  away_team_id?: string;
  home_team?: Team | null;
  away_team?: Team | null;
  home_score?: number | null;
  away_score?: number | null;
  game_date?: string | null;
  game_time?: string | null;
  twitch_url?: string | null;
};

type LiveViewState = {
  viewMode?: 'single' | 'quad';
  activeId?: string;
  slotIds?: Array<string | null>;
};

type GlobalLiveMiniViewerProps = {
  pathname: string;
};

function apiUrl(url: string) {
  const localWeb = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && location.port
    && location.port !== '3000';
  return localWeb && url.startsWith('/api/') ? `http://localhost:3000${url}` : url;
}

function parseGameStartTime(date?: string | null, time?: string | null) {
  const raw = String(time || '').trim();
  if (!date || !raw) return NaN;
  const zoneAdjusted = raw
    .replace(/\bEST\b/i, 'GMT-0500')
    .replace(/\bEDT\b/i, 'GMT-0400')
    .replace(/\bET\b/i, 'GMT-0500');
  const parsed = Date.parse(`${date} ${zoneAdjusted}`);
  return Number.isNaN(parsed) ? Date.parse(`${date} ${raw}`) : parsed;
}

function isGameLive(game: Game) {
  if (game.home_score != null && game.away_score != null) return false;
  const start = parseGameStartTime(game.game_date, game.game_time);
  return Number.isFinite(start) && Date.now() >= start;
}

function twitchChannelFromUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, location.origin);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.endsWith('twitch.tv')) return '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';
    const first = parts[0].toLowerCase();
    if (['videos', 'directory', 'downloads', 'p', 'team', 'collections', 'clip', 'clips'].includes(first)) return '';
    return parts[0];
  } catch {
    const match = raw.match(/twitch\.tv\/([^/?#]+)/i);
    return match ? match[1] : '';
  }
}

function twitchEmbedSrc(value?: string | null) {
  const channel = twitchChannelFromUrl(value);
  if (!channel) return '';
  const parent = encodeURIComponent(location.hostname || 'localhost');
  return `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${parent}&autoplay=false&muted=false`;
}

declare global {
  interface Window {
    Twitch?: {
      Player: new (targetId: string, options: Record<string, unknown>) => {
        play?: () => void;
        setChannel?: (channel: string) => void;
        setVolume?: (volume: number) => void;
      };
    };
    __oflTwitchSdkPromise?: Promise<void>;
  }
}

function loadTwitchSdk() {
  if (window.Twitch?.Player) return Promise.resolve();
  if (window.__oflTwitchSdkPromise) return window.__oflTwitchSdkPromise;
  window.__oflTwitchSdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ofl-twitch-sdk="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Twitch player SDK')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://player.twitch.tv/js/embed/v1.js';
    script.async = true;
    script.dataset.oflTwitchSdk = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Twitch player SDK'));
    document.head.appendChild(script);
  });
  return window.__oflTwitchSdkPromise;
}

function TwitchSdkPlayer({ channel, title }: { channel: string; title: string }) {
  const reactId = useId().replace(/:/g, '');
  const targetId = `ofl-twitch-player-${reactId}`;
  const playerRef = useRef<{ play?: () => void; setChannel?: (channel: string) => void; setVolume?: (volume: number) => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTwitchSdk()
      .then(() => {
        if (cancelled || !window.Twitch?.Player) return;
        const parent = [location.hostname || 'localhost'];
        if (playerRef.current?.setChannel) {
          playerRef.current.setChannel(channel);
          playerRef.current.play?.();
          return;
        }
        playerRef.current = new window.Twitch.Player(targetId, {
          width: '100%',
          height: '100%',
          channel,
          parent,
          autoplay: false,
          muted: false
        });
        playerRef.current.setVolume?.(0.5);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [channel, targetId]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible') playerRef.current?.play?.();
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  return <div id={targetId} className="global-live-mini-sdk-player" title={title} />;
}

function abbr(team?: Team | null) {
  return (team?.abbreviation || team?.name?.slice(0, 3) || '???').toUpperCase();
}

function matchup(game: Game) {
  return `${abbr(game.away_team)} @ ${abbr(game.home_team)}`;
}

function readLiveViewState(): LiveViewState {
  try {
    return JSON.parse(localStorage.getItem('ofl_live_view_state') || '{}') || {};
  } catch {
    return {};
  }
}

export function GlobalLiveMiniViewer({ pathname }: GlobalLiveMiniViewerProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [activeId, setActiveId] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [viewState, setViewState] = useState<LiveViewState>(() => readLiveViewState());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(apiUrl(`/api/games?liveMini=${Date.now()}`), {
          cache: 'no-store',
          credentials: 'include'
        });
        const json = await response.json();
        if (cancelled) return;
        const liveGames = (json.games || [])
          .filter((game: Game) => game.twitch_url && isGameLive(game) && twitchEmbedSrc(game.twitch_url));
        setGames(liveGames);
        setActiveId((current) => liveGames.some((game: Game) => game.id === current) ? current : (liveGames[0]?.id || ''));
      } catch {
        if (!cancelled) setGames([]);
      }
    }

    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function sync(event?: Event) {
      const custom = event as CustomEvent<LiveViewState>;
      setViewState(custom?.detail || readLiveViewState());
    }

    window.addEventListener('ofl-live-view-state', sync as EventListener);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('ofl-live-view-state', sync as EventListener);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const activeGame = useMemo(
    () => games.find((game) => game.id === (viewState.activeId || activeId)) || games.find((game) => game.id === activeId) || games[0],
    [games, activeId, viewState.activeId]
  );

  const activeChannel = twitchChannelFromUrl(activeGame?.twitch_url);
  const onHome = (pathname.replace(/\/+$/, '') || '/') === '/';
  if (onHome || !activeGame || !activeChannel) return null;

  const quadGames = (viewState.slotIds || [])
    .map((id) => id ? games.find((game) => game.id === id) || null : null)
    .slice(0, 4);
  while (quadGames.length < 4) quadGames.push(null);
  const showQuad = viewState.viewMode === 'quad' && quadGames.some(Boolean);

  return (
    <>
      <style>{`
        .global-live-mini{position:fixed;right:22px;bottom:22px;width:min(560px,calc(100vw - 44px));background:#05070c;color:#fff;border:1px solid rgba(248,250,252,.42);box-shadow:0 20px 50px rgba(0,0,0,.42);z-index:3000;}
        .global-live-mini-head{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#111827;border-top:4px solid var(--red,#9F3622);padding:10px 12px;}
        .global-live-mini-title{display:flex;align-items:center;gap:10px;min-width:0;font-family:'Oswald';font-weight:700;text-transform:uppercase;letter-spacing:.8px;font-size:14px;}
        .global-live-mini-live{font-family:'Space Mono';font-size:9px;letter-spacing:1.5px;background:var(--red,#9F3622);border-radius:999px;padding:5px 7px;white-space:nowrap;}
        .global-live-mini-matchup{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .global-live-mini-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
        .global-live-mini button{appearance:none;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#fff;font-family:'Space Mono';font-weight:700;font-size:11px;line-height:1;padding:8px 9px;cursor:pointer;}
        .global-live-mini button:hover{background:var(--red,#9F3622);border-color:var(--red,#9F3622);}
        .global-live-mini-tabs{display:flex;gap:6px;overflow-x:auto;background:#0F172A;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.14);}
        .global-live-mini-tab{white-space:nowrap;}
        .global-live-mini-tab.active{background:#6441a5;border-color:#9146ff;}
        .global-live-mini-frame{aspect-ratio:16/9;background:#000;}
        .global-live-mini-frame iframe,.global-live-mini-sdk-player,.global-live-mini-sdk-player iframe{display:block;width:100%;height:100%;border:0;}
        .global-live-mini-quad{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:rgba(255,255,255,.16);}
        .global-live-mini-quad-cell{background:#000;min-width:0;}
        .global-live-mini-quad-label{font-family:'Space Mono';font-size:9px;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.8);background:#111827;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .global-live-mini-quad-frame{aspect-ratio:16/9;background:#000;}
        .global-live-mini-quad-frame iframe,.global-live-mini-quad-frame .global-live-mini-sdk-player,.global-live-mini-quad-frame .global-live-mini-sdk-player iframe{display:block;width:100%;height:100%;border:0;}
        .global-live-mini-quad-empty{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.42);font-family:'Space Mono';font-size:9px;letter-spacing:1px;text-transform:uppercase;background:#05070c;}
        .global-live-mini.collapsed{width:auto;min-width:230px;}
        .global-live-mini.collapsed .global-live-mini-tabs,.global-live-mini.collapsed .global-live-mini-frame,.global-live-mini.collapsed .global-live-mini-quad{display:none;}
        @media(max-width:640px){.global-live-mini{left:12px;right:12px;bottom:12px;width:auto;}.global-live-mini-title{font-size:12px;}}
      `}</style>
      <aside className={`global-live-mini${collapsed ? ' collapsed' : ''}`} aria-label="Live OFL stream">
        <div className="global-live-mini-head">
          <div className="global-live-mini-title">
            <span className="global-live-mini-live">LIVE</span>
            <span className="global-live-mini-matchup">{showQuad ? 'OFL QUAD BOX' : matchup(activeGame)}</span>
          </div>
          <div className="global-live-mini-actions">
            <button type="button" onClick={() => setCollapsed((value) => !value)}>{collapsed ? 'SHOW' : 'HIDE'}</button>
          </div>
        </div>
        {games.length > 1 && (
          <div className="global-live-mini-tabs">
            {games.map((game) => (
              <button
                key={game.id}
                className={`global-live-mini-tab${game.id === activeGame.id ? ' active' : ''}`}
                type="button"
                onClick={() => setActiveId(game.id)}
              >
                {matchup(game)}
              </button>
            ))}
          </div>
        )}
        {showQuad ? (
          <div className="global-live-mini-quad">
            {quadGames.map((game, index) => {
              const quadChannel = twitchChannelFromUrl(game?.twitch_url);
              return (
                <div className="global-live-mini-quad-cell" key={`${game?.id || 'empty'}-${index}`}>
                  <div className="global-live-mini-quad-label">{game ? matchup(game) : 'Open Slot'}</div>
                  {game && quadChannel ? (
                    <div className="global-live-mini-quad-frame">
                      <TwitchSdkPlayer channel={quadChannel} title={`${matchup(game)} live stream`} />
                    </div>
                  ) : (
                    <div className="global-live-mini-quad-empty">No Stream</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="global-live-mini-frame">
            <TwitchSdkPlayer channel={activeChannel} title={`${matchup(activeGame)} live stream`} />
          </div>
        )}
      </aside>
    </>
  );
}
