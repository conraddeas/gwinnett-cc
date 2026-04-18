import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';

function getCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === name) return v || null;
  }
  return null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime.env;
  const cookieHeader = request.headers.get('cookie');
  const sessionValue = getCookie(cookieHeader, 'admin_session');

  // Verify Admin Auth via Cookie
  if (!env.ADMIN_PASSWORD || sessionValue !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing inquiry ID' }), { status: 400 });
    }

    const sql = getDb(env.DATABASE_URL);

    // Archive the inquiry
    await sql`
      UPDATE partner_inquiries
      SET status = 'archived'
      WHERE id = ${id}
    `;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Archive inquiry error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};