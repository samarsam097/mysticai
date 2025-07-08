const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const upload = multer();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const palmDir = path.join(__dirname, 'palm_images');
if (!fs.existsSync(palmDir)) fs.mkdirSync(palmDir, { recursive: true });
app.use('/palm_images', express.static(palmDir));

const db = new sqlite3.Database(path.join(__dirname, 'users.db'));
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    dob TEXT,
    palm_path TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    question TEXT,
    answer TEXT,
    type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function getUserId(username, cb) {
  db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
    cb(err || !row ? null : row.id);
  });
}

function calculateLifePath(dob) {
  let digits = dob.replace(/\D/g, '').split('').map(Number);
  while (digits.reduce((a, b) => a + b) > 9) {
    digits = digits.reduce((a, b) => a + b).toString().split('').map(Number);
  }
  return digits.reduce((a, b) => a + b);
}

function calculateMoolank(dob) {
  let day = parseInt(dob.split('-')[2], 10);
  while (day > 9) day = day.toString().split('').map(Number).reduce((a, b) => a + b);
  return day;
}

// Register
app.post('/register', (req, res) => {
  const { username, dob } = req.body;
  db.run('INSERT INTO users (username, dob) VALUES (?, ?)', [username, dob], function(err) {
    if (err) return res.status(409).json({ error: 'Username already exists' });
    res.json({ message: 'User registered' });
  });
});

// Login
app.post('/login', (req, res) => {
  const { username, dob } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND dob = ?', [username, dob], (err, row) => {
    if (row) res.json({ message: 'Login successful', palm_path: row.palm_path || null });
    else res.status(401).json({ error: 'Invalid credentials' });
  });
});

// Ask: Palmistry
app.post('/ask-palm', upload.single('image'), (req, res) => {
  const { username, question, dob } = req.body;
  getUserId(username, userId => {
    if (!userId) return res.status(404).json({ error: 'User not found' });

    const lifePath = calculateLifePath(dob);
    const moolank = calculateMoolank(dob);

    function askAI(buffer) {
      const b64 = buffer.toString('base64');
     const prompt = `
You are MysticAI, a master palm reader and spiritual analyst. You will examine this user's palm image and interpret its lines and features precisely.

🧠 About the user:
- Name: ${username}
- DOB: ${dob}
- Life Path Number: ${lifePath}
- Moolank: ${moolank}



🎯 Question:
"${question}"

🔮 Your task (in 250 words or less):
1. Closely analyze palm lines (heart line, head line, life line) and mounts (Jupiter, Saturn, etc.) visible from the image.
2. Use this palm analysis to directly answer the user’s specific question.
3. Clearly explain one insight or prediction that emerges from this image.
4. Offer ONE personalized advice to improve or enhance the outcome.
5. Connect the insights briefly with the user’s numerology (Life Path + Moolank).
6. Stay FOCUSED only on what is asked – no generic comments or spiritual fluff.

Be practical, insightful, and confident. Do not give vague or contradicting statements. Be consistent across identical questions.
<img src="data:image/png;base64,${b64}" />`


      axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
        model: 'mistralai/mistral-medium-3-instruct',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
        temperature: 0.2,
        top_p: 0.75
      }, {
        headers: {
          'Authorization': 'Bearer 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',
          'Content-Type': 'application/json'
        }
      }).then(apiRes => {
        const answer = apiRes.data.choices[0].message.content;
        db.run('INSERT INTO history (user_id, question, answer, type) VALUES (?, ?, ?, ?)', [userId, question, answer, 'palm'], () => {
          res.json({ answer });
        });
      }).catch(err => {
        console.error(err);
        res.status(500).json({ error: 'AI error' });
      });
    }

    if (req.file) {
      const filename = `${username}_${Date.now()}.jpg`;
      const savePath = path.join(palmDir, filename);
      fs.writeFileSync(savePath, req.file.buffer);
      db.run('UPDATE users SET palm_path = ? WHERE id = ?', [filename, userId]);
      askAI(req.file.buffer);
    } else {
      db.get('SELECT palm_path FROM users WHERE id = ?', [userId], (e, row) => {
        if (!row?.palm_path) return res.status(400).json({ error: 'Upload required' });
        const buffer = fs.readFileSync(path.join(palmDir, row.palm_path));
        askAI(buffer);
      });
    }
  });
});

// Ask: Tarot
app.post('/ask-tarot', (req, res) => {
  const { username, question, tarotCards } = req.body;
  getUserId(username, userId => {
    if (!userId) return res.status(404).json({ error: 'User not found' });

    const prompt = `You are MysticAI, a tarot expert.\nUser: ${username}\nCards: ${tarotCards}\nQuestion: \"${question}\"\n\nAnswer ONLY what is asked. Then one clear advice. Then explain why (based on card energy).\nWord limit: 250 words max.`;

    axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
      model: 'mistralai/mistral-medium-3-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.6,
      top_p: 0.95
    }, {
      headers: {
        'Authorization': 'Bearer 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',
        'Content-Type': 'application/json'
      }
    }).then(apiRes => {
      const answer = apiRes.data.choices[0].message.content;
      db.run('INSERT INTO history (user_id, question, answer, type) VALUES (?, ?, ?, ?)', [userId, question, answer, 'tarot'], () => {
        res.json({ answer });
      });
    }).catch(err => {
      console.error(err);
      res.status(500).json({ error: 'AI error' });
    });
  });
});

// Ask: Numerology
app.post('/ask-numerology', (req, res) => {
  const { username, dob, question } = req.body;
  getUserId(username, userId => {
    if (!userId) return res.status(404).json({ error: 'User not found' });

    const lifePath = calculateLifePath(dob);
    const moolank = calculateMoolank(dob);
    const prompt = `You are MysticAI, a numerology expert.\nUser: ${username} (DOB: ${dob})\nLife Path: ${lifePath}, Moolank: ${moolank}\nQuestion: \"${question}\"\n\nAnswer ONLY what is asked. Then one clear advice. Then explain why (based on numbers).\nWord limit: 250 words max.`;

    axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
      model: 'mistralai/mistral-medium-3-instruct',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.6,
      top_p: 0.95
    }, {
      headers: {
        'Authorization': 'Bearer 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',
        'Content-Type': 'application/json'
      }
    }).then(apiRes => {
      const answer = apiRes.data.choices[0].message.content;
      db.run('INSERT INTO history (user_id, question, answer, type) VALUES (?, ?, ?, ?)', [userId, question, answer, 'numerology'], () => {
        res.json({ answer });
      });
    }).catch(err => {
      console.error(err);
      res.status(500).json({ error: 'AI error' });
    });
  });
});

// History
app.get('/history/:username', (req, res) => {
  getUserId(req.params.username, userId => {
    if (!userId) return res.status(404).json({ error: 'User not found' });
    db.all('SELECT question, answer, type, timestamp FROM history WHERE user_id = ? ORDER BY timestamp DESC', [userId], (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(rows);
    });
  });
});

app.listen(3000, () => console.log('✅ Server running on http://localhost:3000'));
