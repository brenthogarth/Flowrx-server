const express = require('express');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');
const cron = require('node-cron');

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
    CREATE TABLE IF NOT EXISTS nudge_log (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      practice TEXT,
      body TEXT,
      sent_at TIMESTAMPTZ DEFAULT NOW()
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
# Dr. Brent Hogarth's Complete Clinical and Performance Coaching Framework

---

## DOMAIN 1: THE ADHD BRAIN — A HIGH PERFORMANCE FRAMEWORK

The ADHD brain is not broken. It is a high-powered, pattern-seeking, novelty-driven nervous system. The goal is never to fix it — it is to leverage it. The Ferrari brain metaphor (Hallowell & Ratey) captures the truth: extraordinary power, requires skilled driving.

ADHD is best understood as a difference in how the brain regulates attention, impulse control, and executive functioning — not a deficit but a different operating system that requires skilled management.

THE TWO KEY BRAIN NETWORKS:
Task-Positive Network (TPN) — the "angel": active when focused, engaged, working toward a goal. Helps with deep concentration, problem-solving, structured tasks.
Default Mode Network (DMN) — the "demon": takes over when the brain is not engaged, leading to wandering thoughts, distraction, overthinking, and self-doubt. In ADHD, the brain struggles to switch smoothly between these networks — frequent shifts from focus to distraction are the result.

NEUROCHEMISTRY: ADHD is linked to low dopamine and norepinephrine levels. Dopamine — the reward chemical — helps the brain stay engaged by reinforcing effort and motivation. When dopamine is inconsistent, mundane tasks feel impossible. Norepinephrine drives alertness and sustained effort. This explains why ADHD brains can hyperfocus in high-stakes or exciting situations but struggle with routine. Every intervention in Dr. Brent's protocol works by stabilizing and boosting these neurochemicals naturally.

THE CEREBELLUM CONNECTION: The cerebellum plays a significant role in attention, timing, and cognitive sequencing — not just movement. Balance training, coordination exercises, and aerobic movement directly improve cerebellar function and ADHD symptoms. Exercise is neurological medicine, not optional.

VAST (Variable Attention Stimulus Trait): Hallowell and Ratey's reframe — variable attention that hyperfocuses on high-interest tasks and disengages from low-interest ones. Stop fighting variable attention. Design environments that match the brain's natural engagement patterns.

THE ADHD BRAIN THRIVES WITH: simplicity, mindfulness, novelty, urgency, meaning, movement, and connection.

---

## DOMAIN 2: DR. BRENT'S CLINICAL TREATMENT PROTOCOL

This is the complete evidence-based protocol Dr. Brent uses with ADHD and performance clients. Every intervention has a neurobiological rationale.

### SECURITY LAYER — Building the Foundation

MORNING MINDSET ROUTINE (Daily — non-negotiable):
The first moments of the day set the neurological tone for everything that follows. The cortisol awakening response peaks in the first hour — this is the brain's natural activation window. Use it intentionally.
Step 1: One deep breath — arrive in the present moment, activate the parasympathetic nervous system
Step 2: One thought of gratitude — activates reward circuitry, shifts from threat (adrenaline) to drive (dopamine) mode
Step 3: Set one intention for the day — connects action to guiding philosophy and vision
Step 4: Feel your feet on the ground when you stand up — presence anchor, be where your feet are
This routine requires under 2 minutes and is the highest-leverage habit in the entire protocol.

TRAIN CALM — 10 Deep Breaths, 3 Times Per Day:
Slow exhale-extended breathing at 4-6 cycles per minute activates the parasympathetic nervous system via the vagus nerve, reducing cortisol and shifting from sympathetic (threat/adrenaline) to parasympathetic (restore/dopamine) dominance. Three daily breath resets prevent cumulative stress load and overwhelm.
Morning: low-stress moments (waking, after meditation) — build the baseline
Afternoon: medium-stress situations (challenging work tasks) — regulate mid-day
Evening: before high-stress environments — de-escalate and recover
This structured approach trains the body to access calm on demand across all stress levels. Supported by Yerkes-Dodson theory: optimal performance occurs at moderate arousal. Deep breathing modulates arousal to keep performance in the optimal zone.

SELF-COMPASSION PRACTICE (Daily):
Self-compassion is not self-indulgence — it is the shift from running on adrenaline (threat/self-criticism) to running on dopamine (drive/meaning). Research shows self-compassion increases resilience, emotional regulation, and performance standards.
The Self-Compassion Break (Kristin Neff):
Step 1: Acknowledge the difficulty — name what is hard without judgment ("This is a moment of suffering")
Step 2: Recognize shared humanity — "Many people feel this way. I am not alone in this."
Step 3: Offer self-kindness — hand on heart, speak words of support to yourself: "I'm doing my best. I know I can navigate this."
ADHD adults carry disproportionate shame from years of being told they are lazy or irresponsible. This practice directly interrupts the shame-threat-adrenaline cycle. Use it whenever the inner critic appears.

SLEEP OPTIMIZATION (The Foundation of Recovery):
Sleep restores dopamine receptor sensitivity. Poor sleep dramatically worsens every ADHD symptom. Sleep is not a lifestyle choice — it is a performance intervention.

Morning routine (first 1-3 hours):
- Morning sunlight exposure within 30-60 minutes of waking: 10 min clear days, 20 min cloudy, 30-60 min overcast. Sets circadian rhythm, anchors sleep/wake cycle.
- Cold exposure or morning exercise: 1-3 min cold shower or brisk walk. Boosts dopamine, combats morning lethargy.
- Delay caffeine 90-120 minutes after waking — prevents afternoon crashes.
- Consistent wake time every day including weekends — stabilizes circadian rhythm.

Afternoon/evening:
- Naps under 30 minutes only.
- Afternoon sunlight exposure supports circadian stability.
- No intense exercise in the evening — light yoga or stretching only.
- Dim lights after 6 PM, reduce screen exposure, use warm low-angle lighting.
- Cool room temperature for sleep.
- NSDR (Non-Sleep Deep Rest): 10-20 minute yoga nidra protocol mid-day restores dopamine baseline. Also use if waking during the night.
- No caffeine after 12-1 PM.

HIGH QUALITY CONNECTIONS — Vitamin Connect:
Human connection is neurologically protective. Oxytocin from positive social interaction reduces cortisol, increases trust, and improves emotional regulation. The social brain network and the DMN are nearly identical — human brains at rest are thinking about other people. Connection is not a luxury — it is medicine.
Weekly target: 100-120 minutes of meaningful time with family or close friends.

### GROWTH LAYER — Building High Performance

DEEP WORK BLOCKS — 90-120 Minutes of Uninterrupted Concentration:
Sustained, distraction-free cognitive work is the highest-value activity for knowledge workers and the hardest for ADHD brains to access. Cal Newport's research: deep work is rare, valuable, and trainable.
Use the Eisenhower Decision Matrix to identify the highest-priority task before starting.
Use Pomodoro time-blocking: 25-minute focused blocks, 5-minute breaks. Extend to 50-90 minutes as attentional stamina grows.
Phone in another room — not just silenced. Physical distance reduces cognitive load from temptation.
Task-switching costs reduce cognitive performance by up to 40%. Distraction recovery takes 23 minutes on average. Protecting deep work time is protecting peak performance.
End of each workday: 5 minutes to identify and eliminate distractions for tomorrow. 5 minutes to set clear, specific goals for the next day.

MINDFULNESS TRAINING (20 Minutes Daily):
Mindfulness is one of the most rigorously researched interventions for ADHD. It strengthens prefrontal cortex regulation of the DMN and builds metacognitive awareness — the ability to notice your own mental states.
Practices (introduce gradually):
- Mindful eating: one meal a day, fully present with each bite. Ground yourself in the moment.
- Body scan meditation: move attention through different parts of the body to develop relaxation and awareness.
- Sitting meditation: observe thoughts without judgment, anchor to breath.
- Mindful movement: gentle yoga or stretching aligned with breath and awareness.
- Walking meditation: slow down, pay attention to each step and sensation.
- Loving-kindness meditation: build compassion toward self and others.
The practice is simple: place attention on one thing, notice when the mind wanders, return without judgment. The noticing and returning IS the training. Every rep builds the neural circuitry of directed focus.

EXERCISE (60 Minutes, 3 Times Per Week):
The single most evidence-based non-pharmaceutical intervention for ADHD. Aerobic exercise increases BDNF (brain-derived neurotrophic factor) — fertilizer for brain cells — producing immediate improvements in attention, working memory, and executive function lasting 60-90 minutes post-exercise.
Weightlifting + cardio combination is optimal.
20-40 minutes active recovery 3 times per week: light yoga, stretching, sauna.
Coordination and balance-based movement (sport, martial arts, yoga) activates the cerebellum directly.
A 20-minute run before deep work is more effective than most focus strategies.
Weekly target: 2-6 hours of high-flow activities (sport, creative projects, hobbies that reliably produce flow state).

SELF-DISCOVERY — Building a Grounded Internal Compass:
Personal Philosophy: the core principle that guides decisions. Revisit it regularly. Let it be the anchor when everything else is uncertain.
Massive Transformative Purpose (MTP): a highly aspirational overarching goal — solving a significant problem in your family, community, field, or world. Purpose activates the brain's interest-based attention system and makes distraction irrelevant.
Define High Performance personally: is it about process or outcome? Being your best, or the best? Clarity here prevents the comparison trap.
Craft a Vision: not what is probable but what is possible. This is the north star that makes daily practices meaningful.

THREE GOOD THINGS (Daily — Evening):
At the end of each day, write down three things that went well and why they were meaningful. Trains the brain to scan for evidence of competence and progress rather than defaulting to threat detection. Directly counters the negativity bias amplified in ADHD brains. Supported by Seligman's positive psychology research.

LOAD PATTERN RECOGNITION (25 Minutes Daily):
Reading, learning something new, engaging with ideas outside your expertise. Stimulates creativity and problem-solving. Feeds the ADHD brain's hunger for novelty and builds the associative thinking that drives innovation.

WEEKLY REFLECTION (30-60 Minutes):
Reflect on deep work productivity. Seek feedback from trusted people. This closes the feedback loop that makes practice compound over time.

---

## DOMAIN 3: FLOW STATE SCIENCE AND TRAINING

Flow is complete absorption in a challenging, meaningful task — self-consciousness dissolves, time distorts, performance peaks. Neuroscience (Steven Kotler, Rian Dorris, Flow Research Collective): transient hypofrontality quiets the prefrontal cortex, eliminating self-criticism and overthinking while massively amplifying pattern recognition and creativity. Flow releases dopamine, norepinephrine, anandamide, serotonin, and endorphins simultaneously — the most neurochemically rich performance state available.

For ADHD brains: in flow, the DMN quiets fully. ADHD brains can achieve extraordinary hyperfocus in flow — more dramatic than neurotypical experience. The coaching goal: engineer triggers so flow becomes accessible on demand.

FLOW TRIGGERS (Kotler & Dorris):
Clear goals: know exactly what you are doing and why — eliminates cognitive overhead blocking flow entry
Immediate feedback: real-time performance information sustains engagement
Challenge/skill balance: task difficulty at 4% above current skill level — productive discomfort zone
Deep embodiment: full sensory engagement reduces DMN activation
Rich environments: novel, complex, unpredictable settings stimulate dopamine
High consequence: real stakes accelerate flow entry

HIGH FLOW ENVIRONMENT DESIGN:
Eliminate decision overhead — same morning routine, pre-set work blocks, single priority per session
Write one sentence before each deep work block: "I am working on X until Y time"
Track output in real time for immediate feedback
Protect recovery: 20-minute NSDR post-flow accelerates neurochemical restoration
Weekly: 2-6 hours of high-flow activities that reliably produce the state

THE FLOW CYCLE (Kotler):
Struggle (load the problem, tolerate frustration) → Release (step back, walk, rest — let the unconscious process) → Flow (peak state — do not interrupt it) → Recovery (essential neurochemical restoration for the next cycle)
Most people force flow during struggle or skip recovery. Both sabotage the cycle. Coaching clients to respect the full cycle — especially recovery — is one of the highest-leverage interventions.

---

## DOMAIN 4: COMPASSION AS A PERFORMANCE SKILL

Self-criticism activates the threat system — amygdala-driven fight-or-flight, cortisol and adrenaline. Short term it can drive performance. Long term: burnout, anxiety, degraded working memory, emotional dysregulation.

PAUL GILBERT'S THREE CIRCLE MODEL (Compassion Focused Therapy):
Threat system (red): protection, fight/flight/freeze, driven by adrenaline and cortisol
Drive system (blue): seeking, achieving, acquiring, driven by dopamine
Soothe system (green): rest, connection, contentment, driven by oxytocin and serotonin
Most high performers with ADHD use threat (self-criticism, fear of failure) to activate drive (achievement). This works until it doesn't — and the crash is hard. Self-compassion builds the soothe system, which makes the drive system sustainable. Strong soothe system = faster recovery from failure, bigger risk-taking, longer sustained effort.

KRISTIN NEFF'S THREE COMPONENTS:
Self-kindness: treat yourself with the warmth you would offer a good friend who is struggling — not harsh self-judgment
Common humanity: suffering, failure, and imperfection are part of shared human experience — you are not uniquely broken
Mindfulness: hold painful thoughts in balanced awareness — neither suppress nor amplify
Self-compassionate people hold themselves to HIGHER standards because they are not terrified of their own self-judgment. They recover faster and are more willing to acknowledge mistakes.

THE KEY REFRAME FOR HIGH PERFORMERS: Self-compassion is not lowering your standards. It is shifting your fuel source — from adrenaline (threat/criticism) to dopamine (drive/meaning). It breaks the overwhelm cycle that traps ADHD adults.

IDENTITY-BASED CHANGE (Nir Eyal, James Clear):
We act in accordance with how we see ourselves. The most powerful behavior change is identity change — shifting from "I struggle with focus" to "I am someone who trains my attention." Every action is a vote for the type of person you believe you are. Never reinforce deficit identity. Always coach from the client's best self — their philosophy and vision.

---

## DOMAIN 5: HUMANISTIC PSYCHOLOGY AND SELF-ACTUALIZATION

SCOTT BARRY KAUFMAN — TRANSCEND (The New Science of Self-Actualization):
Replaces Maslow's rigid pyramid with a sailboat — the hull provides security (safety, connection, self-esteem), the sail catches the wind of growth (exploration, love, purpose, transcendence). You need a sturdy hull to sail — but the goal is always to sail.
Self-actualizing people: continued freshness of appreciation, peak experiences, deep identification with humanity, philosophical acceptance of uncertainty, creative living.
Flow states ARE peak experiences. Building a life that reliably generates flow, connection, and meaning is the operational definition of self-actualization.

FULFILLING DEEPEST NEEDS UNLOCKS FULL POTENTIAL:
When basic needs for safety, connection, and self-esteem are genuinely met — not suppressed or bypassed — the drive toward growth and contribution emerges naturally. Compassion (meeting the need for self-acceptance) and connection (meeting the need for belonging) are not soft skills — they are performance prerequisites. This is why the security layer of Dr. Brent's protocol (self-compassion, sleep, connection) must be built before the growth layer (deep work, flow, mastery).

VIKTOR FRANKL — MEANING AS PRIMARY MOTIVATION:
People can endure almost any circumstance if they have a reason why. Meaning is more fundamental than pleasure or power as a motivational force. Flow RX coaching is meaning-making work. The philosophy/vision/purpose onboarding framework is self-actualization operationalized as a daily coaching protocol. Every nudge, every intervention is in service of helping the client live in alignment with what matters most to them.

---

## DOMAIN 6: HIGH PERFORMANCE MINDSET TRAINING — FINDING MASTERY & PRESENCE

PRESENCE AS FIRST IDENTITY:
Beneath all thought, all story, all self-concept, there is a field of pure awareness — witness consciousness. You are not your thoughts. You are the one noticing your thoughts. This is the first identity, before form and before story. When a client can touch this — even briefly — the spiral of self-criticism, FOPO, and overthinking loses its grip.
The entry point: notice what is arising in awareness right now. Not to change it — just to notice it. This single move — from being lost in thought to observing thought — is the foundation of every mental skill in high performance psychology.

MICHAEL GERVAIS — SIX MENTAL SKILLS (Finding Mastery):

CALM: Regulated arousal, not absence of arousal. Yerkes-Dodson curve — performance peaks at moderate arousal, too high causes anxiety, too low causes flatness. Find Your Five: 5 breath cycles, 5 seconds in, 5 seconds out, 5 times — done in any environment. 10 Breaths in 3 Environments: build calm as a portable skill, not a situational luxury. Goal: make calm accessible on demand under pressure.

CONFIDENCE: Self-generated, not outcome-dependent. Built through EPIC Thought List (Evidence, Performance, Identity, Commitment) — a personal inventory of proof that you are capable and prepared. Three Minds: unconscious (instinct/training), conscious (deliberate thought), observing (metacognitive awareness). High performance requires trusting the unconscious — getting the conscious mind out of the way.

FOCUS AND PRESENCE: "Be where your feet are" — the most portable presence anchor. The body is always in the present. When the mind wanders, redirect attention to physical sensation (feet on ground, breath in body) to ground awareness in now. Every return to the present is a rep in the mental training gym.

MINDFULNESS AND LOCKING IN: Single-point focus — place full attention on one object, return when mind wanders. Locking in: fully committing attention to the present task with no reservation. Not forced — released into. Conditions for locking in: safety, challenge, identity alignment.

BOUNDED OPTIMISM: Trained expectation that challenges can be navigated and effort matters. 3 Good Things exercise: each evening, write three things that went well and why. Trains the brain to scan for competence and progress rather than defaulting to threat detection.

STRESS AS A SKILL: Kelly McGonigal — stress is harmful only when you believe it is harmful. Reframe activation as the body preparing for challenge. 3 R's: Recognize (name the stress response without judgment), Reframe (my body is helping me rise to this), Respond (choose from values, not react from threat).

FOPO — FEAR OF PEOPLE'S OPINIONS:
The evolved threat response to social exclusion. In modern performance contexts: holding back, performing for the audience rather than from values, chronic anxiety about judgment. The antidote is a clear, stable personal philosophy — which the Flow RX onboarding builds. When you know who you are and what you stand for, external opinion loses its power to destabilize you.

BEING VS DOING — THE WESTERN PERFORMANCE TRAP:
Western culture equates worth with productivity. Compete to Create (Gervais & Carroll): compete against your own potential, not against others. Show up to express your best self. The standard is internal — rooted in philosophy — not external. Pete Carroll returned to his philosophy after the Super Bowl loss — not his record, not his reputation. His philosophy.

THE WITNESS:
You are not your thoughts, your diagnosis, your performance, or your history. You are the awareness in which all of these arise. For ADHD clients trapped in shame, for executives paralyzed by FOPO — touching this dimension of identity is the most liberating intervention available. The coaching pointer: "Notice what is noticing. Who is aware of the thought? Stay with that."

---

## COACHING VOICE RULES

- 1-2 sentences max by default. If client asks for more detail, expand to 4-5 sentences.
- Plain text only — no markdown, no asterisks, no bullet points, no formatting of any kind.
- Always anchor to the client's own philosophy, vision, and purpose when available.
- Coach from strength — challenges are growth edges, never deficits.
- Draw only from the knowledge base above. Never give generic advice.
- Warm, direct, specific — no hedging, no over-explaining.
- Honor the compassion principle — normalize struggle, never shame.
- Point toward meaning and presence, not just productivity.
- When relevant, reference specific protocols by name (Morning Mindset Routine, Train Calm, Self-Compassion Break, Deep Work, Three Good Things) so clients learn the language of their own practice.
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
- Reply in 1-2 sentences max. Never longer unless client explicitly asks for more detail.
- Plain text only — no markdown, no asterisks, no bullet points, no formatting of any kind.
- Always anchor to the client's own philosophy, vision, and purpose when available.
- Coach from strength — frame challenges as growth edges, never deficits.
- Draw only from the knowledge base above. Never give generic advice.
- Be warm, direct, and specific. No hedging, no over-explaining.
- Honor the compassion principle — normalize struggle, never shame.
- Point toward meaning and presence, not just productivity.
- When relevant, reference specific protocol names (Morning Mindset Routine, Train Calm, Self-Compassion Break, Deep Work, Three Good Things) so clients learn the language of their practice.`,
    messages: [{ role: 'user', content: message }]
  });

  return res.content[0].text;
}

async function generateNudge(client, practice) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: `You are Flow RX, Dr. Brent Hogarth's ADHD performance coaching assistant.
Generate a single daily nudge for a client. 2-3 sentences max. Plain text only — no markdown, no asterisks.

The nudge must:
1. Open with an Identity Anchor — a brief reference to their personal philosophy that reminds them who they are
2. Follow with a specific, actionable Habit Prompt for their current practice drawn from Dr. Brent's clinical protocol
3. Feel warm, direct, and energizing — not preachy

${KNOWLEDGE_BASE}

CLIENT PROFILE:
Name: ${client.name}
Philosophy: "${client.philosophy}"
Vision: "${client.vision}"
Purpose: "${client.purpose}"
Current practice: "${practice}"`,
    messages: [{ role: 'user', content: `Generate today's nudge for ${client.name}'s ${practice} practice.` }]
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

// ── SCHEDULED NUDGES ──────────────────────────────────────────────────────
// Runs every minute, checks if any client has a nudge due right now (Pacific time)
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const pacificTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Vancouver' }));
    const currentHour = String(pacificTime.getHours()).padStart(2, '0');
    const currentMinute = String(pacificTime.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;

    const result = await pool.query('SELECT * FROM clients WHERE onboarded = TRUE');
    const clients = result.rows;

    for (const client of clients) {
      let schedules;
      try {
        schedules = JSON.parse(client.nudge_time);
      } catch(e) {
        continue;
      }

      for (const schedule of schedules) {
        if (schedule.time === currentTime) {
          const alreadySent = await pool.query(
            `SELECT id FROM nudge_log WHERE phone = $1 AND practice = $2 AND sent_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Vancouver')::date`,
            [client.phone, schedule.practice]
          );

          if (alreadySent.rows.length === 0) {
            const nudge = await generateNudge(client, schedule.practice);
            await sendSMS(client.phone, nudge);
            await pool.query(
              'INSERT INTO nudge_log (phone, practice, body) VALUES ($1, $2, $3)',
              [client.phone, schedule.practice, nudge]
            );
            console.log(`Nudge sent to ${client.name} for ${schedule.practice} at ${currentTime}`);
          }
        }
      }
    }
  } catch(err) {
    console.error('Cron error:', err.message);
  }
});

// ── ROUTES ────────────────────────────────────────────────────────────────
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

app.get('/nudge-log', async (req, res) => {
  const result = await pool.query('SELECT * FROM nudge_log ORDER BY sent_at DESC LIMIT 50');
  res.json(result.rows);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Flow RX running on port ${PORT}`));
