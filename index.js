const express = require('express');
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

app.get('/', (req, res) => res.send('Flow RX server is running'));

app.post('/send', async (req, res) => {
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const { to, message } = req.body;
  try {
    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });
    res.json({ success: true, sid: msg.sid });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/incoming', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  console.log(`Reply from ${from}: ${body}`);

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const aiRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: `You are Flow RX, Dr. Brent Hogarth's ADHD coaching assistant. Reply in 1-3 sentences max. Warm, direct, non-clinical. Never end with a question or check-in.

ONLY draw from these frameworks — never use generic internet advice:
- ADHD 2.0 (Hallowell & Ratey): Ferrari brain, Vitamin Connect, right difficult, cerebellum connection, stellar environments, VAST, DMN/TPN
- Dr. Brent's protocol: self-compassion, sleep hygiene, Morning Mindset Routine (one breath, one gratitude, one intention, be where your feet are), flow lifestyle habits
- Finding Mastery pillars: Calm (Find Your Five), Confidence (EPIC thoughts), Control (thoughts/effort/attitude/actions), Mindfulness, Optimism (3 Good Things), Stress Well, Vision, Trust (behavior x time)
- Flow RX nudge protocol: Identity Anchor + Habit Prompt

If someone says they're struggling — acknowledge it briefly, offer one small concrete anchor from the frameworks above.
If someone says they're doing well — affirm it, reinforce their identity briefly.
Never give generic advice. Always sound like a real coach who knows them.
Never ask them to rate or reply with a number.`,
      messages: [{ role: 'user', content: body }]
    });

    const reply = aiRes.content[0].text;
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: reply,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: from
    });
  } catch(e) {
    console.log('Error:', e.message);
  }

  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Flow RX running on port ${PORT}`));
