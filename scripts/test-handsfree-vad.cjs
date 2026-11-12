/* Pruebas locales del detector de voz: sin micrófono, APIs ni saldo Twilio. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const input = fs.readFileSync(path.join(__dirname, "..", "src/lib/browser-voice-activity.ts"),"utf8");
const js = ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function("module","exports",js)(mod,mod.exports);
const {BrowserVoiceActivity}=mod.exports;
let count=0;
function sequence(parts) {
  const vad=new BrowserVoiceActivity(0);
  let elapsed=0, events=[];
  for(const [ms,rms] of parts){
    for(let n=0;n<ms;n+=20){
      elapsed += 20;
      const state=vad.update(rms,elapsed);
      if(state==="end"||state==="restart"){events.push({at:elapsed,state});return {events,heard:vad.heardSpeech};}
    }
  }
  return {events,heard:vad.heardSpeech};
}
let r=sequence([[500,0.002],[400,0.04],[1200,0.002]]);
assert.equal(r.heard,true);assert.equal(r.events[0]?.state,"end");count++;
r=sequence([[500,0.002],[80,0.05],[23000,0.002]]);
assert.equal(r.heard,false);assert.equal(r.events[0]?.state,"restart");count++;
r=sequence([[500,0.002],[240,0.04],[700,0.002],[250,0.04],[1200,0.002]]);
assert.equal(r.heard,true);assert.equal(r.events[0]?.state,"end");
assert.ok(r.events[0].at>1700);count++;
r=sequence([[24000,0.002]]);
assert.equal(r.heard,false);assert.equal(r.events[0]?.state,"restart");count++;
r=sequence([[500,0.002],[18500,0.055]]);
assert.equal(r.heard,true);assert.equal(r.events[0]?.state,"end");count++;
r=sequence([[500,0.002],[320,0.045],[300,0.002]]);
assert.equal(r.heard,true);assert.equal(r.events.length,0);count++;
console.log(`OK: ${count} pruebas de VAD: habla, pausa, ruido breve, silencio, fragmento máximo. Ningún gasto API.`);
