import {supabase} from './supabase';
export const sessionKinds={individual:'Sessão individual',group:'Aula de grupo',assessment:'Avaliação',online:'Sessão online'};
export const attendanceLabels={booked:'Por registar',present:'Presente',absent:'Faltou',cancelled:'Cancelada'};
export function addDays(value,n){const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);}
export function monday(value){const date=new Date(value+'T12:00:00Z');return addDays(value,-((date.getUTCDay()+6)%7));}
export function localDateTime(value){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;}
export const shortDate=value=>new Date(value+'T12:00:00Z').toLocaleDateString('pt-PT',{day:'numeric',month:'short',timeZone:'UTC'});
export async function agendaRpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.code==='23505'?'Este registo já existe. Atualiza a agenda.':error.message||'Não foi possível guardar. Tenta novamente.');return data;}
