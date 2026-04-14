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
  `Perfect. Consistency is everything.\n\nWhat time each day should I send your nudge? (Example: 7:00 AM)\n\nIf you have two practices, you can give two times. (Example: 7:00 AM for morning routine, 12:00 PM for deep work)`
];

const ONBOARDING_KEYS = ['name', 'philosophy', 'vision', 'purpose', 'practice', 'nudge_time'];

// Onboarding confirmation message
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

// Parse nudge schedule from client's free-text answer
async function parseNudgeSchedule(practiceText,
