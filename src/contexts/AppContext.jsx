import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {load, save} from '../lib/storage';
import {seedUsers,seedStudents,seedAssessments,seedExercises,seedPlans,seedNutrition,seedGoals,seedChallenges,seedMessages} from '../data/seed';

const AppContext=createContext(null);
const initial={users:seedUsers,students:seedStudents,assessments:seedAssessments,exercises:seedExercises,plans:seedPlans,nutrition:seedNutrition,goals:seedGoals,challenges:seedChallenges,messages:seedMessages,settings:{comingSoon:true,studioName:'ULTIMATE FIT'}};

export function AppProvider({children}){
 const [data,setData]=useState(()=>load('ultimatefit-mvp',initial));
 const [currentUserId,setCurrentUserId]=useState(()=>load('ultimatefit-current-user','u-admin'));
 useEffect(()=>save('ultimatefit-mvp',data),[data]);
 useEffect(()=>save('ultimatefit-current-user',currentUserId),[currentUserId]);
 const currentUser=data.users.find(u=>u.id===currentUserId)||data.users[0];
 const update=(key,fn)=>setData(d=>({...d,[key]:typeof fn==='function'?fn(d[key]):fn}));
 const api=useMemo(()=>({data,setData,update,currentUser,currentUserId,setCurrentUserId}),[data,currentUser,currentUserId]);
 return <AppContext.Provider value={api}>{children}</AppContext.Provider>
}
export const useApp=()=>useContext(AppContext);
