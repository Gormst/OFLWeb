require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Supabase client (uses the secret/service key on the server)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, 'public');

// ─────────────────────────────────────────────
//  ACCOUNT CONNECTION  (Roblox bio verification)
// ─────────────────────────────────────────────

// Generate a short verification code like "OFL-7K2P"
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'OFL-' + s;
}

// Look up a Roblox user id from a username (public Roblox API)
async function getRobloxUser(username) {
  const r = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  const j = await r.json();
  if (!j.data || j.data.length === 0) return null;
  return j.data[0]; // { id, name, displayName }
}

// Read a Roblox user's profile description (public Roblox API)
async function getRobloxDescription(userId) {
  const r = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.description || '';
}

// Fetch a Roblox avatar thumbnail URL
async function getRobloxAvatar(userId) {
  try {
    const r = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`);
    const j = await r.json();
    return j.data && j.data[0] ? j.data[0].imageUrl : null;
  } catch { return null; }
}

// STEP 1 — start: given a Roblox username, return a code to paste in their bio
app.post('/api/connect/start', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Username required' });

    const robloxUser = await getRobloxUser(username);
    if (!robloxUser) return res.status(404).json({ error: 'Roblox user not found' });

    const code = makeCode();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    // store a pending code for this username
    await supabase.from('verification_codes').insert({
      roblox_username: robloxUser.name,
      code,
      expires_at: expires,
      used: false
    });

    res.json({ code, robloxUsername: robloxUser.name, robloxUserId: robloxUser.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong starting verification' });
  }
});

// STEP 2 — verify: check the Roblox bio contains the code, then create the account
app.post('/api/connect/verify', async (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    if (!username) return res.status(400).json({ error: 'Username required' });

    const robloxUser = await getRobloxUser(username);
    if (!robloxUser) return res.status(404).json({ error: 'Roblox user not found' });

    // find the most recent unused, unexpired code for this username
    const { data: codes } = await supabase
      .from('verification_codes')
      .select('*')
      .eq('roblox_username', robloxUser.name)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (!codes || codes.length === 0) {
      return res.status(400).json({ error: 'No active code — start over' });
    }
    const codeRow = codes[0];

    // check the Roblox profile description
    const description = await getRobloxDescription(robloxUser.id);
    if (!description || !description.includes(codeRow.code)) {
      return res.status(400).json({ error: 'Code not found in your Roblox bio yet' });
    }

    // matched — create an anonymous Supabase session for this user
    const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr) throw anonErr;
    const supabaseUserId = anon.user.id;

    const avatar = await getRobloxAvatar(robloxUser.id);

    // upsert the profile (one account per roblox user id)
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('roblox_user_id', String(robloxUser.id))
      .single();

    let profile;
    if (existing) {
      const { data } = await supabase.from('user_profiles')
        .update({ roblox_username: robloxUser.name, avatar_url: avatar, is_verified: true })
        .eq('roblox_user_id', String(robloxUser.id))
        .select().single();
      profile = data;
    } else {
      const { data } = await supabase.from('user_profiles')
        .insert({
          supabase_user_id: supabaseUserId,
          roblox_username: robloxUser.name,
          roblox_user_id: String(robloxUser.id),
          avatar_url: avatar,
          is_verified: true
        })
        .select().single();
      profile = data;
    }

    // mark the code used
    await supabase.from('verification_codes').update({ used: true }).eq('id', codeRow.id);

    res.json({
      success: true,
      session: anon.session,   // client stores this
      profile
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong during verification' });
  }
});

// ─────────────────────────────────────────────
//  CLEAN URL ROUTING  (no .html in the address)
// ─────────────────────────────────────────────

// serve static assets (css, js, images, logos) but NOT auto-serve .html
app.use(express.static(PUBLIC_DIR, { extensions: false }));

// "/" → index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// if someone hits /something.html directly, redirect to the clean version
app.get('/:page.html', (req, res) => {
  res.redirect(301, '/' + req.params.page.replace(/index$/, ''));
});

// "/schedule" → schedule.html, "/connect" → connect.html, etc.
app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  // ignore anything that already looks like a file (has a dot) or api routes
  if (page.includes('.') || page === 'api') return next();
  res.sendFile(path.join(PUBLIC_DIR, page + '.html'), (err) => {
    if (err) next(); // file doesn't exist → fall through to 404
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OFL Network running on ${PORT}`));