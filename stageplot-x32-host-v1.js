// Embedded in the app closure; scene edits share the existing project/undo store.
let x32Pending=null,x32Prepared=null,x32ReadGeneration=0;
function x32Error(message=''){
  const error=$('sp-x32-error');error.textContent=message;error.hidden=!message;
  if(x32Pending)$('sp-x32-import').parentElement.prepend(error);
  else $('sp-x32-import-options').before(error);
  if(message){error.tabIndex=-1;error.focus({preventScroll:true});error.scrollIntoView({block:'nearest'});}
}
function x32InvalidateExport(){
  x32Prepared=null;$('sp-x32-download').hidden=true;$('sp-x32-changes').replaceChildren();
}
function x32ClearBindings(rows){
  for(const row of rows){
    if(row.x32?.kind==='output'){if(!row.instrument)row.instrument=row.x32.label||'Ausgang';if(!row.notes)row.notes=[row.x32.label,row.x32.sourceLabel].filter(Boolean).join(' ← ');}
    if(row.x32?.kind==='aux'&&!row.notes)row.notes='X32 Aux '+row.x32.channel;
    delete row.x32;if(Array.isArray(row.linkedSources))x32ClearBindings(row.linkedSources);
  }
}
function x32Warnings(messages,host){
  host.replaceChildren();
  for(const message of messages||[]){const item=document.createElement('li');item.textContent=message;host.append(item);}
  host.hidden=!host.children.length;
}
function x32RenderPreview(text){
  const inventory=StageplotX32.inspectRouting(text);
  $('sp-x32-summary').textContent=inventory.inputs.length+' Inputs · '+inventory.buses.length+' Mixbusse · '+inventory.outputs.length+' Ausgangsadressen';
  const body=$('sp-x32-preview-body');body.replaceChildren();
  for(const [label,name,source,format] of [...inventory.inputs.map(input=>[input.kind==='channel'?'CH '+input.number:'Aux '+input.number,input.name,input.sourceAddress.label,input.linkedWith?'Stereo':'Mono']),...inventory.buses.map(bus=>['Bus '+bus.number,bus.name,bus.fxSlots.length?'→ FX '+bus.fxSlots.join(', '):'Interner Mixbus',bus.linkedWith?'Stereo':'Mono']),...inventory.outputs.filter(output=>output.bank==='local').map(output=>[output.label,'',output.source.label,output.tap])]){
    const tr=document.createElement('tr');for(const value of [label,name,source,format]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);
  }
  x32Warnings(inventory.warnings,$('sp-x32-warnings'));$('sp-x32-preview').hidden=false;
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
    const banks=StageplotStageboxes.get(box.type)?.protocol==='AES50'?[['','Bitte zuordnen'],['aes50-a','AES50 A'],['aes50-b','AES50 B']]:[['','Bitte zuordnen'],['local','Lokale Eingänge'],['aes50-a','AES50 A'],['aes50-b','AES50 B'],['card','Card / USB-Karte']];
    for(const [value,text] of banks){
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
  if(change.path.startsWith('/ch/'))return {title:'CH '+Number(change.path.split('/')[2])+' · '+change.path.split('/').slice(3).join('/'),details:[change.after||'Parameter entfernt']};
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
  finishEdit();x32CloseSocket();x32Pending=null;x32ReadGeneration++;x32InvalidateExport();x32Error();
  $('sp-x32-status').textContent='';$('sp-x32-file').value='';$('sp-x32-import-options').hidden=true;$('sp-x32-preview').hidden=true;
  x32RenderAttached();if(stage.x32Scene)x32RenderPreview(stage.x32Scene.text);
  $('sp-x32-dialog').showModal();
}
function x32Commit(fn,message){
  if(sharedReadOnly)throw Error('Diese Freigabe ist schreibgeschützt.');
  const before=snapshot();fn();keepHistory(before);renderRouting();say(message);$('sp-x32-status').textContent=message;
}
const x32BusRoles=[['unspecified','Noch offen'],['monitor','Bühnenmonitor'],['iem','In-Ear'],['subgroup','Subgruppe'],['fx','Effekt-Send'],['line','Weiterer Mix']];
function x32WizardDefaults(inventory){
  const named=new Set(inventory.inputs.filter(input=>input.name&&!/^(?:Aux|USB|Input|Ch)\s*\d+$/i.test(input.name)).map(input=>input.id));
  for(const input of inventory.inputs)if(named.has(input.id)&&input.linkedWith)named.add(input.kind+'-'+input.linkedWith);
  return {version:1,inputIds:[...named],inputAssignments:[],busRoles:inventory.buses.map(bus=>({bus:bus.number,role:bus.roles.includes('fx-send')?'fx':bus.roles.includes('subgroup')?'subgroup':'unspecified'})),outputAssignments:inventory.outputs.filter(output=>['local','aux'].includes(output.bank)&&output.resolved&&output.source.kind!=='off').map(output=>({outputId:output.id,destination:'',stagebox:'',port:null}))};
}
function x32BeginWizard(attachment,editing=false){
  const inventory=StageplotX32.inspectRouting(attachment.text),wizard=attachment.wizard?clone(attachment.wizard):x32WizardDefaults(inventory);
  if(editing){
    for(const input of inventory.inputs){
      const row=stage.routing.inputs.find(row=>row.x32?.kind===input.kind&&row.x32.channel===input.number),mapping=attachment.mappings.find(mapping=>mapping.stagebox===row?.stagebox);
      if(mapping&&row?.stageboxPort&&StageplotX32.BANKS[mapping.bank])input.sourceAddress={bank:mapping.bank,port:row.stageboxPort+mapping.offset,label:'Geplant: '+StageplotX32.BANKS[mapping.bank].label+' '+(row.stageboxPort+mapping.offset),resolved:true};
    }
    const existingInputs=stage.routing.inputs.filter(row=>['channel','aux'].includes(row.x32?.kind));
    if(attachment.wizard||existingInputs.length){
    wizard.inputIds=stage.routing.inputs.filter(row=>['channel','aux'].includes(row.x32?.kind)).map(row=>row.x32.kind+'-'+row.x32.channel);
    wizard.inputAssignments=stage.routing.inputs.filter(row=>['channel','aux'].includes(row.x32?.kind)).map(row=>{const saved=wizard.inputAssignments.find(item=>item.inputId===row.x32.kind+'-'+row.x32.channel);return {...saved,inputId:row.x32.kind+'-'+row.x32.channel,stagebox:row.stagebox||'',port:row.stagebox?row.stageboxPort||null:null,...(row.stagebox?{connection:'stagebox',directPort:null}:row.x32.directPort?{connection:'direct',directPort:row.x32.directPort}:{})};});
    }
    if(attachment.wizard)wizard.outputAssignments=stage.routing.outputs.filter(row=>row.x32?.kind==='output').map(row=>({outputId:row.x32.endpoint,destination:row.instrument||'',stagebox:row.stagebox||'',port:row.stageboxPort||null}));
  }
  x32Pending={attachment,inventory,wizard,owner:stage,step:0,editing,newBoxes:[],boxMappings:clone(attachment.mappings),inputChooser:null,moreModels:null,allOutputs:false,bulk:{box:'',bank:'aes50-a',first:1},bulkOpen:false,bulkPreview:null,bulkNotice:''};
  $('sp-x32-mode').value=editing||!stage.routing.inputs.length&&!stage.routing.outputs.length?'routing':'template';
  $('sp-x32-mode').querySelector('[value="routing"]').textContent='Routing importieren · Inputs und Ausgangsziele auswählen';
  $('sp-x32-mode').querySelector('[value="template"]').textContent='Exportvorlage hinterlegen · vorhandenes Routing behalten';
  $('sp-x32-mode').disabled=editing;
  $('sp-x32-import-options').hidden=false;$('sp-x32-attached').hidden=true;$('sp-x32-preview').hidden=true;
  x32RenderWizard();
}
let x32Socket=null;
function x32WizardBoxes(){
  return [...allRoutingStageboxes(),...(x32Pending?.newBoxes||[]).map(box=>({id:box.id,name:box.label,type:box.type,...stageboxCapacity[box.type]}))];
}
function x32CompatibleBox(box){const model=StageplotStageboxes.get(box.type);return !model||model.protocol==='AES50';}
function x32CreateWizardBox(type){
  const model=StageplotStageboxes.get(type);if(model?.protocol!=='AES50'||!isObjectUnlocked(type))throw Error('Bitte eine verfügbare AES50-Stagebox wählen.');
  const id='station-x32-'+routeToken(),index=x32Pending.newBoxes.length,box=makeObject(type,{x:Math.max(.5,stage.w-1-index*.6),y:Math.max(.5,stage.d-.5)},id);
  const used=new Set(x32WizardBoxes().map(item=>item.name));let label=model.name,n=2;while(used.has(label))label=model.name+' '+n++;box.label=label;
  x32Pending.newBoxes.push(box);return {id,name:label,type,...stageboxCapacity[type]};
}
function x32BulkPlan(){
  const {bulk,inventory,wizard}=x32Pending,newType=bulk.box.startsWith('new:')?bulk.box.slice(4):'',model=StageplotStageboxes.get(newType);
  const box=newType&&model?.protocol==='AES50'?{id:'',type:newType,name:model.name,inputs:model.inputs}:x32WizardBoxes().find(item=>item.id===bulk.box);
  if(!box||!x32CompatibleBox(box))throw Error('Bitte zuerst die vorhandene Stagebox oder ein neues Modell auswählen.');
  const first=Number(bulk.first);if(!Number.isInteger(first)||first<1||first+box.inputs-1>48)throw Error('Der Eingangsblock muss vollständig innerhalb der AES50-Adressen 1 bis 48 liegen.');
  const rows=inventory.inputs.filter(input=>wizard.inputIds.includes(input.id)&&x32InputCanPatch(input)&&input.sourceAddress.bank===bulk.bank&&input.sourceAddress.port>=first&&input.sourceAddress.port<first+box.inputs).map(input=>({input,port:input.sourceAddress.port-first+1}));
  const conflicts=[],candidateIds=new Set(rows.map(row=>row.input.id)),mapping=x32Pending.boxMappings.find(item=>item.stagebox===box.id);
  if(!rows.length)conflicts.push('Keiner der ausgewählten Inputs verwendet diesen AES50-Block.');
  for(const assignment of wizard.inputAssignments){
    if(!box.id||assignment.stagebox!==box.id||!wizard.inputIds.includes(assignment.inputId)||candidateIds.has(assignment.inputId)||assignment.connection==='direct')continue;
    const other=inventory.inputs.find(input=>input.id===assignment.inputId);
    if(mapping&&(mapping.bank!==bulk.bank||mapping.offset!==first-1))conflicts.push((other?.label||assignment.inputId)+' ist bereits an dieser Stagebox zugeordnet. Der neue Block würde dessen Quelle ändern.');
    for(const row of rows)if(assignment.port===row.port&&!x32SameInputSource(row.input,other))conflicts.push('IN '+row.port+' ist bereits mit '+(other?.label||assignment.inputId)+' belegt.');
  }
  return {box,newType,bank:bulk.bank,first,rows,conflicts:[...new Set(conflicts)]};
}
function x32RenderBulk(){
  const {bulk,bulkPreview:preview,bulkNotice}=x32Pending,boxes=x32WizardBoxes().filter(box=>box.inputs&&x32CompatibleBox(box));
  return '<details class="sp-x32-bulk"'+(x32Pending.bulkOpen?' open':'')+'><summary>Mehrere Inputs einer Stagebox zuordnen</summary><p>Wähle die tatsächliche Hardware und ihren AES50-Eingangsblock. Es werden nur die zuvor ausgewählten Inputs dieses Blocks zugeordnet.</p><div class="sp-x32-bulk-fields"><label>Stagebox<select data-x32-bulk="box"><option value="">Hardware auswählen</option>'+boxes.map(box=>'<option value="'+esc(box.id)+'"'+(bulk.box===box.id?' selected':'')+'>'+esc(box.name)+'</option>').join('')+StageplotStageboxes.models.filter(model=>model.protocol==='AES50'&&isObjectUnlocked(model.type)).map(model=>'<option value="new:'+model.type+'"'+(bulk.box==='new:'+model.type?' selected':'')+'>Neu: '+esc(model.name)+' · '+model.inputs+' In</option>').join('')+'</select></label><label>Anschluss<select data-x32-bulk="bank"><option value="aes50-a"'+(bulk.bank==='aes50-a'?' selected':'')+'>AES50 A</option><option value="aes50-b"'+(bulk.bank==='aes50-b'?' selected':'')+'>AES50 B</option></select></label><label>IN 1 entspricht Adresse<input type="number" min="1" max="48" step="1" value="'+esc(bulk.first)+'" data-x32-bulk="first"></label></div><button type="button" class="sp-button" data-x32-bulk-preview>Zuordnung prüfen</button>'+(preview?'<section class="sp-x32-bulk-preview" tabindex="-1"><h4>'+esc(StageplotX32.BANKS[preview.bank].label)+' '+preview.first+'–'+(preview.first+preview.box.inputs-1)+' → '+esc(preview.box.name)+' IN 1–'+preview.box.inputs+'</h4>'+ (preview.rows.length?'<ul>'+preview.rows.map(row=>'<li>'+esc(row.input.label)+' → '+esc(preview.box.name)+' IN '+row.port+'</li>').join('')+'</ul>':'')+(preview.conflicts.length?'<ul class="sp-x32-warnings">'+preview.conflicts.map(message=>'<li>'+esc(message)+'</li>').join('')+'</ul>':'<p>'+preview.rows.length+' Inputs werden zugeordnet. Bisherige Einzelzuordnungen dieser Inputs werden ersetzt.</p>')+'<button type="button" class="sp-button" data-x32-bulk-apply'+(preview.conflicts.length?' disabled':'')+'>Diese Zuordnung vormerken</button></section>':'')+(bulkNotice?'<p class="sp-x32-bulk-notice" role="status">'+esc(bulkNotice)+'</p>':'')+'</details>';
}
function x32InputAssignment(input){
  let assignment=x32Pending.wizard.inputAssignments.find(item=>item.inputId===input.id);
  if(!assignment){assignment={inputId:input.id,stagebox:'',port:null};x32Pending.wizard.inputAssignments.push(assignment);}
  if(!assignment.connection)assignment.connection=assignment.stagebox||input.sourceAddress.bank.startsWith('aes50-')?'stagebox':'direct';
  if(assignment.connection==='direct'&&input.sourceAddress.bank==='local'&&assignment.directPort==null)assignment.directPort=input.sourceAddress.port;
  return assignment;
}
function x32InputCanPatch(input){return input.kind==='channel'&&input.sourceAddress.resolved&&['local','aes50-a','aes50-b'].includes(input.sourceAddress.bank);}
function x32RenderInputPatch(input){
  const assignment=x32InputAssignment(input),boxes=x32WizardBoxes().filter(box=>box.inputs&&x32CompatibleBox(box)),selected=boxes.find(box=>box.id===assignment.stagebox),canPatch=x32InputCanPatch(input);
  const direct=assignment.connection==='direct',showChoices=!direct&&(x32Pending.inputChooser===input.id||!selected),more=x32Pending.moreModels===input.id;
  const pill=(mode,label)=>'<button type="button" data-x32-input-mode="'+mode+'" data-x32-input="'+input.id+'" aria-pressed="'+(canPatch&&assignment.connection===mode)+'"'+(!canPatch?' disabled':'')+'>'+label+'</button>';
  const selection=showChoices?'<div class="sp-x32-box-options">'+boxes.map(box=>'<button type="button" class="sp-x32-box-option" data-x32-existing-box="'+esc(box.id)+'" data-x32-input="'+input.id+'"><strong>'+esc(box.name)+'</strong><small>'+box.inputs+' In · '+box.outputs+' Out'+(x32Pending.newBoxes.some(item=>item.id===box.id)?' · neu':'')+'</small></button>').join('')+(boxes.length&&!more?'<button type="button" class="sp-x32-add-more" data-x32-more-boxes="'+input.id+'">+ Weitere Stagebox</button>':'')+(!boxes.length||more?'<div class="sp-x32-model-options">'+StageplotStageboxes.models.filter(model=>model.protocol==='AES50').map(model=>'<button type="button" data-x32-add-box="'+model.type+'" data-x32-input="'+input.id+'"><strong>'+model.name+'</strong><small>'+model.inputs+' In · '+model.outputs+' Out</small></button>').join('')+'</div>':'')+'</div>':'';
  const port=direct?(assignment.directPort??(input.sourceAddress.bank==='aux'?input.sourceAddress.port:null)):assignment.port;
  return '<article class="sp-x32-wizard-row sp-x32-input-row" data-x32-input-row="'+input.id+'"><div class="sp-x32-input-name"><strong>'+esc(input.label)+'</strong><small>'+esc(input.sourceAddress.label)+'</small></div><div class="sp-x32-input-control"><span class="sp-x32-field-label">Input</span><div class="sp-x32-input-pills" role="group" aria-label="Input für '+esc(input.label)+'">'+pill('direct','Pult direkt')+pill('stagebox','Stagebox')+'</div>'+(!direct&&selected?'<button type="button" class="sp-x32-current-box" data-x32-choose-box="'+input.id+'">'+esc(selected.name)+' <span aria-hidden="true">⌄</span></button>':'')+selection+(!canPatch?'<small>Quelle aus der Szene · '+esc(input.sourceAddress.label)+'</small>':'')+'</div><div class="sp-x32-input-jack"><span class="sp-x32-field-label">Buchse</span>'+(direct?'<output data-x32-direct-port="'+input.id+'" aria-label="'+esc(input.label)+' · Buchse am Pult">'+esc(port??'—')+'</output>':'<button type="button" class="sp-button" data-x32-input-socket="'+input.id+'" aria-label="Buchse für '+esc(input.label)+' wählen"'+(!selected?' disabled':'')+'>'+esc(port??'Wählen')+'</button>')+'</div></article>';
}
function x32SuggestBoxMapping(input,box){
  const model=StageplotStageboxes.get(box.type),address=input.sourceAddress;
  const saved=x32Pending.boxMappings.find(mapping=>mapping.stagebox===box.id);if(saved&&(model?.protocol!=='AES50'||saved.bank.startsWith('aes50-')))return {...saved};
  const bank=model?.protocol==='AES50'?(address.bank.startsWith('aes50-')?address.bank:'aes50-a'):StageplotX32.BANKS[address.bank]?address.bank:'aes50-a';
  const offset=address.bank===bank&&address.port>box.inputs?Math.floor((address.port-1)/box.inputs)*box.inputs:0;
  return {stagebox:box.id,bank,offset};
}
function x32SocketOccupant(boxId,port,input){
  return x32Pending.wizard.inputAssignments.find(item=>item.inputId!==input.id&&x32Pending.wizard.inputIds.includes(item.inputId)&&item.stagebox===boxId&&item.port===port&&item.connection!=='direct');
}
function x32SameInputSource(left,right){return left?.sourceAddress.resolved&&right?.sourceAddress.resolved&&left.sourceAddress.bank===right.sourceAddress.bank&&left.sourceAddress.port===right.sourceAddress.port;}
function x32RenderSocket(){
  if(!x32Socket||!x32Pending)return;
  const {inputId,boxId,mapping}=x32Socket,input=x32Pending.inventory.inputs.find(item=>item.id===inputId),box=x32WizardBoxes().find(item=>item.id===boxId),assignment=x32InputAssignment(input),model=StageplotStageboxes.get(box.type);
  $('sp-x32-socket-title').textContent=box.name+' · '+input.label;
  $('sp-x32-socket-description').textContent='Klicke auf die Eingangsbuchse für diesen Kanal. Markierte Buchsen sind bereits zugeordnet.';
  const banks=model?.protocol==='AES50'?[['aes50-a','AES50 A'],['aes50-b','AES50 B']]:[['local','Lokale Eingänge'],['aes50-a','AES50 A'],['aes50-b','AES50 B'],['card','Card / USB']];
  $('sp-x32-socket-bank').innerHTML=banks.map(([value,label])=>'<option value="'+value+'"'+(value===mapping.bank?' selected':'')+'>'+label+'</option>').join('');
  $('sp-x32-socket-first').value=String(mapping.offset+1);$('sp-x32-socket-first').max=String(StageplotX32.BANKS[mapping.bank].limit);
  const renderPort=(_,port)=>{
    const occupant=x32SocketOccupant(boxId,port,input),other=x32Pending.inventory.inputs.find(item=>item.id===occupant?.inputId),conflict=occupant&&!x32SameInputSource(input,other),active=assignment.stagebox===boxId&&assignment.port===port;
    const label='Buchse '+port+(other?' · '+other.label:' · frei');
    return '<button type="button" class="sp-stagebox-image-port" data-x32-socket-port="'+port+'" data-used="'+!!occupant+'" data-selected="'+active+'" aria-pressed="'+active+'" aria-label="'+esc(label)+'"'+(conflict?' disabled':'')+'><span class="sp-stagebox-port-number">'+port+'</span><span class="sp-stagebox-port-name">'+esc(label)+'</span></button>';
  };
  $('sp-x32-socket-body').innerHTML=model?StageplotStageboxes.surface(box.type,renderPort,['inputs']):'<div class="sp-x32-socket-grid">'+Array.from({length:box.inputs},(_,index)=>renderPort('inputs',index+1).replace('sp-stagebox-image-port','sp-x32-generic-port')).join('')+'</div>';
  $('sp-x32-socket-error').hidden=true;
}
function x32OpenSocket(inputId,boxId,opener){
  const input=x32Pending.inventory.inputs.find(item=>item.id===inputId),box=x32WizardBoxes().find(item=>item.id===boxId);
  if(!input||!box||!x32InputCanPatch(input)||!x32CompatibleBox(box))return;
  x32Socket={inputId,boxId,mapping:x32SuggestBoxMapping(input,box),opener};x32RenderSocket();
  $('sp-x32-socket-dialog').showModal();
}
function x32CloseSocket(){if($('sp-x32-socket-dialog').open)$('sp-x32-socket-dialog').close();}
$('sp-x32-socket-close').addEventListener('click',x32CloseSocket);
$('sp-x32-socket-dialog').addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const dialog=event.currentTarget,controls=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(element=>!element.disabled&&element.tabIndex>=0&&element.getClientRects().length);
  if(!controls.length)return;
  // Explicit traversal also includes buttons when WebKit's native tab policy skips them.
  event.preventDefault();
  const current=controls.indexOf(document.activeElement),next=current<0?(event.shiftKey?controls.length-1:0):(current+(event.shiftKey?-1:1)+controls.length)%controls.length;
  controls[next].focus({preventScroll:true});
});
$('sp-x32-socket-dialog').addEventListener('close',()=>{
  const previous=x32Socket;x32Socket=null;
  if(!x32Pending||!$('sp-x32-dialog').open)return;
  if(previous&&!x32Pending.wizard.inputAssignments.some(item=>item.stagebox===previous.boxId))x32Pending.newBoxes=x32Pending.newBoxes.filter(box=>box.id!==previous.boxId);
  const target=previous?.opener?.isConnected?previous.opener:$('sp-x32-wizard-body').querySelector('[data-x32-input-socket="'+previous?.inputId+'"]');target?.focus({preventScroll:true});
});
$('sp-x32-socket-dialog').addEventListener('click',event=>{if(event.target===$('sp-x32-socket-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)x32CloseSocket();}});
$('sp-x32-socket-bank').addEventListener('change',()=>{if(x32Socket){x32Socket.mapping.bank=$('sp-x32-socket-bank').value;x32RenderSocket();}});
$('sp-x32-socket-first').addEventListener('input',()=>{if(x32Socket)x32Socket.mapping.offset=Number($('sp-x32-socket-first').value)-1;});
$('sp-x32-socket-body').addEventListener('click',event=>{
  const button=event.target.closest('[data-x32-socket-port]');if(!button||!x32Pending||!x32Socket)return;
  try{
    const {inputId,boxId,mapping}=x32Socket,port=Number(button.dataset.x32SocketPort),input=x32Pending.inventory.inputs.find(item=>item.id===inputId),box=x32WizardBoxes().find(item=>item.id===boxId),other=x32SocketOccupant(boxId,port,input),limit=StageplotX32.BANKS[mapping.bank]?.limit;
    if(!Number.isInteger(mapping.offset)||mapping.offset<0||!limit||mapping.offset+port>limit)throw Error('Bitte eine gültige erste Eingangsadresse für diesen Anschluss wählen.');
    if(!Number.isInteger(port)||port<1||port>box.inputs||other&&!x32SameInputSource(input,x32Pending.inventory.inputs.find(item=>item.id===other.inputId)))throw Error('Diese Buchse ist bereits einem anderen Signal zugeordnet.');
    const assigned=x32InputAssignment(input);delete assigned.directPort;Object.assign(assigned,{connection:'stagebox',stagebox:boxId,port});
    x32Pending.boxMappings=x32Pending.boxMappings.filter(item=>item.stagebox!==boxId);x32Pending.boxMappings.push({...mapping});
    x32Pending.inputChooser=null;x32Pending.moreModels=null;
    x32RenderWizard();x32CloseSocket();
  }catch(error){$('sp-x32-socket-error').textContent=error.message;$('sp-x32-socket-error').hidden=false;}
});
function x32HandleInputClick(event){
  const button=event.target.closest('button');if(!button||!x32Pending)return false;
  const inputId=button.dataset.x32Input||button.dataset.x32ChooseBox||button.dataset.x32MoreBoxes||button.dataset.x32InputSocket;
  const input=x32Pending.inventory.inputs.find(item=>item.id===inputId);if(!input)return false;
  if(button.dataset.x32InputMode){
    const assignment=x32InputAssignment(input);if(!x32InputCanPatch(input))return true;
    assignment.connection=button.dataset.x32InputMode;
    if(assignment.connection==='direct'){assignment.stagebox='';assignment.port=null;assignment.directPort=input.sourceAddress.bank==='local'?input.sourceAddress.port:input.number;x32Pending.inputChooser=null;}
    else {delete assignment.directPort;x32Pending.inputChooser=input.id;}
    x32RenderWizard();$('sp-x32-wizard-body').querySelector('[data-x32-input-mode="'+assignment.connection+'"][data-x32-input="'+inputId+'"]')?.focus({preventScroll:true});return true;
  }
  if(button.dataset.x32ChooseBox||button.dataset.x32MoreBoxes){x32Pending.inputChooser=inputId;if(button.dataset.x32MoreBoxes)x32Pending.moreModels=inputId;x32RenderWizard();return true;}
  if(button.dataset.x32ExistingBox){x32OpenSocket(inputId,button.dataset.x32ExistingBox,button);return true;}
  if(button.dataset.x32InputSocket){const assignment=x32InputAssignment(input);if(assignment.stagebox)x32OpenSocket(inputId,assignment.stagebox,button);return true;}
  if(button.dataset.x32AddBox){
    const model=StageplotStageboxes.get(button.dataset.x32AddBox);if(model?.protocol!=='AES50'||!isObjectUnlocked(model.type))return true;
    const box=x32CreateWizardBox(model.type);x32OpenSocket(inputId,box.id,button);return true;
  }
  return false;
}

function x32WizardPatchFields(id,direction,assignment){
  const boxes=x32WizardBoxes().filter(box=>box[direction==='input'?'inputs':'outputs']>0),selected=assignment?.stagebox||'';
  return '<label>Stagebox<select data-x32-'+direction+'-box="'+esc(id)+'"><option value="">Zuordnung offen / direkt am Pult</option>'+boxes.map(box=>'<option value="'+esc(box.id)+'"'+(box.id===selected?' selected':'')+'>'+esc(box.name)+'</option>').join('')+'</select></label><label>Buchse<input type="number" min="1" max="64" step="1" data-x32-'+direction+'-port="'+esc(id)+'" value="'+esc(assignment?.port||'')+'" placeholder="—"'+(!selected?' disabled':'')+'></label>';
}
function x32ReadWizardStep(){
  const pending=x32Pending;if(!pending)return;const {wizard,inventory,step}=pending,host=$('sp-x32-wizard-body');
  if(step===0&&host.querySelector('[data-x32-input-id]')){
    const ids=new Set([...host.querySelectorAll('[data-x32-input-id]:checked')].map(input=>input.dataset.x32InputId));
    for(const input of inventory.inputs)if(ids.has(input.id)&&input.linkedWith)ids.add(input.kind+'-'+input.linkedWith);
    wizard.inputIds=[...ids];
  }
  if(step===2)wizard.busRoles=[...host.querySelectorAll('[data-x32-bus-role]')].map(select=>({bus:Number(select.dataset.x32BusRole),role:select.value}));
  if(step===3)wizard.outputAssignments=[...host.querySelectorAll('[data-x32-output-id]:checked')].map(input=>{
    const id=input.dataset.x32OutputId,stagebox=host.querySelector('[data-x32-output-box="'+id+'"]').value;
    return {outputId:id,destination:host.querySelector('[data-x32-output-destination="'+id+'"]').value.trim(),stagebox,port:stagebox?Number(host.querySelector('[data-x32-output-port="'+id+'"]').value)||null:null};
  });
}
function x32ValidateWizardAssignments(wizard,inventory,direction){
  const assignments=wizard[direction+'Assignments'],boxes=x32WizardBoxes(),used=new Map(),inputIds=new Set(wizard.inputIds);
  for(const assignment of assignments){
    if(direction==='input'&&!inputIds.has(assignment.inputId)||!assignment.stagebox)continue;
    const box=boxes.find(box=>box.id===assignment.stagebox),port=assignment.port;
    if(direction==='input'){const input=inventory.inputs.find(input=>input.id===assignment.inputId);if(!input?.sourceAddress.resolved||!StageplotX32.BANKS[input.sourceAddress.bank])throw Error((input?.label||'Dieser Eingang')+': Die Quelle kann keiner Stagebox zugeordnet werden. Bitte die Zuordnung offen lassen.');}
    if(direction==='output'){const output=inventory.outputs.find(output=>output.id===assignment.outputId);if(['card','p16','aes','rec'].includes(output?.bank))throw Error(output.label+': Bitte das digitale Ziel benennen und die analoge Stagebox-Zuordnung offen lassen.');}
    if(!box)throw Error('Die zugeordnete Stagebox ist nicht mehr vorhanden.');
    if(!Number.isInteger(port)||port<1||port>box[direction==='input'?'inputs':'outputs'])throw Error(box.name+': Bitte eine gültige '+(direction==='input'?'Eingangs':'Ausgangs')+'buchse zwischen 1 und '+box[direction==='input'?'inputs':'outputs']+' wählen.');
    const key=box.id+':'+port,previous=used.get(key),id=assignment[direction+'Id'];
    if(previous){
      const a=inventory.inputs.find(input=>input.id===previous)?.sourceAddress,b=inventory.inputs.find(input=>input.id===id)?.sourceAddress;
      if(direction!=='input'||!a?.resolved||!b?.resolved||a.bank!==b.bank||a.port!==b.port)throw Error(box.name+' · Buchse '+port+' wurde mehrfach für unterschiedliche Signale gewählt.');
    }
    used.set(key,id);
  }
}
function x32RenderWizard(){
  if(!x32Pending)return;
  const {inventory,wizard,step}=x32Pending,selected=new Set(wizard.inputIds),host=$('sp-x32-wizard-body');
  const template=$('sp-x32-mode').value==='template';
  const titles=['Szene prüfen und Inputs auswählen','Wo sind die Eingänge angeschlossen?','Wofür werden die Busse verwendet?','Wohin führen die Ausgänge?'];
  $('sp-x32-step-title').textContent=template?'Exportvorlage hinterlegen':(step+1)+' / 4 · '+titles[step];
  $('sp-x32-step-title').focus({preventScroll:true});
  $('sp-x32-step-progress').hidden=template;
  $('sp-x32-step-progress').textContent=['Inputs','Anschlüsse','Busse','Outputs'].map((name,index)=>(index===step?'● ':'○ ')+name).join('  ›  ');
  $('sp-x32-back').hidden=step===0||template;
  $('sp-x32-next').textContent=['Weiter: Anschlüsse','Weiter: Busse','Weiter: Ausgänge','Weiter'][step];
  $('sp-x32-next').hidden=step===3||template;$('sp-x32-import').hidden=step!==3&&!template;$('sp-x32-import').disabled=false;
  $('sp-x32-mode-field').hidden=step!==0;
  $('sp-x32-import').textContent=template?'Exportvorlage speichern':x32Pending.editing?'Zuordnungen übernehmen':'I/O-Routing übernehmen';
  if(template){
    host.innerHTML='<div class="sp-x32-template-summary"><p><strong>'+esc(x32Pending.attachment.filename)+'</strong></p><p>Die Szene wird im Projekt als Ausgangsdatei für den X32-Export gespeichert.</p><p>Die vorhandenen '+stage.routing.inputs.length+' Inputs und '+stage.routing.outputs.length+' Outputs bleiben erhalten. Bestehende X32-Kanalbindungen werden gelöst; beim Export gelten die Kanalnummern deiner Routingliste.</p><p class="sp-muted">Für die Übernahme der Szenenkanäle wähle oben „Routing importieren“.</p></div>';
  }else if(step===0){
    host.innerHTML='<p><strong>'+esc(inventory.scene.name||'X32-Szene')+'</strong> · '+inventory.inputs.length+' Inputs · '+inventory.buses.length+' Mixbusse · '+inventory.outputs.length+' Ausgangsadressen</p><p>Welche Inputs brauchst du in der Routingliste? Stereo-Partner bleiben zusammen. Die vollständige Szene bleibt erhalten.</p><div class="sp-actions"><button type="button" class="sp-button" data-x32-input-selection="all">Alle auswählen</button><button type="button" class="sp-button" data-x32-input-selection="named">Benannte Inputs</button></div><div class="sp-x32-scroll"><table><thead><tr><th>Übernehmen</th><th>Input</th><th>Quelle aus Szene</th><th>Format</th></tr></thead><tbody>'+inventory.inputs.map(input=>'<tr><td><input type="checkbox" data-x32-input-id="'+input.id+'" aria-label="'+esc(input.label)+' übernehmen"'+(selected.has(input.id)?' checked':'')+'></td><td>'+esc(input.label)+'</td><td>'+esc(input.sourceAddress.label)+'</td><td>'+(input.linkedWith?'Stereo mit '+input.linkedWith:'Mono')+'</td></tr>').join('')+'</tbody></table></div><p class="sp-muted">„I/O-Routing übernehmen“ ersetzt die bisherigen Routinglisten. Bühnenobjekte bleiben erhalten. Die gesamte Übernahme lässt sich rückgängig machen.</p>';
  }else if(step===1){
    host.innerHTML='<p>Wähle pro Kanal <strong>Pult direkt</strong> oder <strong>Stagebox</strong>. Bei direktem Anschluss steht die Buchse aus der Szene bereits dabei.</p>'+x32RenderBulk()+inventory.inputs.filter(input=>selected.has(input.id)).map(x32RenderInputPatch).join('');
  }else if(step===2){
    host.innerHTML='<p>Bestätige die Verwendung der Mixbusse. Erkannte Effekt- und Subgruppenwege sind vorbelegt. Monitor oder In-Ear legst du selbst fest; Busnummer und Ausgangsbuchse sind unabhängig.</p>'+inventory.buses.map(bus=>'<article class="sp-x32-wizard-row sp-x32-bus-row"><div><strong>'+esc(bus.label)+'</strong><small>'+esc([bus.linkedWith?'Stereo mit Bus '+bus.linkedWith:'Mono',bus.fxSlots.length?'speist FX '+bus.fxSlots.join(', '):'',bus.main.stereo?'→ Main L/R':'',bus.insert?.enabled?'Insert '+bus.insert.source:''].filter(Boolean).join(' · '))+'</small></div><label>Verwendung<select data-x32-bus-role="'+bus.number+'">'+x32BusRoles.map(([value,label])=>'<option value="'+value+'"'+(wizard.busRoles.find(item=>item.bus===bus.number)?.role===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label></article>').join('')+'<p class="sp-muted">Diese Angaben beschreiben den Aufbau. Sie ändern weder Sends noch Effekte in der Szenendatei.</p>';
  }else{
    const visibleOutputs=inventory.outputs.filter(output=>x32Pending.allOutputs||output.source.kind!=='off'||wizard.outputAssignments.some(item=>item.outputId===output.id)),banks=[...new Set(visibleOutputs.map(output=>output.bank))];
    host.innerHTML='<p>Gezeigt werden Ausgänge mit einer Signalquelle und deine ausgewählten Ziele. Wähle die benötigten Ausgänge und gib das Ziel an, etwa „PA links“ oder „IEM Drums“.</p><label class="sp-x32-check sp-x32-output-filter"><input type="checkbox" data-x32-all-outputs'+(x32Pending.allOutputs?' checked':'')+'>Alle '+inventory.outputs.length+' Ausgangsadressen anzeigen</label>'+banks.map(bank=>{
      const outputs=visibleOutputs.filter(output=>output.bank===bank),chosen=outputs.filter(output=>wizard.outputAssignments.some(item=>item.outputId===output.id)).length;
      return '<details class="sp-x32-output-bank"'+(chosen||bank==='local'?' open':'')+'><summary>'+esc(({local:'Lokale XLR-Ausgänge','aes50-a':'AES50 A','aes50-b':'AES50 B',card:'Card / USB',aux:'Aux Out',p16:'Ultranet',aes:'AES/EBU',rec:'USB Recorder'})[bank]||bank)+' · '+outputs.length+' Adressen · '+chosen+' ausgewählt</summary>'+outputs.map(output=>{
        const assignment=wizard.outputAssignments.find(item=>item.outputId===output.id);
        return '<article class="sp-x32-output-row" data-selected="'+!!assignment+'"><label class="sp-x32-check"><input type="checkbox" data-x32-output-id="'+output.id+'"'+(assignment?' checked':'')+'><strong>'+esc(output.label)+'</strong></label><p>'+esc(output.source.label)+(output.tap?' · '+esc(output.tap):'')+(output.delay?.enabled?' · Delay '+output.delay.ms+' ms':'')+'</p><div class="sp-x32-output-fields"'+(!assignment?' hidden':'')+'><label>Ziel / Gerät<input maxlength="100" data-x32-output-destination="'+output.id+'" value="'+esc(assignment?.destination||'')+'" placeholder="Zuordnung noch offen"></label><div class="sp-x32-output-patch">'+x32WizardPatchFields(output.id,'output',assignment)+'</div></div></article>';
      }).join('')+'</details>';
    }).join('')+(!banks.length?'<p>In dieser Datei wurden keine physischen Ausgangszuordnungen gefunden. Interne Out-Slots bleiben in der I/O-Liste sichtbar.</p>':'')+'<p class="sp-muted">Die Zuordnungen werden lokal im Projekt gespeichert. Der Ausgangs-Patch der X32-Datei bleibt erhalten.</p>';
  }
  if(!template&&step===3){const summary=document.createElement('section');summary.id='sp-x32-import-summary';summary.className='sp-x32-import-summary';summary.setAttribute('aria-live','polite');host.append(summary);x32RenderImportSummary();}
  x32Warnings(inventory.warnings,$('sp-x32-wizard-warnings'));
}
function x32RenderImportSummary(){
  const host=$('sp-x32-import-summary');if(!host||!x32Pending)return;
  const {wizard,inventory,editing}=x32Pending,selected=new Set(wizard.inputIds),usedBoxes=new Set([...wizard.inputAssignments.filter(item=>selected.has(item.inputId)),...wizard.outputAssignments].map(item=>item.stagebox));
  const newBoxes=x32Pending.newBoxes.filter(box=>usedBoxes.has(box.id)),openInputs=inventory.inputs.filter(input=>selected.has(input.id)&&input.sourceAddress.bank.startsWith('aes50-')&&!wizard.inputAssignments.some(item=>item.inputId===input.id&&(item.stagebox||item.connection==='direct'))).length,openOutputs=wizard.outputAssignments.filter(item=>!item.destination).length;
  host.innerHTML='<h4>Beim Übernehmen</h4><p><strong>'+wizard.inputIds.length+' Inputs und '+wizard.outputAssignments.length+' Outputs</strong> ersetzen die bisherigen '+stage.routing.inputs.length+' Inputs und '+stage.routing.outputs.length+' Outputs.'+(newBoxes.length?' '+newBoxes.length+' neue Stagebox'+(newBoxes.length===1?' wird':'en werden')+' auf die Bühne gesetzt.':'')+'</p><p>'+(openInputs?openInputs+' Stagebox-Zuordnungen sind noch offen. ':'')+(openOutputs?openOutputs+' Ausgangsziele sind noch unbenannt. ':'')+(editing?'Die Zuordnungen':'Die Szene und Busangaben')+' werden im Projekt gespeichert. Die Übernahme lässt sich in einem Schritt rückgängig machen.</p>';
}
function x32WizardPlan(){
  x32ReadWizardStep();const {inventory,wizard,attachment,editing}=x32Pending;
  x32ValidateWizardAssignments(wizard,inventory,'input');x32ValidateWizardAssignments(wizard,inventory,'output');
  const mappings=new Map(x32Pending.boxMappings.map(mapping=>[mapping.stagebox,mapping]));
  const inputAssignments=wizard.inputAssignments.filter(item=>wizard.inputIds.includes(item.inputId)).map(item=>({...item}));
  for(const assignment of inputAssignments){
    if(!assignment.stagebox)continue;
    const input=inventory.inputs.find(input=>input.id===assignment.inputId),address=input?.sourceAddress;
    if(!mappings.has(assignment.stagebox)&&address?.resolved&&StageplotX32.BANKS[address.bank]){
      const offset=address.port-assignment.port;if(offset<0)throw Error('Die Stagebox-Buchse passt nicht zur Eingangsadresse. Bitte im Buchsen-Popup prüfen.');
      mappings.set(assignment.stagebox,{stagebox:assignment.stagebox,bank:address.bank,offset});
    }
    const mapping=mappings.get(assignment.stagebox),box=x32WizardBoxes().find(box=>box.id===assignment.stagebox);
    if(!mapping||mapping.offset+assignment.port>StageplotX32.BANKS[mapping.bank].limit)throw Error('Bitte den Pultanschluss dieser Stagebox im Buchsen-Popup zuordnen.');
    if(StageplotStageboxes.get(box?.type)?.protocol==='AES50'&&!mapping.bank.startsWith('aes50-'))throw Error(box.name+' benötigt AES50 A oder B. Bitte im Buchsen-Popup wählen.');
  }
  const baseRows=StageplotX32.importRouting(attachment.text,{includeUnnamed:true}).inputs;
  const inputs=inventory.inputs.filter(input=>wizard.inputIds.includes(input.id)).map(input=>{
    const previous=editing?stage.routing.inputs.find(row=>row.x32?.kind===input.kind&&row.x32.channel===input.number):null;
    const base=input.kind==='channel'?baseRows.find(row=>row.x32.channel===input.number):{id:'route-x32-aux-'+input.number,manual:true,edited:true,number:null,instrument:input.name,mode:input.linkedWith?'Stereo '+(input.number<input.linkedWith?'L':'R'):'Mono',stereoGroup:input.linkedWith?'x32-aux-'+Math.min(input.number,input.linkedWith)+'-'+Math.max(input.number,input.linkedWith):'',pickup:'Direct',signalType:'Line',connector:'Klinke',x32:{kind:'aux',channel:input.number,source:input.source}};
    const assignment=inputAssignments.find(item=>item.inputId===input.id);
    const x32={...(previous?.x32||base.x32)};delete x32.directPort;
    if(input.kind==='channel'&&assignment?.connection==='direct'&&assignment.directPort)x32.directPort=assignment.directPort;
    return {...base,...previous,x32,stagebox:assignment?.stagebox||'',stageboxPort:assignment?.stagebox?assignment.port:null};
  });
  const outputs=wizard.outputAssignments.map(assignment=>{
    const output=inventory.outputs.find(output=>output.id===assignment.outputId);if(!output)throw Error('Ein gewählter Ausgang ist nicht mehr in der Szene vorhanden.');
    const role=output.source.kind==='bus'?wizard.busRoles.find(item=>item.bus===output.source.number)?.role:'line',previous=editing?stage.routing.outputs.find(row=>row.x32?.kind==='output'&&row.x32.endpoint===output.id):null;
    return {...previous,id:'route-x32-'+output.id,manual:true,edited:true,sourceKey:'',number:null,instrument:assignment.destination,mode:'Mono',stereoGroup:'',pickup:'Direct',signalType:'Line',connector:output.bank==='aux'?'Klinke':['card','p16','aes','rec'].includes(output.bank)?'Digital':'XLR',outputKind:['monitor','iem'].includes(role)?role:'line',stagebox:assignment.stagebox,stageboxPort:assignment.port,x32:{kind:'output',endpoint:output.id,label:output.label,sourceLabel:output.source.label,sourceKind:output.source.kind,sourceNumber:output.source.number}};
  });
  const usedBoxes=new Set([...inputAssignments,...wizard.outputAssignments].map(item=>item.stagebox)),newIds=new Set(x32Pending.newBoxes.map(box=>box.id));
  const nextAttachment=StageplotX32.normalizeAttachment({...attachment,wizard:{...wizard,inputAssignments},mappings:[...mappings.values()].filter(mapping=>!newIds.has(mapping.stagebox)||usedBoxes.has(mapping.stagebox))});
  const routing=normalizeRouting({...stage.routing,inputs,outputs,disabledSources:[...new Set([...stage.routing.disabledSources,...generatedInputSpecs().map(row=>row.sourceKey),...generatedOutputSpecs().map(row=>row.sourceKey)])]});
  return {attachment:nextAttachment,routing,newBoxes:x32Pending.newBoxes.filter(box=>usedBoxes.has(box.id))};
}
$('sp-x32-wizard-body').addEventListener('change',event=>{
  const input=event.target;
  if(!x32Pending)return;
  if(input.hasAttribute('data-x32-all-outputs')){x32ReadWizardStep();x32Pending.allOutputs=input.checked;x32RenderWizard();$('sp-x32-wizard-body').querySelector('[data-x32-all-outputs]').focus({preventScroll:true});return;}
  if(input.dataset.x32InputId){
    const entry=x32Pending?.inventory.inputs.find(item=>item.id===input.dataset.x32InputId);
    if(entry?.linkedWith){const partner=$('sp-x32-wizard-body').querySelector('[data-x32-input-id="'+entry.kind+'-'+entry.linkedWith+'"]');if(partner)partner.checked=input.checked;}
  }
  if(input.dataset.x32BusRole){const bus=x32Pending?.inventory.buses.find(bus=>bus.number===Number(input.dataset.x32BusRole));if(bus?.linkedWith){const partner=$('sp-x32-wizard-body').querySelector('[data-x32-bus-role="'+bus.linkedWith+'"]');if(partner)partner.value=input.value;}}
  for(const direction of ['input','output'])if(input.hasAttribute('data-x32-'+direction+'-box')){
    const id=input.getAttribute('data-x32-'+direction+'-box'),port=$('sp-x32-wizard-body').querySelector('[data-x32-'+direction+'-port="'+id+'"]');
    port.disabled=!input.value;if(!input.value)port.value='';
  }
  if(input.dataset.x32OutputId){const row=input.closest('.sp-x32-output-row'),bank=row.closest('.sp-x32-output-bank'),summary=bank.querySelector('summary');row.dataset.selected=String(input.checked);row.querySelector('.sp-x32-output-fields').hidden=!input.checked;summary.textContent=summary.textContent.replace(/\d+ ausgewählt$/,bank.querySelectorAll('[data-x32-output-id]:checked').length+' ausgewählt');}
  if(x32Pending.step===3){x32ReadWizardStep();x32RenderImportSummary();}
});
$('sp-x32-wizard-body').addEventListener('input',event=>{
  if(!x32Pending)return;
  const input=event.target;
  if(input.dataset.x32Bulk){x32Pending.bulk[input.dataset.x32Bulk]=input.value;x32Pending.bulkPreview=null;x32Pending.bulkNotice='';input.closest('.sp-x32-bulk').querySelector('.sp-x32-bulk-preview')?.remove();input.closest('.sp-x32-bulk').querySelector('.sp-x32-bulk-notice')?.remove();}
  if(x32Pending.step===3){x32ReadWizardStep();x32RenderImportSummary();}
});
$('sp-x32-wizard-body').addEventListener('click',event=>{
  if(event.target.closest('[data-x32-bulk-preview],[data-x32-bulk-apply]')&&x32Pending){
    try{
      x32Error();x32Pending.bulkOpen=true;
      for(const field of $('sp-x32-wizard-body').querySelectorAll('[data-x32-bulk]'))x32Pending.bulk[field.dataset.x32Bulk]=field.value;
      const plan=x32BulkPlan();x32Pending.bulkPreview=plan;x32Pending.bulkNotice='';
      if(event.target.closest('[data-x32-bulk-apply]')&&!plan.conflicts.length){
        const box=plan.newType?x32CreateWizardBox(plan.newType):plan.box;
        for(const row of plan.rows){const assignment=x32InputAssignment(row.input);delete assignment.directPort;Object.assign(assignment,{connection:'stagebox',stagebox:box.id,port:row.port});}
        x32Pending.boxMappings=x32Pending.boxMappings.filter(item=>item.stagebox!==box.id);x32Pending.boxMappings.push({stagebox:box.id,bank:plan.bank,offset:plan.first-1});
        x32Pending.bulk.box=box.id;x32Pending.bulkPreview=null;x32Pending.bulkNotice=plan.rows.length+' Inputs für '+box.name+' vorgemerkt. Das Projekt wird erst beim abschließenden Übernehmen geändert.';
      }
      x32RenderWizard();const target=$('sp-x32-wizard-body').querySelector('.sp-x32-bulk-preview,.sp-x32-bulk-notice');if(target){target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}
    }catch(error){x32Error(error.message);}
    return;
  }
  if(x32HandleInputClick(event))return;
  const selection=event.target.closest('[data-x32-input-selection]');if(!selection||!x32Pending)return;
  x32Pending.wizard.inputIds=selection.dataset.x32InputSelection==='all'?x32Pending.inventory.inputs.map(input=>input.id):x32WizardDefaults(x32Pending.inventory).inputIds;x32RenderWizard();
});
$('sp-x32-mode').addEventListener('change',()=>{x32ReadWizardStep();x32Error();x32RenderWizard();});
$('sp-x32-back').addEventListener('click',()=>{x32ReadWizardStep();x32Error();if(x32Pending.step>0)x32Pending.step--;x32RenderWizard();});
$('sp-x32-next').addEventListener('click',()=>{
  try{x32ReadWizardStep();x32Error();if(x32Pending.step===1)x32ValidateWizardAssignments(x32Pending.wizard,x32Pending.inventory,'input');if(x32Pending.step<3)x32Pending.step++;x32RenderWizard();}catch(error){x32Error(error.message);}
});
$('sp-x32-edit-wizard').addEventListener('click',()=>{if(stage.x32Scene){x32Error();x32InvalidateExport();x32BeginWizard(stage.x32Scene,true);}});

$('sp-x32-close').addEventListener('click',()=>$('sp-x32-dialog').close());
$('sp-x32-dialog').addEventListener('close',()=>{x32ReadGeneration++;x32Pending=null;x32CloseSocket();x32InvalidateExport();});
$('sp-x32-file').addEventListener('change',async()=>{
  const generation=++x32ReadGeneration,owner=stage,file=$('sp-x32-file').files?.[0];x32Pending=null;x32CloseSocket();x32Error();x32InvalidateExport();$('sp-x32-import').disabled=true;$('sp-x32-import-options').hidden=true;
  if(!file)return;
  try{
    if(file.size>250000)throw Error('Bitte eine X32-Szene unter 250 kB wählen.');
    const bytes=await file.arrayBuffer();let text;
    try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
    catch{throw Error('Die Szene ist nicht als UTF-8 lesbar. Bitte erneut aus X32-Edit exportieren.');}
    if(generation!==x32ReadGeneration||owner!==stage||!$('sp-x32-dialog').open||sharedReadOnly)return;
    const attachment=StageplotX32.normalizeAttachment({version:1,text,filename:file.name,mappings:[]});
    x32BeginWizard(attachment);
    $('sp-x32-status').textContent='Vorschau geladen. Das Projekt wurde noch nicht geändert.';
  }catch(error){if(generation===x32ReadGeneration){$('sp-x32-preview').hidden=true;x32Error('Szene nicht geladen: '+error.message);}}
});
$('sp-x32-import').addEventListener('click',()=>{
  try{
    x32Error();if(!x32Pending||x32Pending.owner!==stage)throw Error('Bitte die Szene für dieses Projekt erneut auswählen.');
    const replace=$('sp-x32-mode').value==='routing';
    if(replace&&x32Pending.step!==3)throw Error('Bitte zuerst die Zuordnungsschritte abschließen.');
    const plan=replace?x32WizardPlan():{attachment:x32Pending.attachment,routing:null};
    x32Commit(()=>{
      stage.x32Scene=plan.attachment;
      if(plan.routing){objects.push(...(plan.newBoxes||[]));stage.routing=plan.routing;}
      else for(const direction of ['inputs','outputs'])x32ClearBindings(stage.routing[direction]);
      reconcileCablesWithRouting();
    },replace?'Inputs, Busse und Ausgänge übernommen. Offene Zuordnungen bleiben sichtbar.':'X32-Vorlage im Projekt gespeichert.');
    x32Pending=null;$('sp-x32-import-options').hidden=true;$('sp-x32-file').value='';x32InvalidateExport();x32RenderAttached();x32RenderPreview(stage.x32Scene.text);
    if(replace)routingWorkspaceV2?.selectX32?.();
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
    const mappings=x32CurrentMappings(),result=StageplotX32.exportScene(stage.x32Scene.text,{channelStrips:stage.x32Scene.channelStrips,processing:stage.routing.processing,sends:stage.routing.sends,inputs:stage.routing.inputs.filter(row=>row.x32?.kind!=='aux'&&!row.mixerDisplaced),outputs:stage.routing.outputs.filter(row=>row.x32?.kind!=='output'),mappings});
    const aux=StageplotX32.parse(stage.x32Scene.text).auxInputs;
    if(stage.routing.inputs.some(row=>row.x32?.kind==='aux'&&row.instrument!==aux.find(input=>input.number===row.x32.channel)?.name))result.warnings.push('Geänderte Aux-/USB-Namen bleiben nur im Stageplot-Projekt; die Szene behält die ursprünglichen Aux-Namen.');
    const host=$('sp-x32-changes'),heading=document.createElement('h3');heading.textContent=result.changes.length+' Änderungen gegenüber der Vorlage';host.append(heading);
    const explanation=document.createElement('p');explanation.textContent=stage.x32Scene.channelStrips||stage.routing.processing||stage.routing.sends?'Die Liste enthält die geänderten Kanalparameter einschließlich der übernommenen Sends.':'Nur die aufgeführten Beschriftungen, Kanalquellen und Stereo-Verknüpfungen werden geändert. Nicht aufgeführte Kanäle und alle Klang- und Ausgangseinstellungen bleiben aus der Vorlage.';host.append(explanation);
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
