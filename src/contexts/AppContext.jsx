import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {load, save} from '../lib/storage';
import {useAuth} from './AuthContext';
import {seedUsers} from '../data/seed';
import {fetchStudents} from '../lib/students';
import {fetchAssessments} from '../lib/assessments';
import {fetchExercises,fetchWorkoutPlans,fetchMuscleGroups,fetchWorkoutBlockTypes,fetchWorkoutCompletions} from '../lib/training';

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
  goals:[],
  messages:[],
 };
}

export function AppProvider({children}){
 const {profile}=useAuth();
 const [data,setData]=useState(buildInitial);
 const [studentsLoading,setStudentsLoading]=useState(true);
 const [studentsError,setStudentsError]=useState('');
 const [assessmentsLoading,setAssessmentsLoading]=useState(true);
 const [assessmentsError,setAssessmentsError]=useState('');
 const [trainingLoading,setTrainingLoading]=useState(true);
 const [trainingError,setTrainingError]=useState('');

 useEffect(()=>{
  const {students,assessments,exercises,muscleGroups,blockTypes,plans,workoutCompletions,nutrition,goals,messages,...safeToStore}=data;
  save('ultimatefit-mvp',safeToStore);
 },[data]);

 async function refreshStudents(){
  if(!profile){setData(d=>({...d,students:[]}));setStudentsLoading(false);return []}
  setStudentsLoading(true);setStudentsError('');
  try{
   const students=await fetchStudents();
   setData(d=>({...d,students}));
   return students;
  }catch(error){
   setStudentsError(error.message||'Não foi possível carregar os alunos.');
   return [];
  }finally{setStudentsLoading(false)}
 }


 async function refreshAssessments(){
  if(!profile){setData(d=>({...d,assessments:[]}));setAssessmentsLoading(false);return []}
  setAssessmentsLoading(true);setAssessmentsError('');
  try{
   const assessments=await fetchAssessments();
   setData(d=>({...d,assessments}));
   return assessments;
  }catch(error){
   setAssessmentsError(error.message||'Não foi possível carregar as avaliações.');
   return [];
  }finally{setAssessmentsLoading(false)}
 }

 async function refreshTraining(){
  if(!profile){setData(d=>({...d,exercises:[],muscleGroups:[],blockTypes:[],plans:[],workoutCompletions:[]}));setTrainingLoading(false);return {exercises:[],muscleGroups:[],blockTypes:[],plans:[],workoutCompletions:[]}}
  setTrainingLoading(true);setTrainingError('');
  try{
   const [exercises,muscleGroups,blockTypes,plans,workoutCompletions]=await Promise.all([fetchExercises(),fetchMuscleGroups(),fetchWorkoutBlockTypes(),fetchWorkoutPlans(),fetchWorkoutCompletions()]);
   setData(d=>({...d,exercises,muscleGroups,blockTypes,plans,workoutCompletions}));
   return {exercises,muscleGroups,blockTypes,plans,workoutCompletions};
  }catch(error){
   setTrainingError(error.message||'Não foi possível carregar os planos e a biblioteca de exercícios.');
   return {exercises:[],muscleGroups:[],blockTypes:[],plans:[],workoutCompletions:[]};
  }finally{setTrainingLoading(false)}
 }

 useEffect(()=>{refreshStudents();refreshAssessments();refreshTraining()},[profile?.id]);

 const currentUser=profile?{
  id:profile.id,
  role:roleMap[profile.role]||'aluno',
  systemRole:profile.role,
  roleLabel:roleLabels[profile.role]||'Aluno',
  name:profile.full_name||profile.email,
  firstName:profile.first_name||profile.full_name?.split(' ')[0]||'',
  lastName:profile.last_name||profile.full_name?.split(' ').slice(1).join(' ')||'',
  email:profile.email,
  phone:profile.phone||'',
  avatarPath:profile.avatar_path||'',
  avatarUrl:profile.avatar_url||'',
  avatarThumbUrl:profile.avatar_thumb_url||profile.avatar_url||'',
  active:profile.is_active,
  deletedAt:profile.deleted_at,
 }:data.users[0];
 const update=(key,fn)=>setData(d=>({...d,[key]:typeof fn==='function'?fn(d[key]):fn}));
 const api=useMemo(()=>({data,setData,update,currentUser,refreshStudents,studentsLoading,studentsError,refreshAssessments,assessmentsLoading,assessmentsError,refreshTraining,trainingLoading,trainingError}),[data,currentUser,studentsLoading,studentsError,assessmentsLoading,assessmentsError,trainingLoading,trainingError]);
 return <AppContext.Provider value={api}>{children}</AppContext.Provider>
}
export const useApp=()=>useContext(AppContext);
