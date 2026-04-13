const express = require('express');
const twilio = require('twilio');
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
const client = twilio(accountSid, authToken);

app.get('/', (req, res) => res.send('Flow RX server is running'));

app.post('/send', async (req, res) => {
  const { to, message } = req.body;
  try {
    const msg = await client.messages.create({
      body: message,
      from: twilioNumber,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Flow RX running on port ${PORT}`));
