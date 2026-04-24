import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const token = body?.token;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400 });
    }

    const env = (locals as any).runtime.env;
    const sql = getDb(env.DATABASE_URL);

    const rows = await sql`
      SELECT id, first_name, email, birth_month, birth_day, boomerang_card_id, wallet_card_url
      FROM subscribers
      WHERE profile_token = ${token}
      LIMIT 1
    `;

    const subscriber = rows[0];
    if (!subscriber) {
      return new Response(JSON.stringify({ error: 'Subscriber not found' }), { status: 404 });
    }

    // Already issued — skip re-issue, return existing URL
    if (subscriber.wallet_card_url) {
      return new Response(JSON.stringify({ installUrl: subscriber.wallet_card_url }), { status: 200 });
    }

    const BOOMERANG_API = 'https://api.digitalwallet.cards/api/v2';
    const apiKey = env.BOOMERANG_API_KEY;
    const templateId = env.BOOMERANG_CARD_ID;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-Key': apiKey,
    };

    // Split stored first_name into firstName + surname for Boomerang
    const fullName = (subscriber.first_name ?? '').trim();
    const spaceIndex = fullName.indexOf(' ');
    const firstName = spaceIndex > -1 ? fullName.slice(0, spaceIndex) : fullName;
    const surname = spaceIndex > -1 ? fullName.slice(spaceIndex + 1) : '';

    // Birthday: Boomerang expects YYYY-MM-DD
    const birthMonth = String(subscriber.birth_month ?? 1).padStart(2, '0');
    const birthDay = String(subscriber.birth_day ?? 1).padStart(2, '0');
    const dateOfBirth = `2000-${birthMonth}-${birthDay}`;

    // Step A: Create customer in Boomerang
    const customerRes = await fetch(`${BOOMERANG_API}/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        firstName,
        surname,
        email: subscriber.email,
        dateOfBirth,
      }),
    });

    if (!customerRes.ok) {
      const errText = await customerRes.text();
      console.error('[create-wallet-card] Customer create failed:', errText);
      return new Response(JSON.stringify({ error: 'Failed to create Boomerang customer' }), { status: 500 });
    }

    const customerData = await customerRes.json();
    const customerId = customerData.data?.id;

    if (!customerId) {
      console.error('[create-wallet-card] No customer ID in response:', customerData);
      return new Response(JSON.stringify({ error: 'No customer ID returned' }), { status: 500 });
    }

    // Step B: Issue card to customer
    const cardRes = await fetch(`${BOOMERANG_API}/cards`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        templateId,
        customerId,
      }),
    });

    if (!cardRes.ok) {
      const errText = await cardRes.text();
      console.error('[create-wallet-card] Card issue failed:', errText);
      return new Response(JSON.stringify({ error: 'Failed to issue wallet card' }), { status: 500 });
    }

    const cardData = await cardRes.json();
    const installUrl = cardData.data?.installLink;
    const boomerangCardId = cardData.data?.id ?? null;

    if (!installUrl) {
      console.error('[create-wallet-card] No install URL in response:', cardData);
      return new Response(JSON.stringify({ error: 'No install URL returned' }), { status: 500 });
    }

    // Step C: Persist to Neon
    await sql`
      UPDATE subscribers
      SET wallet_card_url = ${installUrl},
          boomerang_card_id = ${boomerangCardId}
      WHERE id = ${subscriber.id}
    `;

    return new Response(JSON.stringify({ installUrl }), { status: 200 });

  } catch (err) {
    console.error('[create-wallet-card] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};