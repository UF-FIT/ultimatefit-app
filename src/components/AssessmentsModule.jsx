import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Archive, ArrowLeft, BarChart3, Camera, CheckCircle2,
  ChevronRight, ClipboardList, Edit3, Eye, FileText, HeartPulse, Images, Plus,
  Ruler, Save, Scale, Search, ShieldCheck, Trash2, UserRound,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../contexts/AppContext';
import {
  activityLevelLabel, archiveAssessment, assessmentMetrics, assessmentModuleLabels,
  assessmentStatusLabel, deleteDraftAssessment, publishAssessment, riskResultLabel,
  saveAssessment, skinfoldSum, uploadAssessmentPhoto,
} from '../lib/assessments';

const fmt = value => value ? new Intl.DateTimeFormat('pt-PT').format(new Date(`${value}T12:00:00`)) : '—';
const num = value => value === null || value === undefined || value === '' ? null : Number(value);
const bool = value => value === '' || value === null || value === undefined ? null : String(value) === 'true';
const boolValue = value => value === true ? 'true' : value === false ? 'false' : '';
const cx = (...items) => items.filter(Boolean).join(' ');

const perimetryFields = [
  ['height_cm','Estatura','cm'],['neck_cm','Pescoço','cm'],['shoulder_cm','Ombro','cm'],['chest_cm','Tórax','cm'],
  ['waist_cm','Cintura','cm'],['abdominal_cm','Abdominal','cm'],['hip_cm','Quadril','cm'],
  ['arm_right_relaxed_cm','Braço dir. relaxado','cm'],['arm_right_flexed_cm','Braço dir. contraído','cm'],
  ['arm_left_relaxed_cm','Braço esq. relaxado','cm'],['arm_left_flexed_cm','Braço esq. contraído','cm'],
  ['forearm_right_cm','Antebraço dir.','cm'],['forearm_left_cm','Antebraço esq.','cm'],
  ['thigh_right_cm','Coxa medial dir.','cm'],['thigh_left_cm','Coxa medial esq.','cm'],
  ['calf_right_cm','Gémeo dir.','cm'],['calf_left_cm','Gémeo esq.','cm'],
];
const skinfoldFields = [
  ['pectoral_mm','Peitoral'],['bicipital_mm','Bicipital'],['tricipital_mm','Tricipital'],['subscapular_mm','Sub-escapular'],
  ['midaxillary_mm','Axilar média'],['suprailiac_mm','Supra-ilíaca'],['abdominal_mm','Abdominal'],['thigh_mm','Coxa'],['calf_mm','Panturrilha'],
];
const bioFields = [
  ['height_cm','Altura','cm'],['weight_kg','Peso','kg'],['bmi','IMC','kg/m²'],['body_fat_pct','Massa gorda','%'],
  ['muscle_mass_kg','Massa muscular','kg'],['water_pct','Água','%'],['bone_mass_kg','Peso ósseo','kg'],
  ['basal_metabolic_rate_kcal','Metabolismo basal','kcal'],['metabolic_age','Idade metabólica','anos'],['visceral_fat_rating','Gordura visceral','escala'],
];
const photoTypes = [
  ['front','Frente'],['side_right','Perfil direito'],['side_left','Perfil esquerdo'],['back','Costas'],
];
const metricOptions = [
  ['weight','Peso','kg'],['fat','Massa gorda','%'],['muscle','Massa muscular','kg'],['waist','Cintura','cm'],
  ['visceral','Gordura visceral',''],['skinfoldSum','Σ dobras','mm'],
];

function StudentAvatar({ student, size = 'normal' }) {
  const initials = student?.name?.split(' ').map(x=>x[0]).slice(0,2).join('') || 'AL';
  return <div className={`assessmentStudentAvatar ${size}`}>{student?.thumbUrl || student?.photoUrl ? <img src={student.thumbUrl || student.photoUrl} alt={student.name}/> : initials}</div>;
}
function Heading({ title, sub, action }) { return <div className="heading"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{action}</div>; }
function Status({ status }) { return <span className={`assessmentStatus ${status}`}>{assessmentStatusLabel(status)}</span>; }
function Empty({ children }) { return <div className="assessmentEmpty"><Activity size={32}/><p>{children}</p></div>; }
function Field({ label, children, wide = false }) { return <label className={wide?'assessmentField wide':'assessmentField'}><span>{label}</span>{children}</label>; }
function NumberField({ name, label, unit, value }) { return <Field label={label}><div className="unitInput"><input name={name} type="number" step="0.01" min="0" defaultValue={value ?? ''}/>{unit&&<small>{unit}</small>}</div></Field>; }
function YesNo({ name, label, value }) { return <Field label={label}><select name={name} defaultValue={boolValue(value)}><option value="">—</option><option value="false">Não</option><option value="true">Sim</option></select></Field>; }
function TextArea({ name, label, value, rows = 3 }) { return <Field label={label} wide><textarea name={name} defaultValue={value || ''} rows={rows}/></Field>; }

function ModuleSelector({ selected, onToggle, firstAssessment }) {
  const cards = [
    ['anamnesis','Anamnese',HeartPulse,'Realizada apenas na primeira avaliação.'],
    ['perimetry','Perimetria',Ruler,'Perímetros e medidas corporais.'],
    ['skinfolds','Dobras cutâneas',Activity,'Pregas em milímetros e respetivo somatório.'],
    ['bioimpedance','Bioimpedância TANITA',Scale,'Peso, composição corporal e gordura visceral.'],
    ['posture','Análise postural',UserRound,'Observações anterior, posterior e laterais.'],
    ['photos','Evolução em fotos',Images,'Frente, perfis e costas com imagens otimizadas.'],
  ];
  return <section className="assessmentModuleSelector"><div className="assessmentSectionTitle"><div><span className="eyebrow">MÓDULOS</span><h2>O que vais avaliar hoje?</h2><p>Podes preencher apenas os módulos que fizerem sentido nesta reavaliação.</p></div></div><div className="assessmentModuleGrid">{cards.map(([key,label,Icon,desc])=>{
    const locked = key==='anamnesis' && firstAssessment;
    return <button type="button" key={key} className={cx('assessmentModuleCard',selected[key]&&'selected',locked&&'locked')} onClick={()=>!locked&&onToggle(key)}><Icon/><div><b>{label}</b><span>{desc}</span></div><div className="moduleCheck">{selected[key]?'✓':''}</div>{locked&&<small className="requiredTag">Obrigatória</small>}</button>;
  })}</div><div className="parqTeaser"><ShieldCheck/><div><b>PAR-Q e aceitação do aluno</b><span>Será ativado no Update 5B.1 e ficará obrigatório na primeira entrada do aluno.</span></div><span className="assessmentSoon">5B.1</span></div></section>;
}

function AnamnesisSection({ values = {} }) {
  return <section className="assessmentFormSection"><div className="assessmentSectionTitle"><HeartPulse/><div><h2>Anamnese clínica</h2><p>Registo inicial. Não volta a ser pedido nas reavaliações.</p></div></div><div className="assessmentFormGrid">
    <YesNo name="anamnesis.family_cardiac_problem" label="Alguém na família apresenta problemas cardíacos?" value={values.family_cardiac_problem}/>
    <YesNo name="anamnesis.recent_disease" label="Teve ou tem alguma doença nos últimos tempos?" value={values.recent_disease}/>
    <TextArea name="anamnesis.recent_disease_details" label="Detalhes de doença / condição" value={values.recent_disease_details}/>
    <YesNo name="anamnesis.medication" label="Está a utilizar algum medicamento?" value={values.medication}/>
    <TextArea name="anamnesis.medication_details" label="Medicamentos / finalidade" value={values.medication_details}/>
    <YesNo name="anamnesis.dietary_restriction" label="Possui alguma restrição à prática desportiva?" value={values.dietary_restriction}/>
    <TextArea name="anamnesis.dietary_restriction_details" label="Restrições / recomendações" value={values.dietary_restriction_details}/>
    <YesNo name="anamnesis.recent_surgery" label="Foi submetido a alguma cirurgia recentemente?" value={values.recent_surgery}/>
    <TextArea name="anamnesis.recent_surgery_details" label="Cirurgia / observações" value={values.recent_surgery_details}/>
    <YesNo name="anamnesis.smoker" label="É fumador?" value={values.smoker}/>
    <NumberField name="anamnesis.cigarettes_per_day" label="Cigarros por dia" value={values.cigarettes_per_day}/>
    <YesNo name="anamnesis.muscle_pain" label="Sente alguma dor muscular atualmente?" value={values.muscle_pain}/>
    <TextArea name="anamnesis.muscle_pain_details" label="Dor / localização / observações" value={values.muscle_pain_details}/>
    <YesNo name="anamnesis.weight_diet" label="Está em dieta para ganhar ou perder peso?" value={values.weight_diet}/>
    <Field label="Nível de atividade física"><select name="anamnesis.physical_activity_level" defaultValue={values.physical_activity_level || ''}><option value="">Selecionar</option><option value="sedentary">Sedentário</option><option value="moderately_active">Moderadamente ativo</option><option value="active">Ativo</option><option value="very_active">Muito ativo</option><option value="athlete">Atleta</option></select></Field>
  </div><div className="assessmentRiskBlock"><h3>Estratificação do risco · registo do professor</h3><p>Estes campos organizam a informação recolhida; não constituem diagnóstico médico automático.</p><div className="assessmentFormGrid">
    <YesNo name="anamnesis.risk_dyslipidemia" label="Dislipidémia" value={values.risk_dyslipidemia}/><YesNo name="anamnesis.risk_hypertension" label="Hipertensão" value={values.risk_hypertension}/><YesNo name="anamnesis.risk_family_history" label="Histórico familiar" value={values.risk_family_history}/><YesNo name="anamnesis.risk_obesity" label="Obesidade" value={values.risk_obesity}/><YesNo name="anamnesis.risk_smoking" label="Tabagismo" value={values.risk_smoking}/><YesNo name="anamnesis.risk_sedentary" label="Sedentarismo" value={values.risk_sedentary}/><YesNo name="anamnesis.risk_fasting_glucose" label="Glicose em jejum elevada" value={values.risk_fasting_glucose}/><YesNo name="anamnesis.protective_high_hdl" label="HDL elevado / fator protetor" value={values.protective_high_hdl}/><YesNo name="anamnesis.known_cardiovascular" label="Doença cardiovascular conhecida" value={values.known_cardiovascular}/><YesNo name="anamnesis.known_pulmonary" label="Doença pulmonar conhecida" value={values.known_pulmonary}/><YesNo name="anamnesis.known_metabolic" label="Doença metabólica conhecida" value={values.known_metabolic}/><Field label="Resultado registado"><select name="anamnesis.risk_result" defaultValue={values.risk_result || 'not_assessed'}><option value="not_assessed">Não avaliado</option><option value="apparently_healthy">Aparentemente saudável</option><option value="increased_risk">Risco aumentado</option><option value="known_disease">Doença conhecida</option></select></Field><TextArea name="anamnesis.notes" label="Observações da anamnese" value={values.notes}/>
  </div></div></section>;
}
function PerimetrySection({ values = {} }) { return <section className="assessmentFormSection"><div className="assessmentSectionTitle"><Ruler/><div><h2>Perimetria</h2><p>Registo em centímetros.</p></div></div><div className="assessmentNumbersGrid">{perimetryFields.map(([key,label,unit])=><NumberField key={key} name={`perimetry.${key}`} label={label} unit={unit} value={values[key]}/>)}</div><TextArea name="perimetry.notes" label="Observações" value={values.notes}/></section>; }
function SkinfoldsSection({ values = {} }) { const total=skinfoldSum(values); return <section className="assessmentFormSection"><div className="assessmentSectionTitle"><Activity/><div><h2>Dobras cutâneas</h2><p>Registo em milímetros.</p></div></div><div className="assessmentNumbersGrid">{skinfoldFields.map(([key,label])=><NumberField key={key} name={`skinfolds.${key}`} label={label} unit="mm" value={values[key]}/>)}</div><div className="assessmentCalculated"><span>Σ DC atual</span><b>{total == null ? '—' : `${total.toFixed(1)} mm`}</b></div><TextArea name="skinfolds.notes" label="Observações" value={values.notes}/></section>; }
function BioSection({ values = {} }) { return <section className="assessmentFormSection"><div className="assessmentSectionTitle"><Scale/><div><h2>Bioimpedância · TANITA</h2><p>Campos alinhados com o registo usado no estúdio.</p></div></div><div className="assessmentNumbersGrid">{bioFields.map(([key,label,unit])=><NumberField key={key} name={`bioimpedance.${key}`} label={label} unit={unit} value={values[key]}/>)}</div><input type="hidden" name="bioimpedance.device" value="TANITA"/><TextArea name="bioimpedance.notes" label="Observações TANITA" value={values.notes}/></section>; }
function PostureSection({ values = {} }) { return <section className="assessmentFormSection"><div className="assessmentSectionTitle"><UserRound/><div><h2>Análise postural</h2><p>Registo observacional estruturado por vistas.</p></div></div><div className="assessmentFormGrid"><TextArea name="posture.anterior_notes" label="Vista anterior" value={values.anterior_notes}/><TextArea name="posture.posterior_notes" label="Vista posterior" value={values.posterior_notes}/><TextArea name="posture.lateral_right_notes" label="Perfil direito" value={values.lateral_right_notes}/><TextArea name="posture.lateral_left_notes" label="Perfil esquerdo" value={values.lateral_left_notes}/><TextArea name="posture.general_notes" label="Observações gerais" value={values.general_notes}/></div></section>; }
function PhotosSection({ files, setFiles, existing = [] }) { return <section className="assessmentFormSection"><div className="assessmentSectionTitle"><Camera/><div><h2>Evolução em fotos</h2><p>As imagens são convertidas automaticamente para WebP e redimensionadas antes do upload.</p></div></div>{existing.length>0&&<div className="assessmentExistingPhotos">{existing.map(photo=><div key={photo.id}>{photo.thumbUrl&&<img src={photo.thumbUrl} alt=""/>}<small>{photoTypes.find(x=>x[0]===photo.photo_type)?.[1]||'Foto'}</small></div>)}</div>}<div className="assessmentPhotoInputs">{photoTypes.map(([key,label])=><label key={key}><span>{label}</span><input type="file" accept="image/*" onChange={e=>setFiles(current=>({...current,[key]:e.target.files?.[0]||null}))}/><small>{files[key]?.name || 'JPG, PNG ou WebP'}</small></label>)}</div></section>; }

function getModule(form, prefix, fields) {
  const out = {};
  for (const [key,type='number'] of fields) {
    const raw = form.get(`${prefix}.${key}`);
    out[key] = type==='boolean' ? bool(raw) : type==='number' ? num(raw) : (raw || null);
  }
  return out;
}
const anamnesisSchema = [
  ['family_cardiac_problem','boolean'],['recent_disease','boolean'],['recent_disease_details','text'],['medication','boolean'],['medication_details','text'],['dietary_restriction','boolean'],['dietary_restriction_details','text'],['recent_surgery','boolean'],['recent_surgery_details','text'],['smoker','boolean'],['cigarettes_per_day','number'],['muscle_pain','boolean'],['muscle_pain_details','text'],['weight_diet','boolean'],['physical_activity_level','text'],['risk_dyslipidemia','boolean'],['risk_hypertension','boolean'],['risk_family_history','boolean'],['risk_obesity','boolean'],['risk_smoking','boolean'],['risk_sedentary','boolean'],['risk_fasting_glucose','boolean'],['protective_high_hdl','boolean'],['known_cardiovascular','boolean'],['known_pulmonary','boolean'],['known_metabolic','boolean'],['risk_result','text'],['notes','text'],
];
const perimetrySchema = [...perimetryFields.map(([key])=>[key,'number']),['notes','text']];
const skinfoldSchema = [...skinfoldFields.map(([key])=>[key,'number']),['notes','text']];
const bioSchema = [...bioFields.map(([key])=>[key,'number']),['device','text'],['notes','text']];
const postureSchema = [['anterior_notes','text'],['posterior_notes','text'],['lateral_right_notes','text'],['lateral_left_notes','text'],['general_notes','text']];

function AssessmentForm({ student, assessment, assessments, onCancel, onSaved }) {
  const firstAssessment = !assessments.some(item=>item.modules?.anamnesis && item.id!==assessment?.id);
  const [selected,setSelected]=useState({
    anamnesis:Boolean(assessment?.modules?.anamnesis)||firstAssessment,
    perimetry:Boolean(assessment?.modules?.perimetry)||!assessment,
    skinfolds:Boolean(assessment?.modules?.skinfolds),
    bioimpedance:Boolean(assessment?.modules?.bioimpedance)||!assessment,
    posture:Boolean(assessment?.modules?.posture),
    photos:Boolean(assessment?.photos?.length),
  });
  const [files,setFiles]=useState({});
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  function toggle(key){setSelected(current=>({...current,[key]:!current[key]}));}
  async function submit(event,publish){
    event.preventDefault();setBusy(publish?'publish':'draft');setError('');
    const form=new FormData(event.currentTarget);
    try{
      const modules={
        anamnesis:selected.anamnesis?getModule(form,'anamnesis',anamnesisSchema):null,
        perimetry:selected.perimetry?getModule(form,'perimetry',perimetrySchema):null,
        skinfolds:selected.skinfolds?getModule(form,'skinfolds',skinfoldSchema):null,
        bioimpedance:selected.bioimpedance?getModule(form,'bioimpedance',bioSchema):null,
        posture:selected.posture?getModule(form,'posture',postureSchema):null,
      };
      const id=await saveAssessment({id:assessment?.id,studentId:student.id,date:form.get('assessmentDate'),notes:form.get('generalNotes'),modules});
      if(selected.photos){
        for(const [photoType,file] of Object.entries(files)) if(file) await uploadAssessmentPhoto({studentId:student.id,assessmentId:id,photoType,file});
      }
      if(publish) await publishAssessment(id);
      await onSaved(publish?'Avaliação publicada e disponível para o aluno.':'Rascunho guardado.',id);
    }catch(err){setError(err.message||'Não foi possível guardar a avaliação.');}
    finally{setBusy('');}
  }
  return <form className="assessmentForm" onSubmit={event=>submit(event,false)}>
    <div className="assessmentFormHeader card"><div><button type="button" className="backButton" onClick={onCancel}><ArrowLeft size={18}/>Voltar</button><span className="eyebrow">{student.studentCode}</span><h1>{assessment?'Editar avaliação':'Nova avaliação'} · {student.name}</h1><p>{firstAssessment?'Primeira avaliação: a anamnese é obrigatória antes da publicação.':'Reavaliação: escolhe apenas os módulos que pretendes repetir.'}</p></div><div className="assessmentHeaderFields"><Field label="Data da avaliação"><input name="assessmentDate" type="date" required defaultValue={assessment?.date||new Date().toISOString().slice(0,10)}/></Field><TextArea name="generalNotes" label="Observações gerais" value={assessment?.notes} rows={2}/></div></div>
    {error&&<div className="errorBanner"><AlertTriangle size={18}/>{error}</div>}
    <ModuleSelector selected={selected} onToggle={toggle} firstAssessment={firstAssessment}/>
    {selected.anamnesis&&<AnamnesisSection values={assessment?.modules?.anamnesis}/>} {selected.perimetry&&<PerimetrySection values={assessment?.modules?.perimetry}/>} {selected.skinfolds&&<SkinfoldsSection values={assessment?.modules?.skinfolds}/>} {selected.bioimpedance&&<BioSection values={assessment?.modules?.bioimpedance}/>} {selected.posture&&<PostureSection values={assessment?.modules?.posture}/>} {selected.photos&&<PhotosSection files={files} setFiles={setFiles} existing={assessment?.photos}/>} 
    <div className="assessmentFormActions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button type="submit" className="secondary" disabled={busy}><Save size={17}/>{busy==='draft'?'A guardar…':'Guardar rascunho'}</button><button type="button" className="primary" disabled={busy} onClick={event=>submit({preventDefault:()=>{},currentTarget:event.currentTarget.closest('form')},true)}><CheckCircle2 size={17}/>{busy==='publish'?'A publicar…':'Publicar avaliação'}</button></div>
  </form>;
}

function MetricChart({ assessments }) {
  const [metric,setMetric]=useState('weight');
  const [,label,unit]=metricOptions.find(x=>x[0]===metric)||metricOptions[0];
  const rows=assessments.filter(a=>a.status==='published').slice(-5).map(a=>({date:fmt(a.date),value:assessmentMetrics(a)[metric]}));
  return <section className="card pad assessmentEvolution"><div className="assessmentSectionTitle"><BarChart3/><div><h2>Evolução · últimas 5 avaliações</h2><p>Seleciona a métrica que pretendes comparar.</p></div></div><div className="metricTabs">{metricOptions.map(([key,text])=><button key={key} className={metric===key?'active':''} onClick={()=>setMetric(key)}>{text}</button>)}</div>{rows.some(r=>r.value!=null)?<div className="assessmentChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false}/><XAxis dataKey="date" tick={{fill:'#777',fontSize:11}}/><YAxis tick={{fill:'#777',fontSize:11}}/><Tooltip formatter={value=>[`${value}${unit?` ${unit}`:''}`,label]} contentStyle={{background:'#111',border:'1px solid #333'}}/><Line dataKey="value" stroke="#ffd908" strokeWidth={3} connectNulls dot={{r:4}}/></LineChart></ResponsiveContainer></div>:<Empty>Ainda não existem valores suficientes para esta métrica.</Empty>}</section>;
}

function AssessmentDetail({ assessment, student, onBack, canManage, onEdit, onArchive }) {
  const modules=assessment.modules||{}; const metrics=assessmentMetrics(assessment);
  return <div className="assessmentDetail"><button className="backButton" onClick={onBack}><ArrowLeft size={18}/>Voltar ao histórico</button><div className="assessmentDetailHero card"><div><span className="eyebrow">{student.name}</span><h1>Avaliação · {fmt(assessment.date)}</h1><div className="assessmentBadges"><Status status={assessment.status}/>{assessmentModuleLabels(assessment).map(label=><span key={label}>{label}</span>)}</div></div>{canManage&&<div className="assessmentDetailActions">{assessment.status==='draft'&&<button className="secondary" onClick={onEdit}><Edit3 size={16}/>Editar</button>}{assessment.status==='published'&&<button className="secondary" onClick={onArchive}><Archive size={16}/>Arquivar</button>}</div>}</div>
    <div className="assessmentMetricCards"><div><small>Peso</small><b>{metrics.weight??'—'} {metrics.weight!=null?'kg':''}</b></div><div><small>Massa gorda</small><b>{metrics.fat??'—'} {metrics.fat!=null?'%':''}</b></div><div><small>Massa muscular</small><b>{metrics.muscle??'—'} {metrics.muscle!=null?'kg':''}</b></div><div><small>Cintura</small><b>{metrics.waist??'—'} {metrics.waist!=null?'cm':''}</b></div><div><small>Gordura visceral</small><b>{metrics.visceral??'—'}</b></div><div><small>Σ dobras</small><b>{metrics.skinfoldSum==null?'—':`${metrics.skinfoldSum.toFixed(1)} mm`}</b></div></div>
    {assessment.notes&&<section className="card pad"><h3>Observações gerais</h3><p>{assessment.notes}</p></section>}
    {modules.anamnesis&&<section className="card pad assessmentReadSection"><h2>Anamnese</h2><div className="assessmentReadGrid"><div><small>Atividade física</small><b>{activityLevelLabel(modules.anamnesis.physical_activity_level)}</b></div><div><small>Resultado registado</small><b>{riskResultLabel(modules.anamnesis.risk_result)}</b></div><div><small>Fumador</small><b>{modules.anamnesis.smoker===true?'Sim':modules.anamnesis.smoker===false?'Não':'—'}</b></div><div><small>Dor muscular</small><b>{modules.anamnesis.muscle_pain===true?'Sim':modules.anamnesis.muscle_pain===false?'Não':'—'}</b></div></div>{modules.anamnesis.notes&&<p>{modules.anamnesis.notes}</p>}</section>}
    {modules.perimetry&&<section className="card pad assessmentReadSection"><h2>Perimetria</h2><div className="assessmentReadGrid">{perimetryFields.map(([key,label,unit])=><div key={key}><small>{label}</small><b>{modules.perimetry[key]??'—'} {modules.perimetry[key]!=null?unit:''}</b></div>)}</div></section>}
    {modules.skinfolds&&<section className="card pad assessmentReadSection"><h2>Dobras cutâneas</h2><div className="assessmentReadGrid">{skinfoldFields.map(([key,label])=><div key={key}><small>{label}</small><b>{modules.skinfolds[key]??'—'} {modules.skinfolds[key]!=null?'mm':''}</b></div>)}</div></section>}
    {modules.bioimpedance&&<section className="card pad assessmentReadSection"><h2>Bioimpedância · TANITA</h2><div className="assessmentReadGrid">{bioFields.map(([key,label,unit])=><div key={key}><small>{label}</small><b>{modules.bioimpedance[key]??'—'} {modules.bioimpedance[key]!=null?unit:''}</b></div>)}</div></section>}
    {modules.posture&&<section className="card pad assessmentReadSection"><h2>Análise postural</h2><div className="assessmentPostureRead"><div><b>Anterior</b><p>{modules.posture.anterior_notes||'—'}</p></div><div><b>Posterior</b><p>{modules.posture.posterior_notes||'—'}</p></div><div><b>Perfil direito</b><p>{modules.posture.lateral_right_notes||'—'}</p></div><div><b>Perfil esquerdo</b><p>{modules.posture.lateral_left_notes||'—'}</p></div></div></section>}
    {assessment.photos?.length>0&&<section className="card pad assessmentReadSection"><h2>Evolução fotográfica</h2><div className="assessmentPhotoGallery">{assessment.photos.map(photo=><a href={photo.imageUrl||photo.thumbUrl} target="_blank" rel="noreferrer" key={photo.id}>{photo.thumbUrl&&<img src={photo.thumbUrl} alt="Fotografia de avaliação"/>}<span>{photoTypes.find(x=>x[0]===photo.photo_type)?.[1]||'Fotografia'}</span></a>)}</div></section>}
  </div>;
}

function StudentAssessmentHome({ student, assessments, canManage, onNew, onView, onEdit, onArchive, onDeleteDraft, onBackToStudents }) {
  const published=assessments.filter(a=>a.status==='published'); const latest=published.at(-1); const latestMetrics=assessmentMetrics(latest);
  return <div className="assessmentStudentHome"><div className="assessmentStudentTop"><button className="backButton" onClick={onBackToStudents}><ArrowLeft size={18}/>{canManage?'Escolher outro aluno':'Voltar'}</button><div className="assessmentStudentIdentity"><StudentAvatar student={student}/><div><span className="eyebrow">AVALIAÇÃO FÍSICA</span><h1>{student.name}</h1><p>{assessments.length} avaliação(ões) acessível(eis)</p></div></div>{canManage&&<button className="primary" onClick={onNew}><Plus size={17}/>Nova avaliação</button>}</div>
    <div className="assessmentMetricCards"><div><small>Última avaliação</small><b>{latest?fmt(latest.date):'—'}</b></div><div><small>Peso</small><b>{latestMetrics.weight??'—'} {latestMetrics.weight!=null?'kg':''}</b></div><div><small>Massa gorda</small><b>{latestMetrics.fat??'—'} {latestMetrics.fat!=null?'%':''}</b></div><div><small>Massa muscular</small><b>{latestMetrics.muscle??'—'} {latestMetrics.muscle!=null?'kg':''}</b></div><div><small>Cintura</small><b>{latestMetrics.waist??'—'} {latestMetrics.waist!=null?'cm':''}</b></div></div>
    <MetricChart assessments={assessments}/>
    <section className="assessmentHistory"><div className="assessmentSectionTitle"><ClipboardList/><div><h2>Histórico</h2><p>As avaliações publicadas ficam disponíveis ao aluno; rascunhos são privados da equipa.</p></div></div>{assessments.length?<div className="assessmentHistoryList">{[...assessments].reverse().map(item=><article className="assessmentHistoryCard" key={item.id}><div className="assessmentHistoryDate"><b>{fmt(item.date)}</b><Status status={item.status}/></div><div className="assessmentBadges">{assessmentModuleLabels(item).map(label=><span key={label}>{label}</span>)}</div><div className="assessmentHistoryMetrics"><span>Peso <b>{item.weight??'—'}{item.weight!=null?' kg':''}</b></span><span>MG <b>{item.fat??'—'}{item.fat!=null?'%':''}</b></span><span>Cintura <b>{item.waist??'—'}{item.waist!=null?' cm':''}</b></span></div><div className="assessmentHistoryActions"><button className="secondary" onClick={()=>onView(item)}><Eye size={16}/>Ver</button>{canManage&&item.status==='draft'&&<><button className="secondary" onClick={()=>onEdit(item)}><Edit3 size={16}/>Editar</button><button className="iconDanger" title="Eliminar rascunho" onClick={()=>onDeleteDraft(item)}><Trash2 size={16}/></button></>}</div></article>)}</div>:<Empty>Ainda não existem avaliações para este aluno.</Empty>}</section>
  </div>;
}

export default function AssessmentsModule({ context = {}, onNavigate }) {
  const { data, currentUser, refreshAssessments, assessmentsLoading, assessmentsError } = useApp();
  const isStudent=currentUser.role==='aluno';
  const ownStudent=data.students.find(item=>item.userId===currentUser.id);
  const [selectedStudentId,setSelectedStudentId]=useState(context.studentId || ownStudent?.id || '');
  const [mode,setMode]=useState('home');
  const [editing,setEditing]=useState(null);
  const [viewing,setViewing]=useState(null);
  const [query,setQuery]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');

  useEffect(()=>{if(context.studentId)setSelectedStudentId(context.studentId)},[context.studentId]);
  useEffect(()=>{if(isStudent&&ownStudent?.id)setSelectedStudentId(ownStudent.id)},[isStudent,ownStudent?.id]);
  const selectedStudent=data.students.find(item=>item.id===selectedStudentId);
  const assessments=useMemo(()=>data.assessments.filter(item=>item.studentId===selectedStudentId).sort((a,b)=>a.date.localeCompare(b.date)),[data.assessments,selectedStudentId]);
  const list=useMemo(()=>data.students.filter(student=>student.name.toLowerCase().includes(query.toLowerCase().trim())),[data.students,query]);
  const canManage=!isStudent;

  async function saved(message,id){setNotice(message);setError('');setMode('home');setEditing(null);await refreshAssessments(); if(id){const rows=await refreshAssessments(); const found=rows?.find?.(x=>x.id===id); if(found&&message.startsWith('Avaliação publicada')) setViewing(found);}}
  async function archive(item){if(!window.confirm('Arquivar esta avaliação? O aluno deixará de a ver.'))return;try{await archiveAssessment(item.id);setNotice('Avaliação arquivada.');setViewing(null);await refreshAssessments()}catch(err){setError(err.message)}}
  async function removeDraft(item){if(!window.confirm('Eliminar este rascunho?'))return;try{await deleteDraftAssessment(item.id);setNotice('Rascunho eliminado.');await refreshAssessments()}catch(err){setError(err.message)}}

  if(assessmentsLoading&&!data.assessments.length) return <div className="card pad loadingCard"><div className="loader"/><p>A carregar avaliações…</p></div>;
  if(assessmentsError) return <div className="errorBanner"><AlertTriangle size={18}/>{assessmentsError}</div>;
  if(isStudent&&!ownStudent) return <Empty>O teu perfil ainda não está associado a um registo de aluno.</Empty>;

  if(mode==='form'&&selectedStudent) return <AssessmentForm student={selectedStudent} assessment={editing} assessments={assessments} onCancel={()=>{setMode('home');setEditing(null)}} onSaved={saved}/>;
  if(viewing&&selectedStudent) return <AssessmentDetail assessment={viewing} student={selectedStudent} canManage={canManage} onBack={()=>setViewing(null)} onEdit={()=>{setEditing(viewing);setViewing(null);setMode('form')}} onArchive={()=>archive(viewing)}/>;

  if(selectedStudent) return <>{notice&&<div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}{error&&<div className="errorBanner"><AlertTriangle size={18}/>{error}</div>}<StudentAssessmentHome student={selectedStudent} assessments={assessments} canManage={canManage} onNew={()=>{setEditing(null);setMode('form')}} onView={setViewing} onEdit={item=>{setEditing(item);setMode('form')}} onArchive={archive} onDeleteDraft={removeDraft} onBackToStudents={()=>isStudent?onNavigate?.('dashboard'):(setSelectedStudentId(''))}/></>;

  return <><Heading title="Avaliações físicas" sub="Anamnese, perimetria, dobras cutâneas, TANITA, postura, evolução fotográfica e gráficos comparativos."/><div className="assessmentStudentPicker"><div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar aluno…"/></div>{list.length?<div className="assessmentStudentPickerGrid">{list.map(student=>{const rows=data.assessments.filter(a=>a.studentId===student.id);const last=rows.filter(a=>a.status==='published').at(-1);return <button key={student.id} onClick={()=>setSelectedStudentId(student.id)}><StudentAvatar student={student}/><div><b>{student.name}</b><span>{rows.length} avaliação(ões) · última {last?fmt(last.date):'—'}</span></div><ChevronRight/></button>})}</div>:<Empty>Não existem alunos disponíveis.</Empty>}</div></>;
}
