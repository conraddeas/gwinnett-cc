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

  // Encharge
  try {
    const citySlug = city ? city.toLowerCase().replace(/\s+/g, '-') : null;

    const tags = [
      'gwinnett-subscriber',
      'gwinnett-newsletter',
      ...(source ? [`source-${source}`] : []),
      ...(birthMonth ? [`birthday-month-${birthMonth}`] : []),
      ...(birthDay ? [`birthday-day-${birthDay}`] : []),
      ...(citySlug ? [`city-${citySlug}`] : []),
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
            profileToken,
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

  // Boomerang — create customer so wallet card can be issued without opt-in page
  try {
    const fullName = (firstName ?? '').trim();
    const spaceIndex = fullName.indexOf(' ');
    const boomerangFirstName = spaceIndex > -1 ? fullName.slice(0, spaceIndex) : fullName;
    const surname = spaceIndex > -1 ? fullName.slice(spaceIndex + 1) : '';

    const birthMonthStr = String(birthMonth ?? 1).padStart(2, '0');
    const birthDayStr = String(birthDay ?? 1).padStart(2, '0');
    const dateOfBirth = `2000-${birthMonthStr}-${birthDayStr}`;

    const customerRes = await fetch('https://api.digitalwallet.cards/api/v2/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': env.BOOMERANG_API_KEY,
      },
      body: JSON.stringify({
        firstName: boomerangFirstName,
        surname,
        email,
        dateOfBirth,
      }),
    });

    if (customerRes.ok) {
      const customerData = await customerRes.json();
      const boomerangCustomerId = customerData.data?.id ?? null;
      if (boomerangCustomerId) {
        await sql`
          UPDATE subscribers
          SET boomerang_customer_id = ${boomerangCustomerId}
          WHERE email = ${email}
        `;
      } else {
        console.error('[subscribe] Boomerang customer ID missing in response:', customerData);
      }
    } else {
      console.error('[subscribe] Boomerang customer create failed:', await customerRes.text());
    }
  } catch (err) {
    console.error('[subscribe] Boomerang fetch failed:', err);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};