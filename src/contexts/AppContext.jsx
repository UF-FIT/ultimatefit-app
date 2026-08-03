import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {load, save} from '../lib/storage';
import {useAuth} from './AuthContext';
import {seedUsers,seedStudents,seedAssessments,seedExercises,seedPlans,seedNutrition,seedGoals,seedChallenges,seedMessages} from '../data/seed';

const AppContext=createContext(null);
const initial={users:seedUsers,students:seedStudents,assessments:seedAssessments,exercises:seedExercises,plans:seedPlans,nutrition:seedNutrition,goals:seedGoals,challenges:seedChallenges,messages:seedMessages,settings:{comingSoon:true,studioName:'ULTIMATE FIT'}};
const roleMap={admin:'admin',trainer:'professor',student:'aluno'};

export function AppProvider({children}){
 const {profile}=useAuth();
 const [data,setData]=useState(()=>load('ultimatefit-mvp',initial));
 useEffect(()=>save('ultimatefit-mvp',data),[data]);
 const currentUser=profile?{
  id:profile.id,
  role:roleMap[profile.role]||'aluno',
  name:profile.full_name||profile.email,
  email:profile.email,
  active:profile.is_active,
 }:data.users[0];
 const update=(key,fn)=>setData(d=>({...d,[key]:typeof fn==='function'?fn(d[key]):fn}));
 const api=useMemo(()=>({data,setData,update,currentUser}),[data,currentUser]);
 return <AppContext.Provider value={api}>{children}</AppContext.Provider>
}
export const useApp=()=>useContext(AppContext);
