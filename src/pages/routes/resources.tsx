import { useEffect, useState } from 'react';

type DfoTeam = {
  team_id: string;
  name: string;
  abbreviation?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  is_dpp: boolean;
  graphics_posted: number;
  graphics_required: number;
  statements_posted: number;
  statements_required: number;
};

function apiUrl(url: string) {
  const localWeb = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    && location.port
    && location.port !== '3000';
  return localWeb && url.startsWith('/api/') ? `http://localhost:3000${url}` : url;
}

function teamInitials(team: DfoTeam) {
  return (team.abbreviation || team.name || '?').slice(0, 3).toUpperCase();
}

function statBar(posted: number, required: number) {
  const pct = required > 0 ? Math.min(100, Math.round((posted / required) * 100)) : 0;
  return (
    <div className="dfo-bar-track">
      <div className="dfo-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ResourcesPage() {
  const [teams, setTeams] = useState<DfoTeam[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    document.title = 'Resources - OFL';
    fetch(apiUrl('/api/dfo-log'), { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Resources returned ${response.status}`);
        return payload as { teams?: DfoTeam[] };
      })
      .then(payload => {
        if (!cancelled) setTeams(payload.teams || []);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="resources-page">
      <style>{`
        html,body,#root{margin:0;min-height:100%;}
        .ofl-app-shell,.ofl-page-shell{background:var(--paper);min-height:100vh;}
        .resources-page{min-height:calc(100vh - 78px);background:var(--paper);color:var(--navy);padding:56px 0 90px;}
        .resources-wrap{width:min(1640px,calc(100% - clamp(28px,4vw,80px)));margin:0 auto;}
        .resources-eyebrow{font-family:'Space Mono';font-weight:700;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:10px;}
        .resources-title{font-family:'Anton';font-size:clamp(46px,7vw,84px);text-transform:uppercase;line-height:.9;margin:0 0 8px;}
        .resources-sub{font-family:'Oswald';font-size:16px;color:var(--muted);margin-bottom:30px;}
        .resources-tabs{display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap;}
        .resources-tab{font-family:'Space Mono';font-weight:700;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;padding:8px 16px;border:1px solid var(--line-strong);background:var(--navy);color:var(--paper);}
        .dfo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;}
        .dfo-card{border:1px solid var(--line-strong);background:var(--paper-2);padding:18px;}
        .dfo-card-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;}
        .dfo-logo{width:40px;height:40px;border-radius:8px;object-fit:cover;flex:0 0 auto;}
        .dfo-logo-fallback{display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Anton';font-size:12px;}
        .dfo-card-name{font-family:'Oswald';font-weight:700;font-size:17px;text-transform:uppercase;}
        .dfo-dpp-tag{font-family:'Space Mono';font-weight:700;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
        .dfo-stat-row{margin-bottom:10px;}
        .dfo-stat-row:last-of-type{margin-bottom:0;}
        .dfo-stat-head{display:flex;justify-content:space-between;font-family:'Space Mono';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:5px;}
        .dfo-bar-track{height:8px;background:var(--line);border-radius:4px;overflow:hidden;}
        .dfo-bar-fill{height:100%;background:var(--red);}
        .empty,.error{border:1px solid var(--line-strong);background:var(--paper-2);padding:26px;font-size:17px;color:var(--muted);font-style:italic;}
        .error{color:var(--red);}
      `}</style>
      <div className="resources-wrap">
        <div className="resources-eyebrow">// League Resources</div>
        <h1 className="resources-title">Resources</h1>
        <p className="resources-sub">DFO progress tracking for every team. More resources coming soon.</p>

        {error ? <div className="error">Could not load DFO Log. {error}</div> : null}
        {!error && !teams ? <div className="empty">Loading DFO Log...</div> : null}

        {!error && teams ? (
          teams.length ? (
            <div className="dfo-grid">
              {teams.map(team => (
                <div className="dfo-card" key={team.team_id}>
                  <div className="dfo-card-head">
                    {team.logo_url ? (
                      <img className="dfo-logo" src={team.logo_url} alt="" />
                    ) : (
                      <span className="dfo-logo dfo-logo-fallback" style={{ background: team.primary_color || '#15233E' }}>
                        {teamInitials(team)}
                      </span>
                    )}
                    <div>
                      <div className="dfo-card-name">{team.name}</div>
                      <div className="dfo-dpp-tag">{team.is_dpp ? 'DPP' : 'Non-DPP'}</div>
                    </div>
                  </div>
                  <div className="dfo-stat-row">
                    <div className="dfo-stat-head">
                      <span>Graphics</span>
                      <span>{team.graphics_posted}/{team.graphics_required}</span>
                    </div>
                    {statBar(team.graphics_posted, team.graphics_required)}
                  </div>
                  <div className="dfo-stat-row">
                    <div className="dfo-stat-head">
                      <span>Statements</span>
                      <span>{team.statements_posted}/{team.statements_required}</span>
                    </div>
                    {statBar(team.statements_posted, team.statements_required)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">No teams found.</div>
          )
        ) : null}
      </div>
    </main>
  );
}
