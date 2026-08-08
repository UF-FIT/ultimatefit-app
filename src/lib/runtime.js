import {supabase} from './supabase';

const fallback={maintenanceMode:false,maintenanceMessage:'Estamos a realizar uma atualização. Voltamos dentro de momentos.'};
export async function fetchRuntimeSettings(){
  if(!supabase)return fallback;
  const {data,error}=await supabase.from('app_runtime_settings').select('maintenance_mode,maintenance_message,updated_at').eq('id','global').maybeSingle();
  if(error){if(error.code==='42P01')return fallback;throw error;}
  return data?{maintenanceMode:Boolean(data.maintenance_mode),maintenanceMessage:data.maintenance_message||fallback.maintenanceMessage,updatedAt:data.updated_at}:fallback;
}
export async function saveRuntimeSettings(input){
  const payload={maintenance_mode:Boolean(input.maintenanceMode),maintenance_message:(input.maintenanceMessage||'').trim()||fallback.maintenanceMessage};
  const {data,error}=await supabase.from('app_runtime_settings').update(payload).eq('id','global').select().single();
  if(error)throw error;
  return {maintenanceMode:Boolean(data.maintenance_mode),maintenanceMessage:data.maintenance_message||fallback.maintenanceMessage,updatedAt:data.updated_at};
}
