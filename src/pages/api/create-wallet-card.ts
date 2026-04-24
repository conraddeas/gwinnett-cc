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
      SELECT id, email, boomerang_customer_id, wallet_card_url
      FROM subscribers
      WHERE profile_token = ${token}
      LIMIT 1
    `;

    const subscriber = rows[0];
    if (!subscriber) {
      return new Response(JSON.stringify({ error: 'Subscriber not found' }), { status: 404 });
    }

    // Already issued — return existing URL
    if (subscriber.wallet_card_url) {
      return new Response(JSON.stringify({ installUrl: subscriber.wallet_card_url }), { status: 200 });
    }

    if (!subscriber.boomerang_customer_id) {
      return new Response(JSON.stringify({ error: 'No Boomerang customer on file. Please contact support.' }), { status: 400 });
    }

    const BOOMERANG_API = 'https://api.digitalwallet.cards/api/v2';
    const apiKey = env.BOOMERANG_API_KEY;
    const templateId = env.BOOMERANG_CARD_ID;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-Key': apiKey,
    };

    // Issue card using existing Boomerang customer
    const cardRes = await fetch(`${BOOMERANG_API}/cards`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        templateId,
        customerId: subscriber.boomerang_customer_id,
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