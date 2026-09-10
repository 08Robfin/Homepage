const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite'); // ensure you have 'sqlite' or 'sqlite3' wrapper set up

const app = express();
const PORT = process.env.PORT || 3000;

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

// Serve static frontend
// Serve static files for both root path and /caseboard path
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/caseboard', express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// Get all users and total XP
app.get('/caseboard/api/users', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT 
        u.username, 
        COALESCE(SUM(c.xp), 0) as xp 
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

// Get case history for a specific user
app.get('/caseboard/api/cases/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const cases = await db.all(
      'SELECT * FROM cases WHERE username = ? ORDER BY ts DESC',
      [username]
    );
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log a new case
app.post('/caseboard/api/cases', async (req, res) => {
  try {
    const { username, minutes } = req.body;
    if (!username || !minutes) {
      return res.status(400).json({ error: 'Username and minutes are required.' });
    }

    // Ensure user exists
    await db.run(
      'INSERT OR IGNORE INTO users (username) VALUES (?)',
      [username]
    );

    const xp = computeXp(Number(minutes));
    const result = await db.run(
      'INSERT INTO cases (username, minutes, xp) VALUES (?, ?, ?)',
      [username, minutes, xp]
    );

    res.json({ id: result.lastID, username, minutes, xp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start DB and Express Server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
});