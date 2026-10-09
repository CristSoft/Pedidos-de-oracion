import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPrayerProgress, togglePrayerProgress, progressStorageKey } from './public/prayer-progress.js';
function storage() { const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)}; }
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
