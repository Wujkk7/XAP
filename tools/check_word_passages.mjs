import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const build = path.resolve('cocos/build/isometric');
const profile = path.resolve('.local-checks/edge-word-test');
fs.mkdirSync(profile, { recursive: true });
fs.rmSync(path.join(profile, 'DevToolsActivePort'), { force: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const name = path.resolve(build, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!name.startsWith(build + path.sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[path.extname(name)] ?? 'application/octet-stream'); res.end(fs.readFileSync(name)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-port=0', '--remote-allow-origins=*', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--user-data-dir=' + profile, 'about:blank',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map(); let id = 0; const exceptions = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) { const result = pending.get(data.id); pending.delete(data.id); data.error ? result.reject(data.error) : result.resolve(data.result); }
    if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails);
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') exceptions.push({consoleError:data.params.args.map(a=>a.description??a.value)});
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  const evaluate = async expression => {
    const data = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (data.exceptionDetails) throw new Error(JSON.stringify(data.exceptionDetails));
    return data.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
  const ready=async()=>{
    for(let i=0;i<100;i++){
      await delay(150);
      const state=await evaluate(`(async()=>{if(typeof System==='undefined')return null;
        const cc=await System.import('cc'),root=cc.director.getScene()?.getChildByName('IsometricDemo')?.getComponent('IsometricDemo');
        if(root?.readout?.string.includes('失败'))return {error:root.readout.string};
        if(!root?.ready)return null;window.qa={cc,root};return {ready:true};})()`);
      if(state){assert.ok(!state.error,state.error);return;}
    }
    throw Error('Isometric scene never became ready: '+JSON.stringify(exceptions));
  };
  const shot=async name=>{await delay(180);const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('.local-checks/'+name+'.png',Buffer.from(s.data,'base64'));};
  const tap=async(x,y)=>{
    const p=await evaluate(`(()=>{const r=document.getElementById('GameCanvas').getBoundingClientRect(),s=Math.min(r.width/1280,r.height/720);return{x:r.left+r.width/2+(${x})*s,y:r.top+r.height/2-(${y})*s}})()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(120);
  };
  const key=async(code,key,number,ms=300)=>{
    await evaluate('document.getElementById("GameCanvas").focus()');
    await send('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode:number});await delay(ms);
    await send('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode:number});await delay(150);
  };
  const until=async(expression,label)=>{
    for(let i=0;i<180;i++){if(exceptions.length)throw Error(JSON.stringify(exceptions.slice(0,2)));if(await evaluate(expression))return;await delay(50);}
    throw Error('Timed out: '+label);
  };
  const press=async()=>{
    const p=await evaluate(`(()=>{const r=document.getElementById('GameCanvas').getBoundingClientRect(),s=Math.min(r.width/1280,r.height/720);return{x:r.left+r.width/2+505*s,y:r.top+r.height/2+239*s}})()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0}]});
  };
  const release=async()=>{await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(100);};
  const select=async(x,y,lift=0)=>{
    const p=await evaluate(`(()=>{const r=qa.root,w=r.world,s=w.scale.x;return{x:w.position.x+(${x}-${y})*48*s,y:w.position.y+(-(${x}+${y})*24-r.lab.depth*420+${lift})*s}})()`);
    await tap(p.x,p.y);
  };

  await ready();
  assert.ok(await evaluate('!!qa.root.words&&!!qa.root.wordUI'));
  await evaluate('localStorage.setItem("xap-save-v1","formal-web");localStorage.setItem("xap-cocos-slot-v1","formal-cocos")');
  const letter=async c=>{
    const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'],r=rows.findIndex(row=>row.includes(c)),i=rows[r].indexOf(c);
    await tap((i-(rows[r].length-1)/2)*91,-145+17-r*48);
  };
  const go=async(x,y,tx,ty)=>{await evaluate(`qa.root.resetInput();qa.root.walk.x=${x};qa.root.walk.y=${y};qa.root.lab.select(${tx},${ty})`);await delay(200);await tap(505,-105);};
  await shot('word-exploration');
  await go(6.5,6.5,6,5);assert.equal(await evaluate('qa.root.wordUI.mode'),'seal');
  const answer=await evaluate('qa.root.words.room.answer');
  await letter(answer[0]);assert.equal(await evaluate('qa.root.wordUI.draft'),'');
  await tap(-30,-284);assert.equal(await evaluate('qa.root.wordUI.mode'),'plan');
  for(const c of answer)await letter(c);
  await tap(40,-284);assert.equal(await evaluate('qa.root.words.tracked'),answer);
  assert.equal(await evaluate('Object.values(qa.root.words.letters).reduce((a,b)=>a+b,0)'),0);
  await shot('word-plan');await tap(525,23);

  await go(6.5,7.5,6,8);assert.equal(await evaluate('qa.root.wordUI.mode'),'chest');
  const correct=await evaluate('qa.root.words.quiz(0).question.correctIndex');
  for(const index of [(correct+1)%4,(correct+1)%4,correct])await tap(index%2?265:-265,-145-37-Math.floor(index/2)*61);
  assert.equal(await evaluate('qa.root.wordUI.mode'),'loot');
  assert.equal(await evaluate('Object.values(qa.root.words.letters).reduce((a,b)=>a+b,0)'),12);
  assert.equal(await evaluate('qa.root.words.coins'),8);
  await shot('word-chest');await tap(0,-284);

  await go(5.5,7.5,5,6);assert.equal(await evaluate('qa.root.wordUI.mode'),'clue');
  assert.equal(await evaluate('qa.root.words.room.learned'),true);
  const clueText=await evaluate(`(()=>{const walk=n=>[...(n.getComponents(qa.cc.Label)||[]).map(l=>l.string),...n.children.flatMap(walk)];return walk(qa.root.wordUI.panel).join(' ');})()`);
  assert.ok(!new RegExp('\\b'+answer+'\\b','i').test(clueText),'inscription must not show the answer');
  assert.equal(await evaluate('qa.root.words.visibleWords().includes(qa.root.words.room.answer)'),false);
  await shot('word-clue');await tap(525,23);
  await evaluate('qa.root.lab.resources=100');
  await go(6.5,6.5,7,6);assert.equal(await evaluate('qa.root.wordUI.mode'),'npc');
  const needs=await evaluate('qa.root.words.needs(qa.root.words.room.answer)');
  for(const [c,n]of Object.entries(needs)){await letter(c);for(let i=0;i<n;i++)await tap(-365,-284);}
  assert.deepEqual(await evaluate('qa.root.words.needs(qa.root.words.room.answer)'),{});
  await shot('word-exchange');await tap(525,23);

  await go(6.5,6.5,6,5);assert.equal(await evaluate('qa.root.wordUI.mode'),'seal');
  // Wrong whole-word input keeps the draft and never consumes the stock.
  const stock=await evaluate('JSON.stringify(qa.root.words.letters)');
  await letter(answer[0]);await tap(285,-284);
  assert.equal(await evaluate('qa.root.wordUI.draft'),answer[0]);
  assert.equal(await evaluate('JSON.stringify(qa.root.words.letters)'),stock);
  await tap(-270,-284);
  for(const c of answer)await letter(c);
  await shot('word-keyboard');
  const point=await evaluate('JSON.stringify({x:qa.root.walk.x,y:qa.root.walk.y})');
  await key('ArrowRight','ArrowRight',39,200);assert.equal(await evaluate('JSON.stringify({x:qa.root.walk.x,y:qa.root.walk.y})'),point);
  await tap(285,-284);await until('qa.root.words.room.opened','successful word passage');
  assert.equal(await evaluate('qa.root.lab.tile(6,5).hole'),true);await shot('word-open-passage');
  await evaluate('qa.root.lab.target=null;qa.root.walk.x=6.5;qa.root.walk.y=5.5;qa.root.lab.tick(.05,0,0,true)');
  await until('qa.root.lab.depth===1','word passage descent');assert.ok(await evaluate('qa.root.lab.layer().entrances.some(p=>p.x===6&&p.y===5)'));
  await tap(295,-177);await until('qa.root.lab.depth===0','word passage ascent');
  assert.equal(await evaluate('qa.root.words.correct[qa.root.words.room.answer]'),1);
  await evaluate('qa.root.saveLab()');
  const saved=await evaluate('qa.root.words.snapshot()');await send('Page.reload');await ready();
  assert.equal(await evaluate('qa.root.words.snapshot()'),saved);
  assert.equal(await evaluate('qa.root.words.room.opened'),true);

  // Without answering or spending letters, an ordinary floor still reaches the next layer.
  await tap(295,-281);await press();await until('qa.root.lab.depth===1','ordinary non-English descent');await release();
  assert.ok(await evaluate('!qa.root.lab.collides(qa.root.walk.x,qa.root.walk.y)'));
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(250);
  await tap(-125,286);await shot('word-phone-bag');await tap(-390,-284);await shot('word-phone-plan');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(200);
  const paused=await evaluate('JSON.stringify({x:qa.root.walk.x,y:qa.root.walk.y,z:qa.root.lab.depth})');await key('Space',' ',32,300);
  assert.equal(await evaluate('JSON.stringify({x:qa.root.walk.x,y:qa.root.walk.y,z:qa.root.lab.depth})'),paused);
  assert.equal(await evaluate('localStorage.getItem("xap-save-v1")'),'formal-web');
  assert.equal(await evaluate('localStorage.getItem("xap-cocos-slot-v1")'),'formal-cocos');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem("xap-isometric-lab-v1","broken-save")'});
  await send('Page.reload');await ready();await delay(1300);
  assert.equal(await evaluate('localStorage.getItem("xap-isometric-lab-v1")'),'broken-save');
  assert.equal(await evaluate('qa.root.preserveBadSave'),true);
  assert.ok(await evaluate('qa.root.saveError.includes("原档已保留")'));
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  console.log('PASS: real touch depleted keys, planning, tracking, quiz penalties with full letter rewards, clue discovery, targeted exchange, failed-word retention, immediate letter swings, atomic successful passage, down/up, full save reload, ordinary descent, mobile panels and formal-save isolation.');
}finally{socket?.close();browser.kill();server.close();}
