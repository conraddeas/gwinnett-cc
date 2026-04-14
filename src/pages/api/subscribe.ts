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

  const env = (locals as any).runtime.env;
  const sql = getDb(env.DATABASE_URL);

  try {
    await sql`
      INSERT INTO subscribers (email, first_name, city, birth_month, birth_day)
      VALUES (${email}, ${firstName}, ${city}, ${birthMonth}, ${birthDay})
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
    const enchargeRes = await fetch('https://api.encharge.io/v1/people', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Encharge-Token': env.ENCHARGE_WRITE_KEY,
      },
      body: JSON.stringify({
        email,
        ...(firstName ? { firstName } : {}),
        tags: ['subscriber'],
      }),
    });
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
