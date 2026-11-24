import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { occlusionAlpha } from '../cocos/assets/scripts/ObliqueProjection.ts';

const build = path.resolve('cocos/build/isometric');
const profile = path.resolve('.local-checks/edge-layered-test');
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
  await ready();assert.equal(await evaluate('qa.root.lab.depth'),0);await shot('layered-forest');
  await evaluate('localStorage.setItem("xap-save-v1","web-save-untouched");localStorage.setItem("xap-cocos-slot-v1","cocos-save-untouched")');
  await press();await delay(300);await release();
  assert.equal(await evaluate('qa.root.lab.travel'),null,'unbroken seal must block ordinary descent');
  const unlock=async()=>evaluate(`(()=>{const r=qa.root,w=r.words,saved={x:r.walk.x,y:r.walk.y},word=w.room.answer,p=w.services[0];for(const c of word)w.letters[c]++;r.walk.x=p.x+.5;r.walk.y=p.y+1.5;const opened=w.submit(word);r.walk.x=saved.x;r.walk.y=saved.y;return opened;})()`);
  assert.equal(await unlock(),true);
  await press();await until('qa.root.lab.tile(6,7).damage>.2','first cracks');await shot('layered-cracks');
  await until('!!qa.root.lab.travel','floor collapse');
  assert.equal(await evaluate('qa.root.lab.tile(6,7,0).hole'),true);
  assert.equal(await evaluate('qa.root.layerViews.size'),2);
  await until('qa.root.lab.travel?.elapsed>.45','cross-section camera');await shot('layered-descent');
  await until('qa.root.lab.depth===1','roots arrival');await release();await shot('layered-roots');
  assert.equal(await evaluate('qa.root.lab.layer().theme'),1);
  assert.ok(await evaluate('qa.root.lab.layer().tiles.flat().some(t=>t.kind==="root")'));
  assert.equal(await evaluate('qa.root.lab.collides(qa.root.walk.x,qa.root.walk.y)'),false);
  const light=await evaluate(`(()=>{const v=qa.root.layerViews.get(1),n=qa.root.lab.layer().tiles.length;return {near:v.brightness[7*n+6],far:v.brightness[0],hidden:v.actors.filter(a=>Math.hypot(a.x-qa.root.walk.x,a.y-qa.root.walk.y)>3.5).map(a=>a.opacity.opacity)};})()`);
  assert.ok(light.near>.95);assert.ok(light.far<.04);assert.ok(light.hidden.length>0);assert.ok(light.hidden.every(n=>n<10));
  const painted=await evaluate(`qa.root.layerViews.get(1).actors.filter(a=>Math.hypot(a.x-qa.root.walk.x,a.y-qa.root.walk.y)>3.5).map(a=>Math.max(a.sprite.color.r,a.sprite.color.g,a.sprite.color.b))`);
  assert.ok(painted.length>0);assert.ok(painted.every(n=>n<20),'distant props must not retain bright sprite colours');
  const before=await evaluate('qa.root.walk.distance');await key('KeyD','d',68,250);
  assert.ok(await evaluate('qa.root.walk.distance')>before);

  // Mine a selected adjacent resource through real map-touch and hold-button events.
  await evaluate('qa.root.resetInput();qa.root.walk.x=8.5;qa.root.walk.y=7.5');await delay(200);
  await select(8.5,8.5,24);
  assert.deepEqual(await evaluate('qa.root.lab.target'),{x:8,y:8});
  await press();await until('qa.root.lab.resources===1','root resource mined');await release();
  assert.equal(await evaluate('qa.root.lab.tile(8,8).kind'),'floor');await shot('layered-resource');
  await tap(295,-281);
  await evaluate('qa.root.walk.x=6.5;qa.root.walk.y=7.5;qa.root.lab.target=null');
  assert.equal(await unlock(),true);
  await press();await until('!!qa.root.lab.travel','second floor collapse');await until('qa.root.lab.depth===2','mineral arrival');await release();
  assert.equal(await evaluate('qa.root.lab.layer().theme'),2);await shot('layered-minerals');
  assert.ok(await evaluate('qa.root.lab.layer().tiles.flat().some(t=>t.kind==="wall")'));
  assert.equal(await evaluate('qa.root.lab.collides(qa.root.walk.x,qa.root.walk.y)'),false);

  // Settled light must reuse geometry; moving the lamp must invalidate both caches.
  const redraw = await evaluate(`(()=>{
    const r=qa.root,v=r.layerViews.get(2),savedX=r.walk.x;
    for(let i=0;i<400;i++)r.lightLayers(1/60);
    let fog=0,props=0;
    const clear=v.fog.clear,paint=v.actors.map(a=>[a.sprite.color,a.sprite.color.set]);
    v.fog.clear=function(){fog++;return clear.call(this);};
    for(const [color,set] of paint)color.set=function(...args){props++;return set.apply(this,args);};
    try{
      for(let i=0;i<120;i++)r.lightLayers(1/60);
      const idle={fog,props};r.walk.x+=.4;
      for(let i=0;i<30;i++)r.lightLayers(1/60);
      return{idle,moved:{fog,props}};
    }finally{r.walk.x=savedX;v.fog.clear=clear;for(const [color,set] of paint)color.set=set;}
  })()`);
  assert.deepEqual(redraw.idle,{fog:0,props:0},'idle lamp must not rebuild Graphics');
  assert.ok(redraw.moved.fog>0&&redraw.moved.props>0,'moving lamp must refresh darkness and props');

  // Find an actual generated exploration chest, then answer it through touch UI.
  const treasure=await evaluate(`(()=>{const r=qa.root,tiles=r.lab.layer().tiles;
    for(let y=0;y<tiles.length;y++)for(let x=0;x<tiles.length;x++)if(tiles[y][x].kind==='chest')
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])if(!r.lab.collides(x+dx+.5,y+dy+.5))return{x,y,px:x+dx+.5,py:y+dy+.5};
    return null;})()`);
  assert.ok(treasure,'expanded map must contain accessible exploration treasure');
  await evaluate(`qa.root.resetInput();qa.root.walk.x=${treasure.px};qa.root.walk.y=${treasure.py};qa.root.lab.select(${treasure.x},${treasure.y})`);
  await delay(300);await tap(505,-105);
  assert.equal(await evaluate('qa.root.wordUI.mode'),'worldchest');await shot('adventure-chest');
  const correct=await evaluate('qa.root.words.adventure.quiz.session.question.correctIndex');
  await tap(correct%2?265:-265,-145-37-Math.floor(correct/2)*61);
  assert.equal(await evaluate('qa.root.words.adventure.quiz'),null);
  assert.ok(await evaluate('qa.root.words.coins')>0);
  await evaluate('qa.root.walk.x=6.5;qa.root.walk.y=7.5;qa.root.lab.target=null;qa.root.resetInput()');

  // Return twice, then reuse the actual old channel; maps and collected resources must survive.
  await tap(295,-177);await until('qa.root.lab.depth===1','return to root layer');
  assert.equal(await evaluate('qa.root.lab.tile(6,7,1).hole'),true);
  await tap(295,-177);await until('qa.root.lab.depth===0','return to forest');
  assert.equal(await evaluate('qa.root.lab.tile(6,7,0).hole'),true);
  await tap(-495,180);assert.equal(await evaluate('qa.root.wordUI.mode'),'inventory');await shot('adventure-bag');await tap(525,23);
  await tap(-285,180);assert.equal(await evaluate('qa.root.wordUI.mode'),'dex');
  await tap(350,-284);assert.equal(await evaluate('qa.root.wordUI.page'),1);await shot('adventure-dex');await tap(525,23);
  await evaluate('qa.root.walk.x=16.5;qa.root.walk.y=16.5;qa.root.lab.select(17,16)');await delay(300);await tap(505,-105);
  assert.equal(await evaluate('qa.root.wordUI.mode'),'may');await shot('adventure-village-dialogue');
  await tap(-240,-284);assert.equal(await evaluate('qa.root.wordUI.dialogue'),1);await tap(525,23);
  await evaluate('qa.root.lab.returnToEntry();qa.root.resetInput()');
  await press();await until('qa.root.lab.depth===1','reuse forest channel');await release();
  assert.equal(await evaluate('qa.root.lab.resources'),1);
  assert.equal(await evaluate('qa.root.lab.tile(8,8,1).kind'),'floor');
  await press();await until('qa.root.lab.depth===2','reuse root channel');await release();
  assert.equal(await evaluate('qa.root.lab.maxDepth'),2);
  assert.ok(await evaluate('qa.root.fragments.length<=96&&qa.root.layerViews.size<=2'));

  // Mine generated soil/wall with only the action key, then walk through the opened cell.
  for(const kind of ['soil','wall']){
    const target=await evaluate(`(()=>{const r=qa.root,t=r.lab.layer().tiles;
      for(let y=1;y<t.length-1;y++)for(let x=13;x<t.length-1;x++)if(t[y][x].kind==='${kind}')
        for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(!r.lab.collides(x+dx+.5,y+dy+.5)&&!r.lab.tile(x+dx,y+dy).hole)return{x,y,px:x+dx+.5,py:y+dy+.5};
      return null;})()`);
    assert.ok(target,'generated '+kind+' must be reachable for excavation');
    await evaluate(`(()=>{const r=qa.root;r.resetInput();r.walk.x=${target.px};r.walk.y=${target.py};r.lab.target=null;
      const dx=${target.x}+.5-r.walk.x,dy=${target.y}+.5-r.walk.y,x=(dx-dy)*48,y=-(dx+dy)*24,n=Math.hypot(x,y);r.walk.facing={x:x/n,y:-y/n};})()`);
    await delay(350);assert.deepEqual(await evaluate('qa.root.lab.selected()'),{x:target.x,y:target.y});
    await press();await until(`qa.root.lab.tile(${target.x},${target.y}).damage>.1`,'automatic '+kind+' cracks');await shot('auto-dig-'+kind);
    if(kind==='wall'){
      const fade=await evaluate(`(()=>{const r=qa.root,a=r.layerViews.get(2).actors.find(a=>a.x===${target.x}+.5&&a.y===${target.y}+.5);
        const x=a.x-r.walk.x,y=a.y-r.walk.y;
        return {dx:(x-y)*48,dy:(x+y)*24,width:a.width,height:a.node.getComponent(qa.cc.UITransform).height,
          bright:a.brightness,drawn:a.opacity.opacity,frame:a.sprite.spriteFrame.name};})()`);
      assert.equal(fade.frame,'rock_wall');
      const occlusion=occlusionAlpha(fade.dx,fade.dy,fade.width,fade.height,48,69);
      assert.equal(fade.drawn,Math.round(255*Math.pow(fade.bright,1.35)*occlusion),'wall sprite combines lamp visibility and foreground fade');
    }
    await until(`qa.root.lab.tile(${target.x},${target.y}).kind==='floor'`,'automatic '+kind+' mined');await release();
    assert.equal(await evaluate('qa.root.lab.depth'),2);assert.equal(await evaluate(`qa.root.lab.tile(${target.x},${target.y}).hole`),false);
    const point=await evaluate(`(()=>{const r=document.getElementById('GameCanvas').getBoundingClientRect(),s=Math.min(r.width/1280,r.height/720),w=qa.root.walk;
      const dx=${target.x}+.5-w.x,dy=${target.y}+.5-w.y,x=(dx-dy)*48,y=-(dx+dy)*24,n=Math.hypot(x,y);
      return{x:r.left+r.width/2+(-495+x/n*55)*s,y:r.top+r.height/2-(-235+y/n*55)*s};})()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});
    await until(`Math.floor(qa.root.walk.x)===${target.x}&&Math.floor(qa.root.walk.y)===${target.y}`,'walk through excavated '+kind);
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await evaluate('qa.root.lab.collides(qa.root.walk.x,qa.root.walk.y)'),false);
  }
  await evaluate('qa.root.lab.returnToEntry();qa.root.resetInput()');

  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(300);await shot('layered-phone');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(250);
  const paused=await evaluate('JSON.stringify({x:qa.root.walk.x,y:qa.root.walk.y,z:qa.root.lab.depth})');await key('Space',' ',32,400);
  assert.equal(await evaluate('JSON.stringify({x:qa.root.walk.x,y:qa.root.walk.y,z:qa.root.lab.depth})'),paused);
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(200);
  await evaluate('qa.root.striking=true;qa.root.joystick={x:1,y:0,id:7};qa.cc.game.emit(qa.cc.Game.EVENT_HIDE)');
  assert.equal(await evaluate('qa.root.striking'),false);assert.equal(await evaluate('qa.root.joystick.id'),-1);
  assert.equal(await evaluate('localStorage.getItem("xap-save-v1")'),'web-save-untouched');
  assert.equal(await evaluate('localStorage.getItem("xap-cocos-slot-v1")'),'cocos-save-untouched');
  await evaluate('qa.root.saveLab()');const persisted=await evaluate('qa.root.words.snapshot()');
  await send('Page.reload');await ready();assert.equal(await evaluate('qa.root.words.snapshot()'),persisted);
  const legacy=JSON.parse(persisted);legacy.version=1;delete legacy.adventure;delete legacy.legacyDepth;
  for(const layer of legacy.layers)layer.tiles=layer.tiles.slice(0,13).map(row=>row.slice(0,13));
  // Install the fixture after the previous page's final autosave, before the new game loads.
  const migrationFixture=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('xap-isometric-lab-v1',${JSON.stringify(JSON.stringify(legacy))})`});
  await send('Page.reload');await ready();
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:migrationFixture.identifier});
  assert.equal(await evaluate('qa.root.lab.layer().tiles.length'),25,'old terrain must gain the outer expansion');
  assert.equal(await evaluate('qa.root.words.coins'),legacy.coins);
  assert.equal(await evaluate('qa.root.words.legacyDepth'),legacy.maxDepth,await evaluate('qa.root.saveError'));
  assert.equal(await evaluate('qa.root.lab.canDescend(qa.root.lab.maxDepth)'),false);
  await evaluate('qa.root.saveLab()');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("xap-isometric-lab-v1")).version'),3);
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  console.log('PASS: real touch cracks/collapse, 3 expanded layers, seal gating, exploration chest, bag/dex/village UI, legacy save migration, moving and adjacent mining, two-way persistent passages, repeated descents, resource retention, bounded particles/views, phone, portrait pause, background reset and formal-save isolation.');
}finally{socket?.close();browser.kill();server.close();}
