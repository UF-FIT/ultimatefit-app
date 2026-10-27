import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const runner=readFileSync(new URL('../src/components/StudentTrainingExperience.jsx',import.meta.url),'utf8');
function flow(completeWorkoutRun){
 const ctx={finalising:{current:false},saveTimer:{current:1},run:{id:'test-run'},state:{activities:[]},window:{clearTimeout(){}},setSummaryOpen(v){ctx.summary=v},setCompletionError(v){ctx.error=v},setBusy(v){ctx.busy=v},completeWorkoutRun,onRunCompleted:async summary=>{ctx.saved=summary}};
 vm.createContext(ctx);
 vm.runInContext(runner.slice(runner.indexOf('  async function finalise('),runner.indexOf('  const menu =')),ctx);
 return ctx;
}
test('completion waits for server confirmation and ignores double taps',async()=>{
 let resolve,calls=0;
 const ctx=flow(()=>{calls++;return new Promise(r=>{resolve=r})});
 const request=ctx.finalise({completedActivities:1});
 await ctx.finalise({});
 assert.equal(calls,1);assert.equal(ctx.saved,undefined);assert.equal(ctx.busy,true);assert.equal(ctx.summary,true);
 resolve('completion-id');await request;
 assert.equal(ctx.saved.completedActivities,1);
});
test('failed completion keeps the runner available and permits retry',async()=>{
 let calls=0;
 const ctx=flow(async()=>{if(++calls===1)throw new Error('offline');return 'completion-id'});
 await ctx.finalise({});
 assert.equal(ctx.saved,undefined);assert.equal(ctx.busy,false);assert.match(ctx.error,/tenta novamente/);
 await ctx.finalise({completedActivities:2});
 assert.equal(calls,2);assert.equal(ctx.saved.completedActivities,2);
});
const lib=readFileSync(new URL('../src/lib/studentWorkoutRuns.js',import.meta.url),'utf8');
async function rpcModule(response){
 return import('data:text/javascript,'+encodeURIComponent(lib.replace("import { supabase } from './supabase';",'const supabase = {rpc: async () => ('+JSON.stringify(response)+')};')));
}
test('empty RPC response cannot be presented as a saved workout',async()=>{
 const mod=await rpcModule({data:null,error:null});
 await assert.rejects(mod.completeWorkoutRun('run',{},{}),/não confirmou/);
});
test('RPC error propagates and a confirmed id is returned',async()=>{
 const failed=await rpcModule({data:null,error:{message:'permission denied'}});
 await assert.rejects(failed.completeWorkoutRun('run',{},{}),e=>e.message==='permission denied');
 const success=await rpcModule({data:'completion-id',error:null});
 assert.equal(await success.completeWorkoutRun('run',{},{}),'completion-id');
});
