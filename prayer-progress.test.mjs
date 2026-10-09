import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPrayerProgress, togglePrayerProgress, progressStorageKey, prayerVoterKey, setPrayerProgress } from './public/prayer-progress.js';
import { prayerCountText } from './public/prayer-participation.js';
function storage() { const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)}; }
test('La identidad de oración persiste y el estado confirmado es idempotente',()=>{
  const ana=storage(),luis=storage(),key=prayerVoterKey(ana);
  assert.match(key,/^[a-f0-9]{48}$/);assert.equal(prayerVoterKey(ana),key);assert.notEqual(prayerVoterKey(luis),key);
  setPrayerProgress(ana,1,true);setPrayerProgress(ana,1,true);assert.deepEqual([...readPrayerProgress(ana)],[1]);
  setPrayerProgress(ana,1,false);assert.equal(readPrayerProgress(ana).size,0);
  assert.equal(prayerCountText(0),'0 personas orando');assert.equal(prayerCountText(1),'1 persona orando');assert.equal(prayerCountText(2),'2 personas orando');
});
test('Cada visitante conserva su cuenta personal al volver y puede desmarcar sin afectar a otro',()=>{
  const ana=storage(),luis=storage();
  togglePrayerProgress(ana,3);togglePrayerProgress(ana,8);togglePrayerProgress(luis,8);
  assert.deepEqual([...readPrayerProgress(ana)],[3,8]);
  togglePrayerProgress(ana,8);
  assert.deepEqual([...readPrayerProgress(ana)],[3]);
  assert.deepEqual([...readPrayerProgress(luis)],[8]);
  assert.throws(()=>togglePrayerProgress({getItem:()=>null,setItem:()=>{throw Error('storage disabled')}},3));
});
test('Datos viejos o dañados no impiden abrir el registro personal',()=>{
  const visitor=storage();visitor.setItem(progressStorageKey,'{"bad":true}');
  assert.equal(readPrayerProgress(visitor).size,0);
  visitor.setItem(progressStorageKey,'[1,"2",null,-1,3]');
  assert.deepEqual([...readPrayerProgress(visitor)],[1,3]);
});
