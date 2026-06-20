require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist');
const CLIENT_DIR = fs.existsSync(DIST_DIR) ? DIST_DIR : PUBLIC_DIR;

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
const ALL_ADMIN_TABS = ['access', 'teams', 'schedule', 'requests', 'registry', 'media'];

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
  const headerRowIndex = rows.findIndex(row => {
    const filled = (row || []).map((cell, index) => ({ cell: (cell || '').trim(), index })).filter(x => x.cell);
    if (filled.length < 2) return false;
    const first = filled[0].cell.toUpperCase();
    return !KNOWN_SECTIONS.includes(first) && !first.startsWith('USERNAME') && filled.some(x => x.index > filled[0].index + 2);
  });
  const r0 = headerRowIndex === -1 ? 0 : headerRowIndex;
  const firstRow = rows[r0] || [];
  const filledCols = firstRow.map((cell, index) => ({ cell: (cell || '').trim(), index })).filter(x => x.cell);
  if (!filledCols.length) return null;

  let team1Col = filledCols[0].index;
  let team2Col = null;
  for (let c = team1Col + 1; c < firstRow.length; c++) {
    if ((firstRow[c] || '').trim() !== '') { team2Col = c; break; }
  }
  if (team2Col == null) {
    // only one team block in the CSV
    const t1 = parseTeamBlock(rows, team1Col, firstRow.length - 1, r0);
    return { team1: t1, team2: null };
  }
  const t1 = parseTeamBlock(rows, team1Col, team2Col - 1, r0);
  const t2 = parseTeamBlock(rows, team2Col, firstRow.length - 1, r0);
  return { team1: t1, team2: t2 };
}

function normalizeTeamName(value) {
  return String(value || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

function findTeamByName(teams, name) {
  const wanted = normalizeTeamName(name);
  if (!wanted) return null;
  return (teams || []).find(t => normalizeTeamName(t.name) === wanted)
    || (teams || []).find(t => wanted.endsWith(normalizeTeamName((t.name || '').split(/\s+/).pop())));
}

function parseScheduleLines(text) {
  return String(text || '').split(/\r?\n/)
    .map((line, index) => ({ raw: line.trim(), lineNumber: index + 1 }))
    .filter(row => row.raw)
    .map(row => {
      const parts = row.raw.split(/\s+@\s+/);
      if (parts.length !== 2) {
        return {
          raw: row.raw,
          lineNumber: row.lineNumber,
          error: `Line ${row.lineNumber}: use Away Team @ Home Team`
        };
      }
      const awayName = parts[0].trim();
      const homeName = parts[1].trim();
      if (!awayName || !homeName) {
        return {
          raw: row.raw,
          lineNumber: row.lineNumber,
          error: `Line ${row.lineNumber}: both teams are required`
        };
      }
      return { raw: row.raw, lineNumber: row.lineNumber, awayName, homeName };
    });
}

function flattenBoxPlayers(box, teamId, side) {
  return Object.entries((box && box.players) || {}).map(([username, stats]) => ({
    username,
    stats,
    team_id: teamId || null,
    side
  }));
}

function parseFinalScoreFromCSV(text, teamAName, teamBName) {
  const rows = parseCSVText(text);
  for (let r = 0; r < rows.length; r++) {
    const c = (rows[r] || []).findIndex(cell => String(cell || '').trim().toUpperCase() === 'FINAL SCORE');
    if (c === -1) continue;
    const labels = rows[r + 1] || [];
    const scores = rows[r + 2] || [];
    const out = {};
    for (let i = c - 4; i <= c + 4; i++) {
      if (i < 0) continue;
      const label = String(labels[i] || '').trim();
      const score = normScore(scores[i]);
      if (!label || score == null) continue;
      out[normalizeTeamName(label)] = score;
    }
    const aMascot = String(teamAName || '').split(/\s+/).pop();
    const bMascot = String(teamBName || '').split(/\s+/).pop();
    return {
      team1: out[normalizeTeamName(teamAName)] ?? out[normalizeTeamName(aMascot)] ?? null,
      team2: out[normalizeTeamName(teamBName)] ?? out[normalizeTeamName(bMascot)] ?? null
    };
  }
  return null;
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
    const { error: codeInsErr } = await supabase.from('verification_codes').insert({
      roblox_username: robloxUser.name, code, expires_at: expires, used: false
    });
    if (codeInsErr) { console.error('code insert error:', codeInsErr.message); return res.status(500).json({ error: 'Failed to create verification code: ' + codeInsErr.message }); }
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

    const { data: codes, error: codeErr } = await supabase
      .from('verification_codes').select('*')
      .ilike('roblox_username', robloxUser.name).eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false }).limit(1);
    if (codeErr) { console.error('code lookup error:', codeErr.message); return res.status(500).json({ error: 'Database error looking up code' }); }
    if (!codes || codes.length === 0) return res.status(400).json({ error: 'No active code — start over' });
    const codeRow = codes[0];

    const description = await getRobloxDescription(robloxUser.id);
    if (description === null) return res.status(400).json({ error: 'Could not read your Roblox bio — try again' });
    if (!description.includes(codeRow.code)) {
      return res.status(400).json({ error: 'Code not found in your Roblox bio yet — paste it and save, then try again' });
    }

    const avatar = await getRobloxAvatar(robloxUser.id);

    // use maybeSingle() so no row found returns null instead of throwing
    const { data: existing, error: profileErr } = await supabase
      .from('user_profiles').select('*')
      .eq('roblox_user_id', String(robloxUser.id)).maybeSingle();
    if (profileErr) { console.error('profile lookup error:', profileErr.message); return res.status(500).json({ error: 'Database error looking up profile' }); }

    let profile;
    if (existing) {
      const { data, error: upErr } = await supabase.from('user_profiles')
        .update({ roblox_username: robloxUser.name, avatar_url: avatar, is_verified: true })
        .eq('roblox_user_id', String(robloxUser.id)).select().single();
      if (upErr) { console.error('profile update error:', upErr.message); return res.status(500).json({ error: 'Failed to update profile' }); }
      profile = data;
    } else {
      const { data, error: insErr } = await supabase.from('user_profiles')
        .insert({
          roblox_username: robloxUser.name,
          roblox_user_id: String(robloxUser.id),
          supabase_user_id: crypto.randomUUID(),
          avatar_url: avatar, is_verified: true
        }).select().single();
      if (insErr) { console.error('profile insert error:', insErr.message); return res.status(500).json({ error: 'Failed to create profile: ' + insErr.message }); }
      profile = data;
    }

    await supabase.from('verification_codes').update({ used: true }).eq('id', codeRow.id);

    const token = signToken(robloxUser.id);
    const { tabs, isAdmin, isSuper } = effectiveTabs(profile);
    res.json({
      success: true, token,
      profile: { ...profile, admin_tabs: tabs, is_admin: isAdmin, is_superuser: isSuper }
    });
  } catch (err) {
    console.error('verify unexpected error:', err);
    res.status(500).json({ error: 'Something went wrong: ' + err.message });
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
    const regPlayers = await fetchAll(
      supabase.from('league_players').select('roblox_username, eligibility')
    );
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
    const { name, abbreviation, primary_color, secondary_color, logo_url, location, founded, head_coach, director_of_ops, franchise_owner, is_dpp, tier } = req.body;
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
      is_dpp: is_dpp === true || is_dpp === 'true',
      tier: tier ? parseInt(tier, 10) : null
    }).select().single();
    if (error) throw error;
    ensureHCOnRoster(data).catch(e => console.error('HC roster err:', e.message));
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
    const { name, abbreviation, primary_color, secondary_color, logo_url, location, founded, head_coach, director_of_ops, franchise_owner, is_dpp, tier } = req.body;
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
      is_dpp: is_dpp === true || is_dpp === 'true',
      tier: tier ? parseInt(tier, 10) : null
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

function isMissingSupabaseTable(error, tableName) {
  if (!error) return false;
  const text = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase();
  return text.includes(tableName.toLowerCase()) && (text.includes('schema cache') || text.includes('does not exist') || text.includes('not found'));
}

function missingBoxScoresError() {
  const error = new Error('Database setup needed: create the public.box_scores table before importing stats. Run supabase/2026-06-20_box_scores.sql in the Supabase SQL editor.');
  error.statusCode = 500;
  return error;
}

async function ensureBoxScoresTable() {
  const { error } = await supabase.from('box_scores').select('id').limit(1);
  if (isMissingSupabaseTable(error, 'box_scores')) throw missingBoxScoresError();
  if (error) throw error;
}

async function removeImportedStatsForGame(gameId, { requireBoxScores = false } = {}) {
  const { data: box, error } = await supabase.from('box_scores').select('*').eq('game_id', gameId).maybeSingle();
  if (isMissingSupabaseTable(error, 'box_scores')) {
    if (requireBoxScores) throw missingBoxScoresError();
    return { hadStats: false, removed: 0 };
  }
  if (error) throw error;
  if (!box) return { hadStats: false, removed: 0 };

  const updatesPlayerTotals = box.data?.meta?.updates_player_totals !== false;
  const usernames = [];
  ['team1', 'team2'].forEach(slot => {
    Object.keys(box.data?.[slot]?.players || {}).forEach(username => usernames.push(username));
  });

  if (updatesPlayerTotals) {
    const { data: players, error: playersError } = await supabase.from('players').select('*');
    if (playersError) throw playersError;
    const byUsername = {};
    (players || []).forEach(player => { byUsername[(player.roblox_username || '').toLowerCase()] = player; });

    for (const username of usernames) {
      const player = byUsername[username.toLowerCase()];
      if (!player) continue;
      const deltas = {
        ...(box.data?.team1?.players?.[username] || {}),
        ...(box.data?.team2?.players?.[username] || {})
      };
      const update = {};
      STAT_KEYS.forEach(k => { update[k] = Math.max(0, (player[k] || 0) - (deltas[k] || 0)); });
      await supabase.from('players').update(update).eq('id', player.id);
    }
  }

  const { error: deleteError } = await supabase.from('box_scores').delete().eq('id', box.id);
  if (deleteError) throw deleteError;
  return { hadStats: true, removed: usernames.length };
}

function missingDiscordTransactionsError() {
  const error = new Error('Database setup needed: create the public.discord_transactions table. Run supabase/2026-06-20_discord_transactions.sql in the Supabase SQL editor.');
  error.statusCode = 500;
  return error;
}

async function ensureDiscordTransactionsTable() {
  const { error } = await supabase.from('discord_transactions').select('id').limit(1);
  if (isMissingSupabaseTable(error, 'discord_transactions')) throw missingDiscordTransactionsError();
  if (error) throw error;
}

function missingLeagueSettingsError() {
  const error = new Error('Database setup needed: create the public.league_settings table. Run supabase/2026-06-20_league_settings.sql in the Supabase SQL editor.');
  error.statusCode = 500;
  return error;
}

function missingLeagueWeeksError() {
  const error = new Error('Database setup needed: create the public.league_weeks table. Run supabase/2026-06-20_league_weeks.sql in the Supabase SQL editor.');
  error.statusCode = 500;
  return error;
}

async function getLeagueSetting(key) {
  const { data, error } = await supabase
    .from('league_settings').select('value')
    .eq('key', key).maybeSingle();
  if (isMissingSupabaseTable(error, 'league_settings')) return null;
  if (error) throw error;
  return data ? data.value : null;
}

async function setLeagueSetting(key, value) {
  const { data, error } = await supabase
    .from('league_settings')
    .upsert({ key, value: value == null ? null : String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select()
    .single();
  if (isMissingSupabaseTable(error, 'league_settings')) throw missingLeagueSettingsError();
  if (error) throw error;
  return data;
}

function normalizeWeekKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^week\s+/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeWeekPhase(value) {
  return String(value || '').trim().toLowerCase() === 'playoffs' ? 'playoffs' : 'regular';
}

async function listLeagueWeeks() {
  const { data, error } = await supabase
    .from('league_weeks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (isMissingSupabaseTable(error, 'league_weeks')) return null;
  if (error) throw error;
  return data || [];
}

async function listLeagueWeeksWithFallback(games = []) {
  const weeks = await listLeagueWeeks();
  if (weeks) return weeks;
  const keys = new Map();
  (games || []).forEach(g => {
    const key = String(g.week || '').trim();
    if (key) keys.set(key, true);
  });
  return [...keys.keys()].sort((a, b) => weekRankValue(a) - weekRankValue(b)).map((key, index) => ({
    id: null,
    season: 48,
    week_key: key,
    label: weekLabelText(key),
    phase: 'regular',
    sort_order: index + 1
  }));
}

async function getWeekPhase(weekKey) {
  const key = String(weekKey || '').trim();
  if (!key) return 'regular';
  const { data, error } = await supabase
    .from('league_weeks')
    .select('phase')
    .eq('week_key', key)
    .maybeSingle();
  if (isMissingSupabaseTable(error, 'league_weeks')) return 'regular';
  if (error) throw error;
  return normalizeWeekPhase(data?.phase);
}

function weekRankValue(w) {
  const t = String(w || '').trim();
  const n = parseInt(t, 10);
  if (!isNaN(n) && String(n) === t) return n;
  const l = t.toLowerCase();
  if (l.includes('playoff')) return 1000;
  if (l.includes('champ')) return 1001;
  return 999;
}

function weekLabelText(w) {
  const t = String(w || '').trim();
  const n = parseInt(t, 10);
  if (!isNaN(n) && String(n) === t) return 'Week ' + n;
  return t || 'Week';
}

// public — list all games (schedule + scores)
app.get('/api/games', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    const { data: games } = await supabase
      .from('games').select('*')
      .order('game_date', { ascending: true });
    const { data: teams } = await supabase.from('teams').select('*');
    const { data: boxes, error: boxesError } = await supabase.from('box_scores').select('id, game_id, created_at');
    if (boxesError && !isMissingSupabaseTable(boxesError, 'box_scores')) throw boxesError;
    const boxByGame = {};
    (boxes || []).forEach(box => {
      if (box.game_id && !boxByGame[box.game_id]) boxByGame[box.game_id] = box;
    });
    const rows = attachTeams(games || [], teams || []).map(game => ({
      ...game,
      stats_imported: Boolean(boxByGame[game.id]),
      box_score_id: boxByGame[game.id]?.id || null,
      stats_imported_at: boxByGame[game.id]?.created_at || null
    }));
    const weeks = await listLeagueWeeksWithFallback(rows);
    const activeWeek = await getLeagueSetting('active_week');
    res.json({ games: rows, weeks, settings: { active_week: activeWeek } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weeks', async (req, res) => {
  try {
    const weeks = await listLeagueWeeksWithFallback([]);
    res.json({ weeks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const activeWeek = await getLeagueSetting('active_week');
    res.json({ settings: { active_week: activeWeek } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
//  STANDINGS (tier-aware point system)
// ─────────────────────────────────────────────

const TIER_WIN_PTS = { 1: 3, 2: 2.5, 3: 2, 4: 1.5, 5: 1 };

function weekType(weekStr) {
  if (!weekStr) return 'series';
  const w = String(weekStr).trim().toLowerCase();
  if (w === 'week 1' || w === '1') return 'placement';
  if (w === 'week 10' || w === '10') return 'playup';
  return 'series';
}

function calcPoints(game, winnerTeam) {
  // Week 10: use manually set point_value
  const wt = weekType(game.week);
  if (wt === 'playup') return game.point_value != null ? Number(game.point_value) : 0;
  // Week 1 (Placement): flat 2 pts
  if (wt === 'placement') return 2;
  // Series weeks: based on winner's tier
  const tier = winnerTeam?.tier;
  return tier ? (TIER_WIN_PTS[tier] || 0) : 0;
}

app.get('/api/standings', async (req, res) => {
  try {
    const { data: teams } = await supabase.from('teams').select('*').order('name');
    const { data: games } = await supabase.from('games').select('*');

    // build team map
    const teamMap = {};
    (teams || []).forEach(t => teamMap[t.id] = t);

    // accumulate points, wins, losses per team
    const stats = {};
    (teams || []).forEach(t => {
      stats[t.id] = { team: t, pts: 0, w: 0, l: 0, pf: 0, pa: 0 };
    });

    for (const g of (games || [])) {
      const hs = g.home_score, as = g.away_score;
      if (hs === null || hs === undefined || as === null || as === undefined) continue;
      if (hs === as) continue; // no ties
      const homeTeam = teamMap[g.home_team_id];
      const awayTeam = teamMap[g.away_team_id];
      if (!homeTeam || !awayTeam) continue;
      if (!stats[g.home_team_id]) continue;
      if (!stats[g.away_team_id]) continue;

      const homeWon = hs > as;
      const winnerTeam = homeWon ? homeTeam : awayTeam;
      const pts = calcPoints(g, winnerTeam);

      if (homeWon) {
        stats[g.home_team_id].w++;
        stats[g.home_team_id].pts += pts;
        stats[g.away_team_id].l++;
      } else {
        stats[g.away_team_id].w++;
        stats[g.away_team_id].pts += pts;
        stats[g.home_team_id].l++;
      }
      stats[g.home_team_id].pf += hs; stats[g.home_team_id].pa += as;
      stats[g.away_team_id].pf += as; stats[g.away_team_id].pa += hs;
    }

    const rows = Object.values(stats).map(s => ({
      team_id: s.team.id,
      name: s.team.name,
      abbreviation: s.team.abbreviation,
      primary_color: s.team.primary_color,
      logo_url: s.team.logo_url,
      tier: s.team.tier || null,
      pts: s.pts,
      w: s.w,
      l: s.l,
      pf: s.pf,
      pa: s.pa,
      net: s.pf - s.pa,
      slug: slugify(s.team.name)
    }));

    // overall: sorted by pts desc, then net
    const overall = [...rows].sort((a, b) => b.pts - a.pts || b.net - a.net);

    // by tier: group, sort within tier by pts
    const byTier = {};
    for (let t = 1; t <= 5; t++) byTier[t] = [];
    rows.forEach(r => { if (r.tier >= 1 && r.tier <= 5) byTier[r.tier].push(r); });
    for (let t = 1; t <= 5; t++) byTier[t].sort((a, b) => b.pts - a.pts || b.net - a.net);

    res.json({ overall, byTier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — create a game
app.post('/api/admin/games', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const { week, game_date, game_time, home_team_id, away_team_id, home_score, away_score, point_value } = req.body;
    if (!home_team_id || !away_team_id) return res.status(400).json({ error: 'Both teams are required' });
    if (home_team_id === away_team_id) return res.status(400).json({ error: 'Home and away teams must differ' });
    const hs = normScore(home_score), as = normScore(away_score);
    const pv = (point_value !== undefined && point_value !== '' && point_value !== null) ? Number(point_value) : null;
    const { data, error } = await supabase.from('games').insert({
      week: (week !== undefined && week !== null && String(week).trim() !== '') ? String(week).trim() : null,
      game_date: game_date || null,
      game_time: (game_time || '').trim() || null,
      home_team_id, away_team_id,
      home_score: hs, away_score: as,
      point_value: pv
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
    const { week, game_date, game_time, home_team_id, away_team_id, home_score, away_score, point_value } = req.body;
    if (!home_team_id || !away_team_id) return res.status(400).json({ error: 'Both teams are required' });
    if (home_team_id === away_team_id) return res.status(400).json({ error: 'Home and away teams must differ' });
    const hs = normScore(home_score), as = normScore(away_score);
    const pv = (point_value !== undefined && point_value !== '' && point_value !== null) ? Number(point_value) : null;
    const { data, error } = await supabase.from('games').update({
      week: (week !== undefined && week !== null && String(week).trim() !== '') ? String(week).trim() : null,
      game_date: game_date || null,
      game_time: (game_time || '').trim() || null,
      home_team_id, away_team_id,
      home_score: hs, away_score: as,
      point_value: pv
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
    const stats = await removeImportedStatsForGame(req.params.id);
    const { error } = await supabase.from('games').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, stats_removed: stats.removed, had_stats: stats.hadStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings/active-week', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const week = String(req.body.week || '').trim();
    if (!week) return res.status(400).json({ error: 'Week is required' });
    await setLeagueSetting('active_week', week);
    res.json({ success: true, active_week: week });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/admin/weeks', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const label = String(req.body.label || '').trim();
    const explicitKey = String(req.body.week_key || '').trim();
    const weekKey = normalizeWeekKey(explicitKey || label);
    if (!label) return res.status(400).json({ error: 'Week label is required' });
    if (!weekKey) return res.status(400).json({ error: 'Week key is required' });
    const sortOrder = req.body.sort_order !== undefined && req.body.sort_order !== '' && req.body.sort_order !== null
      ? parseInt(req.body.sort_order, 10)
      : weekRankValue(weekKey);
    const { data, error } = await supabase.from('league_weeks').insert({
      season: req.body.season ? parseInt(req.body.season, 10) : 48,
      week_key: weekKey,
      label,
      phase: normalizeWeekPhase(req.body.phase),
      sort_order: isNaN(sortOrder) ? 999 : sortOrder,
      starts_on: req.body.starts_on || null,
      ends_on: req.body.ends_on || null,
      updated_at: new Date().toISOString()
    }).select().single();
    if (isMissingSupabaseTable(error, 'league_weeks')) throw missingLeagueWeeksError();
    if (error) throw error;
    res.json({ success: true, week: data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.put('/api/admin/weeks/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const current = await supabase.from('league_weeks').select('*').eq('id', req.params.id).single();
    if (isMissingSupabaseTable(current.error, 'league_weeks')) throw missingLeagueWeeksError();
    if (current.error) throw current.error;
    const oldKey = current.data.week_key;
    const label = String(req.body.label || '').trim();
    const explicitKey = String(req.body.week_key || '').trim();
    const weekKey = normalizeWeekKey(explicitKey || label);
    if (!label) return res.status(400).json({ error: 'Week label is required' });
    if (!weekKey) return res.status(400).json({ error: 'Week key is required' });
    const sortOrder = req.body.sort_order !== undefined && req.body.sort_order !== '' && req.body.sort_order !== null
      ? parseInt(req.body.sort_order, 10)
      : weekRankValue(weekKey);
    const { data, error } = await supabase.from('league_weeks').update({
      week_key: weekKey,
      label,
      phase: normalizeWeekPhase(req.body.phase),
      sort_order: isNaN(sortOrder) ? 999 : sortOrder,
      starts_on: req.body.starts_on || null,
      ends_on: req.body.ends_on || null,
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    if (weekKey !== oldKey) {
      await supabase.from('games').update({ week: weekKey }).eq('week', oldKey);
      const active = await getLeagueSetting('active_week');
      if (active === oldKey) await setLeagueSetting('active_week', weekKey);
    }
    res.json({ success: true, week: data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.delete('/api/admin/weeks/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const { data: week, error: weekError } = await supabase.from('league_weeks').select('*').eq('id', req.params.id).single();
    if (isMissingSupabaseTable(weekError, 'league_weeks')) throw missingLeagueWeeksError();
    if (weekError) throw weekError;
    const { data: games, error: gamesError } = await supabase.from('games').select('id').eq('week', week.week_key).limit(1);
    if (gamesError) throw gamesError;
    if ((games || []).length) return res.status(409).json({ error: "Delete or move this week's games before deleting the week." });
    const { error } = await supabase.from('league_weeks').delete().eq('id', req.params.id);
    if (error) throw error;
    const active = await getLeagueSetting('active_week');
    if (active === week.week_key) await setLeagueSetting('active_week', null);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

app.post('/api/admin/games/import-csv', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const { csv, week } = req.body;
    if (!csv || !csv.trim()) return res.status(400).json({ error: 'Schedule CSV is required' });
    const weekValue = String(week || '').trim();
    if (!weekValue) return res.status(400).json({ error: 'Select a week before importing games' });
    const parsed = parseScheduleLines(csv);
    const invalid = parsed.filter(row => row.error);
    if (invalid.length) {
      return res.status(400).json({
        error: invalid[0].error,
        details: invalid.map(row => ({ line: row.lineNumber, text: row.raw, error: row.error }))
      });
    }

    const { data: teams, error: teamsError } = await supabase.from('teams').select('id,name');
    if (teamsError) throw teamsError;
    const rows = [];
    const missing = [];
    for (const row of parsed) {
      const away = findTeamByName(teams || [], row.awayName);
      const home = findTeamByName(teams || [], row.homeName);
      if (!away || !home) {
        missing.push(`Line ${row.lineNumber}: ${row.raw}${!away ? ` (away team not found: ${row.awayName})` : ''}${!home ? ` (home team not found: ${row.homeName})` : ''}`);
        continue;
      }
      if (away.id === home.id) {
        missing.push(`Line ${row.lineNumber}: ${row.raw} (same team matched twice)`);
        continue;
      }
      rows.push({
        week: weekValue,
        away_team_id: away.id,
        home_team_id: home.id,
        game_date: null,
        game_time: null,
        home_score: null,
        away_score: null,
        point_value: null
      });
    }

    if (missing.length) return res.status(400).json({ error: 'Could not match every team', missing });
    if (!rows.length) return res.status(400).json({ error: 'No games found in CSV' });

    const { data, error } = await supabase.from('games').insert(rows).select();
    if (error) throw error;
    res.json({ success: true, imported: data.length, games: data });
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
async function importParsedGameStats({ players, game_id, team1_id, team2_id, team1_name, team2_name }) {
  if (!Array.isArray(players) || players.length === 0) {
    const error = new Error('No player rows to import');
    error.statusCode = 400;
    error.details = ['The CSV was parsed, but no player stat rows were found. Confirm the file is the exported OFL statistics CSV and includes player rows under each stat section.'];
    throw error;
  }

  await ensureBoxScoresTable();

  if (game_id) {
    const { data: existingBox, error: existingBoxError } = await supabase.from('box_scores').select('id').eq('game_id', game_id).maybeSingle();
    if (existingBoxError) throw existingBoxError;
    if (existingBox) {
      const error = new Error('Stats have already been imported for this game. Remove them before importing again.');
      error.statusCode = 409;
      error.details = ['This game already has a stored box score. Use Remove Stats on the game card before importing a replacement CSV.'];
      throw error;
    }
  }

  let statPhase = 'regular';
  if (game_id) {
    const { data: gameForPhase, error: gameForPhaseError } = await supabase.from('games').select('week').eq('id', game_id).maybeSingle();
    if (gameForPhaseError) throw gameForPhaseError;
    statPhase = await getWeekPhase(gameForPhase?.week);
  }
  const updatesPlayerTotals = statPhase !== 'playoffs';

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

    if (updatesPlayerTotals) {
      const update = {};
      STAT_KEYS.forEach(k => { update[k] = (player[k] || 0) + (deltas[k] || 0); });
      const { data: updated } = await supabase.from('players').update(update).eq('id', player.id).select().single();
      byUsername[key] = updated;
    }

    const assignedTeamId = row.team_id || player.team_id;
    const slot = (assignedTeamId === team1_id) ? 'team1' : (assignedTeamId === team2_id) ? 'team2' : (row.side === 2 ? 'team2' : 'team1');
    boxData[slot].players[username] = deltas;
  }

  const { data: box, error } = await supabase.from('box_scores').insert({
    game_id: game_id || null,
    team1_name: team1_name || null,
    team2_name: team2_name || null,
    team1_id: team1_id || null,
    team2_id: team2_id || null,
    data: { ...boxData, meta: { phase: statPhase, updates_player_totals: updatesPlayerTotals } }
  }).select().single();
  if (error) throw error;
  return box;
}

app.post('/api/admin/games/:id/import-stats', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const { csv } = req.body;
    if (!csv || !csv.trim()) return res.status(400).json({ error: 'Stats CSV is required' });

    const { data: game, error: gameError } = await supabase.from('games').select('*').eq('id', req.params.id).single();
    if (gameError || !game) return res.status(404).json({ error: 'Game not found' });
    const { data: teams } = await supabase.from('teams').select('id,name');
    const home = (teams || []).find(t => t.id === game.home_team_id);
    const away = (teams || []).find(t => t.id === game.away_team_id);
    if (!home || !away) return res.status(400).json({ error: 'Game teams could not be loaded' });

    const parsed = parseBoxScoreCSV(csv);
    if (!parsed || !parsed.team1 || !parsed.team2) {
      return res.status(400).json({
        error: 'Could not parse both team blocks from this CSV',
        details: [
          'The importer expected two team blocks in the OFL statistics CSV.',
          'Confirm you uploaded the full game statistics export, not a partial category paste or another file type.'
        ]
      });
    }

    const gameTeams = [home, away];
    const parsedTeam1 = findTeamByName(gameTeams, parsed.team1.teamName);
    const parsedTeam2 = findTeamByName(gameTeams, parsed.team2.teamName);
    const selectedGameName = `${away.name} @ ${home.name}`;
    const csvGameName = `${parsed.team1.teamName || 'Unknown'} vs ${parsed.team2.teamName || 'Unknown'}`;

    if (!parsedTeam1 || !parsedTeam2) {
      const missing = [];
      if (!parsedTeam1) missing.push(parsed.team1.teamName || 'first CSV team');
      if (!parsedTeam2) missing.push(parsed.team2.teamName || 'second CSV team');
      return res.status(400).json({
        error: `Wrong stats file for selected game. Selected game is ${selectedGameName}, but the CSV is for ${csvGameName}. Could not match: ${missing.join(', ')}.`,
        details: [
          `Selected game: ${selectedGameName}`,
          `CSV teams: ${csvGameName}`,
          `Unmatched CSV team${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`
        ]
      });
    }
    if (parsedTeam1.id === parsedTeam2.id) {
      return res.status(400).json({
        error: `Wrong stats file for selected game. Selected game is ${selectedGameName}, but both CSV team blocks matched ${parsedTeam1.name}.`,
        details: [
          `Selected game: ${selectedGameName}`,
          `CSV teams: ${csvGameName}`,
          `Both CSV team blocks resolved to ${parsedTeam1.name}.`
        ]
      });
    }
    const csvTeamIds = new Set([parsedTeam1.id, parsedTeam2.id]);
    if (!csvTeamIds.has(home.id) || !csvTeamIds.has(away.id)) {
      return res.status(400).json({
        error: `Wrong stats file for selected game. Selected game is ${selectedGameName}, but the CSV is for ${csvGameName}.`,
        details: [
          `Selected game: ${selectedGameName}`,
          `CSV teams: ${csvGameName}`,
          'The CSV teams do not match both teams on the selected game card.'
        ]
      });
    }

    const rows = [
      ...flattenBoxPlayers(parsed.team1, parsedTeam1.id, 1),
      ...flattenBoxPlayers(parsed.team2, parsedTeam2.id, 2)
    ];
    if (!rows.length) {
      return res.status(400).json({
        error: 'No player rows found in this stats CSV',
        details: [
          `CSV teams parsed: ${csvGameName}`,
          'No player stat rows were found under the parsed team blocks.',
          'Confirm the CSV includes the player stat sections and was not edited before upload.'
        ]
      });
    }

    const box = await importParsedGameStats({
      players: rows,
      game_id: game.id,
      team1_id: parsedTeam1.id,
      team2_id: parsedTeam2.id,
      team1_name: parsedTeam1.name,
      team2_name: parsedTeam2.name
    });

    const finalScore = parseFinalScoreFromCSV(csv, parsed.team1.teamName, parsed.team2.teamName);
    if (finalScore && finalScore.team1 != null && finalScore.team2 != null) {
      const scoreUpdate = parsedTeam1.id === game.home_team_id
        ? { home_score: finalScore.team1, away_score: finalScore.team2 }
        : { home_score: finalScore.team2, away_score: finalScore.team1 };
      await supabase.from('games').update(scoreUpdate).eq('id', game.id);
    }

    res.json({ success: true, box_score_id: box.id, imported: rows.length });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message, details: err.details || [] });
  }
});

app.delete('/api/admin/games/:id/stats', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const result = await removeImportedStatsForGame(req.params.id, { requireBoxScores: true });
    if (!result.hadStats) return res.status(404).json({ error: 'No imported stats found for this game' });
    res.json({ success: true, removed: result.removed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// public — fetch a stored box score by id
app.get('/api/box-scores/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('box_scores').select('*').eq('id', req.params.id).single();
    if (isMissingSupabaseTable(error, 'box_scores')) return res.status(404).json({ error: 'Box score storage is not set up yet' });
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ box_score: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// public — list box scores (most recent first)
app.get('/api/box-scores', async (req, res) => {
  try {
    const { data, error } = await supabase.from('box_scores').select('id, game_id, team1_name, team2_name, team1_id, team2_id, created_at').order('created_at', { ascending: false });
    if (isMissingSupabaseTable(error, 'box_scores')) return res.json({ box_scores: [] });
    if (error) throw error;
    res.json({ box_scores: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — import previous-season stats (category rows, merged by username for the season)
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


// helper — fetch all rows from a table past Supabase's 1000-row default limit
async function fetchAll(query) {
  const PAGE = 1000;
  let page = 0, all = [];
  while (true) {
    const { data, error } = await query.range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    page++;
  }
  return all;
}

// admin — manually add a player to a team
app.post('/api/admin/roster/add', async (req, res) => {
  const me = await requireAdmin(req, res, 'teams');
  if (!me) return;
  try {
    const { team_id, username } = req.body;
    if (!team_id || !username) return res.status(400).json({ error: 'Team and username required' });
    const { data: regEntry } = await supabase.from('league_players').select('*').ilike('roblox_username', username.trim()).maybeSingle();
    const capVal = regEntry?.cap_value || 0;
    const { data: existing } = await supabase.from('players').select('*').ilike('roblox_username', username.trim()).maybeSingle();
    if (existing) {
      await supabase.from('players').update({ team_id, cap_value: capVal }).eq('id', existing.id);
    } else {
      let avatar_url = null, roblox_user_id = null, rname = username.trim();
      const ru = await getRobloxUser(rname);
      if (ru) { roblox_user_id = String(ru.id); rname = ru.name; avatar_url = await getRobloxAvatar(ru.id); }
      const row = { roblox_username: rname, roblox_user_id, avatar_url, team_id, cap_value: capVal, position: null };
      STAT_KEYS.forEach(k => row[k] = 0);
      const { error: insErr } = await supabase.from('players').insert(row);
      if (insErr) return res.status(500).json({ error: insErr.message });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// admin — remove a player from their team
app.post('/api/admin/roster/remove', async (req, res) => {
  const me = await requireAdmin(req, res, 'teams');
  if (!me) return;
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const { data: player } = await supabase.from('players').select('*').ilike('roblox_username', username.trim()).maybeSingle();
    if (!player) return res.status(404).json({ error: 'Player not found' });
    await supabase.from('players').update({ team_id: null, position: null, cap_value: 0 }).eq('id', player.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    const reg = await fetchAll(
      supabase.from('league_players').select('*').order('cap_value', { ascending: false }).order('roblox_username')
    );
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
// helper — ensure HC is on their team roster with registry cap
async function ensureHCOnRoster(team) {
  if (!team.head_coach) return;
  const hcName = team.head_coach.trim();
  if (!hcName) return;
  const { data: regEntry } = await supabase.from('league_players').select('cap_value').ilike('roblox_username', hcName).maybeSingle();
  const capVal = regEntry?.cap_value ?? 0;
  const { data: existing } = await supabase.from('players').select('*').ilike('roblox_username', hcName).maybeSingle();
  if (existing) {
    if (existing.team_id !== team.id) await supabase.from('players').update({ team_id: team.id, cap_value: capVal }).eq('id', existing.id);
  } else {
    let avatar_url = null, roblox_user_id = null, rname = hcName;
    const ru = await getRobloxUser(hcName);
    if (ru) { roblox_user_id = String(ru.id); rname = ru.name; avatar_url = await getRobloxAvatar(ru.id); }
    const row = { roblox_username: rname, roblox_user_id, avatar_url, team_id: team.id, cap_value: capVal, position: null };
    STAT_KEYS.forEach(k => row[k] = 0);
    await supabase.from('players').insert(row);
  }
}

app.get('/api/coach/me', async (req, res) => {
  try {
    const coach = await getCoach(req);
    if (!coach) return res.json({ coach: null });
    const { data: players } = await supabase.from('players').select('id, roblox_username, avatar_url, position, cap_value').eq('team_id', coach.team.id).order('cap_value', { ascending: false });
    const { data: games } = await supabase.from('games').select('*').or(`home_team_id.eq.${coach.team.id},away_team_id.eq.${coach.team.id}`).order('week');
    const { data: allTeams } = await supabase.from('teams').select('id, name, abbreviation');
    const teamMap = {}; (allTeams || []).forEach(t => teamMap[t.id] = t);
    const opponents = (games || []).map(g => {
      const oppId = g.home_team_id === coach.team.id ? g.away_team_id : g.home_team_id;
      return { game_id: g.id, week: g.week, opponent_team_id: oppId, opponent_name: teamMap[oppId]?.name || 'TBD' };
    }).filter(o => o.opponent_team_id);
    const TEAM_CAP = 100_000_000;
    const used = (players || []).reduce((s, p) => s + (p.cap_value || 0), 0);
    res.json({ coach: { username: coach.profile.roblox_username, role: coach.role }, team: { ...coach.team, slug: slugify(coach.team.name) }, players: players || [], cap: { total: TEAM_CAP, used, remaining: TEAM_CAP - used }, opponents });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// search free agents in registry
app.get('/api/registry/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ players: [] });
    const { data: rostered } = await supabase.from('players').select('roblox_username').not('team_id', 'is', null);
    const rosteredSet = new Set((rostered || []).map(p => p.roblox_username.toLowerCase()));
    const { data: results } = await supabase.from('league_players').select('roblox_username, eligibility, cap_value, position_tag').ilike('roblox_username', `${q}%`).limit(10);
    const free = (results || []).filter(p => !rosteredSet.has(p.roblox_username.toLowerCase()));
    res.json({ players: free });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/coach/move', async (req, res) => {
  try {
    const coach = await getCoach(req);
    if (!coach) return res.status(403).json({ error: 'Not a registered coach' });
    const { move_type, player_username, details } = req.body;
    if (!['sign','release','trade','schedule'].includes(move_type)) return res.status(400).json({ error: 'Invalid move type' });

    if (move_type === 'sign') {
      if (!player_username) return res.status(400).json({ error: 'Player username required' });
      const { data: regEntry } = await supabase.from('league_players').select('*').ilike('roblox_username', player_username).maybeSingle();
      if (!regEntry) return res.status(400).json({ error: 'Player not found in the league registry' });
      const { data: onRoster } = await supabase.from('players').select('id, team_id').ilike('roblox_username', player_username).maybeSingle();
      if (onRoster && onRoster.team_id) return res.status(400).json({ error: 'Player is already signed to a team' });
      const capVal = regEntry.cap_value || 0;
      if (onRoster) {
        await supabase.from('players').update({ team_id: coach.team.id, cap_value: capVal }).eq('id', onRoster.id);
      } else {
        let avatar_url = null, roblox_user_id = null, rname = regEntry.roblox_username;
        const ru = await getRobloxUser(rname);
        if (ru) { roblox_user_id = String(ru.id); rname = ru.name; avatar_url = await getRobloxAvatar(ru.id); }
        const row = { roblox_username: rname, roblox_user_id, avatar_url, team_id: coach.team.id, cap_value: capVal, position: null };
        STAT_KEYS.forEach(k => row[k] = 0);
        await supabase.from('players').insert(row);
      }
      const { data: move } = await supabase.from('roster_moves').insert({ team_id: coach.team.id, requesting_username: coach.profile.roblox_username, requesting_role: coach.role, move_type: 'sign', player_username: regEntry.roblox_username, details: { cap_value: capVal }, status: 'logged' }).select().single();
      return res.json({ success: true, move, status: 'logged' });
    }

    if (move_type === 'release') {
      const { data: player } = await supabase.from('players').select('*').ilike('roblox_username', player_username).eq('team_id', coach.team.id).maybeSingle();
      if (!player) return res.status(404).json({ error: 'Player not found on this roster' });
      await supabase.from('players').update({ team_id: null, position: null, cap_value: 0 }).eq('id', player.id);
      const { data: move } = await supabase.from('roster_moves').insert({ team_id: coach.team.id, requesting_username: coach.profile.roblox_username, requesting_role: coach.role, move_type: 'release', player_username, details: details || {}, status: 'logged' }).select().single();
      return res.json({ success: true, move, status: 'logged' });
    }

    if (move_type === 'trade') {
      const { data: move } = await supabase.from('roster_moves').insert({ team_id: coach.team.id, requesting_username: coach.profile.roblox_username, requesting_role: coach.role, move_type: 'trade', player_username: player_username || null, details: details || {}, status: 'pending' }).select().single();
      return res.json({ success: true, move, status: 'pending' });
    }

    if (move_type === 'schedule') {
      const { game_id, proposed_date, proposed_time } = details || {};
      if (!game_id) return res.status(400).json({ error: 'Game required' });
      const { data: game } = await supabase.from('games').select('*').eq('id', game_id).single();
      if (!game) return res.status(404).json({ error: 'Game not found' });
      const opponent_team_id = game.home_team_id === coach.team.id ? game.away_team_id : game.home_team_id;
      if (proposed_date) await supabase.from('games').update({ game_date: proposed_date, game_time: proposed_time || null }).eq('id', game_id);
      const { data: gr } = await supabase.from('game_requests').insert({ requesting_team_id: coach.team.id, opponent_team_id, proposed_date: proposed_date || null, proposed_time: proposed_time || null, status: 'pending_opponent', game_id }).select().single();
      const { data: move } = await supabase.from('roster_moves').insert({ team_id: coach.team.id, requesting_username: coach.profile.roblox_username, requesting_role: coach.role, move_type: 'schedule', details: { game_id, opponent_team_id, proposed_date, proposed_time }, status: 'pending_opponent' }).select().single();
      return res.json({ success: true, move, status: 'pending_opponent', game_request_id: gr.id });
    }

    res.status(400).json({ error: 'Unknown move type' });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

function getWebhookSecret(req) {
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return String(req.headers['x-ofl-webhook-secret'] || bearer || '');
}

function parseSalary(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const raw = String(value).trim().toLowerCase().replace(/\$/g, '').replace(/,/g, '');
  const multiplier = raw.endsWith('m') ? 1_000_000 : raw.endsWith('k') ? 1_000 : 1;
  const number = parseFloat(raw.replace(/[mk]$/, ''));
  return Number.isFinite(number) ? Math.round(number * multiplier) : null;
}

function normalizeClauses(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return { text: value }; }
  }
  return value;
}

function parseWebhookTimestamp(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function findPlayerForWebhook(playerId, playerName) {
  if (playerId) {
    const { data } = await supabase.from('players').select('*').eq('roblox_user_id', String(playerId)).maybeSingle();
    if (data) return data;
  }
  if (playerName) {
    const { data } = await supabase.from('players').select('*').ilike('roblox_username', String(playerName).trim()).maybeSingle();
    if (data) return data;
  }
  return null;
}

async function upsertWebhookPlayer({ playerId, playerName, teamId, salary }) {
  const existing = await findPlayerForWebhook(playerId, playerName);
  if (existing) {
    const update = {};
    if (teamId !== undefined) update.team_id = teamId;
    if (salary !== undefined) update.cap_value = salary || 0;
    const { data, error } = await supabase.from('players').update(update).eq('id', existing.id).select().single();
    if (error) throw error;
    return data;
  }

  if (!playerName) {
    const error = new Error('Player name is required when the player does not already exist');
    error.statusCode = 400;
    throw error;
  }

  const row = {
    roblox_username: String(playerName).trim(),
    roblox_user_id: playerId ? String(playerId) : null,
    avatar_url: null,
    team_id: teamId || null,
    cap_value: salary || 0,
    position: null
  };
  STAT_KEYS.forEach(k => row[k] = 0);
  const { data, error } = await supabase.from('players').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function handleDiscordTransactionsWebhook(req, res) {
  try {
    const expectedSecret = process.env.OFL_WEBHOOK_SECRET;
    if (!expectedSecret) return res.status(500).json({ error: 'OFL_WEBHOOK_SECRET is not configured on the API server' });
    if (getWebhookSecret(req) !== expectedSecret) return res.status(401).json({ error: 'Invalid webhook secret' });

    await ensureDiscordTransactionsTable();

    const body = req.body || {};
    const eventType = String(body.event_type || body.eventType || body.type || '').trim().toLowerCase();
    const playerId = body.player_id ?? body.playerId ?? null;
    const playerName = String(body.player_name || body.playerName || body.player || '').trim();
    const teamName = String(body.team_name || body.teamName || body.team || '').trim();
    const salary = parseSalary(body.salary);
    const clauses = normalizeClauses(body.clauses);
    const eventTimestamp = parseWebhookTimestamp(body.timestamp || body.event_timestamp || body.eventTimestamp);

    if (!['signed', 'released', 'traded'].includes(eventType)) {
      return res.status(400).json({ error: 'event_type must be signed, released, or traded' });
    }
    if (!playerName && !playerId) return res.status(400).json({ error: 'player_name or player_id is required' });
    if (!teamName) return res.status(400).json({ error: 'team_name is required' });
    if (eventTimestamp === null) return res.status(400).json({ error: 'timestamp must be a valid date/time' });
    if (body.salary !== undefined && salary === null) return res.status(400).json({ error: 'salary must be a number, or a value like 2.5M' });

    const { data: teams, error: teamsError } = await supabase.from('teams').select('id,name');
    if (teamsError) throw teamsError;
    const team = findTeamByName(teams || [], teamName);
    if (!team) return res.status(400).json({ error: `Could not match team_name "${teamName}"` });

    let status = 'processed';
    let errorMessage = null;
    let player = null;
    let move = null;

    try {
      if (eventType === 'signed') {
        player = await upsertWebhookPlayer({ playerId, playerName, teamId: team.id, salary: salary || 0 });
        const { data, error } = await supabase.from('roster_moves').insert({
          team_id: team.id,
          requesting_username: 'Discord Bot',
          requesting_role: 'bot',
          move_type: 'sign',
          player_username: player.roblox_username || playerName || null,
          details: { player_id: playerId, salary: salary || 0, clauses, source: 'discord_webhook', event_timestamp: eventTimestamp },
          status: 'logged'
        }).select().single();
        if (error) throw error;
        move = data;
      } else if (eventType === 'released') {
        player = await findPlayerForWebhook(playerId, playerName);
        if (player) {
          const { data, error } = await supabase.from('players').update({ team_id: null, position: null, cap_value: 0 }).eq('id', player.id).select().single();
          if (error) throw error;
          player = data;
        }
        const { data, error } = await supabase.from('roster_moves').insert({
          team_id: team.id,
          requesting_username: 'Discord Bot',
          requesting_role: 'bot',
          move_type: 'release',
          player_username: player?.roblox_username || playerName || null,
          details: { player_id: playerId, salary, clauses, source: 'discord_webhook', event_timestamp: eventTimestamp },
          status: 'logged'
        }).select().single();
        if (error) throw error;
        move = data;
      } else if (eventType === 'traded') {
        player = await upsertWebhookPlayer({ playerId, playerName, teamId: team.id, salary: salary || 0 });
        const { data, error } = await supabase.from('roster_moves').insert({
          team_id: team.id,
          requesting_username: 'Discord Bot',
          requesting_role: 'bot',
          move_type: 'trade',
          player_username: player.roblox_username || playerName || null,
          details: { player_id: playerId, destination_team_id: team.id, salary: salary || 0, clauses, source: 'discord_webhook', event_timestamp: eventTimestamp },
          status: 'logged'
        }).select().single();
        if (error) throw error;
        move = data;
      }
    } catch (err) {
      status = 'failed';
      errorMessage = err.message || String(err);
    }

    const { data: transaction, error: txError } = await supabase.from('discord_transactions').insert({
      event_type: eventType,
      player_id: playerId ? String(playerId) : null,
      player_name: playerName || player?.roblox_username || null,
      team_name: team.name,
      team_id: team.id,
      salary,
      clauses,
      event_timestamp: eventTimestamp,
      raw_payload: body,
      roster_move_id: move?.id || null,
      status,
      error_message: errorMessage
    }).select().single();
    if (txError) throw txError;

    if (status === 'failed') return res.status(422).json({ success: false, transaction, error: errorMessage });
    res.json({ success: true, transaction, player, move });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message || String(err) });
  }
}

app.post('/api/webhooks/discord/transactions', handleDiscordTransactionsWebhook);
app.post('/api/webhooks/discord-transactions', handleDiscordTransactionsWebhook);

app.post('/api/coach/schedule/:id/action', async (req, res) => {
  try {
    const coach = await getCoach(req);
    if (!coach) return res.status(403).json({ error: 'Not a registered coach' });
    const { action } = req.body;
    if (!['approve','reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
    const { data: gr } = await supabase.from('game_requests').select('*').eq('id', req.params.id).single();
    if (!gr) return res.status(404).json({ error: 'Request not found' });
    if (gr.opponent_team_id !== coach.team.id) return res.status(403).json({ error: 'Not the opponent for this request' });
    if (gr.status !== 'pending_opponent') return res.status(400).json({ error: 'Already actioned' });
    const newStatus = action === 'approve' ? 'pending_admin' : 'rejected';
    await supabase.from('game_requests').update({ status: newStatus }).eq('id', gr.id);
    await supabase.from('roster_moves').update({ status: newStatus }).eq('move_type', 'schedule').contains('details', { game_id: gr.game_id });
    res.json({ success: true, status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/coach/schedule/pending', async (req, res) => {
  try {
    const coach = await getCoach(req);
    if (!coach) return res.status(403).json({ error: 'Not a registered coach' });
    const { data: requests } = await supabase.from('game_requests').select('*').eq('opponent_team_id', coach.team.id).eq('status', 'pending_opponent').order('created_at', { ascending: false });
    const { data: teams } = await supabase.from('teams').select('id, name');
    const teamMap = {}; (teams || []).forEach(t => teamMap[t.id] = t);
    res.json({ requests: (requests || []).map(r => ({ ...r, requesting_team: teamMap[r.requesting_team_id] || null })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/coach/moves', async (req, res) => {
  try {
    const coach = await getCoach(req);
    if (!coach) return res.status(403).json({ error: 'Not a registered coach' });
    const { data: moves } = await supabase.from('roster_moves').select('*').eq('team_id', coach.team.id).order('created_at', { ascending: false });
    res.json({ moves: moves || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    const { action, admin_note } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
    const { data: move } = await supabase.from('roster_moves').select('*').eq('id', req.params.id).single();
    if (!move) return res.status(404).json({ error: 'Move not found' });
    const actionable = ['pending', 'pending_admin', 'logged'];
    if (!actionable.includes(move.status)) return res.status(400).json({ error: 'Move cannot be actioned in its current state' });

    if (action === 'approve') {
      const details = move.details || {};
      if (move.move_type === 'trade') {
        const { data: player } = await supabase.from('players').select('*').ilike('roblox_username', move.player_username).maybeSingle();
        if (player) {
          await supabase.from('players').update({ team_id: details.destination_team_id || null }).eq('id', player.id);
        }
      }
      if (move.move_type === 'schedule') {
        // mark game_request as approved
        await supabase.from('game_requests').update({ status: 'approved' }).contains('details', { game_id: details.game_id });
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
//  MEDIA
// ─────────────────────────────────────────────

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// public — all videos (newest first)
app.get('/api/media/videos', async (req, res) => {
  try {
    const { data } = await supabase.from('media_videos').select('*').order('published_at', { ascending: false });
    res.json({ videos: (data || []).map(v => ({ ...v, youtube_id: extractYouTubeId(v.youtube_url) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// public — all articles (newest first)
app.get('/api/media/articles', async (req, res) => {
  try {
    const { data } = await supabase.from('media_articles').select('*').order('published_at', { ascending: false });
    res.json({ articles: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// public — single article by id
app.get('/api/media/articles/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('media_articles').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ article: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// admin/media — post a video
app.post('/api/media/videos', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const { title, youtube_url, description, team_tag, week_tag } = req.body;
    if (!title || !youtube_url) return res.status(400).json({ error: 'Title and YouTube URL required' });
    const youtube_id = extractYouTubeId(youtube_url);
    if (!youtube_id) return res.status(400).json({ error: 'Invalid YouTube URL' });
    const { data, error } = await supabase.from('media_videos').insert({
      title: title.trim(), youtube_url: youtube_url.trim(),
      description: description?.trim() || null,
      team_tag: team_tag?.trim() || null,
      week_tag: week_tag?.trim() || null,
      posted_by: me.roblox_username || null
    }).select().single();
    if (error) throw error;
    res.json({ success: true, video: { ...data, youtube_id } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// admin/media — delete a video (own posts or full admin)
app.delete('/api/media/videos/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const { data: video } = await supabase.from('media_videos').select('posted_by').eq('id', req.params.id).maybeSingle();
    if (!video) return res.status(404).json({ error: 'Not found' });
    const { tabs, isSuper } = effectiveTabs(me);
    const isFullAdmin = isSuper || tabs.includes('access') || tabs.includes('teams');
    const isOwner = video.posted_by && video.posted_by.toLowerCase() === (me.roblox_username || '').toLowerCase();
    if (!isOwner && !isFullAdmin) return res.status(403).json({ error: 'You can only delete your own posts' });
    await supabase.from('media_videos').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// admin/media — post an article
app.post('/api/media/articles', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const { title, body, author, thumbnail_url } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const { data, error } = await supabase.from('media_articles').insert({
      title: title.trim(),
      body: body?.trim() || null,
      author: author?.trim() || me.roblox_username || null,
      thumbnail_url: thumbnail_url?.trim() || null,
      posted_by: me.roblox_username || null
    }).select().single();
    if (error) throw error;
    res.json({ success: true, article: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// admin/media — delete an article (own posts or full admin)
app.delete('/api/media/articles/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const { data: article } = await supabase.from('media_articles').select('posted_by').eq('id', req.params.id).maybeSingle();
    if (!article) return res.status(404).json({ error: 'Not found' });
    const { tabs, isSuper } = effectiveTabs(me);
    const isFullAdmin = isSuper || tabs.includes('access') || tabs.includes('teams');
    const isOwner = article.posted_by && article.posted_by.toLowerCase() === (me.roblox_username || '').toLowerCase();
    if (!isOwner && !isFullAdmin) return res.status(403).json({ error: 'You can only delete your own posts' });
    await supabase.from('media_articles').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
//  CLEAN URL ROUTING
// ─────────────────────────────────────────────

app.use(express.static(CLIENT_DIR, { extensions: false }));

app.get('/:page.html', (req, res) => {
  res.redirect(301, '/' + req.params.page.replace(/index$/, ''));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || path.extname(req.path)) return next();
  res.sendFile(path.join(CLIENT_DIR, 'index.html'), (err) => { if (err) next(); });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OFL Network running on ${PORT}`));
