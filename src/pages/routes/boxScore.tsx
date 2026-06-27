import type { LegacyPageData } from '../types';

const page = {
  file: 'box-score.html',
  title: 'Box Score - OFL',
  styles: `
  html,body,#root,.ofl-app-shell,.ofl-page-shell{background:var(--paper);}
  body{margin:0;background:var(--paper);color:var(--navy);overflow-x:hidden;}
  *{box-sizing:border-box;}
  img,svg,video,canvas,iframe{max-width:100%;}
  a{color:inherit;text-decoration:none;}
  .wrap{width:min(1320px,calc(100% - clamp(28px,4vw,72px)));margin:0 auto;min-width:0;}
  .page{padding:44px 0 86px;background:var(--paper);color:var(--navy);min-height:calc(100vh - 78px);width:100%;overflow-x:hidden;}
  .crumb{font-family:'Space Mono';font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:18px;}
  .crumb a{border-bottom:1px solid var(--red);}
  .hero{border:1px solid var(--line-strong);background:var(--paper-2);overflow:hidden;}
  .score-head{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;}
  .team-pane{display:grid;grid-template-columns:74px minmax(0,1fr);gap:16px;align-items:center;padding:22px clamp(18px,3vw,34px);background:linear-gradient(90deg,var(--team-color),rgba(255,255,255,.04));color:#fff;}
  .team-pane.home{background:linear-gradient(270deg,var(--team-color),rgba(255,255,255,.04));text-align:right;grid-template-columns:minmax(0,1fr) 74px;}
  .team-logo{width:74px;height:74px;display:flex;align-items:center;justify-content:center;background:transparent;font-family:'Anton';font-size:18px;overflow:hidden;}
  .team-logo img{width:100%;height:100%;object-fit:contain;}
  .team-name{font-family:'Oswald';font-weight:700;font-size:clamp(22px,3vw,38px);line-height:.98;text-transform:uppercase;}
  .team-rec{font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.78;margin-top:8px;}
  .score-box{min-width:220px;background:var(--paper);border-left:1px solid var(--line-strong);border-right:1px solid var(--line-strong);display:flex;align-items:center;justify-content:center;gap:18px;padding:20px;color:var(--navy);}
  .score-num{font-family:'Anton';font-size:58px;line-height:1;}
  .score-mid{font-family:'Space Mono';font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);text-align:center;}
  .hero-meta{display:flex;position:relative;justify-content:space-between;gap:18px;border-top:1px solid var(--line-strong);padding:14px clamp(18px,3vw,34px);font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);flex-wrap:wrap;}
  .hero-meta strong{color:var(--navy);}
  .hero-meta-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap;}
  @media(max-width:640px){.hero-meta-center{position:static;left:auto;top:auto;transform:none;width:100%;text-align:center;order:3;}}

  .content-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,320px);gap:24px;margin-top:24px;align-items:start;min-width:0;}
  .main-stack,.side-stack{display:grid;gap:18px;align-items:start;}
  .panel{border:1px solid var(--line-strong);background:var(--paper-2);}
  .panel-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:16px 18px;border-bottom:1px solid var(--line-strong);}
  h1,h2,h3{font-family:'Oswald';font-weight:700;text-transform:uppercase;line-height:1;margin:0;}
  h1{font-size:clamp(42px,6vw,72px);}
  h2{font-size:23px;}
  h3{font-size:18px;}
  .note{font-size:14px;color:var(--muted);font-style:italic;padding:18px;}
  .highlight-panel{overflow:hidden;min-width:0;}
  .highlight-frame{position:relative;aspect-ratio:16/9;background:#05070b;}
  .highlight-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}
  .highlight-title{font-family:'Oswald';font-weight:700;text-transform:uppercase;font-size:18px;}
  .highlight-meta{font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:4px;}

  .hero-pickem{display:grid;gap:10px;border-top:1px solid var(--line-strong);padding:14px clamp(18px,3vw,34px);background:rgba(255,255,255,.16);}
  body.theme-dark .hero-pickem,body[data-theme="dark"] .hero-pickem{background:rgba(255,255,255,.04);}
  .hero-pickem-top{display:flex;position:relative;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;font-family:'Space Mono';font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
  .hero-pickem-top .hero-meta-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap;}
  @media(max-width:640px){.hero-pickem-top .hero-meta-center{position:static;left:auto;top:auto;transform:none;width:100%;text-align:center;order:3;}}
  .hero-pickem-title,.hero-pickem-line{color:var(--navy);}
  .hero-pickem-line{font-size:14px;}
  .hero-pickem-bar{height:12px;background:rgba(21,35,62,.12);display:grid;grid-template-columns:var(--away-pct,50%) 1fr;overflow:hidden;}
  body.theme-dark .hero-pickem-bar,body[data-theme="dark"] .hero-pickem-bar{background:rgba(255,255,255,.1);}
  .hero-pickem-bar span:first-child{background:var(--away-color);}
  .hero-pickem-bar span:last-child{background:var(--home-color);}
  .hero-pickem-sides{display:grid;grid-template-columns:1fr 1fr;gap:16px;font-family:'Oswald';font-weight:700;font-size:17px;line-height:1;text-transform:uppercase;color:var(--navy);}
  .hero-pickem-sides span:last-child{text-align:right;}

  /* pregame season-comparison module */
  .preview-groups{display:grid;}
  .preview-group{padding:24px clamp(16px,2.4vw,30px);border-top:1px solid var(--line-strong);}
  .preview-group:first-child{border-top:none;}
  .preview-group-title{font-family:'Oswald';font-weight:700;font-size:18px;letter-spacing:1px;text-transform:uppercase;color:var(--red);margin-bottom:20px;}
  .preview-row{margin-bottom:28px;}
  .preview-row:last-child{margin-bottom:0;}
  .preview-label{text-align:center;font-family:'Space Mono';font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:12px;}
  .preview-line{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;}
  .preview-val{font-family:'Anton';font-size:30px;color:var(--muted);text-align:right;}
  .preview-val.right{text-align:left;}
  .preview-val.lead{font-weight:700;}
  .preview-bar{height:8px;background:var(--line-strong);border-radius:4px;display:grid;overflow:hidden;}
  .preview-bar span{display:block;}

  .team-comparison{display:grid;grid-template-columns:1fr;gap:0;}
  .compare-row{display:grid;grid-template-columns:82px minmax(120px,1fr) 82px;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--line);}
  .compare-row:last-child{border-bottom:none;}
  .compare-val{font-family:'Anton';font-size:26px;text-align:center;}
  .compare-label{font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-align:center;text-transform:uppercase;color:var(--muted);}
  .bar{height:8px;background:rgba(21,35,62,.12);display:grid;grid-template-columns:var(--away-pct) 1fr;overflow:hidden;}
  body.theme-dark .bar,body[data-theme="dark"] .bar{background:rgba(255,255,255,.1);}
  .bar span:first-child{background:var(--away-color);}
  .bar span:last-child{background:var(--home-color);}

  .stat-section{border:1px solid var(--line-strong);background:var(--paper-2);overflow:hidden;}
  .stat-section + .stat-section{margin-top:18px;}
  .section-title{padding:16px 18px;background:var(--navy);color:var(--paper);font-family:'Oswald';font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-size:20px;}
  body[data-theme="dark"] .section-title,
  body.theme-dark .section-title{background:#25344d;color:#f4f7fb;border-bottom:1px solid var(--line-strong);}
  .tables-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-width:0;}
  .team-table{min-width:0;border-right:1px solid var(--line-strong);}
  .team-table:last-child{border-right:none;}
  .table-team-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);font-family:'Oswald';font-weight:700;text-transform:uppercase;font-size:18px;}
  body[data-theme="dark"] .table-team-head,
  body.theme-dark .table-team-head{background:#1e2a40;color:#f4f7fb;}
  .mini-logo{width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:var(--team-color);color:#fff;font-family:'Anton';font-size:12px;overflow:hidden;}
  .mini-logo img{width:100%;height:100%;object-fit:contain;}
  .table-wrap{overflow-x:auto;max-width:100%;}
  table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:0;}
  th,td{padding:14px clamp(8px,1.2vw,16px);border-bottom:1px solid var(--line);font-family:'Space Mono';font-size:14px;text-align:right;white-space:nowrap;overflow-wrap:normal;}
  th{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);background:rgba(255,255,255,.24);}
  body.theme-dark th,body[data-theme="dark"] th{background:rgba(255,255,255,.04);}
  th.left,td.left{text-align:left;width:42%;white-space:normal;overflow-wrap:anywhere;}
  tr:last-child td{border-bottom:none;}
  .player-cell{display:flex;align-items:center;gap:12px;font-family:'Oswald';font-weight:700;text-transform:uppercase;font-size:17px;color:var(--navy);min-width:0;}
  .player-cell span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;}
  .avatar{width:38px;height:38px;border-radius:50%;background:var(--navy);border:1px solid var(--line-strong);object-fit:cover;flex:0 0 auto;}
  .avatar-fb{display:flex;align-items:center;justify-content:center;color:var(--paper);font-family:'Anton';font-size:13px;}
  .player-sub{display:block;font-family:'Space Mono';font-size:12px;letter-spacing:.8px;color:var(--muted);margin-top:2px;}
  .total-row td{font-weight:700;background:rgba(255,255,255,.25);}
  body.theme-dark .total-row td,body[data-theme="dark"] .total-row td{background:rgba(255,255,255,.04);}
  .empty-row td{font-style:italic;color:var(--muted);text-align:left;}

  .leader-list{display:grid;}
  .leader-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line);}
  .leader-row:last-child{border-bottom:none;}
  .leader-name{font-family:'Oswald';font-weight:700;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .leader-stat{font-family:'Anton';font-size:24px;}
  .comparison-list{display:grid;}
  .comparison-item{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:12px;align-items:center;padding:13px 14px;border-bottom:1px solid var(--line);}
  .comparison-item:last-child{border-bottom:none;}
  .comparison-side{min-width:0;}
  .comparison-side.home{text-align:right;}
  .comparison-value{font-family:'Anton';font-size:24px;line-height:1;color:var(--navy);}
  .comparison-rank{font-family:'Space Mono';font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted);margin-top:4px;}
  .comparison-label{font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);text-align:center;min-width:78px;}
  .back-link{display:inline-flex;margin-top:18px;font-family:'Space Mono';font-size:12px;letter-spacing:1px;text-transform:uppercase;border-bottom:2px solid var(--red);color:var(--navy);}

  @media(max-width:1000px){
    .score-head{grid-template-columns:1fr;}
    .team-pane.home{text-align:left;grid-template-columns:74px minmax(0,1fr);}
    .team-pane.home .team-logo{order:-1;}
    .score-box{border:0;border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line-strong);}
    .content-grid{grid-template-columns:1fr;}
  }
  @media(max-width:760px){
    .tables-two{grid-template-columns:1fr;}
    .team-table{border-right:0;border-bottom:1px solid var(--line-strong);}
    .team-table:last-child{border-bottom:none;}
    .compare-row{grid-template-columns:64px minmax(90px,1fr) 64px;}
  }
  `,
  body: `
  <main class="page">
    <div class="wrap">
      <div class="crumb"><a href="/schedule">Schedule</a> / Box Score</div>
      <div id="boxRoot"><div class="panel"><p class="note">Loading box score...</p></div></div>
    </div>
  </main>
  `,
  scripts: [{
    src: null,
    code: `
  const $ = id => document.getElementById(id);
  const root = $('boxRoot');
  const gameId = decodeURIComponent((location.pathname.match(/\\/box-score\\/([^/]+)/)||[])[1] || '');
  const STAT_KEYS = ['pass_yards','pass_td','pass_int','pass_att','pass_comp','rush_att','rush_yards','rush_td','targets','receptions','rec_yards','rec_td','sacks_allowed','tfls_allowed','pressures_allowed','snaps_played','games_played','pr_sacks','pr_pressures','pr_tfl','pr_safeties','pr_swats','pr_td','cov_int','cov_td'];
  const CATS = [
    {key:'passing', label:'Passing', cols:[['pass_comp','COMP'],['pass_att','ATT'],['pass_yards','YDS'],['pass_td','TD'],['pass_int','INT']], has:p=>num(p.pass_att)>0||num(p.pass_yards)>0},
    {key:'rushing', label:'Rushing', cols:[['rush_att','RUSH'],['rush_yards','YDS'],['rush_td','TD']], has:p=>num(p.rush_att)>0||num(p.rush_yards)>0},
    {key:'receiving', label:'Receiving', cols:[['targets','TGT'],['receptions','REC'],['rec_yards','YDS'],['rec_td','TD']], has:p=>num(p.targets)>0||num(p.receptions)>0||num(p.rec_yards)>0},
    {key:'blocking', label:'Blocking', cols:[['snaps_played','SNAP'],['tfls_allowed','TFL A'],['sacks_allowed','SCK A'],['pressures_allowed','PRES A']], has:p=>num(p.snaps_played)>0||num(p.sacks_allowed)>0||num(p.tfls_allowed)>0||num(p.pressures_allowed)>0},
    {key:'passrush', label:'Pass Rush', cols:[['pr_pressures','PRESS'],['pr_tfl','TFL'],['pr_sacks','SACKS'],['pr_safeties','SAFETY'],['pr_swats','SWATS'],['pr_td','TD']], has:p=>num(p.pr_pressures)>0||num(p.pr_tfl)>0||num(p.pr_sacks)>0||num(p.pr_safeties)>0||num(p.pr_swats)>0||num(p.pr_td)>0},
    {key:'coverage', label:'Coverage', cols:[['cov_int','INT'],['cov_td','TD']], has:p=>num(p.cov_int)>0||num(p.cov_td)>0}
  ];

  function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
  function num(v){ return Number(v||0)||0; }
  function sumStats(players,key){ return players.reduce((total,p)=>total+num(p[key]),0); }
  function statTotal(p){ return STAT_KEYS.reduce((total,key)=>total+num(p[key]),0); }
  function ordinal(n){ const v=num(n); const mod100=v%100; if(mod100>=11&&mod100<=13) return v+'th'; const mod10=v%10; return v+(mod10===1?'st':mod10===2?'nd':mod10===3?'rd':'th'); }
  function fmtDate(d){ if(!d) return 'TBD'; try{ return new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }catch(e){ return d; } }
  function teamSlug(name){ return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  function playerSlug(name){ return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
  function teamColor(team){ return (team&&team.primary_color)||'#15233E'; }
  function logo(team, cls){
    const color=teamColor(team);
    const init=((team&&(team.abbreviation||(team.name||'').slice(0,2)))||'?').toUpperCase();
    const bg=cls==='team-logo'?'transparent':color;
    if(team&&team.logo_url) return '<span class="'+cls+'" style="--team-color:'+esc(color)+';background:'+esc(bg)+'"><img src="'+esc(team.logo_url)+'" onerror="this.style.display=\\'none\\';this.parentNode.textContent=\\''+esc(init)+'\\'"></span>';
    return '<span class="'+cls+'" style="--team-color:'+esc(color)+';background:'+esc(bg)+'">'+esc(init)+'</span>';
  }
  function avatar(username, player){
    if(player&&player.avatar_url) return '<img class="avatar" src="'+esc(player.avatar_url)+'" alt="">';
    const init=String(username||'?').slice(0,2).toUpperCase();
    return '<span class="avatar avatar-fb">'+esc(init)+'</span>';
  }
  function youtubeEmbed(id){ return 'https://www.youtube.com/embed/'+encodeURIComponent(id)+'?rel=0&modestbranding=1'; }
  function highlightPanel(highlight){
    if(!highlight||!highlight.youtube_id) return '';
    const meta=[highlight.week_tag,highlight.team_tag,highlight.posted_by].filter(Boolean).join(' / ');
    return '<section class="panel highlight-panel"><div class="panel-head"><div><h2>Game Highlight</h2><div class="highlight-meta">'+esc(meta||'OFL Media')+'</div></div><div class="highlight-title">'+esc(highlight.title||'Highlight')+'</div></div><div class="highlight-frame"><iframe src="'+esc(youtubeEmbed(highlight.youtube_id))+'" title="'+esc(highlight.title||'Game highlight')+'" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></section>';
  }
  function teamAbbr(team){ return (team&&(team.abbreviation||(team.name||'').slice(0,3).toUpperCase()))||'TBD'; }
  function teamSeasonTotals(teamId, players){
    const rows=(players||[]).filter(p=>String(p.team_id)===String(teamId));
    const sum=key=>rows.reduce((t,p)=>t+num(p[key]),0);
    const pass_yards=sum('pass_yards'), rush_yards=sum('rush_yards'), rec_yards=sum('rec_yards');
    return {
      pass_yards, rush_yards,
      totalYards: pass_yards+rush_yards+rec_yards,
      totalTd: sum('pass_td')+sum('rush_td')+sum('rec_td')+sum('pr_td')+sum('cov_td'),
      pr_sacks: sum('pr_sacks'),
      pr_tfl: sum('pr_tfl'),
      cov_int: sum('cov_int')
    };
  }
  function previewRow(label, aVal, hVal, fmt, awayColor, homeColor){
    const total=aVal+hVal;
    const leftPct=total>0?(aVal/total)*100:50;
    const aWins=aVal>hVal, hWins=hVal>aVal;
    return '<div class="preview-row">'+
      '<div class="preview-label">'+esc(label)+'</div>'+
      '<div class="preview-line">'+
        '<span class="preview-val'+(aWins?' lead':'')+'"'+(aWins?' style="color:'+esc(awayColor)+'"':'')+'>'+fmt(aVal)+'</span>'+
        '<div class="preview-bar" style="grid-template-columns:'+leftPct+'% 1fr;">'+
          '<span style="background:'+(aWins?esc(awayColor):'transparent')+'"></span>'+
          '<span style="background:'+(hWins?esc(homeColor):'transparent')+'"></span>'+
        '</div>'+
        '<span class="preview-val right'+(hWins?' lead':'')+'"'+(hWins?' style="color:'+esc(homeColor)+'"':'')+'>'+fmt(hVal)+'</span>'+
      '</div>'+
    '</div>';
  }
  function pregamePreviewModule(away, home, standings, players, awayColor, homeColor){
    const aStand=(standings||[]).find(r=>String(r.team_id)===String(away.id))||{};
    const hStand=(standings||[]).find(r=>String(r.team_id)===String(home.id))||{};
    const winPct=s=>{ const w=num(s.w), l=num(s.l); return (w+l)>0?(w/(w+l))*100:0; };
    const aTot=teamSeasonTotals(away.id, players), hTot=teamSeasonTotals(home.id, players);
    const intFmt=v=>v.toLocaleString();
    const groups=[
      {title:'Season', rows:[
        ['Win %', winPct(aStand), winPct(hStand), v=>v.toFixed(1)+'%'],
        ['Point Differential', num(aStand.net), num(hStand.net), v=>(v>=0?'+':'')+v],
        ['Tier Points', num(aStand.pts), num(hStand.pts), v=>v%1===0?String(v):v.toFixed(1)]
      ]},
      {title:'Offense', rows:[
        ['Total Yards', aTot.totalYards, hTot.totalYards, intFmt],
        ['Passing Yards', aTot.pass_yards, hTot.pass_yards, intFmt],
        ['Rushing Yards', aTot.rush_yards, hTot.rush_yards, intFmt],
        ['Total Touchdowns', aTot.totalTd, hTot.totalTd, intFmt]
      ]},
      {title:'Defense', rows:[
        ['Sacks', aTot.pr_sacks, hTot.pr_sacks, intFmt],
        ['TFL', aTot.pr_tfl, hTot.pr_tfl, intFmt],
        ['Interceptions', aTot.cov_int, hTot.cov_int, intFmt]
      ]}
    ];
    return '<div class="preview-groups">'+groups.map(g=>
      '<div class="preview-group"><div class="preview-group-title">'+esc(g.title)+'</div>'+
      g.rows.map(([label,aVal,hVal,fmt])=>previewRow(label,aVal,hVal,fmt,awayColor,homeColor)).join('')+
      '</div>'
    ).join('')+'</div>';
  }
  function pickemHero(pickem, away, home){
    const p=pickem||{}, total=num(p.total), awayPct=num(p.away_pct), homePct=num(p.home_pct);
    const hasScorePrediction=total&&p.avg_away_score!=null&&p.avg_home_score!=null&&p.avg_spread!=null;
    const spread=hasScorePrediction?Number(p.avg_spread):null;
    const line=!total?'No community picks yet':(!hasScorePrediction?'Spread pending':(spread===0?'Pick-em':(spread>0?teamAbbr(home):teamAbbr(away))+' -'+Math.abs(spread).toFixed(1)));
    return '<div class="hero-pickem" style="--away-pct:'+awayPct+'%;--away-color:'+esc(teamColor(away))+';--home-color:'+esc(teamColor(home))+'">'+
      '<div class="hero-pickem-top"><span class="hero-pickem-title">Community Pick-Ems</span><span class="hero-meta-center">'+total+' picks</span><span class="hero-pickem-line">'+esc(line)+'</span></div>'+
      '<div class="hero-pickem-bar"><span></span><span></span></div>'+
      '<div class="hero-pickem-sides"><span>'+esc(teamAbbr(away))+' '+awayPct+'%</span><span>'+esc(teamAbbr(home))+' '+homePct+'%</span></div>'+
    '</div>';
  }
  function positionText(player){
    if(!player) return '';
    const bits=[player.offensive_position,player.defensive_position].filter(Boolean);
    if(player.jersey_number!=null) bits.push('#'+player.jersey_number);
    return bits.join(' / ');
  }
  function normalizePlayers(slot, playerMap){
    return Object.entries(slot.players||{}).map(([username,stats])=>{
      const profile=playerMap[String(username).toLowerCase()]||null;
      return { username, profile, ...stats };
    }).sort((a,b)=>statTotal(b)-statTotal(a)||a.username.localeCompare(b.username));
  }
  function score(game, side){
    const v=side==='away'?game.away_score:game.home_score;
    return v==null ? '-' : String(v);
  }
  function tableFor(team, rows, cat){
    const visible=rows.filter(cat.has);
    const colspan=cat.cols.length+1;
    const body=visible.length ? visible.map(p=>{
      const sub=positionText(p.profile);
      return '<tr><td class="left"><a class="player-cell" href="/players/'+playerSlug(p.username)+'">'+avatar(p.username,p.profile)+'<span>'+esc(p.username)+(sub?'<span class="player-sub">'+esc(sub)+'</span>':'')+'</span></a></td>'+
        cat.cols.map(([key])=>'<td>'+num(p[key])+'</td>').join('')+'</tr>';
    }).join('') : '<tr class="empty-row"><td colspan="'+colspan+'">No '+cat.label.toLowerCase()+' stats.</td></tr>';
    const totals = visible.length ? '<tr class="total-row"><td class="left">Team Total</td>'+cat.cols.map(([key])=>'<td>'+sumStats(visible,key)+'</td>').join('')+'</tr>' : '';
    return '<div class="team-table"><div class="table-team-head">'+logo(team,'mini-logo')+'<span>'+esc(team?team.name:'Team')+'</span></div><div class="table-wrap"><table><thead><tr><th class="left">Player</th>'+cat.cols.map(([,label])=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+body+totals+'</tbody></table></div></div>';
  }
  function rosterOnlyPlayers(rows){
    return (rows||[]).filter(p=>!CATS.some(cat=>cat.has(p)));
  }
  function rosterOnlyTable(team, extra){
    if(!extra.length) return '';
    const body=extra.map(p=>{
      const sub=positionText(p.profile);
      return '<tr><td class="left"><a class="player-cell" href="/players/'+playerSlug(p.username)+'">'+avatar(p.username,p.profile)+'<span>'+esc(p.username)+(sub?'<span class="player-sub">'+esc(sub)+'</span>':'')+'</span></a></td><td>No stats recorded</td></tr>';
    }).join('');
    return '<div class="team-table"><div class="table-team-head">'+logo(team,'mini-logo')+'<span>'+esc(team?team.name:'Team')+'</span></div><div class="table-wrap"><table><thead><tr><th class="left">Player</th><th>Status</th></tr></thead><tbody>'+body+'</tbody></table></div></div>';
  }
  function compareRows(awayRows, homeRows, awayColor, homeColor){
    const defs=[
      ['pass_yards','Pass Yards'],['rush_yards','Rush Yards'],['rec_yards','Receiving Yards'],
      ['pass_td','Pass TD'],['rush_td','Rush TD'],['rec_td','Rec TD'],
      ['pr_sacks','Sacks'],['cov_int','Interceptions']
    ];
    return defs.map(([key,label])=>{
      const a=sumStats(awayRows,key), h=sumStats(homeRows,key), total=a+h;
      const pct=total?Math.round((a/total)*100):50;
      return '<div class="compare-row" style="--away-pct:'+pct+'%;--away-color:'+esc(awayColor)+';--home-color:'+esc(homeColor)+'"><div class="compare-val">'+a+'</div><div><div class="compare-label">'+label+'</div><div class="bar"><span></span><span></span></div></div><div class="compare-val">'+h+'</div></div>';
    }).join('');
  }
  function leaders(rows){
    const defs=[
      ['pass_yards','Passing'],['rush_yards','Rushing'],['rec_yards','Receiving'],['pr_sacks','Sacks'],['cov_int','INT']
    ];
    return defs.map(([key,label])=>{
      const p=[...rows].sort((a,b)=>num(b[key])-num(a[key]))[0];
      if(!p||!num(p[key])) return '';
      return '<div class="leader-row">'+avatar(p.username,p.profile)+'<div><div class="leader-name">'+esc(p.username)+'</div><div class="player-sub">'+label+'</div></div><div class="leader-stat">'+num(p[key])+'</div></div>';
    }).filter(Boolean).join('') || '<p class="note">No leaders available.</p>';
  }
  function teamComparisons(comparison){
    const rows=(comparison&&comparison.stats)||[];
    if(!rows.length) return '<p class="note">No comparison data yet.</p>';
    return '<div class="comparison-list">'+rows.map(row=>{
      const away=row.away||{}, home=row.home||{};
      return '<div class="comparison-item">'+
        '<div class="comparison-side"><div class="comparison-value">'+num(away.value).toLocaleString()+'</div><div class="comparison-rank">'+ordinal(away.rank)+' in OFL</div></div>'+
        '<div class="comparison-label">'+esc(row.label)+'</div>'+
        '<div class="comparison-side home"><div class="comparison-value">'+num(home.value).toLocaleString()+'</div><div class="comparison-rank">'+ordinal(home.rank)+' in OFL</div></div>'+
      '</div>';
    }).join('')+'</div>';
  }
  async function loadPregamePreview(id){
    const res=await fetch('/api/games',{cache:'no-store'});
    const text=await res.text();
    let data={};
    try{ data=text?JSON.parse(text):{}; }catch(e){}
    if(!res.ok) throw new Error((data&&data.error)||text.slice(0,220)||res.statusText);
    const game=(data.games||[]).find(g=>String(g.id)===String(id));
    if(!game) throw new Error('[GAME_NOT_FOUND] Game not found');
    let previewStandings=[], previewPlayers=[];
    try{
      const [sr,pr]=await Promise.all([fetch('/api/standings'),fetch('/api/players')]);
      const sj=await sr.json().catch(()=>({overall:[]}));
      const pj=await pr.json().catch(()=>({players:[]}));
      previewStandings=sj.overall||[];
      previewPlayers=pj.players||[];
    }catch(e){}
    return {
      game,
      box_score:null,
      players:{},
      highlight:null,
      comparison:null,
      pickem:game.pickem||null,
      stats_available:false,
      preview_standings:previewStandings,
      preview_players:previewPlayers
    };
  }
  async function load(){
    if(!gameId){ root.innerHTML='<div class="panel"><p class="note">[BOX_SCORE_GAME_ID_MISSING] No game id was provided.</p></div>'; return; }
    try{
      const res=await fetch('/api/games/'+encodeURIComponent(gameId)+'/box-score');
      const text=await res.text();
      let data=null;
      try{ data=text?JSON.parse(text):{}; }catch(e){}
      if(!res.ok){
        const code=data&&data.code;
        if(code==='BOX_SCORE_NOT_FOUND'||code==='BOX_SCORE_STORAGE_MISSING'){
          data=await loadPregamePreview(gameId);
        }else{
          throw new Error((code?'['+code+'] ':'')+((data&&data.error)||text.slice(0,220)||res.statusText));
        }
      }
      const game=data.game, box=data.box_score, playerMap=data.players||{}, highlight=data.highlight||null, comparison=data.comparison||null, pickem=data.pickem||null;
      const away=game.away_team || { id:game.away_team_id, name:'Away Team' };
      const home=game.home_team || { id:game.home_team_id, name:'Home Team' };
      document.title=(away.name||'Away')+' at '+(home.name||'Home')+' Box Score - OFL';
      const awayColor=teamColor(away), homeColor=teamColor(home);
      const heroHtml =
        '<section class="hero"><div class="score-head">'+
          '<div class="team-pane away" style="--team-color:'+esc(awayColor)+'">'+logo(away,'team-logo')+'<div><div class="team-name">'+esc(away.name||'Away Team')+'</div><div class="team-rec">'+esc(away.abbreviation||'Away')+'</div></div></div>'+
          '<div class="score-box"><div class="score-num">'+score(game,'away')+'</div><div class="score-mid">'+(box?'Final':'Pregame')+'<br>Box Score</div><div class="score-num">'+score(game,'home')+'</div></div>'+
          '<div class="team-pane home" style="--team-color:'+esc(homeColor)+'"><div><div class="team-name">'+esc(home.name||'Home Team')+'</div><div class="team-rec">'+esc(home.abbreviation||'Home')+'</div></div>'+logo(home,'team-logo')+'</div>'+
        '</div><div class="hero-meta"><span><strong>'+esc(game.week?'Week '+game.week:'Schedule')+'</strong></span><span class="hero-meta-center">'+esc(fmtDate(game.game_date))+(game.game_time?' / '+esc(game.game_time):'')+'</span><span>'+(box?'Imported '+esc(new Date(box.created_at).toLocaleString()):'Stats pending')+'</span></div>'+pickemHero(pickem,away,home)+'</section>';
      if(!box){
        const previewHtml=pregamePreviewModule(away,home,data.preview_standings||[],data.preview_players||[],awayColor,homeColor);
        root.innerHTML = heroHtml + '<div class="main-stack" style="margin-top:24px;"><section class="panel"><div class="panel-head"><h2>Season Comparison</h2></div>'+previewHtml+'</section></div>';
        return;
      }
      const slotAway=String(box.team1_id||'')===String(game.away_team_id)?box.data.team1:box.data.team2;
      const slotHome=String(box.team1_id||'')===String(game.home_team_id)?box.data.team1:box.data.team2;
      const awayRows=normalizePlayers(slotAway||{players:{}}, playerMap);
      const homeRows=normalizePlayers(slotHome||{players:{}}, playerMap);
      const allRows=[...awayRows,...homeRows];
      root.innerHTML =
        heroHtml+
        '<div class="content-grid"><div class="main-stack">'+
          highlightPanel(highlight)+
          '<section class="panel"><div class="panel-head"><h2>Team Stats</h2></div><div class="team-comparison">'+compareRows(awayRows,homeRows,awayColor,homeColor)+'</div></section>'+
          CATS.map(cat=>'<section class="stat-section"><div class="section-title">'+cat.label+'</div><div class="tables-two">'+tableFor(away,awayRows,cat)+tableFor(home,homeRows,cat)+'</div></section>').join('')+
          (function(){\n            const awayExtra=rosterOnlyPlayers(awayRows), homeExtra=rosterOnlyPlayers(homeRows);\n            if(!awayExtra.length&&!homeExtra.length) return '';\n            return '<section class="stat-section"><div class="section-title">Other Players</div><div class="tables-two">'+rosterOnlyTable(away,awayExtra)+rosterOnlyTable(home,homeExtra)+'</div></section>';\n          })()+\n        '</div><aside class="side-stack"><section class="panel"><div class="panel-head"><h2>Game Leaders</h2></div><div class="leader-list">'+leaders(allRows)+'</div></section><section class="panel"><div class="panel-head"><h2>Team Comparisons</h2></div>'+teamComparisons(comparison)+'</section></aside></div>'+
        '';
    }catch(e){
      root.innerHTML='<div class="panel"><p class="note">'+esc(e&&e.message?e.message:e)+'</p></div>';
    }
  }
  load();
    `
  }]
} satisfies LegacyPageData;

export default page;
