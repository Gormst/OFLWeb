require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, 'public');

// Secret for signing our own auth tokens. Set OFL_TOKEN_SECRET in env for production;
// falls back to the Supabase key so it's always defined.
const TOKEN_SECRET = process.env.OFL_TOKEN_SECRET || process.env.SUPABASE_KEY || 'ofl-dev-secret';

// Create a signed, long-lived token tying a session to a Roblox user id.
function signToken(robloxUserId) {
  const payload = Buffer.from(JSON.stringify({
    rid: String(robloxUserId),
    iat: Date.now()
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}

// Verify a signed token and return the Roblox user id, or null.
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  // constant-time compare
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.rid || null;
  } catch { return null; }
}

// Permanent superuser — always has admin access
const SUPERUSER = 'famouskai12';

// All admin tabs that can be granted
const ALL_ADMIN_TABS = ['access', 'teams', 'schedule', 'players', 'seasons', 'requests', 'registry'];

// raw stat columns that can be set on a player (no derived stats stored)
const STAT_KEYS = [
  'pass_yards','pass_td','pass_int','pass_att','pass_comp',
  'rush_att','rush_yards','rush_td',
  'targets','receptions','rec_yards','rec_td',
  'sacks_allowed','tfls_allowed','pressures_allowed','snaps_played','games_played',
  'pr_sacks','pr_pressures','pr_tfl','pr_safeties','pr_swats','pr_td',
  'cov_int','cov_td'
];
function normInt(v){ const n=parseInt(v,10); return isNaN(n)?0:(n<0?0:n); }
function pickStats(body){ const o={}; STAT_KEYS.forEach(k=>{ o[k]=normInt(body[k]); }); return o; }

// ─────────────────────────────────────────────
//  BOX SCORE CSV PARSING
// ─────────────────────────────────────────────
//
// Layout: two team blocks side-by-side. Each block is a column range.
// Within a block, rows are: TEAM NAME header, then sections (PASSING,
// RUSHING, RECEIVING, BLOCKING, DEFENSE), each with a column-header row
// followed by player rows until a blank row or the next ALL-CAPS section.

// maps a section's column header label -> our stat key, per section
const SECTION_COL_MAP = {
  PASSING:   { COMP:'pass_comp', ATT:'pass_att', YDS:'pass_yards', TD:'pass_td', INT:'pass_int' }, // COMP%/YPA/RTG are derived, ignored
  RUSHING:   { RUSH:'rush_att', YDS:'rush_yards', TD:'rush_td' }, // YPR derived
  RECEIVING: { TRGT:'targets', REC:'receptions', YDS:'rec_yards', TD:'rec_td' }, // CATCH%/YPT derived
  BLOCKING:  { SNAP:'snaps_played', 'TFL A':'tfls_allowed', 'SCK A':'sacks_allowed', 'PRES A':'pressures_allowed' },
  DEFENSE:   { PRESS:'pr_pressures', TFL:'pr_tfl', SACKS:'pr_sacks', SAFETY:'pr_safeties', SWATS:'pr_swats', INT:'cov_int', TD:'cov_td' }
};
const KNOWN_SECTIONS = Object.keys(SECTION_COL_MAP);

// Category keys exposed to the admin UI, and their column definitions.
// Each column: { label, key } — key is the stat field, or null for derived/ignored columns.
const CATEGORY_DEFS = {
  passing:   { section:'PASSING',   cols:['USERNAME','COMP','ATT','YDS','COMP%','TD','INT','YPA','RTG'],
               keys:{COMP:'pass_comp',ATT:'pass_att',YDS:'pass_yards',TD:'pass_td',INT:'pass_int'} },
  rushing:   { section:'RUSHING',   cols:['USERNAME','RUSH','YDS','TD','YPR'],
               keys:{RUSH:'rush_att',YDS:'rush_yards',TD:'rush_td'} },
  receiving: { section:'RECEIVING', cols:['USERNAME','TRGT','REC','YDS','TD','CATCH%','YPT'],
               keys:{TRGT:'targets',REC:'receptions',YDS:'rec_yards',TD:'rec_td'} },
  blocking:  { section:'BLOCKING',  cols:['USERNAME','SNAP','TFL A','SCK A','PRES A','GP'],
               keys:{SNAP:'snaps_played','TFL A':'tfls_allowed','SCK A':'sacks_allowed','PRES A':'pressures_allowed',GP:'games_played'} },
  passrush:  { section:'DEFENSE',   cols:['USERNAME','PRESS','TFL','SACKS','SAFETY','SWATS'],
               keys:{PRESS:'pr_pressures',TFL:'pr_tfl',SACKS:'pr_sacks',SAFETY:'pr_safeties',SWATS:'pr_swats'} },
  coverage:  { section:'DEFENSE',   cols:['USERNAME','INT','TD'],
               keys:{INT:'cov_int',TD:'cov_td'} }
};
// stat keys belonging to each category (used to know which fields a category's table edits)
const CATEGORY_STAT_KEYS = {
  passing: ['pass_comp','pass_att','pass_yards','pass_td','pass_int'],
  rushing: ['rush_att','rush_yards','rush_td'],
  receiving: ['targets','receptions','rec_yards','rec_td'],
  blocking: ['snaps_played','tfls_allowed','sacks_allowed','pressures_allowed','games_played'],
  passrush: ['pr_pressures','pr_tfl','pr_sacks','pr_safeties','pr_swats'],
  coverage: ['cov_int','cov_td']
};

function normFloatVal(v) {
  if (v === undefined || v === null) return 0;
  const s = String(v).replace('%', '').trim();
  if (s === '' || s.toUpperCase() === 'X') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Parse a single-category CSV paste into rows of { username, stats: {key: value} }.
// Tolerant of stray section/team-name rows above the header.
function parseCategoryCSV(text, category) {
  const def = CATEGORY_DEFS[category];
  if (!def) return [];
  const rows = parseCSVText(text).filter(r => r.length && r.some(c => (c || '').trim() !== ''));
  if (rows.length === 0) return [];

  // find the header row: a row whose first cell is USERNAME (case-insensitive)
  let headerIdx = rows.findIndex(r => (r[0] || '').trim().toUpperCase().startsWith('USERNAME'));
  let headerRow;
  if (headerIdx === -1) {
    headerIdx = -1;
    headerRow = def.cols; // assume canonical column order
  } else {
    headerRow = rows[headerIdx];
  }

  const idxToKey = {};
  headerRow.forEach((h, i) => {
    if (i === 0) return;
    const key = def.keys[(h || '').trim().toUpperCase()];
    if (key) idxToKey[i] = key;
  });

  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const username = (row[0] || '').trim();
    if (!username) continue;
    const upper = username.toUpperCase();
    if (Object.values(CATEGORY_DEFS).some(c => c.section === upper) || upper.startsWith('USERNAME')) continue;
    const stats = {};
    for (const [idx, key] of Object.entries(idxToKey)) stats[key] = normFloatVal(row[idx]);
    out.push({ username, stats });
  }
  return out;
}

// parse raw CSV text into rows of cells (handles quoted fields with commas)
function parseCSVText(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '') { rows.push([]); continue; }
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map(c => c.trim()));
  }
  return rows;
}

// is this row effectively empty (all cells blank) within a column range?
function rowEmpty(row, c0, c1) {
  for (let c = c0; c <= c1; c++) if ((row[c] || '').trim() !== '') return false;
  return true;
}

// parse one team's block of columns [c0..c1] starting at row index r0.
// returns { teamName, players: { username: { ...stat increments... } } }
function parseTeamBlock(rows, c0, c1, r0) {
  const players = {}; // username -> accumulated stat object
  const teamName = (rows[r0] && rows[r0][c0] || '').trim();
  let r = r0 + 1;

  function addStat(username, key, value) {
    if (!username) return;
    if (!players[username]) players[username] = {};
    players[username][key] = (players[username][key] || 0) + (normFloat(value) || 0);
  }
  function normFloat(v) {
    if (v === undefined || v === null) return 0;
    const s = String(v).replace('%', '').trim();
    if (s === '' || s.toUpperCase() === 'X') return 0;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  while (r < rows.length) {
    const row = rows[r] || [];
    const label = (row[c0] || '').trim().toUpperCase();

    if (rowEmpty(row, c0, c1)) { r++; continue; }

    if (KNOWN_SECTIONS.includes(label)) {
      const section = label;
      const colMap = SECTION_COL_MAP[section];
      // next row is the column-header row
      const headerRow = rows[r + 1] || [];
      // build column index -> stat key for this block's columns
      const idxToKey = {};
      for (let c = c0; c <= c1; c++) {
        const h = (headerRow[c] || '').trim().toUpperCase();
        if (colMap[h]) idxToKey[c] = colMap[h];
      }
      const usernameCol = c0; // first column of the block is always the username
      const posCol = (section === 'RECEIVING' || section === 'DEFENSE') ? c0 + 1 : null;

      r += 2; // skip section header + column header rows
      // consume player rows until blank row or a new known section
      while (r < rows.length) {
        const pr = rows[r] || [];
        if (rowEmpty(pr, c0, c1)) break;
        const nextLabel = (pr[c0] || '').trim().toUpperCase();
        if (KNOWN_SECTIONS.includes(nextLabel) || nextLabel === 'QB THROWAWAYS') break;
        const username = (pr[usernameCol] || '').trim();
        if (username) {
          for (const [colIdx, key] of Object.entries(idxToKey)) {
            addStat(username, key, pr[colIdx]);
          }
        }
        r++;
      }
      continue;
    }

    // unknown row (e.g. "QB THROWAWAYS" marker row) — skip
    r++;
  }

  return { teamName, players };
}

// parse a full two-team box score CSV. Returns { team1, team2 } each
// shaped { teamName, players: { username: {statkey: value, ...} } }
function parseBoxScoreCSV(text) {
  const rows = parseCSVText(text);
  if (rows.length === 0) return null;
  // find the split point: first row, first non-empty cell after a gap = team2 start col
  const firstRow = rows[0] || [];
  let team1Col = 0;
  let team2Col = null;
  for (let c = 1; c < firstRow.length; c++) {
    if ((firstRow[c] || '').trim() !== '') { team2Col = c; break; }
  }
  if (team2Col == null) {
    // only one team block in the CSV
    const t1 = parseTeamBlock(rows, 0, firstRow.length - 1, 0);
    return { team1: t1, team2: null };
  }
  const t1 = parseTeamBlock(rows, team1Col, team2Col - 1, 0);
  const t2 = parseTeamBlock(rows, team2Col, firstRow.length - 1, 0);
  return { team1: t1, team2: t2 };
}


// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'OFL-' + s;
}

async function getRobloxUser(username) {
  const r = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  const j = await r.json();
  if (!j.data || j.data.length === 0) return null;
  return j.data[0];
}

async function getRobloxDescription(userId) {
  const r = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.description || '';
}

async function getRobloxAvatar(userId) {
  try {
    const r = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
    const j = await r.json();
    return j.data && j.data[0] ? j.data[0].imageUrl : null;
  } catch { return null; }
}

// Resolve the requesting user from our signed Bearer token → their profile
async function getRequester(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const robloxId = verifyToken(auth.slice(7));
  if (!robloxId) return null;
  const { data: profile } = await supabase
    .from('user_profiles').select('*')
    .eq('roblox_user_id', String(robloxId)).single();
  return profile || null;
}

// Compute a profile's effective admin tabs (superuser always gets ALL tabs)
function effectiveTabs(profile) {
  const isSuper = (profile.roblox_username || '').trim().toLowerCase() === SUPERUSER.toLowerCase();
  let tabs = Array.isArray(profile.admin_tabs) ? profile.admin_tabs.slice() : [];
  if (isSuper) tabs = ALL_ADMIN_TABS.slice(); // superuser always has everything
  return { tabs, isSuper, isAdmin: isSuper || tabs.length > 0 };
}

// Require the requester to have a given admin tab
async function requireAdmin(req, res, tab) {
  const profile = await getRequester(req);
  if (!profile) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  const { tabs, isAdmin } = effectiveTabs(profile);
  if (!isAdmin || (tab && !tabs.includes(tab))) {
    res.status(403).json({ error: 'No admin access' });
    return null;
  }
  return profile;
}

// ─────────────────────────────────────────────
//  ACCOUNT CONNECTION
// ─────────────────────────────────────────────

app.post('/api/connect/start', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Username required' });
    const robloxUser = await getRobloxUser(username);
    if (!robloxUser) return res.status(404).json({ error: 'Roblox user not found' });
    const code = makeCode();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await supabase.from('verification_codes').insert({
      roblox_username: robloxUser.name, code, expires_at: expires, used: false
    });
    res.json({ code, robloxUsername: robloxUser.name, robloxUserId: robloxUser.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong starting verification' });
  }
});

app.post('/api/connect/verify', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Username required' });
    const robloxUser = await getRobloxUser(username);
    if (!robloxUser) return res.status(404).json({ error: 'Roblox user not found' });

    const { data: codes } = await supabase
      .from('verification_codes').select('*')
      .ilike('roblox_username', robloxUser.name).eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false }).limit(1);
    if (!codes || codes.length === 0) return res.status(400).json({ error: 'No active code — start over' });
    const codeRow = codes[0];

    const description = await getRobloxDescription(robloxUser.id);
    if (!description || !description.includes(codeRow.code)) {
      return res.status(400).json({ error: 'Code not found in your Roblox bio yet' });
    }

    const avatar = await getRobloxAvatar(robloxUser.id);

    const { data: existing } = await supabase
      .from('user_profiles').select('*')
      .eq('roblox_user_id', String(robloxUser.id)).single();

    let profile;
    if (existing) {
      const { data } = await supabase.from('user_profiles')
        .update({ roblox_username: robloxUser.name, avatar_url: avatar, is_verified: true })
        .eq('roblox_user_id', String(robloxUser.id)).select().single();
      profile = data;
    } else {
      const { data } = await supabase.from('user_profiles')
        .insert({
          roblox_username: robloxUser.name,
          roblox_user_id: String(robloxUser.id),
          avatar_url: avatar, is_verified: true
        }).select().single();
      profile = data;
    }

    await supabase.from('verification_codes').update({ used: true }).eq('id', codeRow.id);

    // issue our own long-lived token tied to the Roblox id
    const token = signToken(robloxUser.id);
    const { tabs, isAdmin, isSuper } = effectiveTabs(profile);
    res.json({
      success: true,
      token,
      profile: { ...profile, admin_tabs: tabs, is_admin: isAdmin, is_superuser: isSuper }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong during verification' });
  }
});

// ─────────────────────────────────────────────
//  ADMIN ACCESS
// ─────────────────────────────────────────────

// who am I + my admin status (header calls this to decide on the Admin button)
app.get('/api/me', async (req, res) => {
  try {
    const profile = await getRequester(req);
    if (!profile) return res.json({ profile: null });
    const { tabs, isAdmin, isSuper } = effectiveTabs(profile);
    res.json({ profile: { ...profile, admin_tabs: tabs, is_admin: isAdmin, is_superuser: isSuper } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// list all users who currently have admin access
app.get('/api/admin/users', async (req, res) => {
  const me = await requireAdmin(req, res, 'access');
  if (!me) return;
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, roblox_username, avatar_url, admin_tabs')
      .order('roblox_username');
    const admins = (data || [])
      .map(u => {
        const { tabs, isSuper, isAdmin } = effectiveTabs(u);
        return { ...u, admin_tabs: tabs, is_superuser: isSuper, is_admin: isAdmin };
      })
      .filter(u => u.is_admin);
    res.json({ admins, allTabs: ALL_ADMIN_TABS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// search connected users by roblox username (to add to the panel)
app.get('/api/admin/search', async (req, res) => {
  const me = await requireAdmin(req, res, 'access');
  if (!me) return;
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ users: [] });
    const { data } = await supabase
      .from('user_profiles')
      .select('id, roblox_username, avatar_url, admin_tabs')
      .ilike('roblox_username', `%${q}%`)
      .limit(10);
    res.json({ users: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// grant / update a user's admin tabs
app.post('/api/admin/grant', async (req, res) => {
  const me = await requireAdmin(req, res, 'access');
  if (!me) return;
  try {
    const { profileId, tabs } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId required' });
    const clean = Array.isArray(tabs) ? tabs.filter(t => ALL_ADMIN_TABS.includes(t)) : [];
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ admin_tabs: clean })
      .eq('id', profileId).select().single();
    if (error) throw error;
    res.json({ success: true, profile: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// revoke all admin access from a user
app.post('/api/admin/revoke', async (req, res) => {
  const me = await requireAdmin(req, res, 'access');
  if (!me) return;
  try {
    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId required' });

    // don't allow revoking the superuser
    const { data: target } = await supabase
      .from('user_profiles').select('roblox_username').eq('id', profileId).single();
    if (target && (target.roblox_username || '').toLowerCase() === SUPERUSER.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot revoke the superuser' });
    }

    await supabase.from('user_profiles').update({ admin_tabs: [] }).eq('id', profileId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  TEAMS
// ─────────────────────────────────────────────

// public — list all teams (used later by standings, stats, etc.)
// helper — convert team name to URL slug
function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

app.get('/api/teams', async (req, res) => {
  try {
    const { data } = await supabase
      .from('teams').select('*').order('name');
    res.json({ teams: (data || []).map(t => ({ ...t, slug: slugify(t.name) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// public — get a single team by slug + its roster
app.get('/api/teams/:slug', async (req, res) => {
  try {
    const { data: teams } = await supabase.from('teams').select('*').order('name');
    const team = (teams || []).find(t => slugify(t.name) === req.params.slug);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const { data: players, error: playerErr } = await supabase
      .from('players').select('*')
      .eq('team_id', team.id)
      .order('cap_value', { ascending: false });
    if (playerErr) {
      // cap_value column may not exist yet — fall back to name-only query
      const { data: playersBasic } = await supabase
        .from('players').select('id, roblox_username, avatar_url, team_id')
        .eq('team_id', team.id);
      return res.json({
        team: { ...team, slug: slugify(team.name) },
        players: (playersBasic || []).map(p => ({ ...p, position: null, cap_value: 0 })),
        cap: { total: 100_000_000, used: 0, remaining: 100_000_000 }
      });
    }
    const TEAM_CAP = 100_000_000;
    const DPP_MIN = 15, NON_DPP_MIN = 12, ROSTER_MAX = 40, DPP_ESTABLISHED_MAX = 3;

    // join with registry for eligibility
    const { data: regPlayers } = await supabase.from('league_players').select('roblox_username, eligibility');
    const eligMap = {};
    (regPlayers || []).forEach(r => { eligMap[(r.roblox_username||'').toLowerCase()] = r.eligibility; });

    const enriched = (players || []).map(p => ({ ...p, eligibility: eligMap[p.roblox_username.toLowerCase()] || null }));
    const usedCap = enriched.reduce((s, p) => s + (p.cap_value || 0), 0);
    const rosterMin = team.is_dpp ? DPP_MIN : NON_DPP_MIN;
    const establishedCount = enriched.filter(p => p.eligibility === 'ESTABLISHED').length;
    res.json({
      team: { ...team, slug: slugify(team.name) },
      players: enriched,
      cap: { total: TEAM_CAP, used: usedCap, remaining: TEAM_CAP - usedCap },
      roster: { min: rosterMin, max: ROSTER_MAX, established_count: establishedCount, established_max: team.is_dpp ? DPP_ESTABLISHED_MAX : null }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// admin — create a team
app.post('/api/admin/teams', async (req, res) => {
  const me = await requireAdmin(req, res, 'teams');
  if (!me) return;
  try {
    const { name, abbreviation, primary_color, secondary_color, logo_url, location, founded, head_coach, director_of_ops, franchise_owner, is_dpp } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Team name required' });
    const { data, error } = await supabase.from('teams').insert({
      name: name.trim(),
      abbreviation: (abbreviation || '').trim() || null,
      primary_color: primary_color || '#15233E',
      secondary_color: secondary_color || '#9F3622',
      logo_url: (logo_url || '').trim() || null,
      location: (location || '').trim() || null,
      founded: (founded || '').trim() || null,
      head_coach: (head_coach || '').trim() || null,
      director_of_ops: (director_of_ops || '').trim() || null,
      franchise_owner: (franchise_owner || '').trim() || null,
      is_dpp: is_dpp === true || is_dpp === 'true'
    }).select().single();
    if (error) throw error;
    res.json({ success: true, team: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — update a team
app.put('/api/admin/teams/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'teams');
  if (!me) return;
  try {
    const { name, abbreviation, primary_color, secondary_color, logo_url, location, founded, head_coach, director_of_ops, franchise_owner, is_dpp } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Team name required' });
    const { data, error } = await supabase.from('teams').update({
      name: name.trim(),
      abbreviation: (abbreviation || '').trim() || null,
      primary_color: primary_color || '#15233E',
      secondary_color: secondary_color || '#9F3622',
      logo_url: (logo_url || '').trim() || null,
      location: (location || '').trim() || null,
      founded: (founded || '').trim() || null,
      head_coach: (head_coach || '').trim() || null,
      director_of_ops: (director_of_ops || '').trim() || null,
      franchise_owner: (franchise_owner || '').trim() || null,
      is_dpp: is_dpp === true || is_dpp === 'true'
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, team: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — delete a team
app.delete('/api/admin/teams/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'teams');
  if (!me) return;
  try {
    await supabase.from('teams').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  SCHEDULE / GAMES
// ─────────────────────────────────────────────

// normalize a score value → integer or null (blank/invalid = null)
function normScore(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : (n < 0 ? 0 : n);
}

// attach lightweight team info to each game
function attachTeams(games, teams) {
  const map = {};
  for (const t of teams) map[t.id] = { id: t.id, name: t.name, abbreviation: t.abbreviation, logo_url: t.logo_url, primary_color: t.primary_color, secondary_color: t.secondary_color };
  return games.map(g => ({
    ...g,
    home_team: map[g.home_team_id] || null,
    away_team: map[g.away_team_id] || null
  }));
}

// public — list all games (schedule + scores)
app.get('/api/games', async (req, res) => {
  try {
    const { data: games } = await supabase
      .from('games').select('*')
      .order('game_date', { ascending: true });
    const { data: teams } = await supabase.from('teams').select('*');
    res.json({ games: attachTeams(games || [], teams || []) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — create a game
app.post('/api/admin/games', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const { week, game_date, game_time, home_team_id, away_team_id, home_score, away_score } = req.body;
    if (!home_team_id || !away_team_id) return res.status(400).json({ error: 'Both teams are required' });
    if (home_team_id === away_team_id) return res.status(400).json({ error: 'Home and away teams must differ' });
    const hs = normScore(home_score), as = normScore(away_score);
    const { data, error } = await supabase.from('games').insert({
      week: (week !== undefined && week !== null && String(week).trim() !== '') ? String(week).trim() : null,
      game_date: game_date || null,
      game_time: (game_time || '').trim() || null,
      home_team_id, away_team_id,
      home_score: hs, away_score: as
    }).select().single();
    if (error) throw error;
    res.json({ success: true, game: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — update a game
app.put('/api/admin/games/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const { week, game_date, game_time, home_team_id, away_team_id, home_score, away_score } = req.body;
    if (!home_team_id || !away_team_id) return res.status(400).json({ error: 'Both teams are required' });
    if (home_team_id === away_team_id) return res.status(400).json({ error: 'Home and away teams must differ' });
    const hs = normScore(home_score), as = normScore(away_score);
    const { data, error } = await supabase.from('games').update({
      week: (week !== undefined && week !== null && String(week).trim() !== '') ? String(week).trim() : null,
      game_date: game_date || null,
      game_time: (game_time || '').trim() || null,
      home_team_id, away_team_id,
      home_score: hs, away_score: as
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, game: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — delete a game
app.delete('/api/admin/games/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    await supabase.from('games').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  PLAYERS + STATS
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  BOX SCORE / STATS IMPORT
// ─────────────────────────────────────────────

// admin — parse a single-category CSV paste into editable rows
app.post('/api/admin/parse-category', async (req, res) => {
  const me = await requireAdmin(req, res, 'players');
  if (!me) return;
  try {
    const { csv, category } = req.body;
    if (!csv || !csv.trim()) return res.status(400).json({ error: 'CSV is required' });
    if (!CATEGORY_DEFS[category]) return res.status(400).json({ error: 'Unknown category' });
    const rows = parseCategoryCSV(csv, category);
    res.json({ rows, statKeys: CATEGORY_STAT_KEYS[category] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — import edited per-player stat increments across categories (adds to season totals)
app.post('/api/admin/import-game', async (req, res) => {
  const me = await requireAdmin(req, res, 'players');
  if (!me) return;
  try {
    const { players, game_id, team1_id, team2_id, team1_name, team2_name } = req.body;
    if (!Array.isArray(players) || players.length === 0) return res.status(400).json({ error: 'No player rows to import' });

    const { data: allPlayers } = await supabase.from('players').select('*');
    const byUsername = {};
    (allPlayers || []).forEach(p => { byUsername[(p.roblox_username || '').toLowerCase()] = p; });

    const boxData = { team1: { teamName: team1_name || null, players: {} }, team2: { teamName: team2_name || null, players: {} } };

    for (const row of players) {
      const username = (row.username || '').trim();
      if (!username) continue;
      const key = username.toLowerCase();
      let player = byUsername[key];
      const deltas = pickStats(row.stats || {});

      if (!player) {
        let roblox_user_id = null, avatar_url = null, rname = username;
        const ru = await getRobloxUser(username);
        if (ru) { roblox_user_id = String(ru.id); rname = ru.name; avatar_url = await getRobloxAvatar(ru.id); }
        const insertRow = { roblox_username: rname, roblox_user_id, avatar_url, team_id: row.team_id || null };
        STAT_KEYS.forEach(k => insertRow[k] = 0);
        const { data } = await supabase.from('players').insert(insertRow).select().single();
        player = data;
        byUsername[key] = player;
      } else if (row.team_id && row.team_id !== player.team_id) {
        await supabase.from('players').update({ team_id: row.team_id }).eq('id', player.id);
        player.team_id = row.team_id;
      }

      const update = {};
      STAT_KEYS.forEach(k => { update[k] = (player[k] || 0) + (deltas[k] || 0); });
      const { data: updated } = await supabase.from('players').update(update).eq('id', player.id).select().single();
      byUsername[key] = updated;

      // record this player's contribution to the box score, grouped by team
      const slot = (player.team_id === team1_id) ? 'team1' : (player.team_id === team2_id) ? 'team2' : (row.side === 2 ? 'team2' : 'team1');
      boxData[slot].players[username] = deltas;
    }

    const { data: box, error } = await supabase.from('box_scores').insert({
      game_id: game_id || null,
      team1_name: team1_name || null,
      team2_name: team2_name || null,
      team1_id: team1_id || null,
      team2_id: team2_id || null,
      data: boxData
    }).select().single();
    if (error) throw error;

    res.json({ success: true, box_score_id: box.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// public — fetch a stored box score by id
app.get('/api/box-scores/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('box_scores').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ box_score: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// public — list box scores (most recent first)
app.get('/api/box-scores', async (req, res) => {
  try {
    const { data } = await supabase.from('box_scores').select('id, game_id, team1_name, team2_name, team1_id, team2_id, created_at').order('created_at', { ascending: false });
    res.json({ box_scores: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — import previous-season stats (category rows, merged by username for the season)
app.post('/api/admin/import-season', async (req, res) => {
  const me = await requireAdmin(req, res, 'seasons');
  if (!me) return;
  try {
    const { players, season } = req.body;
    const seasonNum = parseInt(season, 10);
    if (isNaN(seasonNum)) return res.status(400).json({ error: 'Season number is required' });
    if (!Array.isArray(players) || players.length === 0) return res.status(400).json({ error: 'No player rows to import' });

    let count = 0;
    for (const row of players) {
      const username = (row.username || '').trim();
      if (!username) continue;
      const stats = pickStats(row.stats || {});

      const { data: existing } = await supabase
        .from('season_stats').select('*')
        .eq('season', seasonNum).ilike('roblox_username', username).maybeSingle();

      if (existing) {
        const update = {};
        STAT_KEYS.forEach(k => { if (row.stats && row.stats[k] !== undefined) update[k] = stats[k]; });
        if (row.team_name) update.team_name = row.team_name;
        await supabase.from('season_stats').update(update).eq('id', existing.id);
      } else {
        const insertRow = { season: seasonNum, roblox_username: username, team_name: row.team_name || null };
        STAT_KEYS.forEach(k => insertRow[k] = stats[k] || 0);
        await supabase.from('season_stats').insert(insertRow);
      }
      count++;
    }
    res.json({ success: true, imported: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// public — list available past seasons
app.get('/api/seasons', async (req, res) => {
  try {
    const { data } = await supabase.from('season_stats').select('season');
    const seasons = [...new Set((data || []).map(r => r.season))].sort((a, b) => b - a);
    res.json({ seasons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// public — stats for a given past season
app.get('/api/seasons/:season', async (req, res) => {
  try {
    const seasonNum = parseInt(req.params.season, 10);
    const { data } = await supabase.from('season_stats').select('*').eq('season', seasonNum);
    res.json({ season: seasonNum, players: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  PLAYERS / STATS
// ─────────────────────────────────────────────

// public — all players with team info attached
app.get('/api/players', async (req, res) => {
  try {
    const { data: players } = await supabase.from('players').select('*').order('roblox_username');
    const { data: teams } = await supabase.from('teams').select('*');
    const map = {};
    for (const t of (teams || [])) map[t.id] = { id: t.id, name: t.name, abbreviation: t.abbreviation, logo_url: t.logo_url, primary_color: t.primary_color, secondary_color: t.secondary_color };
    res.json({ players: (players || []).map(p => ({ ...p, team: p.team_id ? (map[p.team_id] || null) : null })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — create a player (resolves Roblox avatar from the username)
app.post('/api/admin/players', async (req, res) => {
  const me = await requireAdmin(req, res, 'players');
  if (!me) return;
  try {
    const rnameIn = (req.body.roblox_username || '').trim();
    if (!rnameIn) return res.status(400).json({ error: 'Roblox username required' });
    let roblox_user_id = null, avatar_url = null, rname = rnameIn;
    const ru = await getRobloxUser(rnameIn);
    if (ru) { roblox_user_id = String(ru.id); rname = ru.name; avatar_url = await getRobloxAvatar(ru.id); }
    const { data, error } = await supabase.from('players').insert({
      roblox_username: rname,
      roblox_user_id, avatar_url,
      team_id: req.body.team_id || null,
      ...pickStats(req.body)
    }).select().single();
    if (error) throw error;
    res.json({ success: true, player: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — update a player's info and stats
app.put('/api/admin/players/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'players');
  if (!me) return;
  try {
    const update = { team_id: req.body.team_id || null, ...pickStats(req.body) };

    // re-resolve avatar if the username changed
    const rname = (req.body.roblox_username || '').trim();
    if (rname) {
      const { data: cur } = await supabase.from('players').select('roblox_username').eq('id', req.params.id).single();
      if (!cur || (cur.roblox_username || '').toLowerCase() !== rname.toLowerCase()) {
        const ru = await getRobloxUser(rname);
        if (ru) { update.roblox_username = ru.name; update.roblox_user_id = String(ru.id); update.avatar_url = await getRobloxAvatar(ru.id); }
        else { update.roblox_username = rname; }
      } else {
        update.roblox_username = cur.roblox_username;
      }
    }

    const { data, error } = await supabase.from('players').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, player: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — delete a player
app.delete('/api/admin/players/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'players');
  if (!me) return;
  try {
    await supabase.from('players').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─────────────────────────────────────────────
//  LEAGUE PLAYER REGISTRY
// ─────────────────────────────────────────────

function parseCapRegistryCSV(text) {
  const players = [];
  let currentCap = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // split on comma or tab, then clean each cell
    const cells = line.split(/[,\t]/).map(c => c.trim().replace(/^"|"$/g, ''));

    // detect tier header — any cell contains "$X,XXX,XXX" or "MILLION PLAYERS"
    const fullLine = cells.join(' ');
    const capMatch = fullLine.match(/\(\$([0-9,]+)\)/);
    if (capMatch) { currentCap = parseInt(capMatch[1].replace(/,/g, ''), 10); continue; }
    if (fullLine.match(/MILLION PLAYERS/i)) continue;

    // skip column header rows
    if (cells.some(c => c.toUpperCase() === 'USERNAME')) continue;

    // find the username cell — first non-empty, non-dash cell
    let username = '', eligibility = 'DPP-ELIGIBLE';
    const meaningful = cells.filter(c => c && c !== '-');
    if (!meaningful.length) continue;

    // if only one meaningful cell, try splitting on last whitespace
    // e.g. "famouskai12 ESTABLISHED" or "intaged (QB) ESTABLISHED"
    if (meaningful.length === 1) {
      const single = meaningful[0];
      const eligWords = ['ESTABLISHED', 'DPP-ELIGIBLE', 'DPP ELIGIBLE'];
      for (const ew of eligWords) {
        if (single.toUpperCase().endsWith(ew)) {
          eligibility = ew === 'ESTABLISHED' ? 'ESTABLISHED' : 'DPP-ELIGIBLE';
          meaningful[0] = single.slice(0, single.length - ew.length).trim().replace(/,\s*$/, '').trim();
          break;
        }
      }
    }

    // last cell is eligibility if it matches known values
    const lastCell = meaningful[meaningful.length - 1].toUpperCase();
    if (lastCell === 'ESTABLISHED' || lastCell === 'DPP-ELIGIBLE' || lastCell === 'DPP ELIGIBLE') {
      eligibility = lastCell === 'ESTABLISHED' ? 'ESTABLISHED' : 'DPP-ELIGIBLE';
      meaningful.pop();
    }

    // merge any standalone position-tag cell (e.g. "(QB)") back with the username
    const merged = [];
    for (const cell of meaningful) {
      if (merged.length && /^\([^)]+\)$/.test(cell)) {
        merged[merged.length - 1] = merged[merged.length - 1] + ' ' + cell;
      } else {
        merged.push(cell);
      }
    }

    // what's left is the username — join remaining cells
    const rawUsername = merged.join(' ').trim();
    if (!rawUsername) continue;

    // extract position tag like (QB) — must be at end of string
    const posMatch = rawUsername.match(/\s*\(([^)]+)\)\s*$/);
    const positionTag = posMatch ? posMatch[1].trim() : null;
    username = rawUsername.replace(/\s*\([^)]+\)\s*$/, '').trim();
    if (!username) continue;

    // skip anything that looks like a header or tier label
    if (username.toUpperCase().includes('MILLION') || username.toUpperCase() === 'USERNAME') continue;

    players.push({ username, eligibility, cap_value: currentCap, position_tag: positionTag });
  }

  // deduplicate within the parsed list
  const seen = new Map();
  players.forEach(p => seen.set(p.username.toLowerCase(), p));
  return [...seen.values()];
}

// public — get all registry players (with current team info joined)
app.get('/api/registry', async (req, res) => {
  try {
    const { data: reg } = await supabase.from('league_players').select('*').order('cap_value', { ascending: false }).order('roblox_username');
    const { data: roster } = await supabase.from('players').select('roblox_username, team_id');
    const { data: teams } = await supabase.from('teams').select('id, name, abbreviation, primary_color, logo_url');
    const teamMap = {};
    (teams || []).forEach(t => teamMap[t.id] = t);
    const rosterMap = {};
    (roster || []).forEach(p => { rosterMap[(p.roblox_username||'').toLowerCase()] = p.team_id; });
    res.json({
      players: (reg || []).map(p => ({
        ...p,
        team: rosterMap[p.roblox_username.toLowerCase()] ? (teamMap[rosterMap[p.roblox_username.toLowerCase()]] || null) : null
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — import cap CSV into registry
app.post('/api/admin/registry/import', async (req, res) => {
  const me = await requireAdmin(req, res, 'players');
  if (!me) return;
  try {
    const { csv, cap_value } = req.body;
    if (!csv || !csv.trim()) return res.status(400).json({ error: 'CSV required' });
    const players = parseCapRegistryCSV(csv);
    if (!players.length) return res.status(400).json({ error: 'No players found in CSV' });

    const overrideCap = (cap_value !== undefined && cap_value !== null);
    const capNum = overrideCap ? parseInt(cap_value, 10) : null;

    const rows = players.map(p => ({
      roblox_username: p.username,
      eligibility: p.eligibility,
      cap_value: overrideCap ? capNum : p.cap_value,
      position_tag: p.position_tag || null
    }));

    // deduplicate by username (last occurrence wins)
    const seen = new Map();
    rows.forEach(r => seen.set(r.roblox_username.toLowerCase(), r));
    const dedupedRows = [...seen.values()];

    // delete matching usernames in chunks to avoid query size limits
    const CHUNK = 100;
    const usernames = dedupedRows.map(r => r.roblox_username);
    for (let i = 0; i < usernames.length; i += CHUNK) {
      await supabase.from('league_players').delete().in('roblox_username', usernames.slice(i, i + CHUNK));
    }

    // insert in batches of 50
    let imported = 0;
    const BATCH = 50;
    for (let i = 0; i < dedupedRows.length; i += BATCH) {
      const batch = dedupedRows.slice(i, i + BATCH);
      const { error: insErr } = await supabase.from('league_players').insert(batch);
      if (insErr) {
        console.error('Registry insert error:', insErr.message);
        return res.status(500).json({ error: 'Insert failed: ' + insErr.message });
      }
      imported += batch.length;
    }

    res.json({ success: true, imported });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// admin — delete a single registry player
app.delete('/api/admin/registry/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'players');
  if (!me) return;
  try {
    await supabase.from('league_players').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  COACHES SUITE
// ─────────────────────────────────────────────

// Resolve the coach identity — returns { profile, team, role } or null
async function getCoach(req) {
  const profile = await getRequester(req);
  if (!profile) return null;
  const username = (profile.roblox_username || '').toLowerCase().trim();
  const { data: teams } = await supabase.from('teams').select('*');
  for (const team of (teams || [])) {
    const hc  = (team.head_coach      || '').toLowerCase().trim();
    const dfo = (team.director_of_ops || '').toLowerCase().trim();
    const own = (team.franchise_owner || '').toLowerCase().trim();
    if (username === hc)  return { profile, team, role: 'HC'    };
    if (username === dfo) return { profile, team, role: 'DFO'   };
    if (username === own) return { profile, team, role: 'Owner' };
  }
  return null;
}

// who am I as a coach?
app.get('/api/coach/me', async (req, res) => {
  try {
    const coach = await getCoach(req);
    if (!coach) return res.json({ coach: null });
    const { data: players } = await supabase
      .from('players')
      .select('id, roblox_username, avatar_url, position, cap_value')
      .eq('team_id', coach.team.id)
      .order('cap_value', { ascending: false });
    const TEAM_CAP = 100_000_000;
    const used = (players || []).reduce((s, p) => s + (p.cap_value || 0), 0);
    res.json({
      coach: { username: coach.profile.roblox_username, role: coach.role },
      team: { ...coach.team, slug: slugify(coach.team.name) },
      players: players || [],
      cap: { total: TEAM_CAP, used, remaining: TEAM_CAP - used }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// submit a roster move
app.post('/api/coach/move', async (req, res) => {
  try {
    const coach = await getCoach(req);
    if (!coach) return res.status(403).json({ error: 'Not a registered coach' });
    const { move_type, player_username, details } = req.body;
    const validTypes = ['sign', 'release', 'trade', 'schedule'];
    if (!validTypes.includes(move_type)) return res.status(400).json({ error: 'Invalid move type' });

    const instantTypes = ['release', 'schedule'];
    const status = instantTypes.includes(move_type) ? 'logged' : 'pending';

    // execute instant moves immediately
    if (move_type === 'release') {
      const { data: player } = await supabase
        .from('players').select('*')
        .ilike('roblox_username', player_username)
        .eq('team_id', coach.team.id).maybeSingle();
      if (!player) return res.status(404).json({ error: 'Player not found on this roster' });
      await supabase.from('players').update({ team_id: null, position: null, cap_value: 0 }).eq('id', player.id);
    }

    if (move_type === 'schedule') {
      const { proposed_week, proposed_date, proposed_time, opponent_team_id } = details || {};
      if (!opponent_team_id) return res.status(400).json({ error: 'Opponent team required' });
      // insert into games table immediately
      const { data: game } = await supabase.from('games').insert({
        week: proposed_week || null,
        game_date: proposed_date || null,
        game_time: proposed_time || null,
        home_team_id: coach.team.id,
        away_team_id: opponent_team_id
      }).select().single();
      // log the game request
      await supabase.from('game_requests').insert({
        requesting_team_id: coach.team.id,
        opponent_team_id: opponent_team_id || null,
        proposed_week: proposed_week || null,
        proposed_date: proposed_date || null,
        proposed_time: proposed_time || null,
        status: 'logged',
        game_id: game?.id || null
      });
    }

    // always log the roster move
    const { data: move } = await supabase.from('roster_moves').insert({
      team_id: coach.team.id,
      requesting_username: coach.profile.roblox_username,
      requesting_role: coach.role,
      move_type,
      player_username: player_username || null,
      details: details || {},
      status
    }).select().single();

    res.json({ success: true, move, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// coach — view their team's move history
app.get('/api/coach/moves', async (req, res) => {
  try {
    const coach = await getCoach(req);
    if (!coach) return res.status(403).json({ error: 'Not a registered coach' });
    const { data: moves } = await supabase
      .from('roster_moves').select('*')
      .eq('team_id', coach.team.id)
      .order('created_at', { ascending: false });
    res.json({ moves: moves || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — list all pending moves (all teams)
app.get('/api/admin/moves', async (req, res) => {
  const me = await requireAdmin(req, res, 'requests');
  if (!me) return;
  try {
    const { data: moves } = await supabase
      .from('roster_moves').select('*')
      .order('created_at', { ascending: false });
    const { data: teams } = await supabase.from('teams').select('id, name, abbreviation, logo_url, primary_color');
    const teamMap = {};
    (teams || []).forEach(t => teamMap[t.id] = t);
    res.json({ moves: (moves || []).map(m => ({ ...m, team: teamMap[m.team_id] || null })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — approve or reject a move
app.post('/api/admin/moves/:id/action', async (req, res) => {
  const me = await requireAdmin(req, res, 'requests');
  if (!me) return;
  try {
    const { action, admin_note } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
    const { data: move } = await supabase.from('roster_moves').select('*').eq('id', req.params.id).single();
    if (!move) return res.status(404).json({ error: 'Move not found' });
    if (move.status !== 'pending') return res.status(400).json({ error: 'Move is not pending' });

    if (action === 'approve') {
      const details = move.details || {};
      if (move.move_type === 'sign') {
        // create or update player row
        const { data: existing } = await supabase.from('players').select('*')
          .ilike('roblox_username', move.player_username).maybeSingle();
        if (existing) {
          await supabase.from('players').update({
            team_id: move.team_id,
            position: details.position || existing.position,
            cap_value: details.cap_value != null ? details.cap_value : existing.cap_value
          }).eq('id', existing.id);
        } else {
          // resolve Roblox avatar
          let avatar_url = null, roblox_user_id = null, rname = move.player_username;
          const ru = await getRobloxUser(move.player_username);
          if (ru) { roblox_user_id = String(ru.id); rname = ru.name; avatar_url = await getRobloxAvatar(ru.id); }
          const row = { roblox_username: rname, roblox_user_id, avatar_url, team_id: move.team_id, position: details.position || null, cap_value: details.cap_value || 0 };
          STAT_KEYS.forEach(k => row[k] = 0);
          await supabase.from('players').insert(row);
        }
      }
      if (move.move_type === 'trade') {
        const { data: player } = await supabase.from('players').select('*').ilike('roblox_username', move.player_username).maybeSingle();
        if (player) {
          await supabase.from('players').update({
            team_id: details.destination_team_id || null,
            position: details.position || player.position,
            cap_value: details.cap_value != null ? details.cap_value : player.cap_value
          }).eq('id', player.id);
        }
      }
    }

    await supabase.from('roster_moves').update({
      status: action === 'approve' ? 'approved' : 'rejected',
      admin_note: admin_note || null
    }).eq('id', move.id);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  CLEAN URL ROUTING
// ─────────────────────────────────────────────

app.use(express.static(PUBLIC_DIR, { extensions: false }));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.get('/teams/:slug', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'teams.html')));
app.get('/coaches/:slug', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'coaches.html')));
app.get('/coaches', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'coaches.html')));

app.get('/:page.html', (req, res) => {
  res.redirect(301, '/' + req.params.page.replace(/index$/, ''));
});

app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  if (page.includes('.') || page === 'api') return next();
  res.sendFile(path.join(PUBLIC_DIR, page + '.html'), (err) => { if (err) next(); });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OFL Network running on ${PORT}`));