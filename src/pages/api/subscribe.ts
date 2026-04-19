import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email) {
    return new Response(JSON.stringify({ error: 'Email is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const firstName  = typeof body.firstName  === 'string' ? body.firstName.trim()  || null : null;
  const city       = typeof body.city       === 'string' ? body.city.trim()        || null : null;
  const birthMonth = body.birth_month ? (parseInt(String(body.birth_month), 10) || null) : null;
  const birthDay   = body.birth_day   ? (parseInt(String(body.birth_day),   10) || null) : null;
  const source = typeof body.source === 'string' ? body.source.trim() || 'homepage' : 'homepage';
  const profileToken = crypto.randomUUID();

  const env = (locals as any).runtime.env;
  const sql = getDb(env.DATABASE_URL);

  try {
    await sql`
      INSERT INTO subscribers (email, first_name, city, birth_month, birth_day, source, profile_token)
      VALUES (${email}, ${firstName}, ${city}, ${birthMonth}, ${birthDay}, ${source}, ${profileToken})
      ON CONFLICT (email) DO NOTHING
    `;
  } catch (err) {
    console.error('[subscribe] DB insert failed:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const tags = [
      'gwinnett-newsletter',
      ...(source ? [`source-${source}`] : []),
      ...(birthMonth ? [`birth-month-${birthMonth}`] : []),
    ].join(', ');

    const enchargeRes = await fetch(
      `https://ingest.encharge.io/v1?api_key=${env.ENCHARGE_WRITE_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Subscribed',
          user: {
            email,
            ...(firstName ? { firstName } : {}),
            tags,
          },
        }),
      }
    );
    if (!enchargeRes.ok) {
      console.error('[subscribe] Encharge error:', enchargeRes.status, await enchargeRes.text());
    }
  } catch (err) {
    console.error('[subscribe] Encharge fetch failed:', err);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
