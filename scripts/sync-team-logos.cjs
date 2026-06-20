const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
const logosDir = path.join(root, 'public', 'logos');
const dryRun = process.argv.includes('--dry-run');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY are required in .env');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full;
  });
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mascotFromFile(file) {
  return path.basename(file, path.extname(file)).replace(/\s*\(.+?\)\s*$/, '');
}

function publicLogoPath(file) {
  const relative = path.relative(logosDir, file).split(path.sep);
  return `/logos/${relative.map(encodeURIComponent).join('/')}`;
}

function quality(file) {
  const base = path.basename(file);
  if (!/[()#]/.test(base)) return 0;
  if (/\(Primary\)/i.test(base)) return 0;
  if (/Primary/i.test(base)) return 1;
  return 2;
}

const logoFiles = walk(logosDir)
  .filter((file) => /\.(png|jpe?g|webp|gif|svg)$/i.test(file))
  .filter((file) => !/^league\./i.test(path.basename(file)))
  .sort((a, b) => quality(a) - quality(b) || a.localeCompare(b));

const logosByMascot = new Map();
for (const file of logoFiles) {
  const key = normalize(mascotFromFile(file));
  if (!logosByMascot.has(key)) logosByMascot.set(key, publicLogoPath(file));
}

function mascotFromTeam(name) {
  const parts = name.trim().split(/\s+/);
  const mascot = parts[parts.length - 1] || name;
  const aliases = {
    Sabres: 'Sabers'
  };
  return aliases[mascot] || mascot;
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id,name,logo_url')
    .order('name');

  if (error) throw error;

  const updates = [];
  const missing = [];

  for (const team of teams || []) {
    const mascot = mascotFromTeam(team.name || '');
    const logoUrl = logosByMascot.get(normalize(mascot));
    if (!logoUrl) {
      missing.push(team.name);
      continue;
    }
    if (team.logo_url !== logoUrl) {
      updates.push({ id: team.id, name: team.name, from: team.logo_url, to: logoUrl });
    }
  }

  console.log(`Teams checked: ${(teams || []).length}`);
  console.log(`Logo updates: ${updates.length}`);
  for (const update of updates) {
    console.log(`${update.name}: ${update.from || '(empty)'} -> ${update.to}`);
  }

  if (missing.length) {
    console.log(`Missing logo matches: ${missing.join(', ')}`);
  }

  if (dryRun || !updates.length) return;

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('teams')
      .update({ logo_url: update.to })
      .eq('id', update.id);
    if (updateError) throw updateError;
  }

  console.log('Database logo URLs synced.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
