import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {load, save} from '../lib/storage';
import {useAuth} from './AuthContext';
import {seedUsers,seedExercises,seedChallenges} from '../data/seed';
import {fetchStudents} from '../lib/students';

const AppContext=createContext(null);
const demoInitial={users:seedUsers,exercises:seedExercises,challenges:seedChallenges,settings:{comingSoon:true,studioName:'ULTIMATE FIT'}};
const roleMap={owner:'admin',admin:'admin',trainer:'professor',student:'aluno'};
const roleLabels={owner:'Proprietário',admin:'Administrador',trainer:'Professor',student:'Aluno'};

function buildInitial(){
 const stored=load('ultimatefit-mvp',demoInitial);
 return {
  ...demoInitial,
  ...stored,
  students:[],
  assessments:[],
  plans:[],
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

 useEffect(()=>{
  const {students,assessments,plans,nutrition,goals,messages,...safeToStore}=data;
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

 useEffect(()=>{refreshStudents()},[profile?.id]);

 const currentUser=profile?{
  id:profile.id,
  role:roleMap[profile.role]||'aluno',
  systemRole:profile.role,
  roleLabel:roleLabels[profile.role]||'Aluno',
  name:profile.full_name||profile.email,
  email:profile.email,
  phone:profile.phone||'',
  avatarPath:profile.avatar_path||'',
  active:profile.is_active,
  deletedAt:profile.deleted_at,
 }:data.users[0];
 const update=(key,fn)=>setData(d=>({...d,[key]:typeof fn==='function'?fn(d[key]):fn}));
 const api=useMemo(()=>({data,setData,update,currentUser,refreshStudents,studentsLoading,studentsError}),[data,currentUser,studentsLoading,studentsError]);
 return <AppContext.Provider value={api}>{children}</AppContext.Provider>
}
export const useApp=()=>useContext(AppContext);
