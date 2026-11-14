// Offline end-to-end check using synthetic mixer data, never a user's scene.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {engine, launchBrowser, artifactPath, assertNoOverflow} = require('./browser-qa.cjs');

const channelLinks = Array.from({length:16}, (_, index) => index === 1 ? 'ON' : 'OFF');
const busLinks = Array.from({length:8}, (_, index) => index === 1 ? 'ON' : 'OFF');
const scene = '\uFEFF' + [
  '#4.0# "QA Scene" "" %000000000 1   ',
  '/config/chlink ' + channelLinks.join(' '),
  '/config/buslink ' + busLinks.join(' '),
  '/config/routing REC',
  '/config/routing/IN AN1-8 AN9-16 A1-8 A9-16 AUX1-4',
  '/ch/01/config   "KICK" 3 BL 1',
  '/ch/02/config "" 1 OFF 2',
  '/ch/03/config "KEYS L" 1 RD 3',
  '/ch/04/config "" 1 RD 4',
  '/ch/01/preamp +0.0 OFF ON 24 20',
  '/ch/01/eq ON',
  '/ch/01/eq/1 PEQ 124.7 +0.00 2.0',
  '/ch/01/dyn OFF COMP PEAK LOG 0.0 3.0 1 0.00 10 10.0 151 POST 0 100 OFF',
  '/ch/01/mix ON -7.5 +0 ON -0.0 OFF -oo',
  '/ch/01/mix/01 ON -12.5 +0 EQ-> 0',
  '/bus/01/config "MON 1" 63 YE',
  '/bus/03/config "IEM L" 53 BL',
  '/bus/04/config "IEM R" 53 BL',
  '/outputs/main/01 4 POST OFF',
  '/headamp/000 +24.0 ON',
  '/future/setting "Keep this unknown setting" 17',
  '',
].join('\r\n');
const filename = 'qa-private-console.scn';
const storedDocument = page => page.evaluate(() => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document);
function comparable(document) {
  const result = structuredClone(document);
  if (result.stage.routing) delete result.stage.routing.generatedAt;
  return result;
}
async function waitSaved(page) {
  await page.waitForFunction(() => document.querySelector('#sp-header-draft-status').textContent === 'Lokal gespeichert');
}
async function openScene(page) {
  if (!(await page.locator('[data-rw-tool="x32Scene"]').first().isVisible())) await page.locator('[data-rw-tools]').click();
  await page.locator('[data-rw-tool="x32Scene"]').first().click();
  await page.locator('#sp-x32-dialog').waitFor({state:'visible'});
}
async function routingTool(page, name) {
  if (!(await page.locator('[data-rw-tool="' + name + '"]').first().isVisible())) await page.locator('[data-rw-tools]').click();
  await page.locator('[data-rw-tool="' + name + '"]').first().click();
}
async function importSelectedScene(page) {
  if (await page.locator('#sp-x32-mode').inputValue() === 'routing') {
    for (let step = 0; step < 3; step++) await page.locator('#sp-x32-next').click();
  }
  await page.locator('#sp-x32-import').click();
}
async function downloadScene(page) {
  await page.locator('#sp-x32-export').click();
  await page.waitForFunction(() => {
    const button = document.querySelector('#sp-x32-download');
    return button && !button.disabled && !button.hidden;
  });
  const event = page.waitForEvent('download');
  await page.locator('#sp-x32-download').click();
  const download = await event;
  assert.match(download.suggestedFilename(), /\.scn$/i);
  return fs.readFile(await download.path(), 'utf8');
}

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}, acceptDownloads:true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:8898/');
    await page.locator('[data-project-add]').click();
    await page.locator('#sp-np-band').fill('QA X32');
    await page.locator('#sp-np-create').click();
    await waitSaved(page);
    await page.locator('.sp-steps [data-view="routing"]').click();
    await openScene(page);

    const originalDocument = comparable(await storedDocument(page));
    await page.locator('#sp-x32-file').setInputFiles({name:'invalid.scn',mimeType:'text/plain',buffer:Buffer.from('This is not a mixer scene.\n')});
    await page.locator('#sp-x32-error').waitFor({state:'visible'});
    assert((await page.locator('#sp-x32-error').textContent()).trim(), 'Invalid scene explains why it cannot be imported');
    assert.deepEqual(comparable(await storedDocument(page)), originalDocument, 'Invalid scene never changes local project data');

    await page.locator('#sp-x32-file').setInputFiles({name:'invalid-utf8.scn',mimeType:'text/plain',buffer:Buffer.from([0xC3,0x28])});
    await page.waitForFunction(() => {
      const error = document.querySelector('#sp-x32-error');
      return !error.hidden && /UTF.?8|encoded data|encoding/i.test(error.textContent);
    });
    assert.deepEqual(comparable(await storedDocument(page)), originalDocument, 'Malformed UTF-8 is rejected without inserting replacement characters or changing the project');

    await page.locator('#sp-x32-file').setInputFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from(scene)});
    await page.locator('#sp-x32-wizard').waitFor({state:'visible'});
    await page.locator('#sp-x32-mode').selectOption('routing');
    assert.deepEqual(comparable(await storedDocument(page)), originalDocument, 'Selecting and previewing a valid scene does not apply it');
    await page.locator('#sp-x32-close').click();
    assert.deepEqual(comparable(await storedDocument(page)), originalDocument, 'Closing the preview leaves the project untouched');

    await openScene(page);
    await page.locator('#sp-x32-file').setInputFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from(scene)});
    await page.locator('#sp-x32-wizard').waitFor({state:'visible'});
    await page.locator('#sp-x32-mode').selectOption('template');
    assert.equal(await page.locator('[data-x32-input-id]').count(), 0, 'Template mode has no irrelevant input selection');
    assert(await page.locator('#sp-x32-step-progress').isHidden(), 'Template mode is separate from the four routing steps');
    assert.equal((await page.locator('#sp-x32-step-title').textContent()).trim(), 'Exportvorlage hinterlegen');
    await page.locator('#sp-x32-mode').selectOption('routing');
    assert(await page.locator('[data-x32-input-id]:checked').count() > 0, 'Switching back from template mode preserves the input selection');
    await page.locator('#sp-x32-mode').selectOption('template');
    await importSelectedScene(page);
    await page.waitForFunction(expected => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.x32Scene?.text === expected, scene);
    await waitSaved(page);
    const withTemplate = comparable(await storedDocument(page));
    assert.deepEqual(withTemplate.stage.routing, originalDocument.stage.routing, 'Using a scene as a template preserves the existing routing');
    assert.deepEqual(withTemplate.objects, originalDocument.objects, 'Using a template preserves stage objects');
    await page.locator('#sp-x32-close').click();
    await routingTool(page, 'undo');
    assert.deepEqual(comparable(await storedDocument(page)), originalDocument, 'Undo removes the imported template without changing the project');
    await routingTool(page, 'redo');
    assert.deepEqual(comparable(await storedDocument(page)), withTemplate, 'Redo restores the complete original scene');

    if (!(await page.locator('#sp-x32-dialog').isVisible())) await openScene(page);
    await page.locator('#sp-x32-file').setInputFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from(scene)});
    await page.locator('#sp-x32-wizard').waitFor({state:'visible'});
    await page.locator('#sp-x32-mode').selectOption('routing');
    await importSelectedScene(page);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.inputs.some(row => row.number === 1 && row.instrument === 'KICK'));
    await waitSaved(page);
    let imported = await storedDocument(page);
    assert.equal(imported.stage.x32Scene.filename, filename);
    assert.deepEqual(imported.objects, originalDocument.objects, 'Import does not guess or move stage objects');
    const inputs = imported.stage.routing.inputs, outputs = imported.stage.routing.outputs;
    assert.deepEqual(inputs.map(row => row.number).sort((a,b) => a-b), [1,3,4], 'Only named input channels and the linked empty partner are imported');
    assert.equal(inputs.find(row => row.number === 1).instrument, 'KICK');
    assert.equal(inputs.find(row => row.number === 3).mode, 'Stereo L');
    assert.equal(inputs.find(row => row.number === 4).mode, 'Stereo R');
    assert.equal(inputs.find(row => row.number === 3).stereoGroup, inputs.find(row => row.number === 4).stereoGroup);
    assert.deepEqual(outputs, [], 'Without an XLR output-bank patch, buses remain in the scene inventory and no physical output is invented');
    assert.equal(imported.stage.x32Scene.wizard.version, 1, 'The routed import retains its wizard selections');
    await page.locator('#sp-x32-close').click();
    await routingTool(page, 'undo');
    assert.deepEqual(comparable(await storedDocument(page)), withTemplate, 'Routing import is one undo step and preserves the prior template');
    await routingTool(page, 'redo');
    assert.deepEqual(comparable(await storedDocument(page)), comparable(imported), 'Redo restores all imported rows and their native bindings');

    if (!(await page.locator('#sp-x32-dialog').isVisible())) await openScene(page);
    assert.equal(await downloadScene(page), scene, 'Import followed by export preserves the original bytes, including BOM, CRLF, unknown records and an unnamed linked partner');
    await page.locator('#sp-x32-close').click();

    await page.locator('[data-rw-tab="inputs"]').click();
    const kickId = inputs.find(row => row.number === 1).id;
    const kickField = page.locator('[data-rw-channel-field="instrument"][data-rw-row="' + kickId + '"]');
    if (!(await kickField.isVisible())) await page.locator('.rw-list-item').filter({hasText:'KICK'}).first().click();
    const kickNumber = page.locator('[data-rw-channel-field="number"][data-rw-row="' + kickId + '"]');
    await kickNumber.fill('33');
    await kickNumber.press('Tab');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.inputs.find(row => row.id === id)?.number === 33, kickId);
    await openScene(page);
    const unexpectedDownloads = [], onUnexpectedDownload = download => unexpectedDownloads.push(download);
    page.on('download', onUnexpectedDownload);
    await page.locator('#sp-x32-export').click();
    await page.locator('#sp-x32-error').waitFor({state:'visible'});
    assert((await page.locator('#sp-x32-error').textContent()).trim(), 'An unsupported X32 channel explains why export is blocked');
    assert(await page.locator('#sp-x32-download').isHidden(), 'Invalid plans cannot download an incomplete scene');
    assert.equal(unexpectedDownloads.length, 0);
    page.off('download', onUnexpectedDownload);
    await page.locator('#sp-x32-close').click();
    await kickNumber.fill('1');
    await kickNumber.press('Tab');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.inputs.find(row => row.id === id)?.number === 1, kickId);
    await kickField.fill('Kick neu');
    await kickField.press('Tab');
    await page.waitForFunction(id => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.routing.inputs.find(row => row.id === id)?.instrument === 'Kick neu', kickId);
    await waitSaved(page);
    await openScene(page);
    const modified = await downloadScene(page);
    const originalLines = scene.split('\r\n'), modifiedLines = modified.split('\r\n');
    assert.equal(modifiedLines.length, originalLines.length, 'Export preserves line endings and record count');
    const changed = originalLines.flatMap((line,index) => line === modifiedLines[index] ? [] : [index]);
    assert.equal(changed.length, 1, 'Editing one label changes only one native scene record');
    assert.match(originalLines[changed[0]], /^\/ch\/01\/config\s/);
    assert.match(modifiedLines[changed[0]], /^\/ch\/01\/config\s+"Kick neu"\s+3\s+BL\s+1\s*$/);
    assert.equal((await storedDocument(page)).stage.x32Scene.text, scene, 'Export never overwrites the original template');
    await page.locator('#sp-x32-close').click();

    // Seed only a physical stagebox and cable assignment; configure its console
    // address through the real UI. Arbitrary object IDs exercise normalization.
    await page.evaluate(id => {
      const data = JSON.parse(localStorage.getItem('stageplot-studio:drafts:v1'));
      const entry = data.entries.find(item => item.id === data.lastId);
      entry.document.objects.push({id:'qa-stagebox-source',type:'stagebox-16',label:'QA Stagebox',x:1,y:1,angle:0,showLabel:true});
      Object.assign(entry.document.stage.routing.inputs.find(row => row.id === id), {stagebox:'qa-stagebox-source',stageboxPort:1});
      localStorage.setItem('stageplot-studio:drafts:v1', JSON.stringify(data));
      localStorage.setItem('stageplot-studio:workspace:v1', JSON.stringify({version:1,entry}));
    }, kickId);
    await page.reload();
    await waitSaved(page);
    await page.locator('.sp-steps [data-view="routing"]').click();
    await openScene(page);
    await page.locator('#sp-x32-attached details > summary').click();
    await page.locator('[data-x32-bank]').first().selectOption('aes50-a');
    await page.locator('[data-x32-first]').first().fill('1');
    await page.locator('#sp-x32-save-mappings').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.x32Scene?.mappings.length === 1);
    const mapped = await storedDocument(page);
    const boxId = mapped.objects.find(object => object.type === 'stagebox-16').id;
    assert.notEqual(boxId, 'qa-stagebox-source', 'Loading normalizes fixture object IDs');
    assert.deepEqual(mapped.stage.x32Scene.mappings, [{stagebox:boxId,bank:'aes50-a',offset:0}]);
    assert.equal(mapped.stage.routing.inputs.find(row => row.id === kickId).stagebox, boxId);
    const mappedScene = await downloadScene(page);
    const mappedLines = mappedScene.split('\r\n');
    assert.equal(mappedLines.length, originalLines.length);
    assert.equal(originalLines.filter((line,index) => line !== mappedLines[index]).length, 1, 'A new physical input changes only the selected channel config');
    assert.match(mappedLines.find(line => line.startsWith('/ch/01/config')), /^\/ch\/01\/config\s+"Kick neu"\s+3\s+BL\s+17\s*$/);
    assert.equal(mappedLines.find(line => line.startsWith('/config/routing/IN ')), originalLines.find(line => line.startsWith('/config/routing/IN ')), 'Source selection reuses the template banks rather than changing every input');
    await page.locator('#sp-x32-close').click();
    await page.reload();
    await waitSaved(page);
    imported = await storedDocument(page);
    assert.equal(imported.stage.x32Scene.text, scene, 'Reload retains the complete original template');
    assert.equal(imported.stage.routing.inputs.find(row => row.id === kickId).instrument, 'Kick neu');
    assert.deepEqual(imported.stage.x32Scene.mappings, mapped.stage.x32Scene.mappings, 'Reload retains the saved physical mapping');
    await page.locator('.sp-steps [data-view="project"]').click();
    const backupEvent = page.waitForEvent('download');
    await page.locator('#sp-project-export').click();
    const backup = await backupEvent;
    const payload = JSON.parse(await fs.readFile(await backup.path(), 'utf8'));
    assert.equal(payload.document.stage.x32Scene.text, scene, 'Portable backup retains the complete original template');
    assert.equal(payload.document.stage.x32Scene.filename, filename);
    assert.deepEqual(payload.document.stage.x32Scene.mappings, mapped.stage.x32Scene.mappings);

    // Portable imports must remap both routing and attachment references, not
    // merely preserve a stale stagebox ID in the scene attachment.
    const portable = structuredClone(payload), oldBox = portable.document.objects.find(object => object.type === 'stagebox-16').id;
    portable.document.objects.find(object => object.id === oldBox).id = 'portable-stagebox-id';
    for (const row of portable.document.stage.routing.inputs) if (row.stagebox === oldBox) row.stagebox = 'portable-stagebox-id';
    for (const mapping of portable.document.stage.x32Scene.mappings) if (mapping.stagebox === oldBox) mapping.stagebox = 'portable-stagebox-id';
    const fresh = await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    fresh.on('pageerror', error => errors.push(error.message));
    fresh.setDefaultTimeout(10000);
    await fresh.goto(process.env.APP_URL || 'http://127.0.0.1:8898/');
    const chooser = fresh.waitForEvent('filechooser');
    if (!(await fresh.locator('#sp-project-import').isVisible())) await fresh.locator('#sp-project-management > summary').click();
    await fresh.locator('#sp-project-import').click();
    await (await chooser).setFiles({name:'synthetic-portable.stageplot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});
    await fresh.waitForFunction(() => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1') || 'null')?.entry?.document?.stage?.x32Scene?.mappings.length === 1);
    await waitSaved(fresh);
    const restored = await storedDocument(fresh), restoredBox = restored.objects.find(object => object.type === 'stagebox-16').id;
    assert.notEqual(restoredBox, 'portable-stagebox-id');
    assert.equal(restored.stage.x32Scene.mappings[0].stagebox, restoredBox, 'Portable import remaps attachment bindings to the restored stagebox');
    assert.equal(restored.stage.routing.inputs.find(row => row.id === kickId).stagebox, restoredBox);
    await fresh.locator('.sp-steps [data-view="routing"]').click();
    await openScene(fresh);
    assert.equal(await downloadScene(fresh), mappedScene, 'The imported portable project exports the same source assignment');
    await fresh.close();

    await page.locator('#sp-project-id-copy').click();
    await page.locator('#sp-share-dialog').waitFor({state:'visible'});
    await page.locator('#sp-share-offline-details > summary').click();
    await page.locator('#sp-share-offline').click();
    const publicLink = await page.locator('#sp-share-offline-link').inputValue();
    assert.match(new URL(publicLink).hash, /^#share=/);
    const publicDocument = JSON.parse(Buffer.from(new URL(publicLink).hash.slice(7), 'base64url').toString('utf8')).document;
    assert.equal(Object.hasOwn(publicDocument.stage, 'x32Scene'), false, 'Public plans exclude the private mixer scene');
    assert(!JSON.stringify(publicDocument).includes(filename), 'Public plans exclude the original filename');
    assert(!JSON.stringify(publicDocument).includes('Keep this unknown setting'), 'Unmodeled mixer details never enter public shares');
    await page.locator('#sp-share-close').click();

    await page.locator('#sp-settings-gear').click();
    await page.locator('[data-theme-choice="dark"]').click();
    await page.locator('#sp-settings-close').click();
    await page.locator('.sp-steps [data-view="routing"]').click();
    await page.setViewportSize({width:390,height:844});
    await openScene(page);
    assert.equal(await page.locator('#sp-prototype').getAttribute('data-theme'), 'dark');
    assert((await page.locator('#sp-x32-filename').textContent()).includes(filename));
    await assertNoOverflow(page, '#sp-x32-dialog', 'X32 scene dialog');
    await page.locator('#sp-x32-export').scrollIntoViewIfNeeded();
    await page.locator('#sp-x32-export').click();
    await page.locator('#sp-x32-download').scrollIntoViewIfNeeded();
    const button = await page.locator('#sp-x32-download').boundingBox();
    assert(button && button.x >= 0 && button.x + button.width <= 391 && button.y >= 0 && button.y + button.height <= 845, 'Download remains reachable on a narrow viewport');
    await page.screenshot({path:artifactPath('x32-scenes-dark-mobile-' + engine + '.png')});
    await page.locator('#sp-x32-close').click();

    // A merged source may retain a native binding of its own. Replacing the
    // template must detach both levels, while preserving the merged signal.
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(id => {
      const data = JSON.parse(localStorage.getItem('stageplot-studio:drafts:v1'));
      const entry = data.entries.find(item => item.id === data.lastId);
      const row = entry.document.stage.routing.inputs.find(item => item.id === id);
      row.linkedSources = [{...structuredClone(row),id:'route-x32-linked-old',instrument:'Linked source',number:null,stagebox:'',stageboxPort:null,linkedSources:[],x32:{kind:'channel',channel:2,source:2}}];
      localStorage.setItem('stageplot-studio:drafts:v1', JSON.stringify(data));
      localStorage.setItem('stageplot-studio:workspace:v1', JSON.stringify({version:1,entry}));
    }, kickId);
    await page.reload();
    await waitSaved(page);
    await page.locator('.sp-steps [data-view="routing"]').click();
    await openScene(page);
    await page.locator('#sp-x32-file').setInputFiles({name:'replacement-template.scn',mimeType:'text/plain',buffer:Buffer.from(scene)});
    await page.locator('#sp-x32-wizard').waitFor({state:'visible'});
    await page.locator('#sp-x32-mode').selectOption('template');
    await importSelectedScene(page);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('stageplot-studio:workspace:v1')).entry.document.stage.x32Scene.filename === 'replacement-template.scn');
    const replaced = await storedDocument(page), merged = replaced.stage.routing.inputs.find(row => row.id === kickId);
    assert.equal(merged.linkedSources.length, 1);
    assert.equal(merged.linkedSources[0].instrument, 'Linked source');
    for (const row of [...replaced.stage.routing.inputs,...replaced.stage.routing.outputs]) {
      assert.equal(Object.hasOwn(row, 'x32'), false, 'A new template clears the previous channel binding');
      for (const member of row.linkedSources) assert.equal(Object.hasOwn(member, 'x32'), false, 'A new template also clears merged-source bindings');
    }
    assert.deepEqual(errors, []);
    console.log('PASS ' + engine + ': X32 validation/UTF-8 rejection, preview/cancel, import undo/redo, stereo/empty partners, byte-identical BOM/CRLF no-op, blocked invalid export, isolated label/source patches, stagebox mapping persistence/remapping, portable roundtrip, public-share exclusion, mobile dark layout and nested binding cleanup.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
