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

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize tables on startup
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

// Twilio + Anthropic clients
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Send SMS helper
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

// Onboarding questions
const ONBOARDING = [
  `Welcome to Flow RX — Create Change that Lasts Forever.\n\nI'm your personal performance coach, built by Dr. Brent Hogarth.\n\nFirst question: What is your name?`,
  `Great to meet you, {name}.\n\nEvery high performer operates from a personal philosophy — a core belief that guides how they live.\n\nWhat is yours? (Example: "Be present. Be relentless.")`,
  `Powerful.\n\nNow imagine everything went right. Your career, your health, your relationships — all of it.\n\nDescribe your vision. What does that life look like?`,
  `That's worth building toward.\n\nOne more: Why does it matter? What is your deeper purpose — the reason you keep going even when it's hard?`,
  `You now have a foundation most people never build.\n\nWhat is the ONE practice you most want to master right now? (Example: morning routine, deep work, exercise, sleep)`,
  `Perfect. Consistency is everything.\n\nWhat time each day should I send your nudge? (Example: 7:00 AM)`
];

const ONBOARDING_KEYS = ['name', 'philosophy', 'vision', 'purpose', 'practice', 'nudge_time'];

// Onboarding confirmation message
function confirmationMessage(client) {
  return `You're set, ${client.name}.\n\nHere's your foundation:\n📌 Philosophy: ${client.philosophy}\n🎯 Vision: ${client.vision}\n🔥 Purpose: ${client.purpose}\n⚡ Practice: ${client.practice}\n⏰ Daily nudge: ${client.nudge_time}\n\nYour first nudge arrives tomorrow. Let's build something that lasts.`;
}

// AI coaching reply
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

// Health check
app.get('/', (req, res) => res.send('Flow RX server is running'));

// Send nudge (from dashboard)
app.post('/send', async (req, res) => {
  const { to, message } = req.body;
  try {
    await sendSMS(to, message);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Incoming SMS handler
app.post('/incoming', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim();

  // Log inbound
  await pool.query(
    'INSERT INTO messages (phone, direction, body) VALUES ($1, $2, $3)',
    [from, 'inbound', body]
  );

  // Get or create client
  let result = await pool.query('SELECT * FROM clients WHERE phone = $1', [from]);
  let client = result.rows[0];

  if (!client) {
    await pool.query('INSERT INTO clients (phone, onboarding_step) VALUES ($1, 0)', [from]);
    result = await pool.query('SELECT * FROM clients WHERE phone = $1', [from]);
    client = result.rows[0];
  }

  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  // Onboarding flow
  if (!client.onboarded) {
    const step = client.onboarding_step;

    if (step < ONBOARDING_KEYS.length) {
      // Save the answer to the previous step
      if (step > 0) {
        const key = ONBOARDING_KEYS[step - 1];
        await pool.query(`UPDATE clients SET ${key} = $1 WHERE phone = $2`, [body, from]);
      }

      // Send next question (personalize step 1 with name if available)
      let question = ONBOARDING[step];
      if (step === 1) {
        const updated = await pool.query('SELECT name FROM clients WHERE phone = $1', [from]);
        question = question.replace('{name}', updated.rows[0]?.name || 'friend');
      }

      await pool.query('UPDATE clients SET onboarding_step = $1 WHERE phone = $2', [step + 1, from]);
      await sendSMS(from, question);

    } else {
      // Save final answer (nudge_time)
      await pool.query('UPDATE clients SET nudge_time = $1, onboarded = TRUE WHERE phone = $2', [body, from]);

      const updated = await pool.query('SELECT * FROM clients WHERE phone = $1', [from]);
      await sendSMS(from, confirmationMessage(updated.rows[0]));
    }

  } else {
    // Fully onboarded — AI coaching reply
    const reply = await getCoachingReply(body, client);
    await sendSMS(from, reply);
  }
});

// Get all clients (for dashboard)
app.get('/clients', async (req, res) => {
  const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
  res.json(result.rows);
});

// Get messages for a client (for dashboard)
app.get('/messages/:phone', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM messages WHERE phone = $1 ORDER BY created_at ASC',
    [decodeURIComponent(req.params.phone)]
  );
  res.json(result.rows);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Flow RX running on port ${PORT}`));
