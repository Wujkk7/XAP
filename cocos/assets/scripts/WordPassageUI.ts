import { Node, UITransform, Label, Color, Layers, EventTouch } from 'cc';
import { LETTERS, LAB_WORD_RULES as RULE, LAB_PACK_RULES, LAB_RELIC_CATALOG, LAB_RELIC_TIERS } from '../data/constants/WordPassageRules';
import type { WordPassages } from '../core/WordPassages';
import { WORDS_TIER1 } from '../core/vocab';
import { ITEM_NAMES } from '../data/resource-config/ArtCatalog';
import { VILLAGE } from '../data/external-files/Village';
import type { LabUISkin } from './LabUISkin';

const MODE_ICONS: Record<string, string> = {
  inventory: 'pack', dex: 'book', may: 'interact', chest: 'chest', worldchest: 'chest',
  seal: 'seal', plan: 'plan', bag: 'letters', npc: 'trade', clue: 'clue',
  camp: 'trade', overflow: 'pack',
};

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
  private page=0;
  private dialogue=0;
  constructor(private parent: Node, public words: WordPassages,
    private changed: () => void, private swing: (letter: string, finish?: () => void) => void,
    private closed: () => void, private skin: LabUISkin) {
    this.panel = this.node('拼词与收集', parent, 0, -145, 1190, 412); this.panel.active = false;
    this.skin.frame(this.panel, 'ui-panel-window', true);
  }
  get active(): boolean { return this.panel.active; }
  private node(name: string, parent: Node, x: number, y: number, w: number, h: number): Node {
    const n = new Node(name); n.layer = Layers.Enum.UI_2D; parent.addChild(n); n.setPosition(x,y); n.addComponent(UITransform).setContentSize(w,h); return n;
  }
  private color(s: string): Color { return new Color().fromHEX(s); }
  private text(value: string, x: number, y: number, w: number, size = 24): Label {
    const l = this.node('文字',this.panel,x,y,w,62).addComponent(Label); l.string=value; l.fontSize=size; l.lineHeight=size*1.3; l.color=this.color('f1e7c7'); l.overflow=Label.Overflow.SHRINK; return l;
  }
  private keySkin(c: string): string {
    if (this.mode === 'seal' && this.words.available(c,this.draft) <= 0) return 'ui-key-empty';
    if (this.mode === 'npc' && c === this.destination) return 'ui-key-selected';
    return 'ui-key';
  }
  private button(value: string,x:number,y:number,w:number,action:()=>void,h=48,key=false):Label {
    const n=this.node(value,this.panel,x,y,w,h);
    const primary=value==='破封';
    const surface=primary?'ui-button-primary':'ui-button';
    const paint=(down:boolean)=>{
      const frame=key ? (down?'ui-key-down':this.keySkin(value)) : (down?surface+'-down':surface);
      this.skin.frame(n,frame,true);
    };paint(false);
    n.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{e.propagationStopped=true;paint(true);});
    n.on(Node.EventType.TOUCH_CANCEL,(e:EventTouch)=>{e.propagationStopped=true;paint(false);});
    n.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{e.propagationStopped=true;paint(false);if(!this.locked&&n.getComponent(UITransform)!.hitTest(e.getLocation()))action();});
    const l=this.node('文字',n,0,0,w-8,h-4).addComponent(Label);l.string=value;l.fontSize=23;l.lineHeight=28;l.color=this.color(primary?'253125':'f1e7c7');l.overflow=Label.Overflow.SHRINK;return l;
  }
  open(mode:string,index=0):void {
    if(this.locked)return;
    this.mode=mode;this.chest=index;this.draft='';this.status='';this.page=0;this.panel.active=true;this.words.lab.walk.stop();
    if(mode==='seal')this.words.discover();
    if(mode==='clue'){this.words.learn();this.status='观察记录已保存 · 根据刻痕猜测，不直接公布答案';}
    this.render();this.changed();
  }
  close():void {if(this.locked)return;this.draft='';this.panel.active=false;this.mode='';this.closed();this.changed();}
  private render():void {
    for(const child of [...this.panel.children])child.destroy();this.keyLabels.clear();
    const icon=MODE_ICONS[this.mode];
    if(icon)this.skin.icon(this.panel,'ui-'+icon,-540,168,44);
    this.panel.off(Node.EventType.TOUCH_START);this.panel.off(Node.EventType.TOUCH_END);
    this.panel.on(Node.EventType.TOUCH_START,(e:EventTouch)=>{e.propagationStopped=true;});this.panel.on(Node.EventType.TOUCH_END,(e:EventTouch)=>{e.propagationStopped=true;});
    this.button('收起',525,168,110,()=>{if(this.mode==='overflow'&&this.words.adventure.pendingLoot)this.words.adventure.resolvePending();this.close();});
    const titles:Record<string,string>={seal:'符文封印 · 破解后解锁下层',plan:'计划拼词 · 不挥镐、不占材料',bag:'字母袋',npc:'兑换商人 · 指定你需要的字母',clue:'探索碑文 · 图鉴',chest:'认词宝箱',camp:'营地工坊 · 鉴定、出售与扩容',overflow:'背包已满 · 选择替换或放弃'};
    this.text(titles[this.mode]??'',-160,168,780,26);
    this.feedback=this.text(this.status,0,-184,1100,22);
    if(this.mode==='inventory'){
      const adv=this.words.adventure,slots=adv.slots();
      this.text('探险背包 · '+slots.length+'/'+adv.capacity+' 格 · 金币 '+this.words.coins+' · 宝物图鉴 '+adv.relicDex.length+'/'+LAB_RELIC_CATALOG.length,0,168,860,25);
      if(!slots.length)this.text('背包还空着 · 探索树木、石头、矿脉与隐藏洞室',0,40,1000,26);
      slots.slice(0,10).forEach((slot,i)=>{
        const x=i<5?-280:280, y=100-(i%5)*44;
        if(slot.kind==='material'&&Object.prototype.hasOwnProperty.call(ITEM_NAMES,slot.item))this.skin.icon(this.panel,'item-'+slot.item,x-160,y,32);
        else if(slot.kind==='relic'){
          const art=slot.relic.kind==='pack_part'?'item-pack_part':slot.relic.identified?'relic-'+slot.relic.id:'unexamined_relic';
          this.skin.icon(this.panel,art,x-160,y,32);
        }
        const label=slot.kind==='material'
          ?(ITEM_NAMES[slot.item]??slot.item)+' × '+slot.count
          :slot.relic.kind==='pack_part'?'[组件] '+slot.relic.name
          :slot.relic.identified?slot.relic.name+' ('+slot.relic.en+')'
          :'未鉴定'+slot.relic.category+' · '+LAB_RELIC_TIERS[slot.relic.tier].label;
        this.text(label,x,y,290,23);
      });
      this.button('字母袋',-140,-139,230,()=>this.open('bag'));
      if(this.words.lab.depth===0)this.button('营地工坊',140,-139,230,()=>this.open('camp'));
      return;
    }
    if(this.mode==='camp'){
      const adv=this.words.adventure;
      this.text('金币 '+this.words.coins+' · 材料 '+this.words.lab.resources+' · 背包 '+adv.usedSlots()+'/'+adv.capacity+' 格 · 图鉴 '+adv.relicDex.length+'/'+LAB_RELIC_CATALOG.length,0,115,1080,23);
      const hasPart=adv.relics.some(r=>r.kind==='pack_part');
      if(!adv.expanded&&hasPart){
        this.button('修复背包组件扩容（需 '+LAB_PACK_RULES.expandMaterials+' 材料 → '+LAB_PACK_RULES.expandedCapacity+' 格）',0,56,640,()=>{
          this.status=adv.repairPack()?'扩容成功！背包容量提升至 '+adv.capacity+' 格':'普通材料不足（需要 '+LAB_PACK_RULES.expandMaterials+'）';
          this.render();this.changed();
        });
      }
      const relicItems=adv.relics.map((r,idx)=>({r,idx})).filter(x=>x.r.kind==='relic');
      if(!relicItems.length&&(!hasPart||adv.expanded)){
        this.text('暂无待处理宝物 · 下探地层凿开墙后小洞室可发现未鉴定宝物与背包组件',0,-15,1040,24);
      }
      relicItems.slice(0,6).forEach(({r,idx},i)=>{
        const tier=LAB_RELIC_TIERS[r.tier],x=i%2?-285:285,y=(hasPart&&!adv.expanded?-8:42)-Math.floor(i/2)*56;
        if(!r.identified){
          this.button('鉴定 · 未鉴定'+r.category+'('+tier.label+') · '+tier.appraiseFee+'币',x,y,540,()=>{
            const res=adv.appraiseRelic(idx);
            this.status=res.ok?'鉴定完成：'+res.relic!.name+' ('+res.relic!.en+')，已记入宝物图鉴':(res.reason??'鉴定失败');
            this.render();this.changed();
          });
        }else{
          this.button('出售 · '+r.name+'('+r.en+') · +'+tier.sellValue+'币',x,y,540,()=>{
            const res=adv.sellRelic(idx);
            this.status=res.ok?'已出售 '+res.relic!.name+'，获得 '+res.coins+' 金币':'出售失败';
            this.render();this.changed();
          });
        }
      });
      this.button('返回对话',-160,-139,220,()=>this.open('may'));
      this.button('继续探索',160,-139,220,()=>this.close());return;
    }
    if(this.mode==='overflow'){
      const adv=this.words.adventure,pending=adv.pendingLoot;
      if(!pending){this.close();return;}
      const incoming=pending.kind==='material'
        ?(ITEM_NAMES[pending.item]??pending.item)+' × '+pending.count
        :pending.relic.kind==='pack_part'?pending.relic.name
        :'未鉴定'+pending.relic.category+'（'+LAB_RELIC_TIERS[pending.relic.tier].label+'）';
      this.text('新收获：'+incoming+' · 背包已满（'+adv.usedSlots()+'/'+adv.capacity+'），选择一格替换或放弃：',0,115,1100,23);
      adv.slots().slice(0,8).forEach((slot,i)=>{
        const label=slot.kind==='material'
          ?(ITEM_NAMES[slot.item]??slot.item)+' × '+slot.count
          :slot.relic.kind==='pack_part'?slot.relic.name
          :slot.relic.identified?slot.relic.name
          :'未鉴定'+slot.relic.category+'('+LAB_RELIC_TIERS[slot.relic.tier].label+')';
        this.button('替换：'+label,i%2?285:-285,50-Math.floor(i/2)*54,530,()=>{
          adv.resolvePending(i);this.changed();this.close();
        });
      });
      this.button('放弃新收获',0,-139,300,()=>{adv.resolvePending();this.changed();this.close();});
      return;
    }
    if(this.mode==='dex'){
      this.text('单词图鉴 · '+this.words.visibleWords().length+' 个已公开词',0,168,800,26);
      WORDS_TIER1.slice(this.page*8,this.page*8+8).forEach((w,i)=>{
        const seen=this.words.visibleWords().includes(w.word.toUpperCase()),state=this.words.adventure.book.get(w.word);
        this.text(seen?w.word+' · '+w.meaning+'\n'+(state.status==='mastered'?'已掌握':'已发现 · 探索中'):'尚未发现',i<4?-280:280,100-(i%4)*55,510,22);
      });
      this.button('上一页',-350,-139,200,()=>{if(this.page>0){this.page--;this.render();}});
      this.text((this.page+1)+' / '+Math.ceil(WORDS_TIER1.length/8),0,-139,210,23);
      this.button('下一页',350,-139,200,()=>{if((this.page+1)*8<WORDS_TIER1.length){this.page++;this.render();}});return;
    }
    if(this.mode==='may'){
      const line=VILLAGE.dialogue[this.dialogue];this.text(VILLAGE.npc.name,0,168,800,26);
      this.text(line.en,0,70,1080,29);this.text(line.zh,0,-5,1080,27);
      this.button('再聊一句',-340,-139,260,()=>{this.dialogue=(this.dialogue+1)%VILLAGE.dialogue.length;this.render();});
      this.button('营地鉴定与扩容',0,-139,300,()=>this.open('camp'));
      this.button('继续探索',340,-139,260,()=>this.close());return;
    }
    if(this.mode==='worldchest'){
      const active=this.words.adventure.quiz;if(!active){this.close();return;}const q=active.session.question;
      this.text(active.stubborn?'顽固石 · 再次相遇':'探索宝箱',0,168,800,26);
      this.text(q.word,0,91,800,42);this.text(q.example,0,36,1050,24);
      q.options.forEach((v,i)=>this.button(v,(i%2?1:-1)*265,-37-Math.floor(i/2)*61,480,()=>{
        const result=this.words.adventure.answer(i);this.changed();
        if(result.opened){this.words.lab.message=result.word+' · +'+result.coins+' 金币';this.close();}
        else{this.status='再想想 · 三次尝试后保底结算';this.refresh();}
      }));return;
    }
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
      this.button('已见图鉴',60,-139,190,()=>this.open('dex'));
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
    if(!planning){
      const r=this.words.room;
      this.button(r.hint?r.answer.length+' 个字母':'词长 · 1材料',290,64,210,()=>{this.status=this.words.hint()?'答案有 '+r.answer.length+' 个字母':'材料不足；也可观察蓝色碑文寻找线索';this.render();this.changed();});
      this.button(r.letterHint?'首字 '+r.answer[0]:'首字 · 2材料',500,64,190,()=>{this.status=this.words.letterHint()?'答案以字母 '+r.answer[0]+' 开头':'材料不足（需要 '+RULE.letterHintCost+' 材料）';this.render();this.changed();});
    }
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
        },43,true);this.keyLabels.set(c,label);
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
    for(const [c,l] of this.keyLabels){
      const n=this.words.available(c,this.mode==='seal'?this.draft:'');
      l.string=c+' '+n;
      l.color=this.color(this.mode==='seal'&&n<=0?'a9b4a3':c===this.destination&&this.mode==='npc'?'f9d484':'f1e7c7');
      this.skin.frame(l.node.parent!,this.keySkin(c),true);
    }
  }
}

