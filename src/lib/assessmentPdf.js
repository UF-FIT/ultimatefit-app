import { jsPDF } from 'jspdf';
import { assessmentMetrics, assessmentModuleLabels, activityLevelLabel, bmiCategory, riskResultLabel, skinfoldSum } from './assessments';

const YELLOW = [255, 217, 8];
const BLACK = [10, 10, 10];
const DARK = [28, 28, 28];
const MID = [92, 92, 92];
const LIGHT = [244, 244, 244];
const LINE = [224, 224, 224];
const WHITE = [255, 255, 255];
const PT = new Intl.DateTimeFormat('pt-PT');

const perimetryRows = [
  ['Estatura','height_cm','cm'],['Pescoço','neck_cm','cm'],['Ombros','shoulder_cm','cm'],['Tórax','chest_cm','cm'],
  ['Cintura','waist_cm','cm'],['Abdominal','abdominal_cm','cm'],['Quadril / anca','hip_cm','cm'],
  ['Braço dir. relaxado','arm_right_relaxed_cm','cm'],['Braço dir. contraído','arm_right_flexed_cm','cm'],
  ['Braço esq. relaxado','arm_left_relaxed_cm','cm'],['Braço esq. contraído','arm_left_flexed_cm','cm'],
  ['Antebraço dir.','forearm_right_cm','cm'],['Antebraço esq.','forearm_left_cm','cm'],
  ['Coxa medial dir.','thigh_right_cm','cm'],['Coxa medial esq.','thigh_left_cm','cm'],
  ['Gémeo dir.','calf_right_cm','cm'],['Gémeo esq.','calf_left_cm','cm'],
];
const bioRows = [
  ['Altura','height_cm','cm'],['Peso','weight_kg','kg'],['IMC','bmi',''],['Massa gorda','body_fat_pct','%'],
  ['Massa muscular','muscle_mass_kg','kg'],['Água corporal','water_pct','%'],['Peso ósseo','bone_mass_kg','kg'],
  ['Metabolismo basal','basal_metabolic_rate_kcal','kcal'],['Idade metabólica','metabolic_age','anos'],['Gordura visceral','visceral_fat_rating',''],
];
const skinfoldRows = [
  ['Peitoral','pectoral_mm','mm'],['Bicipital','bicipital_mm','mm'],['Tricipital','tricipital_mm','mm'],['Sub-escapular','subscapular_mm','mm'],
  ['Axilar média','midaxillary_mm','mm'],['Supra-ilíaca','suprailiac_mm','mm'],['Abdominal','abdominal_mm','mm'],['Coxa','thigh_mm','mm'],['Gémeo','calf_mm','mm'],
];

function safe(value, unit = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${unit ? ` ${unit}` : ''}`;
}
function n(value) { const result = Number(value); return Number.isFinite(result) ? result : null; }
function formatDate(value) { if (!value) return '—'; try { return PT.format(new Date(`${value}T12:00:00`)); } catch { return value; } }
function fileName(student, assessment) { return `ULTIMATE-FIT-Avaliacao-${(student?.name || 'Aluno').replace(/[^a-z0-9]+/gi,'-')}-${assessment.date}.pdf`; }
function cleanPhone(value='') { return String(value).trim(); }
function delta(current, previous, unit='') {
  const a=n(current), b=n(previous); if(a===null||b===null) return '—';
  const d=a-b; const sign=d>0?'+':''; return `${sign}${d.toFixed(Math.abs(d)<10?1:0)}${unit?` ${unit}`:''}`;
}
function getModule(assessment,key){ return assessment?.modules?.[key] || null; }

async function blobToDataUrl(blob) {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
}
async function fetchDataUrl(src) {
  if (!src || typeof fetch === 'undefined') return '';
  try { const response=await fetch(src); if(!response.ok) return ''; return blobToDataUrl(await response.blob()); } catch { return ''; }
}
async function fetchSquareJpeg(src, size=600) {
  if (!src || typeof document === 'undefined') return '';
  try {
    const response=await fetch(src); if(!response.ok) return '';
    const blob=await response.blob(); const url=URL.createObjectURL(blob);
    const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=url});
    const canvas=document.createElement('canvas'); canvas.width=size; canvas.height=size; const ctx=canvas.getContext('2d');
    const scale=Math.max(size/img.naturalWidth,size/img.naturalHeight); const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h); URL.revokeObjectURL(url); return canvas.toDataURL('image/jpeg',0.88);
  } catch { return ''; }
}

function footer(doc, page, total) {
  doc.setDrawColor(...LINE); doc.line(14,285,196,285);
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...MID);
  doc.text('ULTIMATE FIT · ultimatefit.pt',14,291);
  doc.text(`Relatório gerado pela ULTIMATE FIT APP · ${page}/${total}`,196,291,{align:'right'});
}
function contentHeader(doc, section) {
  doc.setFillColor(...BLACK); doc.rect(0,0,210,18,'F');
  doc.setFillColor(...YELLOW); doc.rect(0,18,210,3,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...WHITE); doc.text('ULTIMATE FIT',14,11);
  doc.setFont('helvetica','normal'); doc.setTextColor(200); doc.text(section.toUpperCase(),196,11,{align:'right'});
}
function pageTitle(doc, title, subtitle='') {
  doc.setTextColor(...BLACK); doc.setFont('helvetica','bold'); doc.setFontSize(23); doc.text(title,14,35);
  if(subtitle){doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...MID);doc.text(subtitle,14,42)}
}
function sectionTitle(doc, title, y) {
  doc.setFillColor(...YELLOW); doc.rect(14,y-5,4,7,'F'); doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...BLACK); doc.text(title,22,y); return y+7;
}
function card(doc,x,y,w,h,label,value,sub='') {
  doc.setFillColor(...LIGHT); doc.setDrawColor(235,235,235); doc.roundedRect(x,y,w,h,2,2,'FD');
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...MID);doc.text(label,x+4,y+6);
  doc.setFont('helvetica','bold');doc.setFontSize(15);doc.setTextColor(...BLACK);doc.text(String(value),x+4,y+15);
  if(sub){doc.setFont('helvetica','normal');doc.setFontSize(7.2);doc.setTextColor(100);doc.text(sub,x+4,y+h-4)}
}
function comparisonCard(doc,x,y,w,h,label,current,previous,unit='') {
  card(doc,x,y,w,h,label,safe(current,unit),previous===null||previous===undefined?'Primeira referência':`Anterior: ${safe(previous,unit)} · Δ ${delta(current,previous,unit)}`);
}
function infoRow(doc, label, value, x, y, w=82) {
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...MID);doc.text(label,x,y);
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...BLACK);const lines=doc.splitTextToSize(String(value||'—'),w);doc.text(lines,x,y+5);return y+5+(lines.length*4.2);
}
function table(doc, {title, rows, current, previous, startY=48, unitByKey={}}) {
  let y=sectionTitle(doc,title,startY); const x=14; const widths=[70,36,36,40]; const headers=['Indicador','Atual','Anterior','Evolução'];
  const drawHeader=()=>{doc.setFillColor(...BLACK);doc.rect(x,y,182,8,'F');let cx=x;doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(...WHITE);headers.forEach((h,i)=>{doc.text(h,cx+3,y+5.2);cx+=widths[i]});y+=8;};
  drawHeader();
  for(let i=0;i<rows.length;i++){
    if(y>273){doc.addPage();contentHeader(doc,title);y=30;drawHeader();}
    const [label,key,defaultUnit='']=rows[i]; const unit=unitByKey[key]??defaultUnit; const a=current?.[key],b=previous?.[key];
    doc.setFillColor(...(i%2?[250,250,250]:[242,242,242]));doc.rect(x,y,182,7,'F');
    const values=[label,safe(a,unit),safe(b,unit),delta(a,b,unit)];let cx=x;
    values.forEach((v,j)=>{doc.setFont('helvetica',j===1?'bold':'normal');doc.setFontSize(7.3);doc.setTextColor(...(j===1?BLACK:MID));doc.text(String(v),cx+3,y+4.8);cx+=widths[j]});
    y+=7;
    if(key==='bmi' && bmiCategory(a)){doc.setFont('helvetica','italic');doc.setFontSize(6.8);doc.setTextColor(...MID);doc.text(`Classificação atual: ${bmiCategory(a)}`,x+73,y-1.2)}
  }
  return y+5;
}
function narrative(doc, title, text, y) {
  y=sectionTitle(doc,title,y);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(55);const lines=doc.splitTextToSize(text||'—',178);doc.text(lines,14,y);return y+lines.length*4.7+5;
}

function summaryChanges(current, previous) {
  if(!previous) return ['Esta é a primeira avaliação disponível para comparação.'];
  const cm=assessmentMetrics(current), pm=assessmentMetrics(previous); const items=[];
  [['Peso','weight','kg'],['Massa gorda','fat','%'],['Massa muscular','muscle','kg'],['Cintura','waist','cm']].forEach(([label,key,unit])=>{
    if(n(cm[key])!==null&&n(pm[key])!==null) items.push(`${label}: ${safe(pm[key],unit)} → ${safe(cm[key],unit)} (${delta(cm[key],pm[key],unit)})`);
  });
  return items.length?items:['Não existem métricas comuns suficientes para uma comparação automática.'];
}

export async function buildAssessmentPdf(student, assessment, previousAssessment = null) {
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); const currentMetrics=assessmentMetrics(assessment); const previousMetrics=previousAssessment?assessmentMetrics(previousAssessment):{};
  const assessor=assessment.assessor || student?.trainers?.find?.(item=>item.profileId===assessment.assessorProfileId) || student?.primaryTrainer || null;
  const [logoData, assessorPhoto] = await Promise.all([fetchDataUrl('/ultimatefit-logo-stacked.png'),fetchSquareJpeg(assessor?.photoUrl||assessor?.thumbUrl)]);

  // CAPA
  doc.setFillColor(...YELLOW);doc.rect(0,0,210,205,'F');doc.setFillColor(...BLACK);doc.triangle(0,205,210,165,210,297,'F');doc.rect(0,205,210,92,'F');
  doc.setFillColor(...BLACK);doc.roundedRect(14,15,48,38,2,2,'F'); if(logoData){try{doc.addImage(logoData,'PNG',21,18,34,32)}catch{}}
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...BLACK);doc.text('RELATÓRIO DE ACOMPANHAMENTO PERSONALIZADO',196,25,{align:'right'});
  doc.setFont('helvetica','bold');doc.setFontSize(33);doc.text('AVALIAÇÃO',14,93);doc.text('FÍSICA',14,108);
  doc.setFont('helvetica','normal');doc.setFontSize(11);doc.text('Avaliação · Prescrição · Controlo',14,120);
  doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(student?.name||'Aluno',14,142);doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.text(`${formatDate(assessment.date)}${previousAssessment?` · comparação com ${formatDate(previousAssessment.date)}`:' · avaliação de referência'}`,14,150);
  if(assessorPhoto){try{doc.addImage(assessorPhoto,'JPEG',151,185,38,38)}catch{}}
  doc.setTextColor(...WHITE);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text(assessor?.name||'Equipa ULTIMATE FIT',146,232,{align:'center'});doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(210);doc.text(assessor?.professionalTitle||'Personal Trainer',146,238,{align:'center'});
  const contacts=[cleanPhone(assessor?.phone),assessor?.email].filter(Boolean).join(' · ');if(contacts){doc.setFontSize(7.7);doc.text(contacts,146,244,{align:'center',maxWidth:90})}
  doc.setFontSize(10);doc.setTextColor(...WHITE);doc.text('ultimatefit.pt',14,278);doc.setTextColor(170);doc.setFontSize(8);doc.text('ULTIMATE FIT · Estúdio privado de treino personalizado',14,285);

  // RESUMO
  doc.addPage();contentHeader(doc,'Resumo e evolução');pageTitle(doc,'A tua avaliação em resumo',previousAssessment?`Comparação automática com a avaliação de ${formatDate(previousAssessment.date)}.`:'Primeira avaliação disponível — servirá como referência para a evolução futura.');
  let y=53; doc.setFillColor(250,250,250);doc.roundedRect(14,y,182,29,2,2,'F');
  const leftY=y+7;infoRow(doc,'Aluno',student?.name,19,leftY,70);infoRow(doc,'Idade',student?.age!=null?`${student.age} anos`:'—',19,leftY+11,70);infoRow(doc,'Objetivo',student?.mainGoal||'—',19,leftY+21,70);
  infoRow(doc,'Data da avaliação',formatDate(assessment.date),110,leftY,70);infoRow(doc,'Professor responsável',assessor?.name||'ULTIMATE FIT',110,leftY+11,70);infoRow(doc,'Contacto',cleanPhone(assessor?.phone)||assessor?.email||'ultimatefit.pt',110,leftY+21,70);
  y=91;const cw=42.5,g=4;comparisonCard(doc,14,y,cw,27,'Peso',currentMetrics.weight,previousMetrics.weight,'kg');comparisonCard(doc,14+cw+g,y,cw,27,'Massa gorda',currentMetrics.fat,previousMetrics.fat,'%');comparisonCard(doc,14+(cw+g)*2,y,cw,27,'Massa muscular',currentMetrics.muscle,previousMetrics.muscle,'kg');comparisonCard(doc,14+(cw+g)*3,y,cw,27,'Cintura',currentMetrics.waist,previousMetrics.waist,'cm');
  y=126;card(doc,14,y,57,24,'IMC',currentMetrics.bmi==null?'—':String(currentMetrics.bmi),bmiCategory(currentMetrics.bmi)||'Sem classificação');comparisonCard(doc,76,y,57,24,'Gordura visceral',currentMetrics.visceral,previousMetrics.visceral,'');comparisonCard(doc,138,y,58,24,'Soma das dobras',currentMetrics.skinfoldSum==null?null:Number(currentMetrics.skinfoldSum.toFixed(1)),previousMetrics.skinfoldSum==null?null:Number(previousMetrics.skinfoldSum.toFixed?.(1)??previousMetrics.skinfoldSum),'mm');
  y=164;y=sectionTitle(doc,'Evolução desde a avaliação anterior',y);doc.setFillColor(250,250,250);doc.roundedRect(14,y,182,42,2,2,'F');let by=y+8;summaryChanges(assessment,previousAssessment).forEach(text=>{doc.setFillColor(...YELLOW);doc.circle(20,by-1.3,1.3,'F');doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(45);doc.text(text,25,by);by+=8});
  y=220;y=sectionTitle(doc,'Módulos incluídos neste relatório',y);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...MID);doc.text(assessmentModuleLabels(assessment).join(' · ')||'Avaliação geral',14,y);
  doc.setFont('helvetica','italic');doc.setFontSize(7.5);doc.setTextColor(115);doc.text('As comparações são descritivas e destinam-se ao acompanhamento da evolução. A interpretação clínica deve ser feita por profissional de saúde quando aplicável.',14,271,{maxWidth:182});

  // BIOIMPEDÂNCIA
  if(getModule(assessment,'bioimpedance')){
    doc.addPage();contentHeader(doc,'Bioimpedância TANITA');pageTitle(doc,'Composição corporal','Valores atuais, referência anterior e diferença entre avaliações.');
    table(doc,{title:'Bioimpedância · TANITA',rows:bioRows,current:getModule(assessment,'bioimpedance'),previous:getModule(previousAssessment,'bioimpedance'),startY:52});
  }
  // PERIMETRIA
  if(getModule(assessment,'perimetry')){
    doc.addPage();contentHeader(doc,'Perimetria');pageTitle(doc,'Perimetria corporal','Acompanhamento das principais medidas corporais.');
    table(doc,{title:'Medidas corporais',rows:perimetryRows,current:getModule(assessment,'perimetry'),previous:getModule(previousAssessment,'perimetry'),startY:52});
  }
  // DOBRAS
  if(getModule(assessment,'skinfolds')){
    doc.addPage();contentHeader(doc,'Dobras cutâneas');pageTitle(doc,'Dobras cutâneas','Registo em milímetros e evolução face à avaliação anterior.');
    let end=table(doc,{title:'Pregas cutâneas',rows:skinfoldRows,current:getModule(assessment,'skinfolds'),previous:getModule(previousAssessment,'skinfolds'),startY:52});
    const currentSum=skinfoldSum(getModule(assessment,'skinfolds')), previousSum=skinfoldSum(getModule(previousAssessment,'skinfolds')); end=sectionTitle(doc,'Somatório',end+3);comparisonCard(doc,14,end,70,24,'Σ Dobras',currentSum==null?null:Number(currentSum.toFixed(1)),previousSum==null?null:Number(previousSum.toFixed(1)),'mm');
  }
  // CONTEXTO
  if(getModule(assessment,'anamnesis')||getModule(assessment,'posture')||assessment.notes){
    doc.addPage();contentHeader(doc,'Contexto da avaliação');pageTitle(doc,'Contexto e observações','Informação complementar registada durante a avaliação.');y=53;
    const anam=getModule(assessment,'anamnesis'); if(anam){y=sectionTitle(doc,'Anamnese',y);doc.setFillColor(...LIGHT);doc.roundedRect(14,y,182,34,2,2,'F');infoRow(doc,'Nível de atividade',activityLevelLabel(anam.physical_activity_level),19,y+7,70);infoRow(doc,'Estratificação registada',riskResultLabel(anam.risk_result),105,y+7,80);infoRow(doc,'Fumador',anam.smoker===true?'Sim':anam.smoker===false?'Não':'—',19,y+20,70);infoRow(doc,'Dor muscular',anam.muscle_pain===true?'Sim':anam.muscle_pain===false?'Não':'—',105,y+20,80);y+=44;}
    const posture=getModule(assessment,'posture'); if(posture){const text=[['Anterior',posture.anterior_notes],['Posterior',posture.posterior_notes],['Perfil direito',posture.lateral_right_notes],['Perfil esquerdo',posture.lateral_left_notes]].filter(([,v])=>v).map(([l,v])=>`${l}: ${v}`).join('\n');if(text)y=narrative(doc,'Análise postural',text,y);}
    if(assessment.notes)y=narrative(doc,'Observações do professor',assessment.notes,y);
    y=sectionTitle(doc,'Contacto ULTIMATE FIT',Math.min(y+5,250));doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(55);doc.text(`Professor: ${assessor?.name||'Equipa ULTIMATE FIT'} · ${cleanPhone(assessor?.phone)||assessor?.email||'ultimatefit.pt'}`,14,y);doc.text('Website: ultimatefit.pt',14,y+6);
  }

  const total=doc.internal.getNumberOfPages();for(let page=2;page<=total;page++){doc.setPage(page);footer(doc,page,total)}
  return { name:fileName(student,assessment), doc };
}

export async function downloadAssessmentPdf(student, assessment, previousAssessment = null) {
  const {doc,name}=await buildAssessmentPdf(student,assessment,previousAssessment);doc.save(name);
}
