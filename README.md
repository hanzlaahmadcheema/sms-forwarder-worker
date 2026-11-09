# SMS Forwarder — Cloudflare Worker (WhatsApp Agent Platform)

Receives SMS notifications as webhook POSTs and forwards each one as a single
WhatsApp message from the connected agent to its creator, via Meta's
**WhatsApp Agent Platform** API (`POST https://api.whatsapp.com/agent/v1/messages`).

This repo was validated locally with `wrangler dev` — not deployed yet.

## Request contract

```
POST /
Authorization: Bearer <WEBHOOK_SECRET>
Content-Type: application/json

{"sender": "+9203000000000", "message": "SMS body (<=10000 chars)"}
```

Responses: `200` forwarded (`stage: accepted_by_whatsapp`) · `400` invalid input ·
`401` bad secret · `405` wrong method · `502` WhatsApp API error (body includes
upstream status, e.g. 403/131005 wrong agent, 429 rate limit).

Every accepted request sends **exactly one** WhatsApp message; there are no
retries (a blind retry after an unknown outcome can double-send).

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in real values
npx wrangler dev --port 8787

# health check
curl http://localhost:8787/

# forward test (one real WhatsApp message)
curl -X POST http://localhost:8787/ \
  -H 'Authorization: Bearer <WEBHOOK_SECRET>' \
  -H 'Content-Type: application/json' \
  -d '{"sender":"+9203000000000","message":"Hello from the worker"}'
```

## Configuration

Local secrets live in `.dev.vars` (git-ignored). In production set them with
`wrangler secret put <NAME>`:

| Secret                   | Meaning                                                            |
|--------------------------|--------------------------------------------------------------------|
| `WEBHOOK_SECRET`         | Bearer secret the Android forwarder must present                   |
| `WHATSAPP_AGENT_API_KEY` | Agent API key (WhatsApp → Settings → Agents → Chat info → API key) |
| `WHATSAPP_RECIPIENT_ID`  | `user:<id>` of the agent's owner — **must belong to the same agent as the key**, else 403/code 131005 |

### Getting WHATSAPP_RECIPIENT_ID

The recipient identifier only appears on an inbound message. Send any message
to the agent's chat, then poll the read-only endpoint
`GET https://api.whatsapp.com/agent/v1/updates?limit=50&timeout=15&offset=0`
with `Authorization: Bearer <WHATSAPP_AGENT_API_KEY>` and read
`messages[].from`. The `statuses[].recipient_id` entries there also confirm
the agent's owner identity. `~/PersonalProjects/sms-forwarder-api-test/capture_recipient.py`
does exactly this.

## Deployment (not yet done)

```bash
npx wrangler deploy
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put WHATSAPP_AGENT_API_KEY
npx wrangler secret put WHATSAPP_RECIPIENT_ID
```
