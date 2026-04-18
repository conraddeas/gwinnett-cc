import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  
  try {
    const body = await request.json();
    const { name, business, email, interest, message } = body;

    if (!name || !business || !email || !interest) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    const sql = getDb(env.DATABASE_URL);

    // 1. Insert into Neon
    await sql`
      INSERT INTO partner_inquiries (name, business_name, email, interest, message)
      VALUES (${name}, ${business}, ${email}, ${interest}, ${message || null})
    `;

    // 2. Send to Encharge
    if (env.ENCHARGE_WRITE_KEY) {
      const firstName = name.split(' ')[0];
      
      const enchargePayload = {
        name: "Partner Inquiry Submitted",
        user: {
          email: email,
          firstName: firstName,
          company: business,
          tags: "partner-inquiry"
        }
      };

      await fetch('https://ingest.encharge.io/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.ENCHARGE_WRITE_KEY}`
        },
        body: JSON.stringify(enchargePayload)
      }).catch(err => console.error("Encharge error:", err)); // Prevent Encharge timeout from failing form submission
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error('Contact API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};