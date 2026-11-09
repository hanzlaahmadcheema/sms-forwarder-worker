export default {
  async fetch(request, env) {
    if (request.method === "GET") {
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

    // Validate incoming SMS.
    // NOTE: no headers are required — this endpoint is header-optional by design.
    // - Content-Type: the body is parsed as JSON regardless of the declared
    //   content type, so this header can be omitted entirely.
    // - User-agent: never read; purely informational client branding.
    let data;

    try {
      data = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    if (
      typeof data.message !== "string" ||
      !data.message.trim() ||
      data.message.length > 10000
    ) {
      return Response.json(
        { error: "Invalid or empty message" },
        { status: 400 }
      );
    }

    const sender =
      typeof data.sender === "string"
        ? data.sender.slice(0, 100)
        : "Unknown";

    const smsText =
      `New SMS received\nFrom: ${sender}\n\n${data.message}`;

    // Forward to WhatsApp Agent API — one attempt only, using saved variables
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
};
