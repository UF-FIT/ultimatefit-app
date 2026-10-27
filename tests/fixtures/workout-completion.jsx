import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentTrainingExperience from '../../src/components/StudentTrainingExperience';
import TrainingActivityCalendar from '../../src/components/TrainingActivityCalendar';
import { fetchWorkoutCompletions } from '../../src/lib/training';
const studentId = '11111111-1111-4111-8111-111111111111';
const plan = { id:'22222222-2222-4222-8222-222222222222', studentId, status:'published', active:true, title:'Plano teste', sessions:[{id:'33333333-3333-4333-8333-333333333333',title:'Treino teste',blocks:[]}] };
function Fixture() {
 const [completions,setCompletions]=useState([]);
 async function refresh() {
  try { const rows=await fetchWorkoutCompletions(); setCompletions(rows); return {workoutCompletions:rows}; }
  catch(error) { return {error}; }
 }
 return <><StudentTrainingExperience student={{id:studentId}} plans={[plan]} completions={completions} onRefreshTraining={refresh}/><div data-testid="teacher-calendar"><TrainingActivityCalendar completions={completions}/></div></>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
