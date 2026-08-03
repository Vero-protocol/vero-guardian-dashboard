const crypto = require('crypto');

const payload = {
  action: 'closed',
  pull_request: {
    number: 42,
    merged: true,
    labels: [{ name: 'wave-contribution' }],
  },
};

const body = JSON.stringify(payload);
const secret = process.env.GITHUB_WEBHOOK_SECRET;

const headers = { 'Content-Type': 'application/json' };
if (secret) {
  const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
  headers['X-Hub-Signature-256'] = `sha256=${digest}`;
} else {
  console.warn('[mock-webhook] GITHUB_WEBHOOK_SECRET is not set — request will be sent unsigned and rejected with 401');
}

fetch('http://localhost:3000/github-webhook', {
  method: 'POST',
  headers,
  body,
})
  .then(res => res.json())
  .then(data => console.log('[mock-webhook] Response:', data))
  .catch(err => console.error('[mock-webhook] Error:', err.message));
