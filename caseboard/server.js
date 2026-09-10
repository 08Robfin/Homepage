const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = process.env.PORT || 3001;

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

function computeXp(minutes) {
  return Math.max(1, Math.round(20 + 15 * Math.sqrt(minutes / 10)));
}

// Serve static files
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/caseboard', express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// 1. Get all users
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

// 2. Get single user profile + cases
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

// 3. Create user
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

// 4. Log a case (Supports both endpoint formats)
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

// 5. Get leaderboard by period (month or lifetime)
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

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Caseboard listening on port ${PORT}`);
  });
});