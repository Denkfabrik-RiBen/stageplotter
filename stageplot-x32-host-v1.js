// Embedded in the app closure; scene edits share the existing project/undo store.
let x32Pending=null,x32Prepared=null,x32ReadGeneration=0;
function x32Error(message=''){
  $('sp-x32-error').textContent=message;$('sp-x32-error').hidden=!message;
}
function x32InvalidateExport(){
  x32Prepared=null;$('sp-x32-download').hidden=true;$('sp-x32-changes').replaceChildren();
}
function x32ClearBindings(rows){
  for(const row of rows){delete row.x32;if(Array.isArray(row.linkedSources))x32ClearBindings(row.linkedSources);}
}
function x32Warnings(messages,host){
  host.replaceChildren();
  for(const message of messages||[]){const item=document.createElement('li');item.textContent=message;host.append(item);}
  host.hidden=!host.children.length;
}
function x32SceneSummary(text){
  const parsed=StageplotX32.parse(text),imported=StageplotX32.importRouting(text);
  return {parsed,imported};
}
function x32RenderPreview(text){
  const {parsed,imported}=x32SceneSummary(text);
  $('sp-x32-summary').textContent=imported.inputs.length+' Eingangskanäle · '+imported.outputs.length+' benannte Mixbusse · '+(parsed.name||'X32-Szene');
  const body=$('sp-x32-preview-body');body.replaceChildren();
  for(const row of imported.inputs){
    const channel=parsed.channels.find(item=>item.number===row.number),tr=document.createElement('tr');
    for(const value of ['CH '+row.number,row.instrument||'Ohne Namen',channel?.sourceAddress?.label||'Zuordnung aus Vorlage',row.stereoGroup?row.mode:'Mono']){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    body.append(tr);
  }
  for(const row of imported.outputs){
    const tr=document.createElement('tr');
    for(const value of ['Bus '+row.number,row.instrument||'Ohne Namen','Mixbus · Ausgangs-Patch bleibt erhalten',row.stereoGroup?row.mode:'Mono']){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    body.append(tr);
  }
  x32Warnings(imported.warnings,$('sp-x32-warnings'));
  $('sp-x32-preview').hidden=false;
}
function x32RenderMappings(){
  const host=$('sp-x32-mappings'),mappings=stage.x32Scene?.mappings||[];host.replaceChildren();
  const boxes=allRoutingStageboxes();
  $('sp-x32-no-stageboxes').hidden=boxes.length>0;
  for(const box of boxes){
    const mapping=mappings.find(item=>item.stagebox===box.id),row=document.createElement('div');row.className='sp-x32-mapping';
    const name=document.createElement('strong');name.textContent=box.name;row.append(name);
    const label=document.createElement('label');label.textContent='Am X32 angeschlossen an';
    const select=document.createElement('select');select.dataset.x32Bank=box.id;select.setAttribute('aria-label',box.name+' · X32-Anschluss');
    for(const [value,text] of [['','Bitte zuordnen'],['local','Lokale Eingänge'],['aes50-a','AES50 A'],['aes50-b','AES50 B'],['card','Card / USB-Karte']]){
      const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);
    }
    select.value=mapping?.bank||'';label.append(select);row.append(label);
    const portLabel=document.createElement('label');portLabel.textContent='Erster Eingang';
    const input=document.createElement('input');input.type='number';input.min='1';input.max='48';input.step='1';input.value=String((mapping?.offset||0)+1);input.dataset.x32First=box.id;input.setAttribute('aria-label',box.name+' · Erster X32-Eingang');
    portLabel.append(input);row.append(portLabel);host.append(row);
  }
  $('sp-x32-save-mappings').hidden=!boxes.length;
}
function x32CurrentMappings(){
  return [...$('sp-x32-mappings').querySelectorAll('[data-x32-bank]')].filter(select=>select.value).map(select=>{
    const row=select.closest('.sp-x32-mapping'),first=Number(row.querySelector('[data-x32-first]').value);
    if(!Number.isInteger(first)||first<1||first>48)throw Error('Der erste X32-Eingang muss zwischen 1 und 48 liegen.');
    return {stagebox:select.dataset.x32Bank,bank:select.value,offset:first-1};
  });
}
function x32DescribeChange(change,before,after){
  const match=/^\/(ch|bus)\/(\d+)\/config$/.exec(change.path);
  if(match){
    const channels=match[1]==='ch',number=Number(match[2]),key=channels?'channels':'buses';
    const previous=before[key].find(item=>item.number===number),next=after[key].find(item=>item.number===number),details=[];
    if(previous.name!==next.name)details.push('Name: '+(previous.name||'ohne Namen')+' → '+(next.name||'ohne Namen'));
    if(channels&&previous.source!==next.source)details.push('Quelle: '+previous.sourceAddress.label+' → '+next.sourceAddress.label);
    return {title:(channels?'Kanal ':'Mixbus ')+number,details};
  }
  const channels=change.path==='/config/chlink',key=channels?'channelLinks':'busLinks',previous=new Set(before[key].map(pair=>pair.join('/'))),next=new Set(after[key].map(pair=>pair.join('/')));
  return {title:channels?'Kanal-Stereopaare':'Bus-Stereopaare',details:[...new Set([...previous,...next])].filter(pair=>previous.has(pair)!==next.has(pair)).map(pair=>pair+': '+(next.has(pair)?'Stereo verknüpft':'Verknüpfung aufgehoben'))};
}
function x32RenderAttached(){
  const attachment=stage.x32Scene;
  $('sp-x32-attached').hidden=!attachment;
  $('sp-x32-filename').textContent=attachment?.filename||'';
  $('sp-x32-import').disabled=!x32Pending;
  if(attachment)x32RenderMappings();
}
function openX32Scene(){
  if(sharedReadOnly)return;
  finishEdit();x32Pending=null;x32ReadGeneration++;x32InvalidateExport();x32Error();
  $('sp-x32-status').textContent='';$('sp-x32-file').value='';$('sp-x32-import-options').hidden=true;$('sp-x32-preview').hidden=true;
  x32RenderAttached();if(stage.x32Scene)x32RenderPreview(stage.x32Scene.text);
  $('sp-x32-dialog').showModal();
}
function x32Commit(fn,message){
  if(sharedReadOnly)throw Error('Diese Freigabe ist schreibgeschützt.');
  const before=snapshot();fn();keepHistory(before);renderRouting();say(message);$('sp-x32-status').textContent=message;
}
$('sp-x32-close').addEventListener('click',()=>$('sp-x32-dialog').close());
$('sp-x32-dialog').addEventListener('close',()=>{x32ReadGeneration++;x32Pending=null;x32InvalidateExport();});
$('sp-x32-file').addEventListener('change',async()=>{
  const generation=++x32ReadGeneration,owner=stage,file=$('sp-x32-file').files?.[0];x32Pending=null;x32Error();x32InvalidateExport();$('sp-x32-import').disabled=true;$('sp-x32-import-options').hidden=true;
  if(!file)return;
  try{
    if(file.size>250000)throw Error('Bitte eine X32-Szene unter 250 kB wählen.');
    const bytes=await file.arrayBuffer();let text;
    try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
    catch{throw Error('Die Szene ist nicht als UTF-8 lesbar. Bitte erneut aus X32-Edit exportieren.');}
    if(generation!==x32ReadGeneration||owner!==stage||!$('sp-x32-dialog').open||sharedReadOnly)return;
    const attachment=StageplotX32.normalizeAttachment({version:1,text,filename:file.name,mappings:[]});
    x32RenderPreview(text);x32Pending={attachment,owner,imported:StageplotX32.importRouting(text)};
    $('sp-x32-mode').value=stage.routing.inputs.length||stage.routing.outputs.length?'template':'routing';
    $('sp-x32-import-options').hidden=false;$('sp-x32-import').disabled=false;
    $('sp-x32-status').textContent='Vorschau geladen. Das Projekt wurde noch nicht geändert.';
  }catch(error){if(generation===x32ReadGeneration){$('sp-x32-preview').hidden=true;x32Error('Szene nicht geladen: '+error.message);}}
});
$('sp-x32-import').addEventListener('click',()=>{
  try{
    x32Error();if(!x32Pending||x32Pending.owner!==stage)throw Error('Bitte die Szene für dieses Projekt erneut auswählen.');
    const {attachment,imported}=x32Pending,replace=$('sp-x32-mode').value==='routing';
    const routing=replace?normalizeRouting({...stage.routing,inputs:imported.inputs,outputs:imported.outputs,disabledSources:[...new Set([...stage.routing.disabledSources,...generatedInputSpecs().map(row=>row.sourceKey),...generatedOutputSpecs().map(row=>row.sourceKey)])]}):null;
    x32Commit(()=>{
      stage.x32Scene=attachment;
      if(routing)stage.routing=routing;
      else for(const direction of ['inputs','outputs'])x32ClearBindings(stage.routing[direction]);
      reconcileCablesWithRouting();
    },replace?'X32-Kanäle und Mixbusse übernommen.':'X32-Vorlage im Projekt gespeichert.');
    x32Pending=null;$('sp-x32-import-options').hidden=true;$('sp-x32-file').value='';x32InvalidateExport();x32RenderAttached();
  }catch(error){x32Error(error.message);}
});
$('sp-x32-save-mappings').addEventListener('click',()=>{
  try{
    x32Error();if(!stage.x32Scene)throw Error('Bitte zuerst eine Szene als Vorlage laden.');
    const attachment=StageplotX32.normalizeAttachment({...stage.x32Scene,mappings:x32CurrentMappings()});
    x32Commit(()=>{stage.x32Scene=attachment;},'X32-Anschlüsse gespeichert.');x32InvalidateExport();
  }catch(error){x32Error(error.message);}
});
$('sp-x32-mappings').addEventListener('input',x32InvalidateExport);
$('sp-x32-mappings').addEventListener('change',x32InvalidateExport);
$('sp-x32-export').addEventListener('click',()=>{
  try{
    x32Error();x32InvalidateExport();
    if(!stage.x32Scene)throw Error('Bitte zuerst eine Szene als Vorlage laden.');
    if(x32Pending)throw Error('Bitte die neue Vorlage erst übernehmen oder den Dialog erneut öffnen.');
    const mappings=x32CurrentMappings(),result=StageplotX32.exportScene(stage.x32Scene.text,{inputs:stage.routing.inputs,outputs:stage.routing.outputs,mappings});
    const host=$('sp-x32-changes'),heading=document.createElement('h3');heading.textContent=result.changes.length+' Änderungen gegenüber der Vorlage';host.append(heading);
    const explanation=document.createElement('p');explanation.textContent='Nur die aufgeführten Beschriftungen, Kanalquellen und Stereo-Verknüpfungen werden geändert. Nicht aufgeführte Kanäle und alle Klang- und Ausgangseinstellungen bleiben aus der Vorlage.';host.append(explanation);
    const list=document.createElement('ul');list.className='sp-x32-change-list';
    const original=StageplotX32.parse(stage.x32Scene.text),updated=StageplotX32.parse(result.text);
    for(const change of result.changes){
      const description=x32DescribeChange(change,original,updated),item=document.createElement('li'),title=document.createElement('strong');title.textContent=description.title;item.append(title);
      for(const detail of description.details){const line=document.createElement('span');line.textContent=detail;item.append(line);}
      list.append(item);
    }
    host.append(list);const warnings=document.createElement('ul');warnings.className='sp-x32-warnings';x32Warnings(result.warnings,warnings);host.append(warnings);
    x32Prepared={...result,snapshot:snapshot(),mappings:JSON.stringify(mappings)};
    $('sp-x32-download').hidden=false;$('sp-x32-status').textContent=result.changes.length?'Export geprüft. Änderungen ansehen und die Szene herunterladen.':'Keine Änderungen: Der Download entspricht exakt der Vorlage.';
  }catch(error){x32Error('Export nicht vorbereitet: '+error.message);}
});
$('sp-x32-download').addEventListener('click',()=>{
  try{
    if(sharedReadOnly||!x32Prepared||x32Prepared.snapshot!==snapshot()||x32Prepared.mappings!==JSON.stringify(x32CurrentMappings()))throw Error('Das Projekt hat sich geändert. Bitte den Export erneut vorbereiten.');
    const filename=exportModel.safeFilename(stage.title+'-X32',{extension:'scn'});
    downloadBlob(new Blob([x32Prepared.text],{type:'text/plain;charset=utf-8'}),filename);
    $('sp-x32-status').textContent='X32-Szene heruntergeladen.';
  }catch(error){x32InvalidateExport();x32Error(error.message);}
});
$('sp-x32-remove').addEventListener('click',()=>{
  if(!stage.x32Scene||sharedReadOnly)return;
  confirmSetupAction('X32-Vorlage entfernen?','Die Kanal- und Buslisten bleiben im Projekt. Für einen weiteren X32-Export wird wieder eine Szene als Vorlage benötigt.','Vorlage entfernen',()=>{
    x32Commit(()=>{delete stage.x32Scene;for(const direction of ['inputs','outputs'])x32ClearBindings(stage.routing[direction]);},'X32-Vorlage entfernt.');
    x32Pending=null;x32InvalidateExport();$('sp-x32-preview').hidden=true;x32RenderAttached();
  },true);
});
