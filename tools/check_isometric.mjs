import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const build = path.resolve('cocos/build/isometric');
const profile = path.resolve('.local-checks/edge-isometric-test');
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
  await ready(); await shot('isometric-overview');
  assert.ok(await evaluate('qa.root.actors.length')>22); // Expanded forest, existing services and restored village.
  assert.equal(await evaluate('qa.root.lab.layer().tiles.length'),25);
  const before=await evaluate('({x:qa.root.walk.x,y:qa.root.walk.y})');
  await key('KeyD','d',68,450);
  const after=await evaluate('({x:qa.root.walk.x,y:qa.root.walk.y})');
  assert.ok(after.x-before.x>0.2);assert.ok(before.y-after.y>0.2);
  assert.ok(Math.abs(after.x+after.y-before.x-before.y)<0.01,'screen-right movement must stay horizontal');
  await tap(295,286);assert.equal(await evaluate('qa.root.grid'),false);await shot('isometric-no-grid');
  await tap(295,286);assert.equal(await evaluate('qa.root.grid'),true);
  await tap(505,286);assert.equal(await evaluate('qa.root.follow'),false);await shot('isometric-overview-expanded');
  await tap(505,286);await tap(295,-281);
  assert.equal(await evaluate('qa.root.walk.x'),6.5);assert.equal(await evaluate('qa.root.walk.y'),7.5);
  const joystick=await evaluate(`(()=>{const r=document.getElementById('GameCanvas').getBoundingClientRect(),s=Math.min(r.width/1280,r.height/720);return{x:r.left+r.width/2-440*s,y:r.top+r.height/2+235*s}})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...joystick,id:0}]});await delay(450);
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.ok(await evaluate('qa.root.walk.x>6.7'));assert.equal(await evaluate('qa.root.joystick.id'),-1);

  // Stand behind a foreground tree: depth order and fade must agree on the same foot point.
  await evaluate('qa.root.resetInput();qa.root.walk.x=8.5;qa.root.walk.y=8.5');await delay(200);
  const ordering=await evaluate(`(()=>{const r=qa.root;return {depths:r.actors.map(a=>a.x+a.y),fade:r.actors.filter(a=>a!==r.player&&a.opacity.opacity<150).length}})()`);
  assert.deepEqual(ordering.depths,[...ordering.depths].sort((a,b)=>a-b));assert.ok(ordering.fade>0);await shot('isometric-occlusion');

  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(250);
  await tap(295,-281);assert.equal(await evaluate('qa.root.follow'),true);await shot('isometric-phone');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(250);
  const paused=await evaluate('JSON.stringify({x:qa.root.walk.x,y:qa.root.walk.y})');await key('KeyW','w',87);
  assert.equal(await evaluate('JSON.stringify({x:qa.root.walk.x,y:qa.root.walk.y})'),paused);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("rotate")).display'),'flex');
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(200);
  await evaluate('localStorage.setItem("xap-cocos-slot-v1","formal-save-sentinel");qa.root.joystick={x:1,y:0,id:7};qa.cc.game.emit(qa.cc.Game.EVENT_HIDE)');
  assert.equal(await evaluate('qa.root.joystick.id'),-1);
  await evaluate('qa.root.saveLab()');const persisted=await evaluate('({x:qa.root.walk.x,y:qa.root.walk.y})');
  await send('Page.reload');await ready();
  assert.equal(await evaluate('localStorage.getItem("xap-cocos-slot-v1")'),'formal-save-sentinel');
  assert.equal(await evaluate('qa.root.walk.x'),persisted.x);assert.equal(await evaluate('qa.root.walk.y'),persisted.y);
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  console.log('PASS: isometric scene, screen-relative keyboard and joystick, finite map, grid/camera toggles, depth order and fade, reset, phone layout, portrait pause and formal-save isolation.');
}finally{socket?.close();browser.kill();server.close();}
