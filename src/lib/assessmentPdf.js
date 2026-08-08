import {jsPDF} from 'jspdf';
import {assessmentMetrics,assessmentModuleLabels,activityLevelLabel,bmiCategory,riskResultLabel} from './assessments';

function safe(v,unit=''){return v==null||v===''?'—':`${v}${unit?` ${unit}`:''}`;}
function fileName(student,assessment){return `ULTIMATE-FIT-Avaliacao-${(student?.name||'Aluno').replace(/[^a-z0-9]+/gi,'-')}-${assessment.date}.pdf`;}
export function buildAssessmentPdf(student,assessment){
 const doc=new jsPDF({unit:'mm',format:'a4'}); const m=assessmentMetrics(assessment); let y=18;
 const line=(label,value)=>{doc.setFont('helvetica','normal');doc.setTextColor(90);doc.setFontSize(9);doc.text(label,16,y);doc.setTextColor(15);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text(String(value),75,y);y+=7;};
 const title=t=>{if(y>265){doc.addPage();y=18}doc.setTextColor(0);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(t,16,y);y+=8;};
 doc.setFillColor(255,217,8);doc.rect(0,0,210,8,'F');doc.setTextColor(15);doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text('ULTIMATE FIT',16,y);y+=9;doc.setFontSize(16);doc.text('RELATÓRIO DE AVALIAÇÃO FÍSICA',16,y);y+=8;doc.setFontSize(10);doc.setFont('helvetica','normal');doc.setTextColor(90);doc.text(`${student?.name||'Aluno'} · ${new Intl.DateTimeFormat('pt-PT').format(new Date(`${assessment.date}T12:00:00`))}`,16,y);y+=12;
 title('Resumo');line('Peso',safe(m.weight,'kg'));line('Massa gorda',safe(m.fat,'%'));line('Massa muscular',safe(m.muscle,'kg'));line('Água corporal',safe(m.water,'%'));line('Gordura visceral',safe(m.visceral));line('IMC',m.bmi==null?'—':`${safe(m.bmi)}${bmiCategory(m.bmi)?` · ${bmiCategory(m.bmi)}`:''}`);line('Cintura',safe(m.waist,'cm'));line('Anca',safe(m.hip,'cm'));line('Soma das dobras',safe(m.skinfoldSum==null?null:m.skinfoldSum.toFixed(1),'mm'));
 const modules=assessment.modules||{};
 if(modules.anamnesis){title('Anamnese');line('Nível de atividade',activityLevelLabel(modules.anamnesis.physical_activity_level));line('Resultado',riskResultLabel(modules.anamnesis.risk_result));line('Fumador',modules.anamnesis.smoker===true?'Sim':modules.anamnesis.smoker===false?'Não':'—');}
 if(modules.perimetry){title('Perimetria');[['Peito','chest_cm'],['Cintura','waist_cm'],['Abdómen','abdominal_cm'],['Anca','hip_cm'],['Braço direito','arm_right_cm'],['Braço esquerdo','arm_left_cm'],['Coxa direita','thigh_right_cm'],['Coxa esquerda','thigh_left_cm']].forEach(([l,k])=>line(l,safe(modules.perimetry[k],'cm')));}
 if(assessment.notes){title('Observações');doc.setFont('helvetica','normal');doc.setTextColor(50);doc.setFontSize(10);const lines=doc.splitTextToSize(assessment.notes,178);doc.text(lines,16,y);y+=lines.length*5+4;}
 doc.setDrawColor(220);doc.line(16,284,194,284);doc.setFontSize(8);doc.setTextColor(110);doc.text(`ULTIMATE FIT · ${assessmentModuleLabels(assessment).join(' · ')}`,16,290);doc.text('Relatório gerado pela ULTIMATE FIT APP',194,290,{align:'right'});
 return {name:fileName(student,assessment),doc};
}
export function downloadAssessmentPdf(student,assessment){const {doc,name}=buildAssessmentPdf(student,assessment);doc.save(name);}
