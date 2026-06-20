require('dotenv').config();

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const STAT_KEYS = [
  'pass_yards', 'pass_td', 'pass_int', 'pass_att', 'pass_comp',
  'rush_att', 'rush_yards', 'rush_td',
  'targets', 'receptions', 'rec_yards', 'rec_td',
  'sacks_allowed', 'tfls_allowed', 'pressures_allowed', 'snaps_played', 'games_played',
  'pr_sacks', 'pr_pressures', 'pr_tfl', 'pr_safeties', 'pr_swats', 'pr_td',
  'cov_int', 'cov_td'
];

const SECTION_COL_MAP = {
  PASSING: { COMP: 'pass_comp', ATT: 'pass_att', YDS: 'pass_yards', TD: 'pass_td', INT: 'pass_int' },
  RUSHING: { RUSH: 'rush_att', YDS: 'rush_yards', TD: 'rush_td' },
  RECEIVING: { TRGT: 'targets', REC: 'receptions', YDS: 'rec_yards', TD: 'rec_td' },
  BLOCKING: { SNAP: 'snaps_played', 'TFL A': 'tfls_allowed', 'SCK A': 'sacks_allowed', 'PRES A': 'pressures_allowed' },
  DEFENSE: { PRESS: 'pr_pressures', TFL: 'pr_tfl', SACKS: 'pr_sacks', SAFETY: 'pr_safeties', SWATS: 'pr_swats', INT: 'cov_int', TD: 'cov_td' }
};
const KNOWN_SECTIONS = Object.keys(SECTION_COL_MAP);

function parseCSVText(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '') { rows.push([]); continue; }
    const cells = [];
    let cur = '';
    let inQ = false;
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

function rowEmpty(row, c0, c1) {
  for (let c = c0; c <= c1; c++) if ((row[c] || '').trim() !== '') return false;
  return true;
}

function normFloat(v) {
  if (v === undefined || v === null) return 0;
  const s = String(v).replace('%', '').trim();
  if (s === '' || s.toUpperCase() === 'X') return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseTeamBlock(rows, c0, c1, r0) {
  const players = {};
  const teamName = (rows[r0] && rows[r0][c0] || '').trim();
  let r = r0 + 1;

  function addStat(username, key, value) {
    if (!username) return;
    if (!players[username]) players[username] = {};
    players[username][key] = (players[username][key] || 0) + (normFloat(value) || 0);
  }

  while (r < rows.length) {
    const row = rows[r] || [];
    const label = (row[c0] || '').trim().toUpperCase();

    if (rowEmpty(row, c0, c1)) { r++; continue; }

    if (KNOWN_SECTIONS.includes(label)) {
      const colMap = SECTION_COL_MAP[label];
      const headerRow = rows[r + 1] || [];
      const idxToKey = {};
      for (let c = c0; c <= c1; c++) {
        const h = (headerRow[c] || '').trim().toUpperCase();
        if (colMap[h]) idxToKey[c] = colMap[h];
      }

      r += 2;
      while (r < rows.length) {
        const pr = rows[r] || [];
        if (rowEmpty(pr, c0, c1)) break;
        const nextLabel = (pr[c0] || '').trim().toUpperCase();
        if (KNOWN_SECTIONS.includes(nextLabel) || nextLabel === 'QB THROWAWAYS') break;
        const username = (pr[c0] || '').trim();
        if (username) {
          for (const [colIdx, key] of Object.entries(idxToKey)) addStat(username, key, pr[colIdx]);
        }
        r++;
      }
      continue;
    }

    r++;
  }

  return { teamName, players };
}

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

  const team1Col = filledCols[0].index;
  let team2Col = null;
  for (let c = team1Col + 1; c < firstRow.length; c++) {
    if ((firstRow[c] || '').trim() !== '') { team2Col = c; break; }
  }
  if (team2Col == null) return { team1: parseTeamBlock(rows, team1Col, firstRow.length - 1, r0), team2: null };
  return {
    team1: parseTeamBlock(rows, team1Col, team2Col - 1, r0),
    team2: parseTeamBlock(rows, team2Col, firstRow.length - 1, r0)
  };
}

function addDeltas(target, source) {
  for (const [username, stats] of Object.entries(source || {})) {
    const key = username.toLowerCase();
    if (!target[key]) target[key] = { username, stats: {} };
    for (const statKey of STAT_KEYS) {
      target[key].stats[statKey] = (target[key].stats[statKey] || 0) + (stats[statKey] || 0);
    }
  }
}

async function main() {
  const csvPath = process.argv.find(arg => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
  const apply = process.argv.includes('--apply');
  if (!csvPath) throw new Error('Usage: node scripts/revert-broken-stats-import.cjs <csv-path> [--apply]');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required');

  const csv = fs.readFileSync(csvPath, 'utf8');
  const box = parseBoxScoreCSV(csv);
  if (!box?.team1 && !box?.team2) throw new Error('Could not parse box score CSV');

  const deltas = {};
  addDeltas(deltas, box.team1?.players);
  addDeltas(deltas, box.team2?.players);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { data: players, error } = await supabase.from('players').select('*');
  if (error) throw error;

  const byUsername = {};
  for (const player of players || []) byUsername[String(player.roblox_username || '').toLowerCase()] = player;

  const updates = [];
  const missing = [];
  for (const delta of Object.values(deltas)) {
    const player = byUsername[delta.username.toLowerCase()];
    if (!player) {
      missing.push(delta.username);
      continue;
    }
    const update = {};
    let changed = false;
    for (const statKey of STAT_KEYS) {
      const next = Math.max(0, (player[statKey] || 0) - (delta.stats[statKey] || 0));
      update[statKey] = next;
      if (next !== (player[statKey] || 0)) changed = true;
    }
    if (changed) updates.push({ id: player.id, username: player.roblox_username, update });
  }

  console.log(`Parsed teams: ${box.team1?.teamName || 'Team 1'} vs ${box.team2?.teamName || 'Team 2'}`);
  console.log(`Players in CSV: ${Object.keys(deltas).length}`);
  console.log(`Matched players with stat changes: ${updates.length}`);
  if (missing.length) console.log(`Missing players: ${missing.join(', ')}`);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to subtract these stats.');
    return;
  }

  for (const row of updates) {
    const { error: updateError } = await supabase.from('players').update(row.update).eq('id', row.id);
    if (updateError) throw updateError;
    console.log(`Updated ${row.username}`);
  }
  console.log(`Done. Reverted stats for ${updates.length} players.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
