/* Pure application-logic regression checks; no browser, packages, or network needed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8').split('/* ---------- boot ---------- */')[0];
const fixedNow = Date.parse('2026-09-25T20:15:00Z'); // Friday, 4:15 PM Eastern.
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])); } static now() { return fixedNow; } }
const storage = new Map();
const elements = new Map();
function element(key) { if (!elements.has(key)) elements.set(key, {textContent:'',innerHTML:'',value:'',classList:{add(){},remove(){}},close(){},setSelectionRange(){},focus(){}}); return elements.get(key); }
const ctx = vm.createContext({ Date:Clock, Intl, TextEncoder, URL, Blob, console, Promise,
  setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout(){}, setInterval(){},
  window:{matchMedia:()=>({matches:true}),addEventListener(){},scrollTo(){}}, history:{replaceState(){}},
  document:{querySelector:element,addEventListener(){}},
  localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},
  FileReader:class { readAsText(file) { this.result=file.text; this.onload(); } }
});
vm.runInContext(source,ctx);
const run = code => vm.runInContext(code,ctx);
const reset = () => run('applyWorkspace(decodeWorkspace(seed())); render = () => save();');
let passed = 0;
async function check(name, fn) { reset(); await fn(); console.log('✓ '+name); passed++; }
(async()=>{
await check('workspace round-trip and collision-free generated IDs',()=>{
  assert.equal(run('decodeWorkspace(seed()).clients.length'),10);
  assert.equal(run('decodeWorkspace({...seed(),nextClient:1,nextEvent:1}).nextClient'),11);
  assert.equal(run('decodeWorkspace({...seed(),nextClient:1,nextEvent:1}).nextEvent'),4);
});
await check('malformed import is atomic and unsafe attributes are rejected',()=>{
  const before=run('JSON.stringify(clients)');
  run(`importWorkspace({size:20,text:'{"clients":[{"id":1}]}'})`);
  assert.equal(run('JSON.stringify(clients)'),before);
  for (const edit of ["s.clients[0].color='purple\" onclick=\"evil'", "s.clients[0].id='1\"'", "s.clients[1].id=1", "s.events[0].client=999", "s.settings.minimum='oops'", "s.roi.price='\" autofocus'", "s.events.push({...s.events[0],id:4})"]) {
    assert.throws(()=>run(`{ const s=seed(); ${edit}; decodeWorkspace(s); }`));
  }
});
await check('refresh recovers unfinished drafts and rejects corrupt saved data',()=>{
  run("clients[0].streaming=true;clients[0].draft='partial';save();");
  assert.equal(run("JSON.parse(localStorage.getItem(STORE)).clients[0].streaming"),false);
  assert.equal(run('load()'),true);
  assert.equal(run('clients[0].streaming'),false);
  assert.equal(run('clients[0].draft'),'');
  const before=run('JSON.stringify(clients)');
  run("localStorage.setItem(STORE,JSON.stringify({day:TODAY,clients:[{}]}))");
  assert.equal(run('load()'),false);
  assert.equal(run('JSON.stringify(clients)'),before);
});
await check('concurrent inquiry animations both finish',async()=>{
  await run('Promise.all([streamDraft(1),streamDraft(3)])');
  assert.equal(run('clients.some(c=>c.streaming)'),false);
  assert.ok(run('find(1).draft.includes("Maya")'));
  assert.ok(run('find(3).draft.includes("Sofia")'));
});
await check('opportunity estimates do not become invented client budgets',()=>{
  assert.equal(run('analyze(find(3)).budget'),null);
  assert.ok(!run('draftFor(find(3)).includes("$6,000")'));
  assert.equal(run('analyze(find(1)).budget'),8000);
  run("settings.questions='What is your budget? What is your timeline?'");
  assert.equal(run('remainingQuestions(analyze(find(1)))'),'');
});
await check('booking dates, working hours, conflicts, and client uniqueness',()=>{
  const future=run('nextBiz(TODAY)');
  run(`book({client:1,date:'${future}',time:'09:00',title:'Discovery'})`);
  assert.equal(run('find(1).stage'),'Meeting booked');
  assert.throws(()=>run(`book({client:3,date:'${future}',time:'09:00',title:'Conflict'})`));
  assert.throws(()=>run(`book({client:1,date:'${future}',time:'09:30',title:'Duplicate'})`));
  for(const [date,time] of [['2026-09-26','09:00'],['2027-02-30','09:00'],['2026-09-25','09:00'],[future,'17:00']]) {
    assert.throws(()=>run(`book({client:3,date:'${date}',time:'${time}',title:'Invalid'})`));
  }
});
await check('suggested slots exclude elapsed Eastern times',()=>{
  assert.equal(run('TODAY'),'2026-09-25');
  assert.equal(run('slotsFor(TODAY).join(",")'),'16:30');
  assert.equal(run('nextSlots()[0].time'),'16:30');
  assert.equal(run('nextSlots()[1].date'),'2026-09-28');
});
await check('calendar exports preserve Eastern time across daylight saving changes',()=>{
  assert.equal(run("easternInstant('2026-07-06','09:00').toISOString()"),'2026-07-06T13:00:00.000Z');
  assert.equal(run("easternInstant('2026-12-07','09:00').toISOString()"),'2026-12-07T14:00:00.000Z');
  const ics=run(`calendarFile({id:7,date:'2026-12-07',time:'09:00',duration:30,title:'Scope, pricing; next\\nstep'}, {company:'Test'})`);
  assert.ok(ics.includes('DTSTART:20261207T140000Z'));
  assert.ok(ics.includes('DTEND:20261207T143000Z'));
  assert.ok(ics.includes('Scope\\, pricing\\; next\\nstep'));
  assert.ok(ics.endsWith('\r\n'));
  const long=run(`calendarFile({id:7,date:'2026-12-07',time:'09:00',duration:30,title:'é'.repeat(80)}, {company:'Test'})`);
  assert.ok(long.split('\r\n').every(l=>Buffer.byteLength(l,'utf8')<=75));
});
await check('business-case results stay within the incoming opportunity count',()=>{
  for(const close of [0,25,100]) {
    run(`roi={inquiries:18,fee:7500,close:${close},respondHours:42,price:49}`);
    const n=run('impactNumbers()');
    assert.ok(n.relayWins<=n.inq);
    assert.ok(n.relayWins>=n.nowWins);
    assert.ok(Math.abs(n.relayWins-n.inq*close/100)<1e-9);
  }
  run('roi.respondHours=0;paintImpact()');
  assert.equal(run('impactNumbers().monthly'),0);
  assert.ok(element('#roi-assumptions').textContent.includes('0%'));
});
console.log(`\n${passed} regression groups passed.`);
})().catch(err=>{console.error(err);process.exitCode=1});
