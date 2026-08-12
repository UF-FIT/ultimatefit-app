import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {useLocation} from 'react-router-dom';
import {load, save} from '../lib/storage';
import {useAuth} from './AuthContext';
import {seedUsers} from '../data/seed';
import {fetchStudents} from '../lib/students';
import {fetchAssessments} from '../lib/assessments';
import {fetchExercises,fetchWorkoutPlans,fetchMuscleGroups,fetchWorkoutBlockTypes,fetchWorkoutCompletions} from '../lib/training';
import {fetchActivities,fetchNotices} from '../lib/community';
import {fetchNutritionDocuments,fetchNutritionConsultationRequests} from '../lib/nutrition';

const AppContext=createContext(null);
const demoInitial={users:seedUsers,exercises:[],settings:{comingSoon:true,studioName:'ULTIMATE FIT'}};
const roleMap={owner:'admin',admin:'admin',trainer:'professor',student:'aluno'};
const roleLabels={owner:'Proprietário',admin:'Administrador',trainer:'Professor',student:'Aluno'};

function buildInitial(){
 const stored=load('ultimatefit-mvp',demoInitial);
 return {
  ...demoInitial,
  ...stored,
  students:[],
  assessments:[],
  exercises:[],
  muscleGroups:[],
  blockTypes:[],
  plans:[],
  workoutCompletions:[],
  nutrition:[],
  nutritionConsultationRequests:[],
  goals:[],
  messages:[],
  notices:[],
  activities:[],
  activityRegistrations:[],
 };
}

function scopeStorageKey(profileId){return `ultimatefit-student-scope:${profileId}`;}

function DashboardScopeToggle({enabled,onChange,assignedCount,allCount}){
 return <div style={{margin:'0 0 22px'}}>
  <div className="card pad" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:20,borderColor:enabled?'rgba(255,217,8,.35)':undefined}}>
   <div>
    <div style={{fontSize:12,fontWeight:800,letterSpacing:'.08em',color:'#ffd908',marginBottom:6}}>VISUALIZAÇÃO DE ALUNOS</div>
    <h3 style={{margin:'0 0 5px'}}>Ver todos os alunos do estúdio</h3>
    <p style={{margin:0,opacity:.7,fontSize:13}}>{enabled?`Ativo · a mostrar todos os ${allCount} alunos registados no estúdio.`:`Desativado · a mostrar apenas os ${assignedCount} alunos atribuídos a ti.`}</p>
   </div>
   <button type="button" className={enabled?'toggle on':'toggle'} onClick={()=>onChange(enabled?'assigned':'all')} aria-pressed={enabled} title={enabled?'Mostrar apenas os meus alunos':'Mostrar todos os alunos do estúdio'}><span/></button>
  </div>
 </div>;
}

export function AppProvider({children}){
 const {profile}=useAuth();
 const location=useLocation();
 const [data,setData]=useState(buildInitial);
 const [staffStudentScope,setStaffStudentScopeState]=useState('assigned');
 const [dashboardToggleTarget,setDashboardToggleTarget]=useState(null);
 const [studentsLoading,setStudentsLoading]=useState(true);
 const [studentsError,setStudentsError]=useState('');
 const [assessmentsLoading,setAssessmentsLoading]=useState(true);
 const [assessmentsError,setAssessmentsError]=useState('');
 const [trainingLoading,setTrainingLoading]=useState(true);
 const [trainingError,setTrainingError]=useState('');
 const [communityLoading,setCommunityLoading]=useState(true);
 const [communityError,setCommunityError]=useState('');
 const [nutritionLoading,setNutritionLoading]=useState(true);
 const [nutritionError,setNutritionError]=useState('');

 useEffect(()=>{
  const {students,assessments,exercises,muscleGroups,blockTypes,plans,workoutCompletions,nutrition,nutritionConsultationRequests,goals,messages,notices,activities,activityRegistrations,...safeToStore}=data;
  save('ultimatefit-mvp',safeToStore);
 },[data]);

 useEffect(()=>{
  if(!profile?.id){setStaffStudentScopeState('assigned');return;}
  try{
   const stored=localStorage.getItem(scopeStorageKey(profile.id));
   setStaffStudentScopeState(stored==='all'?'all':'assigned');
  }catch{
   setStaffStudentScopeState('assigned');
  }
 },[profile?.id]);

 async function refreshStudents(){
  if(!profile){setData(d=>({...d,students:[]}));setStudentsLoading(false);return []}
  setStudentsLoading(true);setStudentsError('');
  try{const students=await fetchStudents();setData(d=>({...d,students}));return students;}
  catch(error){setStudentsError(error.message||'Não foi possível carregar os alunos.');return [];}
  finally{setStudentsLoading(false)}
 }
 async function refreshAssessments(){
  if(!profile){setData(d=>({...d,assessments:[]}));setAssessmentsLoading(false);return []}
  setAssessmentsLoading(true);setAssessmentsError('');
  try{const assessments=await fetchAssessments();setData(d=>({...d,assessments}));return assessments;}
  catch(error){setAssessmentsError(error.message||'Não foi possível carregar as avaliações.');return [];}
  finally{setAssessmentsLoading(false)}
 }
 async function refreshTraining(){
  if(!profile){setData(d=>({...d,exercises:[],muscleGroups:[],blockTypes:[],plans:[],workoutCompletions:[]}));setTrainingLoading(false);return {exercises:[],muscleGroups:[],blockTypes:[],plans:[],workoutCompletions:[]}}
  setTrainingLoading(true);setTrainingError('');
  try{const [exercises,muscleGroups,blockTypes,plans,workoutCompletions]=await Promise.all([fetchExercises(),fetchMuscleGroups(),fetchWorkoutBlockTypes(),fetchWorkoutPlans(),fetchWorkoutCompletions()]);setData(d=>({...d,exercises,muscleGroups,blockTypes,plans,workoutCompletions}));return {exercises,muscleGroups,blockTypes,plans,workoutCompletions};}
  catch(error){setTrainingError(error.message||'Não foi possível carregar os planos e a biblioteca de exercícios.');return {exercises:[],muscleGroups:[],blockTypes:[],plans:[],workoutCompletions:[]};}
  finally{setTrainingLoading(false)}
 }
 async function refreshCommunity(){
  if(!profile){setData(d=>({...d,notices:[],activities:[],activityRegistrations:[]}));setCommunityLoading(false);return {notices:[],activities:[],registrations:[]}}
  setCommunityLoading(true);setCommunityError('');
  try{const [notices,activityData]=await Promise.all([fetchNotices(),fetchActivities()]);setData(d=>({...d,notices,activities:activityData.activities,activityRegistrations:activityData.registrations}));return {notices,activities:activityData.activities,registrations:activityData.registrations};}
  catch(error){setCommunityError(error.message||'Não foi possível carregar avisos e atividades.');return {notices:[],activities:[],registrations:[]}}
  finally{setCommunityLoading(false)}
 }
 async function refreshNutrition(){
  if(!profile){setData(d=>({...d,nutrition:[],nutritionConsultationRequests:[]}));setNutritionLoading(false);return {nutrition:[],requests:[]}}
  setNutritionLoading(true);setNutritionError('');
  try{const [nutrition,requests]=await Promise.all([fetchNutritionDocuments(),fetchNutritionConsultationRequests()]);setData(d=>({...d,nutrition,nutritionConsultationRequests:requests}));return {nutrition,requests};}
  catch(error){setNutritionError(error.message||'Não foi possível carregar os dados de nutrição.');return {nutrition:[],requests:[]};}
  finally{setNutritionLoading(false)}
 }

 useEffect(()=>{refreshStudents();refreshAssessments();refreshTraining();refreshCommunity();refreshNutrition()},[profile?.id]);

 const currentUser=profile?{
  id:profile.id,role:roleMap[profile.role]||'aluno',systemRole:profile.role,roleLabel:roleLabels[profile.role]||'Aluno',name:profile.full_name||profile.email,
  firstName:profile.first_name||profile.full_name?.split(' ')[0]||'',lastName:profile.last_name||profile.full_name?.split(' ').slice(1).join(' ')||'',email:profile.email,phone:profile.phone||'',
  avatarPath:profile.avatar_path||'',avatarUrl:profile.avatar_url||'',avatarThumbUrl:profile.avatar_thumb_url||profile.avatar_url||'',active:profile.is_active,deletedAt:profile.deleted_at,
 }:data.users[0];

 const allStudents=useMemo(()=>data.students.filter(student=>!student.deletedAt),[data.students]);
 const assignedStudents=useMemo(()=>{
  if(!currentUser) return [];
  if(currentUser.role==='aluno') return allStudents.filter(student=>student.userId===currentUser.id);
  return allStudents.filter(student=>student.trainerIds?.includes(currentUser.id));
 },[allStudents,currentUser?.id,currentUser?.role]);
 const visibleStudents=useMemo(()=>{
  if(!currentUser) return allStudents;
  if(currentUser.role==='aluno') return assignedStudents;
  if(currentUser.role==='admin'&&staffStudentScope==='all') return allStudents;
  return assignedStudents;
 },[allStudents,assignedStudents,currentUser?.role,staffStudentScope]);
 const visibleStudentIds=useMemo(()=>new Set(visibleStudents.map(student=>student.id)),[visibleStudents]);
 const scopedData=useMemo(()=>{
  if(!currentUser||currentUser.role==='aluno') return data;
  const filterByStudent=items=>(items||[]).filter(item=>!item?.studentId||visibleStudentIds.has(item.studentId));
  return {...data,students:visibleStudents,assessments:filterByStudent(data.assessments),plans:filterByStudent(data.plans),workoutCompletions:filterByStudent(data.workoutCompletions),nutrition:filterByStudent(data.nutrition),nutritionConsultationRequests:filterByStudent(data.nutritionConsultationRequests),goals:filterByStudent(data.goals),messages:filterByStudent(data.messages)};
 },[data,currentUser?.id,currentUser?.role,visibleStudents,visibleStudentIds]);

 function setStaffStudentScope(scope){
  if(currentUser?.role!=='admin') return;
  const next=scope==='all'?'all':'assigned';setStaffStudentScopeState(next);
  try{localStorage.setItem(scopeStorageKey(currentUser.id),next);}catch{}
 }

 useEffect(()=>{
  setDashboardToggleTarget(null);
  if(currentUser?.role!=='admin'||!['/','/dashboard'].includes(location.pathname.replace(/\/$/,'' )||'/')) return;
  let container;
  const timer=setTimeout(()=>{
   const content=document.querySelector('.content');
   const heading=content?.querySelector('.heading');
   if(!content||!heading) return;
   container=document.createElement('div');
   container.dataset.dashboardStudentScope='true';
   heading.insertAdjacentElement('afterend',container);
   setDashboardToggleTarget(container);
  },0);
  return ()=>{clearTimeout(timer);setDashboardToggleTarget(null);if(container?.parentNode)container.parentNode.removeChild(container)};
 },[location.pathname,currentUser?.id,currentUser?.role]);

 const update=(key,fn)=>setData(d=>({...d,[key]:typeof fn==='function'?fn(d[key]):fn}));
 const api=useMemo(()=>({data:scopedData,setData,update,currentUser,staffStudentScope,setStaffStudentScope,allStudentsCount:allStudents.length,assignedStudentsCount:assignedStudents.length,refreshStudents,studentsLoading,studentsError,refreshAssessments,assessmentsLoading,assessmentsError,refreshTraining,trainingLoading,trainingError,refreshCommunity,communityLoading,communityError,refreshNutrition,nutritionLoading,nutritionError}),[scopedData,currentUser,staffStudentScope,allStudents.length,assignedStudents.length,studentsLoading,studentsError,assessmentsLoading,assessmentsError,trainingLoading,trainingError,communityLoading,communityError,nutritionLoading,nutritionError]);

 return <AppContext.Provider value={api}>
  {children}
  {dashboardToggleTarget&&currentUser?.role==='admin'&&createPortal(<DashboardScopeToggle enabled={staffStudentScope==='all'} onChange={setStaffStudentScope} assignedCount={assignedStudents.length} allCount={allStudents.length}/>,dashboardToggleTarget)}
 </AppContext.Provider>
}
export const useApp=()=>useContext(AppContext);
