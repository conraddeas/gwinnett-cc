import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.redirect(new URL('/my-profile?error=1', request.url), 303);
  }

  const token      = formData.get('token')?.toString() ?? '';
  const first_name = formData.get('first_name')?.toString().trim()  || null;
  const city       = formData.get('city')?.toString().trim()         || null;
  const monthRaw   = formData.get('birth_month')?.toString().trim();
  const dayRaw     = formData.get('birth_day')?.toString().trim();

  const birth_month = monthRaw ? (parseInt(monthRaw, 10) || null) : null;
  const birth_day   = dayRaw   ? (parseInt(dayRaw,   10) || null) : null;

  const env = (locals as any).runtime.env;
  const sql = getDb(env.DATABASE_URL);

  let subscriber: any;
  try {
    const rows = await sql`SELECT * FROM subscribers WHERE profile_token = ${token} LIMIT 1`;
    subscriber = rows[0];
  } catch (err) {
    console.error('[update-profile] DB lookup failed:', err);
    return Response.redirect(new URL(`/my-profile?token=${encodeURIComponent(token)}&error=1`, request.url), 303);
  }

  if (!subscriber) {
    return Response.redirect(new URL('/my-profile?error=1', request.url), 303);
  }

  try {
    await sql`
      UPDATE subscribers
      SET first_name  = ${first_name},
          city        = ${city},
          birth_month = ${birth_month},
          birth_day   = ${birth_day},
          updated_at  = now()
      WHERE profile_token = ${token}
    `;

    const tags = [
      'gwinnett-subscriber',
      ...(birth_month ? [`birthday-month-${birth_month}`] : []),
      ...(birth_day   ? [`birthday-day-${birth_day}`]     : []),
      ...(city        ? [`city-${city.toLowerCase().replace(/\s+/g, '-')}`] : []),
    ].join(', ');

    try {
      const enchargeRes = await fetch(
        `https://ingest.encharge.io/v1?api_key=${env.ENCHARGE_WRITE_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Subscribed',
            user: {
              email: subscriber.email,
              ...(first_name ? { firstName: first_name } : {}),
              tags,
            },
          }),
        }
      );
      if (!enchargeRes.ok) {
        console.error('[update-profile] Encharge error:', enchargeRes.status, await enchargeRes.text());
      }
    } catch (err) {
      console.error('[update-profile] Encharge fetch failed:', err);
    }

    return Response.redirect(
      new URL(`/my-profile?token=${encodeURIComponent(token)}&updated=true`, request.url),
      303
    );
  } catch (err) {
    console.error('[update-profile] DB update failed:', err);
    return Response.redirect(
      new URL(`/my-profile?token=${encodeURIComponent(token)}&error=1`, request.url),
      303
    );
  }
};
