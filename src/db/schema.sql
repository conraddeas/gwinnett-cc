CREATE TABLE IF NOT EXISTS listings (
  id                       uuid primary key default gen_random_uuid(),
  directory                text not null,
  business_name            text not null,
  slug                     text not null unique,
  website                  text,
  contact_email            text not null,
  short_description        text,
  full_description         text,
  category                 text,
  tags                     jsonb default '[]',
  logo_url                 text,
  city                     text,
  cities_served            jsonb default '[]',
  locally_owned            boolean default false,
  veteran_owned            boolean default false,
  tier                     text default 'free',
  status                   text default 'pending',
  featured_until           date,
  directory_specific_data  jsonb default '{}',
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id                        uuid primary key default gen_random_uuid(),
  email                     text not null unique,
  first_name                text,
  city                      text,
  birth_month               int,
  birth_day                 int,
  source                    text,
  status                    text default 'active',
  profile_token             text unique,
  encharge_contact_id       text,
  boomerang_customer_id     text,
  boomerang_card_id         text,
  boomerang_template_id     text,
  wallet_card_url           text,
  wallet_card_created_at    timestamptz,
  wallet_card_installed_at  timestamptz,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id                                uuid primary key default gen_random_uuid(),
  slug                              text not null unique,
  subject_line                      text,
  local_hook                        text,
  featured_birthday_listing_id      uuid references listings(id),
  featured_home_service_listing_id  uuid references listings(id),
  spotlight_listing_id              uuid references listings(id),
  welcome_item                      text,
  status                            text default 'draft',
  sent_at                           timestamptz,
  created_at                        timestamptz default now()
);
