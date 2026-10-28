import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const build = path.resolve('cocos/build/web-mobile');
const profile = path.resolve('.local-checks/edge-ui-test');
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
  const ready = async () => {
    for (let i = 0; i < 100; i++) {
      await delay(150);
      const state = await evaluate(`(async()=>{
        if(typeof System==='undefined')return null;
        const cc=await System.import('cc'),root=cc.director.getScene()?.getChildByName('GameRoot')?.getComponent('GameRoot');
        if(root?.status.string.startsWith('启动失败'))return {error:root.status.string};
        if(!root?.expedition)return null;window.qa={cc,root};return {hud:root.hud.string};
      })()`);
      if (state) { assert.ok(!state.error,state.error); return; }
    }
    throw new Error('Game did not initialize: '+JSON.stringify(exceptions));
  };
  const shot = async name => {
    await delay(150);
    const capture=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync('.local-checks/'+name+'.png',Buffer.from(capture.data,'base64'));
  };
  const point = async (x,y) => evaluate(`(()=>{
    const r=document.getElementById('GameCanvas').getBoundingClientRect();
    const scale=Math.min(r.width/1280,r.height/720);
    return {x:r.left+r.width/2+(${x})*scale,y:r.top+r.height/2-(${y})*scale};
  })()`);
  const tap = async (x,y) => {
    const p=await point(x,y);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0}]});
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(120);
  };
  const key = async (code,key,number,hold=100) => {
    await send('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode:number});await delay(hold);
    await send('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode:number});await delay(100);
  };
  await ready();await delay(250);
  assert.equal(await evaluate('qa.cc.sys.isMobile'),true);
  assert.equal(await evaluate('qa.root.world.art.size'),52);
  assert.equal(await evaluate('qa.root.tuning.rowHeight'),48);
  await evaluate('qa.root.toastTimer=0'); await shot('ui-exploration');

  // Empty and populated inventory; opening panels must pause movement.
  await tap(310,281);
  assert.equal(await evaluate('qa.root.bagPanel.active'),true);
  assert.match(await evaluate('qa.root.bagText.string'),/背包还空着/);
  const beforePanel=await evaluate('JSON.stringify(qa.root.expedition.slot.position)');
  await key('KeyD','d',68,200);
  assert.equal(await evaluate('JSON.stringify(qa.root.expedition.slot.position)'),beforePanel);
  await shot('ui-bag-empty');await tap(390,-240);
  await evaluate('qa.root.expedition.slot.game.inventory={coin:123,wood:8,stone:3,ore_copper:12};qa.root.expedition.dirty=true');
  await tap(310,281);assert.match(await evaluate('qa.root.bagText.string'),/铜矿/);await shot('ui-bag');await tap(390,-240);

  // Every word remains reachable; disabled paging cannot leave the valid range.
  await evaluate('qa.root.expedition.slot.game.seenWords=["apple","gold","stone"];qa.root.expedition.dirty=true');
  await tap(500,281);assert.equal(await evaluate('qa.root.dexPanel.active'),true);
  await tap(-400,-240);assert.equal(await evaluate('qa.root.dexPage'),0);await shot('ui-dex');
  await tap(400,-240);await tap(400,-240);await tap(400,-240);
  assert.equal(await evaluate('qa.root.dexPage'),2);
  assert.equal(await evaluate('qa.root.dexRows.filter(r=>r.node.active).length'),4);
  await tap(470,242);assert.equal(await evaluate('qa.root.dexPanel.active'),false);

  // Two fingers: move and dig together, release either without leaving input stuck.
  await tap(300,-267);assert.equal(await evaluate('qa.root.expedition.slot.position.z'),1);
  await evaluate(`(()=>{const g=qa.root.expedition,p=g.slot.position;for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)g.slot.game.diffs[x+','+y+',1']='dug';delete g.slot.game.diffs['1,0,1'];p.x=.5;p.y=.5;g.facing={x:1,y:0};})()`);
  await delay(100);
  const joystick=await point(-435,-230),dig=await point(500,-232);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...joystick,id:0}]});
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...joystick,id:0},{...dig,id:1}]});
  await delay(700);
  assert.equal(await evaluate('qa.root.digging'),true);
  assert.equal(await evaluate('qa.root.expedition.slot.game.diffs["1,0,1"]'),'dug');
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...dig,id:1}]});
  await delay(80);
  assert.equal(await evaluate('qa.root.digging'),false);
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await evaluate('qa.root.stick.id'),-1);
  await shot('ui-underground');

  // Talk uses the same interaction button and does not descend.
  await evaluate('Object.assign(qa.root.expedition.slot.position,{x:5.5,y:-.5,z:0});qa.root.resetInput()');
  await delay(100);await tap(300,-267);
  assert.equal(await evaluate('qa.root.npcPanel.active'),true);
  const dialogue=await evaluate('qa.root.npcText.string');await tap(-350,-239);
  assert.notEqual(await evaluate('qa.root.npcText.string'),dialogue);await shot('ui-dialogue');await tap(350,-239);

  // Open a real generated chest, then answer with a touch event.
  await evaluate(`(()=>{const g=qa.root.expedition;let chest;
    outer:for(let y=0;y<25;y++)for(let x=0;x<25;x++)if(g.tileAt(x,y,1).type==='chest'){chest={x,y};break outer;}
    if(!chest)throw Error('No chest');g.slot.game.diffs[(chest.x-1)+','+chest.y+',1']='dug';
    Object.assign(g.slot.position,{x:chest.x-.5,y:chest.y+.5,z:1});g.facing={x:1,y:0};qa.root.resetInput();
    g.tick(.05,0,0,true,qa.root.tuning);})()`);
  await delay(150);assert.equal(await evaluate('qa.root.quizPanel.active'),true);await shot('ui-quiz');
  const correct=await evaluate('qa.root.expedition.quiz.session.question.correctIndex');
  await tap(correct%2?260:-260,-36-Math.floor(correct/2)*104);
  assert.equal(await evaluate('qa.root.expedition.quiz'),null);

  // Phone aspect ratios, portrait guard, and a synthetic notch-safe rectangle.
  for(const [width,height,name] of [[844,390,'ui-phone'],[667,375,'ui-small-phone']]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(250);
    await tap(500,281);assert.equal(await evaluate('qa.root.dexPanel.active'),true);await shot(name+'-dex');await tap(470,242);
    await shot(name);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(250);
  assert.equal(await evaluate('getComputedStyle(document.getElementById("rotate")).display'),'flex');
  const beforePortrait=await evaluate('JSON.stringify(qa.root.expedition.slot.position)');await key('KeyE','e',69);
  assert.equal(await evaluate('JSON.stringify(qa.root.expedition.slot.position)'),beforePortrait);await shot('ui-portrait');
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(200);
  await evaluate(`document.getElementById('SafeArea').style.cssText='position:fixed;left:44px;right:44px;top:0;bottom:21px';qa.cc.view.resizeWithBrowserSize(true);window.dispatchEvent(new Event('resize'))`);
  await delay(250);await tap(310,281);assert.equal(await evaluate('qa.root.bagPanel.active'),true);await shot('ui-safe-area');await tap(390,-240);
  const safe=await evaluate(`(()=>{const a=document.getElementById('SafeArea').getBoundingClientRect(),c=document.getElementById('GameCanvas').getBoundingClientRect();return {ok:c.left>=a.left-1&&c.top>=a.top-1&&c.right<=a.right+1&&c.bottom<=a.bottom+1,host:a.toJSON(),canvas:c.toJSON(),frame:qa.cc.view.getFrameSize(),observer:!!qa.root.safeAreaObserver}})()`);
  assert.equal(safe.ok,true,'canvas must stay inside the safe area: '+JSON.stringify(safe));

  // Backgrounding resets held input; reload preserves collected goods and position.
  await evaluate('qa.root.stick={x:1,y:0,id:7};qa.root.digging=true;qa.cc.game.emit(qa.cc.Game.EVENT_HIDE)');
  assert.equal(await evaluate('qa.root.digging'),false);assert.equal(await evaluate('qa.root.stick.id'),-1);
  await evaluate('qa.root.expedition.dirty=true;qa.root.persist()');
  const saved=await evaluate('JSON.stringify(qa.root.expedition.slot)');
  await send('Page.reload');await ready();
  assert.equal(await evaluate('JSON.stringify(qa.root.expedition.slot)'),saved);
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  console.log('PASS: atlas startup, inventory, paged dex, paused panels, two-finger mining, dialogue, chest, phone layouts, rotation, safe-area input, background reset and save reload.');
} finally { socket?.close(); browser.kill(); server.close(); }
