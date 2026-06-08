require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, 'public');

// Permanent superuser — always has admin access
const SUPERUSER = 'famouskai12';

// All admin tabs that can be granted
const ALL_ADMIN_TABS = ['access', 'teams', 'schedule'];

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

// Resolve the requesting user from the Bearer token → their profile
async function getRequester(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Prefer the stable Roblox id stored in user metadata (survives re-connects)
  const robloxId = user.user_metadata && user.user_metadata.roblox_user_id;
  if (robloxId) {
    const { data: byRoblox } = await supabase
      .from('user_profiles').select('*')
      .eq('roblox_user_id', String(robloxId)).single();
    if (byRoblox) return byRoblox;
  }

  // Fallback: match on supabase_user_id (older sessions)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('supabase_user_id', user.id)
    .single();
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
      .eq('roblox_username', robloxUser.name).eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1);
    if (!codes || codes.length === 0) return res.status(400).json({ error: 'No active code — start over' });
    const codeRow = codes[0];

    const description = await getRobloxDescription(robloxUser.id);
    if (!description || !description.includes(codeRow.code)) {
      return res.status(400).json({ error: 'Code not found in your Roblox bio yet' });
    }

    const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously({
      options: { data: { roblox_user_id: String(robloxUser.id), roblox_username: robloxUser.name } }
    });
    if (anonErr) throw anonErr;
    const supabaseUserId = anon.user.id;
    const avatar = await getRobloxAvatar(robloxUser.id);

    const { data: existing } = await supabase
      .from('user_profiles').select('*')
      .eq('roblox_user_id', String(robloxUser.id)).single();

    let profile;
    if (existing) {
      const { data } = await supabase.from('user_profiles')
        .update({ supabase_user_id: supabaseUserId, roblox_username: robloxUser.name, avatar_url: avatar, is_verified: true })
        .eq('roblox_user_id', String(robloxUser.id)).select().single();
      profile = data;
    } else {
      const { data } = await supabase.from('user_profiles')
        .insert({
          supabase_user_id: supabaseUserId,
          roblox_username: robloxUser.name,
          roblox_user_id: String(robloxUser.id),
          avatar_url: avatar, is_verified: true
        }).select().single();
      profile = data;
    }

    await supabase.from('verification_codes').update({ used: true }).eq('id', codeRow.id);

    // include admin info so the header can show the Admin button
    const { tabs, isAdmin } = effectiveTabs(profile);
    res.json({ success: true, session: anon.session, profile: { ...profile, admin_tabs: tabs, is_admin: isAdmin } });
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

// refresh an expired session using the stored refresh token
app.post('/api/session/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'No refresh token' });
    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error || !data.session) return res.status(401).json({ error: 'Refresh failed' });
    res.json({ session: data.session });
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
app.get('/api/teams', async (req, res) => {
  try {
    const { data } = await supabase
      .from('teams').select('*').order('name');
    res.json({ teams: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// admin — create a team
app.post('/api/admin/teams', async (req, res) => {
  const me = await requireAdmin(req, res, 'teams');
  if (!me) return;
  try {
    const { name, abbreviation, primary_color, secondary_color, logo_url, location, founded, head_coach, director_of_ops, franchise_owner } = req.body;
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
      franchise_owner: (franchise_owner || '').trim() || null
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
    const { name, abbreviation, primary_color, secondary_color, logo_url, location, founded, head_coach, director_of_ops, franchise_owner } = req.body;
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
      franchise_owner: (franchise_owner || '').trim() || null
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
      .order('week', { ascending: true })
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
    const { week, game_date, game_time, home_team_id, away_team_id } = req.body;
    if (!home_team_id || !away_team_id) return res.status(400).json({ error: 'Both teams are required' });
    if (home_team_id === away_team_id) return res.status(400).json({ error: 'Home and away teams must differ' });
    const { data, error } = await supabase.from('games').insert({
      week: week ? parseInt(week, 10) : null,
      game_date: game_date || null,
      game_time: (game_time || '').trim() || null,
      home_team_id, away_team_id
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
    const { week, game_date, game_time, home_team_id, away_team_id } = req.body;
    if (!home_team_id || !away_team_id) return res.status(400).json({ error: 'Both teams are required' });
    if (home_team_id === away_team_id) return res.status(400).json({ error: 'Home and away teams must differ' });
    const { data, error } = await supabase.from('games').update({
      week: week ? parseInt(week, 10) : null,
      game_date: game_date || null,
      game_time: (game_time || '').trim() || null,
      home_team_id, away_team_id
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
//  CLEAN URL ROUTING
// ─────────────────────────────────────────────

app.use(express.static(PUBLIC_DIR, { extensions: false }));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

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