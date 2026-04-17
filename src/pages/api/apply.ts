import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';

function generateSlug(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

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

  const directory    = typeof body.directory         === 'string' ? body.directory.trim()         : 'birthday-deals';
  const businessName = typeof body.business_name     === 'string' ? body.business_name.trim()     : '';
  const website      = typeof body.website           === 'string' ? body.website.trim()           : '';
  const contactEmail = typeof body.contact_email     === 'string' ? body.contact_email.trim()     : '';
  const shortDesc    = typeof body.short_description === 'string' ? body.short_description.trim() : '';
  const category     = typeof body.category          === 'string' ? body.category.trim()          : '';
  const city         = typeof body.city              === 'string' ? body.city.trim()              : '';
  const deal         = typeof body.deal              === 'string' ? body.deal.trim()              : '';

  const missing: string[] = [];
  if (!businessName) missing.push('Business name');
  if (!website)      missing.push('Website');
  if (!contactEmail) missing.push('Contact email');
  if (!shortDesc)    missing.push('Short description');
  if (!category)     missing.push('Category');
  if (!city)         missing.push('City');
  if (directory === 'birthday-deals' && !deal) missing.push('Deal / offer description');

  if (missing.length > 0) {
    return new Response(
      JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (shortDesc.length > 140) {
    return new Response(
      JSON.stringify({ error: 'Short description must be 140 characters or fewer.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const fullDesc       = typeof body.full_description === 'string' ? body.full_description.trim() || null : null;
  const phone          = typeof body.phone            === 'string' ? body.phone.trim()            || null : null;
  const locallyOwned   = body.locally_owned === true;
  const veteranOwned   = body.veteran_owned === true;
  const tier           = body.tier === 'paid' ? 'paid' : 'free';
  const citiesServed   = body.cities_served
    ? (Array.isArray(body.cities_served) ? body.cities_served : [body.cities_served])
    : [];
  const licensedInsured = body.licensed_insured === 'true';
  const freeEstimate    = body.free_estimate    === 'true';

  if (fullDesc && fullDesc.length > 300) {
    return new Response(
      JSON.stringify({ error: 'Full description must be 300 characters or fewer.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const slug = generateSlug(businessName);
  const directorySpecificData = { deal, phone, licensed_insured: licensedInsured, free_estimate: freeEstimate, cities_served: citiesServed };

  const env = (locals as any).runtime.env;
  const sql = getDb(env.DATABASE_URL);

  try {
    await sql`
      INSERT INTO listings (
        directory, business_name, slug, website, contact_email,
        short_description, full_description, category, city,
        locally_owned, veteran_owned, tier, status,
        directory_specific_data
      ) VALUES (
        ${directory},
        ${businessName},
        ${slug},
        ${website},
        ${contactEmail},
        ${shortDesc},
        ${fullDesc},
        ${category},
        ${city},
        ${locallyOwned},
        ${veteranOwned},
        ${tier},
        'pending',
        ${JSON.stringify(directorySpecificData)}::jsonb
      )
    `;
  } catch (err) {
    console.error('[apply] DB insert failed:', err);
    return new Response(
      JSON.stringify({ error: 'Database error. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
