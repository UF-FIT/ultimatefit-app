import { supabase } from './supabase';

const EMAIL_RE = /^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i;

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
    supabase
      .from('email_campaigns')
      .select('*,creator:profiles!email_campaigns_created_by_fkey(full_name,email)')
      .eq('id', campaignId)
      .single(),
    supabase
      .from('email_campaign_recipients')
      .select('id,email,recipient_name,status,sent_at,delivered_at,opened_at,clicked_at,error')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true }),
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
  const { data, error } = await supabase.functions.invoke('send-email-campaign', {
    body: { campaignId, action, testEmail },
  });
  if (error) {
    let message = error.message || 'Não foi possível concluir o envio.';
    try {
      const context = await error.context?.json?.();
      if (context?.error) message = context.error;
      else if (context?.message) message = context.message;
    } catch {
      // Keep the original message.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchImportedEmailContacts() {
  const { data, error } = await supabase
    .from('email_contacts')
    .select('id,email,name,created_at,preference:email_marketing_preferences!email_contacts_email_fkey(enabled,unsubscribe_token)')
    .order('created_at', { ascending: false });
  if (!error) return data || [];

  // The preference relation is intentionally optional; fall back to the contact list.
  const fallback = await supabase.from('email_contacts').select('id,email,name,created_at').order('created_at', { ascending: false });
  if (fallback.error) throw fallback.error;
  const emails = (fallback.data || []).map(item => item.email);
  const prefByEmail = new Map();
  if (emails.length) {
    const prefs = await supabase.from('email_marketing_preferences').select('email,enabled,unsubscribe_token').in('email', emails);
    if (!prefs.error) (prefs.data || []).forEach(pref => prefByEmail.set(pref.email, pref));
  }
  return (fallback.data || []).map(item => ({ ...item, preference: prefByEmail.get(item.email) || null }));
}

export async function importEmailContacts(emails) {
  const normalized = [...new Set((emails || []).map(normalizeEmail).filter(isValidEmail))];
  if (!normalized.length) return { imported: 0 };
  const { data: existing, error: existingError } = await supabase.from('email_contacts').select('email').in('email', normalized);
  if (existingError) throw existingError;
  const existingSet = new Set((existing || []).map(item => item.email));
  const rows = normalized.filter(email => !existingSet.has(email)).map(email => ({ email }));
  if (rows.length) {
    const { error } = await supabase.from('email_contacts').insert(rows);
    if (error) throw error;
  }
  const preferenceRows = normalized.map(email => ({ email, enabled: true, source: 'imported' }));
  const { error: preferenceError } = await supabase.from('email_marketing_preferences').upsert(preferenceRows, { onConflict: 'email', ignoreDuplicates: true });
  if (preferenceError) throw preferenceError;
  return { imported: rows.length, existing: existingSet.size, total: normalized.length };
}

export async function setEmailMarketingEnabled(email, enabled) {
  const normalized = normalizeEmail(email);
  const { error } = await supabase.from('email_marketing_preferences').upsert({
    email: normalized,
    enabled: Boolean(enabled),
    source: enabled ? 'manual' : 'manual',
    opted_out_at: enabled ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email' });
  if (error) throw error;
}
