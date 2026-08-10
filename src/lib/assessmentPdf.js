import { jsPDF } from 'jspdf';
import { activityLevelDescription, activityLevelLabel, assessmentMetrics, assessmentModuleLabels, assessmentReferences, automaticRiskSummary, bioimpedanceIndicator, bmiCategory, bodyFatReferenceTable, riskResultLabel, skinfoldSum } from './assessments';

const YELLOW = [255, 217, 8];
const BLACK = [10, 10, 10];
const MID = [92, 92, 92];
const LIGHT = [244, 244, 244];
const LINE = [224, 224, 224];
const WHITE = [255, 255, 255];
const PT = new Intl.DateTimeFormat('pt-PT');

const perimetryRows = [
  ['Pescoço','neck_cm','cm'],['Ombros','shoulder_cm','cm'],['Tórax','chest_cm','cm'],
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

function pdfText(value = '') {
  return String(value)
    .replace(/→/g, ' para ')
    .replace(/Δ/g, 'Variacao')
    .replace(/Σ/g, 'Soma')
    .replace(/[—–]/g, '-')
    .replace(/·/g, '|')
    .normalize('NFC')
    .replace(/[^\u000A\u000D\u0020-\u007E\u00A0-\u00FF]/g, '');
}
function safe(value, unit = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${value}${unit ? ` ${unit}` : ''}`;
}
function n(value) { const result = Number(value); return Number.isFinite(result) ? result : null; }
function formatDate(value) { if (!value) return '-'; try { return PT.format(new Date(`${value}T12:00:00`)); } catch { return value; } }
function fileName(student, assessment) { return `ULTIMATE-FIT-Avaliacao-${(student?.name || 'Aluno').replace(/[^a-z0-9]+/gi,'-')}-${assessment.date}.pdf`; }
function cleanPhone(value='') { return String(value).trim(); }
function delta(current, previous, unit='') {
  const a=n(current), b=n(previous); if(a===null||b===null) return '-';
  const d=a-b; const sign=d>0?'+':''; return `${sign}${d.toFixed(Math.abs(d)<10?1:0)}${unit?` ${unit}`:''}`;
}
function getModule(assessment,key){ return assessment?.modules?.[key] || null; }

async function blobToDataUrl(blob) {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
}
async function fetchImagePng(src, maxWidth = 1200) {
  if (!src || typeof document === 'undefined') return '';
  try {
    const response=await fetch(src); if(!response.ok) return '';
    const blob=await response.blob(); const url=URL.createObjectURL(blob);
    const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=url});
    const scale=Math.min(1,maxWidth/img.naturalWidth); const width=Math.max(1,Math.round(img.naturalWidth*scale)); const height=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height; const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,width,height); ctx.drawImage(img,0,0,width,height); URL.revokeObjectURL(url); return canvas.toDataURL('image/png');
  } catch { return ''; }
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
async function ensureBebas() {
  if (typeof document === 'undefined' || !document.fonts) return;
  try { await document.fonts.load('400 48px "Bebas Neue"'); await document.fonts.ready; } catch {}
}
function addBebasText(doc, text, x, topY, { px = 48, color = '#0a0a0a', maxWidth = 180, align = 'left' } = {}) {
  if (typeof document === 'undefined') {
    doc.setFont('helvetica','bold'); doc.setFontSize(Math.max(12, px * 0.55)); doc.setTextColor(...BLACK); doc.text(pdfText(text),x,topY+8,{align});
    return 10;
  }
  try {
    const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d');
    ctx.font=`400 ${px}px "Bebas Neue", Arial, sans-serif`; const clean=pdfText(text).toUpperCase();
    const measured=Math.ceil(ctx.measureText(clean).width)+10; canvas.width=Math.max(20,measured); canvas.height=Math.ceil(px*1.2);
    const c=canvas.getContext('2d'); c.clearRect(0,0,canvas.width,canvas.height); c.font=`400 ${px}px "Bebas Neue", Arial, sans-serif`; c.textBaseline='top'; c.fillStyle=color; c.fillText(clean,5,0);
    const naturalW=canvas.width*0.264583; const naturalH=canvas.height*0.264583; const scale=Math.min(1,maxWidth/naturalW); const w=naturalW*scale,h=naturalH*scale;
    let drawX=x; if(align==='right') drawX=x-w; if(align==='center') drawX=x-(w/2);
    doc.addImage(canvas.toDataURL('image/png'),'PNG',drawX,topY,w,h,undefined,'FAST'); return h;
  } catch {
    doc.setFont('helvetica','bold'); doc.setFontSize(Math.max(12, px * 0.55)); doc.setTextColor(...BLACK); doc.text(pdfText(text),x,topY+8,{align}); return 10;
  }
}

function addLogo(doc, logoData, x=14, y=5, w=31) {
  if (!logoData) return;
  try { doc.addImage(logoData,'PNG',x,y,w,w/4.77,undefined,'FAST'); } catch {}
}
function footer(doc, page, total) {
  doc.setDrawColor(...LINE); doc.line(14,285,196,285);
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...MID);
  doc.text(pdfText('ULTIMATE FIT | ultimatefit.pt'),14,291);
  doc.text(pdfText(`Relatório gerado pela ULTIMATE FIT APP | ${page}/${total}`),196,291,{align:'right'});
}
function contentHeader(doc, section, logoData) {
  doc.setFillColor(...BLACK); doc.rect(0,0,210,18,'F');
  doc.setFillColor(...YELLOW); doc.rect(0,18,210,3,'F');
  addLogo(doc,logoData,14,5,31);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(205); doc.text(pdfText(section.toUpperCase()),196,11,{align:'right'});
}
function pageTitle(doc, title, subtitle='') {
  addBebasText(doc,title,14,27,{px:48,color:'#0a0a0a',maxWidth:182});
  if(subtitle){doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...MID);doc.text(pdfText(subtitle),14,43,{maxWidth:182});}
}
function sectionTitle(doc, title, y) {
  doc.setFillColor(...YELLOW); doc.rect(14,y-5,4,7,'F'); addBebasText(doc,title,22,y-7,{px:28,color:'#0a0a0a',maxWidth:170}); return y+7;
}
function infoBlock(doc, x, y, label, value, width=74) {
  doc.setFont('helvetica','normal');doc.setFontSize(7.3);doc.setTextColor(...MID);doc.text(pdfText(label),x,y);
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...BLACK);const lines=doc.splitTextToSize(pdfText(value||'-'),width);doc.text(lines,x,y+5);
}
function metricCard(doc,x,y,w,h,label,value,{previous=null,change=null,classification=''}={}) {
  doc.setFillColor(...LIGHT); doc.setDrawColor(235,235,235); doc.roundedRect(x,y,w,h,2,2,'FD');
  doc.setFont('helvetica','normal');doc.setFontSize(7.1);doc.setTextColor(...MID);doc.text(pdfText(label),x+4,y+6);
  doc.setFont('helvetica','bold');doc.setFontSize(14.5);doc.setTextColor(...BLACK);doc.text(pdfText(String(value)),x+4,y+16);
  if(classification){
    doc.setFont('helvetica','normal');doc.setFontSize(7.2);doc.setTextColor(80);const cl=doc.splitTextToSize(pdfText(classification),w-8);doc.text(cl.slice(0,2),x+4,y+22);
  } else if(previous!==null && previous!==undefined) {
    doc.setFont('helvetica','normal');doc.setFontSize(6.9);doc.setTextColor(95);doc.text(pdfText(`Anterior: ${previous}`),x+4,y+22,{maxWidth:w-8});
    doc.setFont('helvetica','bold');doc.setFontSize(6.9);doc.setTextColor(...BLACK);doc.text(pdfText(`Variação: ${change}`),x+4,y+27,{maxWidth:w-8});
  } else {
    doc.setFont('helvetica','normal');doc.setFontSize(6.9);doc.setTextColor(105);doc.text('Primeira referência',x+4,y+24,{maxWidth:w-8});
  }
}
function comparisonCard(doc,x,y,w,h,label,current,previous,unit='') {
  metricCard(doc,x,y,w,h,label,safe(current,unit),{
    previous:previous===null||previous===undefined?null:safe(previous,unit),
    change:previous===null||previous===undefined?null:delta(current,previous,unit),
  });
}
function table(doc, {title, rows, current, previous, startY=48, unitByKey={}, logoData, student=null, assessmentDate=null}) {
  let y=sectionTitle(doc,title,startY); const x=14; const widths=[69,39,36,38]; const headers=['Indicador','Atual','Anterior','Evolução'];
  const drawHeader=()=>{doc.setFillColor(...BLACK);doc.rect(x,y,182,8,'F');let cx=x;doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(...WHITE);headers.forEach((h,i)=>{doc.text(pdfText(h),cx+3,y+5.2);cx+=widths[i]});y+=8;};
  drawHeader();
  for(let i=0;i<rows.length;i++){
    const [label,key,defaultUnit='']=rows[i]; const unit=unitByKey[key]??defaultUnit; const a=current?.[key],b=previous?.[key];
    const classification=student?bioimpedanceIndicator(key,a,current,student,assessmentDate):'';
    const rowH=classification?17:8;
    if(y+rowH>278){doc.addPage();contentHeader(doc,title,logoData);y=30;drawHeader();}
    doc.setFillColor(...(i%2?[250,250,250]:[242,242,242]));doc.rect(x,y,182,rowH,'F');
    const cells=[pdfText(label),pdfText(safe(a,unit)),pdfText(safe(b,unit)),pdfText(delta(a,b,unit))]; let cx=x;
    for(let j=0;j<cells.length;j++){
      doc.setFont('helvetica',j===1?'bold':'normal');doc.setFontSize(7.2);doc.setTextColor(...(j===1?BLACK:MID));
      const maxW=widths[j]-6; const lines=doc.splitTextToSize(cells[j],maxW); doc.text(lines.slice(0,2),cx+3,y+5.1);
      cx+=widths[j];
    }
    if(classification){doc.setFont('helvetica','normal');doc.setFontSize(5.9);doc.setTextColor(88);const lines=doc.splitTextToSize(pdfText(`Referência: ${classification}`),34);doc.text(lines.slice(0,3),x+72,y+9.2);}
    y+=rowH;
  }
  return y+5;
}
function drawBodyFatReferenceTable(doc,startY){
  let y=sectionTitle(doc,'Referência do percentual de gordura',startY); const x=14; const widths=[21,22,24,28,28,31,28]; const headers=['Sexo','Idade','Baixo','Saudável (inferior)','Saudável (superior)','Excesso gordura','Obesidade'];
  doc.setFillColor(...BLACK);doc.rect(x,y,182,8,'F');let cx=x;doc.setFont('helvetica','bold');doc.setFontSize(5.9);doc.setTextColor(...WHITE);headers.forEach((h,i)=>{doc.text(pdfText(h),cx+1.5,y+5.2,{maxWidth:widths[i]-3});cx+=widths[i]});y+=8;
  const rows=[];
  const range=(min,max)=>`${min}–${(max-0.1).toFixed(1).replace('.',',')}`;
  const add=(sex,label)=>bodyFatReferenceTable[sex].forEach(row=>rows.push([label,`${row.minAge}-${row.maxAge}`,`<${row.low}`,range(row.low,row.standardPlus),range(row.standardPlus,row.overfat),range(row.overfat,row.obese),`≥${row.obese}`]));
  add('male','Homens');add('female','Mulheres');
  rows.forEach((row,i)=>{doc.setFillColor(...(i%2?[250,250,250]:[242,242,242]));doc.rect(x,y,182,8,'F');let px=x;row.forEach((cell,j)=>{doc.setFont('helvetica',j===0?'bold':'normal');doc.setFontSize(6.0);doc.setTextColor(...(j===0?BLACK:MID));doc.text(pdfText(cell),px+1.5,y+5.2,{maxWidth:widths[j]-3});px+=widths[j]});y+=8;});
  doc.setFont('helvetica','italic');doc.setFontSize(6.2);doc.setTextColor(100);const ref=doc.splitTextToSize(pdfText(`Fonte: ${assessmentReferences.bodyFat} As categorias Saudável (inferior) e Saudável (superior) pertencem ambas à faixa saudável TANITA; a divisão reproduz o gráfico oficial do fabricante.`),182);doc.text(ref,14,y+5);return y+5+ref.length*3.2;
}
function drawBioimpedanceReferences(doc,startY){
  let y=sectionTitle(doc,'Referências da bioimpedância',startY);
  doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.setTextColor(90);
  const text=`${assessmentReferences.weight} ${assessmentReferences.water} ${assessmentReferences.visceral} ${assessmentReferences.bone} ${assessmentReferences.muscle} ${assessmentReferences.biaCaution}`;
  const lines=doc.splitTextToSize(pdfText(text),182);
  doc.text(lines,14,y);
  return y+lines.length*3.2+4;
}

function narrative(doc, title, text, y) {
  y=sectionTitle(doc,title,y);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(55);const lines=doc.splitTextToSize(pdfText(text||'-'),178);doc.text(lines,14,y);return y+lines.length*4.7+5;
}

function summaryChanges(current, previous) {
  if(!previous) return ['Esta é a primeira avaliação disponível para comparação.'];
  const cm=assessmentMetrics(current), pm=assessmentMetrics(previous); const items=[];
  [['Peso','weight','kg'],['Massa gorda','fat','%'],['Massa muscular','muscle','kg'],['Cintura','waist','cm']].forEach(([label,key,unit])=>{
    if(n(cm[key])!==null&&n(pm[key])!==null) items.push({label, previous:safe(pm[key],unit), current:safe(cm[key],unit), change:delta(cm[key],pm[key],unit)});
  });
  return items.length?items:['Não existem métricas comuns suficientes para uma comparação automática.'];
}

export async function buildAssessmentPdf(student, assessment, previousAssessment = null) {
  await ensureBebas();
  const doc=new jsPDF({unit:'mm',format:'a4',compress:true}); const currentMetrics=assessmentMetrics(assessment); const previousMetrics=previousAssessment?assessmentMetrics(previousAssessment):{};
  const assessor=assessment.assessor || student?.trainers?.find?.(item=>item.profileId===assessment.assessorProfileId) || student?.primaryTrainer || null;
  const [logoData, assessorPhoto] = await Promise.all([fetchImagePng('/brand/ultimatefit-logo.webp'),fetchSquareJpeg(assessor?.photoUrl||assessor?.thumbUrl)]);

  // CAPA
  doc.setFillColor(...YELLOW);doc.rect(0,0,210,205,'F');doc.setFillColor(...BLACK);doc.triangle(0,205,210,165,210,297,'F');doc.rect(0,205,210,92,'F');
  doc.setFillColor(...BLACK);doc.roundedRect(14,14,78,23,2,2,'F'); addLogo(doc,logoData,20,21,58);
  doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...BLACK);doc.text(pdfText('RELATÓRIO DE ACOMPANHAMENTO PERSONALIZADO'),196,25,{align:'right'});
  addBebasText(doc,'AVALIAÇÃO',14,78,{px:72,color:'#0a0a0a',maxWidth:115}); addBebasText(doc,'FÍSICA',14,102,{px:72,color:'#0a0a0a',maxWidth:90});
  doc.setFont('helvetica','normal');doc.setFontSize(10.5);doc.setTextColor(...BLACK);doc.text(pdfText('Avaliação | Prescrição | Controlo'),14,124);
  doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(pdfText(student?.name||'Aluno'),14,144);doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.text(pdfText(`${formatDate(assessment.date)}${previousAssessment?` | comparação com ${formatDate(previousAssessment.date)}`:' | avaliação de referência'}`),14,152);
  if(assessorPhoto){try{doc.addImage(assessorPhoto,'JPEG',151,185,38,38)}catch{}}
  doc.setTextColor(...WHITE);addBebasText(doc,assessor?.name||'Equipa ULTIMATE FIT',146,228,{px:28,color:'#ffffff',maxWidth:90,align:'center'});doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(210);doc.text(pdfText(assessor?.professionalTitle||'Personal Trainer'),146,241,{align:'center'});
  const contacts=[cleanPhone(assessor?.phone),assessor?.email].filter(Boolean).join(' | ');if(contacts){doc.setFontSize(7.7);doc.text(pdfText(contacts),146,247,{align:'center',maxWidth:90});}
  doc.setFontSize(10);doc.setTextColor(...WHITE);doc.text('ultimatefit.pt',14,278);doc.setTextColor(170);doc.setFontSize(8);doc.text(pdfText('ULTIMATE FIT | Estúdio privado de treino personalizado'),14,285);

  // RESUMO
  doc.addPage();contentHeader(doc,'Resumo e evolução',logoData);pageTitle(doc,'A tua avaliação em resumo',previousAssessment?`Comparação automática com a avaliação de ${formatDate(previousAssessment.date)}.`:'Primeira avaliação disponível - servirá como referência para a evolução futura.');
  let y=53; doc.setFillColor(250,250,250);doc.roundedRect(14,y,182,34,2,2,'F');
  infoBlock(doc,19,y+8,'Aluno',student?.name,70);infoBlock(doc,19,y+19,'Idade',student?.age!=null?`${student.age} anos`:'-',70);infoBlock(doc,19,y+26,'Objetivo',student?.mainGoal||'-',70);
  infoBlock(doc,110,y+8,'Data da avaliação',formatDate(assessment.date),70);infoBlock(doc,110,y+19,'Professor responsável',assessor?.name||'ULTIMATE FIT',70);infoBlock(doc,110,y+26,'Contacto',cleanPhone(assessor?.phone)||assessor?.email||'ultimatefit.pt',70);
  y=94;const cw=42.5,g=4;comparisonCard(doc,14,y,cw,31,'Peso',currentMetrics.weight,previousMetrics.weight,'kg');comparisonCard(doc,14+cw+g,y,cw,31,'Massa gorda',currentMetrics.fat,previousMetrics.fat,'%');comparisonCard(doc,14+(cw+g)*2,y,cw,31,'Massa muscular',currentMetrics.muscle,previousMetrics.muscle,'kg');comparisonCard(doc,14+(cw+g)*3,y,cw,31,'Cintura',currentMetrics.waist,previousMetrics.waist,'cm');
  y=132;metricCard(doc,14,y,57,27,'IMC',currentMetrics.bmi==null?'-':String(currentMetrics.bmi),{classification:bmiCategory(currentMetrics.bmi)||'Sem classificação'});comparisonCard(doc,76,y,57,27,'Gordura visceral',currentMetrics.visceral,previousMetrics.visceral,'');comparisonCard(doc,138,y,58,27,'Soma das dobras',currentMetrics.skinfoldSum==null?null:Number(currentMetrics.skinfoldSum.toFixed(1)),previousMetrics.skinfoldSum==null?null:Number(previousMetrics.skinfoldSum.toFixed?.(1)??previousMetrics.skinfoldSum),'mm');
  y=171;y=sectionTitle(doc,'Evolução desde a avaliação anterior',y);doc.setFillColor(250,250,250);doc.roundedRect(14,y,182,48,2,2,'F');let by=y+9;const changes=summaryChanges(assessment,previousAssessment);
  changes.slice(0,5).forEach(item=>{
    doc.setFillColor(...YELLOW);doc.circle(20,by-1.3,1.3,'F');doc.setFont('helvetica','bold');doc.setFontSize(8.2);doc.setTextColor(...BLACK);
    if(typeof item==='string'){doc.text(pdfText(item),25,by,{maxWidth:165});by+=8;return;}
    doc.text(pdfText(item.label),25,by);doc.setFont('helvetica','normal');doc.setTextColor(55);doc.text(pdfText(`de ${item.previous} para ${item.current}`),57,by);doc.setFont('helvetica','bold');doc.setTextColor(...BLACK);doc.text(pdfText(`Variação ${item.change}`),145,by,{maxWidth:46});by+=9;
  });
  y=234;y=sectionTitle(doc,'Módulos incluídos neste relatório',y);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...MID);doc.text(pdfText(assessmentModuleLabels(assessment).join(' | ')||'Avaliação geral'),14,y,{maxWidth:182});
  doc.setFont('helvetica','italic');doc.setFontSize(7.3);doc.setTextColor(115);doc.text(pdfText('As comparações são descritivas e destinam-se ao acompanhamento da evolução. A interpretação clínica deve ser feita por profissional de saúde quando aplicável.'),14,271,{maxWidth:182});

  // BIOIMPEDÂNCIA
  if(getModule(assessment,'bioimpedance')){
    doc.addPage();contentHeader(doc,'Bioimpedância TANITA',logoData);pageTitle(doc,'Composição corporal','Valores atuais, referência anterior e diferença entre avaliações.');
    const bioEnd=table(doc,{title:'Bioimpedância - TANITA',rows:bioRows,current:getModule(assessment,'bioimpedance'),previous:getModule(previousAssessment,'bioimpedance'),startY:52,logoData,student,assessmentDate:assessment.date});
    let bioRefEnd=bioEnd;
    if(bioEnd<226) bioRefEnd=drawBioimpedanceReferences(doc,bioEnd+2);
    if(bioRefEnd<205) drawBodyFatReferenceTable(doc,bioRefEnd+3); else { doc.addPage();contentHeader(doc,'Referência de composição corporal',logoData);pageTitle(doc,'Percentual de gordura','Tabela de referência por sexo e idade.');drawBodyFatReferenceTable(doc,52); }
  }
  // PERIMETRIA
  if(getModule(assessment,'perimetry')){
    doc.addPage();contentHeader(doc,'Perimetria',logoData);pageTitle(doc,'Perimetria corporal','Acompanhamento das principais medidas corporais.');
    table(doc,{title:'Medidas corporais',rows:perimetryRows,current:getModule(assessment,'perimetry'),previous:getModule(previousAssessment,'perimetry'),startY:52,logoData});
  }
  // DOBRAS
  if(getModule(assessment,'skinfolds')){
    doc.addPage();contentHeader(doc,'Dobras cutâneas',logoData);pageTitle(doc,'Dobras cutâneas','Registo em milímetros e evolução face à avaliação anterior.');
    let end=table(doc,{title:'Pregas cutâneas',rows:skinfoldRows,current:getModule(assessment,'skinfolds'),previous:getModule(previousAssessment,'skinfolds'),startY:52,logoData});
    const currentSum=skinfoldSum(getModule(assessment,'skinfolds')), previousSum=skinfoldSum(getModule(previousAssessment,'skinfolds')); end=sectionTitle(doc,'Somatório',end+3);comparisonCard(doc,14,end,70,31,'Soma das dobras',currentSum==null?null:Number(currentSum.toFixed(1)),previousSum==null?null:Number(previousSum.toFixed(1)),'mm');
  }
  // CONTEXTO
  if(getModule(assessment,'anamnesis')||getModule(assessment,'posture')||assessment.notes){
    doc.addPage();contentHeader(doc,'Contexto da avaliação',logoData);pageTitle(doc,'Contexto e observações','Informação complementar registada durante a avaliação.');y=53;
    const anam=getModule(assessment,'anamnesis'); if(anam){const autoRisk=automaticRiskSummary(anam);y=sectionTitle(doc,'Anamnese',y);doc.setFillColor(...LIGHT);doc.roundedRect(14,y,182,43,2,2,'F');infoBlock(doc,19,y+8,'Nível de atividade',activityLevelLabel(anam.physical_activity_level),76);infoBlock(doc,105,y+8,'Estratificação automática',riskResultLabel(autoRisk.result||anam.risk_result),80);doc.setFont('helvetica','normal');doc.setFontSize(6.7);doc.setTextColor(90);doc.text(doc.splitTextToSize(pdfText(activityLevelDescription(anam.physical_activity_level)||'-'),76).slice(0,2),19,y+15);infoBlock(doc,19,y+29,'Fumador',anam.smoker===true?'Sim':anam.smoker===false?'Não':'-',70);infoBlock(doc,105,y+29,'Dor muscular',anam.muscle_pain===true?'Sim':anam.muscle_pain===false?'Não':'-',80);y+=49;y=sectionTitle(doc,'Referências da triagem',y);doc.setFont('helvetica','normal');doc.setFontSize(6.6);doc.setTextColor(85);let refs=doc.splitTextToSize(pdfText(`${assessmentReferences.activity} ${assessmentReferences.risk} Resultado informativo: não substitui avaliação, diagnóstico ou autorização médica.`),182);doc.text(refs,14,y);y+=refs.length*3.3+5;}
    const posture=getModule(assessment,'posture'); if(posture){const text=[['Anterior',posture.anterior_notes],['Posterior',posture.posterior_notes],['Perfil direito',posture.lateral_right_notes],['Perfil esquerdo',posture.lateral_left_notes]].filter(([,v])=>v).map(([l,v])=>`${l}: ${v}`).join('\n');if(text)y=narrative(doc,'Análise postural',text,y);}
    if(assessment.notes)y=narrative(doc,'Observações do professor',assessment.notes,y);
    y=sectionTitle(doc,'Contacto ULTIMATE FIT',Math.min(y+5,250));doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(55);doc.text(pdfText(`Professor: ${assessor?.name||'Equipa ULTIMATE FIT'} | ${cleanPhone(assessor?.phone)||assessor?.email||'ultimatefit.pt'}`),14,y,{maxWidth:182});doc.text('Website: ultimatefit.pt',14,y+6);
  }

  const total=doc.internal.getNumberOfPages();for(let page=2;page<=total;page++){doc.setPage(page);footer(doc,page,total);}
  return { name:fileName(student,assessment), doc };
}

export async function downloadAssessmentPdf(student, assessment, previousAssessment = null) {
  const {doc,name}=await buildAssessmentPdf(student,assessment,previousAssessment);doc.save(name);
}
