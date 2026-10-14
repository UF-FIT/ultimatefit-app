import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Dumbbell, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import '../styles/student-training-progress-page.css';

const aliases = {
  core:'Abdominais', abdominal:'Abdominais', abdominais:'Abdominais',
  peito:'Peito', peitoral:'Peito',
  posterior:'Isquiotibiais', posteriores:'Isquiotibiais', 'posterior da coxa':'Isquiotibiais', 'posteriores da coxa':'Isquiotibiais', isquiotibiais:'Isquiotibiais',
  quadriceps:'Quadríceps', gluteo:'Glúteos', gluteos:'Glúteos',
  adutor:'Adutores', adutores:'Adutores', abdutor:'Abdutores', abdutores:'Abdutores',
  ombro:'Ombros', ombros:'Ombros', bicep:'Bíceps', biceps:'Bíceps', tricep:'Tríceps', triceps:'Tríceps',
  trapezio:'Trapézio', trapezios:'Trapézio', costas:'Costas', dorsal:'Costas', dorsais:'Costas',
  antebraco:'Antebraço', lombar:'Lombar', perna:'Pernas', pernas:'Pernas',
  gemeo:'Gémeos', gemeos:'Gémeos', panturrilha:'Gémeos', panturrilhas:'Gémeos',
};

const muscles = [
  { key:'costas', label:'Costas', side:'left', top:13, points:'102,92 126,92 168,136' },
  { key:'peito', label:'Peitoral', side:'left', top:27, points:'102,174 126,174 179,193' },
  { key:'triceps', label:'Tríceps', side:'left', top:41, points:'102,256 124,256 153,190' },
  { key:'biceps', label:'Bíceps', side:'left', top:55, points:'102,338 124,338 163,220' },
  { key:'abdominais', label:'Abdómen', side:'left', top:69, points:'102,420 126,420 199,286' },
  { key:'gluteos', label:'Glúteo', side:'left', top:83, points:'102,502 127,502 177,350' },
  { key:'outros', label:'Outros', side:'left', top:95, points:'' },
  { key:'trapezio', label:'Trapézio', side:'right', top:13, points:'298,92 274,92 229,132' },
  { key:'ombros', label:'Ombros', side:'right', top:27, points:'298,174 274,174 252,158' },
  { key:'antebraco', label:'Antebraço', side:'right', top:48, points:'298,296 276,296 271,249' },
  { key:'pernas', label:'Pernas', side:'right', top:69, points:'298,420 276,420 230,350' },
  { key:'gemeos', label:'Barriga da perna', side:'right', top:86, points:'298,518 276,518 238,468' },
];

function normalize(value='') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
    .replace(/&/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function groupName(value='') { const key=normalize(value); return aliases[key] || String(value||'Outro').trim() || 'Outro'; }
function bucket(value='') {
  const key=normalize(groupName(value));
  if(['costas','dorsal','dorsais','lombar'].includes(key)) return 'costas';
  if(['peito','peitoral'].includes(key)) return 'peito';
  if(['triceps','tricep'].includes(key)) return 'triceps';
  if(['biceps','bicep'].includes(key)) return 'biceps';
  if(['abdominais','abdominal','core'].includes(key)) return 'abdominais';
  if(['gluteos','gluteo'].includes(key)) return 'gluteos';
  if(['trapezio','trapezios'].includes(key)) return 'trapezio';
  if(['ombros','ombro'].includes(key)) return 'ombros';
  if(['antebraco'].includes(key)) return 'antebraco';
  if(['quadriceps','isquiotibiais','posterior','posteriores','adutores','adutor','abdutores','abdutor','pernas','perna'].includes(key)) return 'pernas';
  if(['gemeos','gemeo','panturrilha','panturrilhas'].includes(key)) return 'gemeos';
  return 'outros';
}
function iso(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function monthWindow(offset=0){
  const now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth()+offset,1,12);
  const end=new Date(start.getFullYear(),start.getMonth()+1,1,12);
  return {startIso:iso(start),endIso:iso(end),label:new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(start).replace(/^./,c=>c.toUpperCase())};
}
function kg(value){return new Intl.NumberFormat('pt-PT',{maximumFractionDigits:0}).format(Math.round(Number(value)||0));}
function aggregate(records, mode){
  const map=new Map();
  records.forEach(record=>{
    const name=mode==='exercise' ? (record.exercise_name||'Exercício') : groupName(record.muscle_group);
    if(!map.has(name)) map.set(name,{name,total:0,latestWeight:null,latestDate:''});
    const row=map.get(name);
    row.total+=Number(record.volume_kg||0);
    if(record.weight_kg!=null && (!row.latestDate || record.completed_on>=row.latestDate)){
      row.latestDate=record.completed_on; row.latestWeight=Number(record.weight_kg);
    }
  });
  return [...map.values()].sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name,'pt'));
}
function distribution(records){
  const totals=new Map(muscles.map(item=>[item.key,0]));
  records.forEach(record=>{
    const key=bucket(record.muscle_group);
    totals.set(key,(totals.get(key)||0)+Math.max(0,Number(record.volume_kg||0)));
  });
  return muscles.map(item=>({...item,volume:totals.get(item.key)||0}));
}

function BodyMap({records}){
  const rows=useMemo(()=>distribution(records),[records]);
  return <div className="ufProgressBodyMap">
    <div className="ufProgressBodyCanvas">
      <svg viewBox="0 0 400 570" aria-hidden="true">
        <defs><filter id="ufProgressGlow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <g className="ufProgressBodyShape">
          <ellipse cx="200" cy="94" rx="30" ry="35"/>
          <path d="M178 121 C185 126 215 126 222 121 L224 143 C248 150 262 166 267 196 L276 282 L292 333 L283 344 L268 326 L251 269 L247 213 L239 300 C236 326 232 345 229 357 L171 357 C168 345 164 326 161 300 L153 213 L149 269 L132 326 L117 344 L108 333 L124 282 L133 196 C138 166 152 150 176 143 Z"/>
          <path d="M172 354 C161 382 158 418 161 455 L171 530 L194 530 L200 389 L206 530 L229 530 L239 455 C242 418 239 382 228 354 Z"/>
          <path d="M171 529 L194 529 L194 542 L164 542 Z"/><path d="M206 529 L229 529 L236 542 L206 542 Z"/>
        </g>
        <g className="ufProgressBodyLines">
          {rows.filter(item=>item.points).map(item=>{
            const pts=item.points.split(' '); const start=pts[0].split(','); const end=pts[pts.length-1].split(',');
            return <React.Fragment key={item.key}><polyline points={item.points}/><circle className="target" cx={end[0]} cy={end[1]} r="6"/><circle className="end" cx={start[0]} cy={start[1]} r="3"/></React.Fragment>;
          })}
        </g>
      </svg>
      {rows.map(item=><div className={`ufProgressBodyLabel ${item.side} ${item.key==='outros'?'no-line':''}`} style={{top:`${item.top}%`}} key={item.key}>
        <strong>{kg(item.volume)} kg</strong><span>{item.label}</span>
      </div>)}
    </div>
    <p>*com base no histórico dos exercícios realizados</p>
  </div>;
}

function Breakdown({rows, title, emptyText, query=''}) {
  const filtered=rows.filter(row=>!query || normalize(row.name).includes(normalize(query)));
  const max=Math.max(1,...filtered.map(row=>row.total));
  return <div className="ufProgressBreakdownCard">
    <div className="ufProgressBreakdownHeader"><b>{title}</b><span>Volume realizado</span></div>
    {filtered.length ? <div className="ufProgressBreakdownRows">{filtered.map(row=>{
      const width=row.total ? Math.max(2,(row.total/max)*100) : 0;
      return <div className="ufProgressBreakdownRow" key={row.name}>
        <span title={row.name}>{row.name}</span>
        <i><em style={{width:`${width}%`}}/></i>
        <b>{kg(row.total)} kg</b>
        {row.latestWeight!=null && <small>Última carga: {kg(row.latestWeight)} kg</small>}
      </div>;
    })}</div> : <div className="ufProgressPageEmpty"><Dumbbell size={28}/><b>{emptyText}</b></div>}
  </div>;
}

export default function StudentTrainingProgressPage({studentId,onBack}) {
  const [page,setPage]=useState(0);
  const [offset,setOffset]=useState(0);
  const [records,setRecords]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [searchOpen,setSearchOpen]=useState(false);
  const [query,setQuery]=useState('');
  const touch=useRef(null);

  useEffect(()=>{
    let cancelled=false; setLoading(true); setError('');
    Promise.all([
      supabase.from('workout_exercise_loads').select('exercise_name,muscle_group,weight_kg,volume_kg,completed_on,created_at').eq('student_id',studentId).order('completed_on',{ascending:true}).order('created_at',{ascending:true}),
      supabase.from('workout_run_set_results').select('exercise_name,muscle_group,weight_kg,volume_kg,completed_on,created_at,run_id,workout_item_id,set_index').eq('student_id',studentId).order('completed_on',{ascending:true}).order('created_at',{ascending:true}),
    ]).then(([legacyResult,runResult])=>{
      if(cancelled)return;
      const err=legacyResult.error||runResult.error;
      if(err){setError(err.message||'Não foi possível carregar o teu progresso.');setRecords([]);return;}
      const legacy=(legacyResult.data||[]).map(row=>({...row,source_kind:'legacy'}));
      const run=(runResult.data||[]).map(row=>({...row,source_kind:'run_set'}));
      setRecords([...legacy,...run].sort((a,b)=>String(a.completed_on).localeCompare(String(b.completed_on))||String(a.created_at||'').localeCompare(String(b.created_at||''))));
    }).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[studentId]);

  useEffect(()=>{
    const refresh=()=>setOffset(value=>value);
    window.addEventListener('uf:exercise-load-saved',refresh);
    return ()=>window.removeEventListener('uf:exercise-load-saved',refresh);
  },[]);

  const view=useMemo(()=>{
    const window=monthWindow(offset);
    const monthRecords=records.filter(record=>record.completed_on>=window.startIso&&record.completed_on<window.endIso);
    return {
      window, monthRecords,
      muscleRows:aggregate(monthRecords,'muscle'),
      exerciseRows:aggregate(monthRecords,'exercise'),
    };
  },[records,offset]);

  function move(delta){setPage(current=>Math.max(0,Math.min(2,current+delta)));}
  function selectPage(index){setPage(Math.max(0,Math.min(2,index)));}
  const pageTitle=page===0?'Distribuição muscular':page===1?'Volume por músculo':'Volume por exercício';

  return <section className="ufProgressPage"
    onTouchStart={event=>{touch.current=event.touches?.[0]?.clientX??null;}}
    onTouchEnd={event=>{if(touch.current==null)return;const end=event.changedTouches?.[0]?.clientX??touch.current;const delta=end-touch.current;touch.current=null;if(Math.abs(delta)>50)move(delta>0?-1:1);}}
  >
    <header className="ufProgressPageHeader">
      <button type="button" onClick={onBack} aria-label="Voltar"><ArrowLeft/></button>
      <h1>Meu progresso</h1>
      <button type="button" onClick={()=>{setSearchOpen(value=>!value);if(page!==2)setPage(2);}} aria-label="Pesquisar exercício"><Search/></button>
    </header>

    {searchOpen && <div className="ufProgressSearch"><Search size={18}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Pesquisar exercício"/><button type="button" onClick={()=>{setSearchOpen(false);setQuery('');}}><X size={18}/></button></div>}

    <div className="ufProgressPageMonth">
      <button type="button" onClick={()=>setOffset(value=>value-1)}><ChevronLeft/></button>
      <b>{view.window.label}</b>
      <button type="button" disabled={offset>=0} onClick={()=>setOffset(value=>Math.min(0,value+1))}><ChevronRight/></button>
    </div>

    <div className="ufProgressPageSlide" key={page}>
      {loading ? <div className="ufProgressPageState">A carregar o teu progresso…</div>
        : error ? <div className="ufProgressPageState error">{error}</div>
        : page===0 ? <>
          <button type="button" className="ufProgressHistoryPill" onClick={()=>selectPage(1)}>VER HISTÓRICO DE TREINOS</button>
          <BodyMap records={view.monthRecords}/>
        </>
        : page===1 ? <Breakdown rows={view.muscleRows} title={pageTitle} emptyText="Ainda não tens registos neste mês"/>
        : <Breakdown rows={view.exerciseRows} title={pageTitle} emptyText="Ainda não tens exercícios registados neste mês" query={query}/>}
    </div>

    <div className="ufProgressDots" aria-label="Páginas de progresso">
      {[0,1,2].map(index=><button type="button" key={index} className={page===index?'active':''} onClick={()=>selectPage(index)} aria-label={`Página ${index+1}`}/>)}
    </div>
  </section>;
}
