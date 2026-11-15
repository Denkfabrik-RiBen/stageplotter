const assert = require('node:assert/strict');
const {launchBrowser, artifactPath, engine, assertNoOverflow} = require('./browser-qa.cjs');

const consoles = {'x32-local':32,'x32-compact':16,'x32-rack':16,'x32-producer':16,wing:8,xr18:16,cdm32:32,avantis:12,'sq-rack':16,'cq-20b':16,'qu-16':16,'sq-5':16,ui16:12,ui24r:20};
const fullscreenViewports = [{width:800,height:900},{width:1024,height:900},{width:1280,height:900},{width:1440,height:500}];
const settled = page => page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const savedRouting = page => page.evaluate(() => {
  const {generatedAt, ...routing} = JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing;
  return routing;
});

async function fixture(page, model, count) {
  await page.evaluate(({model,count}) => {
    const key='stageplot-studio:workspace:v1', workspace=JSON.parse(localStorage.getItem(key));
    const doc=workspace.entry.document;
    doc.objects=[];
    delete doc.stage.x32Scene;
    const names=['Keys Hauptinstrument · L','Keys Hauptinstrument · R','Gesang Sängerin mit langem Signalnamen','Drums · Kick Out','Bass DI','Unbekanntes Instrument ÄÖÜ','E-Gitarre','Drums · Snare'];
    doc.stage.routing={version:2,mixerModel:model,outputs:[],
      mixerBanks:Array.from({length:4},(_,i)=>({id:'@user',first:i*8+1,last:i*8+8})),
      userInputs:Array.from({length:32},(_,i)=>i<count?{id:'@local',port:i+1}:null),
      preampPower:[{device:'@local/'+model,port:3}],
      inputs:Array.from({length:count},(_,i)=>({id:'label-'+i,instrument:names[i%names.length],number:i+1,localPort:i+1,manual:true,edited:true,mode:i<2?'Stereo '+(i?'R':'L'):'Mono',stereoGroup:i<2?'label-keys':'',connector:'XLR',signalType:'Mic',phantom:false}))};
    localStorage.setItem(key,JSON.stringify(workspace));
    const draftKey='stageplot-studio:drafts:v1',library=JSON.parse(localStorage.getItem(draftKey));
    library.entries[library.entries.findIndex(entry=>entry.id===workspace.entry.id)]=workspace.entry;
    localStorage.setItem(draftKey,JSON.stringify(library));
  },{model,count});
  await page.reload();
  await page.locator('.sp-steps [data-view="routing"]').click();
  await page.locator('[data-rw-tab="mixer"]').click();
  await page.locator('[data-rw-mixer-device="@local"]').click();
  await page.waitForFunction(()=>document.querySelector('#sp-header-draft-status').textContent==='Lokal gespeichert');
  await settled(page);
  // Persist the synthetic fixture through the app before comparing full snapshots.
  // This supplies canonical route IDs/defaults without duplicating its normalizer.
  const power=page.locator('.mx-right [data-rw-preamp="3"]');
  await power.click();
  await page.waitForFunction(model=>!JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.preampPower?.some(entry=>entry.device==='@local/'+model&&entry.port===3),model);
  await power.click();
  await page.waitForFunction(model=>JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.preampPower?.some(entry=>entry.device==='@local/'+model&&entry.port===3),model);
  await settled(page);
}

async function checkLabels(panel, count, label, {denseStereo=false}={}) {
  assert.equal(await panel.locator('[data-rw-mixer-port] .mx-socket-badge').count(),count,label+' labels every occupied input');
  assert.equal(await panel.locator('[data-rw-mixer-port="1"] .mx-socket-badge b').innerText(),'L');
  assert.equal(await panel.locator('[data-rw-mixer-port="2"] .mx-socket-badge b').innerText(),'R');
  if(denseStereo){
    assert.equal(await panel.locator('.mx-stereo-pair').count(),count/2,label+' displays every stereo pair');
    assert.equal(await panel.locator('[data-rw-preamp-pair]').count(),count/2,label+' has one 48 V switch per stereo pair');
    assert.equal(await panel.locator('[data-rw-preamp="3"]').getAttribute('aria-pressed'),'mixed',label+' retains the saved mixed 48 V state');
    assert.equal(await panel.locator('[data-rw-preamp]:not([data-rw-preamp-pair])').count(),0,label+' omits every individual stereo preamp switch');
  }else{
    assert.equal(await panel.locator('[data-rw-preamp="3"]').getAttribute('aria-pressed'),'true');
    assert.equal(await panel.locator('[data-rw-preamp="4"]').getAttribute('aria-pressed'),'false');
  }
  assert.equal(await panel.locator('.mx-stereo-pair[data-rw-stereo-ports="1|2"]').count(),1,label+' joins the stereo input faces');
  assert.equal(await panel.locator('[data-rw-preamp-pair="1|2"]').count(),1,label+' shows one shared stereo 48 V switch');
  const problems=await panel.evaluate(root=>{
    const issues=[],rect=el=>el.getBoundingClientRect();
    // The L/R element reserves a wide centered row. Measure its text width,
    // while retaining the intentional compact line box for vertical placement.
    const textRect=element=>{const range=document.createRange();range.selectNodeContents(element);const text=range.getBoundingClientRect(),line=rect(element);return {left:text.left,right:text.right,top:line.top,bottom:line.bottom,width:text.width,height:line.height};};
    const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    const contains=(outer,inner,tolerance=1.5)=>inner.left>=outer.left-tolerance&&inner.right<=outer.right+tolerance&&inner.top>=outer.top-tolerance&&inner.bottom<=outer.bottom+tolerance;
    const badges=[...root.querySelectorAll('[data-rw-mixer-port] .mx-socket-badge')];
    const lamps=[...root.querySelectorAll('[data-rw-preamp]')];
    for(const badge of badges){
      const input=badge.closest('[data-rw-mixer-port]'),port=input.dataset.rwMixerPort,box=rect(badge),jack=rect(input),style=getComputedStyle(badge);
      const paired=Boolean(input.closest('[data-stereo-pair]'));
      const caption=badge.querySelector('.mx-signal-caption'),glyph=badge.querySelector('.mx-socket-glyph');
      const number=input.querySelector('.mx-input-number');
      if(!caption?.textContent.trim()||!glyph?.textContent.trim()&&!glyph?.querySelector('img,svg'))issues.push('IN '+port+' missing caption or instrument');
      if(caption&&parseFloat(getComputedStyle(caption).fontSize)<9)issues.push('IN '+port+' caption under 9px');
      if(!box.width||!box.height)issues.push('IN '+port+' label hidden');
      if(Math.abs(box.width-box.height)>1)issues.push('IN '+port+' overlay is not square');
      for(const radius of [style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomLeftRadius,style.borderBottomRightRadius])if(radius.endsWith('%')?parseFloat(radius)<48:parseFloat(radius)<Math.min(box.width,box.height)*.48)issues.push('IN '+port+' overlay is not round');
      if(Math.abs(box.x+box.width/2-jack.x-jack.width/2)>1.5||Math.abs(box.y+box.height/2-jack.y-jack.height/2)>1.5)issues.push('IN '+port+' overlay is not centered on its jack');
      if(box.width<jack.width*.84||box.width>jack.width*1.1)issues.push('IN '+port+' overlay does not cover the jack face');
      if(number&&glyph&&overlaps(rect(number),rect(glyph)))issues.push('IN '+port+' number overlaps instrument');
      for(const mark of badge.querySelectorAll('b,.mx-link-symbol')){
        const markBox=mark.matches('b')?textRect(mark):rect(mark);
        if(markBox.width&&markBox.height&&glyph&&overlaps(markBox,rect(glyph)))issues.push('IN '+port+' stereo marker overlaps instrument');
        if(paired&&mark.matches('b')){
          if(parseFloat(getComputedStyle(mark).fontSize)<Math.max(14,jack.width*.28))issues.push('IN '+port+' L/R is too small to identify the stereo side');
          if(!contains(box,markBox))issues.push('IN '+port+' L/R is outside its round face');
          if(caption&&overlaps(markBox,rect(caption)))issues.push('IN '+port+' L/R covers the signal name');
          if(number&&overlaps(markBox,rect(number)))issues.push('IN '+port+' L/R covers the input number');
        }
      }
      for(const lamp of lamps){
        const lampPorts=(lamp.dataset.rwPreampPair||lamp.dataset.rwPreamp).split('|');
        if(lampPorts.includes(port)){
          if(glyph&&overlaps(rect(glyph),rect(lamp)))issues.push('IN '+port+' 48 V control covers instrument');
          if(caption&&overlaps(rect(caption),rect(lamp)))issues.push('IN '+port+' 48 V control covers caption');
        }else if(overlaps(box,rect(lamp)))issues.push('IN '+port+' label overlaps neighbouring 48 V control '+lamp.dataset.rwPreamp);
      }
    }
    for(let i=0;i<badges.length;i++)for(let j=i+1;j<badges.length;j++)if(overlaps(rect(badges[i]),rect(badges[j])))issues.push('labels overlap: '+badges[i].closest('[data-rw-mixer-port]').dataset.rwMixerPort+'/'+badges[j].closest('[data-rw-mixer-port]').dataset.rwMixerPort);
    for(const pair of root.querySelectorAll('.mx-stereo-pair')){
      const ports=(pair.dataset.rwStereoPorts||'').split('|'),pairBox=rect(pair);
      const inputs=ports.map(port=>root.querySelector('[data-rw-mixer-port="'+port+'"]'));
      const link=pair.querySelector('.mx-stereo-link'),power=pair.querySelector('[data-rw-preamp-pair]');
      if(inputs.length!==2||inputs.some(input=>!input)){issues.push('Stereo outline does not identify both input faces');continue;}
      const faces=inputs.map(rect),centerX=(faces[0].left+faces[0].width/2+faces[1].left+faces[1].width/2)/2;
      for(const face of faces)if(!contains(pairBox,{left:face.left+face.width/2,right:face.left+face.width/2,top:face.top+face.height/2,bottom:face.top+face.height/2}))issues.push('Stereo outline does not continuously span both jack centers');
      if(!link||!link.textContent.includes('STEREO')||!link.querySelector('svg'))issues.push('Stereo bridge is missing its STEREO label or chain icon');
      if(!link||!rect(link).width||!rect(link).height)issues.push('Stereo bridge is hidden');
      if(link&&Math.abs(rect(link).left+rect(link).width/2-centerX)>3)issues.push('Stereo bridge is not centered between the faces');
      if(link&&parseFloat(getComputedStyle(link).fontSize)<8)issues.push('STEREO label is too small');
      if(!power){issues.push('Stereo pair has no shared 48 V control');continue;}
      if(Math.abs(rect(power).left+rect(power).width/2-centerX)>3)issues.push('Shared stereo 48 V control is not centered');
      if(link&&rect(link).bottom>rect(power).top+1)issues.push('Stereo bridge overlaps its shared 48 V control');
      for(const input of inputs)if(input.closest('[data-stereo-pair]')?.dataset.stereoPair!==inputs[0].closest('[data-stereo-pair]')?.dataset.stereoPair)issues.push('Stereo input faces do not share their outline identity');
    }
    for(const lamp of lamps)if(!/48\s*V/.test(lamp.textContent))issues.push('48 V is not visibly labelled');
    return issues;
  });
  if(problems.length){
    console.error(label,await panel.locator('[data-rw-mixer-port]').evaluateAll(inputs=>inputs.slice(0,2).map(input=>{
      const jack=input.getBoundingClientRect(),bounds=selector=>{
        const element=input.querySelector(selector);if(!element)return null;
        const box=element.getBoundingClientRect();return {x:box.x-jack.x,y:box.y-jack.y,width:box.width,height:box.height};
      };
      return {port:input.dataset.rwMixerPort,diameter:jack.width,circle:bounds('.mx-socket-badge'),number:bounds('.mx-input-number'),glyph:bounds('.mx-socket-glyph'),caption:bounds('.mx-signal-caption'),side:bounds('b'),link:bounds('.mx-link-symbol')};
    })));
    await panel.screenshot({path:artifactPath('mixer-labels-failure-'+label.replace(/[^a-z0-9]+/gi,'-')+'-'+engine+'.png')});
  }
  assert.deepEqual(problems,[],label);
}

async function checkReadableInputs(panel, label) {
  const undersized=await panel.locator('[data-rw-mixer-port]').evaluateAll(inputs=>inputs.flatMap(input=>{
    const width=input.getBoundingClientRect().width;
    return width<43?[{port:input.dataset.rwMixerPort,width}]:[];
  }));
  assert.deepEqual(undersized,[],label+' keeps physical inputs at a readable width');
}

async function captureStereoPanel(panel, filename) {
  await panel.locator('.mx-stereo-pair').first().scrollIntoViewIfNeeded();
  await panel.screenshot({path:artifactPath(filename)});
}

async function denseStereoFixture(page, model, count, stageboxType='') {
  await fixture(page,model,count);
  const deviceId=stageboxType?'station-1':'@local';
  await page.evaluate(({count,model,stageboxType,deviceId})=>{
    const key='stageplot-studio:workspace:v1',workspace=JSON.parse(localStorage.getItem(key));
    const doc=workspace.entry.document,routing=doc.stage.routing;
    if(stageboxType)doc.objects=[{id:deviceId,type:stageboxType,label:'SD16 · dichte Stereo-Paare',x:1,y:1,angle:0}];
    for(const [i,row] of routing.inputs.entries()){
      const side=i%2?'R':'L';
      Object.assign(row,{instrument:(stageboxType?'E-Gitarre':'Keys')+' '+(Math.floor(i/2)+1)+' · '+side,mode:'Stereo '+side,stereoGroup:'dense-pair-'+Math.floor(i/2)});
      if(stageboxType){row.stagebox=deviceId;row.stageboxPort=i+1;delete row.localPort;}
    }
    routing.userInputs=Array.from({length:32},(_,i)=>i<count?{id:deviceId,port:i+1}:null);
    routing.preampPower=[{device:stageboxType?deviceId:'@local/'+model,port:3}];
    const draftKey='stageplot-studio:drafts:v1',library=JSON.parse(localStorage.getItem(draftKey));
    library.entries[library.entries.findIndex(entry=>entry.id===workspace.entry.id)]=workspace.entry;
    localStorage.setItem(key,JSON.stringify(workspace));localStorage.setItem(draftKey,JSON.stringify(library));
  },{count,model,stageboxType,deviceId});
  await page.reload();
  await page.locator('.sp-steps [data-view="routing"]').click();
  await page.locator('[data-rw-tab="mixer"]').click();
  await page.locator('[data-rw-mixer-device="'+deviceId+'"]').click();
  await settled(page);
}

async function checkDenseStereoFrames(panel,label) {
  const problems=await panel.evaluate(root=>{
    const issues=[],rect=element=>element.getBoundingClientRect();
    const frames=[...root.querySelectorAll('.mx-stereo-pair')].map(pair=>{
      const ports=pair.dataset.rwStereoPorts.split('|'),path=pair.querySelector('.mx-stereo-frame path:last-child');
      if(!path){issues.push('Pair '+ports.join('/')+' has no visible double-ring outline');return null;}
      const box=path.getBBox(),matrix=path.getScreenCTM();
      const corners=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
      const stroke=parseFloat(getComputedStyle(path).strokeWidth),sx=Math.hypot(matrix.a,matrix.b),sy=Math.hypot(matrix.c,matrix.d);
      const paint={left:Math.min(...corners.map(p=>p.x))-stroke*sx/2,right:Math.max(...corners.map(p=>p.x))+stroke*sx/2,top:Math.min(...corners.map(p=>p.y))-stroke*sy/2,bottom:Math.max(...corners.map(p=>p.y))+stroke*sy/2};
      const input=root.querySelector('[data-rw-mixer-port="'+ports[0]+'"]'),face=rect(input);
      return {ports,paint,y:face.top+face.height/2,diameter:face.width};
    }).filter(Boolean);
    for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
      const a=frames[i],b=frames[j];
      if(Math.abs(a.y-b.y)>Math.min(a.diameter,b.diameter)*.5)continue;
      const overlap=Math.min(a.paint.right,b.paint.right)-Math.max(a.paint.left,b.paint.left);
      if(overlap>.75)issues.push('Stereo outlines '+a.ports.join('/')+' and '+b.ports.join('/')+' overlap by '+overlap.toFixed(2)+'px');
    }
    for(const frame of frames)for(const input of root.querySelectorAll('[data-rw-mixer-port]')){
      if(frame.ports.includes(input.dataset.rwMixerPort))continue;
      const face=input.querySelector('.mx-socket-badge');if(!face)continue;
      const bounds=rect(face);if(Math.abs(bounds.top+bounds.height/2-frame.y)>frame.diameter*.25)continue;
      const overlap=Math.min(frame.paint.right,bounds.right)-Math.max(frame.paint.left,bounds.left);
      if(overlap>.75)issues.push('Stereo outline '+frame.ports.join('/')+' enters neighbouring face '+input.dataset.rwMixerPort+' by '+overlap.toFixed(2)+'px');
    }
    return issues;
  });
  if(problems.length)await captureStereoPanel(panel,'mixer-stereo-dense-failure-'+label.replace(/[^a-z0-9]+/gi,'-')+'-'+engine+'.png');
  assert.deepEqual(problems,[],label+' keeps adjacent stereo double rings separate');
}

async function checkDenseStereoLayouts(page) {
  for(const variant of [{name:'x32-local',count:32,stagebox:''},{name:'sd16',count:16,stagebox:'stagebox-behringer-sd16'}]){
    await denseStereoFixture(page,'x32-local',variant.count,variant.stagebox);
    const panel=page.locator('.mx-right .rw-zoom-panel'),before=await savedRouting(page);
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:width===390?844:900});await settled(page);
      const label=variant.name+' dense stereo '+width;
      await checkLabels(panel,variant.count,label,{denseStereo:true});
      await checkDenseStereoFrames(panel,label);
      await captureStereoPanel(panel,'mixer-stereo-dense-'+variant.name+'-'+width+'-'+engine+'.png');
    }
    await page.setViewportSize({width:1440,height:900});await settled(page);
    for(let i=0;i<2;i++)await panel.getByRole('button',{name:'Ansicht vergrößern'}).click();
    await checkLabels(panel,variant.count,variant.name+' dense stereo 200%',{denseStereo:true});
    await checkDenseStereoFrames(panel,variant.name+' dense stereo 200%');
    await captureStereoPanel(panel,'mixer-stereo-dense-'+variant.name+'-zoom-'+engine+'.png');
    assert.deepEqual(await savedRouting(page),before,variant.name+' dense layout checks preserve all stereo routes and preamp states');
  }
}

async function checkFullscreenPreampScroll(page) {
  for(const test of [{model:'x32-local',ports:[1,2],viewport:{width:1440,height:500}},{model:'cdm32',ports:[31,32],viewport:{width:390,height:500}}]){
    if(test.model==='cdm32')await denseStereoFixture(page,test.model,32);
    else await fixture(page,test.model,32);
    await page.setViewportSize(test.viewport);await settled(page);
    const panel=page.locator('.mx-right .rw-zoom-panel'),before=await savedRouting(page);
    await panel.locator('[data-panel-expand]').click();
    const fullscreen=page.locator('.rw-panel-fullscreen:modal'),control=()=>fullscreen.locator('[data-rw-preamp-pair="'+test.ports.join('|')+'"]');
    const scroll=()=>fullscreen.locator('.sp-stagebox-device-scroll').evaluate(view=>({left:view.scrollLeft,top:view.scrollTop}));
    await control().scrollIntoViewIfNeeded();await settled(page);
    const positioned=await scroll();
    assert(positioned.left>30,test.model+' shared preamp fixture uses horizontal scrolling');
    if(test.model==='cdm32')assert(positioned.top>30,'CDM32 bottom stereo pair also requires vertical scrolling');
    for(const enabled of [true,false]){
      const previous=await scroll();
      await control().click();
      await page.waitForFunction(({model,ports,enabled})=>{
        const power=JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.preampPower||[];
        return ports.every(port=>power.some(entry=>entry.device==='@local/'+model&&entry.port===port)===enabled);
      },{model:test.model,ports:test.ports,enabled});
      await settled(page);
      const current=await scroll();
      if(Math.abs(current.left-previous.left)>1||Math.abs(current.top-previous.top)>1)await fullscreen.screenshot({path:artifactPath('mixer-stereo-'+test.model+'-fullscreen-power-scroll-failure-'+engine+'.png')});
      assert(Math.abs(current.left-previous.left)<=1&&Math.abs(current.top-previous.top)<=1,test.model+' fullscreen shared 48 V '+(enabled?'on':'off')+' keeps both scroll axes stable: '+JSON.stringify({previous,current}));
      const view=await fullscreen.locator('.sp-stagebox-device-scroll').boundingBox(),button=await control().boundingBox();
      assert(button.x>=view.x-1&&button.x+button.width<=view.x+view.width+1&&button.y>=view.y-1&&button.y+button.height<=view.y+view.height+1,test.model+' shared 48 V control remains in view after switching');
      if(enabled)await fullscreen.screenshot({path:artifactPath('mixer-stereo-'+test.model+'-fullscreen-power-scroll-'+engine+'.png')});
    }
    assert.deepEqual(await savedRouting(page),before,test.model+' fullscreen power checks preserve all signal routing');
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:1440,height:900});await settled(page);
  }
}

async function openGenericStagebox(page) {
  await page.reload();
  await page.locator('.sp-steps [data-view="routing"]').click();
  await page.locator('[data-rw-tab="mixer"]').click();
  await page.locator('[data-rw-mixer-device="station-1"]').click();
  await settled(page);
}

async function genericStageboxFixture(page,count) {
  await fixture(page,'x32-local',count);
  await page.evaluate(count=>{
    const key='stageplot-studio:workspace:v1',workspace=JSON.parse(localStorage.getItem(key)),doc=workspace.entry.document;
    doc.objects=[{id:'station-1',type:'stagebox-'+count,label:'Generische Stagebox '+count,x:1,y:1,angle:0}];
    for(const [i,row] of doc.stage.routing.inputs.entries()){
      row.stagebox='station-1';row.stageboxPort=i+1;delete row.localPort;
    }
    doc.stage.routing.userInputs=Array.from({length:32},(_,i)=>i<count?{id:'station-1',port:i+1}:null);
    doc.stage.routing.preampPower=[{device:'station-1',port:3}];
    const draftKey='stageplot-studio:drafts:v1',library=JSON.parse(localStorage.getItem(draftKey));
    library.entries[library.entries.findIndex(entry=>entry.id===workspace.entry.id)]=workspace.entry;
    localStorage.setItem(key,JSON.stringify(workspace));localStorage.setItem(draftKey,JSON.stringify(library));
  },count);
  await openGenericStagebox(page);
  // Persist the changed physical device through the same app normalizer used by real drafts.
  const mono=page.locator('.mx-right [data-rw-preamp="3"]');
  for(const enabled of [false,true]){
    await mono.click();
    await page.waitForFunction(enabled=>{
      const power=JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.preampPower||[];
      return power.some(entry=>entry.device==='station-1'&&entry.port===3)===enabled;
    },enabled);
  }
  await settled(page);
}

async function checkGenericCards(surface,count,label) {
  assert.equal(await surface.locator('.mx-local-port .mx-socket-badge').count(),count,label+' shows all occupied signals');
  const problems=await surface.evaluate(root=>{
    const issues=[],rect=element=>element.getBoundingClientRect();
    const inside=(outer,inner)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
    const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    const cards=[...root.querySelectorAll('.mx-local-port')],lamps=[...root.querySelectorAll('[data-rw-preamp]')];
    for(const card of cards){
      const port=card.dataset.rwMixerPort||card.dataset.rwMixerUserPort,badge=card.querySelector('.mx-socket-badge');
      if(!badge){issues.push('IN '+port+' is missing its signal badge');continue;}
      const badgeBox=rect(badge),cardBox=rect(card),glyph=badge.querySelector('.mx-socket-glyph'),caption=badge.querySelector('.mx-signal-caption');
      if(!inside(cardBox,badgeBox))issues.push('IN '+port+' badge escapes its card');
      if(!glyph||!caption?.textContent.trim()){issues.push('IN '+port+' is missing its instrument or signal name');continue;}
      for(const [name,element] of [['instrument',glyph],['caption',caption],...([...badge.querySelectorAll('b,.mx-link-symbol')].filter(element=>!element.matches('.mx-link-symbol')||getComputedStyle(element).display!=='none').map(element=>['stereo marker',element]))]){
        const bounds=rect(element);
        if(!bounds.width||!bounds.height){issues.push('IN '+port+' '+name+' is hidden');continue;}
        if(!inside(badgeBox,bounds)||!inside(cardBox,bounds))issues.push('IN '+port+' '+name+' escapes its badge/card');
        for(const lamp of lamps)if(overlaps(bounds,rect(lamp)))issues.push('IN '+port+' '+name+' overlaps 48 V '+lamp.dataset.rwPreamp);
        for(const neighbour of cards)if(neighbour!==card&&overlaps(bounds,rect(neighbour)))issues.push('IN '+port+' '+name+' enters another input card');
      }
      if(overlaps(rect(glyph),rect(caption)))issues.push('IN '+port+' instrument and caption overlap');
      if(!glyph.textContent.trim()&&!glyph.querySelector('img,svg'))issues.push('IN '+port+' instrument is empty');
      for(const text of [caption,...[...badge.querySelectorAll('b,.mx-link-symbol')].filter(element=>getComputedStyle(element).display!=='none')]){
        const font=parseFloat(getComputedStyle(text).fontSize);
        if(font<9||font>20)issues.push('IN '+port+' text has an unreadable generic-card font size '+font+'px');
      }
    }
    for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)if(overlaps(rect(cards[i]),rect(cards[j])))issues.push('Input cards overlap');
    return issues;
  });
  if(problems.length)await surface.screenshot({path:artifactPath('mixer-generic-failure-'+label.replace(/[^a-z0-9]+/gi,'-')+'-'+engine+'.png')});
  assert.deepEqual(problems,[],label);
}

async function checkGenericPreampAction(page) {
  const before=await savedRouting(page),control=port=>page.locator('.mx-right [data-rw-preamp="'+port+'"]');
  const waitForPair=enabled=>page.waitForFunction(enabled=>{
    const power=JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.preampPower||[];
    return [1,2].every(port=>power.some(entry=>entry.device==='station-1'&&entry.port===port)===enabled);
  },enabled);
  await control(1).click();await waitForPair(true);
  for(const port of [1,2,3])assert.equal(await control(port).getAttribute('aria-pressed'),'true','Generic 48 V reflects both stereo sockets and the independent powered mono input');
  assert.equal(await control(4).getAttribute('aria-pressed'),'false');
  await openGenericStagebox(page);await waitForPair(true);
  for(const port of [1,2])assert.equal(await control(port).getAttribute('aria-pressed'),'true','Generic stereo 48 V survives reload');
  await control(2).click();await waitForPair(false);
  assert.deepEqual(await savedRouting(page),before,'Generic stereo 48 V changes both physical keys while preserving signal names and mono preamps');
}

async function checkGenericStageboxes(page) {
  for(const count of [8,16,32]){
    await genericStageboxFixture(page,count);
    await checkGenericPreampAction(page);
    const before=await savedRouting(page),panel=page.locator('.mx-right .rw-zoom-panel');
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:width===390?844:900});await settled(page);
      const label='stagebox-'+count+' '+width;
      await checkGenericCards(panel,count,label+' mixer');
      await panel.screenshot({path:artifactPath('mixer-generic-'+count+'-'+width+'-'+engine+'.png')});
      await panel.locator('[data-panel-expand]').click();await settled(page);
      const fullscreen=page.locator('.rw-panel-fullscreen:modal');
      await checkGenericCards(fullscreen,count,label+' mixer fullscreen');
      await fullscreen.screenshot({path:artifactPath('mixer-generic-'+count+'-'+width+'-fullscreen-'+engine+'.png')});
      await page.keyboard.press('Escape');
      await page.locator('[data-rw-mixer-user-slot="1"]').click();
      await page.locator('[data-rw-mixer-user-device="station-1"]').click();await settled(page);
      const picker=page.locator('.mx-picker:modal');
      await checkGenericCards(picker,count,label+' User In picker');
      await assertNoOverflow(page,'.mx-picker:modal',label+' User In picker');
      await picker.screenshot({path:artifactPath('mixer-generic-'+count+'-'+width+'-picker-'+engine+'.png')});
      await picker.locator('[data-panel-expand]').click();await settled(page);
      await checkGenericCards(page.locator('.rw-panel-fullscreen:modal'),count,label+' User In fullscreen');
      await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:1440,height:900});await settled(page);
    assert.deepEqual(await savedRouting(page),before,'Generic stagebox-'+count+' view checks preserve the saved routing');
  }
}

async function checkPreampAction(page, panel, model) {
  const before=await savedRouting(page),control=()=>panel.locator('[data-rw-preamp="4"]');
  assert.equal(await control().getAttribute('aria-pressed'),'false');
  await control().click();
  assert.equal(await page.locator('.mx-picker:modal').count(),0,model+' 48 V click does not open the jack picker');
  await page.waitForFunction(model=>JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.preampPower?.some(entry=>entry.device==='@local/'+model&&entry.port===4),model);
  assert.equal(await control().getAttribute('aria-pressed'),'true');
  if(model==='x32-local'){
    await page.reload();
    await page.locator('.sp-steps [data-view="routing"]').click();
    await page.locator('[data-rw-tab="mixer"]').click();
    await page.locator('[data-rw-mixer-device="@local"]').click();
    await settled(page);
    assert.equal(await control().getAttribute('aria-pressed'),'true','Physical 48 V state survives reloading the project');
  }
  await control().click();
  assert.equal(await page.locator('.mx-picker:modal').count(),0,model+' turning 48 V off does not open the jack picker');
  await page.waitForFunction(model=>!JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.preampPower?.some(entry=>entry.device==='@local/'+model&&entry.port===4),model);
  assert.deepEqual(await savedRouting(page),before,model+' 48 V controls preserve signal names, phantom requirements and routing');
}

async function checkStereoPreampAction(page, panel, model) {
  const before=await savedRouting(page),control=()=>panel.locator('[data-rw-preamp-pair]');
  const waitForPair=enabled=>page.waitForFunction(({model,enabled})=>{
    const power=JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.preampPower||[];
    return [1,2].every(port=>power.some(entry=>entry.device==='@local/'+model&&entry.port===port)===enabled);
  },{model,enabled});
  assert.equal(await control().count(),1,model+' stereo inputs share one 48 V control');
  for(const port of [1,2])assert.equal(await panel.locator('[data-rw-preamp="'+port+'"]:not([data-rw-preamp-pair])').count(),0,model+' paired input '+port+' omits its individual 48 V control');
  assert.equal(await control().getAttribute('aria-pressed'),'false');
  await control().click();
  await waitForPair(true);
  assert.equal(await control().getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.mx-picker:modal').count(),0,model+' shared 48 V click does not open the jack picker');
  const activePaint=await control().evaluate(element=>{const style=getComputedStyle(element);return style.backgroundColor+' '+style.backgroundImage;});
  const colors=(activePaint.match(/rgba?\([^)]+\)/g)||[]).map(color=>color.match(/[\d.]+/g).map(Number));
  assert(colors.some(rgb=>rgb[0]>120&&rgb[0]>rgb[1]*1.25&&rgb[0]>rgb[2]*1.25&&(rgb.length<4||rgb[3]>.8)),model+' active shared 48 V control is visibly red ('+activePaint+')');
  const expected=structuredClone(before);
  expected.preampPower=[...expected.preampPower,...[1,2].map(port=>({device:'@local/'+model,port}))];
  const bySocket=entries=>[...entries].sort((a,b)=>a.device.localeCompare(b.device)||a.port-b.port);
  const after=await savedRouting(page);
  assert.deepEqual({...after,preampPower:bySocket(after.preampPower)},{...expected,preampPower:bySocket(expected.preampPower)},model+' shared switch changes both physical sockets while preserving the independent mono input and routing');
  const tools=page.locator('[data-rw-tools]');
  if(await tools.getAttribute('aria-expanded')!=='true')await tools.click();
  await page.locator('[data-rw-tool="undo"]').click();
  await waitForPair(false);
  assert.deepEqual(await savedRouting(page),before,model+' one undo restores both stereo preamps together');
  if(await tools.getAttribute('aria-expanded')==='true')await tools.click();
  await control().click();
  await waitForPair(true);
  if(model==='x32-local'){
    await page.reload();
    await page.locator('.sp-steps [data-view="routing"]').click();
    await page.locator('[data-rw-tab="mixer"]').click();
    await page.locator('[data-rw-mixer-device="@local"]').click();
    await settled(page);
    assert.equal(await control().getAttribute('aria-pressed'),'true','The shared stereo 48 V control retains both physical states after reload');
    await waitForPair(true);
    await captureStereoPanel(panel,'mixer-stereo-shared-48v-active-'+engine+'.png');
  }
  await control().click();
  await waitForPair(false);
  assert.deepEqual(await savedRouting(page),before,model+' switching shared 48 V off restores the original project routing');
}

(async()=>{
  const browser=await launchBrowser();
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},colorScheme:'light'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.APP_URL);
    await page.locator('[data-project-add]').click();
    await page.locator('#sp-np-band').fill('Mixer Signalbezeichnungen QA');
    await page.locator('#sp-np-create').click();
    await page.waitForFunction(()=>localStorage.getItem('stageplot-studio:workspace:v1'));
    const genericOnly=process.env.MIXER_LABELS_GENERIC_ONLY==='1',denseOnly=process.env.MIXER_LABELS_DENSE_ONLY==='1';
    for(const [model,count] of genericOnly||denseOnly?[]:Object.entries(consoles)){
      await fixture(page,model,count);
      const panel=page.locator('.mx-right .rw-zoom-panel'),before=await savedRouting(page);
      await checkLabels(panel,count,model+' 100%');
      await checkPreampAction(page,panel,model);
      await checkStereoPreampAction(page,panel,model);
      await captureStereoPanel(panel,'mixer-labels-'+model+'-'+engine+'.png');
      await panel.locator('[data-panel-expand]').click();
      await checkLabels(page.locator('.rw-panel-fullscreen:modal'),count,model+' fullscreen');
      await captureStereoPanel(page.locator('.rw-panel-fullscreen:modal'),'mixer-labels-'+model+'-fullscreen-'+engine+'.png');
      await page.keyboard.press('Escape');
      for(const viewport of fullscreenViewports){
        await page.setViewportSize(viewport);
        await settled(page);
        await panel.locator('[data-panel-expand]').click();
        await settled(page);
        const fullscreen=page.locator('.rw-panel-fullscreen:modal'),label=model+' fullscreen '+viewport.width+'x'+viewport.height;
        await checkLabels(fullscreen,count,label);
        await checkReadableInputs(fullscreen,label);
        await captureStereoPanel(fullscreen,'mixer-labels-'+model+'-fullscreen-'+viewport.width+'x'+viewport.height+'-'+engine+'.png');
        await page.keyboard.press('Escape');
      }
      await page.setViewportSize({width:1440,height:900});
      await settled(page);
      if(['x32-local','cdm32','ui24r'].includes(model)){
        for(let i=0;i<2;i++)await panel.getByRole('button',{name:'Ansicht vergrößern'}).click();
        await checkLabels(panel,count,model+' 200%');
        for(let i=0;i<2;i++)await panel.getByRole('button',{name:'Ansicht verkleinern'}).click();
      }
      await page.setViewportSize({width:390,height:844});
      await settled(page);
      await checkLabels(panel,count,model+' mobile');
      await assertNoOverflow(page,'#sp-routing-workspace-v2',model+' mobile workspace');
      await captureStereoPanel(panel,'mixer-labels-'+model+'-mobile-'+engine+'.png');
      await panel.locator('[data-panel-expand]').click();
      await settled(page);
      await checkLabels(page.locator('.rw-panel-fullscreen:modal'),count,model+' mobile fullscreen');
      await captureStereoPanel(page.locator('.rw-panel-fullscreen:modal'),'mixer-labels-'+model+'-mobile-fullscreen-'+engine+'.png');
      await page.keyboard.press('Escape');
      if(['x32-local','cdm32','ui24r'].includes(model)){
        await page.locator('#sp-settings-gear').click();
        await page.locator('[data-theme-choice="dark"]').click();
        await page.locator('#sp-settings-close').click();
        await settled(page);
        await checkLabels(panel,count,model+' dark');
        await page.setViewportSize({width:1440,height:900});
        await settled(page);
        await page.locator('#sp-settings-gear').click();
        await page.locator('[data-theme-choice="light"]').click();
        await page.locator('#sp-settings-close').click();
      }
      await page.setViewportSize({width:1440,height:900});
      await settled(page);
      assert.deepEqual(await savedRouting(page),before,model+' view changes preserve saved routing and preamp state');
    }
    if(!genericOnly){await checkDenseStereoLayouts(page);await checkFullscreenPreampScroll(page);}
    if(!denseOnly)await checkGenericStageboxes(page);
    assert.deepEqual(errors,[]);
    console.log('PASS: '+(genericOnly?'Generic 8/16/32-input stagebox cards in mixer, User In and fullscreen at desktop/mobile sizes, with shared physical 48 V and reload':denseOnly?'Dense X32/SD16 stereo rings and stable fullscreen 48 V scrolling on X32/CDM32':'Variant B stereo rings and large L/R on all 14 consoles; shared physical 48 V, one-step undo, reload, independent mono controls, zoom, fullscreen at 800/1024/1280px and 1440x500, mobile, dense X32/SD16 pairs, stable fullscreen preamp scrolling, and generic stagebox cards')+' ('+engine+').');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
