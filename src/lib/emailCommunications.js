import { supabase } from './supabase';

const EMAIL_RE = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;
const IMPORT_BATCH_SIZE = 200;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function extractEmails(raw) {
  const matches = String(raw || '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi) || [];
  return matches.map(normalizeEmail);
}

export async function fetchEmailCampaigns() {
  const { data, error } = await supabase
    .from('email_campaigns')
    .select('id,subject,preheader,status,audience_type,created_by,created_at,sent_at,recipients_count,sent_count,delivered_count,opened_count,clicked_count,failed_count,last_error,creator:profiles!email_campaigns_created_by_fkey(full_name,email)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchEmailCampaignDetails(campaignId) {
  const [campaignResult, recipientsResult] = await Promise.all([
    supabase.from('email_campaigns').select('*,creator:profiles!email_campaigns_created_by_fkey(full_name,email)').eq('id', campaignId).single(),
    supabase.from('email_campaign_recipients').select('id,email,recipient_name,status,sent_at,delivered_at,opened_at,clicked_at,error').eq('campaign_id', campaignId).order('created_at', { ascending: true }),
  ]);
  if (campaignResult.error) throw campaignResult.error;
  if (recipientsResult.error) throw recipientsResult.error;
  return { campaign: campaignResult.data, recipients: recipientsResult.data || [] };
}

export async function saveEmailCampaign(payload, campaignId = null) {
  const clean = {
    subject: String(payload.subject || '').trim(),
    preheader: String(payload.preheader || '').trim() || null,
    html_content: String(payload.htmlContent || '').trim(),
    text_content: String(payload.textContent || '').trim() || null,
    sender_name: payload.senderName || 'Ultimate Fit',
    sender_email: normalizeEmail(payload.senderEmail || 'geral@ultimatefit.pt'),
    reply_to: normalizeEmail(payload.replyTo || 'geral@ultimatefit.pt'),
    audience_type: payload.audienceType,
    audience_ids: Array.isArray(payload.audienceIds) ? payload.audienceIds : [],
    status: 'draft',
    updated_at: new Date().toISOString(),
  };
  if (!clean.subject) throw new Error('Indica o assunto do email.');
  if (!clean.html_content) throw new Error('Escreve o conteúdo do email.');
  if (!clean.audience_type) throw new Error('Seleciona os destinatários.');
  if (campaignId) {
    const { data, error } = await supabase.from('email_campaigns').update(clean).eq('id', campaignId).eq('status', 'draft').select('*').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('email_campaigns').insert(clean).select('*').single();
  if (error) throw error;
  return data;
}

export async function invokeEmailCampaign({ campaignId, action = 'send', testEmail = '' }) {
  const { data, error } = await supabase.functions.invoke('send-email-campaign', { body: { campaignId, action, testEmail } });
  if (error) {
    let message = error.message || 'Não foi possível concluir o envio.';
    try {
      const context = await error.context?.json?.();
      if (context?.error) message = context.error;
      else if (context?.message) message = context.message;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchImportedEmailContacts() {
  const contacts = await supabase.from('email_contacts').select('id,email,name,created_at').order('created_at', { ascending: false });
  if (contacts.error) throw contacts.error;
  const rows = contacts.data || [];
  const prefByEmail = new Map();
  const emails = rows.map(item => item.email);
  for (let i = 0; i < emails.length; i += IMPORT_BATCH_SIZE) {
    const prefs = await supabase.from('email_marketing_preferences').select('email,enabled,unsubscribe_token').in('email', emails.slice(i, i + IMPORT_BATCH_SIZE));
    if (prefs.error) throw prefs.error;
    (prefs.data || []).forEach(pref => prefByEmail.set(pref.email, pref));
  }
  return rows.map(item => ({ ...item, preference: prefByEmail.get(item.email) || null }));
}

export async function importEmailContacts(emails) {
  const normalized = [...new Set((emails || []).map(normalizeEmail).filter(isValidEmail))];
  if (!normalized.length) return { imported: 0, existing: 0, total: 0 };

  // PostgREST serializa .in(...) no URL. Uma lista com milhares de emails pode
  // ultrapassar o limite do request e devolver apenas "Bad Request". Fazemos
  // todas as operações em lotes pequenos para que importações grandes sejam estáveis.
  const existingSet = new Set();
  for (let i = 0; i < normalized.length; i += IMPORT_BATCH_SIZE) {
    const batch = normalized.slice(i, i + IMPORT_BATCH_SIZE);
    const { data, error } = await supabase.from('email_contacts').select('email').in('email', batch);
    if (error) throw new Error(`Não foi possível verificar os contactos existentes (${i + 1}-${Math.min(i + batch.length, normalized.length)}). ${error.message || ''}`.trim());
    (data || []).forEach(item => existingSet.add(normalizeEmail(item.email)));
  }

  const rows = normalized.filter(email => !existingSet.has(email)).map(email => ({ email }));
  for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
    const { error } = await supabase.from('email_contacts').insert(batch);
    if (error) throw new Error(`Não foi possível importar os contactos (${i + 1}-${Math.min(i + batch.length, rows.length)}). ${error.message || ''}`.trim());
  }

  const preferenceRows = normalized.map(email => ({ email, enabled: true, source: 'imported' }));
  for (let i = 0; i < preferenceRows.length; i += IMPORT_BATCH_SIZE) {
    const batch = preferenceRows.slice(i, i + IMPORT_BATCH_SIZE);
    const { error } = await supabase.from('email_marketing_preferences').upsert(batch, { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw new Error(`Os contactos foram importados, mas não foi possível concluir as preferências de comunicação (${i + 1}-${Math.min(i + batch.length, preferenceRows.length)}). ${error.message || ''}`.trim());
  }

  return { imported: rows.length, existing: existingSet.size, total: normalized.length };
}

export async function setEmailMarketingEnabled(email, enabled) {
  const normalized = normalizeEmail(email);
  const { error } = await supabase.from('email_marketing_preferences').upsert({
    email: normalized,
    enabled: Boolean(enabled),
    source: 'manual',
    opted_out_at: enabled ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email' });
  if (error) throw error;
}
