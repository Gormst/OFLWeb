import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Team = {
  id: string;
  name: string;
  abbreviation?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
};

type PickEmsGame = {
  id: string;
  away_team_id: string;
  home_team_id: string;
  game_date?: string | null;
  away_team?: Team | null;
  home_team?: Team | null;
  away_score?: number | null;
  home_score?: number | null;
};

function todayLocalDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type ViewerPick = {
  game: PickEmsGame;
  pick: { selected_team_id: string; predicted_away_score?: number | null; predicted_home_score?: number | null } | null;
  final: boolean;
};

type RedzonePickEmsProps = {
  pathname: string;
};

function apiUrl(url: string) {
  const localWeb = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && location.port
    && location.port !== '3000';
  return localWeb && url.startsWith('/api/') ? `http://localhost:3000${url}` : url;
}

function authHeaders() {
  const token = localStorage.getItem('ofl_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function teamAbbr(team?: Team | null) {
  return team?.abbreviation || team?.name?.slice(0, 2).toUpperCase() || '??';
}

function scoreValue(value?: number | null) {
  return value == null ? '-' : String(value);
}

function pickStatus(item: ViewerPick) {
  if (!item.final || !item.pick) return '';
  const awayScore = Number(item.game.away_score);
  const homeScore = Number(item.game.home_score);
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore) || awayScore === homeScore) return '';
  const winnerId = awayScore > homeScore ? item.game.away_team_id : item.game.home_team_id;
  return String(item.pick.selected_team_id) === String(winnerId) ? 'correct' : 'incorrect';
}

function TeamLogo({ team, className }: { team?: Team | null; className: string }) {
  if (!team) return <span className={className}>?</span>;
  if (team.logo_url) return <img className={className} src={team.logo_url} alt="" />;
  return (
    <span className={`${className} rzpe-logo-fb`} style={{ background: team.primary_color || '#15233E' }}>
      {teamAbbr(team)}
    </span>
  );
}

function isLocalhost() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

export function RedzonePickEms({ pathname }: RedzonePickEmsProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [picks, setPicks] = useState<ViewerPick[]>([]);
  const [index, setIndex] = useState(0);
  const isHome = pathname === '/' || pathname === '/index';

  useEffect(() => {
    if (!isHome || !isLocalhost()) {
      setTarget(null);
      return;
    }

    function syncTarget() {
      setTarget(document.getElementById('redzonePickEmsMount'));
    }

    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isHome]);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(apiUrl('/api/pickems/leaderboard'), {
          credentials: 'include',
          cache: 'no-store',
          headers: authHeaders()
        });
        const payload = await response.json().catch(() => ({}));
        const list = Array.isArray(payload?.viewer?.picks) ? payload.viewer.picks : [];
        if (!cancelled) setPicks(list);
      } catch {
        if (!cancelled) setPicks([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target) return null;

  const today = todayLocalDateKey();
  const todaysPicks = picks.filter(item => item.game.game_date === today && item.pick);
  const safeIndex = todaysPicks.length ? Math.min(index, todaysPicks.length - 1) : 0;
  const current = todaysPicks[safeIndex];

  function go(delta: number) {
    if (!todaysPicks.length) return;
    setIndex(prev => (prev + delta + todaysPicks.length) % todaysPicks.length);
  }

  function closePanel() {
    const panel = target?.closest('.live-side-panel');
    if (!panel) return;
    panel.classList.remove('picks-open');
    const chatTab = panel.querySelector<HTMLElement>('.live-side-tab[data-side-tab="chat"]');
    const picksTab = panel.querySelector<HTMLElement>('.live-side-tab[data-side-tab="picks"]');
    chatTab?.classList.add('active');
    picksTab?.classList.remove('active');
  }

  let card = null;
  if (current) {
    const isAwayPick = String(current.pick?.selected_team_id) === String(current.game.away_team_id);
    const pickedTeam = isAwayPick ? current.game.away_team : current.game.home_team;
    const opponentTeam = isAwayPick ? current.game.home_team : current.game.away_team;
    const pickedScore = isAwayPick ? current.game.away_score : current.game.home_score;
    const opponentScore = isAwayPick ? current.game.home_score : current.game.away_score;
    const predictedPickedScore = isAwayPick ? current.pick?.predicted_away_score : current.pick?.predicted_home_score;
    const predictedOpponentScore = isAwayPick ? current.pick?.predicted_home_score : current.pick?.predicted_away_score;
    const mainScore = current.final ? pickedScore : predictedPickedScore;
    const mainOpponentScore = current.final ? opponentScore : predictedOpponentScore;
    const status = pickStatus(current);

    card = (
      <a className={`rzpe-card ${status}`} href={`/box-score/${current.game.id}`}>
        <div className="rzpe-card-pick">
          <TeamLogo team={pickedTeam} className="rzpe-card-logo" />
          <span className="rzpe-card-name">{teamAbbr(pickedTeam)}</span>
          <span className="rzpe-card-tag">Your Pick</span>
        </div>
        <div className="rzpe-card-score">
          {scoreValue(mainScore)} <span className="rzpe-card-dash">–</span> {scoreValue(mainOpponentScore)}
        </div>
        <div className="rzpe-card-pred">
          {current.final
            ? `Predicted ${scoreValue(predictedPickedScore)}-${scoreValue(predictedOpponentScore)}`
            : 'Predicted Score'}
        </div>
        <div className="rzpe-card-opp">
          <span>vs</span>
          <TeamLogo team={opponentTeam} className="rzpe-card-opp-logo" />
          <span>{teamAbbr(opponentTeam)}</span>
        </div>
      </a>
    );
  }

  return createPortal(
    <aside className="redzone-pickems" aria-label="Today's Picks">
      <style>{`
        .redzone-pickems{background:#0a0a0a;color:#fff;height:100%;display:flex;flex-direction:column;}
        .redzone-pickems__head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;font-family:'Space Mono',monospace;font-weight:700;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.62);}
        .rzpe-close{appearance:none;border:0;background:none;color:#E0151A;font-family:'Anton';font-size:16px;line-height:1;cursor:pointer;padding:0;}
        .rzpe-close:hover{color:#FF3B3B;}
        .rzpe-carousel{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:10px 14px;}
        .rzpe-carousel-row{display:flex;align-items:center;gap:10px;width:100%;}
        .rzpe-arrow{appearance:none;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fff;width:32px;height:32px;flex:0 0 auto;border-radius:50%;font-family:'Anton';font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
        .rzpe-arrow:hover{background:#E0151A;border-color:#E0151A;}
        .redzone-pickems__empty{flex:1;display:flex;align-items:center;justify-content:center;font-family:'Space Mono',monospace;font-size:12px;letter-spacing:.5px;color:rgba(255,255,255,.5);text-align:center;padding:18px;}
        .rzpe-card{flex:1;min-width:0;background:#000;border:3px solid rgba(255,255,255,.18);border-radius:8px;padding:18px 14px;display:flex;flex-direction:column;align-items:center;gap:6px;text-decoration:none;color:#fff;}
        .rzpe-card.correct{border-color:#3fb950;box-shadow:0 0 16px rgba(63,185,80,.35);}
        .rzpe-card.incorrect{border-color:#E0151A;box-shadow:0 0 16px rgba(224,21,26,.35);}
        .rzpe-card-pick{display:flex;flex-direction:column;align-items:center;gap:4px;}
        .rzpe-card-logo{width:48px;height:48px;object-fit:contain;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-family:'Anton';font-size:15px;}
        .rzpe-card-name{font-family:'Oswald';font-weight:700;font-size:16px;text-transform:uppercase;}
        .rzpe-card-tag{font-family:'Space Mono';font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.5);}
        .rzpe-card-score{font-family:'Anton';font-size:30px;margin-top:6px;}
        .rzpe-card-dash{color:rgba(255,255,255,.4);font-size:18px;}
        .rzpe-card-pred{font-family:'Space Mono';font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:rgba(255,255,255,.55);}
        .rzpe-card-opp{display:flex;align-items:center;gap:6px;margin-top:6px;font-family:'Space Mono';font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:rgba(255,255,255,.6);}
        .rzpe-card-opp-logo{width:20px;height:20px;object-fit:contain;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-family:'Anton';font-size:9px;}
        .rzpe-dots{flex:0 0 auto;display:flex;justify-content:center;gap:6px;padding-bottom:12px;}
        .rzpe-dot{width:7px;height:7px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:transparent;padding:0;cursor:pointer;}
        .rzpe-dot.active{background:#E0151A;border-color:#E0151A;}
      `}</style>
      <div className="redzone-pickems__head">
        <span>Today's Picks</span>
        <button type="button" className="rzpe-close" onClick={closePanel} aria-label="Close">✕</button>
      </div>
      {!todaysPicks.length && <div className="redzone-pickems__empty">No picks today.</div>}
      {!!todaysPicks.length && (
        <>
          <div className="rzpe-carousel">
            <div className="rzpe-carousel-row">
              {todaysPicks.length > 1 && (
                <button type="button" className="rzpe-arrow" onClick={() => go(-1)} aria-label="Previous pick">‹</button>
              )}
              {card}
              {todaysPicks.length > 1 && (
                <button type="button" className="rzpe-arrow" onClick={() => go(1)} aria-label="Next pick">›</button>
              )}
            </div>
          </div>
          {todaysPicks.length > 1 && (
            <div className="rzpe-dots">
              {todaysPicks.map((item, i) => (
                <button
                  key={item.game.id}
                  type="button"
                  className={`rzpe-dot ${i === safeIndex ? 'active' : ''}`}
                  onClick={() => setIndex(i)}
                  aria-label={`Pick ${i + 1}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </aside>,
    target
  );
}
