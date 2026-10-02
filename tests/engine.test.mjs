import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONTENT as C} from '../content.js';
import {DAY,freshState,checkAnswer,planReview,buildQueue,applyGrade,validateState} from '../engine.js';
const now=Date.UTC(2026,9,3,8),ids=C.cards.map(c=>c.id);
test('Exactly 100 distinct expressions, 50+50, 20 lessons and 200 contextual tasks',()=>{
 assert.equal(C.lessons.length,20);assert.equal(C.patterns.length,100);assert.equal(new Set(C.patterns.map(p=>p.id)).size,100);assert.equal(C.patterns.filter(p=>p.type==='phrasal').length,50);assert.equal(C.patterns.filter(p=>p.type==='collocation').length,50);assert.equal(new Set(ids).size,200);
 assert.deepEqual(C.patterns.map(p=>p.number),Array.from({length:100},(_,i)=>i+1));
 for(const l of C.lessons){const cards=C.cards.filter(c=>c.lesson===l.id);assert.equal(cards.length,10);assert.equal(new Set(cards.map(c=>c.kind)).size,4);assert.equal(C.patterns.filter(p=>p.lesson===l.id).length,5);assert(l.rule.length>=3);assert(l.trapRu);}
 for(const p of C.patterns){assert.equal(p.cardIds.length,2);assert(p.hook);for(const id of p.cardIds)assert.equal(C.cards.find(c=>c.id===id).pattern,p.id);}
});
test('Canonical and authored alternative answers are accepted, distractors and empty answers rejected',()=>{
 for(const c of C.cards){assert.equal((c.prompt.match(/___/g)||[]).length,1);assert.equal(new Set(c.options).size,3);assert(c.ru&&c.why);assert(checkAnswer(c,c.answer,'gap'));assert(checkAnswer(c,c.full,'fix'));assert(!checkAnswer(c,c.incorrect,'fix'));assert(!checkAnswer(c,'','gap'));for(const a of c.alternatives)assert(checkAnswer(c,a,'gap'));for(const a of c.fullAlternatives)assert(checkAnswer(c,a,'fix'));for(const wrong of c.options.filter(a=>a!==c.answer&&!c.alternatives.includes(a)))assert(!checkAnswer(c,wrong,'choice'));}
});
test('Meaning mode checks the phrase meaning, separately from the grammar explanation',()=>{
 for(const c of C.cards){assert.equal(new Set(c.meaningOptions).size,3);assert(c.meaningOptions.includes(c.meaning));assert(checkAnswer(c,c.meaning,'why'));for(const x of c.meaningOptions.filter(x=>x!==c.meaning))assert(!checkAnswer(c,x,'why'));assert(!checkAnswer(c,c.why,'why'));}
});
test('Normal variants and separable pronouns are handled intentionally',()=>{
 const shower=C.cards.find(c=>c.pattern==='take-a-shower');assert(checkAnswer(shower,'have a shower','gap'));
 const notes=C.cards.find(c=>c.pattern==='take-notes');assert(checkAnswer(notes,'make notes','gap'));
 const decision=C.cards.find(c=>c.pattern==='make-a-decision');assert(checkAnswer(decision,'take a decision','gap'));
 const research=C.cards.find(c=>c.pattern==='do-research');assert(checkAnswer(research,'conduct research','gap'));assert(!checkAnswer(research,'do a research','gap'));
 const off=C.cards.find(c=>c.answer==='turn it off');assert(checkAnswer(off,'turn it off','gap'));assert(!checkAnswer(off,'turn off it','gap'));
 const alternative=C.cards.find(c=>c.fullAlternatives.some(a=>a.includes('turned the job offer down')));assert(checkAnswer(alternative,alternative.fullAlternatives[0],'fix'));
 const c=C.cards.find(c=>c.kind==='fix');assert(checkAnswer(c,c.full.toUpperCase().replace('.','!'),'fix'));
});
test('Default font 18; settings 20/22 persist; other learning apps cannot overwrite Phrase',()=>{
 const s=freshState(now);assert.equal(s.app,'phrase');assert.equal(s.settings.font,18);for(const size of [18,20,22]){s.settings.font=size;assert.equal(validateState(s,ids).settings.font,size);}for(const app of ['tense','article','verb'])assert.throws(()=>validateState({...s,app},ids));
});
test('Every audio control resolves to a Ryan recording with a real MP3 file',()=>{
 const m=JSON.parse(fs.readFileSync(new URL('../audio-manifest.json',import.meta.url)));assert.equal(m.voice,'en-GB-RyanNeural');const expected=[...C.cards.map(c=>c.full),...C.lessons.map(l=>l.good),...C.patterns.map(p=>p.model),...C.signals.map(x=>x.en),...C.contrasts.flatMap(c=>[c.a,c.b])];for(const t of expected){assert(m.files[t],t);assert(m.files[t].seconds>.2);assert(fs.statSync(new URL('../'+m.files[t].src,import.meta.url)).size>1000);}
});
test('Scheduling: increasing intervals when due, ten-minute failure and next-day recovery',()=>{
 let r=planReview({},'good',now);assert.equal(r.due,now+DAY);assert.equal(planReview(r,'easy',now+1000).due,r.due);r=planReview(r,'good',now+DAY);assert.equal(r.interval,3);r=planReview(r,'again',now+DAY);assert.equal(r.due,now+DAY+600000);r=planReview(r,'easy',now+DAY+1000,true);assert.equal(r.interval,1);
});
test('Due priority and gradual curriculum; all practice modes have valid starter cards',()=>{
 const s=freshState(now);assert(buildQueue(C.cards,s,{now}).every(id=>id.startsWith('morning-verbs-')));s.cards[ids[57]]=planReview({},'again',now-700000);assert.equal(buildQueue(C.cards,s,{now})[0],ids[57]);assert.deepEqual(buildQueue(C.cards,s,{now,mode:'due'}),[ids[57]]);for(const mode of ['why','listen','recall','mixed'])assert.equal(buildQueue(C.cards,s,{now,mode}).length,10);const q=buildQueue(C.cards,s,{now,lesson:'research-chunks',mode:'why'});assert.equal(q.length,10);assert(q.every(id=>id.startsWith('research-chunks-')));
});
test('Errors clear after successful recall on two distinct later days',()=>{
 const s=freshState(now),c=C.cards[0];applyGrade(s,c,'again',{now,wrong:true});applyGrade(s,c,'good',{now:now+1000,recovery:true});assert.equal(s.mistakes[c.id].successDays.length,0);applyGrade(s,c,'good',{now:now+DAY});applyGrade(s,c,'good',{now:now+DAY+1000});assert(!s.mistakes[c.id].resolved);applyGrade(s,c,'good',{now:now+2*DAY});assert(s.mistakes[c.id].resolved);
});
test('Backup round trip preserves progress and session; rejects foreign IDs and unsafe settings',()=>{
 const s=freshState(now);applyGrade(s,C.cards[0],'good',{now});s.session={mode:'why',lesson:null,queue:ids.slice(0,10),index:1,initial:10,results:[],retries:{},failed:[],started:now};const restored=validateState(JSON.parse(JSON.stringify(s)),ids);assert.deepEqual(restored.cards,s.cards);assert.equal(restored.session.mode,'why');const safe=validateState({...s,cards:{...s.cards,unknown:{due:123,stage:0,interval:1}},settings:{rate:99,font:999}},ids);assert.equal(safe.settings.font,18);assert.equal(safe.cards.unknown,undefined);
});
