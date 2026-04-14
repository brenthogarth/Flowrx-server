const express = require('express');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      philosophy TEXT,
      vision TEXT,
      purpose TEXT,
      practice TEXT,
      nudge_time TEXT,
      onboarding_step INTEGER DEFAULT 0,
      onboarded BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      direction TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Database ready');
}
initDB();

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function sendSMS(to, body) {
  await twilioClient.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to
  });
  await pool.query(
    'INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)',
    [to, 'outbound', body]
  );
}

const ONBOARDING = [
  `Welcome to Flow RX — Create Change that Lasts Forever.\n\nI'm your personal performance coach, built by Dr. Brent Hogarth.\n\nFirst question: What is your name?`,
  `Great to meet you, {name}.\n\nEvery high performer operates from a personal philosophy — a core belief that guides how they live.\n\nWhat is yours? (Example: "Be present. Be relentless.")`,
  `Powerful.\n\nNow imagine everything went right. Your career, your health, your relationships — all of it.\n\nDescribe your vision. What does that life look like?`,
  `That's worth building toward.\n\nOne more: Why does it matter? What is your deeper purpose — the reason you keep going even when it's hard?`,
  `You now have a foundation most people never build.\n\nWhat is the ONE practice you most want to master right now? (Example: morning routine, deep work, exercise, sleep)`,
  `Perfect. Consistency is everything.\n\nWhat time each day should I send your nudge? (Example: 7:00 AM)\n\nIf you have two practices, you can give two times. (Example: 7:00 AM for morning routine, 12:00 PM for deep work)`
];

const ONBOARDING_KEYS = ['name', 'philosophy', 'vision', 'purpose', 'practice', 'nudge_time'];

function confirmationMessage(client) {
  let scheduleText = '';
  try {
    const schedules = JSON.parse(client.nudge_time);
    scheduleText = schedules.map(s => `⏰ ${s.practice}: ${s.time}`).join('\n');
  } catch(e) {
    scheduleText = `⏰ Daily nudge: ${client.nudge_time}`;
  }
  return `You're set, ${client.name}.\n\nHere's your foundation:\n📌 Philosophy: ${client.philosophy}\n🎯 Vision: ${client.vision}\n🔥 Purpose: ${client.purpose}\n⚡ Practice: ${client.practice}\n\n${scheduleText}\n\nYour first nudge arrives tomorrow. Let's build something that lasts.`;
}

async function getCoachingReply(message, client) {
  const context = client.onboarded
    ? `Client name: ${client.name}. Philosophy: "${client.philosophy}". Vision: "${client.vision}". Purpose: "${client.purpose}". Current practice: "${client.practice}".`
    : '';
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: `You are Flow RX, Dr. Brent Hogarth's ADHD performance coaching assistant.
Reply in 1-3 sentences max. Warm, direct, non-clinical. Plain text only — no markdown, no asterisks, no bullet points, no formatting of any kind.
${context}
Draw from: ADHD 2.0 (Ferrari brain, Vitamin Connect, right difficult, cerebellum connection), Dr. Brent's protocol (Morning Mindset Routine, flow lifestyle), Finding Mastery pillars.
Never give generic advice. Always anchor to the client's own philosophy and vision when available.`,
    messages: [{ role: 'user', content: message }]
  });
  return res.content[0].text;
}

async function parseNudgeSchedule(practiceText, nudgeTimeText) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: `Extract practice/time pairs from a client's nudge schedule answer.
Return ONLY a JSON array. Each item has "practice" and "time" (24hr format HH:MM, Pacific time).
Example: [{"practice":"morning mindset","time":"08:00"},{"practice":"deep work","time":"12:00"}]
If only one time is given, use the practice from their practice answer.
No markdown, no explanation, just the JSON array.`,
    messages: [{ role: 'user', content: `Practice: ${practiceText}\nSchedule answer: ${nudgeTimeText}` }]
  });
  try {
    const text = res.content[0].text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch(e) {
    return [{ practice: practiceText, time: '08:00' }];
  }
}

app.get('/', (req, res) => res.send('Flow RX server is running'));

app.post('/send', async (req, res) => {
  const { to, message } = req.body;
  try {
    await sendSMS(to, message);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/incoming', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim();

  await pool.query(
    'INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)',
    [from, 'inbound', body]
  );

  let result = await pool.query('SELECT * FROM clients WHERE phone = $1', [from]);
  let client = result.rows[0];

  if (!client) {
    await pool.query('INSERT INTO clients (phone, onboarding_step) VALUES ($1, 0)', [from]);
    result = await pool.query('SELECT * FROM clients WHERE phone = $1', [from]);
    client = result.rows[0];
  }

  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  if (!client.onboarded) {
    const step = client.onboarding_step;

    if (step < ONBOARDING_KEYS.length) {
      if (step > 0) {
        const key = ONBOARDING_KEYS[step - 1];
        await pool.query(`UPDATE clients SET ${key} = $1 WHERE phone = $2`, [body, from]);
      }

      let question = ONBOARDING[step];
      if (step === 1) {
        const updated = await pool.query('SELECT name FROM clients WHERE phone = $1', [from]);
        question = question.replace('{name}', updated.rows[0]?.name || 'friend');
      }

      await pool.query('UPDATE clients SET onboarding_step = $1 WHERE phone = $2', [step + 1, from]);
      await sendSMS(from, question);

    } else {
      const raw = await pool.query('SELECT * FROM clients WHERE phone = $1', [from]);
      const r = raw.rows[0];

      const condenseRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: `You are a performance coach reviewing client onboarding answers.
Your job is to preserve great answers exactly as written, and only condense answers that are rambling, unclear, or overly long.

Rules:
- If an answer is already clear, punchy, and under 2 sentences — keep it word for word.
- Only rewrite if the answer is rambling, repetitive, or longer than 2-3 sentences.
- Never add words, reframe meaning, or make it sound different if it doesn't need it.
- First person only. No markdown. No asterisks.
- Return ONLY a JSON object with keys: philosophy, vision, purpose, practice.`,
        messages: [{ role: 'user', content: `Philosophy: ${r.philosophy}\nVision: ${r.vision}\nPurpose: ${r.purpose}\nPractice: ${r.practice}` }]
      });

      let condensed;
      try {
        const text = condenseRes.content[0].text.replace(/```json|```/g, '').trim();
        condensed = JSON.parse(text);
      } catch(e) {
        condensed = { philosophy: r.philosophy, vision: r.vision, purpose: r.purpose, practice: r.practice };
      }

      const schedule = await parseNudgeSchedule(condensed.practice, body);
      const scheduleJSON = JSON.stringify(schedule);

      await pool.query(
        'UPDATE clients SET philosophy = $1, vision = $2, purpose = $3, practice = $4, nudge_time = $5, onboarded = TRUE WHERE phone = $6',
        [condensed.philosophy, condensed.vision, condensed.purpose, condensed.practice, scheduleJSON, from]
      );

      const updated = await pool.query('SELECT * FROM clients WHERE phone = $1', [from]);
      await sendSMS(from, confirmationMessage(updated.rows[0]));
    }

  } else {
    const reply = await getCoachingReply(body, client);
    await sendSMS(from, reply);
  }
});

app.get('/clients', async (req, res) => {
  const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
  res.json(result.rows);
});

app.get('/messages/:phone', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM messages WHERE phone = $1 ORDER BY created_at ASC',
    [decodeURIComponent(req.params.phone)]
  );
  res.json(result.rows);
});

app.get('/schedules', async (req, res) => {
  const result = await pool.query(
    'SELECT phone, name, philosophy, vision, purpose, practice, nudge_time FROM clients WHERE onboarded = TRUE'
  );
  res.json(result.rows);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Flow RX running on port ${PORT}`));
