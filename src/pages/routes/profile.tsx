import type { LegacyPageData } from '../types';

const page = {
  file: 'profile.html',
  title: 'Profile - OFL',
  styles: `
  :root{--paper:#ECE4CF;--paper-2:#E4DAC0;--navy:#15233E;--red:#9F3622;--red-bright:#B23E26;--muted:#6B6253;--green:#3c7a4e;--line:rgba(21,35,62,.16);--line-strong:rgba(21,35,62,.32);}
  *{margin:0;padding:0;box-sizing:border-box;}body{background:var(--paper);color:var(--navy);font-family:'Spectral',Georgia,serif;min-height:100vh;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");}
  a{color:inherit;text-decoration:none;}.wrap{width:min(1800px,calc(100% - 80px));min-width:min(1240px,calc(100% - 28px));margin:0 auto;padding:0;}
  header{position:sticky;top:0;z-index:50;background:var(--paper);border-bottom:1px solid var(--navy);}.nav{display:flex;align-items:center;justify-content:flex-start;gap:28px;height:78px;width:100%;min-width:0;margin:0;padding:0;}.brand{display:flex;align-items:center;gap:0;flex:0 0 auto;margin-left:18px;}.brand img{height:44px;width:44px;object-fit:contain;}.brand .logo-fallback{height:44px;width:44px;border:2px solid var(--navy);display:flex;align-items:center;justify-content:center;font-family:'Anton';font-size:15px;}nav.links{display:flex;gap:34px;margin-right:auto;}nav.links a{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1.5px;padding:4px 0;position:relative;}nav.links a:hover{color:var(--red);}
  .account-wrap{position:relative;margin-right:28px;}.account{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;}.account img{width:38px;height:38px;border-radius:50%;border:2px solid var(--navy);object-fit:cover;}.account .uname{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1px;}.account .chev{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid var(--navy);transition:transform .2s;}.account-wrap.open .chev{transform:rotate(180deg);}.dropdown{position:absolute;top:calc(100% + 12px);right:0;min-width:190px;background:var(--paper);border:1px solid var(--navy);opacity:0;visibility:hidden;transform:translateY(-6px);transition:all .18s ease;box-shadow:0 14px 30px rgba(21,35,62,.16);}.account-wrap.open .dropdown{opacity:1;visibility:visible;transform:none;}.dropdown a{display:block;font-family:'Oswald';font-weight:500;font-size:14px;text-transform:uppercase;letter-spacing:1px;padding:14px 18px;border-bottom:1px solid var(--line);}.dropdown a:last-child{border-bottom:none;}.dropdown a:hover{background:var(--navy);color:var(--paper);}.dropdown a.admin,.dropdown a.logout{color:var(--red);}.dropdown a.admin:hover,.dropdown a.logout:hover{background:var(--red);color:var(--paper);}@media(max-width:820px){nav.links{display:none;}.account-wrap{margin-left:auto;}}
  .page{padding:0 0 90px;}.gate{max-width:520px;margin:80px auto;text-align:center;}.gate h2{font-family:'Oswald';font-size:34px;text-transform:uppercase;margin-bottom:12px;}.gate p{font-size:17px;font-style:italic;color:var(--muted);margin-bottom:24px;}.gate a{font-family:'Oswald';font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:2px;background:var(--navy);color:var(--paper);padding:14px 26px;display:inline-block;}
  .hero{position:relative;display:grid;grid-template-columns:210px minmax(220px,1fr) 260px 360px;gap:24px;align-items:center;min-height:190px;background:rgba(255,255,255,.55);border-bottom:1px solid var(--line-strong);padding:24px 34px;overflow:hidden;}.hero::before{content:'';position:absolute;inset:0 auto 0 0;width:330px;background:linear-gradient(120deg,rgba(159,54,34,.18),rgba(21,35,62,.08));clip-path:polygon(0 0,75% 0,48% 100%,0 100%);}.hero-avatar{position:relative;z-index:1;width:160px;height:160px;border:0;border-radius:0;object-fit:cover;background:var(--paper-2);align-self:end;}.eyebrow{font-family:'Space Mono';font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--red);margin-bottom:7px;}h1{font-family:'Oswald';font-weight:500;font-size:34px;text-transform:uppercase;line-height:1.08;letter-spacing:0;}.hero-meta{font-family:'Oswald';font-size:14px;color:var(--navy);margin-top:10px;}.team-pill{display:inline-flex;align-items:center;gap:8px;background:transparent;border:0;padding:0;min-width:0;margin-top:8px;}.team-logo{width:24px;height:24px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;font-family:'Anton';font-size:9px;flex:0 0 auto;}.team-logo img{width:100%;height:100%;object-fit:contain;}.team-pill .label{display:none;}.team-pill .name{font-family:'Oswald';font-weight:600;text-transform:none;line-height:1.05;}
  .hero-facts{display:grid;grid-template-columns:88px 1fr;gap:8px 14px;border-left:1px dotted var(--line-strong);padding-left:22px;font-family:'Oswald';font-size:14px;}.hero-facts .k{color:var(--muted);font-family:'Space Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;}.hero-facts .v{font-weight:700;}.status-dot{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;margin-right:5px;}.season-card{border:1px solid var(--line-strong);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.48);}.season-card h2{font-family:'Oswald';font-size:13px;text-align:center;text-transform:uppercase;background:var(--navy);color:#fff;padding:8px;}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:0;}.summary-card{background:transparent;border:0;border-right:1px solid var(--line);padding:13px 9px;text-align:center;}.summary-card:last-child{border-right:0;}.summary-card .k{font-family:'Space Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:5px;}.summary-card .v{font-family:'Anton';font-size:30px;line-height:1;}
  .profile-nav{display:flex;gap:28px;height:45px;align-items:end;background:rgba(255,255,255,.55);border-bottom:1px solid var(--line);padding:0 34px;}.profile-nav a{font-family:'Oswald';font-size:14px;padding:0 0 10px;}.profile-nav a:first-child{border-bottom:3px solid var(--red);}
  .layout{background:rgba(21,35,62,.06);padding:10px 0 0;}.panel{display:grid;grid-template-columns:220px minmax(0,1fr) 300px;gap:20px;background:transparent;border:0;align-items:start;}.rail,.panel-view{background:rgba(255,255,255,.5);border:0;border-radius:8px;padding:16px;box-shadow:0 1px 0 rgba(21,35,62,.06);}.panel-view{display:block;}.center-stack,.right-stack{display:grid;gap:10px;}.panel h2{font-family:'Oswald';font-size:16px;text-transform:none;margin-bottom:12px;}.desc{display:none;}.empty{font-style:italic;color:var(--muted);padding:18px 0;}
  .switch-list{display:grid;gap:10px;}.switch-item{display:flex;align-items:center;gap:10px;font-family:'Oswald';font-size:14px;border-bottom:1px solid var(--line);padding-bottom:10px;}.switch-item img{width:38px;height:38px;border-radius:50%;object-fit:cover;background:var(--paper-2);}.rail-socials{display:grid;grid-template-columns:1fr 1fr;gap:10px;border-top:1px solid var(--line);padding:12px 0;margin-top:2px;}.rail-social{height:44px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line-strong);background:rgba(255,255,255,.46);color:var(--navy);transition:background .16s,color .16s,border-color .16s;}.rail-social:hover{background:var(--navy);border-color:var(--navy);color:var(--paper);}.rail-social svg{width:22px;height:22px;}.quick-link{display:flex;align-items:center;gap:10px;border-top:1px solid var(--line);padding:11px 0;font-family:'Oswald';font-size:14px;}
  .stat-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;}.stat-card{background:var(--paper);border:1px solid var(--line);padding:13px;}.stat-card h3{font-family:'Oswald';font-size:15px;text-transform:uppercase;margin-bottom:8px;}.stat-line{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding:7px 0;font-family:'Space Mono';font-size:11px;text-transform:uppercase;}.stat-line span:first-child{color:var(--muted);}.stat-line strong{font-family:'Oswald';font-size:13px;}
  .table-wrap{overflow:auto;border:0;background:transparent;}table{width:100%;border-collapse:collapse;min-width:680px;}th{font-family:'Space Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);text-align:right;padding:9px;border-bottom:1px dotted var(--line-strong);}th.left,td.left{text-align:left;}td{font-family:'Oswald';font-weight:500;font-size:14px;text-align:right;padding:9px;border-bottom:1px solid var(--line);white-space:nowrap;}tr:last-child td{border-bottom:none;}
  .timeline{display:flex;flex-direction:column;gap:12px;}.timeline-item{display:grid;grid-template-columns:120px 1fr;gap:18px;background:var(--paper);border:1px solid var(--line);padding:14px;}.timeline-date{font-family:'Space Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}.timeline-title{font-family:'Oswald';font-weight:700;text-transform:uppercase;font-size:18px;}.timeline-meta{font-family:'Space Mono';font-size:11px;text-transform:uppercase;color:var(--muted);margin-top:4px;}.award-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;}.award{background:var(--paper);border:1px solid var(--line);padding:18px;}.award .season{font-family:'Space Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--red);margin-bottom:8px;}.award .title{font-family:'Oswald';font-size:19px;font-weight:700;text-transform:uppercase;}.award .detail{font-size:14px;color:var(--muted);margin-top:6px;}
  .settings-page{max-width:860px;margin:42px auto;background:var(--paper-2);border:1px solid var(--line-strong);padding:28px;}.setting-row{display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:1px solid var(--line);padding:20px 0;}.setting-row:last-child{border-bottom:1px solid var(--line);}.setting-title{font-family:'Oswald';font-weight:700;font-size:18px;text-transform:uppercase;}.setting-copy{font-size:14px;color:var(--muted);margin-top:4px;}.settings-controls{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;}.setting-select,.setting-input{min-width:150px;background:var(--paper);border:2px solid var(--navy);color:var(--navy);font-family:'Oswald';font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px;padding:10px 12px;}.setting-input{width:120px;min-width:120px;}.toggle{position:relative;width:64px;height:34px;border:2px solid var(--navy);background:var(--paper);cursor:pointer;flex:0 0 auto;}.toggle::after{content:'';position:absolute;width:22px;height:22px;left:4px;top:4px;background:var(--navy);transition:transform .18s;}.toggle.on{background:var(--navy);}.toggle.on::after{background:var(--paper);transform:translateX(30px);}.msg{font-family:'Space Mono';font-size:13px;margin-top:16px;padding:11px 14px;display:none;}.msg.err{background:rgba(159,54,34,.12);color:var(--red);display:block;}.msg.ok{background:rgba(60,122,78,.14);color:#3c7a4e;display:block;}
  body[data-theme="dark"] .hero,
  body[data-theme="dark"] .profile-nav{background:rgba(24,34,53,.82);}
  body[data-theme="dark"] .layout{background:rgba(6,11,22,.62);}
  body[data-theme="dark"] .rail,
  body[data-theme="dark"] .panel-view,
  body[data-theme="dark"] .settings-page{background:rgba(24,34,53,.94);border:1px solid var(--line);box-shadow:none;}
  body[data-theme="dark"] .season-card,
  body[data-theme="dark"] .stat-card,
  body[data-theme="dark"] .award,
  body[data-theme="dark"] .timeline-item{background:rgba(17,24,39,.86);border-color:var(--line);}
  body[data-theme="dark"] .season-card h2{background:#263755;color:#F3F6FB;}
  body[data-theme="dark"] .hero-meta,
  body[data-theme="dark"] .team-pill .name,
  body[data-theme="dark"] .profile-nav a,
  body[data-theme="dark"] .quick-link,
  body[data-theme="dark"] .switch-item{color:#F3F6FB;}
  body[data-theme="dark"] .summary-card,
  body[data-theme="dark"] .quick-link,
  body[data-theme="dark"] .switch-item,
  body[data-theme="dark"] .stat-line,
  body[data-theme="dark"] td{border-color:var(--line);}
  body[data-theme="dark"] .setting-select,
  body[data-theme="dark"] .setting-input{background:#111827;color:#F3F6FB;border-color:var(--line-strong);}
  body[data-theme="dark"] .rail-social{background:#111827;color:#F3F6FB;border-color:var(--line-strong);}
  body[data-theme="dark"] .rail-social:hover{background:#263755;color:#F3F6FB;border-color:#8EA4C9;}
  body[data-theme="dark"] .toggle{background:#111827;border-color:var(--line-strong);}
  body[data-theme="dark"] .toggle::after{background:#F3F6FB;}
  body[data-theme="dark"] .toggle.on{background:#263755;}
  @media(max-width:1180px){.hero{grid-template-columns:140px minmax(200px,1fr) 260px;}.hero-avatar{width:120px;height:120px;}.season-card{grid-column:1/-1;}.hero-facts{grid-column:auto;}}@media(max-width:1000px){.hero{grid-template-columns:120px 1fr;}.hero-avatar{width:110px;height:110px;}.season-card,.hero-facts{grid-column:1/-1;}.hero-facts{border-left:0;padding-left:0;}.panel{grid-template-columns:1fr;}.summary-grid{grid-template-columns:repeat(2,1fr);}.wrap{width:min(100% - 28px,1800px);min-width:0;}}@media(max-width:560px){.summary-grid{grid-template-columns:1fr;}.timeline-item{grid-template-columns:1fr;}.setting-row{align-items:flex-start;flex-direction:column;}.profile-nav{overflow:auto;padding:0 16px;}.hero{padding:18px;}}
  `,
  body: `
<header>
  <div class="wrap nav">
    <a class="brand" href="/"><img src="/logos/league.png" alt="OFL" onerror="this.outerHTML='<div class=\\'logo-fallback\\'>OFL</div>'"></a>
    <nav class="links"><a href="/">Home</a><a href="/schedule">Schedule</a><a href="/standings">Standings</a><a href="/stats">Stats</a><a href="/teams">Teams</a><a href="/players">Players</a><a href="/media">Media</a></nav>
    <div class="account-wrap" id="accountWrap" style="display:none;">
      <div class="account" id="accountPill"><img id="accountAvatar" src="" alt=""><span class="uname" id="accountName"></span><span class="chev"></span></div>
      <div class="dropdown"><a href="/profile">Profile</a><a href="/profile?tab=settings">Settings</a><a href="/media/editor" id="mediaEditorLink" style="display:none;">Media Editor</a><a href="/coaches" id="coachesLink" style="display:none;">Coaches Suite</a><a href="/admin" class="admin" id="adminLink" style="display:none;">Admin</a><a href="#" class="logout" id="logoutBtn">Log Out</a></div>
    </div>
  </div>
</header>
<div class="wrap page">
  <div class="gate" id="gate" style="display:none;"><h2>Connect Account</h2><p>You need to connect your Roblox account before viewing your player profile.</p><a href="/connect">Connect Account</a></div>
  <div id="profilePage" style="display:none;">
    <section class="hero">
      <img class="hero-avatar" id="heroAvatar" src="" alt="">
      <div>
        <div class="eyebrow">// Player Profile</div>
        <h1 id="heroName">Profile</h1>
        <a class="team-pill" id="teamPill" href="/teams"><span class="team-logo" id="teamLogo"></span><span><span class="label">Current Team</span><span class="name" id="teamName">Free Agent</span></span></a>
        <div class="hero-meta" id="heroMeta">Season 48</div>
      </div>
      <div class="hero-facts" id="heroFacts">
        <span class="k">Seasons Played</span><span class="v" id="heroSeasons">1</span>
        <span class="k">Cap</span><span class="v" id="heroCap">$0</span>
        <span class="k">Role</span><span class="v" id="heroRole">Player</span>
        <span class="k">Status</span><span class="v"><span class="status-dot"></span><span id="heroStatus">Active</span></span>
      </div>
      <div class="season-card"><h2>2026 Season Stats</h2><div class="summary-grid" id="overviewCards"></div></div>
    </section>
    <nav class="profile-nav"><a href="#view-season">Overview</a><a href="#view-career">Stats</a><a href="#view-timeline">Bio</a><a href="#view-awards">Awards</a></nav>
    <div class="layout">
      <section class="panel">
        <aside class="rail">
          <h2>Switch Player</h2>
          <div class="switch-list" id="switchList"></div>
          <div class="rail-socials" aria-label="League links">
            <a class="rail-social" href="https://discord.gg/8sktYMawP" target="_blank" rel="noopener" aria-label="Open OFL Discord" title="Discord">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.127-.095.252-.193.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            </a>
            <a class="rail-social" href="https://www.roblox.com/communities/988829/OFL-Old-Football-League#!/about" target="_blank" rel="noopener" aria-label="Open OFL Roblox group" title="Roblox">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.5 2.5 2 18l13.5 3.5L19 6zm8.25 11.25-3.5-.875-.875 3.5-3.5-.875.875-3.5-3.5-.875.875-3.5 3.5.875.875-3.5 3.5.875-.875 3.5 3.5.875z"/></svg>
            </a>
          </div>
          <div class="quick-link">Stats</div>
          <div class="quick-link">Schedule</div>
          <div class="quick-link">Roster</div>
        </aside>
        <main class="center-stack">
          <div class="panel-view" id="view-season"><h2>Season Stats</h2><div class="stat-groups" id="currentStats"></div><div id="overviewNote"></div></div>
          <div class="panel-view" id="view-career"><h2>Career Stats</h2><div class="stat-groups" id="careerStats"></div></div>
          <div class="panel-view" id="view-history"><h2>Historical Stats</h2><div id="historyStats"></div></div>
          <div class="panel-view" id="view-awards"><h2>Awards</h2><div class="award-grid" id="awardsGrid"></div></div>
        </main>
        <aside class="right-stack">
          <div class="panel-view" id="view-timeline"><h2>Teams Timeline</h2><div class="timeline" id="teamTimeline"></div></div>
          <div class="panel-view"><h2>League Snapshot</h2><div class="quick-link">Current Team: <strong id="snapshotTeam">Free Agent</strong></div><div class="quick-link">Season: <strong>48</strong></div><div class="quick-link">Status: <strong id="snapshotStatus">Active</strong></div></div>
        </aside>
      </section>
    </div>
  </div>
  <div class="settings-page" id="settingsPage" style="display:none;">
    <h1>Settings</h1>
    <p class="desc">Preferences saved to your OFL account and loaded whenever your token is active.</p>
    <div class="setting-row"><div><div class="setting-title">Player Details</div><div class="setting-copy">Choose offensive and defensive positions plus your jersey number.</div></div><div class="settings-controls"><select class="setting-select" id="offensivePositionSelect"><option value="">Offense</option><option value="QB">QB</option><option value="RB">RB</option><option value="WR">WR</option><option value="TE">TE</option><option value="OL">OL</option><option value="K">K</option><option value="P">P</option><option value="ATH">ATH</option></select><select class="setting-select" id="defensivePositionSelect"><option value="">Defense</option><option value="DL">DL</option><option value="LB">LB</option><option value="CB">CB</option><option value="S">S</option><option value="ATH">ATH</option></select><input class="setting-input" id="jerseyNumberInput" type="number" min="0" max="99" inputmode="numeric" placeholder="#"></div></div>
    <div class="setting-row"><div><div class="setting-title">Dark Mode</div><div class="setting-copy">Use a darker interface across OFL Network.</div></div><button class="toggle" id="darkToggle" type="button" aria-label="Toggle dark mode"></button></div>
    <div class="msg" id="settingsMsg"></div>
  </div>
</div>
  `,
  scripts: [
    {
      src: null,
      code: `
  const $=id=>document.getElementById(id);
  const token=localStorage.getItem('ofl_token');
  let payload=null, profile=null;
  const STAT_GROUPS=[
    ['Passing',[['Yards','pass_yards'],['TD','pass_td'],['INT','pass_int'],['Comp','pass_comp'],['Att','pass_att']]],
    ['Rushing',[['Attempts','rush_att'],['Yards','rush_yards'],['TD','rush_td']]],
    ['Receiving',[['Targets','targets'],['Receptions','receptions'],['Yards','rec_yards'],['TD','rec_td']]],
    ['Blocking',[['Snaps','snaps_played'],['Games','games_played'],['Sacks Allowed','sacks_allowed'],['TFL Allowed','tfls_allowed'],['Pressures Allowed','pressures_allowed']]],
    ['Defense',[['Sacks','pr_sacks'],['Pressures','pr_pressures'],['TFL','pr_tfl'],['Safeties','pr_safeties'],['Swats','pr_swats'],['INT','cov_int'],['TD','cov_td']]]
  ];
  const HISTORY_COLS=['pass_yards','pass_td','rush_yards','rush_td','rec_yards','rec_td','pr_sacks','cov_int'];
  function authHeaders(){ return {'Content-Type':'application/json',Authorization:'Bearer '+(token||'')}; }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[ch])); }
  function num(v){ return Number(v||0); }
  function fmt(n){ n=Number(n||0); return n>=1000 ? (n/1000).toFixed(1).replace('.0','')+'K' : String(n); }
  function dateText(v){ if(!v) return 'Unknown'; try{return new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}catch(e){return String(v);} }
  function setTheme(theme){ document.body.dataset.theme=theme==='dark'?'dark':'light'; if(window.applyOflTheme) window.applyOflTheme(); }
  function saveLocalProfile(p){ localStorage.setItem('ofl_profile',JSON.stringify(p)); profile=p; setTheme(p.theme_preference); }
  function msg(text,ok){ const m=$('settingsMsg'); if(!m) return; m.textContent=text; m.className='msg '+(ok?'ok':'err'); clearTimeout(m._timer); m._timer=setTimeout(()=>m.className='msg',8000); }
  async function readApiResponse(response){
    const text=await response.text();
    let data=null;
    try{ data=text?JSON.parse(text):{}; }catch(e){}
    if(response.ok) return {ok:true,status:response.status,data:data||{}};
    const code=data&&data.code?data.code:(data?'HTTP_'+response.status:'NON_JSON_RESPONSE');
    const error=data&&data.error?data.error:(text?text.slice(0,240):response.statusText);
    return {ok:false,status:response.status,code,error,data};
  }
  function errorLabel(result,fallback){
    if(!result) return fallback||'UNKNOWN_ERROR';
    return '['+(result.code||('HTTP_'+result.status))+'] '+(result.error||fallback||'Request failed');
  }
  function showGate(title,body){
    const gate=$('gate'); gate.style.display='block';
    const h=gate.querySelector('h2'), p=gate.querySelector('p');
    if(h) h.textContent=title;
    if(p) p.textContent=body;
  }
  function logoHtml(team, cls, id){
    const idAttr=id?' id="'+esc(id)+'"':'';
    if(!team) return '<span class="'+cls+'"'+idAttr+' style="background:#15233E">FA</span>';
    const color=team.primary_color||'#15233E';
    const init=(team.abbreviation||(team.name||'?').slice(0,2)).toUpperCase();
    if(team.logo_url) return '<span class="'+cls+'"'+idAttr+' style="background:'+color+'"><img src="'+esc(team.logo_url)+'" onerror="this.remove()"></span>';
    return '<span class="'+cls+'"'+idAttr+' style="background:'+color+'">'+esc(init)+'</span>';
  }
  function isSettingsMode(){ return new URLSearchParams(location.search).get('tab')==='settings'; }
  function roleFromStats(stats){
    const pass=num(stats.pass_yards)+num(stats.pass_td)+num(stats.pass_comp);
    const rush=num(stats.rush_yards)+num(stats.rush_td)+num(stats.rush_att);
    const rec=num(stats.rec_yards)+num(stats.rec_td)+num(stats.receptions);
    const def=num(stats.pr_sacks)+num(stats.pr_pressures)+num(stats.pr_tfl)+num(stats.cov_int);
    const top=[['Passing',pass],['Rushing',rush],['Receiving',rec],['Defense',def]].sort((a,b)=>b[1]-a[1])[0];
    return top[1]>0?top[0]:'Player';
  }
  function selectedOffensivePosition(){
    const player=payload&&payload.player;
    return String((player&&(player.offensive_position||player.position))||'').toUpperCase();
  }
  function selectedDefensivePosition(){
    const player=payload&&payload.player;
    return String((player&&player.defensive_position)||'').toUpperCase();
  }
  function selectedPosition(){
    return selectedOffensivePosition() || selectedDefensivePosition();
  }
  function positionLine(player){
    const parts=[selectedOffensivePosition(),selectedDefensivePosition()].filter(Boolean);
    return parts.length ? parts.join(' / ') : roleFromStats(payload.current_stats||{});
  }
  function seasonsPlayed(){
    const seasons=new Set((payload.historical||[]).map(row=>String(row.season||'')).filter(Boolean));
    if(payload.player || totalCurrentStats()>0) seasons.add('2026');
    return Math.max(1,seasons.size);
  }
  function totalCurrentStats(){
    const stats=payload.current_stats||{};
    return Object.keys(stats).reduce((sum,key)=>sum+num(stats[key]),0);
  }
  function headlineStats(stats, position){
    const pos=String(position||'').toUpperCase();
    if(pos==='QB') return [['YDS',stats.pass_yards],['TD',stats.pass_td],['COMP',stats.pass_comp],['INT',stats.pass_int]];
    if(['RB'].includes(pos)) return [['CAR',stats.rush_att],['YDS',stats.rush_yards],['TD',stats.rush_td],['AVG',stats.rush_att?num(stats.rush_yards)/num(stats.rush_att):0]];
    if(['WR','TE'].includes(pos)) return [['TGT',stats.targets],['REC',stats.receptions],['YDS',stats.rec_yards],['TD',stats.rec_td]];
    if(pos==='OL') return [['SNAPS',stats.snaps_played],['GP',stats.games_played],['SACK ALL',stats.sacks_allowed],['PRESS ALL',stats.pressures_allowed]];
    if(['DL','LB'].includes(pos)) return [['SACK',stats.pr_sacks],['PRESS',stats.pr_pressures],['TFL',stats.pr_tfl],['SWAT',stats.pr_swats]];
    if(['CB','S'].includes(pos)) return [['INT',stats.cov_int],['TD',stats.cov_td],['SWAT',stats.pr_swats],['TFL',stats.pr_tfl]];
    return [['PASS YDS',stats.pass_yards],['RUSH YDS',stats.rush_yards],['REC YDS',stats.rec_yards],['TD',num(stats.pass_td)+num(stats.rush_td)+num(stats.rec_td)+num(stats.pr_td)+num(stats.cov_td)]];
  }
  function renderHeader(){
    const player=payload.player, team=player&&player.team;
    const name=(player&&player.roblox_username)||profile.roblox_username||'Profile';
    $('heroName').textContent=name;
    $('accountWrap').style.display='block'; $('accountName').textContent=profile.roblox_username||name;
    const avatar=(player&&player.avatar_url)||profile.avatar_url;
    if(avatar){ $('heroAvatar').src=avatar; $('accountAvatar').src=avatar; }
    const statusText=team?'Signed':'Free Agent';
    const jersey=player&&player.jersey_number!=null&&player.jersey_number!==''?'#'+player.jersey_number:null;
    const posText=positionLine(player);
    $('heroMeta').textContent=[statusText,posText,jersey].filter(Boolean).join(' / ');
    const teamLogo=$('teamLogo'); if(teamLogo) teamLogo.outerHTML=logoHtml(team,'team-logo','teamLogo');
    $('teamName').textContent=team?team.name:'Free Agent';
    $('teamPill').href=team?'/teams/'+team.slug:'/teams';
    $('heroCap').textContent=player&&player.cap_value?'$'+fmt(player.cap_value):'$0';
    $('heroRole').textContent=posText;
    $('heroSeasons').textContent=String(seasonsPlayed());
    $('heroStatus').textContent=team?'Signed':'Free Agent';
    $('snapshotTeam').textContent=team?team.name:'Free Agent';
    $('snapshotStatus').textContent=team?'Signed':'Free Agent';
    if(profile.is_admin){ const a=$('adminLink'); if(a) a.style.display='block'; }
    if((profile.admin_tabs||[]).includes('media')){ const m=$('mediaEditorLink'); if(m) m.style.display='block'; }
    const toggle=$('darkToggle'); toggle.classList.toggle('on',profile.theme_preference==='dark'); toggle.setAttribute('aria-pressed',String(profile.theme_preference==='dark'));
    const off=$('offensivePositionSelect'); if(off) off.value=selectedOffensivePosition();
    const def=$('defensivePositionSelect'); if(def) def.value=selectedDefensivePosition();
    const numInput=$('jerseyNumberInput'); if(numInput) numInput.value=player&&player.jersey_number!=null?String(player.jersey_number):'';
  }
  function statCard(label, value){ return '<div class="summary-card"><div class="k">'+esc(label)+'</div><div class="v">'+esc(value)+'</div></div>'; }
  function renderOverview(){
    const player=payload.player, team=player&&player.team, stats=payload.current_stats||{};
    $('overviewCards').innerHTML=headlineStats(stats, selectedPosition()).map(item=>statCard(item[0], typeof item[1]==='number'&&!Number.isInteger(item[1])?item[1].toFixed(1):fmt(item[1]))).join('');
    $('overviewNote').innerHTML=player?'':'<p class="empty">No player row is linked to this account yet. Once this Roblox username is added to the player registry, stats and team history will appear here.</p>';
    const avatar=(player&&player.avatar_url)||profile.avatar_url||'';
    const teammates=payload.teammates||[];
    const switchRows=teammates.length?teammates.map(t=>({name:t.roblox_username,avatar:t.avatar_url,href:'/players/'+encodeURIComponent((t.roblox_username||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))})):[{name:'No current teammates',avatar:'',href:'/players'}];
    $('switchList').innerHTML=switchRows.map(row=>'<a class="switch-item" href="'+esc(row.href)+'">'+(row.avatar?'<img src="'+esc(row.avatar)+'" alt="">':'<span class="team-logo" style="background:#15233E">'+esc(row.name.slice(0,2).toUpperCase())+'</span>')+'<span>'+esc(row.name)+'</span></a>').join('');
  }
  function renderCurrentStats(){
    const stats=payload.current_stats||{};
    $('currentStats').innerHTML=STAT_GROUPS.map(group=>{
      const rows=group[1].map(item=>'<div class="stat-line"><span>'+esc(item[0])+'</span><strong>'+fmt(stats[item[1]])+'</strong></div>').join('');
      return '<div class="stat-card"><h3>'+esc(group[0])+'</h3>'+rows+'</div>';
    }).join('');
  }
  function careerTotals(){
    const totals={...(payload.current_stats||{})};
    (payload.historical||[]).forEach(row=>{
      const stats=row.stats||{};
      STAT_GROUPS.forEach(group=>group[1].forEach(item=>{ const key=item[1]; totals[key]=num(totals[key])+num(stats[key]); }));
    });
    return totals;
  }
  function renderCareerStats(){
    const stats=careerTotals();
    $('careerStats').innerHTML=STAT_GROUPS.map(group=>{
      const rows=group[1].map(item=>'<div class="stat-line"><span>'+esc(item[0])+'</span><strong>'+fmt(stats[item[1]])+'</strong></div>').join('');
      return '<div class="stat-card"><h3>'+esc(group[0])+'</h3>'+rows+'</div>';
    }).join('');
  }
  function renderHistory(){
    const rows=payload.historical||[];
    if(!rows.length){ $('historyStats').innerHTML='<p class="empty">No historical stats recorded yet.</p>'; return; }
    $('historyStats').innerHTML='<div class="table-wrap"><table><thead><tr><th class="left">Season</th><th class="left">Team</th>'+HISTORY_COLS.map(k=>'<th>'+esc(k.replace(/_/g,' '))+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>{
      const stats=row.stats||{};
      return '<tr><td class="left">'+esc(row.season)+'</td><td class="left">'+esc(row.team_name||'-')+'</td>'+HISTORY_COLS.map(k=>'<td>'+fmt(stats[k])+'</td>').join('')+'</tr>';
    }).join('')+'</tbody></table></div>';
  }
  function renderTimeline(){
    const rows=payload.timeline||[];
    if(!rows.length){ $('teamTimeline').innerHTML='<p class="empty">No roster transactions recorded yet.</p>'; return; }
    const label={sign:'Signed',release:'Released',trade:'Traded'};
    $('teamTimeline').innerHTML=rows.map(row=>{
      const team=row.team;
      return '<div class="timeline-item"><div class="timeline-date">'+esc(dateText(row.date))+'</div><div><div class="timeline-title">'+esc(label[row.type]||row.type)+' '+(team?' - '+esc(team.name):'')+'</div><div class="timeline-meta">'+esc([row.requesting_role,row.requesting_username,row.status].filter(Boolean).join(' / '))+'</div></div></div>';
    }).join('');
  }
  function renderAwards(){
    const rows=payload.awards||[];
    if(!rows.length){ $('awardsGrid').innerHTML='<p class="empty">No awards have been recorded for this player yet.</p>'; return; }
    $('awardsGrid').innerHTML=rows.map(a=>'<div class="award"><div class="season">'+esc(a.season?'Season '+a.season:dateText(a.awarded_at))+'</div><div class="title">'+esc(a.award_name)+'</div><div class="detail">'+esc(a.award_detail||((a.team&&a.team.name)||''))+'</div></div>').join('');
  }
  function renderAll(){ renderHeader(); renderOverview(); renderCurrentStats(); renderCareerStats(); renderHistory(); renderTimeline(); renderAwards(); }
  (async function(){
    if(!token){ showGate('Connect Account','[AUTH_TOKEN_MISSING] You need to connect your Roblox account before your profile can load.'); return; }
    try{
      const r=await fetch('/api/me/player-profile',{headers:{Authorization:'Bearer '+token}});
      const result=await readApiResponse(r);
      if(!result.ok){ showGate('Profile Error',errorLabel(result,'Could not load profile')); return; }
      const j=result.data;
      payload=j; saveLocalProfile(j.profile); renderAll();
      if(isSettingsMode()) $('settingsPage').style.display='block';
      else $('profilePage').style.display='block';
    }catch(e){ showGate('Profile Error','[NETWORK_REQUEST_FAILED] '+(e&&e.message?e.message:'Could not reach the API')); }
  })();
  const wrap=$('accountWrap'), pill=$('accountPill'); if(pill&&wrap){ pill.addEventListener('click',e=>{e.stopPropagation();wrap.classList.toggle('open');}); document.addEventListener('click',()=>wrap.classList.remove('open')); }
  $('logoutBtn').addEventListener('click',e=>{e.preventDefault();localStorage.removeItem('ofl_profile');localStorage.removeItem('ofl_token');localStorage.removeItem('ofl_session');document.body.dataset.theme='light';location.href='/';});
  $('darkToggle').addEventListener('click',async()=>{
    if(!profile) return;
    const next=profile.theme_preference==='dark'?'light':'dark';
    saveLocalProfile({...profile,theme_preference:next}); renderHeader();
    try{
      const r=await fetch('/api/me/settings',{method:'PATCH',headers:authHeaders(),body:JSON.stringify({theme_preference:next})});
      const result=await readApiResponse(r);
      if(!result.ok){ msg('Applied locally, but not saved. '+errorLabel(result,'Could not save settings')); return; }
      saveLocalProfile(result.data.profile); renderHeader(); msg('Settings saved',true);
    }catch(e){ msg('Applied locally, but not saved. [NETWORK_REQUEST_FAILED] '+(e&&e.message?e.message:'Could not reach the API')); }
  });
  async function savePlayerDetails(){
    if(!payload) return;
    const offensive_position=$('offensivePositionSelect').value;
    const defensive_position=$('defensivePositionSelect').value;
    const jersey_number=$('jerseyNumberInput').value.trim();
    if(payload.player){
      payload.player.offensive_position=offensive_position||null;
      payload.player.position=offensive_position||null;
      payload.player.defensive_position=defensive_position||null;
      payload.player.jersey_number=jersey_number===''?null:Number(jersey_number);
    }
    renderHeader(); renderOverview(); renderCurrentStats(); renderCareerStats();
    try{
      const r=await fetch('/api/me/settings',{method:'PATCH',headers:authHeaders(),body:JSON.stringify({offensive_position,defensive_position,jersey_number})});
      const result=await readApiResponse(r);
      if(!result.ok){ msg(errorLabel(result,'Could not save player details')); return; }
      if(result.data.player) payload.player=result.data.player;
      renderHeader(); renderOverview(); renderCurrentStats(); renderCareerStats(); msg('Player details saved',true);
    }catch(e){ msg('[NETWORK_REQUEST_FAILED] '+(e&&e.message?e.message:'Could not reach the API')); }
  }
  $('offensivePositionSelect').addEventListener('change',savePlayerDetails);
  $('defensivePositionSelect').addEventListener('change',savePlayerDetails);
  $('jerseyNumberInput').addEventListener('change',savePlayerDetails);
      `
    }
  ]
} satisfies LegacyPageData;

export default page;
