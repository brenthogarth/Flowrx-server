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

app.post('/incoming', (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  console.log(`Reply from ${from}: ${body}`);
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Flow RX running on port ${PORT}`));
