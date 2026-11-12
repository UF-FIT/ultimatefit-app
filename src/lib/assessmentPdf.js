import { jsPDF } from 'jspdf';
import { activityLevelDescription, activityLevelLabel, assessmentMetrics, assessmentModuleLabels, assessmentReferences, automaticRiskSummary, bioimpedanceIndicator, bmiCategory, bodyFatReferenceTable, effectiveBmi, riskResultLabel, skinfoldSum } from './assessments';

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
  ['Altura','height_cm','cm'],['Peso','weight_kg','kg'],['IMC','bmi','kg/m²'],['Massa gorda','body_fat_pct','%'],
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
    const [label,key,defaultUnit='']=rows[i]; const unit=unitByKey[key]??defaultUnit; const a=key==='bmi'?(effectiveBmi(current)??current?.[key]):current?.[key],b=key==='bmi'?(effectiveBmi(previous)??previous?.[key]):previous?.[key];
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
  const text=`${assessmentReferences.weight} ${assessmentReferences.water} ${assessmentReferences.visceral} ${assessmentReferences.bone} ${assessmentReferences.muscle} ${assessmentReferences.metabolism} ${assessmentReferences.biaCaution}`;
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

function printableNumber(value, digits = 1) {
  const valueNumber = n(value);
  return valueNumber === null ? '—' : valueNumber.toLocaleString('pt-PT', { maximumFractionDigits: digits });
}
function printableDifference(current, previous, unit = '', digits = 1) {
  const a = n(current); const b = n(previous);
  if (a === null || b === null) return '—';
  const difference = a - b;
  if (Math.abs(difference) < 10 ** (-digits) / 2) return '=';
  const formatted = difference.toLocaleString('pt-PT', { maximumFractionDigits: digits, signDisplay: 'always' });
  return `${formatted}${unit ? ` ${unit}` : ''}`;
}
function comparisonColor(key, current, previous) {
  const a = n(current); const b = n(previous);
  if (a === null || b === null || a === b) return MID;
  const lowerIsBetter = ['weight_kg','bmi','body_fat_pct','visceral_fat_rating','metabolic_age','waist_cm','abdominal_cm','hip_cm','arm_left_relaxed_cm','arm_right_relaxed_cm'].includes(key);
  const higherIsBetter = ['muscle_mass_kg','water_pct','basal_metabolic_rate_kcal','thigh_left_cm','thigh_right_cm','calf_left_cm','calf_right_cm'].includes(key);
  if (lowerIsBetter) return a < b ? [35, 133, 82] : [217, 83, 79];
  if (higherIsBetter) return a > b ? [35, 133, 82] : [217, 83, 79];
  return MID;
}
function drawComparisonBand(doc, y, title, rightText = '') {
  doc.setFillColor(...BLACK); doc.rect(6, y, 198, 7.5, 'F');
  if (typeof document !== 'undefined') {
    addBebasText(doc, title, 9, y + 0.3, { px: 20, color: '#ffffff', maxWidth: 145 });
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...WHITE);
    doc.text(pdfText(title), 9, y + 5.2);
  }
  if (rightText) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); doc.setTextColor(...WHITE);
    doc.text(pdfText(rightText), 201, y + 4.8, { align: 'right' });
  }
}
function drawPairBars(doc, { x, baseline, width, height, previous, current, max, unit }) {
  const values = [n(previous), n(current)];
  const colors = [[164, 164, 164], YELLOW];
  const barW = Math.min(6, width * 0.27);
  const gap = 1.2;
  const startX = x + (width - barW * 2 - gap) / 2;
  values.forEach((value, index) => {
    if (value === null) return;
    const barH = Math.max(0.8, Math.min(height, value / (max || value || 1) * height));
    const barX = startX + index * (barW + gap);
    doc.setFillColor(...colors[index]); doc.rect(barX, baseline - barH, barW, barH, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.1); doc.setTextColor(...BLACK);
    doc.text(pdfText(printableNumber(value)), barX + barW / 2, baseline - barH - 1.2, { align: 'center' });
  });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(4.9); doc.setTextColor(...MID);
  doc.text(pdfText(unit), x + width / 2, baseline + 4, { align: 'center' });
}
function buildComparisonConclusion(current, previous, metrics, beforeMetrics) {
  const firstName = String(current?.name || 'O aluno').trim().split(/\s+/)[0];
  if (!previous) return `${firstName}: esta é a primeira avaliação disponível. Os valores ficam como referência para acompanhar as próximas medições.`;
  const parts = [];
  const weightDelta = n(metrics.weight) === null || n(beforeMetrics.weight) === null ? null : n(metrics.weight) - n(beforeMetrics.weight);
  const fatDelta = n(metrics.fat) === null || n(beforeMetrics.fat) === null ? null : n(metrics.fat) - n(beforeMetrics.fat);
  const waistDelta = n(metrics.waist) === null || n(beforeMetrics.waist) === null ? null : n(metrics.waist) - n(beforeMetrics.waist);
  const abdominalDelta = n(metrics.abdominal) === null || n(beforeMetrics.abdominal) === null ? null : n(metrics.abdominal) - n(beforeMetrics.abdominal);
  if (weightDelta !== null) parts.push(Math.abs(weightDelta) < 1 ? 'peso praticamente estável' : `peso ${weightDelta < 0 ? 'desceu' : 'subiu'} ${printableNumber(Math.abs(weightDelta))} kg`);
  if (fatDelta !== null && Math.abs(fatDelta) >= 0.05) parts.push(`massa gorda ${fatDelta < 0 ? 'desceu' : 'subiu'} ${printableNumber(Math.abs(fatDelta))} p.p.`);
  if (waistDelta !== null && Math.abs(waistDelta) >= 0.05) parts.push(`cintura ${waistDelta < 0 ? 'reduziu' : 'aumentou'} ${printableNumber(Math.abs(waistDelta))} cm`);
  if (abdominalDelta !== null && Math.abs(abdominalDelta) >= 0.05) parts.push(`abdómen ${abdominalDelta < 0 ? 'reduziu' : 'aumentou'} ${printableNumber(Math.abs(abdominalDelta))} cm`);
  return parts.length ? `${firstName}: ${parts.slice(0, 3).join('; ')}. Comparação descritiva das medições registadas.` : `${firstName}: não existem métricas comuns suficientes para descrever a evolução. Compara os valores acima em condições de medição semelhantes.`;
}

export async function buildAssessmentPdf(student, assessment, previousAssessment = null) {
  await ensureBebas();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const currentBio = getModule(assessment, 'bioimpedance') || {};
  const previousBio = getModule(previousAssessment, 'bioimpedance') || {};
  const currentPerimetry = getModule(assessment, 'perimetry') || {};
  const previousPerimetry = getModule(previousAssessment, 'perimetry') || {};
  const metrics = assessmentMetrics(assessment);
  const beforeMetrics = previousAssessment ? assessmentMetrics(previousAssessment) : {};
  const hasPrevious = Boolean(previousAssessment);
  const decimal = value => printableNumber(value, 1);
  const compositionRows = [
    ['Peso (kg)', 'weight_kg', currentBio.weight_kg, previousBio.weight_kg, 'kg'],
    ['IMC', 'bmi', effectiveBmi(currentBio) ?? currentBio.bmi, effectiveBmi(previousBio) ?? previousBio.bmi, ''],
    ['Massa gorda (%)', 'body_fat_pct', currentBio.body_fat_pct, previousBio.body_fat_pct, '%'],
    ['Massa muscular / magra (kg)', 'muscle_mass_kg', currentBio.muscle_mass_kg, previousBio.muscle_mass_kg, 'kg'],
    ['Gordura visceral', 'visceral_fat_rating', currentBio.visceral_fat_rating, previousBio.visceral_fat_rating, ''],
    ['Água corporal (%)', 'water_pct', currentBio.water_pct, previousBio.water_pct, '%'],
    ['Metabolismo basal (kcal)', 'basal_metabolic_rate_kcal', currentBio.basal_metabolic_rate_kcal, previousBio.basal_metabolic_rate_kcal, 'kcal'],
    ['Idade metabólica', 'metabolic_age', currentBio.metabolic_age, previousBio.metabolic_age, 'anos'],
    ['Massa óssea (kg)', 'bone_mass_kg', currentBio.bone_mass_kg, previousBio.bone_mass_kg, 'kg'],
  ];
  const perimetry = [
    ['Cintura', 'waist_cm'], ['Abdómen', 'abdominal_cm'], ['Anca', 'hip_cm'],
    ['Braço E', 'arm_left_relaxed_cm'], ['Braço D', 'arm_right_relaxed_cm'],
    ['Coxa E', 'thigh_left_cm'], ['Coxa D', 'thigh_right_cm'],
    ['Gémeo E', 'calf_left_cm'], ['Gémeo D', 'calf_right_cm'],
  ];

  // Cabeçalho: identificação do aluno e das duas avaliações comparadas.
  doc.setFillColor(...WHITE); doc.rect(0, 0, 210, 297, 'F');
  const studentName = pdfText(String(student?.name || 'Aluno').toLocaleUpperCase('pt-PT'));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(25); doc.setTextColor(...BLACK);
  while (doc.getTextWidth(studentName) > 132 && doc.getFontSize() > 13) doc.setFontSize(doc.getFontSize() - 0.5);
  doc.text(studentName, 7, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MID);
  doc.text(pdfText('C O M P A R A T I V O   D E   A V A L I A Ç Õ E S   F Í S I C A S'), 8, 25);
  doc.setDrawColor(...BLACK); doc.setLineWidth(0.35); doc.line(145, 7, 145, 25);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...BLACK);
  doc.text(pdfText('AVALIAÇÃO ANTERIOR'), 151, 11);
  doc.setFontSize(8.5); doc.text(pdfText(hasPrevious ? formatDate(previousAssessment.date) : 'Sem avaliação anterior'), 151, 17);
  doc.setFontSize(6.5); doc.text(pdfText('AVALIAÇÃO ATUAL'), 151, 22);
  doc.setFontSize(8.5); doc.text(pdfText(formatDate(assessment?.date)), 151, 27);

  // Composição corporal e resumo rápido.
  drawComparisonBand(doc, 32, 'COMPOSIÇÃO CORPORAL');
  const tableX = 7; const tableY = 41; const tableW = 136; const rowH = 7.45;
  const columns = [58, 24, 25, 29];
  doc.setFillColor(238, 238, 238); doc.rect(tableX, tableY, tableW, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.9); doc.setTextColor(...MID);
  const headings = ['INDICADOR', hasPrevious ? 'ANTERIOR' : 'ANTERIOR', 'ATUAL', 'DIFERENÇA'];
  let headerX = tableX;
  headings.forEach((heading, index) => {
    const align = index === 0 ? 'left' : 'right';
    doc.text(pdfText(heading), align === 'left' ? headerX + 2 : headerX + columns[index] - 2, tableY + 5.3, { align });
    headerX += columns[index];
  });
  compositionRows.forEach((row, index) => {
    const y = tableY + 8 + index * rowH;
    doc.setFillColor(...(index % 2 ? [250, 250, 250] : [242, 242, 242])); doc.rect(tableX, y, tableW, rowH, 'F');
    doc.setFont('helvetica', index === 0 ? 'bold' : 'normal'); doc.setFontSize(6.2); doc.setTextColor(...BLACK);
    doc.text(pdfText(row[0]), tableX + 2, y + 5.1, { maxWidth: columns[0] - 4 });
    const values = [row[3], row[2]];
    let x = tableX + columns[0];
    values.forEach((value, valueIndex) => {
      doc.setFont('helvetica', valueIndex === 1 ? 'bold' : 'normal'); doc.setTextColor(...(valueIndex === 1 ? BLACK : MID));
      const valueText = n(value) === null ? '—' : `${decimal(value)}${row[4] ? ` ${row[4]}` : ''}`;
      doc.text(pdfText(valueText), x + columns[valueIndex + 1] - 2, y + 5.1, { align: 'right' });
      x += columns[valueIndex + 1];
    });
    const diff = printableDifference(row[2], row[3], row[4] === '%' ? 'p.p.' : row[4], 1);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); doc.setTextColor(...comparisonColor(row[1], row[2], row[3]));
    doc.text(pdfText(hasPrevious ? diff : '—'), tableX + tableW - 2, y + 5.1, { align: 'right' });
  });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(...BLACK); doc.text('EM RESUMO', 149, 40);
  const summaryItems = [
    ['PESO', metrics.weight, beforeMetrics.weight, 'kg', 'kg', 'weight_kg'],
    ['MASSA GORDA', metrics.fat, beforeMetrics.fat, 'p.p.', '%', 'body_fat_pct'],
    ['ÁGUA CORPORAL', currentBio.water_pct, previousBio.water_pct, 'p.p.', '%', 'water_pct'],
    ['METABOLISMO BASAL', currentBio.basal_metabolic_rate_kcal, previousBio.basal_metabolic_rate_kcal, 'kcal', 'kcal', 'basal_metabolic_rate_kcal'],
  ];
  summaryItems.forEach(([label, current, previous, unit, currentUnit, key], index) => {
    const y = 47 + index * 17.5;
    doc.setDrawColor(90, 90, 90); doc.setLineWidth(0.3); doc.circle(153, y + 3, 3.4, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.4); doc.setTextColor(...BLACK);
    doc.text(pdfText(key === 'weight_kg' ? 'kg' : key === 'water_pct' ? 'H2O' : key === 'basal_metabolic_rate_kcal' ? 'kcal' : '%'), 153, y + 4.7, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...MID); doc.text(pdfText(label), 159, y + 1.5);
    const difference = hasPrevious ? printableDifference(current, previous, unit, key === 'basal_metabolic_rate_kcal' ? 0 : 1) : '—';
    const numDifference = n(current) === null || n(previous) === null ? null : n(current) - n(previous);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...comparisonColor(key, current, previous));
    doc.text(pdfText(difference), 159, y + 7);
    if (numDifference !== null) {
      const note = key === 'weight_kg' && Math.abs(numDifference) < 1 ? '(praticamente estável)' : `${decimal(current)}${currentUnit ? ` ${currentUnit}` : ''} atual`;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.3); doc.setTextColor(...MID); doc.text(pdfText(note), 159, y + 11.5, { maxWidth: 43 });
    }
  });

  // Gráfico de perímetros com valores anteriores e atuais.
  const legend = `${hasPrevious ? 'Cinza: anterior' : 'Sem avaliação anterior'}   Amarelo: atual`;
  drawComparisonBand(doc, 119, 'PERIMETRIA CORPORAL', legend);
  const chartTop = 132; const baseline = 174; const chartHeight = baseline - chartTop;
  const chartLeft = 20; const chartRight = 202; const chartWidth = chartRight - chartLeft;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2); doc.setTextColor(...MID);
  [0, 30, 60, 90, 120].forEach(value => {
    const y = baseline - (value / 120) * chartHeight;
    doc.setDrawColor(228, 228, 228); doc.setLineWidth(0.15); doc.line(chartLeft, y, chartRight, y);
    doc.text(String(value), 17, y + 1.7, { align: 'right' });
  });
  doc.setFontSize(5.3); doc.text('cm', 8, chartTop + 2);
  const groupW = chartWidth / perimetry.length;
  perimetry.forEach(([label, key], index) => {
    const center = chartLeft + groupW * (index + 0.5);
    const values = [n(previousPerimetry[key]), n(currentPerimetry[key])];
    const colors = [[164, 164, 164], YELLOW]; const barW = 5.6; const gap = 1.2;
    values.forEach((value, valueIndex) => {
      if (value === null) return;
      const height = Math.max(0.6, Math.min(chartHeight, value / 120 * chartHeight));
      const x = center - (barW + gap / 2) + valueIndex * (barW + gap);
      doc.setFillColor(...colors[valueIndex]); doc.rect(x, baseline - height, barW, height, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(4.7); doc.setTextColor(...BLACK);
      doc.text(pdfText(decimal(value)), x + barW / 2, baseline - height - 1, { align: 'center' });
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(4.8); doc.setTextColor(...BLACK);
    doc.text(pdfText(label.toLocaleUpperCase('pt-PT')), center, baseline + 4, { align: 'center' });
    const difference = hasPrevious ? printableDifference(currentPerimetry[key], previousPerimetry[key], 'cm', 1) : '—';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.2); doc.setTextColor(...comparisonColor(key, currentPerimetry[key], previousPerimetry[key]));
    doc.text(pdfText(difference), center, baseline + 10, { align: 'center' });
  });

  // Evolução resumida e conclusão no mesmo A4.
  drawComparisonBand(doc, 190, 'EVOLUÇÃO DA COMPOSIÇÃO CORPORAL');
  const charts = [
    ['PESO (kg)', 'weight_kg', currentBio.weight_kg, previousBio.weight_kg],
    ['MASSA GORDA (%)', 'body_fat_pct', currentBio.body_fat_pct, previousBio.body_fat_pct],
    ['ÁGUA CORPORAL (%)', 'water_pct', currentBio.water_pct, previousBio.water_pct],
    ['GORDURA VISCERAL', 'visceral_fat_rating', currentBio.visceral_fat_rating, previousBio.visceral_fat_rating],
  ];
  const panelY = 201; const panelH = 49; const graphX = 7; const graphW = 132;
  doc.setFillColor(250, 250, 250); doc.rect(graphX, panelY, graphW, panelH, 'F');
  const eachW = graphW / charts.length;
  charts.forEach(([label, key, current, previous], index) => {
    const x = graphX + index * eachW;
    if (index) { doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.2); doc.line(x, panelY + 3, x, panelY + panelH - 3); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.3); doc.setTextColor(...BLACK);
    doc.text(pdfText(label), x + eachW / 2, panelY + 6, { align: 'center', maxWidth: eachW - 2 });
    const maximum = Math.max(n(current) || 0, n(previous) || 0) * 1.18 || 1;
    drawPairBars(doc, { x: x + 2, baseline: panelY + 39, width: eachW - 4, height: 24, previous, current, max: maximum, unit: '' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(4.6); doc.setTextColor(...MID);
    doc.text(pdfText(hasPrevious ? `${formatDate(previousAssessment.date).slice(0, 5)}` : '—'), x + eachW * 0.34, panelY + 46, { align: 'center' });
    doc.text(pdfText(formatDate(assessment.date).slice(0, 5)), x + eachW * 0.68, panelY + 46, { align: 'center' });
  });
  doc.setFillColor(...LIGHT); doc.rect(143, panelY, 61, panelH, 'F');
  addBebasText(doc, 'CONCLUSÃO', 147, panelY + 2, { px: 17, color: '#0a0a0a', maxWidth: 53 });
  const conclusion = buildComparisonConclusion(student, previousAssessment, metrics, beforeMetrics);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.1); doc.setTextColor(65);
  doc.text(doc.splitTextToSize(pdfText(conclusion), 53).slice(0, 10), 147, panelY + 13);

  // Orientação curta inspirada no exemplo enviado.
  doc.setFillColor(...YELLOW); doc.rect(6, 256, 198, 34, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...BLACK);
  doc.text(pdfText('PRÓXIMOS PASSOS'), 10, 269);
  doc.setDrawColor(...BLACK); doc.setLineWidth(0.35); doc.line(63, 261, 63, 285);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...BLACK);
  const nextSteps = hasPrevious
    ? 'Manter o acompanhamento do treino e repetir a avaliação em condições semelhantes para acompanhar a tendência das medidas.'
    : 'Usar estes valores como referência e repetir a avaliação em condições semelhantes para acompanhar a evolução.';
  doc.text(doc.splitTextToSize(pdfText(nextSteps), 132).slice(0, 3), 69, 268);
  return { name: fileName(student, assessment), doc };
}

export async function downloadAssessmentPdf(student, assessment, previousAssessment = null) {
  const {doc,name}=await buildAssessmentPdf(student,assessment,previousAssessment);doc.save(name);
}

