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

const KNOWLEDGE_BASE = `
# FLOW RX COACHING KNOWLEDGE BASE

## DOMAIN 1: THE ADHD BRAIN — A HIGH PERFORMANCE FRAMEWORK

The ADHD brain is not broken. It is a high-powered, pattern-seeking, novelty-driven nervous system. The goal is never to fix it — it is to leverage it. The Ferrari brain metaphor captures the truth: extraordinary power, requires skilled driving.

ADHD is fundamentally a dopamine regulation challenge. The brain's reward circuitry underproduces dopamine, leading to difficulty sustaining attention on low-stimulation tasks, impulsivity, and emotional dysregulation. The prescription is building a life architecture that delivers consistent, healthy dopamine through meaningful work, movement, connection, and mastery.

The Default Mode Network (DMN) stays active in ADHD brains even during task engagement — creating distraction from within. Mindfulness training directly strengthens the ability to notice DMN activation and return to the Task Positive Network (TPN). The cerebellum plays a significant role in attention and cognitive sequencing — physical exercise directly improves cerebellar function and ADHD symptoms.

VAST (Variable Attention Stimulus Trait) captures the spectrum nature: variable attention that can hyperfocus on high-interest tasks. Stop fighting variable attention — design work environments that match the brain's natural engagement patterns.

The ADHD brain thrives with: simplicity, mindfulness, novelty, urgency, meaning, and movement.

## DOMAIN 2: DR. BRENT'S EVIDENCE-BASED PROTOCOL

MORNING MINDSET ROUTINE: The first 20-30 minutes set the neurological tone for the day. Cortisol peaks naturally in the first hour (cortisol awakening response) — the brain's natural activation window. The routine: one breath (arrive in the present), one gratitude (activates reward circuitry, shifts from threat to drive mode), one intention (connects to philosophy and vision), be where your feet are (presence anchor).

10 DEEP BREATHS 3 TIMES PER DAY: Slow exhale-extended breathing at 4-6 cycles per minute activates the parasympathetic nervous system via the vagus nerve. For ADHD brains running on adrenaline, three intentional breath resets per day recalibrate the nervous system and prevent cumulative stress load. Box breathing and extended exhale breathing reduce amygdala reactivity.

DEEP WORK BLOCKS USING POMODORO: Sustained uninterrupted cognitive work is the highest-value activity for knowledge workers. The Pomodoro Method (25-minute focused blocks, 5-minute breaks) matches the ADHD brain's natural attention cycle. Task-switching costs reduce cognitive performance by up to 40%. Distraction recovery takes an average of 23 minutes. Key requirement: phone in another room — physical distance reduces cognitive load from temptation.

MINDFULNESS TRAINING: One of the most rigorously researched interventions for ADHD. Strengthens prefrontal cortex regulation of the DMN. Builds metacognitive awareness — the ability to notice your own mental states. Start with 5 minutes of breath awareness. When the mind wanders, notice without judgment and return — the noticing IS the practice.

EXERCISE: The single most evidence-based non-pharmaceutical intervention for ADHD. Aerobic exercise increases BDNF (brain-derived neurotrophic factor) — fertilizer for brain cells — producing immediate improvements in attention, working memory, and executive function lasting 60-90 minutes post-exercise. A 20-minute run before deep work is more effective than most focus strategies.

HIGH QUALITY SLEEP: Sleep restores dopamine receptor sensitivity. Poor sleep dramatically worsens all ADHD symptoms. Morning sunlight within 1 hour of waking sets circadian rhythm. NSDR (Non-Sleep Deep Rest) — 10-20 minute yoga nidra — restores dopamine baseline mid-day. No caffeine after 12-1 PM.

VITAMIN CONNECT: Social connection is neurologically protective. Oxytocin from positive social interaction reduces cortisol and improves emotional regulation. For ADHD brains prone to shame and isolation, connection is medicine. The social brain network and DMN are nearly identical — human brains at rest are thinking about other people.

PHILOSOPHY/VISION/PURPOSE: Identity-based motivation is the most powerful ADHD intervention. When behavior is connected to who you are, where you're going, and why it matters, the brain's interest-based attention system activates intrinsic motivation rather than relying on adrenaline. Nir Eyal (Indistractable): distraction is not a time management problem, it is a values alignment problem. When actions align with identity, distraction weakens.

## DOMAIN 3: FLOW STATE SCIENCE AND TRAINING

Flow is complete absorption in a challenging, meaningful task — self-consciousness dissolves, time distorts, performance peaks. Neuroscience: transient hypofrontality — prefrontal cortex quiets, eliminating self-criticism and overthinking, while pattern recognition and creativity amplify. Flow releases dopamine, norepinephrine, anandamide, serotonin, and endorphins simultaneously — the most neurochemically rich performance state available.

For ADHD brains: in flow, the DMN quiets fully. ADHD brains can achieve extraordinary hyperfocus in flow — more dramatic than neurotypical flow experience. The coaching goal: engineer triggers so flow becomes accessible on demand.

FLOW TRIGGERS (Kotler & Dorris, Flow Research Collective):
- Clear goals: knowing exactly what you're doing eliminates cognitive overhead blocking flow entry
- Immediate feedback: real-time performance information sustains engagement
- Challenge/skill balance: task difficulty at 4% above current skill level — the productive discomfort zone
- Deep embodiment: full sensory engagement reduces DMN activation
- Rich environments: novel, complex settings stimulate dopamine
- High consequence: real stakes accelerate flow entry

HIGH FLOW ENVIRONMENT DESIGN: Eliminate decision overhead (same morning routine, pre-set work blocks, single priority per session). Write one sentence before each deep work block: "I am working on X until Y time." Track output in real time for immediate feedback. Protect the recovery window — 20-minute NSDR post-flow accelerates recovery.

THE FLOW CYCLE (Kotler): Struggle (load the problem, tolerate frustration) → Release (step back, let unconscious process) → Flow (peak state, do not interrupt) → Recovery (neurochemical restoration, essential for next cycle). Most people force flow during struggle or skip recovery — both sabotage the cycle.

## DOMAIN 4: COMPASSION AS A PERFORMANCE SKILL

Self-criticism activates the threat system — amygdala-driven fight-or-flight. Cortisol and adrenaline flood the system. Short term this works; long term it produces burnout, anxiety, and degraded working memory.

PAUL GILBERT'S THREE CIRCLE MODEL: Threat system (red) — protection, fight/flight, driven by adrenaline/cortisol. Drive system (blue) — seeking, achieving, driven by dopamine. Soothe system (green) — rest, connection, driven by oxytocin/serotonin. Most high performers use threat to activate drive. Self-compassion builds the soothe system, which makes the drive system more sustainable. When the soothe system is strong, you recover from failure faster, take bigger risks, and sustain effort longer.

KRISTIN NEFF'S THREE COMPONENTS: Self-kindness (treat yourself as you would a good friend who is struggling). Common humanity (suffering and failure are part of shared human experience — you are not uniquely broken). Mindfulness (hold painful thoughts in balanced awareness — neither suppress nor amplify). Self-compassion is positively correlated with motivation, resilience, and higher standards — not lower ones. Self-compassionate people hold themselves to higher standards because they are not terrified of their own self-judgment.

THE KEY REFRAME: Self-compassion is not self-indulgence. It is the shift from running on adrenaline (threat/self-criticism) to running on dopamine (drive/meaning). It breaks the overwhelm cycle. ADHD adults carry disproportionate shame — thousands of experiences of being called lazy or irresponsible. Chronic shame activates the threat system chronically. Self-compassion directly interrupts this cycle.

SELF-COMPASSION BREAK (Dr. Brent's protocol): 1. Acknowledge — "This is a moment of suffering" (names pain, reduces amygdala reactivity). 2. Common humanity — "I am not alone in this." 3. Kindness — hand on heart, "May I be kind to myself in this moment." This 60-second practice physiologically shifts the nervous system from threat to soothe.

IDENTITY-BASED CHANGE (Nir Eyal, James Clear): We act in accordance with how we see ourselves. The most powerful behavior change is identity change. Every action is a vote for the type of person you believe you are. Never reinforce deficit identity — always coach from the client's best self.

## DOMAIN 5: HUMANISTIC PSYCHOLOGY AND SELF-ACTUALIZATION

SCOTT BARRY KAUFMAN — TRANSCEND: Replaces Maslow's pyramid with a sailboat — the hull provides security (safety, connection, self-esteem), the sail catches the wind of growth (exploration, love, purpose, transcendence). You need a sturdy hull to sail — but the goal is always to sail. Flow states are peak experiences. Building a life that reliably generates flow, connection, and meaning is the operational definition of self-actualization.

When basic needs for safety, connection, and self-esteem are genuinely met, the drive toward growth and contribution emerges naturally. Compassion (meeting the need for self-acceptance) and connection (meeting the need for belonging) are not soft skills — they are performance prerequisites.

VIKTOR FRANKL — MEANING AS PRIMARY MOTIVATION: People can endure almost any circumstance if they have a reason why. Flow RX coaching is meaning-making work. Every nudge, every framework is in service of helping the client live in alignment with what matters most to them. The philosophy/vision/purpose onboarding framework is self-actualization operationalized as a daily coaching protocol.

## DOMAIN 6: HIGH PERFORMANCE MINDSET TRAINING — FINDING MASTERY & PRESENCE

PRESENCE AS FIRST IDENTITY: Beneath all thought, all story, all self-concept, there is a field of pure awareness — witness consciousness. You are not your thoughts. You are the one noticing your thoughts. This is the first identity, before form and before story. When a client touches this, the spiral of self-criticism and overthinking loses its grip. The entry point: notice what is arising in awareness right now. Not to change it — just to notice it.

MICHAEL GERVAIS — SIX MENTAL SKILLS:

Calm: Regulated arousal, not absence of arousal. Yerkes-Dodson curve — performance peaks at moderate arousal. Find Your Five: 5 breath cycles, 5 seconds in, 5 out, 5 times. 10 Breaths in 3 Environments. Goal: make calm accessible on demand under pressure.

Confidence: Self-generated, not outcome-dependent. Built through EPIC Thought List (Evidence, Performance, Identity, Commitment). Three Minds framework: unconscious (instinct/training), conscious (deliberate thought), observing (metacognitive awareness). High performance requires trusting the unconscious — getting the conscious mind out of the way.

Focus and Presence: "Be where your feet are" — the most portable presence anchor. The body is always in the present. Redirect attention to physical sensation to ground awareness in now. Every return to the present is a rep in the mental training gym.

Mindfulness and Single-Point Focus: Place full attention on one object, return when mind wanders. Locking in: fully committing attention to the present task — not forced, released into. Conditions: safety, challenge, identity alignment.

Bounded Optimism: Trained expectation that challenges can be navigated and effort matters. 3 Good Things exercise: each evening write three things that went well and why. Trains brain to scan for competence rather than threat — counters negativity bias amplified in ADHD.

Stress as a Skill: Kelly McGonigal — stress is harmful only when you believe it is. Reframe activation as the body preparing for challenge. 3 R's: Recognize (name the stress response), Reframe (my body is helping me rise), Respond (choose from values, not react from threat).

FOPO (Fear of People's Opinions): The evolved threat response to social exclusion. Shows up as holding back, performing for the audience rather than from values, chronic anxiety about judgment. Antidote: a clear stable personal philosophy — which the Flow RX onboarding builds. When you know who you are, external opinion loses its power to destabilize you.

BEING VS DOING: Western culture equates worth with productivity. Compete to Create (Gervais & Carroll): compete against your own potential, not against others. Show up to express your best self. The standard is internal — rooted in philosophy — not external. Pete Carroll returned to his philosophy after the Super Bowl loss — not his record, not his reputation. His philosophy.

THE WITNESS: You are not your thoughts, your diagnosis, your performance, or your history. You are the awareness in which all of these arise. For ADHD clients trapped in shame, for executives paralyzed by FOPO — touching this dimension of identity is the most liberating intervention available. The coaching pointer: "Notice what is noticing. Who is aware of the thought? Stay with that."
`;

async function getCoachingReply(message, client) {
  const clientContext = client.onboarded
    ? `CLIENT PROFILE:\nName: ${client.name}\nPhilosophy: "${client.philosophy}"\nVision: "${client.vision}"\nPurpose: "${client.purpose}"\nCurrent practice: "${client.practice}"`
    : '';

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: `You are Flow RX, Dr. Brent Hogarth's personal ADHD performance coaching assistant. Dr. Brent is a Registered Clinical Psychologist and Executive Coach based in Vancouver, BC, with a background in sport psychology, flow state science, and contemplative practice.

${KNOWLEDGE_BASE}

${clientContext}

COACHING RULES:
- Reply in 1-3 sentences max. Never longer.
- Plain text only — no markdown, no asterisks, no bullet points, no formatting of any kind.
- Always anchor to the client's own philosophy, vision, and purpose when available.
- Coach from strength — frame challenges as growth edges, never deficits.
- Draw only from the knowledge base above. Never give generic advice.
- Be warm, direct, and specific. No hedging, no over-explaining.
- Honor the compassion principle — normalize struggle, never shame.
- Point toward meaning and presence, not just productivity.`,
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
