const express = require('express');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.json());

let db;

async function initDb() {
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
}

function computeXp(minutes) {
  return Math.max(1, Math.round(20 + 15 * Math.sqrt(minutes / 10)));
}

// Serve static frontend
app.use('/caseboard', express.static(path.join(__dirname, 'public')));
app.use('/', express.static(path.join(__dirname, 'public')));

// API Routes
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
      ORDER BY u.username ASC
    `);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/caseboard/api/users', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Valid username required' });
  }
  const cleanName = username.trim();
  try {
    await db.run('INSERT OR IGNORE INTO users (username) VALUES (?)', cleanName);
    
    const user = await db.get(`
      SELECT 
        u.username,
        COALESCE(SUM(c.xp), 0) as xp,
        COUNT(c.id) as casesCount
      FROM users u
      LEFT JOIN cases c ON u.username = c.username
      WHERE u.username = ?
      GROUP BY u.username
    `, cleanName);

    res.json(user || { username: cleanName, xp: 0, casesCount: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/caseboard/api/users/:username', async (req, res) => {
  const username = req.params.username;
  try {
    const user = await db.get('SELECT username FROM users WHERE username = ?', username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cases = await db.all('SELECT id, minutes, xp, ts FROM cases WHERE username = ? ORDER BY ts DESC', username);
    const totalXp = cases.reduce((acc, item) => acc + item.xp, 0);

    res.json({
      username: user.username,
      xp: totalXp,
      casesCount: cases.length,
      cases: cases
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/caseboard/api/users/:username/cases', async (req, res) => {
  const username = req.params.username;
  const { minutes } = req.body;

  const parsedMins = parseInt(minutes, 10);
  if (isNaN(parsedMins) || parsedMins <= 0 || parsedMins > 1000) {
    return res.status(400).json({ error: 'Minutes must be a number between 1 and 1000' });
  }

  try {
    const user = await db.get('SELECT username FROM users WHERE username = ?', username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const xp = computeXp(parsedMins);
    await db.run('INSERT INTO cases (username, minutes, xp) VALUES (?, ?, ?)', username, parsedMins, xp);

    const cases = await db.all('SELECT id, minutes, xp, ts FROM cases WHERE username = ? ORDER BY ts DESC', username);
    const totalXp = cases.reduce((acc, item) => acc + item.xp, 0);

    res.json({
      username: user.username,
      xp: totalXp,
      casesCount: cases.length,
      cases: cases
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/caseboard/api/leaderboard/:period', async (req, res) => {
  const period = req.params.period;
  try {
    let query = '';
    if (period === 'month') {
      query = `
        SELECT 
          u.username,
          COALESCE(SUM(c.xp), 0) as xp,
          COUNT(c.id) as casesCount
        FROM users u
        LEFT JOIN cases c ON u.username = c.username 
          AND strftime('%Y-%m', c.ts) = strftime('%Y-%m', 'now')
        GROUP BY u.username
        ORDER BY xp DESC, casesCount DESC
      `;
    } else {
      query = `
        SELECT 
          u.username,
          COALESCE(SUM(c.xp), 0) as xp,
          COUNT(c.id) as casesCount
        FROM users u
        LEFT JOIN cases c ON u.username = c.username
        GROUP BY u.username
        ORDER BY xp DESC, casesCount DESC
      `;
    }
    const rows = await db.all(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

initDb().then(() => {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`CaseBoard listening on http://127.0.0.1:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});