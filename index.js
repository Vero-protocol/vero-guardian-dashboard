const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { registerTaskOnChain } = require('./stellar');

const app = express();

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

const WEBHOOK_RATE_LIMIT_WINDOW_MS = Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const WEBHOOK_RATE_LIMIT_MAX = Number(process.env.WEBHOOK_RATE_LIMIT_MAX) || 30;

const webhookLimiter = rateLimit({
  windowMs: WEBHOOK_RATE_LIMIT_WINDOW_MS,
  limit: WEBHOOK_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

function verifyGithubSignature(req, res, next) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers['x-hub-signature-256'];

  if (!secret) {
    console.error('[webhook] GITHUB_WEBHOOK_SECRET is not configured — rejecting request');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (!signature || typeof signature !== 'string') {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const digest = crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  const expected = Buffer.from(`sha256=${digest}`);
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

app.post('/github-webhook', webhookLimiter, verifyGithubSignature, async (req, res) => {
  const { action, pull_request } = req.body;

  if (action !== 'closed' || !pull_request?.merged) {
    return res.status(200).json({ skipped: true });
  }

  const hasLabel = pull_request.labels?.some(l => l.name === 'wave-contribution');
  if (!hasLabel) {
    return res.status(200).json({ skipped: true, reason: 'no wave-contribution label' });
  }

  const prNumber = pull_request.number;
  console.log(`[webhook] Merged PR #${prNumber} with wave-contribution — registering on chain`);

  try {
    const result = await registerTaskOnChain(prNumber);
    res.status(200).json({ registered: true, prNumber, result });
  } catch (err) {
    console.error('[webhook] Chain registration failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`[relayer] Listening on port ${PORT}`));
}

module.exports = app;
