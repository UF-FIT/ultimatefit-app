import React,{useEffect,useState} from 'react';
import {paymentRpc} from '../lib/payments';

export default function StudentModuleAccess({student,currentUser}){
 const [allowed,setAllowed]=useState(false),[saved,setSaved]=useState(null),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;if(currentUser.role==='aluno')return;setAllowed(false);setSaved(null);setDraft(null);setError('');
 (async()=>{try{const canManage=await paymentRpc('payment_can_manage',{p_student:student.id});if(!active||!canManage)return;setAllowed(true);const value=await paymentRpc('get_student_module_permissions',{p_student:student.id});if(active){setSaved(value);setDraft(value);}}catch(err){if(active)setError(err.message);} })();return()=>{active=false;};},[student.id,currentUser.id,currentUser.role,reload]);
 if(currentUser.role==='aluno'||(!allowed&&!error))return null;
 async function save(e){e.preventDefault();if(busy||!draft)return;setBusy(true);setError('');setNotice('');try{await paymentRpc('set_student_module_permissions',{p_student:student.id,p_agenda:draft.agenda,p_payments:draft.payments});setSaved({...draft});setNotice('Acessos do aluno guardados.');}catch(err){setError(err.message);}finally{setBusy(false);}}
 const dirty=draft&&saved&&(draft.agenda!==saved.agenda||draft.payments!==saved.payments);
 return <section className="card pad studentModuleAccess"><span className="eyebrow">ACESSOS DO ALUNO</span><h2>Agenda e pagamentos</h2><p style={{fontSize:13}}>Escolhe as secções que este aluno pode consultar na app.</p>
 {draft&&<form onSubmit={save} style={{display:'grid',gap:14}}>{[['agenda','Permitir acesso à Agenda'],['payments','Permitir acesso aos Pagamentos']].map(([key,label])=><label key={key} style={{display:'flex',alignItems:'center',gap:10,fontSize:14}}><input type="checkbox" checked={draft[key]} disabled={busy} onChange={e=>{setDraft(value=>({...value,[key]:e.target.checked}));setNotice('');}} style={{width:20,height:20,minHeight:20,flexShrink:0,accentColor:'#ffdd00'}}/>{label}</label>)}<button type="submit" className="primary" disabled={busy||!dirty}>{busy?'A guardar…':'Guardar acessos'}</button></form>}
 {notice&&<p role="status" className="successBanner">{notice}</p>}{error&&<div role="alert" className="errorBanner">{error}{!draft&&<button onClick={()=>setReload(n=>n+1)}>Tentar novamente</button>}</div>}
 {!draft&&!error&&<p role="status">A carregar acessos…</p>}</section>;
}
