import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Archive, ArrowLeft, BarChart3, Camera, CheckCircle2,
  ChevronRight, ClipboardList, Edit3, Eye, FileText, HeartPulse, Images, Plus,
  Ruler, Save, Scale, Search, ShieldCheck, Trash2, UserRound,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../contexts/AppContext';
import { downloadAssessmentPdf } from '../lib/assessmentPdf';
import {
  activityLevelDescription, activityLevelLabel, ageAtAssessment, archiveAssessment, assessmentMetrics,
  assessmentModuleLabels, assessmentReferences, automaticRiskSummary, bioimpedanceIndicator, bioimpedanceInterpretation, bodyFatCategory,
  assessmentStatusLabel, deleteAssessmentPermanently, effectiveBmi, publishAssessment, riskResultLabel,
  saveAssessment, skinfoldSum, uploadAssessmentPhoto,
} from '../lib/assessments';

const fmt = value => value ? new Intl.DateTimeFormat('pt-PT').format(new Date(`${value}T12:00:00`)) : '—';
const num = value => value === null || value === undefined || value === '' ? null : Number(value);
const bool = value => value === '' || value === null || value === undefined ? null : String(value) === 'true';
const boolValue = value => value === true ? 'true' : value === false ? 'false' : '';
const cx = (...items) => items.filter(Boolean).join(' ');

const perimetryFields = [
  ['neck_cm','Pescoço','cm'],['shoulder_cm','Ombro','cm'],['chest_cm','Tórax','cm'],
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
function NumberField({ name, label, unit, value, onValueChange, hint }) { return <Field label={label}><div className="unitInput"><input name={name} type="number" step="0.01" min="0" defaultValue={value ?? ''} onChange={event=>onValueChange?.(event.target.value)}/>{unit&&<small>{unit}</small>}</div>{hint&&<span className="assessmentCategoryLive">{hint}</span>}</Field>; }
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
  })}</div><div className="parqTeaser"><ShieldCheck/><div><b>PAR-Q e aceitação do aluno</b><span>O aluno conclui o PAR-Q no primeiro acesso à APP. A avaliação do professor não fica condicionada.</span></div><span className="assessmentSoon">ATIVO</span></div></section>;
}

function AnamnesisSection({ values = {} }) {
  const [draft,setDraft]=useState(values || {});
  const risk=automaticRiskSummary(draft);
  const activity=draft.physical_activity_level || '';
  function capture(event){
    const name=event.target?.name || '';
    if(!name.startsWith('anamnesis.')) return;
    const key=name.slice('anamnesis.'.length);
    let value=event.target.value;
    if(value==='true') value=true;
    else if(value==='false') value=false;
    else if(value==='') value=null;
    setDraft(current=>({...current,[key]:value}));
  }
  return <section className="assessmentFormSection" onChange={capture}><div className="assessmentSectionTitle"><HeartPulse/><div><h2>Anamnese clínica</h2><p>Registo inicial com resultados de apoio calculados automaticamente.</p></div></div><div className="assessmentFormGrid">
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
    <Field label="Padrão habitual de atividade física"><select name="anamnesis.physical_activity_level" defaultValue={values.physical_activity_level || ''}><option value="">Selecionar</option><option value="sedentary">Sedentário — sem atividade física regular</option><option value="moderately_active">Moderadamente ativo — 1–2 dias/semana</option><option value="active">Ativo — 3 dias/semana</option><option value="very_active">Muito ativo — 4–5 dias/semana</option><option value="athlete">Atleta — treino diário vigoroso / volume equivalente</option></select></Field>
  </div>
  <div className="assessmentAutoResultGrid">
    <div className="assessmentAutoResultCard"><span className="eyebrow">RESULTADO AUTOMÁTICO</span><small>Nível de atividade física</small><b>{activity?activityLevelLabel(activity):'Por avaliar'}</b><p>{activity?activityLevelDescription(activity):'Seleciona o padrão habitual de atividade para obter a classificação.'}</p><em>{assessmentReferences.activity}</em></div>
  </div>
  <div className="assessmentRiskBlock"><h3>Estratificação do risco</h3><p>Preenche todos os itens. O resultado é calculado automaticamente a partir das respostas e funciona como apoio à triagem — não como diagnóstico médico.</p><div className="assessmentFormGrid">
    <YesNo name="anamnesis.risk_dyslipidemia" label="Dislipidémia — colesterol total >200 mg/dL, LDL >130 mg/dL ou HDL <40 mg/dL" value={values.risk_dyslipidemia}/>
    <YesNo name="anamnesis.risk_hypertension" label="Hipertensão — ≥140/90 mmHg ou sob medicação anti-hipertensora" value={values.risk_hypertension}/>
    <YesNo name="anamnesis.risk_family_history" label="Histórico familiar — enfarte, revascularização coronária ou morte súbita prematura em familiar de 1.º grau" value={values.risk_family_history}/>
    <YesNo name="anamnesis.risk_obesity" label="Obesidade — IMC >30 kg/m² ou perímetro abdominal elevado" value={values.risk_obesity}/>
    <YesNo name="anamnesis.risk_smoking" label="Tabagismo — fumador ou cessação há menos de 6 meses" value={values.risk_smoking}/>
    <YesNo name="anamnesis.risk_sedentary" label="Sedentarismo — sem programa regular de exercício físico" value={values.risk_sedentary}/>
    <YesNo name="anamnesis.risk_fasting_glucose" label="Glicemia em jejum elevada — ≥100 mg/dL" value={values.risk_fasting_glucose}/>
    <YesNo name="anamnesis.protective_high_hdl" label="HDL >60 mg/dL — fator protetor" value={values.protective_high_hdl}/>
    <YesNo name="anamnesis.known_cardiovascular" label="Doença cardiovascular conhecida — cardíaca, vascular periférica ou cerebrovascular" value={values.known_cardiovascular}/>
    <YesNo name="anamnesis.known_pulmonary" label="Doença pulmonar conhecida — DPOC, asma, doença intersticial pulmonar ou fibrose quística" value={values.known_pulmonary}/>
    <YesNo name="anamnesis.known_metabolic" label="Doença metabólica conhecida — diabetes mellitus ou doença renal" value={values.known_metabolic}/>
    <input type="hidden" name="anamnesis.risk_result" value={risk.result}/>
    <TextArea name="anamnesis.notes" label="Observações da anamnese" value={values.notes}/>
  </div>
  <div className={cx('assessmentAutoRiskResult',risk.result)}><div><span className="eyebrow">RESULTADO AUTOMÁTICO</span><b>{riskResultLabel(risk.result)}</b>{risk.complete?<small>{risk.knownDisease?'Foi assinalada doença conhecida.':`Fatores de risco contabilizados: ${risk.positives}${risk.protective?` − 1 fator protetor HDL = ${risk.adjustedScore}`:` · total ajustado ${risk.adjustedScore}`}`}</small>:<small>Preenche todos os fatores de risco e doenças conhecidas para obter o resultado.</small>}</div><p>{assessmentReferences.risk}</p><strong>Este resultado é informativo e não substitui avaliação, diagnóstico ou autorização médica.</strong></div>
  </div></section>;
}
function PerimetrySection({ values = {} }) { return <section className="assessmentFormSection"><div className="assessmentSectionTitle"><Ruler/><div><h2>Perimetria</h2><p>Registo em centímetros.</p></div></div><div className="assessmentNumbersGrid">{perimetryFields.map(([key,label,unit])=><NumberField key={key} name={`perimetry.${key}`} label={label} unit={unit} value={values[key]}/>)}</div><TextArea name="perimetry.notes" label="Observações" value={values.notes}/></section>; }
function SkinfoldsSection({ values = {} }) { const total=skinfoldSum(values); return <section className="assessmentFormSection"><div className="assessmentSectionTitle"><Activity/><div><h2>Dobras cutâneas</h2><p>Registo em milímetros.</p></div></div><div className="assessmentNumbersGrid">{skinfoldFields.map(([key,label])=><NumberField key={key} name={`skinfolds.${key}`} label={label} unit="mm" value={values[key]}/>)}</div><div className="assessmentCalculated"><span>Σ DC atual</span><b>{total == null ? '—' : `${total.toFixed(1)} mm`}</b></div><TextArea name="skinfolds.notes" label="Observações" value={values.notes}/></section>; }
function BioSection({ values = {}, student, assessmentDate }) {
  const [draft,setDraft]=useState(values || {});
  useEffect(()=>setDraft(values || {}),[values]);
  const age=ageAtAssessment(student?.birth,assessmentDate);
  const fatLabel=bioimpedanceIndicator('body_fat_pct',draft.body_fat_pct,draft,student,assessmentDate);
  function updateValue(key,value){ setDraft(current=>({...current,[key]:value})); }
  return <section className="assessmentFormSection">
    <div className="assessmentSectionTitle"><Scale/><div><h2>Bioimpedância · TANITA</h2><p>Peso, composição corporal e hidratação recebem enquadramento automático quando existem referências adequadas.</p></div></div>
    <div className="assessmentNumbersGrid">{bioFields.map(([key,label,unit])=>{
      const interpretation=bioimpedanceInterpretation(key,draft[key],draft,student,assessmentDate);
      return <NumberField key={key} name={`bioimpedance.${key}`} label={label} unit={unit} value={values[key]} onValueChange={value=>updateValue(key,value)} hint={interpretation.label}/>;
    })}</div>
    {(draft.weight_kg||draft.water_pct||draft.visceral_fat_rating||draft.bone_mass_kg||draft.muscle_mass_kg||draft.body_fat_pct)&&<div className="assessmentReferenceNote">
      <b>Interpretação automática da bioimpedância</b>
      <span>Peso: enquadrado pelo IMC calculado com altura e peso. Água corporal: referências TANITA para adultos (mulheres 45–60%; homens 50–65%). Gordura visceral: escala TANITA atual (1–12 saudável; 13–59 excesso). Peso ósseo: comparação apenas com a média estimada TANITA por sexo e peso — não representa densidade ou resistência óssea.</span>
      <span>Massa muscular: recebe classificação automática através do FFMI (massa isenta de gordura ajustada à altura), calculado com altura, peso e percentual de gordura e enquadrado por sexo e idade. Metabolismo basal: é comparado com a estimativa de repouso de Mifflin–St Jeor; uma diferença até ±10% é apresentada como dentro do intervalo estimado. Estas classificações são informativas e não substituem calorimetria ou avaliação clínica.</span>
      <span>{assessmentReferences.biaCaution}</span>
    </div>}
    {draft.body_fat_pct&&<div className="assessmentReferenceNote"><b>Percentual de gordura: {fatLabel || 'sem classificação de referência'}</b><span>{fatLabel?`Referência para ${age} anos e sexo registado no perfil. `:'A classificação TANITA para adultos requer idade entre 20 e 99 anos e sexo masculino/feminino registado no perfil. '}{assessmentReferences.bodyFat}</span></div>}
    <input type="hidden" name="bioimpedance.device" value="TANITA"/><TextArea name="bioimpedance.notes" label="Observações TANITA" value={values.notes}/>
  </section>;
}
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
  const [assessmentDate,setAssessmentDate]=useState(assessment?.date||new Date().toISOString().slice(0,10));
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  function toggle(key){setSelected(current=>({...current,[key]:!current[key]}));}
  async function submit(event,publish){
    event.preventDefault();setBusy(publish?'publish':'draft');setError('');
    const form=new FormData(event.currentTarget);
    try{
      const anamnesis=selected.anamnesis?getModule(form,'anamnesis',anamnesisSchema):null;
      if(anamnesis) anamnesis.risk_result=automaticRiskSummary(anamnesis).result;
      const modules={
        anamnesis,
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
      const message = publish ? 'Avaliação publicada e disponível para o aluno.' : assessment?.status==='published' ? 'Avaliação atualizada e disponível para o aluno.' : assessment?.status==='archived' ? 'Avaliação arquivada atualizada.' : 'Rascunho guardado.';
      await onSaved(message,id);
    }catch(err){setError(err.message||'Não foi possível guardar a avaliação.');}
    finally{setBusy('');}
  }
  return <form className="assessmentForm" onSubmit={event=>submit(event,false)}>
    <div className="assessmentFormHeader card"><div><button type="button" className="backButton" onClick={onCancel}><ArrowLeft size={18}/>Voltar</button><span className="eyebrow">{student.studentCode}</span><h1>{assessment?'Editar avaliação':'Nova avaliação'} · {student.name}</h1><p>{firstAssessment?'Primeira avaliação: a anamnese é obrigatória antes da publicação.':'Reavaliação: escolhe apenas os módulos que pretendes repetir.'}</p></div><div className="assessmentHeaderFields"><Field label="Data da avaliação"><input name="assessmentDate" type="date" required value={assessmentDate} onChange={event=>setAssessmentDate(event.target.value)}/></Field><TextArea name="generalNotes" label="Observações gerais" value={assessment?.notes} rows={2}/></div></div>
    {error&&<div className="errorBanner"><AlertTriangle size={18}/>{error}</div>}
    <ModuleSelector selected={selected} onToggle={toggle} firstAssessment={firstAssessment}/>
    {selected.anamnesis&&<AnamnesisSection values={assessment?.modules?.anamnesis}/>} {selected.perimetry&&<PerimetrySection values={assessment?.modules?.perimetry}/>} {selected.skinfolds&&<SkinfoldsSection values={assessment?.modules?.skinfolds}/>} {selected.bioimpedance&&<BioSection values={assessment?.modules?.bioimpedance} student={student} assessmentDate={assessmentDate}/>} {selected.posture&&<PostureSection values={assessment?.modules?.posture}/>} {selected.photos&&<PhotosSection files={files} setFiles={setFiles} existing={assessment?.photos}/>} 
    <div className="assessmentFormActions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button>{(!assessment || assessment.status==='draft')&&<button type="submit" className="secondary" disabled={busy}><Save size={17}/>{busy==='draft'?'A guardar…':'Guardar rascunho'}</button>}<button type="button" className="primary" disabled={Boolean(busy)} onClick={event=>submit({preventDefault:()=>{},currentTarget:event.currentTarget.closest('form')},assessment?.status==='published'?false:assessment?.status==='archived'?false:true)}><CheckCircle2 size={17}/>{busy==='publish'?'A publicar…':assessment&&assessment.status!=='draft'?'Guardar alterações':'Publicar avaliação'}</button></div>
  </form>;
}

function MetricChart({ assessments }) {
  const [metric,setMetric]=useState('weight');
  const [,label,unit]=metricOptions.find(x=>x[0]===metric)||metricOptions[0];
  const rows=assessments.filter(a=>a.status==='published').slice(-5).map(a=>({date:fmt(a.date),value:assessmentMetrics(a)[metric]}));
  return <section className="card pad assessmentEvolution"><div className="assessmentSectionTitle"><BarChart3/><div><h2>Evolução · últimas 5 avaliações</h2><p>Seleciona a métrica que pretendes comparar.</p></div></div><div className="metricTabs">{metricOptions.map(([key,text])=><button key={key} className={metric===key?'active':''} onClick={()=>setMetric(key)}>{text}</button>)}</div>{rows.some(r=>r.value!=null)?<div className="assessmentChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false}/><XAxis dataKey="date" tick={{fill:'#777',fontSize:11}}/><YAxis tick={{fill:'#777',fontSize:11}}/><Tooltip formatter={value=>[`${value}${unit?` ${unit}`:''}`,label]} contentStyle={{background:'#111',border:'1px solid #333'}}/><Line dataKey="value" stroke="#ffd908" strokeWidth={3} connectNulls dot={{r:4}}/></LineChart></ResponsiveContainer></div>:<Empty>Ainda não existem valores suficientes para esta métrica.</Empty>}</section>;
}

function AssessmentDetail({ assessment, student, previousAssessment, onBack, canManage, onEdit, onArchive, onDelete, onExport }) {
  const modules=assessment.modules||{}; const metrics=assessmentMetrics(assessment); const assessmentAge=ageAtAssessment(student?.birth,assessment.date); const fatClass=bodyFatCategory(metrics.fat,assessmentAge,student?.sex); const automaticRisk=modules.anamnesis?automaticRiskSummary(modules.anamnesis):null;
  return <div className="assessmentDetail"><button className="backButton" onClick={onBack}><ArrowLeft size={18}/>Voltar ao histórico</button><div className="assessmentDetailHero card"><div><span className="eyebrow">{student.name}</span><h1>Avaliação · {fmt(assessment.date)}</h1><div className="assessmentBadges"><Status status={assessment.status}/>{assessmentModuleLabels(assessment).map(label=><span key={label}>{label}</span>)}</div></div><div className="assessmentDetailActions">{assessment.status==='published'&&<button className="secondary" onClick={onExport}><FileText size={16}/>Exportar avaliação em PDF</button>}{canManage&&<><button className="secondary" onClick={onEdit}><Edit3 size={16}/>Editar</button>{assessment.status==='published'&&<button className="secondary" onClick={onArchive}><Archive size={16}/>Arquivar</button>}<button className="secondary destructiveButton" onClick={onDelete}><Trash2 size={16}/>Eliminar definitivamente</button></>}</div></div>
    <div className="assessmentMetricCards"><div><small>Peso</small><b>{metrics.weight??'—'} {metrics.weight!=null?'kg':''}</b></div><div><small>Massa gorda</small><b>{metrics.fat??'—'} {metrics.fat!=null?'%':''}</b></div><div><small>Massa muscular</small><b>{metrics.muscle??'—'} {metrics.muscle!=null?'kg':''}</b></div><div><small>Cintura</small><b>{metrics.waist??'—'} {metrics.waist!=null?'cm':''}</b></div><div><small>Gordura visceral</small><b>{metrics.visceral??'—'}</b></div><div><small>Σ dobras</small><b>{metrics.skinfoldSum==null?'—':`${metrics.skinfoldSum.toFixed(1)} mm`}</b></div></div>
    {assessment.notes&&<section className="card pad"><h3>Observações gerais</h3><p>{assessment.notes}</p></section>}
    {modules.anamnesis&&<section className="card pad assessmentReadSection"><h2>Anamnese</h2><div className="assessmentReadGrid"><div><small>Nível de atividade física</small><b>{activityLevelLabel(modules.anamnesis.physical_activity_level)}</b><span className="assessmentReadHint">{activityLevelDescription(modules.anamnesis.physical_activity_level)}</span></div><div><small>Estratificação automática</small><b>{riskResultLabel(automaticRisk?.result||modules.anamnesis.risk_result)}</b><span className="assessmentReadHint">{automaticRisk?.complete?`Total ajustado de fatores: ${automaticRisk.adjustedScore}`:'Preenchimento incompleto'}</span></div><div><small>Fumador</small><b>{modules.anamnesis.smoker===true?'Sim':modules.anamnesis.smoker===false?'Não':'—'}</b></div><div><small>Dor muscular</small><b>{modules.anamnesis.muscle_pain===true?'Sim':modules.anamnesis.muscle_pain===false?'Não':'—'}</b></div></div><div className="assessmentBibliography"><b>Referências</b><span>{assessmentReferences.activity}</span><span>{assessmentReferences.risk}</span><em>Triagem informativa; não substitui avaliação médica.</em></div>{modules.anamnesis.notes&&<p>{modules.anamnesis.notes}</p>}</section>}
    {modules.perimetry&&<section className="card pad assessmentReadSection"><h2>Perimetria</h2><div className="assessmentReadGrid">{perimetryFields.map(([key,label,unit])=><div key={key}><small>{label}</small><b>{modules.perimetry[key]??'—'} {modules.perimetry[key]!=null?unit:''}</b></div>)}</div></section>}
    {modules.skinfolds&&<section className="card pad assessmentReadSection"><h2>Dobras cutâneas</h2><div className="assessmentReadGrid">{skinfoldFields.map(([key,label])=><div key={key}><small>{label}</small><b>{modules.skinfolds[key]??'—'} {modules.skinfolds[key]!=null?'mm':''}</b></div>)}</div></section>}
    {modules.bioimpedance&&<section className="card pad assessmentReadSection"><h2>Bioimpedância · TANITA</h2><div className="assessmentReadGrid">{bioFields.map(([key,label,unit])=>{const value=modules.bioimpedance[key];const displayValue=key==='bmi'&&effectiveBmi(modules.bioimpedance)!=null?effectiveBmi(modules.bioimpedance).toFixed(1).replace('.',','):value;const interpretation=bioimpedanceInterpretation(key,value,modules.bioimpedance,student,assessment.date);return <div key={key}><small>{label}</small><b>{displayValue??'—'} {displayValue!=null?unit:''}</b>{interpretation.label&&<span className="bmiCategoryBadge">{interpretation.label}</span>}{interpretation.detail&&<span className="assessmentReadHint">{interpretation.detail}</span>}</div>})}</div><div className="assessmentBibliography"><b>Como interpretar</b><span>Os rótulos resumem as referências TANITA/OMS, o enquadramento de massa magra por FFMI e a comparação do metabolismo basal com Mifflin–St Jeor. Os detalhes de cada cartão explicam o intervalo usado. Massa óssea estimada não equivale a densidade óssea; o metabolismo basal não corresponde ao gasto energético diário total.</span><span>{assessmentReferences.biaCaution}</span>{fatClass&&<span>{assessmentReferences.bodyFat}</span>}</div></section>}
    {modules.posture&&<section className="card pad assessmentReadSection"><h2>Análise postural</h2><div className="assessmentPostureRead"><div><b>Anterior</b><p>{modules.posture.anterior_notes||'—'}</p></div><div><b>Posterior</b><p>{modules.posture.posterior_notes||'—'}</p></div><div><b>Perfil direito</b><p>{modules.posture.lateral_right_notes||'—'}</p></div><div><b>Perfil esquerdo</b><p>{modules.posture.lateral_left_notes||'—'}</p></div></div></section>}
    {assessment.photos?.length>0&&<section className="card pad assessmentReadSection"><h2>Evolução fotográfica</h2><div className="assessmentPhotoGallery">{assessment.photos.map(photo=><a href={photo.imageUrl||photo.thumbUrl} target="_blank" rel="noreferrer" key={photo.id}>{photo.thumbUrl&&<img src={photo.thumbUrl} alt="Fotografia de avaliação"/>}<span>{photoTypes.find(x=>x[0]===photo.photo_type)?.[1]||'Fotografia'}</span></a>)}</div></section>}
  </div>;
}

function StudentAssessmentHome({ student, assessments, canManage, onNew, onView, onEdit, onArchive, onDeleteAssessment, onBackToStudents }) {
  const published=assessments.filter(a=>a.status==='published'); const latest=published.at(-1); const latestMetrics=assessmentMetrics(latest);
  return <div className="assessmentStudentHome"><div className="assessmentStudentTop"><button className="backButton" onClick={onBackToStudents}><ArrowLeft size={18}/>{canManage?'Escolher outro aluno':'Voltar'}</button><div className="assessmentStudentIdentity"><StudentAvatar student={student}/><div><span className="eyebrow">AVALIAÇÃO FÍSICA</span><h1>{student.name}</h1><p>{assessments.length} avaliação(ões) acessível(eis)</p></div></div>{canManage&&<button className="primary" onClick={onNew}><Plus size={17}/>Nova avaliação</button>}</div>
    <div className="assessmentMetricCards"><div><small>Última avaliação</small><b>{latest?fmt(latest.date):'—'}</b></div><div><small>Peso</small><b>{latestMetrics.weight??'—'} {latestMetrics.weight!=null?'kg':''}</b></div><div><small>Massa gorda</small><b>{latestMetrics.fat??'—'} {latestMetrics.fat!=null?'%':''}</b></div><div><small>Massa muscular</small><b>{latestMetrics.muscle??'—'} {latestMetrics.muscle!=null?'kg':''}</b></div><div><small>Cintura</small><b>{latestMetrics.waist??'—'} {latestMetrics.waist!=null?'cm':''}</b></div></div>
    <MetricChart assessments={assessments}/>
    <section className="assessmentHistory"><div className="assessmentSectionTitle"><ClipboardList/><div><h2>Histórico</h2><p>As avaliações publicadas ficam disponíveis ao aluno; rascunhos são privados da equipa.</p></div></div>{assessments.length?<div className="assessmentHistoryList">{[...assessments].reverse().map(item=><article className="assessmentHistoryCard" key={item.id}><div className="assessmentHistoryDate"><b>{fmt(item.date)}</b><Status status={item.status}/></div><div className="assessmentBadges">{assessmentModuleLabels(item).map(label=><span key={label}>{label}</span>)}</div><div className="assessmentHistoryMetrics"><span>Peso <b>{item.weight??'—'}{item.weight!=null?' kg':''}</b></span><span>MG <b>{item.fat??'—'}{item.fat!=null?'%':''}</b></span><span>Cintura <b>{item.waist??'—'}{item.waist!=null?' cm':''}</b></span></div><div className="assessmentHistoryActions"><button className="secondary" onClick={()=>onView(item)}><Eye size={16}/>Ver</button>{canManage&&<><button className="secondary" onClick={()=>onEdit(item)}><Edit3 size={16}/>Editar</button><button className="iconDanger" title="Eliminar avaliação definitivamente" onClick={()=>onDeleteAssessment(item)}><Trash2 size={16}/></button></>}</div></article>)}</div>:<Empty>Ainda não existem avaliações para este aluno.</Empty>}</section>
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
  async function removeAssessment(item){if(!window.confirm('Eliminar definitivamente esta avaliação? Esta ação não pode ser anulada e elimina também as fotografias associadas.'))return;try{await deleteAssessmentPermanently(item);setNotice('Avaliação eliminada definitivamente.');setViewing(null);await refreshAssessments()}catch(err){setError(err.message||'Não foi possível eliminar a avaliação.')}}
  async function exportPdf(item){
    try{
      setError('');setNotice('A preparar relatório PDF…');
      const previous=[...assessments].filter(a=>a.id!==item.id&&a.status==='published'&&(a.date<item.date||(a.date===item.date&&String(a.createdAt||'')<String(item.createdAt||'')))).at(-1)||null;
      await downloadAssessmentPdf(selectedStudent,item,previous);
      setNotice('Relatório PDF exportado com sucesso.');
    }catch(err){setError(err.message||'Não foi possível gerar o relatório PDF.');setNotice('')}
  }

  if(assessmentsLoading&&!data.assessments.length) return <div className="card pad loadingCard"><div className="loader"/><p>A carregar avaliações…</p></div>;
  if(assessmentsError) return <div className="errorBanner"><AlertTriangle size={18}/>{assessmentsError}</div>;
  if(isStudent&&!ownStudent) return <Empty>O teu perfil ainda não está associado a um registo de aluno.</Empty>;

  if(mode==='form'&&selectedStudent) return <AssessmentForm student={selectedStudent} assessment={editing} assessments={assessments} onCancel={()=>{setMode('home');setEditing(null)}} onSaved={saved}/>;
  if(viewing&&selectedStudent){const previousAssessment=[...assessments].filter(a=>a.id!==viewing.id&&a.status==='published'&&(a.date<viewing.date||(a.date===viewing.date&&String(a.createdAt||'')<String(viewing.createdAt||'')))).at(-1)||null;return <AssessmentDetail assessment={viewing} previousAssessment={previousAssessment} student={selectedStudent} canManage={canManage} onBack={()=>setViewing(null)} onEdit={()=>{setEditing(viewing);setViewing(null);setMode('form')}} onArchive={()=>archive(viewing)} onDelete={()=>removeAssessment(viewing)} onExport={()=>exportPdf(viewing)}/>;}

  if(selectedStudent) return <>{notice&&<div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}{error&&<div className="errorBanner"><AlertTriangle size={18}/>{error}</div>}<StudentAssessmentHome student={selectedStudent} assessments={assessments} canManage={canManage} onNew={()=>{setEditing(null);setMode('form')}} onView={setViewing} onEdit={item=>{setEditing(item);setMode('form')}} onArchive={archive} onDeleteAssessment={removeAssessment} onBackToStudents={()=>isStudent?onNavigate?.('dashboard'):(setSelectedStudentId(''))}/></>;

  return <><Heading title="Avaliações físicas" sub="Anamnese, perimetria, dobras cutâneas, TANITA, postura, evolução fotográfica e gráficos comparativos."/><div className="assessmentStudentPicker"><div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar aluno…"/></div>{list.length?<div className="assessmentStudentPickerGrid">{list.map(student=>{const rows=data.assessments.filter(a=>a.studentId===student.id);const last=rows.filter(a=>a.status==='published').at(-1);return <button key={student.id} onClick={()=>setSelectedStudentId(student.id)}><StudentAvatar student={student}/><div><b>{student.name}</b><span>{rows.length} avaliação(ões) · última {last?fmt(last.date):'—'}</span></div><ChevronRight/></button>})}</div>:<Empty>Não existem alunos disponíveis.</Empty>}</div></>;
}
