const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_PASSWORD = '1234';

app.use(express.json());

let db;

async function initDb() {
  try {
    db = await open({
      filename: path.join(__dirname, 'caseboard.db'),
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        minutes INTEGER,
        xp INTEGER,
        ts DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(username) REFERENCES users(username)
      );
    `);
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
}

// Gives high weight to logging cases (150 base XP per case) + time scaling
function computeXp(minutes) {
  return Math.max(1, Math.round(150 + 12 * Math.sqrt(minutes)));
}

// Middleware to verify admin password
function requireAdmin(req, res, next) {
  const authHeader = req.headers['x-admin-password'] || req.headers['authorization'];
  if (authHeader !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Ugyldig admin-passord.' });
  }
  next();
}

// Serve static app
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/caseboard', express.static(path.join(__dirname, 'public')));

// Admin UI route
app.get('/caseboard/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- API Routes ---

app.get('/caseboard/api/users', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT 
        u.username,
        COALESCE(SUM(c.xp), 0) as xp,
        COUNT(c.id) as casesCount
      FROM users u
      LEFT JOIN cases c ON u.username = c.username
      GROUP BY u.username
      ORDER BY xp DESC
    `);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/caseboard/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const cases = await db.all(
      'SELECT id, minutes, xp, ts FROM cases WHERE username = ? ORDER BY ts DESC',
      [username]
    );
    const xp = cases.reduce((sum, c) => sum + Number(c.xp || 0), 0);
    res.json({ username: user.username, xp, cases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/caseboard/api/users', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required.' });
    }
    const cleanName = username.trim();
    await db.run('INSERT OR IGNORE INTO users (username) VALUES (?)', [cleanName]);
    res.json({ username: cleanName, xp: 0, cases: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/caseboard/api/users/:username/cases', '/caseboard/api/cases'], async (req, res) => {
  try {
    const username = req.params.username || req.body.username;
    const minutes = Number(req.body.minutes);

    if (!username || !minutes || minutes <= 0) {
      return res.status(400).json({ error: 'Valid username and minutes are required.' });
    }

    await db.run('INSERT OR IGNORE INTO users (username) VALUES (?)', [username]);

    const xp = computeXp(minutes);
    await db.run(
      'INSERT INTO cases (username, minutes, xp) VALUES (?, ?, ?)',
      [username, minutes, xp]
    );

    const cases = await db.all(
      'SELECT id, minutes, xp, ts FROM cases WHERE username = ? ORDER BY ts DESC',
      [username]
    );
    const totalXp = cases.reduce((sum, c) => sum + Number(c.xp || 0), 0);

    res.json({ username, xp: totalXp, cases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/caseboard/api/leaderboard/:period', async (req, res) => {
  try {
    const { period } = req.params;
    let dateFilter = '';

    if (period === 'month' || period === 'monthly') {
      dateFilter = "WHERE strftime('%Y-%m', c.ts) = strftime('%Y-%m', 'now')";
    }

    const leaderboard = await db.all(`
      SELECT 
        u.username,
        COALESCE(SUM(c.xp), 0) as xp
      FROM users u
      LEFT JOIN cases c ON u.username = c.username ${dateFilter}
      GROUP BY u.username
      ORDER BY xp DESC
    `);
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin API Endpoints ---

app.delete('/caseboard/api/admin/users/:username', requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    await db.run('DELETE FROM cases WHERE username = ?', [username]);
    await db.run('DELETE FROM users WHERE username = ?', [username]);
    res.json({ success: true, message: `Bruker ${username} og alle saker ble slettet.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/caseboard/api/admin/cases/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM cases WHERE id = ?', [id]);
    res.json({ success: true, message: `Sak #${id} slettet.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Caseboard listening on port ${PORT}`);
  });
});