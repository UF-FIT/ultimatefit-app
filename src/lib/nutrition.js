import { supabase } from './supabase';

const BUCKET = 'nutrition-documents';
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function safePdfName(name = 'plano-alimentar.pdf') {
  const base = String(name || 'plano-alimentar.pdf').replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-');
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

async function signedUrl(path, expiresIn = 3600) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return '';
  return data?.signedUrl || '';
}

export async function fetchNutritionDocuments() {
  const { data: rows, error } = await supabase
    .from('nutrition_documents')
    .select('id,student_id,title,notes,file_path,file_name,file_size_bytes,mime_type,uploaded_by,is_current,created_at,updated_at')
    .order('is_current', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  const uploaderIds = [...new Set((rows || []).map(item => item.uploaded_by).filter(Boolean))];
  let uploaderById = new Map();
  if (uploaderIds.length) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id,full_name,first_name,last_name,role')
      .in('id', uploaderIds);
    if (!profileError) uploaderById = new Map((profiles || []).map(item => [item.id, item]));
  }
  return Promise.all((rows || []).map(async row => {
    const uploader = uploaderById.get(row.uploaded_by);
    return {
      id: row.id,
      studentId: row.student_id,
      title: row.title,
      notes: row.notes || '',
      filePath: row.file_path,
      fileName: row.file_name,
      fileSizeBytes: row.file_size_bytes,
      mimeType: row.mime_type,
      uploadedBy: row.uploaded_by,
      uploadedByName: uploader?.full_name || [uploader?.first_name, uploader?.last_name].filter(Boolean).join(' ') || 'ULTIMATE FIT',
      uploadedByRole: uploader?.role || '',
      isCurrent: row.is_current !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      url: await signedUrl(row.file_path),
    };
  }));
}

export async function fetchNutritionConsultationRequests() {
  const { data: rows, error } = await supabase
    .from('nutrition_consultation_requests')
    .select('id,student_id,requested_by,status,message,handled_by,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return (rows || []).map(row => ({
    id: row.id,
    studentId: row.student_id,
    requestedBy: row.requested_by,
    status: row.status,
    message: row.message || '',
    handledBy: row.handled_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function requestNutritionConsultation({ studentId, message = '' }) {
  if (!studentId) throw new Error('Não foi possível identificar o aluno.');
  const { data, error } = await supabase
    .from('nutrition_consultation_requests')
    .insert({
      student_id: studentId,
      message: String(message || '').trim() || null,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um pedido de consulta em acompanhamento.');
    throw error;
  }

  let notificationSent = false;
  try {
    const { data: notification, error: notificationError } = await supabase.functions.invoke('notify-nutrition-consultation', {
      body: { requestId: data.id },
    });
    if (notificationError || notification?.error) {
      console.error('Nutrition consultation notification failed:', notificationError || notification.error);
    } else {
      notificationSent = true;
    }
  } catch (notificationError) {
    console.error('Nutrition consultation notification failed:', notificationError);
  }

  return { id: data.id, notificationSent };
}

export async function updateNutritionConsultationRequestStatus({ id, status }) {
  if (!id) throw new Error('Pedido inválido.');
  const allowed = ['requested', 'contacted', 'scheduled', 'completed', 'cancelled'];
  if (!allowed.includes(status)) throw new Error('Estado do pedido inválido.');
  const { error } = await supabase
    .from('nutrition_consultation_requests')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function uploadNutritionDocument({ studentId, title, notes, file }) {
  if (!studentId) throw new Error('Seleciona o aluno.');
  if (!String(title || '').trim()) throw new Error('Indica um título para o plano alimentar.');
  if (!file) throw new Error('Seleciona um ficheiro PDF.');
  const isPdf = file.type === 'application/pdf' || String(file.name || '').toLowerCase().endsWith('.pdf');
  if (!isPdf) throw new Error('Apenas são aceites ficheiros PDF.');
  if (file.size > MAX_FILE_BYTES) throw new Error('O PDF deve ter no máximo 8 MB.');

  const uid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fileName = safePdfName(file.name);
  const filePath = `${studentId}/${uid}-${fileName}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    contentType: 'application/pdf', cacheControl: '3600', upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('nutrition_documents')
    .insert({
      student_id: studentId,
      title: String(title).trim(),
      notes: String(notes || '').trim() || null,
      file_path: filePath,
      file_name: fileName,
      file_size_bytes: file.size,
      mime_type: 'application/pdf',
      is_current: false,
    })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    throw error;
  }

  const { error: promoteError } = await supabase.rpc('promote_nutrition_document', { p_document_id: data.id });
  if (promoteError) {
    await supabase.from('nutrition_documents').delete().eq('id', data.id);
    await supabase.storage.from(BUCKET).remove([filePath]);
    throw promoteError;
  }
  return data.id;
}

export async function replaceNutritionDocument(input) {
  return uploadNutritionDocument(input);
}

export async function deleteNutritionDocument(document) {
  if (!document?.id) throw new Error('Documento inválido.');
  const wasCurrent = document.isCurrent !== false;
  const studentId = document.studentId;

  const { error } = await supabase.from('nutrition_documents').delete().eq('id', document.id);
  if (error) throw error;

  if (document.filePath) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([document.filePath]);
    if (storageError) console.warn('Não foi possível remover o PDF órfão do armazenamento:', storageError);
  }

  if (wasCurrent && studentId) {
    const { data: fallback } = await supabase
      .from('nutrition_documents')
      .select('id')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback?.id) {
      const { error: promoteError } = await supabase.rpc('promote_nutrition_document', { p_document_id: fallback.id });
      if (promoteError) console.warn('Não foi possível promover o plano alimentar anterior:', promoteError);
    }
  }
}

export async function refreshNutritionDocumentUrl(document) {
  return signedUrl(document?.filePath);
}
