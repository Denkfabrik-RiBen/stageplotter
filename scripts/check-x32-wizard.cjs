// Scene-to-I/O integration: synthetic data only, never a user's mixer scene.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {engine, launchBrowser, artifactPath, assertNoOverflow} = require('./browser-qa.cjs');

const scene = '\uFEFF' + [
  '#4.0# "Wizard QA" "" %000000000 1',
  '/config/chlink ' + Array.from({length:16}, (_, i) => i === 1 ? 'ON' : 'OFF').join(' '),
  '/config/buslink ' + Array(8).fill('OFF').join(' '),
  '/config/fxlink ON OFF OFF OFF',
  '/config/routing REC',
  '/config/routing/IN AN1-8 AN9-16 A1-8 A9-16 AUX1-4',
  '/config/routing/OUT OUT9-12 OUT1-4 OUT13-16 OUT5-8',
  '/ch/01/config "KICK" 3 BL 17',
  '/ch/02/config "" 1 OFF 2',
  '/ch/03/config "KEYS L" 1 RD 3',
  '/ch/04/config "" 1 RD 4',
  '/ch/01/mix ON -7.5 OFF +0 OFF -oo',
  '/ch/01/mix/05 ON 0.0 +0 GRP 0',
  '/ch/01/mix/13 ON -12.0 +0 POST 0',
  '/auxin/01/config "PLAYBACK" 1 GN 33',
  '/bus/01/config "WEDGE" 63 YE',
  '/bus/05/config "VOX GROUP" 71 YEi',
  '/bus/05/mix ON -1.0 ON +0 OFF -oo',
  '/bus/13/config "HALL" 71 MG',
  '/fx/1 HALL',
  '/fx/1/source MIX13 MIX13',
  '/fx/1/par 20 2.03 60',
  '/fxrtn/01/config "HALL L" 61 MG',
  '/fxrtn/02/config "HALL R" 61 MG',
  '/fxrtn/01/mix ON 0.0 ON -100 OFF -oo',
  '/fxrtn/02/mix ON 0.0 ON +100 OFF -oo',
  ...Array.from({length:16}, (_, i) => '/outputs/main/' + String(i + 1).padStart(2, '0') + ' ' + (i === 2 ? '8' : '0') + ' POST OFF'),
  '/outputs/main/03/delay ON 7.1',
  '/future/untouched "A preserved scene parameter" 123',
  '',
].join('\r\n');
const filename = 'wizard-synthetic.scn';
const storageKey = 'stageplot-studio:workspace:v1';
const storedDocument = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)).entry.document, storageKey);
function comparable(document) {
  const result = structuredClone(document);
  if (result.stage.routing) delete result.stage.routing.generatedAt;
  return result;
}
async function waitSaved(page) {
  await page.waitForFunction(() => document.querySelector('#sp-header-draft-status').textContent === 'Lokal gespeichert');
}
async function routingTool(page, name) {
  const tool = page.locator('[data-rw-tool="' + name + '"]').first();
  if (!(await tool.isVisible())) await page.locator('[data-rw-tools]').click();
  await tool.click();
}
async function openScene(page) {
  await routingTool(page, 'x32Scene');
  await page.locator('#sp-x32-dialog').waitFor({state:'visible'});
}
async function loadScene(page) {
  await page.locator('#sp-x32-file').setInputFiles({name:filename,mimeType:'text/plain',buffer:Buffer.from(scene)});
  await page.locator('#sp-x32-wizard').waitFor({state:'visible'});
  await page.locator('#sp-x32-mode').selectOption('routing');
}
async function downloadScene(page) {
  await page.locator('#sp-x32-export').click();
  await page.locator('#sp-x32-download').waitFor({state:'visible'});
  const event = page.waitForEvent('download');
  await page.locator('#sp-x32-download').click();
  return fs.readFile(await (await event).path(), 'utf8');
}

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:8898/');
    await page.locator('[data-project-add]').click();
    await page.locator('#sp-np-band').fill('QA X32 Wizard');
    await page.locator('#sp-np-create').click();
    await waitSaved(page);

    // A physical device created through the actual routing UI exercises
    // capacity validation without relying on a guessed object identity.
    await page.locator('.sp-steps [data-view="routing"]').click();
    await page.locator('[data-rw-tab="stageboxes"]').click();
    await page.locator('[data-rw-open="add-box"]').click();
    await page.locator('[data-rw-add-box="stagebox-16"]').click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.entry.document.objects.some(item => item.type === 'stagebox-16'), storageKey);
    await waitSaved(page);
    const before = comparable(await storedDocument(page));
    const boxId = before.objects.find(item => item.type === 'stagebox-16').id;
    await openScene(page);
    await loadScene(page);
    assert.deepEqual(comparable(await storedDocument(page)), before, 'Scene preview does not change the project');
    assert(await page.locator('#sp-x32-import').isHidden(), 'Import is offered only after reviewing the routing steps');
    await page.locator('#sp-x32-next').click();
    await page.locator('[data-x32-input-box="channel-1"]').waitFor({state:'visible'});
    await page.locator('[data-x32-input-box="channel-1"]').selectOption(boxId);
    await page.locator('[data-x32-input-port="channel-1"]').fill('1');
    await page.locator('#sp-x32-close').click();
    assert.deepEqual(comparable(await storedDocument(page)), before, 'Cancelling after entering assignments is still non-destructive');

    await openScene(page);
    await loadScene(page);
    await page.locator('[data-x32-input-id="channel-2"]').uncheck();
    await page.locator('[data-x32-input-id="aux-1"]').check();
    await page.locator('#sp-x32-next').click();
    await page.locator('[data-x32-input-box="channel-1"]').selectOption(boxId);
    await page.locator('[data-x32-input-port="channel-1"]').fill('17');
    await page.locator('#sp-x32-next').click();
    await page.locator('#sp-x32-error').waitFor({state:'visible'});
    assert(await page.locator('[data-x32-input-box="channel-1"]').isVisible(), 'A port outside the physical device capacity blocks the next step');
    assert.deepEqual(comparable(await storedDocument(page)), before, 'An invalid physical assignment never partially changes the project');
    await page.locator('[data-x32-input-port="channel-1"]').fill('1');
    await page.locator('[data-x32-input-box="channel-3"]').selectOption(boxId);
    await page.locator('[data-x32-input-port="channel-3"]').fill('1');
    await page.locator('#sp-x32-next').click();
    await page.locator('#sp-x32-error').waitFor({state:'visible'});
    assert(await page.locator('[data-x32-input-box="channel-1"]').isVisible(), 'Different scene sources cannot silently occupy the same physical port');
    await page.locator('[data-x32-input-box="channel-3"]').selectOption('');
    await page.locator('[data-x32-input-box="aux-1"]').selectOption(boxId);
    await page.locator('[data-x32-input-port="aux-1"]').fill('2');
    await page.locator('#sp-x32-next').click();
    await page.locator('#sp-x32-error').waitFor({state:'visible'});
    assert.match(await page.locator('#sp-x32-error').textContent(), /Quelle.*keiner Stagebox|Zuordnung offen/i, 'An AUX source cannot be silently rewritten as a stagebox input');
    assert(await page.locator('[data-x32-input-box="aux-1"]').isVisible(), 'Unsupported source assignment stays on the input review step');
    await page.locator('[data-x32-input-box="aux-1"]').selectOption('');
    await page.locator('#sp-x32-next').click();
    await page.locator('[data-x32-bus-role="13"]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-x32-bus-role="13"]').inputValue(), 'fx', 'FX role is inferred from an actual FX source assignment');
    await page.locator('[data-x32-bus-role="1"]').selectOption('monitor');
    await page.locator('#sp-x32-next').click();
    await page.locator('[data-x32-output-id="output-local-7"]').waitFor({state:'visible'});
    for (const checkbox of await page.locator('[data-x32-output-id]').all()) await checkbox.uncheck();
    await page.locator('[data-x32-output-id="output-local-7"]').check();
    await page.locator('[data-x32-output-destination="output-local-7"]').fill('Vocal zone');
    assert.match(await page.locator('#sp-x32-wizard').textContent(), /VOX GROUP/, 'Nonidentity output patch resolves XLR 7 to the source bus');
    await page.locator('#sp-x32-back').click();
    assert.equal(await page.locator('[data-x32-bus-role="1"]').inputValue(), 'monitor', 'Backward navigation retains bus usage');
    await page.locator('#sp-x32-next').click();
    assert.equal(await page.locator('[data-x32-output-destination="output-local-7"]').inputValue(), 'Vocal zone', 'Backward navigation retains the destination name');
    assert.deepEqual(comparable(await storedDocument(page)), before, 'All wizard choices remain staged until the final import');
    await page.locator('#sp-x32-import').click();
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key))?.entry.document.stage.x32Scene?.wizard, storageKey);
    await waitSaved(page);
    const imported = comparable(await storedDocument(page));
    assert.deepEqual(imported.objects, before.objects, 'The wizard does not invent or reposition stage objects');
    assert.equal(imported.stage.x32Scene.text, scene, 'The original scene remains byte-for-byte attached');
    const inputs = imported.stage.routing.inputs;
    assert.deepEqual(inputs.filter(row => row.x32?.kind === 'channel').map(row => row.x32.channel).sort((a,b) => a-b), [1,3,4], 'Named channels and the empty stereo partner retain native identity');
    assert.equal(inputs.filter(row => row.x32?.kind === 'aux').length, 1, 'Selected AUX sources are included without becoming main input channels');
    assert.equal(inputs.find(row => row.x32?.channel === 1 && row.x32.kind === 'channel').stagebox, boxId);
    assert.equal(inputs.find(row => row.x32?.channel === 1 && row.x32.kind === 'channel').stageboxPort, 1);
    const outputs = imported.stage.routing.outputs;
    assert.equal(outputs.length, 1, 'Only selected physical destinations become output rows');
    assert.equal(outputs[0].x32.kind, 'output', 'Physical endpoints do not masquerade as bus rows');
    assert.equal(outputs[0].x32.endpoint, 'output-local-7');
    assert.match(outputs[0].x32.sourceLabel, /VOX GROUP/);
    assert.equal(outputs[0].instrument, 'Vocal zone');
    assert.equal(outputs[0].number, null, 'Native endpoint ports are separate from bus numbering');
    assert(imported.stage.x32Scene.wizard.busRoles.some(item => item.bus === 1 && item.role === 'monitor'));
    await page.locator('#sp-x32-close').click();
    await routingTool(page, 'undo');
    assert.deepEqual(comparable(await storedDocument(page)), before, 'The complete scene import and its assignments are one undo step');
    await routingTool(page, 'redo');
    assert.deepEqual(comparable(await storedDocument(page)), imported, 'Redo restores native identities and wizard choices');

    await openScene(page);
    assert.equal(await downloadScene(page), scene, 'Reading and assigning scene routes never rewrites FX, output patch or original source values');
    await page.locator('#sp-x32-close').click();
    await page.locator('[data-rw-tab="x32"]').click();
    assert.match(await page.locator('#sp-routing-detail-v2').textContent(), /VOX GROUP/);
    assert.match(await page.locator('#sp-routing-detail-v2').textContent(), /XLR 7/);
    assert.match(await page.locator('#sp-routing-detail-v2').textContent(), /FX 1/);
    await page.screenshot({path:artifactPath('x32-wizard-io-' + engine + '.png')});

    await page.reload();
    await waitSaved(page);
    assert.deepEqual(comparable(await storedDocument(page)), imported, 'Offline reload preserves scene, selected rows and assignments');
    await page.locator('.sp-steps [data-view="project"]').click();
    const backupEvent = page.waitForEvent('download');
    await page.locator('#sp-project-export').click();
    const backup = JSON.parse(await fs.readFile(await (await backupEvent).path(), 'utf8'));
    assert.deepEqual(backup.document.stage.x32Scene.wizard, imported.stage.x32Scene.wizard, 'Portable backup preserves all wizard choices');
    assert.equal(backup.document.stage.x32Scene.text, scene);

    const portable = structuredClone(backup), portableId = 'portable-wizard-stagebox';
    portable.document.objects.find(item => item.id === boxId).id = portableId;
    for (const direction of ['inputs','outputs']) for (const row of portable.document.stage.routing[direction]) if (row.stagebox === boxId) row.stagebox = portableId;
    for (const name of ['inputAssignments','outputAssignments']) for (const assignment of portable.document.stage.x32Scene.wizard[name]) if (assignment.stagebox === boxId) assignment.stagebox = portableId;
    for (const mapping of portable.document.stage.x32Scene.mappings) if (mapping.stagebox === boxId) mapping.stagebox = portableId;
    const fresh = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
    fresh.on('pageerror', error => errors.push(error.message));
    fresh.setDefaultTimeout(10000);
    await fresh.goto(process.env.APP_URL || 'http://127.0.0.1:8898/');
    const chooser = fresh.waitForEvent('filechooser');
    await fresh.locator('#sp-project-import').click();
    await (await chooser).setFiles({name:'wizard-portable.stageplot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(portable))});
    await fresh.waitForFunction(key => !!JSON.parse(localStorage.getItem(key) || 'null')?.entry.document.stage.x32Scene?.wizard, storageKey);
    await waitSaved(fresh);
    const restored = await storedDocument(fresh), restoredBox = restored.objects.find(item => item.type === 'stagebox-16').id;
    assert.notEqual(restoredBox, portableId, 'Import normalizes externally supplied object IDs');
    assert.equal(restored.stage.x32Scene.wizard.inputAssignments.find(item => item.inputId === 'channel-1').stagebox, restoredBox, 'Wizard assignments follow stagebox ID normalization');
    assert.equal(restored.stage.routing.inputs.find(row => row.x32?.kind === 'channel' && row.x32.channel === 1).stagebox, restoredBox);
    await fresh.close();

    await page.locator('.sp-steps [data-view="routing"]').click();
    await openScene(page);
    await page.locator('#sp-x32-attached details > summary').click();
    await page.locator('[data-x32-bank="' + boxId + '"]').selectOption('local');
    await page.locator('#sp-x32-save-mappings').click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.entry.document.stage.x32Scene.mappings.some(item => item.bank === 'local'), storageKey);
    const plannedLocalScene = await downloadScene(page);
    assert.match(plannedLocalScene, /\/ch\/01\/config "KICK" 3 BL 1\r\n/, 'A deliberate planned repatch moves CH1 from AES50 A1 to Local1');
    await page.locator('#sp-x32-close').click();
    await openScene(page);
    await page.locator('#sp-x32-edit-wizard').click();
    await page.locator('#sp-x32-next').click();
    assert.match(await page.locator('#sp-x32-wizard-body').textContent(), /Geplant: Local 1/, 'Reopened wizard describes the current planned source rather than restoring the original source');
    await page.locator('#sp-x32-next').click();
    await page.locator('#sp-x32-next').click();
    await page.locator('#sp-x32-import').click();
    await waitSaved(page);
    const replanned = await storedDocument(page);
    assert.equal(replanned.stage.x32Scene.mappings.find(item => item.stagebox === boxId).bank, 'local', 'Finishing an unchanged wizard preserves the explicit planned mapping');
    assert.equal(await downloadScene(page), plannedLocalScene, 'Reopening and finishing the wizard does not undo an existing planned repatch');
    await page.locator('#sp-x32-close').click();

    await page.setViewportSize({width:390,height:844});
    await openScene(page);
    await page.locator('#sp-x32-edit-wizard').click();
    await page.locator('#sp-x32-wizard').waitFor({state:'visible'});
    for (let step = 0; step < 4; step++) {
      await assertNoOverflow(page, '#sp-x32-dialog', 'X32 wizard step ' + (step + 1));
      if (step < 3) await page.locator('#sp-x32-next').click();
    }
    await page.locator('#sp-x32-import').scrollIntoViewIfNeeded();
    const button = await page.locator('#sp-x32-import').boundingBox();
    assert(button && button.x >= 0 && button.x + button.width <= 391 && button.y >= 0 && button.y + button.height <= 845, 'Final import remains reachable on mobile');
    await page.screenshot({path:artifactPath('x32-wizard-mobile-' + engine + '.png')});
    await page.locator('#sp-x32-close').click();
    assert.deepEqual(errors, []);
    console.log('PASS ' + engine + ': X32 wizard preview/cancel, port capacity/conflict and unsupported-source validation, backward navigation, inputs/AUX/buses/physical outputs, nonidentity output patch, atomic undo/redo, exact no-op scene export, offline and portable persistence/remapping, planned repatch preservation, I/O list and mobile steps.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
