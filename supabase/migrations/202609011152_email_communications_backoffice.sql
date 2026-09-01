create table if not exists public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_contacts_email_normalized check (email = lower(btrim(email))),
  constraint email_contacts_email_valid check (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'),
  constraint email_contacts_email_unique unique(email)
);

create table if not exists public.email_marketing_preferences (
  email text primary key,
  enabled boolean not null default true,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  source text not null default 'student' check (source in ('student','imported','manual','unsubscribe')),
  opted_out_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_marketing_preferences_email_normalized check (email = lower(btrim(email))),
  constraint email_marketing_preferences_email_valid check (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$')
);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(btrim(subject)) between 1 and 180),
  preheader text,
  html_content text not null check (char_length(btrim(html_content)) > 0),
  text_content text,
  sender_name text not null default 'Ultimate Fit',
  sender_email text not null default 'geral@ultimatefit.pt',
  reply_to text not null default 'geral@ultimatefit.pt',
  status text not null default 'draft' check (status in ('draft','sending','sent','failed')),
  audience_type text not null check (audience_type in ('all_students','active_students','selected_students','imported_contacts')),
  audience_ids uuid[] not null default '{}',
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  recipients_count integer not null default 0 check (recipients_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  delivered_count integer check (delivered_count is null or delivered_count >= 0),
  opened_count integer check (opened_count is null or opened_count >= 0),
  clicked_count integer check (clicked_count is null or clicked_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  last_error text
);

create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  student_id uuid references public.student_profiles(id) on delete set null,
  contact_id uuid references public.email_contacts(id) on delete set null,
  email text not null,
  recipient_name text,
  status text not null default 'pending' check (status in ('pending','sent','failed','delivered','opened','clicked','unsubscribed','skipped')),
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_campaign_recipients_email_normalized check (email = lower(btrim(email))),
  constraint email_campaign_recipients_unique unique(campaign_id,email)
);

create index if not exists email_campaigns_created_at_idx on public.email_campaigns(created_at desc);
create index if not exists email_campaigns_status_idx on public.email_campaigns(status);
create index if not exists email_campaign_recipients_campaign_idx on public.email_campaign_recipients(campaign_id,status);
create index if not exists email_contacts_created_at_idx on public.email_contacts(created_at desc);
create index if not exists email_preferences_token_idx on public.email_marketing_preferences(unsubscribe_token);

alter table public.email_contacts enable row level security;
alter table public.email_marketing_preferences enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;

drop policy if exists email_contacts_admin_all on public.email_contacts;
create policy email_contacts_admin_all on public.email_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists email_preferences_admin_all on public.email_marketing_preferences;
create policy email_preferences_admin_all on public.email_marketing_preferences for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists email_campaigns_admin_all on public.email_campaigns;
create policy email_campaigns_admin_all on public.email_campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists email_campaign_recipients_admin_select on public.email_campaign_recipients;
create policy email_campaign_recipients_admin_select on public.email_campaign_recipients for select to authenticated using (public.is_admin());

revoke all on public.email_contacts from anon;
revoke all on public.email_marketing_preferences from anon;
revoke all on public.email_campaigns from anon;
revoke all on public.email_campaign_recipients from anon;

grant select,insert,update,delete on public.email_contacts to authenticated;
grant select,insert,update on public.email_marketing_preferences to authenticated;
grant select,insert,update,delete on public.email_campaigns to authenticated;
grant select on public.email_campaign_recipients to authenticated;
