const { config } = require('./config');

function noteToText(note, snapshot) {
  const forecastLines = snapshot.forecast
    ? [
        '',
        'NEXT-DAY USD/GHS FORECAST',
        `Forecast Date: ${snapshot.forecast.forecastDate}`,
        `Direction: ${snapshot.forecast.direction}`,
        `USD/GHS Higher Tomorrow: ${snapshot.forecast.probabilityHigher}%`,
        `USD/GHS Lower Tomorrow: ${snapshot.forecast.probabilityLower}%`,
        `Confidence Level: ${snapshot.forecast.confidence}%`,
        `Expected Trading Range: ${snapshot.forecast.expectedRange}`,
        `Key Drivers: ${snapshot.forecast.keyDrivers.join('; ')}`,
        `Risk Factors: ${snapshot.forecast.riskFactors.join('; ')}`,
        `Conclusion: ${snapshot.forecast.conclusion}`
      ]
    : [];

  return [
    note.title,
    note.time,
    '',
    `Outlook: ${note.outlook}`,
    `Expected range: ${snapshot.marketState.expectedRange}`,
    `Confidence: ${snapshot.marketState.confidence}%`,
    '',
    note.summary,
    '',
    'Drivers:',
    ...note.bullets.map((bullet) => `- ${bullet}`),
    ...forecastLines
  ].join('\n');
}

async function sendEmail({ subject, text }) {
  if (!config.smtp.host || !config.smtp.from || !config.smtp.to) {
    return { channel: 'email', sent: false, status: 'SMTP not configured' };
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user
      ? {
          user: config.smtp.user,
          pass: config.smtp.pass
        }
      : undefined
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    text
  });

  return { channel: 'email', sent: true, status: 'Sent' };
}

async function sendTelegram({ text }) {
  if (!config.telegram.botToken || !config.telegram.chatId) {
    return { channel: 'telegram', sent: false, status: 'Telegram not configured' };
  }

  const response = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegram.chatId,
      text
    })
  });

  return {
    channel: 'telegram',
    sent: response.ok,
    status: response.ok ? 'Sent' : `HTTP ${response.status}`
  };
}

async function sendWhatsApp({ text }) {
  const twilio = config.twilio;
  if (!twilio.accountSid || !twilio.authToken || !twilio.from || !twilio.to) {
    return { channel: 'whatsapp', sent: false, status: 'Twilio WhatsApp not configured' };
  }

  const body = new URLSearchParams({
    From: twilio.from,
    To: twilio.to,
    Body: text
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body
    }
  );

  return {
    channel: 'whatsapp',
    sent: response.ok,
    status: response.ok ? 'Sent' : `HTTP ${response.status}`
  };
}

async function deliverNote(snapshot, noteType = 'morning', channels = ['email']) {
  const note = snapshot.notes[noteType] || snapshot.notes.morning;
  const text = noteToText(note, snapshot);
  const subject = `${note.title}: ${snapshot.marketState.outlook}`;
  const selected = new Set(channels);
  const results = [];

  if (selected.has('email')) {
    results.push(await sendEmail({ subject, text }));
  }
  if (selected.has('telegram')) {
    results.push(await sendTelegram({ text }));
  }
  if (selected.has('whatsapp')) {
    results.push(await sendWhatsApp({ text }));
  }

  return {
    noteType,
    subject,
    results
  };
}

module.exports = {
  deliverNote,
  noteToText
};
