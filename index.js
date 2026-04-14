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

app.get('/dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Flow RX — Command Centre</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--green:#253B1E;--red:#E3482E;--black:#12130C;--gold:#8f7c65;--cream:#e4e2d4;--dim:rgba(228,226,212,0.55);--border:rgba(228,226,212,0.12);--border2:rgba(228,226,212,0.22);--card:rgba(255,255,255,0.03);--card2:rgba(255,255,255,0.06);}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'DM Sans',sans-serif;background:var(--black);color:var(--cream);min-height:100vh;overflow-x:hidden;}
  #login-screen{position:fixed;inset:0;background:var(--black);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1000;}
  .login-logo{font-size:13px;font-family:'DM Mono',monospace;letter-spacing:.25em;color:var(--gold);text-transform:uppercase;margin-bottom:8px;}
  .login-title{font-size:clamp(52px,8vw,88px);font-weight:300;letter-spacing:-.03em;line-height:1;color:var(--cream);margin-bottom:6px;}
  .login-title span{font-style:italic;color:var(--red);}
  .login-sub{font-size:13px;color:var(--dim);font-family:'DM Mono',monospace;letter-spacing:.12em;margin-bottom:48px;}
  .login-box{display:flex;border:1px solid var(--border2);background:var(--card);}
  .login-box input{background:transparent;border:none;padding:14px 20px;font-family:'DM Mono',monospace;font-size:14px;color:var(--cream);outline:none;width:220px;letter-spacing:.08em;}
  .login-box input::placeholder{color:rgba(228,226,212,0.3);}
  .login-box button{background:var(--red);border:none;padding:14px 24px;font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.15em;color:var(--cream);cursor:pointer;text-transform:uppercase;}
  .login-err{font-size:11px;font-family:'DM Mono',monospace;color:var(--red);margin-top:12px;letter-spacing:.1em;opacity:0;transition:opacity .3s;}
  .login-err.show{opacity:1;}
  #app{display:none;height:100vh;flex-direction:row;}
  #app.visible{display:flex;}
  .sidebar{width:260px;min-width:260px;background:var(--green);display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.06);position:relative;overflow:hidden;}
  .sidebar::before{content:'';position:absolute;top:-80px;right:-80px;width:200px;height:200px;border:1px solid rgba(228,226,212,0.08);border-radius:50%;pointer-events:none;}
  .sidebar::after{content:'';position:absolute;top:-40px;right:-40px;width:120px;height:120px;border:1px solid rgba(228,226,212,0.05);border-radius:50%;pointer-events:none;}
  .sidebar-header{padding:28px 24px 24px;border-bottom:1px solid rgba(255,255,255,0.07);}
  .sidebar-eyebrow{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.25em;text-transform:uppercase;color:rgba(228,226,212,0.45);margin-bottom:4px;}
  .sidebar-brand{font-size:22px;font-weight:300;letter-spacing:-.02em;color:var(--cream);}
  .sidebar-brand em{font-style:italic;color:var(--red);}
  .sidebar-tagline{font-size:10px;color:rgba(228,226,212,0.4);margin-top:3px;font-family:'DM Mono',monospace;letter-spacing:.05em;}
  .sidebar-section-label{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(228,226,212,0.3);padding:20px 24px 8px;}
  .client-list{flex:1;overflow-y:auto;padding:0 12px 12px;}
  .client-list::-webkit-scrollbar{width:3px;}
  .client-list::-webkit-scrollbar-thumb{background:rgba(228,226,212,0.2);border-radius:2px;}
  .client-item{padding:10px 12px;cursor:pointer;border-radius:3px;transition:background .15s;margin-bottom:2px;position:relative;}
  .client-item:hover{background:rgba(255,255,255,0.06);}
  .client-item.active{background:rgba(227,72,46,0.15);}
  .client-item.active::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:2px;height:60%;background:var(--red);border-radius:0 2px 2px 0;}
  .client-name{font-size:13px;font-weight:500;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .client-practice{font-size:10px;color:rgba(228,226,212,0.45);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'DM Mono',monospace;}
  .client-badge{display:inline-block;width:6px;height:6px;background:#4caf50;border-radius:50%;margin-right:6px;vertical-align:middle;margin-bottom:1px;}
  .sidebar-footer{padding:16px 24px;border-top:1px solid rgba(255,255,255,0.07);}
  .server-status{display:flex;align-items:center;gap:8px;font-family:'DM Mono',monospace;font-size:10px;color:rgba(228,226,212,0.4);letter-spacing:.08em;}
  .status-dot{width:7px;height:7px;border-radius:50%;background:#4caf50;box-shadow:0 0 6px #4caf50;flex-shrink:0;}
  .status-dot.offline{background:var(--red);box-shadow:0 0 6px var(--red);}
  .main{flex:1;display:flex;flex-direction:column;overflow:hidden;}
  .topbar{padding:20px 32px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
  .topbar-left{display:flex;flex-direction:column;gap:2px;}
  .topbar-client-name{font-size:24px;font-weight:300;letter-spacing:-.02em;color:var(--cream);}
  .topbar-meta{font-family:'DM Mono',monospace;font-size:10px;color:var(--dim);letter-spacing:.1em;}
  .topbar-right{display:flex;gap:10px;align-items:center;}
  .btn{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.15em;text-transform:uppercase;padding:9px 18px;border:1px solid var(--border2);background:transparent;color:var(--cream);cursor:pointer;transition:all .15s;}
  .btn:hover{background:var(--card2);border-color:var(--cream);}
  .btn-primary{background:var(--red);border-color:var(--red);}
  .btn-primary:hover{opacity:.85;}
  .btn-green{background:var(--green);border-color:var(--green);}
  .content{flex:1;overflow-y:auto;padding:28px 32px;display:flex;flex-direction:column;gap:24px;}
  .content::-webkit-scrollbar{width:4px;}
  .content::-webkit-scrollbar-thumb{background:rgba(228,226,212,0.15);border-radius:2px;}
  .foundation-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
  .foundation-card{background:var(--card);border:1px solid var(--border);padding:18px 20px;}
  .foundation-card.full-width{grid-column:1/-1;}
  .card-eyebrow{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:8px;display:flex;align-items:center;gap:8px;}
  .card-value{font-size:14px;color:var(--cream);line-height:1.5;font-weight:300;}
  .card-value.mono{font-family:'DM Mono',monospace;font-size:12px;color:var(--dim);}
  .schedule-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}
  .schedule-pill{display:flex;align-items:center;gap:8px;border:1px solid var(--border2);padding:6px 12px;font-family:'DM Mono',monospace;font-size:11px;color:var(--cream);background:var(--card);}
  .pill-time{color:var(--red);font-weight:500;}
  .section-label{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;}
  .msg-count{background:var(--red);color:var(--cream);font-size:9px;padding:2px 7px;border-radius:20px;}
  .conversation{display:flex;flex-direction:column;gap:10px;max-height:380px;overflow-y:auto;padding-right:4px;}
  .conversation::-webkit-scrollbar{width:3px;}
  .conversation::-webkit-scrollbar-thumb{background:rgba(228,226,212,0.1);}
  .msg{display:flex;flex-direction:column;max-width:75%;}
  .msg.inbound{align-self:flex-start;}
  .msg.outbound{align-self:flex-end;align-items:flex-end;}
  .msg-bubble{padding:10px 14px;font-size:13px;line-height:1.55;font-weight:300;}
  .msg.inbound .msg-bubble{background:var(--card2);border:1px solid var(--border);color:var(--cream);}
  .msg.outbound .msg-bubble{background:var(--green);border:1px solid rgba(37,59,30,0.8);color:var(--cream);}
  .msg.nudge .msg-bubble{background:rgba(227,72,46,0.1);border:1px solid rgba(227,72,46,0.25);}
  .msg-meta{font-family:'DM Mono',monospace;font-size:9px;color:rgba(228,226,212,0.3);margin-top:4px;letter-spacing:.05em;}
  .reply-box{display:flex;border:1px solid var(--border2);margin-top:16px;}
  .reply-box textarea{flex:1;background:var(--card);border:none;padding:14px 16px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--cream);outline:none;resize:none;height:60px;line-height:1.5;}
  .reply-box textarea::placeholder{color:rgba(228,226,212,0.25);}
  .reply-send{background:var(--red);border:none;padding:0 22px;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--cream);cursor:pointer;white-space:nowrap;}
  .reply-send:hover{opacity:.85;}
  .stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
  .stat-card{background:var(--card);border:1px solid var(--border);padding:18px 20px;}
  .stat-number{font-size:36px;font-weight:300;letter-spacing:-.04em;color:var(--cream);line-height:1;}
  .stat-number span{color:var(--red);}
  .stat-label{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:rgba(228,226,212,0.35);margin-top:6px;}
  .empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;gap:12px;}
  .empty-icon{font-size:32px;opacity:.3;}
  .empty-text{font-size:14px;color:rgba(228,226,212,0.35);font-weight:300;}
  .empty-sub{font-family:'DM Mono',monospace;font-size:10px;color:rgba(228,226,212,0.2);letter-spacing:.1em;}
  .welcome-view{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:16px;text-align:center;padding:40px;}
  .welcome-big{font-size:clamp(36px,4vw,56px);font-weight:300;letter-spacing:-.03em;color:var(--cream);line-height:1.1;}
  .welcome-big em{font-style:italic;color:var(--red);}
  .welcome-sub{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.12em;color:rgba(228,226,212,0.3);text-transform:uppercase;}
  .modal-overlay{position:fixed;inset:0;background:rgba(18,19,12,0.85);z-index:500;display:none;align-items:center;justify-content:center;}
  .modal-overlay.open{display:flex;}
  .modal{background:#1a1d14;border:1px solid var(--border2);width:520px;max-width:92vw;padding:32px;}
  .modal-title{font-size:20px;font-weight:300;letter-spacing:-.02em;margin-bottom:4px;}
  .modal-sub{font-family:'DM Mono',monospace;font-size:10px;color:var(--dim);letter-spacing:.1em;margin-bottom:24px;}
  .modal label{display:block;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:rgba(228,226,212,0.45);margin-bottom:6px;}
  .modal input,.modal textarea{width:100%;background:var(--card2);border:1px solid var(--border);padding:12px 14px;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--cream);outline:none;margin-bottom:16px;}
  .modal textarea{resize:vertical;min-height:100px;}
  .modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:8px;}
  .deco-line{height:1px;background:linear-gradient(90deg,var(--red) 0%,transparent 100%);width:40px;margin-bottom:20px;}
  .loading-spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(228,226,212,0.2);border-top-color:var(--red);border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:8px;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .fade-in{animation:fadeIn .3s ease;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
</style>
</head>
<body>
<div id="login-screen">
  <div class="login-logo">Dr. Brent Hogarth</div>
  <div class="login-title">Flow<span>Rx</span></div>
  <div class="login-sub">Command Centre · Private Access</div>
  <div class="login-box">
    <input type="password" id="pwd-input" placeholder="Enter password" onkeydown="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">Enter</button>
  </div>
  <div class="login-err" id="login-err">Incorrect password</div>
</div>
<div id="app">
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-eyebrow">Dr. Brent Hogarth</div>
      <div class="sidebar-brand">Flow<em>Rx</em></div>
      <div class="sidebar-tagline">Create Change that Lasts Forever.</div>
    </div>
    <div class="sidebar-section-label">Clients</div>
    <div class="client-list" id="client-list">
      <div class="empty-state"><div class="empty-text" style="font-size:12px;">Loading...</div></div>
    </div>
    <div class="sidebar-footer">
      <div class="server-status">
        <div class="status-dot" id="status-dot"></div>
        <span id="status-text">Checking...</span>
      </div>
    </div>
  </div>
  <div class="main">
    <div id="main-content" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
      <div class="welcome-view" id="welcome-view">
        <div class="deco-line"></div>
        <div class="welcome-big">Select a<br>client to<br><em>begin.</em></div>
        <div class="welcome-sub">Flow RX · Command Centre</div>
      </div>
      <div id="client-view" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
        <div class="topbar">
          <div class="topbar-left">
            <div class="topbar-client-name" id="cv-name">—</div>
            <div class="topbar-meta" id="cv-meta">—</div>
          </div>
          <div class="topbar-right">
            <button class="btn btn-green" onclick="openNudgeModal()">⚡ Send Nudge</button>
            <button class="btn btn-primary" onclick="refreshClient()">↻ Refresh</button>
          </div>
        </div>
        <div class="content" id="cv-content">
          <div class="stats-row fade-in" id="cv-stats"></div>
          <div class="fade-in">
            <div class="section-label">Foundation</div>
            <div class="foundation-grid" id="cv-foundation"></div>
          </div>
          <div class="fade-in">
            <div class="section-label">
              <span>Conversation</span>
              <span class="msg-count" id="cv-msg-count">0</span>
            </div>
            <div class="conversation" id="cv-conversation"></div>
            <div class="reply-box">
              <textarea id="reply-text" placeholder="Reply as Dr. Brent..."></textarea>
              <button class="reply-send" onclick="sendReply()">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="modal-overlay" id="nudge-modal">
  <div class="modal">
    <div class="modal-title">Send Nudge</div>
    <div class="modal-sub" id="nudge-modal-sub">—</div>
    <label>Practice</label>
    <input type="text" id="nudge-practice" placeholder="e.g. morning mindset routine">
    <label>Message (leave blank for quick reminder)</label>
    <textarea id="nudge-message" placeholder="Leave blank for auto-reminder, or write a custom message..."></textarea>
    <div class="modal-actions">
      <button class="btn" onclick="closeNudgeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="sendNudge()">Send via Twilio</button>
    </div>
  </div>
</div>
<script>
const SERVER=window.location.origin;
const PASSWORD='Iamaplayer';
let selectedClient=null,allClients=[];
function doLogin(){
  const pwd=document.getElementById('pwd-input').value;
  if(pwd===PASSWORD){
    document.getElementById('login-screen').style.display='none';
    document.getElementById('app').classList.add('visible');
    init();
  }else{
    document.getElementById('login-err').classList.add('show');
    document.getElementById('pwd-input').value='';
    setTimeout(()=>document.getElementById('login-err').classList.remove('show'),2500);
  }
}
async function init(){
  checkServer();await loadClients();
  setInterval(checkServer,30000);
  setInterval(async()=>{if(selectedClient)await loadMessages(selectedClient.phone);},15000);
}
async function checkServer(){
  try{
    const r=await fetch(SERVER+'/');
    const dot=document.getElementById('status-dot'),txt=document.getElementById('status-text');
    if(r.ok){dot.className='status-dot';txt.textContent='Server online';}
    else{dot.className='status-dot offline';txt.textContent='Server error';}
  }catch{document.getElementById('status-dot').className='status-dot offline';document.getElementById('status-text').textContent='Server offline';}
}
async function loadClients(){
  try{
    const r=await fetch(SERVER+'/clients');
    allClients=await r.json();renderClientList();
  }catch(e){document.getElementById('client-list').innerHTML='<div class="empty-state"><div class="empty-text" style="font-size:12px;color:var(--red)">Failed to load</div></div>';}
}
function renderClientList(){
  const el=document.getElementById('client-list');
  if(!allClients.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">👤</div><div class="empty-text">No clients yet</div><div class="empty-sub">Share the number to get started</div></div>';return;}
  el.innerHTML=allClients.map(c=>\`<div class="client-item \${selectedClient?.phone===c.phone?'active':''}" onclick="selectClient('\${c.phone}')">
    <div class="client-name"><span class="client-badge"></span>\${c.name||'Unknown'}\${!c.onboarded?'<span style="font-size:9px;color:var(--gold);font-family:DM Mono,monospace;margin-left:4px;">ONBOARDING</span>':''}</div>
    <div class="client-practice">\${c.practice?c.practice.substring(0,40)+(c.practice.length>40?'...':''):'No practice set'}</div>
  </div>\`).join('');
}
async function selectClient(phone){
  selectedClient=allClients.find(c=>c.phone===phone);
  renderClientList();
  document.getElementById('welcome-view').style.display='none';
  document.getElementById('client-view').style.display='flex';
  await renderClientView();
}
async function renderClientView(){
  if(!selectedClient)return;
  const c=selectedClient;
  document.getElementById('cv-name').textContent=c.name||'Unknown';
  document.getElementById('cv-meta').textContent=\`\${c.phone} · Joined \${new Date(c.created_at).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})}\`;
  const msgs=await fetchMessages(c.phone);
  const inbound=msgs.filter(m=>m.direction==='inbound').length;
  const outbound=msgs.filter(m=>m.direction==='outbound').length;
  document.getElementById('cv-stats').innerHTML=\`
    <div class="stat-card"><div class="stat-number">\${msgs.length}<span>.</span></div><div class="stat-label">Total Messages</div></div>
    <div class="stat-card"><div class="stat-number">\${inbound}<span>.</span></div><div class="stat-label">Client Replies</div></div>
    <div class="stat-card"><div class="stat-number">\${outbound}<span>.</span></div><div class="stat-label">Nudges Sent</div></div>
  \`;
  let scheduleHTML='';
  try{const schedules=JSON.parse(c.nudge_time);scheduleHTML=\`<div class="schedule-pills">\${schedules.map(s=>\`<div class="schedule-pill"><span class="pill-time">\${s.time}</span>\${s.practice}</div>\`).join('')}</div>\`;}
  catch{scheduleHTML=\`<div class="card-value mono">\${c.nudge_time||'—'}</div>\`;}
  document.getElementById('cv-foundation').innerHTML=\`
    <div class="foundation-card"><div class="card-eyebrow"><span>📌</span>Philosophy</div><div class="card-value">\${c.philosophy||'—'}</div></div>
    <div class="foundation-card"><div class="card-eyebrow"><span>🔥</span>Purpose</div><div class="card-value">\${c.purpose||'—'}</div></div>
    <div class="foundation-card full-width"><div class="card-eyebrow"><span>🎯</span>Vision</div><div class="card-value">\${c.vision||'—'}</div></div>
    <div class="foundation-card"><div class="card-eyebrow"><span>⚡</span>Current Practice</div><div class="card-value">\${c.practice||'—'}</div></div>
    <div class="foundation-card"><div class="card-eyebrow"><span>⏰</span>Nudge Schedule</div>\${scheduleHTML}</div>
  \`;
  renderMessages(msgs);
}
async function fetchMessages(phone){
  try{const r=await fetch(SERVER+'/messages/'+encodeURIComponent(phone));return await r.json();}catch{return[];}
}
async function loadMessages(phone){
  const msgs=await fetchMessages(phone);renderMessages(msgs);
}
function renderMessages(msgs){
  const el=document.getElementById('cv-conversation');
  document.getElementById('cv-msg-count').textContent=msgs.length;
  if(!msgs.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-text">No messages yet</div></div>';return;}
  el.innerHTML=msgs.map(m=>{
    const isNudge=m.direction==='outbound'&&m.body&&m.body.length>60;
    const time=new Date(m.created_at).toLocaleString('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
    return \`<div class="msg \${m.direction} \${isNudge?'nudge':''}">
      <div class="msg-bubble">\${m.body}</div>
      <div class="msg-meta">\${time} · \${m.direction==='inbound'?'Client':'Flow RX'}</div>
    </div>\`;
  }).join('');
  el.scrollTop=el.scrollHeight;
}
async function refreshClient(){
  await loadClients();
  if(selectedClient){selectedClient=allClients.find(c=>c.phone===selectedClient.phone);await renderClientView();}
}
async function sendReply(){
  if(!selectedClient)return;
  const txt=document.getElementById('reply-text').value.trim();
  if(!txt)return;
  const btn=document.querySelector('.reply-send');
  btn.innerHTML='<span class="loading-spinner"></span>';btn.disabled=true;
  try{
    const r=await fetch(SERVER+'/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:selectedClient.phone,message:txt})});
    const data=await r.json();
    if(data.success){document.getElementById('reply-text').value='';await loadMessages(selectedClient.phone);}
    else alert('Failed: '+(data.error||'Unknown'));
  }catch(e){alert('Network error.');}
  btn.innerHTML='Send';btn.disabled=false;
}
function openNudgeModal(){
  if(!selectedClient)return;
  document.getElementById('nudge-modal-sub').textContent=\`Sending to \${selectedClient.name} · \${selectedClient.phone}\`;
  document.getElementById('nudge-practice').value=selectedClient.practice||'';
  document.getElementById('nudge-message').value='';
  document.getElementById('nudge-modal').classList.add('open');
}
function closeNudgeModal(){document.getElementById('nudge-modal').classList.remove('open');}
async function sendNudge(){
  if(!selectedClient)return;
  const practice=document.getElementById('nudge-practice').value.trim();
  let message=document.getElementById('nudge-message').value.trim();
  const btn=document.querySelector('#nudge-modal .btn-primary');
  btn.innerHTML='<span class="loading-spinner"></span>Sending...';btn.disabled=true;
  if(!message)message=\`Time for your \${practice||'daily practice'}. — Flow RX\`;
  try{
    const r=await fetch(SERVER+'/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:selectedClient.phone,message})});
    const data=await r.json();
    if(data.success){closeNudgeModal();await loadMessages(selectedClient.phone);}
    else alert('Failed: '+(data.error||'Unknown'));
  }catch(e){alert('Network error.');}
  btn.innerHTML='Send via Twilio';btn.disabled=false;
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeNudgeModal();
  if(e.key==='Enter'&&e.metaKey&&document.activeElement===document.getElementById('reply-text'))sendReply();
});
document.getElementById('nudge-modal').addEventListener('click',function(e){if(e.target===this)closeNudgeModal();});
<\/script>
</body>
</html>`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Flow RX running on port ${PORT}`));
