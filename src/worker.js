export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      // Convenience: allow GET with query params (?sender=...&message=...) or health check
      const q = Object.fromEntries(url.searchParams.entries());
      if (q.message || q.text || q.msg || q.body) {
        return forward(q, env);
      }
      return Response.json({
        service: "SMS Forwarder",
        status: "running"
      });
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405 }
      );
    }

    // Parse incoming body. Header-optional by design: whatever the declared
    // Content-Type, try JSON first, then form-encoded, then raw text.
    let data = {};

    const raw = await request.text().catch(() => "");
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        try {
          data = Object.fromEntries(new URLSearchParams(raw).entries());
        } catch {
          data = {};
        }
      }
    } else {
      try {
        const fd = await request.formData();
        data = Object.fromEntries(fd.entries());
      } catch {
        /* empty body */
      }
    }

    // Field aliases used by various SMS forwarder apps
    const pick = (...keys) => {
      for (const key of keys) {
        const value = data?.[key];
        if (typeof value === "string" && value.trim()) return value;
      }
      return undefined;
    };

    const smsText =
      pick("message", "text", "body", "msg", "message_body", "sms_body", "sms_text");

    if (!smsText || smsText.length > 10000) {
      return Response.json(
        { error: "Invalid or empty message" },
        { status: 400 }
      );
    }

    return forward({ sender: pick("sender", "from", "phone", "address") || "Unknown", message: smsText }, env);

    async function forward(payload, env) {
      // Validate
      const message = payload.message;
      if (typeof message !== "string" || !message.trim() || message.length > 10000) {
        return Response.json(
          { error: "Invalid or empty message" },
          { status: 400 }
        );
      }

      const cleaned = {
        sender: typeof payload.sender === "string" ? payload.sender.slice(0, 100) : "Unknown",
        message
      };

      const smsText =
        `New SMS received\nFrom: ${cleaned.sender}\n\n${cleaned.message}`;

      // Forward to WhatsApp Agent API — one attempt only
      try {
        const response = await fetch(
          "https://api.whatsapp.com/agent/v1/messages",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.WHATSAPP_AGENT_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: env.WHATSAPP_RECIPIENT_ID,
              type: "text",
              text: {
                body: smsText
              }
            })
          }
        );

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          return Response.json(
            {
              success: false,
              stage: "whatsapp_api",
              whatsapp_status: response.status,
              response: result
            },
            { status: 502 }
          );
        }

        return Response.json({
          success: true,
          stage: "accepted_by_whatsapp",
          whatsapp_status: response.status,
          whatsapp_response: result
        });

      } catch {
        return Response.json(
          { error: "WhatsApp API connection failed" },
          { status: 502 }
        );
      }
    }
  }
};
