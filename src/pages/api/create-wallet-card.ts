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
    const cardId = env.BOOMERANG_CARD_ID;

    // Birthday: stored as separate month/day integers — combine with placeholder year
    const birthMonth = String(subscriber.birth_month ?? 1).padStart(2, '0');
    const birthDay = String(subscriber.birth_day ?? 1).padStart(2, '0');
    const birthday = `2000-${birthMonth}-${birthDay}`;

    // Step A: Create customer in Boomerang
    const customerRes = await fetch(`${BOOMERANG_API}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: subscriber.first_name ?? '',
        email: subscriber.email,
        birthday,
      }),
    });

    if (!customerRes.ok) {
      const errText = await customerRes.text();
      console.error('[create-wallet-card] Customer create failed:', errText);
      return new Response(JSON.stringify({ error: 'Failed to create Boomerang customer' }), { status: 500 });
    }

    const customerData = await customerRes.json();
    // Field name may vary — check actual API response and adjust if needed
    const customerId = customerData.id ?? customerData.customerId ?? customerData.customer_id;

    if (!customerId) {
      console.error('[create-wallet-card] No customer ID in response:', customerData);
      return new Response(JSON.stringify({ error: 'No customer ID returned' }), { status: 500 });
    }

    // Step B: Issue card to customer
    const cardRes = await fetch(`${BOOMERANG_API}/cards/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        cardId,
        customerId,
      }),
    });

    if (!cardRes.ok) {
      const errText = await cardRes.text();
      console.error('[create-wallet-card] Card issue failed:', errText);
      return new Response(JSON.stringify({ error: 'Failed to issue wallet card' }), { status: 500 });
    }

    const cardData = await cardRes.json();
    // Field names may vary — check actual API response and adjust if needed
    const installUrl = cardData.installUrl ?? cardData.install_url ?? cardData.url ?? cardData.link;
    const boomerangCardId = cardData.id ?? cardData.cardId ?? cardData.card_id ?? cardData.serial;

    if (!installUrl) {
      console.error('[create-wallet-card] No install URL in response:', cardData);
      return new Response(JSON.stringify({ error: 'No install URL returned' }), { status: 500 });
    }

    // Step C: Persist to Neon
    await sql`
      UPDATE subscribers
      SET wallet_card_url = ${installUrl},
          boomerang_card_id = ${boomerangCardId ?? null}
      WHERE id = ${subscriber.id}
    `;

    return new Response(JSON.stringify({ installUrl }), { status: 200 });

  } catch (err) {
    console.error('[create-wallet-card] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};