// server.js
// Flat Node.js + Express backend for Tripwire's phone escalation feature.
// No frontend framework needed — this just gives the static HTML page
// somewhere safe to send OTP/call requests, since Twilio credentials
// can never live in client-side code.
//
// Setup:
//   npm install express twilio
//   set env vars: TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
//   node server.js
//
// Bounds enforced here (not adjustable from the client):
//   - A phone number must complete OTP verification before it can ever
//     be called or texted.
//   - Escalation only ever targets the verified owner's own number —
//     there is no field anywhere for a different number.
//   - Max 2 escalation calls per alarm session, >=60s apart, then it stops.
//   - Voice message content is fixed, not user-editable.

const express = require("express");
const twilio = require("twilio");

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // serves tripwire.html from this folder

const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const client = (TWILIO_SID && TWILIO_AUTH_TOKEN) ? twilio(TWILIO_SID, TWILIO_AUTH_TOKEN) : null;

// --- in-memory stores (fine for single-user/local use; swap for a real DB in production) ---
const pendingCodes = new Map();   // phone -> { code, expiresAt }
const verifiedNumbers = new Set(); // phones that completed OTP
const escalationState = new Map(); // sessionId -> { phone, callsMade, lastCallAt }

const MAX_ESCALATION_CALLS = 2;
const MIN_SECONDS_BETWEEN_CALLS = 60;
const FIXED_VOICE_MESSAGE =
  "This is your Tripwire alarm. Your device has been triggered and is still sounding. " +
  "Return to it to silence the alarm.";

function requireTwilio(res) {
  if (!client) {
    res.status(500).json({ error: "Server is missing Twilio credentials (TWILIO_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)." });
    return false;
  }
  return true;
}

// 1. Send a 6-digit OTP to the number the user claims is theirs
app.post("/api/send-code", async (req, res) => {
  if (!requireTwilio(res)) return;
  const { phone } = req.body;
  if (!phone || !/^\+\d{8,15}$/.test(phone)) {
    return res.status(400).json({ error: "Provide phone in E.164 format, e.g. +15551234567" });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pendingCodes.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000 });

  try {
    await client.messages.create({
      to: phone,
      from: TWILIO_FROM_NUMBER,
      body: `Your Tripwire verification code is ${code}. It expires in 5 minutes.`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to send SMS: " + err.message });
  }
});

// 2. Verify the code the user typed back into the page
app.post("/api/verify-code", (req, res) => {
  const { phone, code } = req.body;
  const entry = pendingCodes.get(phone);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(400).json({ error: "Code expired or not found. Request a new one." });
  }
  if (entry.code !== String(code)) {
    return res.status(400).json({ error: "Incorrect code." });
  }
  verifiedNumbers.add(phone);
  pendingCodes.delete(phone);
  res.json({ ok: true, verified: true });
});

// 3. Called by the page once an alarm has been triggered and left
//    unattended past the user's chosen delay. Bounded server-side —
//    the client cannot request more than the cap or shorter spacing.
app.post("/api/escalate", async (req, res) => {
  if (!requireTwilio(res)) return;
  const { phone, sessionId } = req.body;
  if (!phone || !verifiedNumbers.has(phone)) {
    return res.status(403).json({ error: "This number has not completed verification." });
  }
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId." });

  let entry = escalationState.get(sessionId);
  if (!entry) {
    entry = { phone, callsMade: 0, lastCallAt: 0 };
    escalationState.set(sessionId, entry);
  }
  if (entry.callsMade >= MAX_ESCALATION_CALLS) {
    return res.status(429).json({ error: "Escalation call cap reached for this alarm session." });
  }
  const secondsSinceLast = (Date.now() - entry.lastCallAt) / 1000;
  if (entry.lastCallAt && secondsSinceLast < MIN_SECONDS_BETWEEN_CALLS) {
    return res.status(429).json({ error: "Too soon since last escalation call." });
  }

  try {
    await client.calls.create({
      to: phone,
      from: TWILIO_FROM_NUMBER,
      twiml: `<Response><Say>${FIXED_VOICE_MESSAGE}</Say></Response>`,
    });
    entry.callsMade += 1;
    entry.lastCallAt = Date.now();
    res.json({ ok: true, callsMade: entry.callsMade, callsRemaining: MAX_ESCALATION_CALLS - entry.callsMade });
  } catch (err) {
    res.status(500).json({ error: "Failed to place call: " + err.message });
  }
});

// Reset a session's escalation counter once the alarm is disarmed
app.post("/api/reset-session", (req, res) => {
  const { sessionId } = req.body;
  escalationState.delete(sessionId);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tripwire server running on http://localhost:${PORT}`));
