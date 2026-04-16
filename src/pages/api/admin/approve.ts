import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

function getCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim() || null;
  }
  return null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const session = getCookie(request.headers.get('cookie'), 'admin_session');

  if (!env.ADMIN_PASSWORD || !session || session !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing or invalid id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sql = getDb(env.DATABASE_URL);
  try {
    await sql`
      UPDATE listings
      SET status = 'approved', updated_at = now()
      WHERE id = ${id}
    `;
  } catch (err) {
    console.error('[admin/approve] DB error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
