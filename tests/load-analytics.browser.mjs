import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
await mkdir('.qa',{recursive:true});
const server=await createServer({configFile:false,plugins:[{name:'analytics-fixture',enforce:'pre',load(id){
 if(id.endsWith('/lib/supabase.js'))return `const query=new Proxy({}, {get:(t,k)=>k==='then'?async resolve=>{window.calls=(window.calls||0)+1;await new Promise(r=>setTimeout(r,window.delay||0));resolve({data:window.rows||[],error:window.fail?{message:'test failure'}:null})}:()=>query});export const supabase={from:()=>query};export const supabaseConfigured=true;`;
},configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url.startsWith('/planos?')){res.setHeader('Content-Type','text/html');res.end('<link rel="stylesheet" href="/training-plan-viewer-mobile-redesign.css"><meta name="viewport" content="width=device-width, initial-scale=1"><div class="appShell"><main class="content"><div class="trainingViewer" data-student-id="s1"><div class="trainingPlanHero">Plano de teste</div></div></main></div><script type="module">import "/src/styles/app.css";import "/src/styles/training-plan-detail-symbol-cleanup.css";import "/src/lib/trainingPlanInstantShell.js";import {startTrainingLoadAnalytics} from "/src/lib/trainingLoadAnalytics.js";import {startTrainingPresentationEnhancer} from "/src/lib/trainingPresentationEnhancer.js";startTrainingLoadAnalytics();startTrainingPresentationEnhancer();</script>');}else next()});}}],server:{host:'127.0.0.1',port:4193,strictPort:true}});
await server.listen();const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try{for(const width of [375,1280]){
 const page=await browser.newPage({viewport:{width,height:850}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.log(m.text())});
 await page.addInitScript(()=>{window.delay=700;window.noise=setInterval(()=>{const n=document.createElement('span');document.body?.appendChild(n);n.remove()},20)});
 await page.goto('http://127.0.0.1:4193/planos?plano=p1');
 const header=page.locator('#uf-load-analytics > .ufah');
 await header.click();assert.equal(await header.getAttribute('aria-expanded'),'true');
 await page.locator('#uf-load-analytics .ufan').filter({hasText:'Ainda não existem registos'}).waitFor({state:'visible'});
 assert.equal(await header.locator('.ufAccordionChevron').isVisible(),true);
 await header.press('Enter');assert.equal(await header.getAttribute('aria-expanded'),'false');
 await header.press('Space');assert.equal(await header.getAttribute('aria-expanded'),'true');
 await page.evaluate(()=>{clearInterval(window.noise);window.delay=0;window.fail=true;dispatchEvent(new Event('uf:exercise-load-saved'))});
 await page.getByRole('button',{name:'Tentar novamente'}).waitFor({state:'visible'});
 await page.evaluate(()=>{window.fail=false;const d=new Date();const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';window.rows=[{exercise_name:'Agachamento',muscle_group:'Quadríceps',weight_kg:20,volume_kg:600,completed_on:date}]});
 await page.getByRole('button',{name:'Tentar novamente'}).click();
 await page.locator('#uf-load-analytics .ufatable').waitFor({state:'visible'});
 assert.match(await page.locator('#uf-load-analytics .ufatable').innerText(),/600 kg/);
 await page.getByRole('button',{name:'Por exercício',exact:true}).click();
 await page.locator('.ufatable').getByText('Agachamento',{exact:true}).waitFor();
 await page.locator('[data-prev]').click();
 await page.locator('#uf-load-analytics .ufan').filter({hasText:'Ainda não existem registos'}).waitFor({state:'visible'});
 await page.locator('[data-next]').click();await page.locator('.ufatable').waitFor({state:'visible'});
 assert.equal(await header.getAttribute('aria-expanded'),'true');assert.deepEqual(errors,[]);
 console.log('PASS '+width+'px: initial click under DOM churn, empty, keyboard, error/retry, data, filters/month, preserved open state');
 await page.screenshot({path:'.qa/load-analytics-'+width+'.png',fullPage:true});await page.close();
}}finally{await browser.close();await server.close()}


