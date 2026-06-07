require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check — handy for confirming the server is up
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', site: 'OFL Network' });
});

// Sample data route — swap 'your_table' for a real table once you build one
app.get('/api/data', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('your_table')
      .select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Clean URL routing — serve index.html as the fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OFL Network running on ${PORT}`));
