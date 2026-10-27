// Run with PLAYWRIGHT_MODULE pointing to an installed playwright package.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server=await createServer({
 configFile:false,
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://workout-test.supabase.co'),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('test-publishable-key')},
 plugins:[{name:'test-page',configureServer(server){server.middlewares.use('/__workout-test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/tests/fixtures/workout-completion.jsx"></script>');});}}],
 server:{host:'127.0.0.1',port:4177,strictPort:true}
});
await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
 for (const mode of ['guided','simplified']) {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const date=new Date().toLocaleDateString('en-CA');
  const activity={key:'item',workoutItemId:'44444444-4444-4444-8444-444444444444',name:'Exercício teste',group:'Costas',blockId:'block',type:'exercise',status:'completed',sets:[{index:1,reps:8,weightKg:10,completed:true}]};
  const run={id:'55555555-5555-4555-8555-555555555555',student_id:'11111111-1111-4111-8111-111111111111',plan_id:'22222222-2222-4222-8222-222222222222',session_id:'33333333-3333-4333-8333-333333333333',status:'active',mode,workout_date:date,plan_title:'Plano teste',session_title:'Treino teste',started_at:new Date(Date.now()-60000).toISOString(),state:{activities:[activity],blocks:[{id:'block',type:'standard'}],currentIndex:0},summary:{}};
  let attempts=0,completed=false,fail=true,refreshFails=false,saveFails=false;
  let completion=null;
  await page.route('https://workout-test.supabase.co/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.endsWith('/rpc/complete_workout_run')){
    attempts++;
    if(fail) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Ligação interrompida'})});
    const payload=request.postDataJSON();
    assert.equal(payload.target_run_id,run.id);
    assert.equal(payload.target_state.activities[0].sets[0].weightKg,10);
    completed=true; run.status='completed';run.summary=payload.target_summary;
    completion={id:'66666666-6666-4666-8666-666666666666',student_id:run.student_id,plan_id:run.plan_id,session_id:run.session_id,completed_on:date,source:'student'};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(completion.id)});
   }
   if(url.pathname.endsWith('/rpc/save_workout_run_state')) return route.fulfill({status:saveFails?503:200,contentType:'application/json',body:saveFails?JSON.stringify({message:'offline'}):'true'});
   if(url.pathname.endsWith('/workout_runs')){
    const body=url.searchParams.has('status')?(completed?'null':JSON.stringify(run)):JSON.stringify(completed?[run]:[]);
    return route.fulfill({contentType:'application/json',body});
   }
   if(url.pathname.endsWith('/workout_completions')) return route.fulfill({status:refreshFails?503:200,contentType:'application/json',body:refreshFails?JSON.stringify({message:'refresh failed'}):JSON.stringify(completion?[completion]:[])});
   return route.fulfill({contentType:'application/json',body:'[]'});
  });
  await page.goto('http://127.0.0.1:4177/__workout-test');
  await page.getByRole('button',{name:'Aceder ao treino em curso',exact:true}).click();
  assert.equal(await page.getByText('Treino completo!',{exact:true}).count(),0);
  saveFails=true;
  await page.getByRole('button',{name:'Concluir treino',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Não foi possível confirmar'}).waitFor();
  assert.equal(attempts,1);
  assert.equal(completed,false);
  assert.equal(await page.locator('.ufTrainingSuccessNote').count(),0);
  fail=false; refreshFails=mode==='simplified';
  await page.getByRole('button',{name:'Tentar guardar novamente',exact:true}).click();
  await page.locator('.ufTrainingSuccessNote').waitFor();
  assert.equal(attempts,2);
  if(refreshFails) await page.getByText('O treino foi guardado, mas não foi possível atualizar o calendário.',{exact:false}).waitFor();
  else {
   await page.locator('.ufTrainingDay.completed').waitFor();
   await page.locator('[data-testid="teacher-calendar"] .calendarDay.completed').waitFor();
   assert.equal(await page.locator('.ufTrainingHistoryCard').count(),1);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS',mode,'failure keeps progress, retry confirms save,',refreshFails?'refresh failure distinguished':'student and teacher calendars updated');
  await context.close();
 }
} finally {await browser.close();await server.close();}
