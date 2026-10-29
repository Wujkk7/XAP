import { Node, UITransform, Label, Graphics, Color, Layers, EventTouch } from 'cc';
import { LETTERS, LAB_WORD_RULES as RULE } from '../data/constants/WordPassageRules';
import type { WordPassages } from '../core/WordPassages';

// Engine UI only; inventory, quiz rewards and passage settlement stay in the pure controller.
export class WordPassageUI {
  panel: Node;
  mode = '';
  draft = '';
  private source = 'E';
  private destination = 'A';
  private chest = 0;
  private status = '';
  private line!: Label;
  private feedback!: Label;
  private keyLabels = new Map<string, Label>();
  private locked = false;
  constructor(private parent: Node, public words: WordPassages,
    private changed: () => void, private swing: (letter: string, finish?: () => void) => void, private closed: () => void) {
    this.panel = this.node('拼词与收集', parent, 0, -145, 1190, 412); this.panel.active = false;
  }
  get active(): boolean { return this.panel.active; }
  private node(name: string, parent: Node, x: number, y: number, w: number, h: number): Node {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.setPosition(x,y); n.addComponent(UITransform).setContentSize(w,h); return n;
  }
  private color(s: string): Color { return new Color().fromHEX(s); }
  private text(value: string, x: number, y: number, w: number, size = 24): Label {
    const l = this.node('文字',this.panel,x,y,w,62).addComponent(Label); l.string=value; l.fontSize=size; l.lineHeight=size*1.3; l.color=this.color('f1e7c7'); l.overflow=Label.Overflow.SHRINK; return l;
  }
  private button(value: string,x:number,y:number,w:number,action:()=>void,h=48):Label {
    const n=this.node(value,this.panel,x,y,w,h),g=n.addComponent(Graphics);
    const paint=(down:boolean)=>{g.clear();g.fillColor=this.color(down?'796247':'39473d');g.strokeColor=this.color('9d9476');g.lineWidth=1;g.roundRect(-w/2,-h/2,w,h,7);g.fill();g.stroke();};paint(false);
    n.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{e.propagationStopped=true;paint(true);});
    n.on(Node.EventType.TOUCH_CANCEL,(e:EventTouch)=>{e.propagationStopped=true;paint(false);});
    n.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{e.propagationStopped=true;paint(false);if(!this.locked&&n.getComponent(UITransform)!.hitTest(e.getLocation()))action();});
    const l=this.node('文字',n,0,0,w-8,h-4).addComponent(Label);l.string=value;l.fontSize=23;l.lineHeight=28;l.color=this.color('f1e7c7');l.overflow=Label.Overflow.SHRINK;return l;
  }
  open(mode:string,index=0):void {
    if(this.locked)return;
    this.mode=mode;this.chest=index;this.draft='';this.status='';this.panel.active=true;this.words.lab.walk.stop();
    if(mode==='seal')this.words.discover();
    if(mode==='clue'){this.words.learn();this.status='观察记录已保存 · 根据刻痕猜测，不直接公布答案';}
    this.render();this.changed();
  }
  close():void {if(this.locked)return;this.draft='';this.panel.active=false;this.mode='';this.closed();this.changed();}
  private render():void {
    for(const child of [...this.panel.children])child.destroy();this.keyLabels.clear();
    const g=this.panel.getComponent(Graphics)??this.panel.addComponent(Graphics);g.clear();g.fillColor=this.color('202d27');g.strokeColor=this.color('948568');g.lineWidth=2;g.roundRect(-595,-206,1190,412,16);g.fill();g.stroke();
    this.panel.off(Node.EventType.TOUCH_START);this.panel.off(Node.EventType.TOUCH_END);
    this.panel.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{e.propagationStopped=true;});this.panel.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{e.propagationStopped=true;});
    this.button('收起',525,168,110,()=>this.close());
    const titles:Record<string,string>={seal:'符文通道 · 可选捷径',plan:'计划拼词 · 不挥镐、不占材料',bag:'字母袋',npc:'兑换商人 · 指定你需要的字母',clue:'探索碑文 · 图鉴',chest:'认词宝箱'};
    this.text(titles[this.mode]??'',-160,168,780,26);
    this.feedback=this.text(this.status,0,-184,1100,22);
    if(this.mode==='chest'){this.renderChest();return;}
    if(this.mode==='clue'){
      this.text(this.words.observation(),0,75,1050,27);
      this.text('这些图案可能与附近符文有关。你觉得它们在描述什么？',0,-10,1000,23);
      this.button('返回探索',0,-95,240,()=>this.close());return;
    }
    if(this.mode==='bag'){
      this.text('材料 '+this.words.lab.resources+' · 金币 '+this.words.coins+' · 追踪 '+(this.words.tracked||'未设置'),0,108,1000);
      this.line=this.text('',0,59,1080,22);
      this.keyboard(false,17);
      this.button('计划拼词',-390,-139,190,()=>this.open('plan'));
      this.button('清除追踪',-170,-139,190,()=>{this.words.tracked='';this.refresh();this.changed();});
      this.button('已见图鉴',60,-139,190,()=>{this.status='词条：'+(this.words.visibleWords().join(' · ')||'暂无已公开词条')+(this.words.room.learned?' · 已观察碑文，可回去重看线索':'');this.refresh();});
      this.button('返回探索',390,-139,190,()=>this.close());this.refresh();return;
    }
    if(this.mode==='npc'){
      this.text('材料 '+this.words.lab.resources+' · 缺材料可敲开树石或到下层采集。答案线索在蓝色碑文。',0,108,1100,22);
      this.line=this.text('',0,65,1100,23);this.keyboard(true,17);
      this.button('材料兑换',-365,-139,200,()=>{this.status=this.words.exchange(this.destination)?'已换得 '+this.destination:'材料不足，先继续探索采集';this.render();this.changed();});
      this.button('换出 '+this.source,-139,-139,220,()=>{this.source=LETTERS[(LETTERS.indexOf(this.source)+1)%26];this.render();});
      this.button('字母互换',140,-139,210,()=>{this.status=this.words.exchange(this.destination,this.source)?'已换得 '+this.destination:'换出字母不足，或换入换出相同';this.render();this.changed();});
      this.button('计划拼词',390,-139,180,()=>this.open('plan'));this.refresh();return;
    }
    const planning=this.mode==='plan';
    this.text(planning?'填写猜测的完整单词，只计算缺口，不判断对错。':this.words.clue(),0,111,1110,22);
    this.line=this.text('',-135,62,820,29);
    if(!planning)this.button(this.words.room.hint?this.words.room.answer.length+' 个字母':'词长提示 · 1 材料',425,64,280,()=>{this.status=this.words.hint()?'答案有 '+this.words.room.answer.length+' 个字母':'材料不足；也可观察蓝色碑文寻找线索';this.render();this.changed();});
    this.keyboard(true,17);
    this.button('退格',-450,-139,150,()=>{this.draft=this.draft.slice(0,-1);this.refresh();});
    this.button('清空',-270,-139,150,()=>{this.draft='';this.refresh();});
    if(planning){
      this.button('追踪此词',40,-139,230,()=>{this.status=this.words.track(this.draft)?'已追踪，开箱会轻度偏向所缺字母':'请先填写目标词';this.refresh();this.changed();});
    }else{
      this.button('计划拼词',-30,-139,220,()=>this.open('plan'));
      this.button('破封',285,-139,350,()=>this.submit());
    }
    this.refresh();
  }
  private keyboard(interactive:boolean,top:number):void {
    ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].forEach((row,r)=>{
      Array.from(row).forEach((c,i)=>{
        const x=(i-(row.length-1)/2)*91, y=top-r*48;
        const label=this.button(c,x,y,83,()=>{
          if(!interactive)return;
          if(this.mode==='npc'){this.destination=c;this.refresh();return;}
          this.type(c);
        },43);this.keyLabels.set(c,label);
      });
    });
  }
  type(c:string):void {
    if(this.locked||!this.active||!LETTERS.includes(c)||c.length!==1||!['seal','plan'].includes(this.mode))return;
    if(this.draft.length>=16)return;
    if(this.mode==='seal'&&this.words.available(c,this.draft)<=0){this.status='缺少 '+c+' · 可去寻宝或向商人兑换';this.refresh();return;}
    this.draft+=c;this.status='';
    if(this.mode==='seal'){const p=this.words.services[0];this.words.lab.tile(p.x,p.y)!.damage=Math.min(.92,this.draft.length*.16);this.swing(c);}
    this.refresh();
  }
  backspace():void {if(!this.locked){this.draft=this.draft.slice(0,-1);this.refresh();}}
  submit():void {
    if(this.locked||this.mode!=='seal')return;
    if(this.draft!==this.words.room.answer||Object.keys(this.words.needs(this.draft)).length){
      this.status='未匹配线索 · 可修改输入或查找提示';const p=this.words.services[0];this.words.lab.tile(p.x,p.y)!.damage=0;this.refresh();return;
    }
    this.locked=true;this.status='字母聚合 · 重击！';this.refresh();
    this.swing(this.draft,()=>{
      const word=this.draft;this.locked=false;
      if(this.words.submit(word)){this.close();}else{this.status='通道暂不可开启，请靠近后重试';this.refresh();}
      this.changed();
    });
  }
  private renderChest():void {
    const q=this.words.quiz(this.chest).question;this.changed();
    this.text(q.word,0,91,800,42);this.text(q.example,0,36,1050,24);
    q.options.forEach((v,i)=>this.button(v,(i%2?1:-1)*265,-37-Math.floor(i/2)*61,480,()=>{
      const result=this.words.answerChest(this.chest,i);this.changed();
      if(result.opened){
        this.status=(result.correct?'开箱成功':'三次尝试，保底开箱')+' · 字母数量不受答错影响';
        this.mode='loot';this.showLoot(result.letters);
      }else{this.status='再试试 · 已尝试 '+this.words.room.attempts[this.chest]+'/3';this.refresh();}
    }));
  }
  private showLoot(letters:string):void {
    for(const child of [...this.panel.children])child.destroy();
    this.text('字母宝箱 · '+this.status,0,151,1050,26);
    this.text(letters.split('').join('   '),0,55,1090,37);
    this.text('字母逐个入袋 · 关闭后继续探索。',0,-30,1000,24);
    this.button('收好，继续探索',0,-139,360,()=>this.close());
    this.swing('+'+letters);
  }
  refresh():void {
    if(!this.active)return;
    if(this.feedback?.isValid)this.feedback.string=this.status;
    const shortage=Object.entries(this.words.needs()).map(([c,n])=>c+'×'+n).join(' ');
    if(this.line?.isValid){
      this.line.string=this.mode==='npc'?'换入 '+this.destination+'：'+this.words.cost(this.destination)+' 材料，或 '+(this.words.cost(this.destination)===2?RULE.rareSwap:RULE.commonSwap)+' 个 '+this.source
        :this.mode==='bag'?'追踪缺口：'+(shortage||'已凑齐 / 暂无目标')
        :(this.draft||'点击字母开始')+(this.mode==='plan'?'':'  · 材料仅在成功时消耗');
    }
    for(const [c,l] of this.keyLabels){const n=this.words.available(c,this.mode==='seal'?this.draft:'');l.string=c+' '+n;l.color=this.color(this.mode==='seal'&&n<=0?'657369':c===this.destination&&this.mode==='npc'?'f9d484':'f1e7c7');}
  }
}

