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
  '/ch/02/config "" 1 OFF 9',
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

    await page.locator('.sp-steps [data-view="routing"]').click();
    const before = comparable(await storedDocument(page));
    assert(!before.objects.some(item => /^stagebox-/.test(item.type)), 'The wizard can start without stageboxes');
    await openScene(page);
    await loadScene(page);
    assert.deepEqual(comparable(await storedDocument(page)), before, 'Scene preview does not change the project');
    assert(await page.locator('#sp-x32-import').isHidden(), 'Import is offered only after reviewing the routing steps');
    await page.locator('[data-x32-input-id="channel-2"]').check();
    await page.locator('#sp-x32-next').click();
    assert.equal((await page.locator('[data-x32-direct-port="channel-2"]').textContent()).trim(), '9', 'A direct jack follows the scene source Local9, not the unrelated CH2 identity');
    assert.equal((await page.locator('[data-x32-direct-port="channel-3"]').textContent()).trim(), '3', 'A direct local input immediately displays its actual jack');
    assert.equal(await page.locator('[data-x32-input-mode="direct"][data-x32-input="channel-3"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-x32-input-mode="stagebox"][data-x32-input="channel-1"]').click();
    assert.deepEqual(await page.locator('[data-x32-add-box][data-x32-input="channel-1"]').evaluateAll(buttons => buttons.map(button => button.dataset.x32AddBox).sort()), ['stagebox-behringer-s16','stagebox-behringer-s32','stagebox-behringer-sd16','stagebox-behringer-sd8'].sort(), 'Only X32-compatible AES50 stageboxes are offered in the compact model list');
    await page.locator('[data-x32-add-box="stagebox-behringer-s16"][data-x32-input="channel-1"]').click();
    const socketDialog = page.locator('#sp-x32-socket-dialog');
    await socketDialog.waitFor({state:'visible'});
    assert(await socketDialog.evaluate(dialog => dialog.matches(':modal')), 'Socket selection opens as a real modal popup');
    assert.equal(await socketDialog.locator('[data-x32-socket-port]').count(), 16, 'S16 offers its real sixteen input sockets');
    assert.equal(await socketDialog.locator('[data-x32-socket-port="17"]').count(), 0, 'There is no out-of-capacity input target');
    assert.equal(await page.locator('#sp-x32-socket-bank').inputValue(), 'aes50-a', 'A new S16 is connected through AES50 rather than invented local analog ports');
    assert.deepEqual(comparable(await storedDocument(page)), before, 'Choosing a model stages the device without changing the project');
    await socketDialog.locator('[data-x32-socket-port="1"]').click();
    await socketDialog.waitFor({state:'hidden'});
    assert.match(await page.locator('[data-x32-input-socket="channel-1"]').textContent(), /1/);
    assert.deepEqual(comparable(await storedDocument(page)), before, 'Clicking a staged device socket still leaves the project untouched');
    await page.locator('#sp-x32-close').click();
    assert.deepEqual(comparable(await storedDocument(page)), before, 'Cancelling the wizard discards its pending stagebox and patch');

    await openScene(page);
    await loadScene(page);
    await page.locator('[data-x32-input-id="channel-2"]').uncheck();
    await page.locator('[data-x32-input-id="aux-1"]').check();
    await page.locator('#sp-x32-next').click();
    await page.locator('[data-x32-input-mode="stagebox"][data-x32-input="channel-1"]').click();
    await page.locator('[data-x32-add-box="stagebox-behringer-s16"][data-x32-input="channel-1"]').click();
    await socketDialog.waitFor({state:'visible'});
    await socketDialog.locator('[data-x32-socket-port="1"]').click();
    await socketDialog.waitFor({state:'hidden'});
    await page.locator('[data-x32-input-mode="stagebox"][data-x32-input="channel-3"]').click();
    const existingBox = page.locator('[data-x32-existing-box][data-x32-input="channel-3"]').first();
    assert(await existingBox.isVisible(), 'Other channels can choose the newly staged box from the existing-device list');
    await existingBox.click();
    await socketDialog.waitFor({state:'visible'});
    assert(await socketDialog.locator('[data-x32-socket-port="1"]').isDisabled(), 'A socket used by a different source cannot be silently reused');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      assert(await socketDialog.evaluate(dialog => dialog.contains(document.activeElement)), 'Keyboard focus stays within the socket popup');
    }
    await page.keyboard.press('Escape');
    await socketDialog.waitFor({state:'hidden'});
    assert(await page.locator('#sp-x32-dialog').evaluate(dialog => dialog.contains(document.activeElement)), 'Dismissing the popup returns focus to the import wizard');
    await page.locator('[data-x32-input-mode="direct"][data-x32-input="channel-3"]').click();
    assert.equal((await page.locator('[data-x32-direct-port="channel-3"]').textContent()).trim(), '3');
    assert(await page.locator('[data-x32-input-mode="stagebox"][data-x32-input="aux-1"]').isDisabled(), 'An AUX source cannot be silently rewritten as a stagebox input');
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
    const newBoxes = imported.objects.filter(item => item.type === 'stagebox-behringer-s16');
    assert.equal(newBoxes.length, 1, 'Only the explicitly chosen and assigned stagebox is added at commit');
    const boxId = newBoxes[0].id;
    assert.deepEqual(imported.objects.filter(item => item.id !== boxId), before.objects, 'Existing stage objects are preserved');
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
    assert.deepEqual(comparable(await storedDocument(page)), before, 'The complete import, newly created stagebox and patch are one undo step');
    await routingTool(page, 'redo');
    assert.deepEqual(comparable(await storedDocument(page)), imported, 'Redo restores the created stagebox, native identities and wizard choices');

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
    const restored = await storedDocument(fresh), restoredBox = restored.objects.find(item => item.type === 'stagebox-behringer-s16').id;
    assert.notEqual(restoredBox, portableId, 'Import normalizes externally supplied object IDs');
    assert.equal(restored.stage.x32Scene.wizard.inputAssignments.find(item => item.inputId === 'channel-1').stagebox, restoredBox, 'Wizard assignments follow stagebox ID normalization');
    assert.equal(restored.stage.routing.inputs.find(row => row.x32?.kind === 'channel' && row.x32.channel === 1).stagebox, restoredBox);
    await fresh.locator('.sp-steps [data-view="routing"]').click();
    await openScene(fresh);
    await fresh.locator('#sp-x32-edit-wizard').click();
    await fresh.locator('#sp-x32-next').click();
    for (const channel of [3,4]) {
      await fresh.locator('[data-x32-input-mode="stagebox"][data-x32-input="channel-' + channel + '"]').click();
      await fresh.locator('[data-x32-existing-box="' + restoredBox + '"][data-x32-input="channel-' + channel + '"]').click();
      await fresh.locator('#sp-x32-socket-dialog [data-x32-socket-port="' + channel + '"]').click();
    }
    await fresh.locator('#sp-x32-next').click();
    await fresh.locator('#sp-x32-next').click();
    await fresh.locator('#sp-x32-import').click();
    await waitSaved(fresh);
    assert.equal((await storedDocument(fresh)).objects.filter(item => item.type === 'stagebox-behringer-s16').length, 1, 'Choosing an existing stagebox never duplicates it');
    const movedStereoScene = await downloadScene(fresh);
    assert.match(movedStereoScene, /\/ch\/03\/config "KEYS L" 1 RD 19\r\n/, 'Assigning a local channel to S16 socket3 intentionally selects AES50 A3');
    assert.match(movedStereoScene, /\/ch\/04\/config "" 1 RD 20\r\n/, 'The linked right channel can be assigned to S16 socket4 without confusing channel and socket identities');
    await fresh.close();

    await page.locator('.sp-steps [data-view="routing"]').click();
    await openScene(page);
    await page.locator('#sp-x32-attached details > summary').click();
    await page.locator('[data-x32-bank="' + boxId + '"]').selectOption('aes50-a');
    await page.locator('[data-x32-first="' + boxId + '"]').fill('9');
    await page.locator('#sp-x32-save-mappings').click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.entry.document.stage.x32Scene.mappings.some(item => item.bank === 'aes50-a' && item.offset === 8), storageKey);
    const plannedRepatchedScene = await downloadScene(page);
    assert.match(plannedRepatchedScene, /\/ch\/01\/config "KICK" 3 BL 25\r\n/, 'A deliberate planned repatch moves CH1 from AES50 A1 to AES50 A9');
    await page.locator('#sp-x32-close').click();
    await openScene(page);
    await page.locator('#sp-x32-edit-wizard').click();
    await page.locator('#sp-x32-next').click();
    assert.match(await page.locator('#sp-x32-wizard-body').textContent(), /(?:Geplant: )?AES50 A\s*9/, 'Reopened wizard describes the current planned source rather than restoring the original source');
    await page.locator('#sp-x32-next').click();
    await page.locator('#sp-x32-next').click();
    await page.locator('#sp-x32-import').click();
    await waitSaved(page);
    const replanned = await storedDocument(page);
    assert.deepEqual(replanned.stage.x32Scene.mappings.find(item => item.stagebox === boxId), {stagebox:boxId,bank:'aes50-a',offset:8}, 'Finishing an unchanged wizard preserves the explicit planned mapping');
    assert.equal(await downloadScene(page), plannedRepatchedScene, 'Reopening and finishing the wizard does not undo an existing planned repatch');
    await page.locator('#sp-x32-close').click();

    await page.setViewportSize({width:390,height:844});
    await openScene(page);
    await page.locator('#sp-x32-edit-wizard').click();
    await page.locator('#sp-x32-wizard').waitFor({state:'visible'});
    for (let step = 0; step < 4; step++) {
      await assertNoOverflow(page, '#sp-x32-dialog', 'X32 wizard step ' + (step + 1));
      if (step === 1) {
        await page.locator('[data-x32-input-socket="channel-1"]').click();
        await socketDialog.waitFor({state:'visible'});
        await assertNoOverflow(page, '#sp-x32-socket-dialog', 'Mobile stagebox socket popup');
        await socketDialog.locator('[data-x32-socket-port="16"]').scrollIntoViewIfNeeded();
        const lastSocket = await socketDialog.locator('[data-x32-socket-port="16"]').boundingBox();
        assert(lastSocket && lastSocket.x >= 0 && lastSocket.x + lastSocket.width <= 391, 'All physical sockets remain reachable by scrolling the mobile device surface');
        await socketDialog.locator('[data-x32-socket-port="1"]').scrollIntoViewIfNeeded();
        await page.screenshot({path:artifactPath('x32-socket-mobile-' + engine + '.png')});
        await page.keyboard.press('Escape');
        await socketDialog.waitFor({state:'hidden'});
        assert(await page.locator('#sp-x32-dialog').isVisible(), 'Escape dismisses the nested socket picker without discarding the wizard');
      }
      if (step < 3) await page.locator('#sp-x32-next').click();
    }
    await page.locator('#sp-x32-import').scrollIntoViewIfNeeded();
    const button = await page.locator('#sp-x32-import').boundingBox();
    assert(button && button.x >= 0 && button.x + button.width <= 391 && button.y >= 0 && button.y + button.height <= 845, 'Final import remains reachable on mobile');
    await page.screenshot({path:artifactPath('x32-wizard-mobile-' + engine + '.png')});
    await page.locator('#sp-x32-close').click();
    assert.deepEqual(errors, []);
    console.log('PASS ' + engine + ': X32 wizard direct input jacks, compatible stagebox creation, modal socket selection, staged cancel, capacity/conflict and unsupported-source validation, backward navigation, inputs/AUX/buses/physical outputs, nonidentity output patch, atomic undo/redo, exact no-op scene export, offline and portable persistence/remapping, planned repatch preservation, I/O list and mobile steps.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
