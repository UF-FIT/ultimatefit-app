import { supabase } from './supabase';

const COMMUNITY_BUCKET='community-media';

export function mapNotice(row){return {id:row.id,title:row.title,body:row.body,targetAudience:row.target_audience,showPopup:row.show_popup!==false,showDashboard:row.show_dashboard!==false,active:row.is_active!==false,activeFrom:row.active_from,activeUntil:row.active_until,imageUrl:row.image_url||'',imagePath:row.image_path||'',createdAt:row.created_at};}
export async function fetchNotices(){
  const {data,error}=await supabase.from('app_notices').select('*').order('active_from',{ascending:false});
  if(error){if(error.code==='42P01') return []; throw error;} return (data||[]).map(mapNotice);
}
export async function saveNotice(input){
  const payload={title:input.title.trim(),body:input.body.trim(),target_audience:input.targetAudience||'students',show_popup:input.showPopup!==false,show_dashboard:input.showDashboard!==false,is_active:input.active!==false,active_from:input.activeFrom||new Date().toISOString(),active_until:input.activeUntil||null,image_url:input.imageUrl||null,image_path:input.imagePath||null};
  const q=input.id?supabase.from('app_notices').update(payload).eq('id',input.id):supabase.from('app_notices').insert(payload);
  const {data,error}=await q.select().single(); if(error) throw error; return mapNotice(data);
}
export async function toggleNotice(id,active){const {error}=await supabase.from('app_notices').update({is_active:active}).eq('id',id);if(error)throw error;}
export async function deleteNotice(notice){
  if(notice?.imagePath) await removeCommunityImage(notice.imagePath);
  const {error}=await supabase.from('app_notices').delete().eq('id',notice.id);if(error)throw error;
}

export function mapActivity(row){return {id:row.id,title:row.title,slug:row.slug,description:row.description||'',eventDate:row.event_date,startTime:row.start_time||'',location:row.location||'',feeCents:row.fee_cents||0,capacity:row.capacity,posterUrl:row.poster_url||'',posterPath:row.poster_path||'',registrationOpen:row.registration_open!==false,registrationDeadline:row.registration_deadline||'',active:row.is_active!==false,createdAt:row.created_at};}
export function mapRegistration(row){return {id:row.id,activityId:row.activity_id,studentId:row.student_id,status:row.status,paymentStatus:row.payment_status,amountPaidCents:row.amount_paid_cents||0,registeredAt:row.registered_at,paidAt:row.paid_at,notes:row.notes||''};}
export async function fetchActivities(){
  const [a,r]=await Promise.all([
    supabase.from('activities').select('*').order('event_date',{ascending:true}),
    supabase.from('activity_registrations').select('*').order('registered_at',{ascending:true}),
  ]);
  if(a.error){if(a.error.code==='42P01')return {activities:[],registrations:[]};throw a.error;} if(r.error&&r.error.code!=='42P01')throw r.error;
  return {activities:(a.data||[]).map(mapActivity),registrations:(r.data||[]).map(mapRegistration)};
}
function slugify(v=''){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
export async function saveActivity(input){
  const payload={title:input.title.trim(),slug:input.slug?.trim()||slugify(input.title),description:input.description?.trim()||null,event_date:input.eventDate,start_time:input.startTime||null,location:input.location?.trim()||null,fee_cents:Math.max(0,Math.round(Number(input.feeEuros||0)*100)),capacity:input.capacity?Number(input.capacity):null,poster_url:input.posterUrl||null,poster_path:input.posterPath||null,registration_open:input.registrationOpen!==false,registration_deadline:input.registrationDeadline||null,is_active:input.active!==false};
  const q=input.id?supabase.from('activities').update(payload).eq('id',input.id):supabase.from('activities').insert(payload);
  const {data,error}=await q.select().single();if(error){if(error.code==='23505')throw new Error('Já existe uma atividade com este endereço/slug.');throw error;}return mapActivity(data);
}
export async function deleteActivity(activity){
  if(activity?.posterPath) await removeCommunityImage(activity.posterPath);
  const {error}=await supabase.from('activities').delete().eq('id',activity.id);if(error)throw error;
}
export async function registerActivity(activityId){const {data,error}=await supabase.rpc('register_for_activity',{target_activity_id:activityId});if(error)throw error;return data;}
export async function cancelActivity(activityId){const {data,error}=await supabase.rpc('cancel_activity_registration',{target_activity_id:activityId});if(error)throw error;return data;}
export async function setActivityPayment(registration,activity,paid){
  const payload=paid?{payment_status:'paid',amount_paid_cents:activity.feeCents,paid_at:new Date().toISOString()}:{payment_status:activity.feeCents>0?'pending':'not_applicable',amount_paid_cents:0,paid_at:null};
  const {error}=await supabase.from('activity_registrations').update(payload).eq('id',registration.id);if(error)throw error;
}
export async function toggleActivity(id,active){const {error}=await supabase.from('activities').update({is_active:active}).eq('id',id);if(error)throw error;}

export async function uploadCommunityImage(kind,blob){
  if(!blob)return {path:'',url:''};
  const safeKind=kind==='notices'?'notices':'activities';
  const path=`${safeKind}/${crypto.randomUUID()}.webp`;
  const {error}=await supabase.storage.from(COMMUNITY_BUCKET).upload(path,blob,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
  if(error)throw error;
  const {data}=supabase.storage.from(COMMUNITY_BUCKET).getPublicUrl(path);
  return {path,url:data.publicUrl};
}
export async function removeCommunityImage(path){
  if(!path)return;
  const {error}=await supabase.storage.from(COMMUNITY_BUCKET).remove([path]);
  if(error)throw error;
}
