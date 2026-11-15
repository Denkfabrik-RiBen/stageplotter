// Keyboard and gesture regressions use an isolated synthetic project.
const assert=require('node:assert/strict');
const {engine,launchBrowser,artifactPath,assertNoOverflow}=require('./browser-qa.cjs');
const modifier=process.platform==='darwin'?'Meta':'Control';
(async()=>{
  const browser=await launchBrowser();
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.APP_URL||'http://127.0.0.1:8872/');
    await page.waitForLoadState('load');
    assert.deepEqual(await page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name).filter(name=>name.includes('/stageplot-assets/percussion/'))),[],'An empty start downloads no percussion images');
    await page.locator('[data-project-add]').first().click();await page.locator('#sp-np-band').fill('Editor UX QA');await page.locator('#sp-np-create').click();
    await page.waitForFunction(()=>localStorage.getItem('stageplot-studio:workspace:v1'));
    await page.evaluate(()=>{
      const workspace=JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')),drafts=JSON.parse(localStorage.getItem('stageplot-studio:drafts:v1'));
      workspace.entry.document.objects=[{id:'ux-kit',type:'drums',label:'UX Drums',x:4,y:3,angle:0,drums:{side:true,sideDiameter:14,table:'laptop'}},{id:'ux-box',type:'stagebox-behringer-s16',label:'UX Stagebox',x:1,y:1,angle:0}];
      drafts.entries[drafts.entries.findIndex(entry=>entry.id===workspace.entry.id)]=workspace.entry;
      localStorage.setItem('stageplot-studio:workspace:v1',JSON.stringify(workspace));localStorage.setItem('stageplot-studio:drafts:v1',JSON.stringify(drafts));
    });
    await page.reload();await page.locator('.sp-steps [data-view="editor"]').click();
    await page.locator('#sp-editor-floor [data-object][aria-label="UX Drums"]').first().click();await page.locator('#sp-object-menu-open').click();
    await page.locator('#sp-object-menu').getByRole('button',{name:'Drum Designer',exact:true}).click();
    assert(await page.locator('#sp-drum-palette [data-drum-add^="extra-"]').count()>10,'Percussion palette is built when the designer opens');
    const templates=page.locator('#sp-drum-template-details');
    assert.equal(await templates.evaluate(el=>el.open),false,'Reusable templates start collapsed');
    await page.locator('[data-drum-part="side"]').first().click({force:true});
    const sideSmaller=page.locator('[data-drum-size-path="sideDiameter"][data-drum-size-step="-1"]');
    await sideSmaller.click();
    const sideSize=()=>page.locator('[data-drum-size-path="sideDiameter"]').first().locator('..').innerText();
    assert.match(await sideSize(),/13″/);
    await templates.locator('summary').click();
    const name=page.locator('#sp-drum-design-name');await name.focus();await name.press('End');await name.pressSequentially(' Text');
    const typed=await name.inputValue();await name.press(modifier+'+z');
    assert.notEqual(await name.inputValue(),typed,'Undo inside the name field undoes text');
    assert.match(await sideSize(),/13″/,'Text undo does not revert the drumset');
    await templates.locator('summary').click();

    await page.locator('[data-drum-part="table"]').first().click({force:true});
    const patch=(id,field)=>page.locator('[data-drum-laptop="'+id+'"][data-drum-laptop-field="'+field+'"]');
    await patch('laptop-l','number').focus();await patch('laptop-l','number').fill('31');await page.keyboard.press('Tab');
    assert(await patch('laptop-l','stagebox').evaluate(el=>document.activeElement===el),'Tab from the channel number reaches the stagebox');
    // Headless macOS does not open native select menus with arrow keys. Keep
    // real Tab navigation and trigger the native field's selection/change.
    await patch('laptop-l','stagebox').selectOption({label:'UX Stagebox'});
    assert(await patch('laptop-l','stagebox').evaluate(el=>document.activeElement===el),'Choosing the stagebox retains field focus');
    assert.notEqual(await patch('laptop-l','stagebox').inputValue(),'','The selection chooses a stagebox');
    await page.keyboard.press('Tab');
    assert(await patch('laptop-l','port').evaluate(el=>document.activeElement===el),'Next Tab reaches the socket field');
    await patch('laptop-l','port').selectOption('1');await page.keyboard.press('Tab');
    assert(await page.locator('#sp-drum-dialog').evaluate(el=>el.contains(document.activeElement)),'The laptop field sequence remains in the dialog');

    await page.locator('[data-drum-part="side"]').first().click({force:true});
    const angle=page.locator('[data-drum-angle-value]'),dial=page.locator('[data-drum-angle-dial]');
    const geometry=()=>page.locator('#sp-drum-preview g[data-equipment] > g[data-part="side"]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('transform')));
    await angle.fill('37');await angle.press('Tab');assert.equal(await angle.inputValue(),'37');
    const at37=await geometry();assert(at37.some(value=>value&&/rotate\(37\b/.test(value)),'Exact angle updates the drawn instrument');
    async function beginDrag(){
      const rect=await dial.boundingBox(),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2,r=Math.min(rect.width,rect.height)*.38;
      await dial.evaluate(el=>el.addEventListener('pointerdown',event=>{window.__uxPointerId=event.pointerId;},{once:true}));
      await page.mouse.move(cx,cy-r);await page.mouse.down();await page.mouse.move(cx+r,cy,{steps:5});
    }
    await beginDrag();assert.notDeepEqual(await geometry(),at37,'The instrument rotates before pointer release');
    await page.keyboard.press('Escape');await page.mouse.up();
    assert(await page.locator('#sp-drum-dialog').isVisible(),'Escape cancels rotation without closing the designer');
    assert.deepEqual(await geometry(),at37,'Escape restores the previous angle');
    await beginDrag();
    await dial.dispatchEvent('pointercancel',{pointerId:await page.evaluate(()=>window.__uxPointerId),pointerType:'mouse',bubbles:true});await page.mouse.up();
    assert.deepEqual(await geometry(),at37,'A canceled pointer restores the previous angle');
    await beginDrag();const beforeRelease=await geometry();await page.mouse.up();
    assert.deepEqual(await geometry(),beforeRelease,'Releasing the pointer keeps the previewed angle');
    await page.locator('#sp-drum-undo').click();assert.deepEqual(await geometry(),at37,'One undo removes the entire drag gesture');
    await page.locator('[data-drum-part="side"]').first().click({force:true});
    for(const [key,expected] of [['ArrowRight',38],['ArrowLeft',36],['Shift+ArrowRight',52],['Home',0]]){
      await dial.focus();await dial.press(key);
      assert.equal(await angle.inputValue(),String(expected),'Dial keyboard '+key+' updates the exact angle');
      assert.equal(await dial.getAttribute('aria-valuenow'),String(expected),'The dial announces its current angle');
      await page.locator('#sp-drum-undo').click();assert.deepEqual(await geometry(),at37,'One undo restores the angle before '+key);
      await page.locator('[data-drum-part="side"]').first().click({force:true});
    }
    await page.screenshot({path:artifactPath('editor-ux-drum-'+engine+'.png')});
    await page.locator('#sp-drum-cancel').click();

    await page.setViewportSize({width:390,height:670});await page.locator('.sp-steps [data-view="dashboard"]').click();
    await page.locator('#sp-dashboard').evaluate(el=>el.scrollTop=0);
    await assertNoOverflow(page,'#sp-dashboard','Compact project dashboard');
    const primary=await page.locator('[data-project-open]').first().boundingBox(),footer=await page.locator('.sp-footer').boundingBox();
    assert(primary&&primary.y>=0&&primary.y+primary.height<=(footer?.y??670)+1,'The first existing project opens without scrolling on a 390×670 display');
    await page.screenshot({path:artifactPath('editor-ux-dashboard-mobile-'+engine+'.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS '+engine+': native text undo, laptop keyboard focus, exact/live/cancelable rotation, keyboard angle steps and Home, one-step gesture undo, collapsed templates and immediately reachable mobile project.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
