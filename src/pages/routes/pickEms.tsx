import { useEffect, useMemo, useState } from 'react';

type LeaderboardRow = {
  rank: number;
  profile_id: string;
  roblox_username: string;
  avatar_url: string | null;
  points: number;
  correct: number;
  perfect: number;
  submitted: number;
  accuracy: number;
};

type LeaderboardResponse = {
  setup_required?: boolean;
  leaderboard?: LeaderboardRow[];
  summary?: {
    scored_games: number;
    total_picks: number;
    pickers: number;
    top_score: number;
  };
  viewer?: {
    auth_required: boolean;
    week: string | number | null;
    active_week?: string | number | null;
    available_weeks?: (string | number)[];
    picks: ViewerPick[];
  };
  error?: string;
};

type Team = {
  id: string;
  name: string;
  abbreviation?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
};

type Game = {
  id: string;
  week?: string | number | null;
  game_date?: string | null;
  game_time?: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score?: number | null;
  away_score?: number | null;
  home_team?: Team | null;
  away_team?: Team | null;
};

type Pick = {
  selected_team_id: string;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
};

type ViewerPick = {
  game: Game;
  pick: Pick | null;
  selected_team: Team | null;
  locked: boolean;
  final: boolean;
};

function apiUrl(url: string) {
  const localWeb = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && location.port
    && location.port !== '3000';
  return localWeb && url.startsWith('/api/') ? `http://localhost:3000${url}` : url;
}

function cookieValue(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length) || '';
}

function getToken() {
  const direct = localStorage.getItem('ofl_token') || decodeURIComponent(cookieValue('ofl_token') || '');
  if (direct) return direct;
  try {
    const session = JSON.parse(localStorage.getItem('ofl_session') || 'null');
    return session?.token || session?.access_token || session?.ofl_token || '';
  } catch {
    return '';
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function playerSlug(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function initials(value: string) {
  return String(value || '?').trim().slice(0, 2).toUpperCase() || '?';
}

function teamAbbr(team?: Team | null) {
  return team?.abbreviation || team?.name?.slice(0, 3).toUpperCase() || 'TBD';
}

function teamName(team?: Team | null) {
  return team?.name || 'TBD';
}

function teamLogo(team?: Team | null) {
  if (!team) return <span className="mini-logo">?</span>;
  if (team.logo_url) return <img className="mini-logo" src={team.logo_url} alt="" />;
  return <span className="mini-logo fallback" style={{ background: team.primary_color || '#15233E' }}>{teamAbbr(team).slice(0, 2)}</span>;
}

function gameLabel(game: Game) {
  return `${teamAbbr(game.away_team)} @ ${teamAbbr(game.home_team)}`;
}

function scoreValue(value?: number | null) {
  return value == null ? '-' : String(value);
}

function scoreStatus(item: ViewerPick) {
  if (!item.final || !item.pick) return '';
  const awayScore = Number(item.game.away_score);
  const homeScore = Number(item.game.home_score);
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore) || awayScore === homeScore) return '';
  const winnerId = awayScore > homeScore ? item.game.away_team_id : item.game.home_team_id;
  return String(item.pick.selected_team_id) === String(winnerId) ? 'Correct' : 'Incorrect';
}

function isPerfectPick(item: ViewerPick) {
  if (!item.final || !item.pick) return false;
  const predAway = item.pick.predicted_away_score;
  const predHome = item.pick.predicted_home_score;
  if (predAway == null || predHome == null) return false;
  return Number(predAway) === Number(item.game.away_score) && Number(predHome) === Number(item.game.home_score);
}

export default function PickEmsPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState('');
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    document.title = 'Pick-Ems - OFL';
    const url = selectedWeek ? `/api/pickems/leaderboard?week=${encodeURIComponent(selectedWeek)}` : '/api/pickems/leaderboard';
    fetch(apiUrl(url), { credentials: 'include', cache: 'no-store', headers: authHeaders() })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Pick-Ems returned ${response.status}`);
        return payload as LeaderboardResponse;
      })
      .then(payload => {
        if (!cancelled) setData(payload);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  const rows = data?.leaderboard || [];
  const leader = useMemo(() => rows[0] || null, [rows]);
  const viewer = data?.viewer || null;
  const viewerPicks = viewer?.picks || [];
  const availableWeeks = viewer?.available_weeks || [];

  return (
    <main className="pickems-page">
      <style>{`
        html,body,#root{margin:0;min-height:100%;}
        .ofl-app-shell,.ofl-page-shell{background:var(--paper);min-height:100vh;}
        .pickems-page{min-height:calc(100vh - 78px);background:var(--paper);color:var(--navy);padding:56px 0 90px;}
        .pickems-wrap{width:min(1640px,calc(100% - clamp(28px,4vw,80px)));margin:0 auto;}
        .pickems-eyebrow{font-family:'Space Mono';font-weight:700;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:10px;}
        .pickems-title-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:30px;}
        .pickems-title{font-family:'Anton';font-size:clamp(46px,7vw,84px);text-transform:uppercase;line-height:.9;margin:0;}
        .leader-callout{border:1px solid var(--line-strong);background:var(--navy);color:var(--paper);display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:18px;padding:20px 22px;margin-bottom:24px;}
        .leader-avatar,.player-avatar{width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;overflow:hidden;font-family:'Anton';flex:0 0 auto;}
        .leader-avatar img,.player-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
        .leader-kicker{font-family:'Space Mono';font-weight:700;font-size:12px;letter-spacing:1.8px;text-transform:uppercase;color:var(--paper);opacity:.62;margin-bottom:5px;}
        .leader-name{font-family:'Oswald';font-weight:700;font-size:28px;text-transform:uppercase;line-height:1;}
        .leader-points{font-family:'Anton';font-size:42px;line-height:1;text-align:right;}
        .leader-points span{display:block;font-family:'Space Mono';font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:var(--paper);opacity:.62;margin-top:5px;}
        .leaderboard-card{border:1px solid var(--line-strong);background:var(--paper-2);overflow:hidden;}
        .pickems-content{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,420px);gap:24px;align-items:start;}
        .leaderboard-column{min-width:0;}
        .viewer-card{border:1px solid var(--line-strong);background:var(--paper-2);position:sticky;top:96px;max-height:calc(100vh - 120px);display:flex;flex-direction:column;}
        .viewer-head{flex:0 0 auto;padding:18px 20px;border-bottom:2px solid var(--navy);display:flex;align-items:flex-end;justify-content:space-between;gap:12px;}
        .viewer-title{font-family:'Oswald';font-weight:700;font-size:24px;text-transform:uppercase;line-height:1;margin:0;}
        .viewer-week{font-family:'Space Mono';font-weight:700;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);}
        .viewer-week-select{font-family:'Space Mono';font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--navy);background:var(--paper);border:1px solid var(--line-strong);padding:6px 8px;cursor:pointer;}
        .viewer-list{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;}
        .mini-logo{width:30px;height:30px;object-fit:contain;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;flex:0 0 auto;color:#fff;font-family:'Anton';font-size:12px;}
        .pick-row-compact{display:flex;flex-direction:column;gap:5px;padding:8px 14px;border-left:3px solid var(--line-strong);border-bottom:1px solid var(--line);text-decoration:none;color:inherit;}
        .pick-row-compact:last-child{border-bottom:0;}
        .pick-row-compact.correct{border-left-color:var(--green);background:var(--promote);}
        .pick-row-compact.incorrect{border-left-color:var(--red);background:var(--demote);}
        .pick-row-compact.perfect{border-left-color:#caa14a;}
        .pick-row-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
        .pick-matchup{display:flex;align-items:center;gap:6px;min-width:0;}
        .pick-team{display:flex;align-items:center;gap:5px;padding:2px 6px;border-radius:4px;opacity:.45;transition:opacity .15s;}
        .pick-team .mini-logo{width:18px;height:18px;font-size:8px;}
        .pick-team.picked{opacity:1;background:rgba(21,35,62,.07);}
        .pick-team-abbr{font-family:'Oswald';font-weight:700;font-size:12px;letter-spacing:.4px;text-transform:uppercase;}
        .pick-chip{font-family:'Space Mono';font-weight:700;font-size:8px;letter-spacing:.6px;text-transform:uppercase;background:var(--navy);color:var(--paper);padding:1px 5px;border-radius:3px;}
        .pick-at{font-family:'Anton';font-size:12px;color:var(--muted);}
        .pick-scorelines{display:flex;align-items:center;gap:16px;}
        .pick-scoreline{display:flex;align-items:baseline;gap:6px;}
        .pick-scoreline-label{font-family:'Space Mono';font-weight:700;font-size:9px;letter-spacing:1.1px;text-transform:uppercase;color:var(--muted);}
        .pick-scoreline-value{font-family:'Anton';font-weight:400;font-size:16px;color:var(--navy);letter-spacing:.5px;}
        .pick-scoreline-value.pred{font-size:14px;color:var(--muted);}
        .pick-result-badge{flex:0 0 auto;font-family:'Space Mono';font-weight:700;font-size:9px;letter-spacing:1.1px;text-transform:uppercase;padding:2px 8px;border-radius:3px;}
        .pick-result-badge.correct{background:var(--green);color:#fff;}
        .pick-result-badge.incorrect{background:var(--red);color:#fff;}
        .pick-result-badge.perfect{background:linear-gradient(100deg,#caa14a,#ffd700,#caa14a);color:#2a2102;}
        .empty-row{font-size:17px;color:var(--muted);font-style:italic;text-align:left;padding:24px 18px;}
        .table-wrap{overflow-x:auto;}
        table{width:100%;border-collapse:collapse;min-width:760px;}
        th{font-family:'Space Mono';font-weight:700;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:var(--muted);text-align:center;padding:14px 18px;border-bottom:2px solid var(--navy);white-space:nowrap;}
        th.left{text-align:left;}
        td{padding:15px 18px;border-bottom:1px solid var(--line);text-align:center;font-family:'Oswald';font-weight:700;font-size:18px;white-space:nowrap;}
        tr:last-child td{border-bottom:0;}
        td.left{text-align:left;}
        .rank-cell{font-family:'Anton';font-weight:400;font-size:22px;color:var(--navy);}
        .player-cell{display:flex;align-items:center;gap:12px;min-width:0;color:inherit;text-decoration:none;}
        .player-name{font-family:'Oswald';font-weight:700;font-size:19px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
        .points-cell,.metric-cell{font-family:'Anton';font-weight:400;font-size:21px;color:var(--navy);line-height:1;letter-spacing:.2px;}
        .perfect-pick-gold{position:relative;background:linear-gradient(100deg,#caa14a 0%,#fff3c4 22%,#ffd700 45%,#fff8dd 60%,#caa14a 100%);background-size:250% auto;-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 12px rgba(255,215,0,.6);animation:perfectPickShine 2.4s linear infinite;}
        @keyframes perfectPickShine{0%{background-position:0% 50%;}100%{background-position:250% 50%;}}
        .empty,.error{border:1px solid var(--line-strong);background:var(--paper-2);padding:26px;font-size:17px;color:var(--muted);font-style:italic;}
        .error{color:var(--red);}
        @media(max-width:1100px){.pickems-content{grid-template-columns:1fr;}.viewer-card{position:static;max-height:520px;}}
        @media(max-width:900px){.leader-callout{grid-template-columns:auto minmax(0,1fr);}.leader-points{grid-column:1/-1;text-align:left;}}
        @media(max-width:620px){.pickems-page{padding-top:38px;}.leader-callout{grid-template-columns:1fr;}.leader-avatar{width:64px;height:64px;}}
      `}</style>
      <div className="pickems-wrap">
        <div className="pickems-eyebrow">// Community Picks</div>
        <div className="pickems-title-row">
          <h1 className="pickems-title">Pick-Ems</h1>
        </div>

        {error ? <div className="error">Could not load Pick-Ems leaderboard. {error}</div> : null}
        {!error && !data ? <div className="empty">Loading Pick-Ems leaderboard...</div> : null}
        {!error && data?.setup_required ? <div className="error">Pick-Ems storage is not set up yet.</div> : null}

        {!error && data && !data.setup_required ? (
          <>
            {leader ? (
              <section className="leader-callout">
                <div className="leader-avatar">
                  {leader.avatar_url ? <img src={leader.avatar_url} alt="" /> : initials(leader.roblox_username)}
                </div>
                <div>
                  <div className="leader-kicker">Current Leader</div>
                  <div className="leader-name">{leader.roblox_username}</div>
                </div>
                <div className="leader-points">{leader.points}<span>points</span></div>
              </section>
            ) : null}

            <section className="pickems-content">
              <div className="leaderboard-column">
                <section className="leaderboard-card">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th className="left">#</th>
                          <th className="left">Player</th>
                          <th>PTS</th>
                          <th>Correct</th>
                          <th>Perfect Picks</th>
                          <th>Picks</th>
                          <th>Accuracy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length ? rows.map(row => (
                          <tr key={row.profile_id}>
                            <td className="left rank-cell">#{row.rank}</td>
                            <td className="left">
                              <a className="player-cell" href={`/players/${playerSlug(row.roblox_username)}`}>
                                <span className="player-avatar">{row.avatar_url ? <img src={row.avatar_url} alt="" /> : initials(row.roblox_username)}</span>
                                <span className="player-name">{row.roblox_username}</span>
                              </a>
                            </td>
                            <td className="points-cell">{row.points}</td>
                            <td className="metric-cell">{row.correct}</td>
                            <td className={`metric-cell${row.perfect > 0 ? ' perfect-pick-gold' : ''}`}>{row.perfect}</td>
                            <td className="metric-cell">{row.submitted}</td>
                            <td className="metric-cell">{row.accuracy}%</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={7} className="empty-row">No scored Pick-Ems yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <aside className="viewer-card">
                <div className="viewer-head">
                  <h2 className="viewer-title">Your Picks</h2>
                  {availableWeeks.length ? (
                    <select
                      className="viewer-week-select"
                      value={selectedWeek ?? String(viewer?.week ?? '')}
                      onChange={event => setSelectedWeek(event.target.value)}
                    >
                      {availableWeeks.map(week => (
                        <option key={week} value={String(week)}>
                          Week {week}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="viewer-week">{viewer?.week ? `Week ${viewer.week}` : 'This Week'}</span>
                  )}
                </div>
                {viewer?.auth_required ? (
                  <div className="empty-row">Sign in to view your weekly picks.</div>
                ) : viewerPicks.length ? (
                  <div className="viewer-list">
                    {viewerPicks.map(item => {
                      const status = scoreStatus(item).toLowerCase();
                      const perfect = isPerfectPick(item);
                      const awayPicked = !!item.pick && String(item.pick.selected_team_id) === String(item.game.away_team_id);
                      const homePicked = !!item.pick && String(item.pick.selected_team_id) === String(item.game.home_team_id);
                      const badgeLabel = perfect ? 'Perfect' : scoreStatus(item);
                      const badgeClass = perfect ? 'perfect' : status;
                      return (
                        <a className={`pick-row-compact ${status}${perfect ? ' perfect' : ''}`} href={`/box-score/${item.game.id}`} key={item.game.id} title={gameLabel(item.game)}>
                          <div className="pick-row-head">
                            <div className="pick-matchup">
                              <div className={`pick-team${awayPicked ? ' picked' : ''}`}>
                                {teamLogo(item.game.away_team)}
                                <span className="pick-team-abbr">{teamAbbr(item.game.away_team)}</span>
                                {awayPicked && <span className="pick-chip">Pick</span>}
                              </div>
                              <span className="pick-at">@</span>
                              <div className={`pick-team${homePicked ? ' picked' : ''}`}>
                                {teamLogo(item.game.home_team)}
                                <span className="pick-team-abbr">{teamAbbr(item.game.home_team)}</span>
                                {homePicked && <span className="pick-chip">Pick</span>}
                              </div>
                            </div>
                            {badgeLabel && <span className={`pick-result-badge ${badgeClass}`}>{badgeLabel}</span>}
                          </div>
                          <div className="pick-scorelines">
                            <div className="pick-scoreline">
                              <span className="pick-scoreline-label">Final</span>
                              <span className="pick-scoreline-value">{scoreValue(item.game.away_score)} – {scoreValue(item.game.home_score)}</span>
                            </div>
                            <div className="pick-scoreline">
                              <span className="pick-scoreline-label">Your Pick</span>
                              <span className={`pick-scoreline-value pred${perfect ? ' perfect-pick-gold' : ''}`}>{scoreValue(item.pick?.predicted_away_score)} – {scoreValue(item.pick?.predicted_home_score)}</span>
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-row">No games found for this week.</div>
                )}
              </aside>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
