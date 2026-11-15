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

async function checkLabels(panel, count, label) {
  assert.equal(await panel.locator('[data-rw-mixer-port] .mx-socket-badge').count(),count,label+' labels every occupied input');
  assert.equal(await panel.locator('[data-rw-mixer-port="1"] .mx-socket-badge b').innerText(),'L');
  assert.equal(await panel.locator('[data-rw-mixer-port="2"] .mx-socket-badge b').innerText(),'R');
  assert.equal(await panel.locator('[data-rw-preamp="3"]').getAttribute('aria-pressed'),'true');
  assert.equal(await panel.locator('[data-rw-preamp="4"]').getAttribute('aria-pressed'),'false');
  const problems=await panel.evaluate(root=>{
    const issues=[],rect=el=>el.getBoundingClientRect();
    const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    const badges=[...root.querySelectorAll('[data-rw-mixer-port] .mx-socket-badge')];
    const lamps=[...root.querySelectorAll('[data-rw-preamp]')];
    for(const badge of badges){
      const input=badge.closest('[data-rw-mixer-port]'),port=input.dataset.rwMixerPort,box=rect(badge),jack=rect(input),style=getComputedStyle(badge);
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
      for(const mark of badge.querySelectorAll('b,.mx-link-symbol'))if(glyph&&overlaps(rect(mark),rect(glyph)))issues.push('IN '+port+' stereo marker overlaps instrument');
      for(const lamp of lamps){
        if(lamp.dataset.rwPreamp===port){
          if(glyph&&overlaps(rect(glyph),rect(lamp)))issues.push('IN '+port+' 48 V control covers instrument');
          if(caption&&overlaps(rect(caption),rect(lamp)))issues.push('IN '+port+' 48 V control covers caption');
        }else if(overlaps(box,rect(lamp)))issues.push('IN '+port+' label overlaps neighbouring 48 V control '+lamp.dataset.rwPreamp);
      }
    }
    for(let i=0;i<badges.length;i++)for(let j=i+1;j<badges.length;j++)if(overlaps(rect(badges[i]),rect(badges[j])))issues.push('labels overlap: '+badges[i].closest('[data-rw-mixer-port]').dataset.rwMixerPort+'/'+badges[j].closest('[data-rw-mixer-port]').dataset.rwMixerPort);
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
    for(const [model,count] of Object.entries(consoles)){
      await fixture(page,model,count);
      const panel=page.locator('.mx-right .rw-zoom-panel'),before=await savedRouting(page);
      await checkLabels(panel,count,model+' 100%');
      await checkPreampAction(page,panel,model);
      await panel.locator('[data-panel-expand]').click();
      await checkLabels(page.locator('.rw-panel-fullscreen:modal'),count,model+' fullscreen');
      if(['x32-local','cdm32','ui24r'].includes(model))await page.locator('.rw-panel-fullscreen:modal').screenshot({path:artifactPath('mixer-labels-'+model+'-fullscreen-'+engine+'.png')});
      await page.keyboard.press('Escape');
      for(const viewport of fullscreenViewports){
        await page.setViewportSize(viewport);
        await settled(page);
        await panel.locator('[data-panel-expand]').click();
        await settled(page);
        const fullscreen=page.locator('.rw-panel-fullscreen:modal'),label=model+' fullscreen '+viewport.width+'x'+viewport.height;
        await checkLabels(fullscreen,count,label);
        await checkReadableInputs(fullscreen,label);
        if(model==='x32-local'&&(viewport.width===800||viewport.height===500))await fullscreen.screenshot({path:artifactPath('mixer-labels-'+model+'-fullscreen-'+viewport.width+'x'+viewport.height+'-'+engine+'.png')});
        await page.keyboard.press('Escape');
      }
      await page.setViewportSize({width:1440,height:900});
      await settled(page);
      if(['x32-local','cdm32','ui24r'].includes(model)){
        await panel.screenshot({path:artifactPath('mixer-labels-'+model+'-'+engine+'.png')});
        for(let i=0;i<2;i++)await panel.getByRole('button',{name:'Ansicht vergrößern'}).click();
        await checkLabels(panel,count,model+' 200%');
        for(let i=0;i<2;i++)await panel.getByRole('button',{name:'Ansicht verkleinern'}).click();
        await page.setViewportSize({width:390,height:844});
        await settled(page);
        await checkLabels(panel,count,model+' mobile');
        await assertNoOverflow(page,'#sp-routing-workspace-v2',model+' mobile workspace');
        await panel.screenshot({path:artifactPath('mixer-labels-'+model+'-mobile-'+engine+'.png')});
        await panel.locator('[data-panel-expand]').click();
        await settled(page);
        await checkLabels(page.locator('.rw-panel-fullscreen:modal'),count,model+' mobile fullscreen');
        await page.keyboard.press('Escape');
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
        await settled(page);
      }
      assert.deepEqual(await savedRouting(page),before,model+' view changes preserve saved routing and preamp state');
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: mixer signal labels on all 14 consoles, occupied mono/stereo inputs, 48 V, zoom, fullscreen at 800/1024/1280px and 1440x500, and mobile ('+engine+').');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
