import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "DYP Goals <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return res.json();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReminderRequest {
  email: string;
  taskName: string;
  taskTime: string;
  taskDate: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, taskName, taskTime, taskDate }: ReminderRequest = await req.json();

    if (!email || !taskName || !taskTime) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #fafafa; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .card { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 32px; border: 1px solid #333; }
          .header { text-align: center; margin-bottom: 24px; }
          .emoji { font-size: 48px; margin-bottom: 16px; }
          h1 { color: #a78bfa; margin: 0 0 8px 0; font-size: 24px; }
          .task-name { font-size: 28px; font-weight: bold; color: #fff; margin: 16px 0; }
          .time-badge { display: inline-block; background: #a78bfa; color: #0a0a0a; padding: 8px 16px; border-radius: 8px; font-weight: 600; margin: 8px 0; }
          .date { color: #888; font-size: 14px; margin-top: 8px; }
          .cta { display: block; text-align: center; background: linear-gradient(135deg, #a78bfa, #f472b6); color: #0a0a0a; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 24px; }
          .footer { text-align: center; margin-top: 32px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <div class="emoji">⏰</div>
              <h1>Task Reminder</h1>
            </div>
            <p style="text-align: center; color: #ccc; margin: 0;">Your scheduled task is starting soon:</p>
            <p class="task-name" style="text-align: center;">${taskName}</p>
            <p style="text-align: center;">
              <span class="time-badge">🕐 ${taskTime}</span>
            </p>
            <p class="date" style="text-align: center;">Scheduled for ${taskDate}</p>
            <a href="https://dypgoals.lovable.app/todo" class="cta">View Your To-Do List</a>
          </div>
          <p class="footer">
            You're receiving this because you enabled task reminders on DYP Goals.<br>
            Keep crushing your goals! 💪
          </p>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await sendEmail(
      email,
      `⏰ Reminder: ${taskName} starts soon!`,
      emailHtml
    );

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending reminder email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
