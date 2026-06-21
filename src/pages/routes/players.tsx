import type { LegacyPageData } from '../types';

const page = {
  file: 'players.html',
  title: 'Players - OFL',
  styles: `
  :root{
    --paper:#ECE4CF;--paper-2:#E4DAC0;--navy:#15233E;--red:#9F3622;--muted:#6B6253;--green:#3c7a4e;
    --line:rgba(21,35,62,.16);--line-strong:rgba(21,35,62,.32);
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:var(--paper);color:var(--navy);font-family:'Spectral',Georgia,serif;min-height:100vh;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");}
  a{color:inherit;text-decoration:none;}
  .wrap{width:min(1800px,calc(100% - 80px));min-width:min(1240px,calc(100% - 28px));margin:0 auto;padding:0;}
  header{position:sticky;top:0;z-index:50;background:var(--paper);border-bottom:1px solid var(--navy);}
  .nav{height:78px;display:flex;align-items:center;justify-content:flex-start;gap:28px;width:100%;min-width:0;margin:0;padding:0;}
  .brand{display:flex;align-items:center;gap:0;flex:0 0 auto;margin-left:18px;}
  .brand img{height:44px;width:44px;object-fit:contain;}
  .logo-fallback{height:44px;width:44px;border:2px solid var(--navy);display:flex;align-items:center;justify-content:center;font-family:'Anton';font-size:15px;}
  nav.links{display:flex;gap:34px;margin-right:auto;}
  nav.links a{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1.5px;padding:4px 0;position:relative;}
  nav.links a.active{color:var(--red);}
  nav.links a::after{content:'';position:absolute;left:0;bottom:-2px;height:2px;width:0;background:var(--red);transition:width .25s;}
  nav.links a:hover::after,nav.links a.active::after{width:100%;}
  .connect-btn{background:var(--navy);color:var(--paper);font-family:'Oswald';font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:2px;padding:14px 26px;}
  .account-wrap{position:relative;margin-right:28px;}
  .account{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;}
  .account img{width:38px;height:38px;border-radius:50%;border:2px solid var(--navy);object-fit:cover;}
  .account .uname{font-family:'Oswald';font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:1px;}
  .account .chev{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid var(--navy);transition:transform .2s;}
  .account-wrap.open .chev{transform:rotate(180deg);}
  .dropdown{position:absolute;top:calc(100% + 12px);right:0;min-width:180px;background:var(--paper);border:1px solid var(--navy);opacity:0;visibility:hidden;transform:translateY(-6px);transition:all .18s ease;box-shadow:0 14px 30px rgba(21,35,62,.16);}
  .account-wrap.open .dropdown{opacity:1;visibility:visible;transform:none;}
  .dropdown a{display:block;font-family:'Oswald';font-weight:500;font-size:14px;text-transform:uppercase;letter-spacing:1px;padding:14px 18px;border-bottom:1px solid rgba(21,35,62,.1);}
  .dropdown a:hover{background:var(--navy);color:var(--paper);}
  .dropdown a.admin{color:var(--red);}
  .menu-toggle{display:none;background:none;border:none;cursor:pointer;margin-left:auto;}
  .menu-toggle span{display:block;width:26px;height:2px;background:var(--navy);margin:5px 0;}
  .page{padding:42px 0 90px;}
  .eyebrow{font-family:'Space Mono';font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--red);margin-bottom:10px;}
  h1{font-family:'Anton';font-size:clamp(46px,7vw,84px);text-transform:uppercase;line-height:.9;margin-bottom:30px;}
  .filters{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:24px;}
  .filter-input{font-family:'Oswald';font-weight:500;font-size:15px;background:var(--paper-2);border:1px solid var(--line-strong);color:var(--navy);padding:10px 14px;min-width:220px;}
  .filter-btn,.back-btn{font-family:'Oswald';font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;padding:10px 18px;border:2px solid var(--navy);background:none;color:var(--navy);cursor:pointer;transition:all .15s;}
  .filter-btn.active,.filter-btn:hover,.back-btn:hover{background:var(--navy);color:var(--paper);}
  .filter-btn.dpp-active{background:var(--green);border-color:var(--green);color:#fff;}
  .filter-btn.est-active{background:var(--navy);border-color:var(--navy);color:var(--paper);}
  .tier-group{margin-bottom:32px;}
  .tier-head{display:flex;align-items:center;gap:16px;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid var(--navy);}
  .tier-label{font-family:'Anton';font-size:22px;text-transform:uppercase;}
  .tier-count,.result-count{font-family:'Space Mono';font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
  .table-wrap{overflow-x:auto;border:1px solid var(--line-strong);background:var(--paper-2);}
  table{width:100%;border-collapse:collapse;}
  th{font-family:'Space Mono';font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);text-align:left;padding:12px 14px;border-bottom:2px solid var(--navy);white-space:nowrap;}
  td{padding:12px 14px;font-family:'Oswald';font-weight:600;font-size:15px;border-bottom:1px solid var(--line);vertical-align:middle;}
  tr:hover{background:rgba(21,35,62,.04);}
  .pl-link{font-family:'Oswald';font-weight:700;font-size:16px;text-transform:uppercase;color:var(--navy);}
  .pl-link:hover{color:var(--red);}
  .pl-pos{font-family:'Space Mono';font-size:11px;color:var(--red);margin-left:8px;text-transform:uppercase;}
  .elig,.stat-rank{font-family:'Space Mono';font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:4px 8px;border-radius:4px;white-space:nowrap;}
  .elig.est{background:rgba(21,35,62,.1);color:var(--navy);}
  .elig.dpp{background:rgba(60,122,78,.15);color:var(--green);}
  .team-cell{display:flex;align-items:center;gap:9px;}
  .team-logo-mini{width:24px;height:24px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-family:'Anton';font-size:9px;color:#fff;overflow:hidden;flex-shrink:0;}
  .team-logo-mini img{width:100%;height:100%;object-fit:contain;}
  .fa-label,.empty{font-style:italic;color:var(--muted);}
  .detail-shell{display:none;}
  .player-hero{position:relative;border-top:7px solid var(--navy);border-bottom:1px solid var(--line-strong);background:linear-gradient(90deg,rgba(21,35,62,.08),rgba(255,255,255,.18));display:grid;grid-template-columns:210px 1fr 360px;gap:24px;align-items:center;min-height:205px;padding:24px 34px;margin-bottom:0;overflow:hidden;}
  .player-hero::before{content:'';position:absolute;inset:0 auto 0 0;width:330px;background:linear-gradient(125deg,rgba(159,54,34,.18),rgba(21,35,62,.08));clip-path:polygon(0 0,75% 0,45% 100%,0 100%);}
  .hero-avatar{position:relative;z-index:1;width:165px;height:165px;object-fit:cover;border:1px solid var(--line-strong);background:var(--paper-2);}
  .hero-avatar.fallback{display:flex;align-items:center;justify-content:center;font-family:'Anton';font-size:44px;}
  .hero-main{position:relative;z-index:1;}
  .hero-main h1{font-size:54px;margin-bottom:12px;line-height:.95;}
  .hero-sub{display:flex;flex-wrap:wrap;gap:9px;align-items:center;font-family:'Oswald';font-size:15px;}
  .dot{width:7px;height:7px;border-radius:50%;display:inline-block;background:var(--green);}
  .hero-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;border-left:1px dashed var(--line-strong);padding-left:24px;font-family:'Oswald';}
  .meta-k{font-family:'Space Mono';font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;}
  .meta-v{font-weight:700;}
  .season-card{border:1px solid var(--line-strong);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.3);}
  .season-card h2{font-family:'Oswald';font-size:13px;letter-spacing:1px;text-transform:uppercase;text-align:center;color:#fff;background:var(--navy);padding:8px;}
  .season-stats{display:grid;grid-template-columns:repeat(4,1fr);text-align:center;}
  .season-stats div{padding:12px 8px;}
  .season-stats .k{font-family:'Space Mono';font-size:10px;color:var(--muted);letter-spacing:1px;}
  .season-stats .v{font-family:'Anton';font-size:28px;line-height:1;margin-top:4px;}
  .detail-nav{display:flex;gap:28px;padding:13px 34px;background:rgba(255,255,255,.28);border-bottom:1px solid var(--line);}
  .detail-nav a{font-family:'Oswald';font-size:14px;font-weight:600;}
  .detail-grid{display:grid;grid-template-columns:230px minmax(0,1fr) 300px;gap:20px;background:rgba(21,35,62,.06);padding:20px;}
  .panel{background:rgba(255,255,255,.36);border-radius:8px;padding:16px;border:1px solid rgba(21,35,62,.08);}
  .panel h2{font-family:'Oswald';font-size:16px;text-transform:uppercase;margin-bottom:12px;}
  .side-list a,.quick-row{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);font-family:'Oswald';font-size:14px;}
  .side-list a:last-child,.quick-row:last-child{border-bottom:none;}
  .side-list img{width:38px;height:38px;border-radius:50%;object-fit:cover;background:var(--paper-2);}
  .side-list .active{font-weight:800;color:var(--red);}
  .content-stack{display:grid;gap:10px;}
  .stat-table th,.stat-table td{text-align:right;}
  .stat-table th:first-child,.stat-table td:first-child{text-align:left;}
  .news-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
  .news-card{min-height:120px;border:1px solid var(--line);background:var(--paper);padding:12px;font-family:'Oswald';font-weight:700;}
  .rank-table td,.rank-table th{font-size:13px;padding:9px 8px;}
  @media(max-width:1000px){.wrap{width:min(100% - 28px,1800px);min-width:0}.player-hero,.detail-grid{grid-template-columns:1fr}.hero-meta{border-left:0;padding-left:0}.season-card{max-width:420px}.news-grid{grid-template-columns:1fr}nav.links,.connect-btn,.account-wrap{display:none}.menu-toggle{display:block}}
  `,
  body: `
<header>
  <div class="wrap nav">
    <a class="brand" href="/"><img src="/logos/league.png" alt="OFL" onerror="this.outerHTML='<div class=\\'logo-fallback\\'>OFL</div>'"></a>
    <nav class="links">
      <a href="/">Home</a><a href="/schedule">Schedule</a><a href="/standings">Standings</a><a href="/stats">Stats</a><a href="/teams">Teams</a><a href="/players" class="active">Players</a><a href="/media">Media</a>
    </nav>
    <a href="/connect" class="connect-btn" id="connectBtn">Connect Account</a>
    <div class="account-wrap" id="accountWrap" style="display:none;">
      <div class="account" id="accountPill"><img id="accountAvatar" src="" alt=""><span class="uname" id="accountName"></span><span class="chev"></span></div>
      <div class="dropdown">
        <a href="/profile">Profile</a><a href="/profile?tab=settings">Settings</a><a href="/coaches" class="coaches" id="coachesLink" style="display:none;">Coaches Suite</a><a href="/media/editor" class="coaches" id="mediaEditorLink" style="display:none;">Media Editor</a><a href="/admin" class="admin" id="adminLink" style="display:none;">Admin</a><a href="#" class="logout" id="logoutBtn">Log Out</a>
      </div>
    </div>
    <button class="menu-toggle" aria-label="Menu"><span></span><span></span><span></span></button>
  </div>
</header>

<div class="wrap page list-shell" id="listShell">
  <div class="eyebrow">// Season 48</div>
  <h1>Players</h1>
  <div class="filters">
    <input class="filter-input" id="searchInput" type="text" placeholder="Search player">
    <button class="filter-btn" id="btnAll" type="button">All</button>
    <button class="filter-btn" id="btnDPP" type="button">DPP-Eligible</button>
    <button class="filter-btn" id="btnEst" type="button">Established</button>
    <button class="filter-btn" id="btnFA" type="button">Free Agents</button>
  </div>
  <div class="result-count" id="resultCount"></div>
  <div id="playerOutput"><p class="empty">Loading players...</p></div>
</div>

<div class="detail-shell" id="detailShell">
  <div class="wrap page">
    <a class="back-btn" href="/players">All Players</a>
    <div id="playerDetail"></div>
  </div>
</div>
  `,
  scripts: [
    {
      src: null,
      code: `
const $ = id => document.getElementById(id);
const STAT_KEYS=['pass_yards','pass_td','pass_int','pass_att','pass_comp','rush_att','rush_yards','rush_td','targets','receptions','rec_yards','rec_td','sacks_allowed','tfls_allowed','pressures_allowed','snaps_played','games_played','pr_sacks','pr_pressures','pr_tfl','pr_safeties','pr_swats','pr_td','cov_int','cov_td'];
let REGISTRY=[], PLAYERS=[], MERGED=[], eligFilter='all', faFilter=false;
let PAGE_SIZE=60, nextOffset=0, totalPlayers=0, hasMore=true, loadingPage=false, searchTimer=null;
const TIER_LABELS={17500000:'$17.5M',15000000:'$15M',12500000:'$12.5M',10000000:'$10M',7500000:'$7.5M',5000000:'$5M',2500000:'$2.5M',0:'$0'};
const API_BASE=(location.hostname==='localhost'||location.hostname==='127.0.0.1')&&location.port&&location.port!=='3000'?'http://localhost:3000':'';

function esc(v){return String(v==null?'':v).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));}
function slug(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function fmtCap(v){v=Number(v||0); if(v>=1000000) return '$'+(v/1000000).toFixed(1).replace('.0','')+'M'; if(v>=1000) return '$'+(v/1000).toFixed(0)+'K'; return '$'+v;}
function num(v){return Number(v||0);}
function img(src,cls,alt){return src?'<img class="'+cls+'" src="'+esc(src)+'" alt="'+esc(alt||'')+'" onerror="this.remove()">':'<span class="'+cls+' fallback">'+esc((alt||'?').slice(0,2).toUpperCase())+'</span>';}
function teamLogo(team){if(!team)return '<span class="fa-label">Free Agent</span>'; const c=team.primary_color||'#15233E'; const init=(team.abbreviation||(team.name||'').slice(0,2)).toUpperCase(); return '<div class="team-cell"><span class="team-logo-mini" data-init="'+esc(init)+'" style="background:'+esc(c)+'">'+(team.logo_url?'<img src="'+esc(team.logo_url)+'" onerror="this.parentNode.textContent=this.parentNode.dataset.init">':esc(init))+'</span>'+esc(team.name)+'</div>';}
function cookieValue(name){
  const parts=document.cookie?document.cookie.split('; '):[];
  for(let i=0;i<parts.length;i++){
    if(parts[i].indexOf(name+'=')===0) return parts[i].split('=').slice(1).join('=');
  }
  return '';
}
function getToken(){
  const direct=localStorage.getItem('ofl_token')||decodeURIComponent(cookieValue('ofl_token')||'');
  if(direct) return direct;
  try{
    const session=JSON.parse(localStorage.getItem('ofl_session')||'null');
    return session && (session.token||session.access_token||session.ofl_token) || '';
  }catch(e){ return ''; }
}
function authHeaders(){const token=getToken(); return token?{Authorization:'Bearer '+token}:{};}
function apiUrl(url){return url.startsWith('/api/')?API_BASE+url:url;}
async function readJson(url,opts){
  opts=opts||{}; opts.headers=Object.assign({},opts.headers||{});
  const request=fetch(apiUrl(url),opts);
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('[REQUEST_TIMEOUT] '+url+' did not respond')),8000));
  const r=await Promise.race([request,timeout]);
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):{};}catch(e){}
  if(!r.ok){const code=data&&data.code?data.code:(data?'HTTP_'+r.status:'NON_JSON_RESPONSE'); throw new Error('['+code+'] '+((data&&data.error)||text.slice(0,200)||r.statusText));}
  if(!data) throw new Error('[INVALID_JSON_RESPONSE] '+url+' returned non-JSON. Make sure the API server is running on localhost:3000.');
  return data;
}

(async function header(){
  let p=null; const token=getToken();
  try{p=JSON.parse(localStorage.getItem('ofl_profile')||'null');}catch(e){}
  if(p&&p.roblox_username){
    $('connectBtn').style.display='none'; $('accountWrap').style.display='block';
    $('accountName').textContent=p.roblox_username;
    if(p.avatar_url) $('accountAvatar').src=p.avatar_url;
  } else if(token) {
    $('connectBtn').style.display='none'; $('accountWrap').style.display='block';
    $('accountName').textContent='Account';
  }
  if(token){
    try{
      const j=await readJson('/api/me',{headers:authHeaders()});
      if(j.profile){
        p=j.profile;
        localStorage.setItem('ofl_profile',JSON.stringify(j.profile));
        $('connectBtn').style.display='none'; $('accountWrap').style.display='block';
        $('accountName').textContent=j.profile.roblox_username||'Account';
        if(j.profile.avatar_url) $('accountAvatar').src=j.profile.avatar_url;
        if(j.profile.is_admin) $('adminLink').style.display='block';
        if((j.profile.admin_tabs||[]).includes('media')) $('mediaEditorLink').style.display='block';
      }
    }catch(e){}
    try{const j=await readJson('/api/coach/me',{headers:authHeaders()}); if(j.coach){const cl=$('coachesLink'); cl.href='/coaches/'+j.team.slug; cl.style.display='block';}}catch(e){}
  }
  const wrap=$('accountWrap'), pill=$('accountPill');
  if(pill){pill.addEventListener('click',e=>{e.stopPropagation();wrap.classList.toggle('open');}); document.addEventListener('click',()=>wrap.classList.remove('open'));}
  const lo=$('logoutBtn'); if(lo) lo.addEventListener('click',e=>{e.preventDefault();localStorage.removeItem('ofl_profile');localStorage.removeItem('ofl_token');localStorage.removeItem('ofl_session');document.cookie='ofl_token=; path=/; max-age=0; SameSite=Lax';location.href='/';});
  document.querySelector('.menu-toggle').addEventListener('click',()=>{const l=document.querySelector('nav.links');const o=l.style.display==='flex';l.style.cssText=o?'':'display:flex;position:absolute;top:78px;left:0;right:0;background:var(--paper);flex-direction:column;padding:20px 22px;gap:18px;border-bottom:1px solid var(--navy);';});
})();

function mergePlayers(){
  const byName={};
  PLAYERS.forEach(p=>{byName[(p.roblox_username||'').toLowerCase()]=p;});
  const registryNames={};
  REGISTRY.forEach(r=>{registryNames[(r.roblox_username||'').toLowerCase()]=true;});
  MERGED=REGISTRY.map(r=>{
    const roster=byName[(r.roblox_username||'').toLowerCase()]||null;
    return Object.assign({},r,{roster:roster,team:(roster||{}).team||r.team||null});
  });
  PLAYERS.forEach(p=>{
    if(!registryNames[(p.roblox_username||'').toLowerCase()]){
      MERGED.push(Object.assign({},p,{roster:p,eligibility:p.eligibility||null,position_tag:p.position_tag||p.position,cap_value:p.cap_value||0,team:p.team||null}));
    }
  });
}

async function load(){
  return loadPage(true);
}

async function loadPage(reset){
  if(loadingPage) return;
  if(reset){
    REGISTRY=[]; PLAYERS=[]; MERGED=[]; nextOffset=0; totalPlayers=0; hasMore=true;
  }
  if(!hasMore && !reset) return;
  loadingPage=true;
  try{
    const q=$('searchInput').value.trim();
    if(reset){
      $('resultCount').textContent='';
      $('playerOutput').innerHTML='<p class="empty">Loading players...</p>';
    } else {
      $('resultCount').textContent='';
    }
    let playersError=null;
    try{
      const url='/api/players?limit='+PAGE_SIZE+'&offset='+nextOffset+(q?'&q='+encodeURIComponent(q):'');
      const players=await readJson(url);
      const rows=players.players||[];
      totalPlayers=Number(players.total||0);
      hasMore=!!players.has_more;
      nextOffset+=rows.length;
      PLAYERS=reset?rows:PLAYERS.concat(rows);
    }catch(e){playersError=e; if(reset) PLAYERS=[];}
    if(playersError) throw playersError;
    if(reset && q.length>=2){
      try{
        const reg=await readJson('/api/registry/search?q='+encodeURIComponent(q));
        REGISTRY=(reg.players||[]).filter(r=>!PLAYERS.some(p=>(p.roblox_username||'').toLowerCase()===(r.roblox_username||'').toLowerCase()));
      }catch(e){REGISTRY=[];}
    }
    mergePlayers();
    if(!MERGED.length){
      $('resultCount').textContent='';
      $('playerOutput').innerHTML='<p class="empty">'+(q?'No players match your search.':'No players are loaded yet. Import the registry or add players to the roster database.')+'</p>';
      return;
    }
    if(getDetailName()) renderDetail(); else renderList();
  }catch(e){
    $('resultCount').textContent='';
    $('playerOutput').innerHTML='<p class="empty">'+esc(e.message||e)+'</p>';
  }finally{
    loadingPage=false;
  }
}

function getDetailName(){
  const path=location.pathname.replace(/\/+$/,'');
  if(!path.startsWith('/players/')) return '';
  return decodeURIComponent(path.slice('/players/'.length)).replace(/-/g,' ');
}

function updateFilterBtns(){
  $('btnAll').className='filter-btn'+(eligFilter==='all'&&!faFilter?' active':'');
  $('btnDPP').className='filter-btn'+(eligFilter==='DPP-ELIGIBLE'?' dpp-active':'');
  $('btnEst').className='filter-btn'+(eligFilter==='ESTABLISHED'?' est-active':'');
  $('btnFA').className='filter-btn'+(faFilter?' active':'');
}

function renderList(){
  $('listShell').style.display='block'; $('detailShell').style.display='none';
  updateFilterBtns();
  const q=$('searchInput').value.trim().toLowerCase();
  const filtered=MERGED.filter(p=>{
    if(q && !(p.roblox_username||'').toLowerCase().includes(q)) return false;
    if(eligFilter!=='all' && p.eligibility!==eligFilter) return false;
    if(faFilter && p.team) return false;
    return true;
  });
  const totalLabel=totalPlayers?(' of '+totalPlayers):'';
  $('resultCount').textContent='';
  if(!filtered.length){$('playerOutput').innerHTML='<p class="empty">No players match your search.</p>';return;}
  const tiers=[...new Set(filtered.map(p=>Number(p.cap_value||0)))].sort((a,b)=>b-a);
  $('playerOutput').innerHTML=tiers.map(tier=>{
    const group=filtered.filter(p=>Number(p.cap_value||0)===tier);
    const rows=group.map(p=>{
      const eligClass=p.eligibility==='ESTABLISHED'?'est':'dpp';
      const eligLabel=p.eligibility==='ESTABLISHED'?'Established':(p.eligibility||'DPP-Eligible');
      const posTag=p.position_tag?'<span class="pl-pos">('+esc(p.position_tag)+')</span>':'';
      return '<tr><td><a class="pl-link" href="/players/'+encodeURIComponent(slug(p.roblox_username))+'">'+esc(p.roblox_username)+'</a>'+posTag+'</td><td>'+teamLogo(p.team)+'</td><td><span class="elig '+eligClass+'">'+esc(eligLabel)+'</span></td></tr>';
    }).join('');
    return '<div class="tier-group"><div class="tier-head"><span class="tier-label">'+esc(TIER_LABELS[tier]||fmtCap(tier))+'</span><span class="tier-count">'+group.length+' player'+(group.length!==1?'s':'')+'</span></div><div class="table-wrap"><table><thead><tr><th>Username</th><th>Team</th><th>Eligibility</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  }).join('');
}

function statTotal(p, keys){return keys.reduce((s,k)=>s+num((p.roster||p)[k]),0);}
function bestRole(p){
  const pass=statTotal(p,['pass_yards','pass_td','pass_comp']);
  const rush=statTotal(p,['rush_yards','rush_td','rush_att']);
  const rec=statTotal(p,['rec_yards','rec_td','receptions']);
  const def=statTotal(p,['pr_sacks','pr_pressures','pr_tfl','cov_int','cov_td']);
  const arr=[['Passing',pass],['Rushing',rush],['Receiving',rec],['Defense',def]].sort((a,b)=>b[1]-a[1]);
  return arr[0][1]>0?arr[0][0]:(p.position_tag||'Player');
}
function statRows(p){
  const r=p.roster||{};
  const groups=[
    ['Passing',[['YDS','pass_yards'],['TD','pass_td'],['INT','pass_int'],['ATT','pass_att'],['COMP','pass_comp']]],
    ['Rushing',[['CAR','rush_att'],['YDS','rush_yards'],['TD','rush_td']]],
    ['Receiving',[['TGT','targets'],['REC','receptions'],['YDS','rec_yards'],['TD','rec_td']]],
    ['Defense',[['SACK','pr_sacks'],['PRESS','pr_pressures'],['TFL','pr_tfl'],['INT','cov_int'],['TD','cov_td']]]
  ];
  return groups.map(g=>'<tr><td>'+g[0]+'</td>'+g[1].map(x=>'<td>'+num(r[x[1]])+'</td>').join('')+'<td></td>'.repeat(Math.max(0,5-g[1].length))+'</tr>').join('');
}
function renderDetail(){
  $('listShell').style.display='none'; $('detailShell').style.display='block';
  const name=getDetailName().toLowerCase();
  const p=MERGED.find(x=>slug(x.roblox_username)===slug(name) || (x.roblox_username||'').toLowerCase()===name);
  if(!p){$('playerDetail').innerHTML='<p class="empty">Player not found.</p>';return;}
  const r=p.roster||{};
  const avatar=r.avatar_url||p.avatar_url||'';
  const team=p.team;
  const status=team?'Signed':'Free Agent';
  const role=bestRole(p);
  const totalTd=num(r.pass_td)+num(r.rush_td)+num(r.rec_td)+num(r.pr_td)+num(r.cov_td);
  const topStats=[['PASS YDS',r.pass_yards],['RUSH YDS',r.rush_yards],['REC YDS',r.rec_yards],['TD',totalTd]];
  const teammates=MERGED.filter(x=>team&&x.team&&x.team.id===team.id&&x.roblox_username!==p.roblox_username).slice(0,7);
  const leaders=MERGED.slice().sort((a,b)=>statTotal(b,['pass_yards','rush_yards','rec_yards'])-statTotal(a,['pass_yards','rush_yards','rec_yards'])).slice(0,8);
  $('playerDetail').innerHTML=
    '<section class="player-hero">'+
      img(avatar,'hero-avatar',p.roblox_username)+
      '<div class="hero-main"><div class="eyebrow">// Player Profile</div><h1>'+esc(p.roblox_username)+'</h1><div class="hero-sub">'+(team?teamLogo(team):'<span class="fa-label">Free Agent</span>')+'<span>#</span><span>'+esc(role)+'</span><span class="dot"></span><span>'+esc(status)+'</span></div></div>'+
      '<div class="season-card"><h2>2026 Season Stats</h2><div class="season-stats">'+topStats.map(s=>'<div><div class="k">'+s[0]+'</div><div class="v">'+num(s[1])+'</div></div>').join('')+'</div></div>'+
    '</section>'+
    '<nav class="detail-nav"><a href="#overview">Overview</a><a href="#stats">Stats</a><a href="#bio">Bio</a><a href="#rankings">Leaders</a></nav>'+
    '<section class="detail-grid" id="overview">'+
      '<aside class="panel"><h2>'+(team?esc(team.name):'Free Agents')+'</h2><div class="side-list">'+(teammates.length?teammates.map(t=>'<a href="/players/'+encodeURIComponent(slug(t.roblox_username))+'">'+img((t.roster||{}).avatar_url,'',t.roblox_username)+'<span>'+esc(t.roblox_username)+'</span></a>').join(''):'<div class="quick-row">No current teammates</div>')+'</div></aside>'+
      '<main class="content-stack"><div class="panel" id="stats"><h2>Career Stats</h2><div class="table-wrap"><table class="stat-table"><thead><tr><th>Category</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th></th></tr></thead><tbody>'+statRows(p)+'</tbody></table></div></div><div class="panel" id="bio"><h2>Player Bio</h2><div class="quick-row"><strong>Status</strong><span>'+esc(status)+'</span></div><div class="quick-row"><strong>Eligibility</strong><span>'+esc(p.eligibility||'Not assigned')+'</span></div><div class="quick-row"><strong>Cap Value</strong><span>'+fmtCap(p.cap_value||0)+'</span></div><div class="quick-row"><strong>Position Tag</strong><span>'+esc(p.position_tag||r.position||'Not assigned')+'</span></div></div><div class="panel"><h2>Latest Notes</h2><div class="news-grid"><div class="news-card">Season profile updates automatically from current player totals.</div><div class="news-card">Awards and transaction history can be attached as those records are added.</div><div class="news-card">Stats remain visible even when the player is a free agent.</div></div></div></main>'+
      '<aside class="panel" id="rankings"><h2>OFL Leaders</h2><table class="rank-table"><thead><tr><th>Player</th><th>Total Yds</th></tr></thead><tbody>'+leaders.map(l=>'<tr><td><a href="/players/'+encodeURIComponent(slug(l.roblox_username))+'">'+esc(l.roblox_username)+'</a></td><td>'+statTotal(l,['pass_yards','rush_yards','rec_yards'])+'</td></tr>').join('')+'</tbody></table></aside>'+
    '</section>';
}

$('btnAll').addEventListener('click',()=>{eligFilter='all';faFilter=false;renderList();});
$('btnDPP').addEventListener('click',()=>{eligFilter='DPP-ELIGIBLE';faFilter=false;renderList();});
$('btnEst').addEventListener('click',()=>{eligFilter='ESTABLISHED';faFilter=false;renderList();});
$('btnFA').addEventListener('click',()=>{faFilter=!faFilter;if(faFilter)eligFilter='all';renderList();});
$('searchInput').addEventListener('input',()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>loadPage(true),250);
});
window.addEventListener('scroll',()=>{
  if(getDetailName()||loadingPage||!hasMore) return;
  if(window.innerHeight+window.scrollY>=document.body.offsetHeight-700) loadPage(false);
});
load();
      `
    }
  ]
} satisfies LegacyPageData;

export default page;
