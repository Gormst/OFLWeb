require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: '10mb' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON_BODY',
      error: 'Request body must be valid JSON',
      details: null
    });
  }
  return next(err);
});

const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist');
const CLIENT_DIR = fs.existsSync(DIST_DIR) ? DIST_DIR : PUBLIC_DIR;
const R2_BUCKET = (process.env.R2_BUCKET || '').trim();
const R2_ACCOUNT_ID = (process.env.R2_ACCOUNT_ID || '').trim();
const R2_ENDPOINT_RAW = (process.env.R2_ENDPOINT || '').trim();
const escapedR2Bucket = R2_BUCKET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const R2_ENDPOINT = (R2_ENDPOINT_RAW || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : ''))
  .replace(escapedR2Bucket ? new RegExp(`/${escapedR2Bucket}/?$`) : /\/+$/, '')
  .replace(/\/+$/, '');
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const R2_UPLOAD_PREFIX = (process.env.R2_UPLOAD_PREFIX || '').trim().replace(/^\/+|\/+$/g, '');
const r2Client = R2_ENDPOINT && R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  ? new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      },
      forcePathStyle: true
    })
  : null;

// Secret for signing our own auth tokens. Set OFL_TOKEN_SECRET in env for production;
// falls back to the Supabase key so it's always defined.
const TOKEN_SECRET = process.env.OFL_TOKEN_SECRET || process.env.SUPABASE_KEY || 'ofl-dev-secret';
const OAUTH_TOKEN_ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.ROBLOX_OAUTH_TOKEN_SECRET || TOKEN_SECRET)
  .digest();

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

function encryptOauthToken(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', OAUTH_TOKEN_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
}

// Permanent superuser — always has admin access
const SUPERUSERS = new Set(['famouskai12', 'adxamn', 'treasonusa']);

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
function statLabelFromKey(key) {
  return String(key || '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

const BOX_SCORE_COMPARISON_STATS = [
  { key: 'pass_yards', label: 'Pass Yards' },
  { key: 'rush_yards', label: 'Rush Yards' },
  { key: 'rec_yards', label: 'Receiving Yards' },
  { key: 'pass_td', label: 'Pass TD' },
  { key: 'rush_td', label: 'Rush TD' },
  { key: 'rec_td', label: 'Rec TD' },
  { key: 'pr_sacks', label: 'Sacks' },
  { key: 'cov_int', label: 'Interceptions' }
];

function asBoxData(data) {
  if (!data) return {};
  if (typeof data === 'string') {
    try { return JSON.parse(data) || {}; } catch { return {}; }
  }
  return data;
}

function addBoxSlotTotals(target, slot) {
  Object.values(slot?.players || {}).forEach(stats => {
    BOX_SCORE_COMPARISON_STATS.forEach(def => {
      target[def.key] = (target[def.key] || 0) + Number(stats?.[def.key] || 0);
    });
  });
}

function buildBoxScoreComparison(boxes, awayTeamId, homeTeamId) {
  const totalsByTeam = {};
  (boxes || []).forEach(row => {
    const data = asBoxData(row.data);
    [
      { teamId: row.team1_id, slot: data.team1 },
      { teamId: row.team2_id, slot: data.team2 }
    ].forEach(({ teamId, slot }) => {
      if (!teamId) return;
      if (!totalsByTeam[teamId]) totalsByTeam[teamId] = {};
      addBoxSlotTotals(totalsByTeam[teamId], slot);
    });
  });

  const teamTotals = Object.values(totalsByTeam);
  return {
    stats: BOX_SCORE_COMPARISON_STATS.map(def => {
      const awayValue = Number(totalsByTeam[awayTeamId]?.[def.key] || 0);
      const homeValue = Number(totalsByTeam[homeTeamId]?.[def.key] || 0);
      const awayRank = teamTotals.filter(row => Number(row[def.key] || 0) > awayValue).length + 1;
      const homeRank = teamTotals.filter(row => Number(row[def.key] || 0) > homeValue).length + 1;
      return {
        key: def.key,
        label: def.label,
        away: { value: awayValue, rank: awayRank },
        home: { value: homeValue, rank: homeRank }
      };
    })
  };
}

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

function normalizeImportedPosition(value) {
  return String(value || '').trim().toUpperCase();
}

function defaultPositionForStatSection(sectionOrCategory) {
  const key = String(sectionOrCategory || '').trim().toUpperCase();
  if (key === 'PASSING') return 'QB';
  if (key === 'BLOCKING') return 'C';
  return '';
}

const OFFENSIVE_POSITIONS = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'C', 'G', 'OG', 'T', 'OT', 'LT', 'RT', 'LG', 'RG', 'K', 'P', 'ATH', ''];
const DEFENSIVE_POSITIONS = ['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'OLB', 'MLB', 'ILB', 'CB', 'DB', 'DCB', 'S', 'FS', 'SS', 'SAF', 'ATH', ''];
const DB_OFFENSIVE_POSITION_MAP = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  OL: 'OL',
  C: 'OL',
  G: 'OL',
  OG: 'OL',
  T: 'OL',
  OT: 'OL',
  LT: 'OL',
  RT: 'OL',
  LG: 'OL',
  RG: 'OL',
  K: 'K',
  P: 'P',
  ATH: 'ATH'
};
const DB_DEFENSIVE_POSITION_MAP = {
  DL: 'DL',
  DE: 'DL',
  DT: 'DL',
  NT: 'DL',
  EDGE: 'DL',
  LB: 'LB',
  OLB: 'LB',
  MLB: 'LB',
  ILB: 'LB',
  CB: 'CB',
  DB: 'CB',
  DCB: 'CB',
  S: 'S',
  FS: 'S',
  SS: 'S',
  SAF: 'S',
  ATH: 'ATH'
};

function isOffensivePosition(value) {
  const position = normalizeImportedPosition(value);
  return OFFENSIVE_POSITIONS.includes(position);
}

function isDefensivePosition(value) {
  const position = normalizeImportedPosition(value);
  return DEFENSIVE_POSITIONS.includes(position);
}

function dbOffensivePosition(value) {
  const position = normalizeImportedPosition(value);
  return DB_OFFENSIVE_POSITION_MAP[position] || '';
}

function dbDefensivePosition(value) {
  const position = normalizeImportedPosition(value);
  return DB_DEFENSIVE_POSITION_MAP[position] || '';
}

function hasAnyStats(stats, keys) {
  return keys.some(key => Number(stats?.[key] || 0) !== 0);
}

function hasDefensiveStats(stats) {
  return hasAnyStats(stats, CATEGORY_STAT_KEYS.passrush) || hasAnyStats(stats, CATEGORY_STAT_KEYS.coverage);
}

function hasOffensiveStats(stats) {
  return hasAnyStats(stats, [
    ...CATEGORY_STAT_KEYS.passing,
    ...CATEGORY_STAT_KEYS.rushing,
    ...CATEGORY_STAT_KEYS.receiving,
    ...CATEGORY_STAT_KEYS.blocking
  ]);
}

function statRowPositions(row = {}) {
  const stats = row.stats || row || {};
  const offensivePosition = normalizeImportedPosition(row.offensive_position || row.offense_position || stats.offensive_position || stats.offense_position);
  const defensivePosition = normalizeImportedPosition(row.defensive_position || row.defense_position || stats.defensive_position || stats.defense_position);
  const genericPosition = normalizeImportedPosition(row.position || row.pos || stats.position || stats.pos);
  const rowHasDefense = hasDefensiveStats(stats);
  const rowHasOffense = hasOffensiveStats(stats);
  return {
    offensive_position: offensivePosition || (rowHasOffense && isOffensivePosition(genericPosition) ? genericPosition : ''),
    defensive_position: defensivePosition || (rowHasDefense && isDefensivePosition(genericPosition) ? genericPosition : ''),
    position: genericPosition || offensivePosition || defensivePosition
  };
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
  let posIdx = null;
  headerRow.forEach((h, i) => {
    if (i === 0) return;
    const label = (h || '').trim().toUpperCase();
    if (label === 'POS' || label === 'POSITION') {
      posIdx = i;
      return;
    }
    const key = def.keys[label];
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
    const position = posIdx == null
      ? defaultPositionForStatSection(def.section)
      : normalizeImportedPosition(row[posIdx]) || defaultPositionForStatSection(def.section);
    out.push({ username, position, stats });
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
  function addPosition(username, value, section) {
    const position = normalizeImportedPosition(value);
    if (!username || !position) return;
    if (!players[username]) players[username] = {};
    if (section === 'DEFENSE') {
      if (!players[username].defensive_position) players[username].defensive_position = position;
    } else {
      if (!players[username].offensive_position) players[username].offensive_position = position;
    }
    if (!players[username].position) players[username].position = position;
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
      let posCol = null;
      for (let c = c0; c <= c1; c++) {
        const h = (headerRow[c] || '').trim().toUpperCase();
        if (h === 'POS' || h === 'POSITION') posCol = c;
        if (colMap[h]) idxToKey[c] = colMap[h];
      }
      const usernameCol = c0; // first column of the block is always the username

      r += 2; // skip section header + column header rows
      // consume player rows until blank row or a new known section
      while (r < rows.length) {
        const pr = rows[r] || [];
        if (rowEmpty(pr, c0, c1)) break;
        const nextLabel = (pr[c0] || '').trim().toUpperCase();
        if (KNOWN_SECTIONS.includes(nextLabel) || nextLabel === 'QB THROWAWAYS') break;
        const username = (pr[usernameCol] || '').trim();
        if (username) {
          const importedPosition = posCol == null
            ? defaultPositionForStatSection(section)
            : normalizeImportedPosition(pr[posCol]) || defaultPositionForStatSection(section);
          if (importedPosition) addPosition(username, importedPosition, section);
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
    position: normalizeImportedPosition(stats?.position || stats?.pos),
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

async function getRobloxUserById(userId) {
  const r = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (!r.ok) return null;
  return r.json().catch(() => null);
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
  const cookieToken = String(req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith('ofl_token='))
    ?.split('=')
    .slice(1)
    .join('=');
  const token = auth && auth.startsWith('Bearer ')
    ? auth.slice(7)
    : (cookieToken ? decodeURIComponent(cookieToken) : '');
  if (!token) return null;
  const robloxId = verifyToken(token);
  if (!robloxId) return null;
  const { data: profile } = await supabase
    .from('user_profiles').select('*')
    .eq('roblox_user_id', String(robloxId)).single();
  return profile || null;
}

// Compute a profile's effective admin tabs.
// Superusers can be permanent by username or stored in admin_tabs. Saved non-empty
// admin_tabs can narrow the admin panel tabs they see. Empty tabs falls back to
// full access for legacy superuser rows.
function effectiveTabs(profile) {
  const savedTabs = Array.isArray(profile.admin_tabs) ? profile.admin_tabs.slice() : [];
  const isStoredSuper = savedTabs.includes('superuser');
  const isSuper = SUPERUSERS.has((profile.roblox_username || '').trim().toLowerCase()) || isStoredSuper;
  let tabs = savedTabs.filter(t => ALL_ADMIN_TABS.includes(t));
  if (isSuper && tabs.length === 0) tabs = ALL_ADMIN_TABS.slice();
  return { tabs, isSuper, isAdmin: isSuper || tabs.length > 0 };
}

// Require the requester to have a given admin tab (or any one of several, if an array is passed)
async function requireAdmin(req, res, tab) {
  const profile = await getRequester(req);
  if (!profile) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  const { tabs, isAdmin } = effectiveTabs(profile);
  const tabOk = !tab || (Array.isArray(tab) ? tab.some(t => tabs.includes(t)) : tabs.includes(tab));
  if (!isAdmin || !tabOk) {
    res.status(403).json({ error: 'No admin access' });
    return null;
  }
  return profile;
}

async function requireSuperuser(req, res) {
  const profile = await getRequester(req);
  if (!profile) return apiError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');
  const { isSuper } = effectiveTabs(profile);
  if (!isSuper) return apiError(res, 403, 'SUPERUSER_REQUIRED', 'Only superusers can perform this action');
  return profile;
}

// ─────────────────────────────────────────────
//  ACCOUNT CONNECTION
// ─────────────────────────────────────────────

const ROBLOX_TOKEN_URL = process.env.ROBLOX_TOKEN_URL || 'https://apis.roblox.com/oauth/v1/token';
const ROBLOX_USERINFO_URL = process.env.ROBLOX_USERINFO_URL || 'https://apis.roblox.com/oauth/v1/userinfo';

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string' || token.split('.').length < 2) return null;
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function robloxIdFromClaims(claims) {
  const values = [
    claims && claims.sub,
    claims && claims.user_id,
    claims && claims.userId,
    claims && claims.id
  ].filter(Boolean).map(String);
  for (const value of values) {
    if (/^\d+$/.test(value)) return value;
    const match = value.match(/(\d+)$/);
    if (match) return match[1];
  }
  return null;
}

function robloxUsernameFromClaims(claims) {
  return String(
    (claims && (claims.preferred_username || claims.nickname || claims.name || claims.username || claims.display_name))
    || ''
  ).trim();
}

async function exchangeRobloxAuthorizationCode({ code, codeVerifier, redirectUri }) {
  const clientId = process.env.ROBLOX_CLIENT_ID || process.env.oAuth_client_id || process.env.OAUTH_CLIENT_ID || process.env.VITE_ROBLOX_CLIENT_ID || process.env.VITE_oAuth_client_id;
  const clientSecret = process.env.ROBLOX_CLIENT_SECRET || process.env.oAuth_client_secret || process.env.OAUTH_CLIENT_SECRET || '';
  if (!clientId) {
    const error = new Error('Set ROBLOX_CLIENT_ID or oAuth_client_id before exchanging Roblox OAuth codes.');
    error.statusCode = 500;
    error.code = 'ROBLOX_CLIENT_ID_MISSING';
    throw error;
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const response = await fetch(ROBLOX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    const error = new Error((data && (data.error_description || data.error)) || text || 'Roblox token exchange failed');
    error.statusCode = response.status;
    error.code = data && data.error ? String(data.error).toUpperCase() : 'ROBLOX_TOKEN_EXCHANGE_FAILED';
    throw error;
  }
  if (!data) {
    const error = new Error('Roblox token endpoint did not return JSON.');
    error.statusCode = 502;
    error.code = 'ROBLOX_TOKEN_INVALID_JSON';
    throw error;
  }
  return data;
}

async function getRobloxOAuthClaims(tokenData) {
  const idClaims = decodeJwtPayload(tokenData && tokenData.id_token);
  if (idClaims) return idClaims;
  if (!tokenData || !tokenData.access_token) return null;

  const response = await fetch(ROBLOX_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function upsertRobloxOAuthProfile(claims) {
  const robloxUserId = robloxIdFromClaims(claims);
  if (!robloxUserId) {
    const error = new Error('Roblox OAuth response did not include a usable user id.');
    error.statusCode = 502;
    error.code = 'ROBLOX_USER_ID_MISSING';
    throw error;
  }

  let robloxUsername = robloxUsernameFromClaims(claims);
  let avatar = String((claims && (claims.picture || claims.avatar_url || claims.avatarUrl)) || '').trim() || null;
  if (!robloxUsername) {
    const user = await getRobloxUserById(robloxUserId);
    robloxUsername = user?.name || `Roblox ${robloxUserId}`;
  }
  if (!avatar) avatar = await getRobloxAvatar(robloxUserId);

  const { data: existing, error: profileErr } = await supabase
    .from('user_profiles').select('*')
    .eq('roblox_user_id', String(robloxUserId)).maybeSingle();
  if (profileErr) {
    console.error('oauth profile lookup error:', profileErr.message);
    const error = new Error('Database error looking up profile');
    error.statusCode = 500;
    error.code = 'PROFILE_LOOKUP_FAILED';
    throw error;
  }

  if (existing) {
    const { data, error: upErr } = await supabase.from('user_profiles')
      .update({ roblox_username: robloxUsername, avatar_url: avatar, is_verified: true })
      .eq('roblox_user_id', String(robloxUserId)).select().single();
    if (upErr) {
      console.error('oauth profile update error:', upErr.message);
      const error = new Error('Failed to update profile');
      error.statusCode = 500;
      error.code = 'PROFILE_UPDATE_FAILED';
      throw error;
    }
    return { profile: data, robloxUserId };
  }

  const { data, error: insErr } = await supabase.from('user_profiles')
    .insert({
      roblox_username: robloxUsername,
      roblox_user_id: String(robloxUserId),
      supabase_user_id: crypto.randomUUID(),
      avatar_url: avatar,
      is_verified: true
    }).select().single();
  if (insErr) {
    console.error('oauth profile insert error:', insErr.message);
    const error = new Error('Failed to create profile: ' + insErr.message);
    error.statusCode = 500;
    error.code = 'PROFILE_CREATE_FAILED';
    throw error;
  }
  return { profile: data, robloxUserId };
}

async function storeRobloxOAuthTokens(profile, robloxUserId, tokenData) {
  if (!profile || !profile.id || !tokenData) return;
  const expiresIn = Number(tokenData.expires_in || 0);
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const scope = Array.isArray(tokenData.scope) ? tokenData.scope.join(' ') : (tokenData.scope ? String(tokenData.scope) : null);
  const row = {
    profile_id: profile.id,
    roblox_user_id: String(robloxUserId),
    access_token_ciphertext: encryptOauthToken(tokenData.access_token),
    refresh_token_ciphertext: encryptOauthToken(tokenData.refresh_token),
    token_type: tokenData.token_type ? String(tokenData.token_type) : null,
    scope,
    expires_at: expiresAt,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('roblox_oauth_tokens')
    .upsert(row, { onConflict: 'profile_id' });
  if (error) {
    console.error('roblox oauth token store error:', error.message);
    const err = new Error('Could not securely store Roblox OAuth tokens. Run supabase/2026-06-22_roblox_oauth_tokens.sql.');
    err.statusCode = 500;
    err.code = 'ROBLOX_TOKEN_STORE_FAILED';
    throw err;
  }
}

async function completeRobloxOAuthSession(tokenData) {
  const claims = await getRobloxOAuthClaims(tokenData);
  if (!claims) {
    const error = new Error('Roblox did not return profile claims');
    error.statusCode = 502;
    error.code = 'ROBLOX_PROFILE_MISSING';
    throw error;
  }
  const { profile, robloxUserId } = await upsertRobloxOAuthProfile(claims);
  await storeRobloxOAuthTokens(profile, robloxUserId, tokenData);
  const token = signToken(robloxUserId);
  const { tabs, isAdmin, isSuper } = effectiveTabs(profile);
  return {
    token,
    profile: { ...profile, admin_tabs: tabs, is_admin: isAdmin, is_superuser: isSuper }
  };
}

app.post('/api/auth/roblox/exchange', async (req, res) => {
  try {
    const code = String(req.body.code || '').trim();
    const state = String(req.body.state || '').trim();
    const codeVerifier = String(req.body.code_verifier || '').trim();
    const redirectUri = String(req.body.redirect_uri || '').trim();
    if (!code) return apiError(res, 400, 'CODE_REQUIRED', 'Authorization code required');
    if (!state) return apiError(res, 400, 'STATE_REQUIRED', 'OAuth state required');
    if (!codeVerifier) return apiError(res, 400, 'CODE_VERIFIER_REQUIRED', 'PKCE code verifier required');
    if (!redirectUri) return apiError(res, 400, 'REDIRECT_URI_REQUIRED', 'Redirect URI required');

    const tokenData = await exchangeRobloxAuthorizationCode({ code, codeVerifier, redirectUri });
    const { token, profile } = await completeRobloxOAuthSession(tokenData);
    res.cookie('ofl_token', token, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: false
    });
    res.json({
      success: true,
      token,
      profile
    });
  } catch (err) {
    console.error('roblox oauth exchange error:', err);
    return apiError(
      res,
      err.statusCode || 500,
      err.code || 'ROBLOX_OAUTH_EXCHANGE_FAILED',
      err.message || 'Roblox OAuth exchange failed'
    );
  }
});

app.post('/api/auth/roblox/session', async (req, res) => {
  try {
    const tokenData = req.body && req.body.token_data;
    if (!tokenData || !tokenData.access_token) {
      return apiError(res, 400, 'ROBLOX_TOKEN_DATA_REQUIRED', 'Roblox token response required');
    }
    const { token, profile } = await completeRobloxOAuthSession(tokenData);
    res.cookie('ofl_token', token, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: false
    });
    res.json({ success: true, token, profile });
  } catch (err) {
    console.error('roblox oauth session error:', err);
    return apiError(
      res,
      err.statusCode || 500,
      err.code || 'ROBLOX_OAUTH_SESSION_FAILED',
      err.message || 'Roblox OAuth session failed'
    );
  }
});

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
    res.cookie('ofl_token', token, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: false
    });
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

app.get('/api/auth/roblox/config', (req, res) => {
  const clientId = process.env.ROBLOX_CLIENT_ID
    || process.env.oAuth_client_id
    || process.env.OAUTH_CLIENT_ID
    || process.env.VITE_ROBLOX_CLIENT_ID
    || process.env.VITE_oAuth_client_id
    || '';
  res.json({
    configured: Boolean(clientId),
    client_id: clientId,
    scopes: process.env.ROBLOX_OAUTH_SCOPES || process.env.VITE_ROBLOX_OAUTH_SCOPES || 'openid profile'
  });
});

function apiError(res, status, code, message, details) {
  return res.status(status).json({
    success: false,
    code,
    error: message,
    details: details || null
  });
}

const REDZONE_BASE_BLOCKED_TERMS = [
  'bmlnZ2Vy',
  'bmlnZ2E=',
  'ZmFnZ290',
  'Y2hpbms=',
  'c3BpYw==',
  'a2lrZQ==',
  'a3lrZQ==',
  'd2V0YmFjaw==',
  'dHJhbm55'
].map(value => Buffer.from(value, 'base64').toString('utf8'));

function redzoneNormalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[!1|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[3]/g, 'e')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]+/g, '');
}

function redzonePublicMessage(row) {
  return {
    id: row.id,
    roblox_username: String(row.roblox_username || ''),
    avatar_url: row.avatar_url || null,
    message: String(row.message || ''),
    created_at: row.created_at
  };
}

function cleanRedzoneMessage(value) {
  const message = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!message) return { error: 'Message is required' };
  if (message.length > 240) return { error: 'Message must be 240 characters or less' };
  if (/[<>]/.test(message)) return { error: 'Message cannot contain HTML markup' };
  return { message };
}

async function redzoneBlacklistTerms() {
  const { data, error } = await supabase
    .from('redzone_chat_blacklist')
    .select('normalized_term');
  if (error) throw error;
  return (data || []).map(row => String(row.normalized_term || '')).filter(Boolean);
}

function redzoneBlockedByTerm(message, dynamicTerms) {
  const normalized = redzoneNormalize(message);
  if (!normalized) return false;
  return REDZONE_BASE_BLOCKED_TERMS.concat(dynamicTerms || [])
    .map(redzoneNormalize)
    .filter(term => term.length >= 2)
    .some(term => normalized.includes(term));
}

async function redzoneActiveMute(profile) {
  const normalizedUsername = redzoneNormalize(profile && profile.roblox_username);
  if (!normalizedUsername) return null;
  const { data, error } = await supabase
    .from('redzone_chat_mutes')
    .select('expires_at')
    .eq('normalized_username', normalizedUsername)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}

function redzoneSchemaError(error) {
  const message = String((error && (error.message || error.details || error.hint)) || '');
  return /redzone_chat_|schema cache|relation .* does not exist/i.test(message);
}

app.get('/api/redzone-chat', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 80, 120));
    const { data, error } = await supabase
      .from('redzone_chat_messages')
      .select('id,roblox_username,avatar_url,message,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ success: true, messages: (data || []).reverse().map(redzonePublicMessage) });
  } catch (error) {
    if (redzoneSchemaError(error)) {
      return apiError(res, 500, 'REDZONE_CHAT_SCHEMA_MISSING', 'Run supabase/2026-06-22_redzone_chat.sql before using chat');
    }
    return apiError(res, 500, 'REDZONE_CHAT_LOAD_FAILED', error.message || 'Could not load chat');
  }
});

app.post('/api/redzone-chat', async (req, res) => {
  try {
    const profile = await getRequester(req);
    if (!profile) return apiError(res, 401, 'AUTH_REQUIRED', 'Connect your Roblox account to chat');

    const cleaned = cleanRedzoneMessage(req.body && req.body.message);
    if (cleaned.error) return apiError(res, 400, 'REDZONE_CHAT_INVALID_MESSAGE', cleaned.error);

    const message = cleaned.message;
    const { isAdmin } = effectiveTabs(profile);
    const muteCommand = message.match(/^\/mute\s+([^\s]+)\s+(\d{1,5})$/i);
    const blacklistCommand = message.match(/^\/blacklist\s+(.+)$/i);

    if (muteCommand || blacklistCommand) {
      if (!isAdmin) return apiError(res, 403, 'REDZONE_CHAT_ADMIN_REQUIRED', 'Only admins can run chat commands');

      if (muteCommand) {
        const targetUsername = muteCommand[1].trim();
        const minutes = Math.max(1, Math.min(parseInt(muteCommand[2], 10) || 0, 1440));
        const normalizedUsername = redzoneNormalize(targetUsername);
        if (!normalizedUsername) return apiError(res, 400, 'REDZONE_CHAT_INVALID_MUTE', 'Player is required');
        const expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        const { error } = await supabase.from('redzone_chat_mutes').insert({
          target_username: targetUsername,
          normalized_username: normalizedUsername,
          muted_by: profile.id,
          expires_at: expiresAt
        });
        if (error) throw error;
        return res.json({ success: true, command: 'mute', target_username: targetUsername, expires_at: expiresAt });
      }

      const term = blacklistCommand[1].trim();
      const normalizedTerm = redzoneNormalize(term);
      if (!normalizedTerm || normalizedTerm.length < 2) {
        return apiError(res, 400, 'REDZONE_CHAT_INVALID_BLACKLIST', 'Word is required');
      }
      const { error } = await supabase.from('redzone_chat_blacklist').upsert({
        term,
        normalized_term: normalizedTerm,
        created_by: profile.id
      }, { onConflict: 'normalized_term' });
      if (error) throw error;
      return res.json({ success: true, command: 'blacklist', term });
    }

    const activeMute = await redzoneActiveMute(profile);
    if (activeMute) {
      return apiError(res, 403, 'REDZONE_CHAT_MUTED', 'You are muted until ' + new Date(activeMute.expires_at).toLocaleTimeString());
    }

    const dynamicTerms = await redzoneBlacklistTerms();
    if (redzoneBlockedByTerm(message, dynamicTerms)) {
      return apiError(res, 400, 'REDZONE_CHAT_BLOCKED', 'That message cannot be posted');
    }

    const { data, error } = await supabase
      .from('redzone_chat_messages')
      .insert({
        profile_id: profile.id,
        roblox_user_id: profile.roblox_user_id ? String(profile.roblox_user_id) : null,
        roblox_username: profile.roblox_username || 'OFL User',
        avatar_url: profile.avatar_url || null,
        message
      })
      .select('id,roblox_username,avatar_url,message,created_at')
      .single();
    if (error) throw error;
    res.json({ success: true, message: redzonePublicMessage(data) });
  } catch (error) {
    if (redzoneSchemaError(error)) {
      return apiError(res, 500, 'REDZONE_CHAT_SCHEMA_MISSING', 'Run supabase/2026-06-22_redzone_chat.sql before using chat');
    }
    return apiError(res, 500, 'REDZONE_CHAT_SEND_FAILED', error.message || 'Could not send message');
  }
});

function withTimeout(promise, ms, code, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(message || code);
        error.statusCode = 504;
        error.code = code;
        reject(error);
      }, ms);
    })
  ]);
}

app.patch('/api/me/settings', async (req, res) => {
  try {
    const profile = await getRequester(req);
    if (!profile) return apiError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

    const updates = {};
    const playerUpdates = {};
    let savedPlayer = null;

    if (req.body.theme_preference !== undefined || req.body.theme !== undefined) {
      const theme = String(req.body.theme_preference || req.body.theme || '').trim().toLowerCase();
      if (!['light', 'dark'].includes(theme)) {
        return apiError(res, 400, 'PROFILE_INVALID_THEME', 'theme_preference must be light or dark');
      }
      updates.theme_preference = theme;
    }

    if (req.body.position !== undefined || req.body.offensive_position !== undefined) {
      const offensivePosition = String(req.body.offensive_position ?? req.body.position ?? '').trim().toUpperCase();
      if (!isOffensivePosition(offensivePosition)) {
        return apiError(res, 400, 'PROFILE_INVALID_OFFENSIVE_POSITION', 'offensive_position must be a valid offensive position or blank');
      }
      const dbPosition = dbOffensivePosition(offensivePosition);
      playerUpdates.offensive_position = dbPosition || null;
      playerUpdates.position = dbPosition || null;
    }

    if (req.body.defensive_position !== undefined) {
      const defensivePosition = String(req.body.defensive_position || '').trim().toUpperCase();
      if (!isDefensivePosition(defensivePosition)) {
        return apiError(res, 400, 'PROFILE_INVALID_DEFENSIVE_POSITION', 'defensive_position must be a valid defensive position or blank');
      }
      playerUpdates.defensive_position = dbDefensivePosition(defensivePosition) || null;
    }

    if (req.body.jersey_number !== undefined) {
      const rawNumber = String(req.body.jersey_number ?? '').trim();
      const jerseyNumber = rawNumber === '' ? null : Number(rawNumber);
      if (jerseyNumber !== null && (!Number.isInteger(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 99)) {
        return apiError(res, 400, 'PROFILE_INVALID_JERSEY_NUMBER', 'jersey_number must be a whole number from 0 to 99, or blank');
      }
      playerUpdates.jersey_number = jerseyNumber;
    }

    if (Object.keys(playerUpdates).length) {
      const username = (profile.roblox_username || '').trim();
      let query = supabase.from('players').update(playerUpdates);
      if (profile.roblox_user_id) query = query.eq('roblox_user_id', String(profile.roblox_user_id));
      else if (username) query = query.ilike('roblox_username', username);
      else return apiError(res, 400, 'PROFILE_POSITION_NO_PLAYER_ID', 'No Roblox account is linked for this profile');

      const { data: playerData, error: playerError } = await query.select().maybeSingle();
      if (isMissingSupabaseColumn(playerError, 'offensive_position') || isMissingSupabaseColumn(playerError, 'defensive_position') || isMissingSupabaseColumn(playerError, 'jersey_number')) {
        return apiError(res, 500, 'DB_MISSING_PLAYER_PROFILE_FIELDS', 'Database setup needed: run supabase/2026-06-20_player_profile_fields.sql in the Supabase SQL editor.');
      }
      if (playerError) throw playerError;
      savedPlayer = playerData || null;
      if (savedPlayer && username) {
        const { data: registryPlayer, error: registryError } = await supabase
          .from('league_players')
          .select('cap_value, position_tag')
          .ilike('roblox_username', username)
          .maybeSingle();
        if (registryError && !isMissingSupabaseTable(registryError, 'league_players')) throw registryError;
        if (registryPlayer) {
          savedPlayer = {
            ...savedPlayer,
            cap_value: Number(registryPlayer.cap_value || savedPlayer.cap_value || 0),
            registry_position_tag: registryPlayer.position_tag || null
          };
        }
      }
    }

    let data = profile;
    if (Object.keys(updates).length) {
      const { data: savedProfile, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', profile.id)
        .select()
        .single();
      if (isMissingSupabaseColumn(error, 'theme_preference')) {
        return apiError(res, 500, 'DB_MISSING_THEME_PREFERENCE', 'Database setup needed: run supabase/2026-06-20_user_profile_settings.sql in the Supabase SQL editor.');
      }
      if (error) throw error;
      data = savedProfile;
    }

    const { tabs, isAdmin, isSuper } = effectiveTabs(data);
    res.json({ success: true, profile: { ...data, admin_tabs: tabs, is_admin: isAdmin, is_superuser: isSuper }, player: savedPlayer });
  } catch (err) {
    apiError(res, 500, 'PROFILE_SETTINGS_SAVE_FAILED', err.message);
  }
});

function publicTeamSummary(team) {
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    logo_url: team.logo_url,
    primary_color: team.primary_color,
    secondary_color: team.secondary_color,
    slug: slugify(team.name)
  };
}

function statSummary(row) {
  const out = {};
  STAT_KEYS.forEach(key => { out[key] = Number(row?.[key] || 0); });
  return out;
}

function mergeStatRows(rows) {
  const merged = {};
  STAT_KEYS.forEach(key => { merged[key] = 0; });
  (rows || []).forEach(row => {
    STAT_KEYS.forEach(key => { merged[key] += Number(row?.[key] || 0); });
  });
  return merged;
}

function totalStatValue(stats) {
  return STAT_KEYS.reduce((sum, key) => sum + Number(stats?.[key] || 0), 0);
}

function usernameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function displayUsername(value) {
  return String(value || '').trim();
}

function searchTerms(value) {
  return String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function playerSearchText(player) {
  return [
    player?.roblox_username,
    player?.position,
    player?.position_tag,
    player?.team?.name,
    player?.team?.abbreviation,
    ...(player?.formerly_known_as || []),
    ...(player?.alias_usernames || [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function matchesPlayerSearch(player, query) {
  const terms = searchTerms(query);
  if (!terms.length) return true;
  const haystack = playerSearchText(player);
  const compactHaystack = haystack.replace(/\s+/g, '');
  return terms.every(term => haystack.includes(term) || compactHaystack.includes(term));
}

async function fetchPlayerAliases() {
  const { data, error } = await supabase
    .from('player_aliases')
    .select('*')
    .order('created_at', { ascending: true });
  if (error && isMissingSupabaseTable(error, 'player_aliases')) return [];
  if (error) throw error;
  return data || [];
}

function buildAliasMaps(aliases) {
  const aliasToCanonical = {};
  const canonicalToAliases = {};
  (aliases || []).forEach(row => {
    const canonical = usernameKey(row.canonical_username);
    const alias = usernameKey(row.alias_username);
    if (!canonical || !alias) return;
    aliasToCanonical[alias] = canonical;
    if (!canonicalToAliases[canonical]) canonicalToAliases[canonical] = [];
    canonicalToAliases[canonical].push(displayUsername(row.alias_username));
  });
  return { aliasToCanonical, canonicalToAliases };
}

function canonicalUsernameKey(username, aliasToCanonical) {
  const key = usernameKey(username);
  return aliasToCanonical[key] || key;
}

function combinePlayerRowsByAlias(rows, aliases) {
  const { aliasToCanonical, canonicalToAliases } = buildAliasMaps(aliases);
  const groups = {};
  (rows || []).forEach(row => {
    const key = canonicalUsernameKey(row.roblox_username, aliasToCanonical);
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });

  return Object.entries(groups).map(([key, group]) => {
    const canonicalRow = group.find(row => usernameKey(row.roblox_username) === key) || group[0] || {};
    const preferredTeamRow = group.find(row => row.team_id) || canonicalRow;
    const combined = { ...canonicalRow };
    combined.id = canonicalRow.id || preferredTeamRow.id || null;
    combined.roblox_username = displayUsername(canonicalRow.roblox_username) || displayUsername(preferredTeamRow.roblox_username);
    combined.roblox_user_id = canonicalRow.roblox_user_id || preferredTeamRow.roblox_user_id || null;
    combined.avatar_url = canonicalRow.avatar_url || preferredTeamRow.avatar_url || group.find(row => row.avatar_url)?.avatar_url || null;
    combined.team_id = preferredTeamRow.team_id || null;
    combined.position = canonicalRow.position || preferredTeamRow.position || null;
    combined.offensive_position = canonicalRow.offensive_position || preferredTeamRow.offensive_position || null;
    combined.defensive_position = canonicalRow.defensive_position || preferredTeamRow.defensive_position || null;
    combined.jersey_number = canonicalRow.jersey_number ?? preferredTeamRow.jersey_number ?? null;
    combined.cap_value = Number(canonicalRow.cap_value || preferredTeamRow.cap_value || 0);
    combined.formerly_known_as = (canonicalToAliases[key] || []).filter(alias => usernameKey(alias) !== usernameKey(combined.roblox_username));
    combined.alias_usernames = group.map(row => displayUsername(row.roblox_username)).filter(Boolean);
    STAT_KEYS.forEach(statKey => {
      combined[statKey] = group.reduce((sum, row) => sum + Number(row?.[statKey] || 0), 0);
    });
    return combined;
  });
}

async function fetchOauthConnections(aliases = []) {
  const { data: tokenRows, error } = await supabase
    .from('roblox_oauth_tokens')
    .select('profile_id, roblox_user_id');
  if (error && isMissingSupabaseTable(error, 'roblox_oauth_tokens')) {
    return { ids: new Set(), usernames: new Map() };
  }
  if (error) throw error;

  const ids = new Set((tokenRows || []).map(row => String(row.roblox_user_id || '').trim()).filter(Boolean));
  const usernames = new Map();
  const profileIds = (tokenRows || []).map(row => row.profile_id).filter(Boolean);
  if (profileIds.length) {
    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, roblox_username, roblox_user_id')
      .in('id', profileIds);
    if (profileError) throw profileError;
    const { aliasToCanonical } = buildAliasMaps(aliases);
    (profiles || []).forEach(profile => {
      const username = canonicalUsernameKey(profile.roblox_username, aliasToCanonical);
      const robloxUserId = String(profile.roblox_user_id || '').trim();
      if (username && robloxUserId && ids.has(robloxUserId)) usernames.set(username, robloxUserId);
    });
  }

  return { ids, usernames };
}

function withOauthConnected(row, oauthConnections, aliases = []) {
  const connections = oauthConnections instanceof Set ? { ids: oauthConnections, usernames: new Map() } : (oauthConnections || {});
  const ids = connections.ids || new Set();
  const usernames = connections.usernames || new Map();
  const id = String(row?.roblox_user_id || '').trim();
  if (id && ids.has(id)) return { ...row, oauth_connected: true };

  const { aliasToCanonical } = buildAliasMaps(aliases);
  const username = canonicalUsernameKey(row?.roblox_username, aliasToCanonical);
  const connectedId = username ? usernames.get(username) : null;
  return {
    ...row,
    roblox_user_id: connectedId || row?.roblox_user_id || null,
    oauth_connected: Boolean(connectedId)
  };
}

function teamStaffRolesForUsername(username, teams, aliases = []) {
  const { aliasToCanonical } = buildAliasMaps(aliases);
  const key = canonicalUsernameKey(username, aliasToCanonical);
  if (!key) return [];
  const roles = [];
  (teams || []).forEach(team => {
    if (canonicalUsernameKey(team.head_coach, aliasToCanonical) === key) {
      roles.push({ role: 'HC', label: 'Head Coach', team: publicTeamSummary(team) });
    }
    if (canonicalUsernameKey(team.director_of_ops, aliasToCanonical) === key) {
      roles.push({ role: 'DFO', label: 'Director of Franchise Operations', team: publicTeamSummary(team) });
    }
    if (canonicalUsernameKey(team.franchise_owner, aliasToCanonical) === key) {
      roles.push({ role: 'Owner', label: 'Franchise Owner', team: publicTeamSummary(team) });
    }
  });
  return roles;
}

function withTeamStaffRoles(row, teams, aliases = []) {
  return {
    ...row,
    staff_roles: teamStaffRolesForUsername(row?.roblox_username, teams, aliases)
  };
}

function aliasNameGroup(username, aliases) {
  const { aliasToCanonical, canonicalToAliases } = buildAliasMaps(aliases);
  const canonical = canonicalUsernameKey(username, aliasToCanonical);
  return [canonical, ...(canonicalToAliases[canonical] || []).map(usernameKey)]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function moveTeamId(move) {
  const details = move.details || {};
  if (move.move_type === 'trade' && details.destination_team_id) return details.destination_team_id;
  return move.team_id || null;
}

function isSyncGeneratedMove(move) {
  const details = move?.details || {};
  return move?.requesting_role === 'bot'
    || move?.requesting_username === 'Discord Bot'
    || details.source === 'discord_roster_sync'
    || details.source === 'discord_webhook';
}

function condenseDuplicateSyncMoves(moves) {
  const seen = new Set();
  return (moves || []).filter(move => {
    if (!isSyncGeneratedMove(move)) return true;
    const key = [
      usernameKey(move.player_username),
      move.move_type || '',
      moveTeamId(move) || '',
      move.status || ''
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

app.get('/api/me/player-profile', async (req, res) => {
  try {
    const profile = await getRequester(req);
    if (!profile) return apiError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');

    const username = (profile.roblox_username || '').trim();
    const aliases = await fetchPlayerAliases();
    const nameKeys = aliasNameGroup(username, aliases);
    const nameSet = new Set(nameKeys);
    const [teamsResult, playerByIdResult, playersByNamesResult, registryByNamesResult, oauthConnections] = await Promise.all([
      supabase.from('teams').select('*').order('name'),
      profile.roblox_user_id ? supabase.from('players').select('*').eq('roblox_user_id', String(profile.roblox_user_id)).maybeSingle() : Promise.resolve({ data: null, error: null }),
      nameSet.size ? supabase.from('players').select('*') : Promise.resolve({ data: [], error: null }),
      nameSet.size ? supabase.from('league_players').select('roblox_username, cap_value, position_tag') : Promise.resolve({ data: [], error: null }),
      fetchOauthConnections(aliases)
    ]);

    if (teamsResult.error) throw teamsResult.error;
    if (playerByIdResult.error) throw playerByIdResult.error;
    if (playersByNamesResult.error) throw playersByNamesResult.error;
    if (registryByNamesResult.error && !isMissingSupabaseTable(registryByNamesResult.error, 'league_players')) throw registryByNamesResult.error;

    const teams = teamsResult.data || [];
    const teamMap = {};
    teams.forEach(team => { teamMap[team.id] = team; });
    const matchingPlayerRows = (playersByNamesResult.data || []).filter(row => nameSet.has(usernameKey(row.roblox_username)));
    const registryRows = registryByNamesResult.error ? [] : (registryByNamesResult.data || []).filter(row => nameSet.has(usernameKey(row.roblox_username)));
    const registryPlayer = registryRows[0] || null;
    const profilePlayerRows = [playerByIdResult.data, ...matchingPlayerRows].filter(Boolean);
    let player = combinePlayerRowsByAlias(profilePlayerRows, aliases)[0] || null;
    if (player && registryPlayer) {
      player = {
        ...player,
        cap_value: Number(registryPlayer.cap_value || player.cap_value || 0),
        registry_position_tag: registryPlayer.position_tag || null
      };
    }

    let historicalRows = [];
    if (nameSet.size) {
      const { data, error } = await supabase
        .from('season_stats')
        .select('*')
        .order('season', { ascending: false });
      if (error && !isMissingSupabaseTable(error, 'season_stats')) throw error;
      historicalRows = error ? [] : (data || []).filter(row => nameSet.has(usernameKey(row.roblox_username)));
    }

    const bySeason = {};
    historicalRows.forEach(row => {
      const season = row.season || 'Unknown';
      if (!bySeason[season]) bySeason[season] = [];
      bySeason[season].push(row);
    });
    const historical = Object.keys(bySeason)
      .sort((a, b) => Number(b) - Number(a))
      .map(season => {
        const stats = mergeStatRows(bySeason[season]);
        const first = bySeason[season][0] || {};
        return {
          season: Number.isNaN(Number(season)) ? season : Number(season),
          team_name: first.team_name || first.team || null,
          stats,
          total: totalStatValue(stats),
          rows: bySeason[season]
        };
      });

    let moves = [];
    if (nameSet.size) {
      const { data, error } = await supabase
        .from('roster_moves')
        .select('*')
        .in('move_type', ['sign', 'release', 'trade'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      moves = (data || []).filter(row => nameSet.has(usernameKey(row.player_username)));
    }
    moves = condenseDuplicateSyncMoves(moves);
    const timeline = moves.map(move => {
      const team = teamMap[moveTeamId(move)] || null;
      return {
        id: move.id,
        type: move.move_type,
        status: move.status,
        date: move.created_at,
        team: publicTeamSummary(team),
        requesting_username: move.requesting_username,
        requesting_role: move.requesting_role,
        details: move.details || {}
      };
    });

    let awards = [];
    if (username || profile.roblox_user_id) {
      let awardQuery = supabase.from('player_awards').select('*').order('awarded_at', { ascending: false });
      if (profile.roblox_user_id) awardQuery = awardQuery.eq('roblox_user_id', String(profile.roblox_user_id));
      else awardQuery = awardQuery;
      const { data, error } = await awardQuery;
      if (error && !isMissingSupabaseTable(error, 'player_awards')) throw error;
      awards = error ? [] : (data || [])
        .filter(award => profile.roblox_user_id || nameSet.has(usernameKey(award.player_username)))
        .map(award => ({
        ...award,
        team: publicTeamSummary(teamMap[award.team_id])
      }));
    }

    let teammates = [];
    if (player?.team_id) {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', player.team_id)
        .neq('id', player.id)
        .order('roblox_username')
        .limit(12);
      if (error) throw error;
      teammates = (data || []).map(row => ({
        ...row,
        team: publicTeamSummary(teamMap[row.team_id])
      }));
    }

    const currentStats = statSummary(player);
    const { tabs, isAdmin, isSuper } = effectiveTabs(profile);
    const profileStaffRoles = teamStaffRolesForUsername(username, teams, aliases);
    res.json({
      profile: { ...profile, admin_tabs: tabs, is_admin: isAdmin, is_superuser: isSuper, oauth_connected: Boolean(profile.roblox_user_id && oauthConnections.ids.has(String(profile.roblox_user_id))), staff_roles: profileStaffRoles },
      player: player ? {
        ...withTeamStaffRoles(withOauthConnected(player, oauthConnections, aliases), teams, aliases),
        team: publicTeamSummary(teamMap[player.team_id])
      } : null,
      current_stats: currentStats,
      current_total: totalStatValue(currentStats),
      historical,
      timeline,
      awards,
      teammates
    });
  } catch (err) {
    apiError(res, 500, 'PLAYER_PROFILE_LOAD_FAILED', err.message);
  }
});

// list all users who currently have admin access
app.get('/api/admin/users', async (req, res) => {
  const me = await requireAdmin(req, res, 'access');
  if (!me) return;
  try {
    const { isSuper: requesterIsSuper } = effectiveTabs(me);
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
    res.json({ admins, allTabs: ALL_ADMIN_TABS, requester_is_superuser: requesterIsSuper });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// search connected users by roblox username (to add to the panel)
app.get('/api/admin/search', async (req, res) => {
  const me = await requireSuperuser(req, res);
  if (!me) return;
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ users: [] });
    const { data } = await supabase
      .from('user_profiles')
      .select('id, roblox_username, avatar_url, admin_tabs')
      .ilike('roblox_username', `%${q}%`)
      .limit(10);
    const users = (data || []).map(u => {
      const { tabs, isSuper, isAdmin } = effectiveTabs(u);
      return { ...u, admin_tabs: tabs, is_superuser: isSuper, is_admin: isAdmin };
    });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// grant / update a user's admin tabs
app.post('/api/admin/grant', async (req, res) => {
  const me = await requireSuperuser(req, res);
  if (!me) return;
  try {
    const { profileId, tabs } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId required' });
    const incoming = Array.isArray(tabs) ? tabs : [];
    const wantsSuperuser = incoming.includes('superuser');
    const clean = incoming.filter(t => ALL_ADMIN_TABS.includes(t));
    const { data: existing, error: existingError } = await supabase
      .from('user_profiles')
      .select('id, roblox_username, admin_tabs')
      .eq('id', profileId)
      .single();
    if (existingError) throw existingError;
    const existingAccess = effectiveTabs(existing);
    if (existingAccess.isSuper) {
      return apiError(res, 403, 'SUPERUSER_PERMISSION_LOCKED', 'Superuser permissions cannot be edited from this panel');
    }
    const nextTabs = wantsSuperuser ? ['superuser', ...clean] : clean;
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ admin_tabs: nextTabs })
      .eq('id', profileId).select().single();
    if (error) throw error;
    res.json({ success: true, profile: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// revoke all admin access from a user
app.post('/api/admin/revoke', async (req, res) => {
  const me = await requireSuperuser(req, res);
  if (!me) return;
  try {
    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ error: 'profileId required' });
    const { data: existing, error: existingError } = await supabase
      .from('user_profiles')
      .select('id, roblox_username, admin_tabs')
      .eq('id', profileId)
      .single();
    if (existingError) throw existingError;
    if (effectiveTabs(existing).isSuper) {
      return apiError(res, 403, 'SUPERUSER_DEMOTION_BLOCKED', 'Superuser access cannot be removed from this panel');
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
    const DPP_MIN = 17, NON_DPP_MIN = 14, ROSTER_MAX = 40, DPP_ESTABLISHED_MAX = 3;

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
  const me = await requireSuperuser(req, res);
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
  const me = await requireSuperuser(req, res);
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
function safeAssetName(value) {
  return String(value || 'logo')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'logo';
}

function imageExtForMime(mime) {
  return {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  }[mime] || null;
}

function r2KeyFromPublicUrl(url) {
  const value = String(url || '').trim();
  if (!r2Client || !value) return null;
  const proxyMatch = value.match(/^\/api\/uploads\/(.+)$/);
  if (proxyMatch) return proxyMatch[1].split('/').map(part => decodeURIComponent(part)).join('/');
  if (!R2_PUBLIC_BASE_URL) return null;
  try {
    const publicUrl = new URL(value);
    const baseUrl = new URL(R2_PUBLIC_BASE_URL);
    if (publicUrl.origin !== baseUrl.origin) return null;
    const basePath = baseUrl.pathname.replace(/\/+$/, '');
    const objectPath = publicUrl.pathname;
    if (basePath && objectPath !== basePath && !objectPath.startsWith(`${basePath}/`)) return null;
    return decodeURIComponent(objectPath.slice(basePath.length).replace(/^\/+/, ''));
  } catch (_err) {
    if (!value.startsWith(`${R2_PUBLIC_BASE_URL}/`)) return null;
    return value.slice(R2_PUBLIC_BASE_URL.length).replace(/^\/+/, '');
  }
}

async function removeUploadedImage(url) {
  const value = String(url || '').trim();
  if (!value) return;

  const r2Key = r2KeyFromPublicUrl(value);
  if (r2Key) {
    try {
      await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }));
    } catch (err) {
      console.warn('Could not remove old uploaded R2 image:', err.message);
    }
  }

  const match = value.match(/^\/?((?:logos|media)\/uploads\/[a-z0-9._-]+\.(?:png|jpe?g|webp|svg))$/i);
  if (!match) return;

  const relative = match[1].replace(/\//g, path.sep);
  for (const root of [PUBLIC_DIR, DIST_DIR]) {
    const target = path.resolve(root, relative);
    const localRoot = path.resolve(root);
    if (!target.startsWith(localRoot + path.sep)) continue;
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch (err) {
      console.warn('Could not remove old uploaded image:', err.message);
    }
  }
}

function parseUploadedImage({ dataUrl, maxBytes = 5 * 1024 * 1024 }) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) {
    const error = new Error('Upload must be a PNG, JPG, WEBP, or SVG image data URL');
    error.code = 'IMAGE_UPLOAD_INVALID_DATA_URL';
    error.statusCode = 400;
    throw error;
  }

  const mime = match[1];
  const ext = imageExtForMime(mime);
  if (!ext) {
    const error = new Error('Image must be PNG, JPG, WEBP, or SVG');
    error.code = 'IMAGE_UPLOAD_UNSUPPORTED_TYPE';
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    const error = new Error('Image file is empty');
    error.code = 'IMAGE_UPLOAD_EMPTY_FILE';
    error.statusCode = 400;
    throw error;
  }
  if (buffer.length > maxBytes) {
    const error = new Error(`Image file must be ${Math.round(maxBytes / 1024 / 1024)}MB or smaller`);
    error.code = 'IMAGE_UPLOAD_TOO_LARGE';
    error.statusCode = 413;
    throw error;
  }

  return { buffer, mime, ext };
}

function r2ObjectKey(folder, name) {
  return [R2_UPLOAD_PREFIX, folder, name]
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}

function r2PublicUrl(key) {
  if (!R2_PUBLIC_BASE_URL) return `/api/uploads/${key.split('/').map(part => encodeURIComponent(part)).join('/')}`;
  return `${R2_PUBLIC_BASE_URL}/${key}`;
}

async function uploadImageToR2({ folder, name, buffer, mime }) {
  if (!r2Client) return null;
  const key = r2ObjectKey(folder, name);
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mime,
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  return { key, url: r2PublicUrl(key) };
}

function writeUploadedImageLocal({ folder, name, buffer, mime }) {
  const relative = path.join(folder, name);
  const publicTarget = path.join(PUBLIC_DIR, relative);
  fs.mkdirSync(path.dirname(publicTarget), { recursive: true });
  fs.writeFileSync(publicTarget, buffer);

  if (fs.existsSync(DIST_DIR)) {
    const distTarget = path.join(DIST_DIR, relative);
    fs.mkdirSync(path.dirname(distTarget), { recursive: true });
    fs.writeFileSync(distTarget, buffer);
  }

  return { url: `/${folder.replace(/\\/g, '/')}/${name}`, filename: name, mime, size: buffer.length };
}

async function writeUploadedImage({ folder, filename, dataUrl, fallbackName, maxBytes = 5 * 1024 * 1024 }) {
  const { buffer, mime, ext } = parseUploadedImage({ dataUrl, maxBytes });
  const safeFolder = String(folder || '').replace(/[^a-z0-9/_-]/gi, '').replace(/^\/+|\/+$/g, '');
  if (!safeFolder) {
    const error = new Error('Upload folder is required');
    error.code = 'IMAGE_UPLOAD_INVALID_FOLDER';
    error.statusCode = 500;
    throw error;
  }

  const base = safeAssetName(fallbackName || filename || 'image');
  const name = `${base}-${Date.now().toString(36)}.${ext}`;

  const uploaded = await uploadImageToR2({ folder: safeFolder, name, buffer, mime });
  if (uploaded?.url) return { url: uploaded.url, key: uploaded.key, filename: name, mime, size: buffer.length, storage: 'r2' };

  return { ...writeUploadedImageLocal({ folder: safeFolder, name, buffer, mime }), storage: 'local' };
}

app.get('/api/uploads/*', async (req, res) => {
  if (!r2Client) return res.status(404).send('Uploads storage is not configured');
  const key = String(req.params[0] || '').split('/').map(part => decodeURIComponent(part)).join('/');
  if (!key || key.includes('..')) return res.status(400).send('Invalid upload path');
  try {
    const object = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (object.ContentType) res.setHeader('Content-Type', object.ContentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (object.Body && typeof object.Body.pipe === 'function') return object.Body.pipe(res);
    if (object.Body && typeof object.Body.transformToByteArray === 'function') {
      const bytes = await object.Body.transformToByteArray();
      return res.end(Buffer.from(bytes));
    }
    return res.status(404).send('Upload not found');
  } catch (err) {
    return res.status(err?.$metadata?.httpStatusCode === 404 ? 404 : 500).send('Upload not found');
  }
});

// admin - upload a team logo into durable image storage
app.post('/api/admin/teams/logo-upload', async (req, res) => {
  const me = await requireSuperuser(req, res);
  if (!me) return;
  try {
    const { filename, data_url, team_name, previous_logo_url } = req.body || {};
    const uploaded = await writeUploadedImage({
      folder: 'logos/uploads',
      filename,
      dataUrl: data_url,
      fallbackName: team_name || filename || 'team-logo',
      maxBytes: 5 * 1024 * 1024
    });
    await removeUploadedImage(previous_logo_url);

    res.json({ success: true, ...uploaded });
  } catch (err) {
    apiError(res, err.statusCode || 500, err.code || 'TEAM_LOGO_UPLOAD_FAILED', err.message);
  }
});

app.delete('/api/admin/teams/:id', async (req, res) => {
  const me = await requireSuperuser(req, res);
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

function isMissingPickemsTable(error) {
  if (!error) return false;
  const text = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase();
  return isMissingSupabaseTable(error, 'pickem_picks') ||
    text.includes('pickem_picks') && (
      text.includes('schema cache') ||
      text.includes('does not exist') ||
      text.includes('not found') ||
      error.code === '42P01' ||
      error.code === 'PGRST205'
    );
}

function isMissingSupabaseColumn(error, columnName) {
  if (!error) return false;
  const text = `${error.code || ''} ${error.message || ''} ${error.details || ''}`.toLowerCase();
  return text.includes(columnName.toLowerCase()) && (text.includes('schema cache') || text.includes('column') || text.includes('not found'));
}

function missingBoxScoresError() {
  const error = new Error('Database setup needed: create the public.box_scores table before importing stats. Run supabase/2026-06-20_box_scores.sql in the Supabase SQL editor.');
  error.statusCode = 500;
  return error;
}

function httpError(statusCode, message, details = []) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

async function ensureBoxScoresTable() {
  const { error } = await supabase.from('box_scores').select('id').limit(1);
  if (isMissingSupabaseTable(error, 'box_scores')) throw missingBoxScoresError();
  if (error) throw error;
}

async function ensureBoxScoreForCompletedGame(gameId) {
  await ensureBoxScoresTable();
  const { data: existingBox, error: existingBoxError } = await supabase
    .from('box_scores')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle();
  if (existingBoxError) throw existingBoxError;
  if (existingBox) return existingBox;

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  if (gameError || !game) {
    const error = new Error('Game not found');
    error.statusCode = 404;
    error.code = 'GAME_NOT_FOUND';
    throw error;
  }
  if (game.home_score == null || game.away_score == null) {
    const error = new Error('Only completed games can be connected to highlights');
    error.statusCode = 400;
    error.code = 'HIGHLIGHT_GAME_NOT_COMPLETED';
    throw error;
  }

  const teamIds = [game.away_team_id, game.home_team_id].filter(Boolean);
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id,name')
    .in('id', teamIds);
  if (teamsError) throw teamsError;
  const teamById = {};
  (teams || []).forEach(team => { teamById[team.id] = team; });

  const { data: box, error: insertError } = await supabase.from('box_scores').insert({
    game_id: game.id,
    team1_id: game.away_team_id || null,
    team2_id: game.home_team_id || null,
    team1_name: teamById[game.away_team_id]?.name || null,
    team2_name: teamById[game.home_team_id]?.name || null,
    data: {
      team1: { teamName: teamById[game.away_team_id]?.name || null, players: {} },
      team2: { teamName: teamById[game.home_team_id]?.name || null, players: {} },
      meta: { highlight_only: true, updates_player_totals: false }
    }
  }).select().single();
  if (insertError) throw insertError;
  return box;
}

function boxScoreRows(box) {
  const data = asBoxData(box?.data);
  const rowLike = Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.players) ? data.players : null;
  if (rowLike) {
    return rowLike.map(row => {
      const side = Number(row?.side || row?.team_side) === 2 ? 2 : 1;
      const positions = statRowPositions(row);
      return {
        username: displayUsername(row?.username || row?.roblox_username || row?.player_username || row?.name),
        team_id: row?.team_id || (side === 2 ? box?.team2_id : box?.team1_id) || null,
        side,
        position: positions.position || null,
        offensive_position: positions.offensive_position || null,
        defensive_position: positions.defensive_position || null,
        stats: pickStats(row?.stats || row || {})
      };
    }).filter(row => row.username);
  }
  if (data?.players && typeof data.players === 'object') {
    return Object.entries(data.players).map(([username, stats]) => {
      const positions = statRowPositions(stats || {});
      return {
        username: displayUsername(username),
        team_id: stats?.team_id || null,
        side: Number(stats?.side) === 2 ? 2 : 1,
        position: positions.position || null,
        offensive_position: positions.offensive_position || null,
        defensive_position: positions.defensive_position || null,
        stats: pickStats(stats || {})
      };
    }).filter(row => row.username);
  }
  return ['team1', 'team2'].flatMap((slot, index) => {
    const players = data?.[slot]?.players || {};
    const teamId = slot === 'team1' ? box?.team1_id : box?.team2_id;
    return Object.entries(players).map(([username, stats]) => {
      const positions = statRowPositions(stats || {});
      return {
        username,
        team_id: teamId || null,
        side: index + 1,
        position: positions.position || null,
        offensive_position: positions.offensive_position || null,
        defensive_position: positions.defensive_position || null,
        stats: pickStats(stats || {})
      };
    });
  });
}

function boxScoreCountsForStats(box) {
  const meta = asBoxData(box?.data)?.meta || {};
  return meta.finalized === true && meta.updates_player_totals !== false;
}

function buildBoxDataFromRows(rows, team1Name, team2Name) {
  const data = {
    team1: { teamName: team1Name || null, players: {} },
    team2: { teamName: team2Name || null, players: {} }
  };
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const username = displayUsername(row.username || row.roblox_username);
    if (!username) return;
    const side = Number(row.side) === 2 ? 2 : 1;
    const stats = pickStats(row.stats || row);
    const positions = statRowPositions(row);
    if (positions.position) stats.position = positions.position;
    if (positions.offensive_position) stats.offensive_position = positions.offensive_position;
    if (positions.defensive_position) stats.defensive_position = positions.defensive_position;
    data[side === 2 ? 'team2' : 'team1'].players[username] = stats;
  });
  return data;
}

function validateStatRowsHavePositions(rows) {
  const missing = (Array.isArray(rows) ? rows : [])
    .filter(row => {
      if (!displayUsername(row?.username || row?.roblox_username)) return false;
      const positions = statRowPositions(row || {});
      const stats = row?.stats || row || {};
      const needsOffense = hasOffensiveStats(stats);
      const needsDefense = hasDefensiveStats(stats);
      if (needsOffense && !positions.offensive_position && !isOffensivePosition(positions.position)) return true;
      if (needsDefense && !positions.defensive_position && !isDefensivePosition(positions.position)) return true;
      return !needsOffense && !needsDefense && !positions.position;
    })
    .map(row => displayUsername(row.username || row.roblox_username));
  if (!missing.length) return;
  const uniqueMissing = [...new Set(missing)];
  throw httpError(
    400,
    'Every player row needs a position before stats can be finalized.',
    [
      'Add a position for each player in Edit Stats, then finalize again.',
      `Missing position${uniqueMissing.length === 1 ? '' : 's'}: ${uniqueMissing.join(', ')}`
    ]
  );
}

function statSheetIssuesForRows(rows, playerKeys = new Set(), aliasToCanonical = {}) {
  const missingPositions = [];
  const unresolvedPlayers = [];

  (Array.isArray(rows) ? rows : []).forEach(row => {
    const username = displayUsername(row?.username || row?.roblox_username);
    if (!username) return;

    const positions = statRowPositions(row || {});
    const stats = row?.stats || row || {};
    const needsOffense = hasOffensiveStats(stats);
    const needsDefense = hasDefensiveStats(stats);
    if (
      (needsOffense && !positions.offensive_position && !isOffensivePosition(positions.position)) ||
      (needsDefense && !positions.defensive_position && !isDefensivePosition(positions.position)) ||
      (!needsOffense && !needsDefense && !positions.position)
    ) {
      missingPositions.push(username);
    }

    const key = canonicalUsernameKey(username, aliasToCanonical);
    if (playerKeys.size && !playerKeys.has(key)) unresolvedPlayers.push(username);
  });

  return {
    missing_positions: [...new Set(missingPositions)],
    unresolved_players: [...new Set(unresolvedPlayers)]
  };
}

async function adjustPlayerTotalsForRows(rows, direction = 1, { updateTeam = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const [playersResult, aliases] = await Promise.all([
    supabase.from('players').select('*'),
    fetchPlayerAliases()
  ]);
  const { data: allPlayers, error: playersError } = playersResult;
  if (playersError) throw playersError;
  const { aliasToCanonical } = buildAliasMaps(aliases);
  const byUsername = {};
  (allPlayers || []).forEach(player => { byUsername[canonicalUsernameKey(player.roblox_username, aliasToCanonical)] = player; });

  if (direction > 0) {
    const missing = [];
    (rows || []).forEach(row => {
      const username = displayUsername(row.username);
      if (!username) return;
      const key = canonicalUsernameKey(username, aliasToCanonical);
      if (!byUsername[key]) missing.push(username);
    });
    if (missing.length) {
      const uniqueMissing = [...new Set(missing)];
      throw httpError(
        400,
        'Stats include players that are not valid roster users.',
        [
          'Create or connect these players before finalizing stats.',
          `Unmatched player${uniqueMissing.length === 1 ? '' : 's'}: ${uniqueMissing.join(', ')}`
        ]
      );
    }
  }

  let adjusted = 0;
  for (const row of rows) {
    const username = displayUsername(row.username);
    if (!username) continue;
    const key = canonicalUsernameKey(username, aliasToCanonical);
    const player = byUsername[key];
    const deltas = pickStats(row.stats || {});

    if (!player) continue;

    const update = {};
    STAT_KEYS.forEach(k => {
      const next = Number(player[k] || 0) + (Number(deltas[k] || 0) * direction);
      update[k] = Math.max(0, next);
    });
    if (direction > 0) {
      const positions = statRowPositions(row);
      const rowHasDefense = hasDefensiveStats(deltas);
      const rowHasOffense = hasOffensiveStats(deltas);
      if ((rowHasDefense || (isDefensivePosition(positions.position) && !rowHasOffense)) && (positions.defensive_position || isDefensivePosition(positions.position))) {
        const defensiveProfilePosition = dbDefensivePosition(positions.defensive_position || positions.position);
        if (defensiveProfilePosition) update.defensive_position = defensiveProfilePosition;
      }
      if ((rowHasOffense || (isOffensivePosition(positions.position) && !rowHasDefense)) && (positions.offensive_position || isOffensivePosition(positions.position))) {
        const offensiveProfilePosition = dbOffensivePosition(positions.offensive_position || positions.position);
        if (offensiveProfilePosition) {
          update.offensive_position = offensiveProfilePosition;
          update.position = offensiveProfilePosition;
        }
      }
    }
    if (direction > 0 && updateTeam && row.team_id && row.team_id !== player.team_id) {
      update.team_id = row.team_id;
    }
    const { data: updated, error } = await supabase.from('players').update(update).eq('id', player.id).select().single();
    if (error) throw error;
    byUsername[key] = updated || { ...player, ...update };
    adjusted += 1;
  }
  return adjusted;
}

async function validateStatRowsHaveValidPlayers(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!sourceRows.length) return;
  const [playersResult, aliases] = await Promise.all([
    supabase.from('players').select('roblox_username'),
    fetchPlayerAliases()
  ]);
  const { data: players, error: playersError } = playersResult;
  if (playersError) throw playersError;
  const { aliasToCanonical } = buildAliasMaps(aliases);
  const playerKeys = new Set((players || []).map(player => canonicalUsernameKey(player.roblox_username, aliasToCanonical)).filter(Boolean));
  const missing = sourceRows
    .map(row => displayUsername(row.username || row.roblox_username))
    .filter(username => username && !playerKeys.has(canonicalUsernameKey(username, aliasToCanonical)));
  if (!missing.length) return;
  const uniqueMissing = [...new Set(missing)];
  throw httpError(
    400,
    'Stats include players that are not valid roster users.',
    [
      'Fix unmatched players in Edit Stats before finalizing.',
      `Unmatched player${uniqueMissing.length === 1 ? '' : 's'}: ${uniqueMissing.join(', ')}`
    ]
  );
}

async function adjustPlayerTotalsForBox(box, direction = 1) {
  const meta = asBoxData(box?.data)?.meta || {};
  if (meta.updates_player_totals === false) return 0;
  return adjustPlayerTotalsForRows(boxScoreRows(box), direction);
}

async function resolveExistingStatRows(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!sourceRows.length) return [];
  const [playersResult, aliases] = await Promise.all([
    supabase.from('players').select('id,roblox_username,team_id,avatar_url'),
    fetchPlayerAliases()
  ]);
  const { data: players, error: playersError } = playersResult;
  if (playersError) throw playersError;
  const { aliasToCanonical } = buildAliasMaps(aliases);
  const playersByKey = {};
  (players || []).forEach(player => {
    const key = canonicalUsernameKey(player.roblox_username, aliasToCanonical);
    if (key && !playersByKey[key]) playersByKey[key] = player;
  });

  const resolvedRows = sourceRows.map(row => {
    const username = displayUsername(row.username || row.roblox_username);
    const key = canonicalUsernameKey(username, aliasToCanonical);
    const player = playersByKey[key];
    if (!player) {
      return {
        ...row,
        username,
        player_id: null,
        unresolved: Boolean(username)
      };
    }
    return {
      ...row,
      username: displayUsername(player.roblox_username),
      player_id: player.id,
      unresolved: false
    };
  });

  return resolvedRows;
}

async function assertHighlightGameAvailable(gameId, currentVideoId = null) {
  if (!gameId) return null;
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();
  if (gameError || !game) {
    const error = new Error('Game not found');
    error.statusCode = 404;
    error.code = 'GAME_NOT_FOUND';
    throw error;
  }
  if (game.home_score == null || game.away_score == null) {
    const error = new Error('Only completed games can be connected to highlights');
    error.statusCode = 400;
    error.code = 'HIGHLIGHT_GAME_NOT_COMPLETED';
    throw error;
  }
  const { data: linked, error: linkedError } = await supabase
    .from('media_videos')
    .select('id')
    .eq('game_id', gameId);
  if (isMissingSupabaseColumn(linkedError, 'game_id')) {
    const error = new Error('Database setup needed: add game_id to public.media_videos. Run the media game highlights SQL migration.');
    error.statusCode = 500;
    error.code = 'MEDIA_VIDEO_GAME_ID_MISSING';
    throw error;
  }
  if (linkedError) throw linkedError;
  const other = (linked || []).find(video => String(video.id) !== String(currentVideoId || ''));
  if (other) {
    const error = new Error('That game already has a connected highlight');
    error.statusCode = 409;
    error.code = 'HIGHLIGHT_GAME_ALREADY_CONNECTED';
    throw error;
  }
  return game;
}

async function removeImportedStatsForGame(gameId, { requireBoxScores = false } = {}) {
  const { data: box, error } = await supabase.from('box_scores').select('*').eq('game_id', gameId).maybeSingle();
  if (isMissingSupabaseTable(error, 'box_scores')) {
    if (requireBoxScores) throw missingBoxScoresError();
    return { hadStats: false, removed: 0 };
  }
  if (error) throw error;
  if (!box) return { hadStats: false, removed: 0 };

  const usernames = boxScoreRows(box).map(row => row.username).filter(Boolean);
  await adjustPlayerTotalsForBox(box, -1);

  const { data: linkedHighlights, error: linkedHighlightsError } = await supabase
    .from('media_videos')
    .select('id')
    .eq('game_id', gameId)
    .limit(1);
  if (linkedHighlightsError && !isMissingSupabaseColumn(linkedHighlightsError, 'game_id')) throw linkedHighlightsError;
  const hasLinkedHighlight = !linkedHighlightsError && (linkedHighlights || []).length > 0;

  if (hasLinkedHighlight) {
    const current = asBoxData(box.data);
    const resetData = {
      team1: { teamName: box.team1_name || current.team1?.teamName || null, players: {} },
      team2: { teamName: box.team2_name || current.team2?.teamName || null, players: {} },
      meta: {
        ...(current.meta || {}),
        highlight_only: true,
        finalized: false,
        draft: false,
        updates_player_totals: false,
        stats_reset_at: new Date().toISOString()
      }
    };
    const { error: updateError } = await supabase
      .from('box_scores')
      .update({ data: resetData })
      .eq('id', box.id);
    if (updateError) throw updateError;
    return { hadStats: true, removed: usernames.length, preservedHighlightPage: true };
  }

  const { error: deleteError } = await supabase.from('box_scores').delete().eq('id', box.id);
  if (deleteError) throw deleteError;
  return { hadStats: true, removed: usernames.length, preservedHighlightPage: false };
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

function gameStartTimeMs(game) {
  const date = String(game?.game_date || '').trim();
  if (!date) return NaN;
  const time = String(game?.game_time || '').trim() || '12:00 PM';
  const normalized = time
    .replace(/\bET\b/ig, 'EDT')
    .replace(/\bEST\b/ig, 'GMT-0500')
    .replace(/\bEDT\b/ig, 'GMT-0400')
    .replace(/\bCDT\b/ig, 'GMT-0500')
    .replace(/\bCST\b/ig, 'GMT-0600');
  const parsed = Date.parse(`${date} ${normalized}`);
  if (Number.isFinite(parsed)) return parsed;
  const fallback = Date.parse(`${date} ${time}`);
  return Number.isFinite(fallback) ? fallback : Date.parse(`${date}T12:00:00`);
}

function gameHasFinalScore(game) {
  return game?.home_score !== null && game?.home_score !== undefined &&
    game?.away_score !== null && game?.away_score !== undefined;
}

function gameIsLiveOrPlayed(game) {
  if (gameHasFinalScore(game)) return true;
  const start = gameStartTimeMs(game);
  return Number.isFinite(start) && Date.now() >= start;
}

function gameIsPickable(game) {
  return !gameIsLiveOrPlayed(game);
}

function emptyPickemStats(game) {
  return {
    total: 0,
    home_team_id: game?.home_team_id || null,
    away_team_id: game?.away_team_id || null,
    home_picks: 0,
    away_picks: 0,
    home_pct: 0,
    away_pct: 0,
    avg_home_score: null,
    avg_away_score: null,
    avg_spread: null,
    score_count: 0,
    leader_team_id: null
  };
}

function spreadToNoPushHalfPoint(value) {
  const spread = Number(value);
  if (!Number.isFinite(spread) || spread === 0) return spread;
  const sign = spread < 0 ? -1 : 1;
  return sign * (Math.floor(Math.abs(spread)) + 0.5);
}

function pickemWeekKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^week\s*/i, '');
}

function aggregatePickemStats(games, picks) {
  const gameMap = {};
  (games || []).forEach(game => { if (game?.id) gameMap[game.id] = game; });
  const buckets = {};
  Object.values(gameMap).forEach(game => { buckets[game.id] = emptyPickemStats(game); });
  (picks || []).forEach(pick => {
    const game = gameMap[pick.game_id];
    if (!game) return;
    const bucket = buckets[pick.game_id] || emptyPickemStats(game);
    bucket.total += 1;
    if (String(pick.selected_team_id) === String(game.home_team_id)) bucket.home_picks += 1;
    if (String(pick.selected_team_id) === String(game.away_team_id)) bucket.away_picks += 1;
    const hasHomeScore = pick.predicted_home_score !== null && pick.predicted_home_score !== undefined;
    const hasAwayScore = pick.predicted_away_score !== null && pick.predicted_away_score !== undefined;
    const homeScore = Number(pick.predicted_home_score);
    const awayScore = Number(pick.predicted_away_score);
    if (hasHomeScore && hasAwayScore && Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
      bucket.score_count = (bucket.score_count || 0) + 1;
      bucket.avg_home_score = (bucket.avg_home_score || 0) + homeScore;
      bucket.avg_away_score = (bucket.avg_away_score || 0) + awayScore;
    }
    buckets[pick.game_id] = bucket;
  });
  Object.values(buckets).forEach(bucket => {
    if (!bucket.total) return;
    bucket.home_pct = Math.round((bucket.home_picks / bucket.total) * 100);
    bucket.away_pct = Math.round((bucket.away_picks / bucket.total) * 100);
    if (bucket.score_count) {
      const avgHomeScore = bucket.avg_home_score / bucket.score_count;
      const avgAwayScore = bucket.avg_away_score / bucket.score_count;
      bucket.avg_home_score = Number(avgHomeScore.toFixed(1));
      bucket.avg_away_score = Number(avgAwayScore.toFixed(1));
      bucket.avg_spread = Number(spreadToNoPushHalfPoint(avgHomeScore - avgAwayScore).toFixed(1));
    } else {
      bucket.avg_home_score = null;
      bucket.avg_away_score = null;
      bucket.avg_spread = null;
    }
    bucket.leader_team_id = bucket.home_picks > bucket.away_picks
      ? bucket.home_team_id
      : (bucket.away_picks > bucket.home_picks ? bucket.away_team_id : null);
  });
  return buckets;
}

async function pickemStatsForGames(games) {
  const ids = (games || []).map(game => game.id).filter(Boolean);
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('pickem_picks')
    .select('game_id, selected_team_id, predicted_home_score, predicted_away_score')
    .in('game_id', ids);
  if (isMissingPickemsTable(error)) return aggregatePickemStats(games, []);
  if (error) throw error;
  return aggregatePickemStats(games, data || []);
}

// public — list all games (schedule + scores)
app.get('/api/games', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const [
      gamesResult,
      teamsResult,
      boxesResult,
      playersResult,
      aliases
    ] = await Promise.all([
      supabase.from('games').select('*').order('game_date', { ascending: true }),
      supabase.from('teams').select('*'),
      supabase.from('box_scores').select('id, game_id, created_at, data'),
      supabase.from('players').select('roblox_username'),
      fetchPlayerAliases()
    ]);
    const { data: games, error: gamesError } = gamesResult;
    const { data: teams, error: teamsError } = teamsResult;
    const { data: boxes, error: boxesError } = boxesResult;
    const { data: players, error: playersError } = playersResult;
    if (gamesError) throw gamesError;
    if (teamsError) throw teamsError;
    if (boxesError && !isMissingSupabaseTable(boxesError, 'box_scores')) throw boxesError;
    if (playersError) console.warn('[api/games] player metadata unavailable:', playersError.message || playersError);
    const { aliasToCanonical } = buildAliasMaps(aliases);
    const playerKeys = new Set((playersError ? [] : (players || [])).map(player => canonicalUsernameKey(player.roblox_username, aliasToCanonical)).filter(Boolean));
    const boxByGame = {};
    (boxes || []).forEach(box => {
      if (box.game_id && !boxByGame[box.game_id]) boxByGame[box.game_id] = box;
    });
    const pickemByGame = await pickemStatsForGames(games || []);
    const rows = attachTeams(games || [], teams || []).map(game => {
      const box = boxByGame[game.id] || null;
      const boxMeta = asBoxData(box?.data)?.meta || {};
      const hasImportedStats = Boolean(box) && boxMeta.highlight_only !== true;
      const statsIssues = hasImportedStats ? statSheetIssuesForRows(boxScoreRows(box), playerKeys, aliasToCanonical) : { missing_positions: [], unresolved_players: [] };
      const statsIncorrect = hasImportedStats && (statsIssues.missing_positions.length > 0 || statsIssues.unresolved_players.length > 0);
      return {
        ...game,
        stats_imported: hasImportedStats,
        stats_incorrect: statsIncorrect,
        stats_issues: statsIssues,
        box_score_id: box?.id || null,
        stats_imported_at: hasImportedStats ? box?.created_at || null : null,
        stats_finalized: hasImportedStats && boxMeta.finalized === true,
        stats_draft: hasImportedStats && boxMeta.finalized !== true,
        pickem: pickemByGame[game.id] || emptyPickemStats(game),
        pickem_open: gameIsPickable(game)
      };
    });
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

app.get('/api/pickems', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const profile = await getRequester(req);
    if (!profile) return res.json({ auth_required: true, games: [], picks: {}, stats: {} });
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .order('game_date', { ascending: true });
    if (gamesError) throw gamesError;
    const openGames = (games || []).filter(gameIsPickable);
    const { data: teams, error: teamsError } = await supabase.from('teams').select('*');
    if (teamsError) throw teamsError;
    const withTeams = attachTeams(openGames, teams || []);
    const stats = await pickemStatsForGames(openGames);
    const ids = openGames.map(game => game.id).filter(Boolean);
    let picks = [];
    if (ids.length) {
      const pickResult = await supabase
        .from('pickem_picks')
        .select('*')
        .eq('profile_id', profile.id)
        .in('game_id', ids);
      if (isMissingPickemsTable(pickResult.error)) {
        return res.json({ auth_required: false, setup_required: true, games: [], picks: {}, stats: {} });
      }
      if (pickResult.error) throw pickResult.error;
      picks = pickResult.data || [];
    }
    const pickByGame = {};
    picks.forEach(pick => { pickByGame[pick.game_id] = pick; });
    res.json({
      auth_required: false,
      games: withTeams.map(game => ({ ...game, pickem: stats[game.id] || emptyPickemStats(game), user_pick: pickByGame[game.id] || null })),
      picks: pickByGame,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pickems/leaderboard', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const profile = await getRequester(req);
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .order('game_date', { ascending: true });
    if (gamesError) throw gamesError;
    const { data: teams, error: teamsError } = await supabase.from('teams').select('*');
    if (teamsError) throw teamsError;

    const activeWeek = await getLeagueSetting('active_week');
    const currentWeek = activeWeek || (games || []).find(gameIsPickable)?.week || (games || [])[0]?.week || null;
    const weekGames = currentWeek == null
      ? (games || [])
      : (games || []).filter(game => pickemWeekKey(game.week) === pickemWeekKey(currentWeek));
    const weekGameIds = weekGames.map(game => game.id).filter(Boolean);
    const teamById = Object.fromEntries((teams || []).map(team => [String(team.id), team]));
    let viewerPickRows = [];
    if (profile && weekGameIds.length) {
      const pickResult = await supabase
        .from('pickem_picks')
        .select('*')
        .eq('profile_id', profile.id)
        .in('game_id', weekGameIds);
      if (isMissingPickemsTable(pickResult.error)) {
        return res.json({
          setup_required: true,
          leaderboard: [],
          summary: { scored_games: 0, total_picks: 0, pickers: 0, top_score: 0 },
          viewer: { auth_required: false, week: currentWeek, picks: [] }
        });
      }
      if (pickResult.error) throw pickResult.error;
      viewerPickRows = pickResult.data || [];
    }
    const viewerPickByGame = Object.fromEntries(viewerPickRows.map(pick => [String(pick.game_id), pick]));
    const viewer = {
      auth_required: !profile,
      week: currentWeek,
      picks: attachTeams(weekGames, teams || []).map(game => {
        const pick = viewerPickByGame[String(game.id)] || null;
        const selectedTeam = pick ? teamById[String(pick.selected_team_id)] || null : null;
        return {
          game,
          pick,
          selected_team: selectedTeam ? {
            id: selectedTeam.id,
            name: selectedTeam.name,
            abbreviation: selectedTeam.abbreviation,
            logo_url: selectedTeam.logo_url,
            primary_color: selectedTeam.primary_color
          } : null,
          locked: !gameIsPickable(game),
          final: gameHasFinalScore(game)
        };
      })
    };

    const scoredGames = (games || []).filter(game =>
      game.home_score !== null && game.home_score !== undefined &&
      game.away_score !== null && game.away_score !== undefined &&
      Number(game.home_score) !== Number(game.away_score)
    );
    const allGameIds = (games || []).map(game => game.id).filter(Boolean);
    if (!allGameIds.length) {
      return res.json({
        leaderboard: [],
        summary: { scored_games: 0, total_picks: 0, pickers: 0, top_score: 0 },
        viewer
      });
    }

    const { data: picks, error: picksError } = await supabase
      .from('pickem_picks')
      .select('game_id, profile_id, selected_team_id')
      .in('game_id', allGameIds);
    if (isMissingPickemsTable(picksError)) {
      return res.json({
        setup_required: true,
        leaderboard: [],
        summary: { scored_games: scoredGames.length, total_picks: 0, pickers: 0, top_score: 0 },
        viewer
      });
    }
    if (picksError) throw picksError;

    const profileIds = [...new Set((picks || []).map(pick => pick.profile_id).filter(Boolean))];
    let profileById = {};
    if (profileIds.length) {
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, roblox_username, avatar_url')
        .in('id', profileIds);
      if (profilesError) throw profilesError;
      profileById = Object.fromEntries((profiles || []).map(profile => [profile.id, profile]));
    }

    const winnerByGame = Object.fromEntries(scoredGames.map(game => [
      game.id,
      Number(game.home_score) > Number(game.away_score) ? game.home_team_id : game.away_team_id
    ]));
    const rowsByProfile = {};
    (picks || []).forEach(pick => {
      const profileId = pick.profile_id;
      if (!profileId) return;
      const row = rowsByProfile[profileId] || {
        profile_id: profileId,
        roblox_username: profileById[profileId]?.roblox_username || 'Unknown',
        avatar_url: profileById[profileId]?.avatar_url || null,
        points: 0,
        correct: 0,
        submitted: 0,
        scored_submitted: 0
      };
      row.submitted += 1;
      if (winnerByGame[pick.game_id]) {
        row.scored_submitted += 1;
      }
      if (winnerByGame[pick.game_id] && String(pick.selected_team_id) === String(winnerByGame[pick.game_id])) {
        row.points += 1;
        row.correct += 1;
      }
      rowsByProfile[profileId] = row;
    });

    const leaderboard = Object.values(rowsByProfile)
      .map(row => {
        const { scored_submitted, ...publicRow } = row;
        return {
          ...publicRow,
          accuracy: scored_submitted ? Number(((row.correct / scored_submitted) * 100).toFixed(1)) : 100
        };
      })
      .sort((a, b) =>
        b.points - a.points ||
        Number(b.accuracy || 0) - Number(a.accuracy || 0) ||
        b.submitted - a.submitted ||
        String(a.roblox_username || '').localeCompare(String(b.roblox_username || ''))
      );
    let previousPoints = null;
    let previousRank = 0;
    leaderboard.forEach((row, index) => {
      const rank = row.points === previousPoints ? previousRank : index + 1;
      row.rank = rank;
      previousRank = rank;
      previousPoints = row.points;
    });

    res.json({
      leaderboard,
      summary: {
        scored_games: scoredGames.length,
        total_picks: (picks || []).length,
        pickers: leaderboard.length,
        top_score: leaderboard[0]?.points || 0
      },
      viewer
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pickems/:gameId', async (req, res) => {
  try {
    const profile = await getRequester(req);
    if (!profile) return apiError(res, 401, 'AUTH_REQUIRED', 'You must be signed in to make pick-ems');
    const { data: game, error: gameError } = await supabase.from('games').select('*').eq('id', req.params.gameId).single();
    if (gameError || !game) return apiError(res, 404, 'GAME_NOT_FOUND', 'Game not found');
    if (!gameIsPickable(game)) return apiError(res, 409, 'PICKEM_LOCKED', 'Pick-ems are locked for this game');
    const selectedTeamId = String(req.body?.selected_team_id || '').trim();
    if (![String(game.home_team_id), String(game.away_team_id)].includes(selectedTeamId)) {
      return apiError(res, 400, 'TEAM_REQUIRED', 'Pick either team in this game');
    }
    const homeScoreRaw = req.body?.predicted_home_score;
    const awayScoreRaw = req.body?.predicted_away_score;
    const hasHomeScore = homeScoreRaw !== null && homeScoreRaw !== undefined && String(homeScoreRaw).trim() !== '';
    const hasAwayScore = awayScoreRaw !== null && awayScoreRaw !== undefined && String(awayScoreRaw).trim() !== '';
    if (hasHomeScore !== hasAwayScore) {
      return apiError(res, 400, 'SCORE_PAIR_REQUIRED', 'Enter both predicted scores or leave both blank');
    }
    const predictedHomeScore = hasHomeScore ? Number.parseInt(homeScoreRaw, 10) : null;
    const predictedAwayScore = hasAwayScore ? Number.parseInt(awayScoreRaw, 10) : null;
    if ((predictedHomeScore !== null && (!Number.isInteger(predictedHomeScore) || predictedHomeScore < 0 || predictedHomeScore > 255)) ||
        (predictedAwayScore !== null && (!Number.isInteger(predictedAwayScore) || predictedAwayScore < 0 || predictedAwayScore > 255))) {
      return apiError(res, 400, 'SCORE_INVALID', 'Enter valid predicted scores or leave them blank');
    }
    const row = {
      game_id: game.id,
      profile_id: profile.id,
      selected_team_id: selectedTeamId,
      predicted_home_score: predictedHomeScore,
      predicted_away_score: predictedAwayScore,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase
      .from('pickem_picks')
      .upsert(row, { onConflict: 'game_id,profile_id' })
      .select()
      .single();
    if (isMissingPickemsTable(error)) return apiError(res, 500, 'PICKEMS_SETUP_REQUIRED', 'Pick-em storage is not set up yet. Run supabase/2026-06-23_pickems.sql.');
    if (error) throw error;
    const stats = await pickemStatsForGames([game]);
    res.json({ success: true, pick: data, pickem: stats[game.id] || emptyPickemStats(game) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
  }
});

const TIER_WIN_PTS = { 1: 3, 2: 2.5, 3: 2, 4: 1.5, 5: 1 };
const PLAYUP_WIN_PTS = {
  '1-1': 4,
  '1-2': 3,
  '2-1': 3.5,
  '2-3': 2.5,
  '3-2': 3,
  '3-4': 2,
  '4-3': 2.5,
  '4-5': 1.5,
  '5-4': 2,
  '5-5': 1
};

function weekType(weekStr) {
  if (!weekStr) return 'series';
  const w = String(weekStr).trim().toLowerCase();
  if (w === 'week 1' || w === '1') return 'placement';
  if (w === 'week 10' || w === '10') return 'playup';
  return 'series';
}

function calcPoints(game, winnerTeam) {
  // Week 10: play-up/down scoring by current assigned tiers.
  const wt = weekType(game.week);
  if (wt === 'playup') {
    const loserId = game.home_team_id === winnerTeam?.id ? game.away_team_id : game.home_team_id;
    const loserTeam = game.__teamMap ? game.__teamMap[loserId] : null;
    const key = `${winnerTeam?.tier || ''}-${loserTeam?.tier || ''}`;
    return PLAYUP_WIN_PTS[key] ?? (winnerTeam?.tier ? (TIER_WIN_PTS[winnerTeam.tier] || 0) : 0);
  }
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
      const pts = calcPoints({ ...g, __teamMap: teamMap }, winnerTeam);

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

function gameSortValue(g) {
  const date = String(g.game_date || '').trim();
  const time = String(g.game_time || '').trim();
  const parsed = Date.parse(`${date || '9999-12-31'} ${time || '12:00 PM'}`);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function formatRecentGame(g, teamId, teamMap) {
  const home = g.home_team_id === teamId;
  const pf = home ? g.home_score : g.away_score;
  const pa = home ? g.away_score : g.home_score;
  const oppId = home ? g.away_team_id : g.home_team_id;
  return {
    game_id: g.id,
    week: g.week,
    date: g.game_date,
    opponent_id: oppId,
    opponent_name: teamMap[oppId]?.name || 'TBD',
    opponent_abbreviation: teamMap[oppId]?.abbreviation || null,
    result: pf > pa ? 'W' : (pa > pf ? 'L' : 'T'),
    pf,
    pa,
    pd: pf - pa
  };
}

function buildTierStandings(teams = [], games = []) {
  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t; });

  const stats = {};
  teams.forEach(t => {
    stats[t.id] = {
      team: t,
      pts: 0,
      w: 0,
      l: 0,
      pf: 0,
      pa: 0,
      recent_games: []
    };
  });

  const completed = (games || []).filter(g =>
    g.home_score !== null && g.home_score !== undefined &&
    g.away_score !== null && g.away_score !== undefined
  );

  for (const g of completed) {
    const home = stats[g.home_team_id];
    const away = stats[g.away_team_id];
    const homeTeam = teamMap[g.home_team_id];
    const awayTeam = teamMap[g.away_team_id];
    if (!home || !away || !homeTeam || !awayTeam) continue;

    const hs = Number(g.home_score);
    const as = Number(g.away_score);
    const homeWon = hs > as;
    const awayWon = as > hs;
    if (homeWon || awayWon) {
      const winnerTeam = homeWon ? homeTeam : awayTeam;
      const pts = calcPoints({ ...g, __teamMap: teamMap }, winnerTeam);
      if (homeWon) {
        home.w++;
        away.l++;
        home.pts += pts;
      } else {
        away.w++;
        home.l++;
        away.pts += pts;
      }
    }
    home.pf += hs; home.pa += as;
    away.pf += as; away.pa += hs;
  }

  completed
    .slice()
    .sort((a, b) => gameSortValue(b) - gameSortValue(a))
    .forEach(g => {
      [g.home_team_id, g.away_team_id].forEach(teamId => {
        if (stats[teamId] && stats[teamId].recent_games.length < 2) {
          stats[teamId].recent_games.push(formatRecentGame(g, teamId, teamMap));
        }
      });
    });

  const rows = Object.values(stats).map(s => {
    const recent_pf = s.recent_games.reduce((sum, g) => sum + (g.pf || 0), 0);
    const recent_pa = s.recent_games.reduce((sum, g) => sum + (g.pa || 0), 0);
    return {
      team_id: s.team.id,
      name: s.team.name,
      abbreviation: s.team.abbreviation,
      primary_color: s.team.primary_color,
      secondary_color: s.team.secondary_color,
      logo_url: s.team.logo_url,
      tier: s.team.tier || null,
      pts: s.pts,
      w: s.w,
      l: s.l,
      pf: s.pf,
      pa: s.pa,
      pd: s.pf - s.pa,
      recent_pf,
      recent_pa,
      recent_pd: recent_pf - recent_pa,
      recent_games: s.recent_games
    };
  });

  const byTier = { unassigned: [] };
  for (let t = 1; t <= 5; t++) byTier[t] = [];
  rows.forEach(r => {
    const tier = Number(r.tier);
    if (tier >= 1 && tier <= 5) byTier[tier].push(r);
    else byTier.unassigned.push(r);
  });

  Object.keys(byTier).forEach(key => {
    byTier[key].sort((a, b) =>
      b.w - a.w ||
      b.pd - a.pd ||
      b.pts - a.pts ||
      (a.name || '').localeCompare(b.name || '')
    );
  });

  return { rows, byTier };
}

app.get('/api/admin/teams/tier-standings', async (req, res) => {
  const me = await requireAdmin(req, res, 'teams');
  if (!me) return;
  try {
    const { data: teams, error: teamError } = await supabase.from('teams').select('*').order('name');
    if (teamError) throw teamError;
    const { data: games, error: gameError } = await supabase.from('games').select('*');
    if (gameError) throw gameError;
    const standings = buildTierStandings(teams || [], games || []);
    res.json({
      ...standings,
      point_rules: {
        placement: 2,
        tier_win: TIER_WIN_PTS,
        playup: PLAYUP_WIN_PTS
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/teams/tiers', async (req, res) => {
  const me = await requireSuperuser(req, res);
  if (!me) return;
  try {
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    if (!updates.length) return res.status(400).json({ error: 'No tier updates provided' });
    for (const row of updates) {
      const tier = row.tier === null || row.tier === '' || row.tier === undefined ? null : parseInt(row.tier, 10);
      const cleanTier = tier >= 1 && tier <= 5 ? tier : null;
      const { error } = await supabase.from('teams').update({ tier: cleanTier }).eq('id', row.id);
      if (error) throw error;
    }
    res.json({ success: true, updated: updates.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — create a game
app.post('/api/admin/games', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    const { week, game_date, game_time, home_team_id, away_team_id, home_score, away_score, point_value, twitch_url } = req.body;
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
      point_value: pv,
      twitch_url: (twitch_url || '').trim() || null
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
    const { week, game_date, game_time, home_team_id, away_team_id, home_score, away_score, point_value, twitch_url } = req.body;
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
      point_value: pv,
      twitch_url: (twitch_url || '').trim() || null
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
async function importParsedGameStats({ players, game_id, team1_id, team2_id, team1_name, team2_name, finalize = true, replaceExisting = false, finalScore = null }) {
  if (!Array.isArray(players) || players.length === 0) {
    const error = new Error('No player rows to import');
    error.statusCode = 400;
    error.details = ['The CSV was parsed, but no player stat rows were found. Confirm the file is the exported OFL statistics CSV and includes player rows under each stat section.'];
    throw error;
  }

  await ensureBoxScoresTable();
  if (finalize) validateStatRowsHavePositions(players);

  let existingHighlightOnlyBox = null;
  if (game_id) {
    const { data: existingBox, error: existingBoxError } = await supabase.from('box_scores').select('*').eq('game_id', game_id).maybeSingle();
    if (existingBoxError) throw existingBoxError;
    if (existingBox) {
      if (existingBox.data?.meta?.highlight_only === true) {
        existingHighlightOnlyBox = existingBox;
      } else if (!replaceExisting) {
        const error = new Error('Stats have already been imported for this game. Remove them before importing again.');
        error.statusCode = 409;
        error.details = ['This game already has stored stats. Use Edit Stats on the game card to review or correct them.'];
        throw error;
      }
    }
  }

  let statPhase = 'regular';
  if (game_id) {
    const { data: gameForPhase, error: gameForPhaseError } = await supabase.from('games').select('week').eq('id', game_id).maybeSingle();
    if (gameForPhaseError) throw gameForPhaseError;
    statPhase = await getWeekPhase(gameForPhase?.week);
  }
  const updatesPlayerTotals = finalize && statPhase !== 'playoffs';

  const boxData = { team1: { teamName: team1_name || null, players: {} }, team2: { teamName: team2_name || null, players: {} } };

  for (const row of players) {
    const username = (row.username || '').trim();
    if (!username) continue;
    const deltas = pickStats(row.stats || {});
    const positions = statRowPositions({ ...row, stats: { ...(row.stats || {}), ...deltas } });
    if (positions.position) deltas.position = positions.position;
    if (positions.offensive_position) deltas.offensive_position = positions.offensive_position;
    if (positions.defensive_position) deltas.defensive_position = positions.defensive_position;
    const assignedTeamId = row.team_id || null;
    const slot = (assignedTeamId === team1_id) ? 'team1' : (assignedTeamId === team2_id) ? 'team2' : (row.side === 2 ? 'team2' : 'team1');
    boxData[slot].players[username] = deltas;
  }

  if (updatesPlayerTotals) {
    await adjustPlayerTotalsForRows(players, 1, { updateTeam: false });
  }

  const boxRow = {
    game_id: game_id || null,
    team1_name: team1_name || null,
    team2_name: team2_name || null,
    team1_id: team1_id || null,
    team2_id: team2_id || null,
    data: { ...boxData, meta: { phase: statPhase, updates_player_totals: updatesPlayerTotals, finalized: !!finalize, draft: !finalize, final_score: finalScore || null } }
  };
  const query = existingHighlightOnlyBox
    ? supabase.from('box_scores').update(boxRow).eq('id', existingHighlightOnlyBox.id)
    : supabase.from('box_scores').insert(boxRow);
  const { data: box, error } = await query.select().single();
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

    const resolvedRows = await resolveExistingStatRows(rows);
    const finalScore = parseFinalScoreFromCSV(csv, parsed.team1.teamName, parsed.team2.teamName);
    const box = await importParsedGameStats({
      players: resolvedRows,
      game_id: game.id,
      team1_id: parsedTeam1.id,
      team2_id: parsedTeam2.id,
      team1_name: parsedTeam1.name,
      team2_name: parsedTeam2.name,
      finalize: false,
      finalScore
    });

    if (finalScore && finalScore.team1 != null && finalScore.team2 != null) {
      const scoreUpdate = parsedTeam1.id === game.home_team_id
        ? { home_score: finalScore.team1, away_score: finalScore.team2 }
        : { home_score: finalScore.team2, away_score: finalScore.team1 };
      await supabase.from('games').update(scoreUpdate).eq('id', game.id);
    }

    res.json({ success: true, box_score_id: box.id, imported: resolvedRows.length, review_url: `/admin?tab=schedule&page=stats&game=${game.id}`, finalized: false });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message, details: err.details || [] });
  }
});

app.get('/api/admin/games/:id/stats-review', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    await ensureBoxScoresTable();
    const { data: game, error: gameError } = await supabase.from('games').select('*').eq('id', req.params.id).single();
    if (gameError || !game) return res.status(404).json({ error: 'Game not found' });
    const { data: box, error: boxError } = await supabase.from('box_scores').select('*').eq('game_id', req.params.id).maybeSingle();
    if (boxError) throw boxError;
    if (!box) return res.status(404).json({ error: 'No stats have been imported for this game yet' });
    const { data: teams, error: teamsError } = await supabase.from('teams').select('id,name,abbreviation,logo_url,primary_color');
    if (teamsError) throw teamsError;
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id,roblox_username,team_id,avatar_url,offensive_position,defensive_position')
      .order('roblox_username');
    if (playersError) throw playersError;
    const [gameWithTeams] = attachTeams([game], teams || []);
    res.json({
      game: gameWithTeams,
      box_score: box,
      rows: boxScoreRows(box),
      stat_keys: STAT_KEYS.map(key => ({ key, label: statLabelFromKey(key) })),
      teams: (teams || []).filter(team => [box.team1_id, box.team2_id, game.away_team_id, game.home_team_id].includes(team.id)),
      players: players || [],
      finalized: asBoxData(box.data)?.meta?.finalized === true
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message, details: err.details || [] });
  }
});

app.put('/api/admin/games/:id/stats-review', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    await ensureBoxScoresTable();
    const { data: box, error: boxError } = await supabase.from('box_scores').select('*').eq('game_id', req.params.id).maybeSingle();
    if (boxError) throw boxError;
    if (!box) return res.status(404).json({ error: 'No stats have been imported for this game yet' });
    const oldMeta = asBoxData(box.data)?.meta || {};
    if (oldMeta.finalized === true) await adjustPlayerTotalsForBox(box, -1);

    const rows = (Array.isArray(req.body.rows) ? req.body.rows : []).map(row => {
      const stats = pickStats(row.stats || row);
      const positions = statRowPositions({
        ...row,
        stats,
        offensive_position: row.offensive_position || row.offense_position,
        defensive_position: row.defensive_position || row.defense_position
      });
      return {
        username: displayUsername(row.username || row.roblox_username),
        team_id: row.team_id || null,
        side: Number(row.side) === 2 ? 2 : 1,
        position: positions.position,
        offensive_position: positions.offensive_position,
        defensive_position: positions.defensive_position,
        stats
      };
    }).filter(row => row.username);
    if (!rows.length) return res.status(400).json({ error: 'At least one player stat row is required' });
    const resolvedRows = await resolveExistingStatRows(rows);
    if (oldMeta.finalized === true) {
      validateStatRowsHavePositions(resolvedRows);
      await validateStatRowsHaveValidPlayers(resolvedRows);
    }

    const meta = {
      ...oldMeta,
      finalized: oldMeta.finalized === true,
      draft: oldMeta.finalized !== true,
      updates_player_totals: oldMeta.finalized === true && oldMeta.phase !== 'playoffs',
      edited_at: new Date().toISOString()
    };
    const data = { ...buildBoxDataFromRows(resolvedRows, box.team1_name, box.team2_name), meta };
    const { data: updated, error: updateError } = await supabase
      .from('box_scores')
      .update({ data })
      .eq('id', box.id)
      .select()
      .single();
    if (updateError) throw updateError;
    if (meta.updates_player_totals) await adjustPlayerTotalsForBox(updated, 1);
    res.json({ success: true, box_score: updated, rows: boxScoreRows(updated), finalized: meta.finalized });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ error: err.message, details: err.details || [] });
  }
});

app.post('/api/admin/games/:id/stats-review/finalize', async (req, res) => {
  const me = await requireAdmin(req, res, 'schedule');
  if (!me) return;
  try {
    await ensureBoxScoresTable();
    const { data: box, error: boxError } = await supabase.from('box_scores').select('*').eq('game_id', req.params.id).maybeSingle();
    if (boxError) throw boxError;
    if (!box) return res.status(404).json({ error: 'No stats have been imported for this game yet' });
    const current = asBoxData(box.data);
    const oldMeta = current.meta || {};
    if (oldMeta.finalized === true) return res.json({ success: true, box_score: box, rows: boxScoreRows(box), finalized: true, applied: 0 });
    const rows = boxScoreRows(box);
    validateStatRowsHavePositions(rows);
    await validateStatRowsHaveValidPlayers(rows);

    const meta = {
      ...oldMeta,
      finalized: true,
      draft: false,
      updates_player_totals: oldMeta.phase !== 'playoffs',
      finalized_at: new Date().toISOString()
    };
    const { data: updated, error: updateError } = await supabase
      .from('box_scores')
      .update({ data: { ...current, meta } })
      .eq('id', box.id)
      .select()
      .single();
    if (updateError) throw updateError;
    const applied = await adjustPlayerTotalsForBox(updated, 1);
    res.json({ success: true, box_score: updated, rows: boxScoreRows(updated), finalized: true, applied });
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

// public — fetch the stored box score for a game, with teams and player avatars
app.get('/api/games/:id/box-score', async (req, res) => {
  try {
    const { data: game, error: gameError } = await supabase.from('games').select('*').eq('id', req.params.id).single();
    if (gameError || !game) return apiError(res, 404, 'GAME_NOT_FOUND', 'Game not found');

    const { data: teams, error: teamsError } = await supabase.from('teams').select('*');
    if (teamsError) throw teamsError;
    const [gameWithTeams] = attachTeams([game], teams || []);

    const pickemByGame = await pickemStatsForGames([game]);
    const pickem = pickemByGame[game.id] || emptyPickemStats(game);

    const { data: box, error: boxError } = await supabase.from('box_scores').select('*').eq('game_id', req.params.id).maybeSingle();
    if (isMissingSupabaseTable(boxError, 'box_scores')) {
      return res.json({
        game: gameWithTeams,
        box_score: null,
        players: {},
        highlight: null,
        comparison: null,
        pickem,
        stats_available: false
      });
    }
    if (boxError) throw boxError;
    if (!box) {
      return res.json({
        game: gameWithTeams,
        box_score: null,
        players: {},
        highlight: null,
        comparison: null,
        pickem,
        stats_available: false
      });
    }

    const usernameSet = new Set();
    ['team1', 'team2'].forEach(slot => {
      Object.keys(box.data?.[slot]?.players || {}).forEach(username => usernameSet.add(String(username).toLowerCase()));
    });
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, roblox_username, avatar_url, team_id, offensive_position, defensive_position, jersey_number');
    if (playersError) throw playersError;

    const playerMap = {};
    (players || []).forEach(player => {
      const key = String(player.roblox_username || '').toLowerCase();
      if (usernameSet.has(key)) playerMap[key] = player;
    });

    let highlight = null;
    const { data: linkedHighlight, error: highlightError } = await supabase
      .from('media_videos')
      .select('*')
      .eq('game_id', req.params.id)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (highlightError && !isMissingSupabaseColumn(highlightError, 'game_id')) throw highlightError;
    if (linkedHighlight) highlight = { ...linkedHighlight, youtube_id: extractYouTubeId(linkedHighlight.youtube_url) };

    const { data: allBoxes, error: allBoxesError } = await supabase
      .from('box_scores')
      .select('team1_id, team2_id, data');
    if (allBoxesError) throw allBoxesError;

    res.json({
      game: gameWithTeams,
      box_score: box,
      players: playerMap,
      highlight,
      comparison: buildBoxScoreComparison(allBoxes || [], game.away_team_id, game.home_team_id),
      pickem,
      stats_available: true
    });
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

// public - current-season stats from finalized raw box scores
app.get('/api/stats', async (_req, res) => {
  try {
    const [boxes, rosterRows, teamsResult, aliases] = await Promise.all([
      fetchAll(supabase.from('box_scores').select('id, team1_id, team2_id, data, created_at').order('created_at', { ascending: true })),
      fetchAll(supabase.from('players').select('*').order('roblox_username')),
      supabase.from('teams').select('*'),
      fetchPlayerAliases()
    ]);

    if (teamsResult.error) throw teamsResult.error;
    const { aliasToCanonical } = buildAliasMaps(aliases);
    const teamsById = {};
    (teamsResult.data || []).forEach(team => { teamsById[team.id] = team; });

    const playersByKey = {};
    combinePlayerRowsByAlias(rosterRows || [], aliases).forEach(player => {
      const key = canonicalUsernameKey(player.roblox_username, aliasToCanonical);
      if (key) playersByKey[key] = player;
    });

    const totalsByKey = {};
    (boxes || []).filter(boxScoreCountsForStats).forEach(box => {
      boxScoreRows(box).forEach(row => {
        const username = displayUsername(row.username);
        const key = canonicalUsernameKey(username, aliasToCanonical);
        if (!key) return;
        if (!totalsByKey[key]) {
          const initialPosition = normalizeImportedPosition(row.position);
          const initialStats = row.stats || {};
          const initialDefensivePosition = hasDefensiveStats(initialStats) || (isDefensivePosition(initialPosition) && !hasOffensiveStats(initialStats))
            ? initialPosition
            : null;
          const initialOffensivePosition = hasOffensiveStats(initialStats) || (isOffensivePosition(initialPosition) && !hasDefensiveStats(initialStats))
            ? initialPosition
            : null;
          totalsByKey[key] = {
            roblox_username: displayUsername(playersByKey[key]?.roblox_username || username),
            avatar_url: playersByKey[key]?.avatar_url || null,
            position: playersByKey[key]?.position || playersByKey[key]?.offensive_position || initialOffensivePosition || initialPosition || null,
            offensive_position: playersByKey[key]?.offensive_position || initialOffensivePosition || null,
            defensive_position: playersByKey[key]?.defensive_position || initialDefensivePosition || null,
            team_id: playersByKey[key]?.team_id || row.team_id || null
          };
          STAT_KEYS.forEach(statKey => { totalsByKey[key][statKey] = 0; });
        }
        STAT_KEYS.forEach(statKey => {
          totalsByKey[key][statKey] += Number(row.stats?.[statKey] || 0);
        });
        if (!playersByKey[key]?.team_id && row.team_id) totalsByKey[key].team_id = row.team_id;
        const rowPosition = normalizeImportedPosition(row.position);
        if (rowPosition) {
          if ((hasDefensiveStats(row.stats) || (isDefensivePosition(rowPosition) && !hasOffensiveStats(row.stats))) && !totalsByKey[key].defensive_position) {
            totalsByKey[key].defensive_position = rowPosition;
          }
          if ((hasOffensiveStats(row.stats) || (isOffensivePosition(rowPosition) && !hasDefensiveStats(row.stats))) && !totalsByKey[key].offensive_position) {
            totalsByKey[key].offensive_position = rowPosition;
          }
          if (!totalsByKey[key].position && totalsByKey[key].offensive_position) totalsByKey[key].position = totalsByKey[key].offensive_position;
          if (!totalsByKey[key].position) totalsByKey[key].position = rowPosition;
        }
      });
    });

    const players = Object.values(totalsByKey).map(player => {
      const team = teamsById[player.team_id] || null;
      return {
        ...player,
        team: publicTeamSummary(team),
        team_name: team?.name || null,
        total_yards: Number(player.pass_yards || 0) + Number(player.rush_yards || 0) + Number(player.rec_yards || 0),
        total_td: Number(player.pass_td || 0) + Number(player.rush_td || 0) + Number(player.rec_td || 0)
      };
    });

    res.json({ season: 'current', source: 'box_scores', players });
  } catch (err) {
    if (isMissingSupabaseTable(err, 'box_scores')) return res.json({ season: 'current', source: 'box_scores', players: [] });
    apiError(res, err.statusCode || 500, err.code || 'STATS_LOAD_FAILED', err.message);
  }
});

// public — all players with team info attached
app.get('/api/players', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const includeRegistry = String(req.query.include_registry || '').trim() === '1';
    const rawLimit = Number.parseInt(String(req.query.limit || '0'), 10);
    const rawOffset = Number.parseInt(String(req.query.offset || '0'), 10);
    const usePaging = Number.isFinite(rawLimit) && rawLimit > 0;
    const limit = usePaging ? Math.min(Math.max(rawLimit, 1), 100) : null;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    if (includeRegistry) {
      const aliases = await fetchPlayerAliases();
      const [registryRows, rawRosterRows, oauthConnections] = await Promise.all([
        fetchAll(supabase.from('league_players').select('*').order('cap_value', { ascending: false }).order('roblox_username')),
        fetchAll(supabase.from('players').select('*').order('roblox_username')),
        fetchOauthConnections(aliases)
      ]);
      const rosterRows = combinePlayerRowsByAlias(rawRosterRows || [], aliases);
      const teamsResult = await withTimeout(
        supabase.from('teams').select('*'),
        8000,
        'TEAMS_LOAD_TIMEOUT',
        'Timed out while loading teams from Supabase'
      );
      if (teamsResult.error) {
        return apiError(res, 500, 'TEAMS_LOAD_FAILED', teamsResult.error.message, teamsResult.error.details);
      }

      const teamMap = {};
      (teamsResult.data || []).forEach(t => {
        teamMap[t.id] = { id: t.id, name: t.name, abbreviation: t.abbreviation, logo_url: t.logo_url, primary_color: t.primary_color, secondary_color: t.secondary_color };
      });
      const rosterMap = {};
      const { aliasToCanonical } = buildAliasMaps(aliases);
      (rosterRows || []).forEach(p => { rosterMap[canonicalUsernameKey(p.roblox_username, aliasToCanonical)] = p; });
      const registryMap = {};
      const combined = [];
      (registryRows || []).forEach(row => {
        const key = canonicalUsernameKey(row.roblox_username, aliasToCanonical);
        registryMap[key] = row;
        const roster = rosterMap[key] || {};
        combined.push(withTeamStaffRoles(withOauthConnected({
          ...roster,
          ...row,
          id: roster.id || row.id,
          roblox_username: row.roblox_username || roster.roblox_username,
          avatar_url: roster.avatar_url || row.avatar_url || null,
          roblox_user_id: roster.roblox_user_id || row.roblox_user_id || null,
          eligibility: row.eligibility || roster.eligibility || null,
          position_tag: row.position_tag || roster.position || null,
          cap_value: Number(row.cap_value || roster.cap_value || 0),
          team_id: roster.team_id || null,
          team: roster.team_id ? (teamMap[roster.team_id] || null) : null
        }, oauthConnections, aliases), teamsResult.data || [], aliases));
      });
      (rosterRows || []).forEach(roster => {
        const key = canonicalUsernameKey(roster.roblox_username, aliasToCanonical);
        if (registryMap[key]) return;
        combined.push(withTeamStaffRoles(withOauthConnected({
          ...roster,
          eligibility: roster.eligibility || null,
          position_tag: roster.position_tag || roster.position || null,
          cap_value: Number(roster.cap_value || 0),
          team: roster.team_id ? (teamMap[roster.team_id] || null) : null
        }, oauthConnections, aliases), teamsResult.data || [], aliases));
      });

      const filtered = q ? combined.filter(p => matchesPlayerSearch(p, q)) : combined;
      return res.json({
        players: filtered,
        total: filtered.length,
        limit: null,
        offset: 0,
        has_more: false
      });
    }

    let playersQuery = supabase.from('players').select('*', { count: 'exact' }).order('roblox_username');
    if (q) playersQuery = playersQuery.ilike('roblox_username', `%${q}%`);
    if (limit) playersQuery = playersQuery.range(offset, offset + limit - 1);

    const playersResult = await withTimeout(
      playersQuery,
      8000,
      'PLAYERS_LOAD_TIMEOUT',
      'Timed out while loading players from Supabase'
    );
    if (playersResult.error) {
      return apiError(res, 500, 'PLAYERS_LOAD_FAILED', playersResult.error.message, playersResult.error.details);
    }

    const teamsResult = await withTimeout(
      supabase.from('teams').select('*'),
      8000,
      'TEAMS_LOAD_TIMEOUT',
      'Timed out while loading teams from Supabase'
    );
    if (teamsResult.error) {
      return apiError(res, 500, 'TEAMS_LOAD_FAILED', teamsResult.error.message, teamsResult.error.details);
    }

    const aliases = await fetchPlayerAliases();
    const oauthConnections = await fetchOauthConnections(aliases);
    const players = combinePlayerRowsByAlias(playersResult.data || [], aliases);
    const teams = teamsResult.data || [];
    const map = {};
    for (const t of teams) map[t.id] = { id: t.id, name: t.name, abbreviation: t.abbreviation, logo_url: t.logo_url, primary_color: t.primary_color, secondary_color: t.secondary_color };
    const registryMap = {};
    const { aliasToCanonical } = buildAliasMaps(aliases);
    const usernames = players.flatMap(p => [p.roblox_username, ...(p.formerly_known_as || [])]).filter(Boolean);
    if (usernames.length) {
      const { data: registryRows, error: registryError } = await supabase
        .from('league_players')
        .select('roblox_username, eligibility, cap_value, position_tag')
        .in('roblox_username', usernames);
      if (registryError && !isMissingSupabaseTable(registryError, 'league_players')) {
        return apiError(res, 500, 'PLAYERS_REGISTRY_ENRICH_FAILED', registryError.message, registryError.details);
      }
      (registryRows || []).forEach(row => { registryMap[canonicalUsernameKey(row.roblox_username, aliasToCanonical)] = row; });
    }
    res.json({
      players: players.map(p => {
        const reg = registryMap[canonicalUsernameKey(p.roblox_username, aliasToCanonical)] || null;
        return withTeamStaffRoles(withOauthConnected({
          ...p,
          eligibility: reg ? reg.eligibility : null,
          position_tag: reg ? reg.position_tag : p.position,
          cap_value: reg ? Number(reg.cap_value || p.cap_value || 0) : Number(p.cap_value || 0),
          team: p.team_id ? (map[p.team_id] || null) : null
        }, oauthConnections, aliases), teams, aliases);
      }),
      total: playersResult.count ?? players.length,
      limit,
      offset,
      has_more: limit ? offset + players.length < (playersResult.count || 0) : false
    });
  } catch (err) {
    apiError(res, err.statusCode || 500, err.code || 'PLAYERS_LOAD_FAILED', err.message);
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
// admin - combine stats for a renamed player without rewriting imported box scores
app.post('/api/admin/players/combine', async (req, res) => {
  const me = await requireAdmin(req, res, 'registry');
  if (!me) return;
  try {
    const canonical = displayUsername(req.body.canonical_username || req.body.current_username);
    const alias = displayUsername(req.body.alias_username || req.body.former_username);
    if (!canonical || !alias) return apiError(res, 400, 'PLAYER_ALIAS_FIELDS_REQUIRED', 'canonical_username and alias_username are required');
    if (usernameKey(canonical) === usernameKey(alias)) return apiError(res, 400, 'PLAYER_ALIAS_SELF_REFERENCE', 'Choose two different usernames');

    const { data, error } = await supabase
      .from('player_aliases')
      .upsert({
        canonical_username: canonical,
        alias_username: alias,
        note: req.body.note || 'Formerly known as'
      }, { onConflict: 'alias_key' })
      .select()
      .single();
    if (isMissingSupabaseTable(error, 'player_aliases')) {
      return apiError(res, 500, 'DB_MISSING_PLAYER_ALIASES', 'Database setup needed: run supabase/2026-06-22_player_aliases.sql in the Supabase SQL editor.');
    }
    if (error) throw error;
    res.json({ success: true, alias: data });
  } catch (err) {
    apiError(res, err.statusCode || 500, err.code || 'PLAYER_ALIAS_SAVE_FAILED', err.message);
  }
});

// admin/registry — rename a player's Roblox username; their old username becomes
// an alias so previously imported box scores/stats still roll up under the new name
app.post('/api/admin/players/rename', async (req, res) => {
  const me = await requireAdmin(req, res, 'registry');
  if (!me) return;
  try {
    const oldUsername = displayUsername(req.body.old_username || req.body.username);
    const newUsername = displayUsername(req.body.new_username);
    if (!oldUsername || !newUsername) return apiError(res, 400, 'PLAYER_RENAME_FIELDS_REQUIRED', 'old_username and new_username are required');
    if (usernameKey(oldUsername) === usernameKey(newUsername)) return apiError(res, 400, 'PLAYER_RENAME_SELF_REFERENCE', 'New username must be different');

    const { data: player } = await supabase.from('players').select('*').ilike('roblox_username', oldUsername).maybeSingle();
    if (!player) return apiError(res, 404, 'PLAYER_NOT_FOUND', 'No player found with that username');

    const { data: clash } = await supabase.from('players').select('id').ilike('roblox_username', newUsername).neq('id', player.id).maybeSingle();
    if (clash) return apiError(res, 409, 'PLAYER_RENAME_USERNAME_TAKEN', 'Another player already has that username');

    let update = { roblox_username: newUsername };
    const ru = await getRobloxUser(newUsername);
    if (ru) { update.roblox_username = ru.name; update.roblox_user_id = String(ru.id); update.avatar_url = await getRobloxAvatar(ru.id); }

    const { data: updated, error } = await supabase.from('players').update(update).eq('id', player.id).select().single();
    if (error) throw error;

    const { error: aliasError } = await supabase
      .from('player_aliases')
      .upsert({
        canonical_username: updated.roblox_username,
        alias_username: player.roblox_username,
        note: req.body.note || 'Formerly known as'
      }, { onConflict: 'alias_key' });
    if (aliasError && !isMissingSupabaseTable(aliasError, 'player_aliases')) throw aliasError;

    res.json({ success: true, player: updated });
  } catch (err) {
    apiError(res, err.statusCode || 500, err.code || 'PLAYER_RENAME_FAILED', err.message);
  }
});

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
  const me = await requireAdmin(req, res, ['teams', 'schedule']);
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
app.use('/api/coach', (_req, res) => {
  res.status(410).json({ error: 'Coaches Suite has been removed' });
});

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
    const { data: results } = await supabase.from('league_players').select('roblox_username, eligibility, cap_value, position_tag').ilike('roblox_username', `%${q}%`).limit(10);
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

function normalizeRosterSyncPlayers(body) {
  const out = [];
  const flat = Array.isArray(body.players) ? body.players : Array.isArray(body.roster) ? body.roster : [];
  flat.forEach((player, index) => out.push({ player, index, inheritedTeamName: null }));

  const grouped = Array.isArray(body.rosters) ? body.rosters : [];
  grouped.forEach((group, groupIndex) => {
    const teamName = group.team_name || group.teamName || group.team || group.name || '';
    const players = Array.isArray(group.players) ? group.players : Array.isArray(group.roster) ? group.roster : [];
    players.forEach((player, playerIndex) => {
      out.push({ player, index: `${groupIndex}.${playerIndex}`, inheritedTeamName: teamName });
    });
  });

  return out;
}

async function insertDiscordTransaction(row) {
  const { data, error } = await supabase.from('discord_transactions').insert(row).select().single();
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

async function handleDiscordRosterSyncWebhook(req, res) {
  try {
    const expectedSecret = process.env.OFL_WEBHOOK_SECRET;
    if (!expectedSecret) return apiError(res, 500, 'WEBHOOK_SECRET_NOT_CONFIGURED', 'OFL_WEBHOOK_SECRET is not configured on the API server');
    if (getWebhookSecret(req) !== expectedSecret) return apiError(res, 401, 'WEBHOOK_SECRET_INVALID', 'Invalid webhook secret');

    await ensureDiscordTransactionsTable();

    const body = req.body || {};
    const rows = normalizeRosterSyncPlayers(body);
    if (!rows.length) return apiError(res, 400, 'ROSTER_SYNC_EMPTY', 'Send players or rosters with at least one player');
    if (rows.length > 1000) return apiError(res, 413, 'ROSTER_SYNC_TOO_LARGE', 'Roster sync is limited to 1000 players per request');

    const eventTimestamp = parseWebhookTimestamp(body.timestamp || body.event_timestamp || body.eventTimestamp);
    if (eventTimestamp === null) return apiError(res, 400, 'ROSTER_SYNC_INVALID_TIMESTAMP', 'timestamp must be a valid date/time');

    const { data: teams, error: teamsError } = await supabase.from('teams').select('id,name');
    if (teamsError) throw teamsError;

    const normalized = [];
    const validationErrors = [];
    rows.forEach(({ player, index, inheritedTeamName }) => {
      const playerId = player.player_id ?? player.playerId ?? player.roblox_user_id ?? player.robloxUserId ?? null;
      const playerName = String(player.player_name || player.playerName || player.player || player.roblox_username || player.robloxUsername || player.username || '').trim();
      const teamName = String(player.team_name || player.teamName || player.team || inheritedTeamName || '').trim();
      const salary = parseSalary(player.salary ?? player.cap_value ?? player.capValue ?? player.cap);
      const clauses = normalizeClauses(player.clauses);

      if (!playerName && !playerId) validationErrors.push({ index, code: 'ROSTER_SYNC_PLAYER_REQUIRED', error: 'player_name or player_id is required' });
      if (!teamName) validationErrors.push({ index, code: 'ROSTER_SYNC_TEAM_REQUIRED', error: 'team_name is required' });
      if ((player.salary !== undefined || player.cap_value !== undefined || player.capValue !== undefined || player.cap !== undefined) && salary === null) {
        validationErrors.push({ index, code: 'ROSTER_SYNC_INVALID_SALARY', error: 'salary must be a number, or a value like 2.5M' });
      }

      const team = teamName ? findTeamByName(teams || [], teamName) : null;
      if (teamName && !team) validationErrors.push({ index, code: 'ROSTER_SYNC_TEAM_NOT_FOUND', error: `Could not match team_name "${teamName}"` });

      normalized.push({ index, playerId, playerName, teamName, team, salary, clauses, raw: player });
    });

    if (validationErrors.length) {
      return apiError(res, 400, 'ROSTER_SYNC_VALIDATION_FAILED', 'One or more roster rows could not be synced', validationErrors);
    }

    const replaceExisting = body.replace_existing === true || body.replaceExisting === true;
    const touchedTeamIds = [...new Set(normalized.map(row => row.team.id))];
    if (replaceExisting && touchedTeamIds.length) {
      const { error: clearError } = await supabase
        .from('players')
        .update({ team_id: null, position: null, cap_value: 0 })
        .in('team_id', touchedTeamIds);
      if (clearError) throw clearError;
    }

    const results = [];
    for (const row of normalized) {
      let status = 'processed';
      let errorMessage = null;
      let player = null;
      let move = null;
      try {
        player = await upsertWebhookPlayer({
          playerId: row.playerId,
          playerName: row.playerName,
          teamId: row.team.id,
          salary: row.salary || 0
        });
        const { data, error } = await supabase.from('roster_moves').insert({
          team_id: row.team.id,
          requesting_username: 'Discord Bot',
          requesting_role: 'bot',
          move_type: 'sign',
          player_username: player.roblox_username || row.playerName || null,
          details: { player_id: row.playerId, salary: row.salary || 0, clauses: row.clauses, source: 'discord_roster_sync', event_timestamp: eventTimestamp },
          status: 'logged'
        }).select().single();
        if (error) throw error;
        move = data;
      } catch (err) {
        status = 'failed';
        errorMessage = err.message || String(err);
      }

      const transaction = await insertDiscordTransaction({
        event_type: 'signed',
        player_id: row.playerId ? String(row.playerId) : null,
        player_name: row.playerName || player?.roblox_username || null,
        team_name: row.team.name,
        team_id: row.team.id,
        salary: row.salary,
        clauses: row.clauses,
        event_timestamp: eventTimestamp,
        raw_payload: { ...row.raw, source: 'discord_roster_sync', replace_existing: replaceExisting },
        roster_move_id: move?.id || null,
        status,
        error_message: errorMessage
      });

      results.push({
        index: row.index,
        success: status === 'processed',
        player_name: row.playerName || player?.roblox_username || null,
        player_id: row.playerId ? String(row.playerId) : null,
        team_name: row.team.name,
        transaction_id: transaction.id,
        player_id_internal: player?.id || null,
        roster_move_id: move?.id || null,
        error: errorMessage
      });
    }

    const failed = results.filter(r => !r.success);
    res.status(failed.length ? 207 : 200).json({
      success: failed.length === 0,
      synced: results.length - failed.length,
      failed: failed.length,
      replace_existing: replaceExisting,
      results
    });
  } catch (err) {
    console.error(err);
    apiError(res, err.statusCode || 500, err.code || 'ROSTER_SYNC_FAILED', err.message || String(err));
  }
}

app.post('/api/webhooks/discord/roster-sync', handleDiscordRosterSyncWebhook);
app.post('/api/webhooks/discord-roster-sync', handleDiscordRosterSyncWebhook);

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
    const gameIds = [...new Set((data || []).map(video => video.game_id).filter(Boolean))];
    let gameMap = {};
    if (gameIds.length) {
      const { data: games } = await supabase.from('games').select('*').in('id', gameIds);
      const { data: teams } = await supabase.from('teams').select('*');
      attachTeams(games || [], teams || []).forEach(game => { gameMap[game.id] = game; });
    }
    res.json({ videos: (data || []).map(v => ({ ...v, youtube_id: extractYouTubeId(v.youtube_url), game: v.game_id ? (gameMap[v.game_id] || null) : null })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// admin/media — completed games that can have one highlight connected
app.get('/api/media/highlight-games', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const includeVideoId = String(req.query.include_video_id || '').trim();
    const { data: videos, error: videosError } = await supabase
      .from('media_videos')
      .select('id, game_id')
      .not('game_id', 'is', null);
    if (isMissingSupabaseColumn(videosError, 'game_id')) {
      return apiError(res, 500, 'MEDIA_VIDEO_GAME_ID_MISSING', 'Run the media game highlights SQL migration before connecting highlights to games.');
    }
    if (videosError) throw videosError;

    const unavailable = new Set();
    (videos || []).forEach(video => {
      if (video.game_id && String(video.id) !== includeVideoId) unavailable.add(String(video.game_id));
    });

    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*')
      .not('home_score', 'is', null)
      .not('away_score', 'is', null)
      .order('game_date', { ascending: false });
    if (gamesError) throw gamesError;
    const { data: teams, error: teamsError } = await supabase.from('teams').select('*');
    if (teamsError) throw teamsError;

    const rows = attachTeams(games || [], teams || [])
      .filter(game => !unavailable.has(String(game.id)))
      .map(game => ({
        id: game.id,
        week: game.week,
        game_date: game.game_date,
        game_time: game.game_time,
        home_score: game.home_score,
        away_score: game.away_score,
        home_team: game.home_team,
        away_team: game.away_team
      }));
    res.json({ games: rows });
  } catch (err) {
    apiError(res, err.statusCode || 500, err.code || 'HIGHLIGHT_GAMES_LOAD_FAILED', err.message || String(err));
  }
});

// public — all articles (newest first)
app.get('/api/media/articles', async (req, res) => {
  try {
    const { data } = await supabase.from('media_articles').select('*').order('published_at', { ascending: false });
    res.json({ articles: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// admin/media — upload an article thumbnail into local media assets
app.post('/api/media/articles/thumbnail-upload', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const { filename, data_url, title } = req.body || {};
    const uploaded = await writeUploadedImage({
      folder: 'media/uploads',
      filename,
      dataUrl: data_url,
      fallbackName: title || filename || 'article-thumbnail',
      maxBytes: 5 * 1024 * 1024
    });
    res.json({ success: true, ...uploaded });
  } catch (err) {
    apiError(res, err.statusCode || 500, err.code || 'MEDIA_THUMBNAIL_UPLOAD_FAILED', err.message || String(err));
  }
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
    const { title, youtube_url, description, week_tag, game_id } = req.body;
    if (!title || !youtube_url) return res.status(400).json({ error: 'Title and YouTube URL required' });
    const youtube_id = extractYouTubeId(youtube_url);
    if (!youtube_id) return res.status(400).json({ error: 'Invalid YouTube URL' });
    const linkedGameId = (game_id || '').trim() || null;
    if (linkedGameId) {
      await assertHighlightGameAvailable(linkedGameId);
      await ensureBoxScoreForCompletedGame(linkedGameId);
    }
    const insertRow = {
      title: title.trim(), youtube_url: youtube_url.trim(),
      description: description?.trim() || null,
      week_tag: week_tag?.trim() || null,
      posted_by: me.roblox_username || null
    };
    if (linkedGameId) insertRow.game_id = linkedGameId;
    const { data, error } = await supabase.from('media_videos').insert(insertRow).select().single();
    if (isMissingSupabaseColumn(error, 'posted_by')) {
      return apiError(res, 500, 'MEDIA_POSTED_BY_MISSING', 'Run supabase/2026-06-20_media_game_highlights.sql to add media ownership columns, then retry.');
    }
    if (isMissingSupabaseColumn(error, 'game_id')) {
      return apiError(res, 500, 'MEDIA_VIDEO_GAME_ID_MISSING', 'Run supabase/2026-06-20_media_game_highlights.sql before connecting highlights to games.');
    }
    if (error) throw error;
    res.json({ success: true, video: { ...data, youtube_id } });
  } catch (err) { apiError(res, err.statusCode || 500, err.code || 'MEDIA_VIDEO_CREATE_FAILED', err.message || String(err)); }
});

// admin/media — update a highlight's game connection
app.put('/api/media/videos/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const { game_id } = req.body || {};
    const { data: video, error: videoError } = await supabase
      .from('media_videos')
      .select('id, posted_by')
      .eq('id', req.params.id)
      .maybeSingle();
    if (isMissingSupabaseColumn(videoError, 'posted_by')) {
      return apiError(res, 500, 'MEDIA_POSTED_BY_MISSING', 'Run supabase/2026-06-20_media_game_highlights.sql to add media ownership columns, then retry.');
    }
    if (videoError) throw videoError;
    if (!video) return apiError(res, 404, 'MEDIA_VIDEO_NOT_FOUND', 'Highlight not found');

    const { tabs, isSuper } = effectiveTabs(me);
    const isFullAdmin = isSuper || tabs.includes('access') || tabs.includes('teams');
    const isOwner = video.posted_by && video.posted_by.toLowerCase() === (me.roblox_username || '').toLowerCase();
    if (!isOwner && !isFullAdmin) return apiError(res, 403, 'MEDIA_VIDEO_UPDATE_FORBIDDEN', 'You can only edit your own highlights');

    const linkedGameId = (game_id || '').trim() || null;
    if (linkedGameId) {
      await assertHighlightGameAvailable(linkedGameId, req.params.id);
      await ensureBoxScoreForCompletedGame(linkedGameId);
    }

    const { data, error } = await supabase
      .from('media_videos')
      .update({ game_id: linkedGameId })
      .eq('id', req.params.id)
      .select()
      .single();
    if (isMissingSupabaseColumn(error, 'game_id')) {
      return apiError(res, 500, 'MEDIA_VIDEO_GAME_ID_MISSING', 'Run the media game highlights SQL migration before connecting highlights to games.');
    }
    if (error) throw error;
    res.json({ success: true, video: { ...data, youtube_id: extractYouTubeId(data.youtube_url) } });
  } catch (err) {
    apiError(res, err.statusCode || 500, err.code || 'MEDIA_VIDEO_UPDATE_FAILED', err.message || String(err));
  }
});

// admin/media — delete a video (own posts or full admin)
app.delete('/api/media/videos/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const { data: video, error: videoError } = await supabase.from('media_videos').select('posted_by').eq('id', req.params.id).maybeSingle();
    if (isMissingSupabaseColumn(videoError, 'posted_by')) {
      return apiError(res, 500, 'MEDIA_POSTED_BY_MISSING', 'Run supabase/2026-06-20_media_game_highlights.sql to add media ownership columns, then retry.');
    }
    if (videoError) throw videoError;
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
    if (isMissingSupabaseColumn(error, 'posted_by')) {
      return apiError(res, 500, 'MEDIA_POSTED_BY_MISSING', 'Run supabase/2026-06-20_media_game_highlights.sql to add media ownership columns, then retry.');
    }
    if (error) throw error;
    res.json({ success: true, article: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// admin/media — delete an article (own posts or full admin)
app.delete('/api/media/articles/:id', async (req, res) => {
  const me = await requireAdmin(req, res, 'media');
  if (!me) return;
  try {
    const { data: article, error: articleError } = await supabase.from('media_articles').select('posted_by, thumbnail_url, body').eq('id', req.params.id).maybeSingle();
    if (isMissingSupabaseColumn(articleError, 'posted_by')) {
      return apiError(res, 500, 'MEDIA_POSTED_BY_MISSING', 'Run supabase/2026-06-20_media_game_highlights.sql to add media ownership columns, then retry.');
    }
    if (articleError) throw articleError;
    if (!article) return res.status(404).json({ error: 'Not found' });
    const { tabs, isSuper } = effectiveTabs(me);
    const isFullAdmin = isSuper || tabs.includes('access') || tabs.includes('teams');
    const isOwner = article.posted_by && article.posted_by.toLowerCase() === (me.roblox_username || '').toLowerCase();
    if (!isOwner && !isFullAdmin) return res.status(403).json({ error: 'You can only delete your own posts' });
    await supabase.from('media_articles').delete().eq('id', req.params.id);
    const articleImages = new Set([article.thumbnail_url]);
    String(article.body || '').replace(/<img[^>]+src=["']([^"']+)["']/gi, (_match, src) => {
      articleImages.add(src);
      return '';
    });
    await Promise.all([...articleImages].map(url => removeUploadedImage(url)));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
//  CLEAN URL ROUTING
// ─────────────────────────────────────────────

app.use(express.static(CLIENT_DIR, {
  extensions: false,
  setHeaders(res, filePath) {
    const rel = path.relative(CLIENT_DIR, filePath).replace(/\\/g, '/');
    if (rel === 'index.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }
    if (rel.startsWith('assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
}));

app.get('/:page.html', (req, res) => {
  res.redirect(301, '/' + req.params.page.replace(/index$/, ''));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || path.extname(req.path)) return next();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(CLIENT_DIR, 'index.html'), (err) => { if (err) next(); });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OFL Network running on ${PORT}`));
