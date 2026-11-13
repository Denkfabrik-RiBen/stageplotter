// Embedded in the app closure; scene edits share the existing project/undo store.
let x32Pending=null,x32Prepared=null,x32ReadGeneration=0;
function x32Error(message=''){
  $('sp-x32-error').textContent=message;$('sp-x32-error').hidden=!message;
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
    wizard.inputAssignments=stage.routing.inputs.filter(row=>['channel','aux'].includes(row.x32?.kind)).map(row=>({inputId:row.x32.kind+'-'+row.x32.channel,stagebox:row.stagebox||'',port:row.stageboxPort||null}));
    }
    if(attachment.wizard)wizard.outputAssignments=stage.routing.outputs.filter(row=>row.x32?.kind==='output').map(row=>({outputId:row.x32.endpoint,destination:row.instrument||'',stagebox:row.stagebox||'',port:row.stageboxPort||null}));
  }
  x32Pending={attachment,inventory,wizard,owner:stage,step:0,editing};
  $('sp-x32-mode').value=editing||!stage.routing.inputs.length&&!stage.routing.outputs.length?'routing':'template';
  $('sp-x32-mode').disabled=editing;
  $('sp-x32-import-options').hidden=false;$('sp-x32-attached').hidden=true;$('sp-x32-preview').hidden=true;
  x32RenderWizard();
}
function x32WizardPatchFields(id,direction,assignment){
  const boxes=allRoutingStageboxes().filter(box=>box[direction==='input'?'inputs':'outputs']>0),selected=assignment?.stagebox||'';
  return '<label>Stagebox<select data-x32-'+direction+'-box="'+esc(id)+'"><option value="">Zuordnung offen / direkt am Pult</option>'+boxes.map(box=>'<option value="'+esc(box.id)+'"'+(box.id===selected?' selected':'')+'>'+esc(box.name)+'</option>').join('')+'</select></label><label>Buchse<input type="number" min="1" max="64" step="1" data-x32-'+direction+'-port="'+esc(id)+'" value="'+esc(assignment?.port||'')+'" placeholder="—"'+(!selected?' disabled':'')+'></label>';
}
function x32ReadWizardStep(){
  const pending=x32Pending;if(!pending)return;const {wizard,inventory,step}=pending,host=$('sp-x32-wizard-body');
  if(step===0){
    const ids=new Set([...host.querySelectorAll('[data-x32-input-id]:checked')].map(input=>input.dataset.x32InputId));
    for(const input of inventory.inputs)if(ids.has(input.id)&&input.linkedWith)ids.add(input.kind+'-'+input.linkedWith);
    wizard.inputIds=[...ids];
  }
  if(step===1)wizard.inputAssignments=[...host.querySelectorAll('[data-x32-input-box]')].map(select=>({inputId:select.dataset.x32InputBox,stagebox:select.value,port:select.value?Number(host.querySelector('[data-x32-input-port="'+select.dataset.x32InputBox+'"]').value)||null:null}));
  if(step===2)wizard.busRoles=[...host.querySelectorAll('[data-x32-bus-role]')].map(select=>({bus:Number(select.dataset.x32BusRole),role:select.value}));
  if(step===3)wizard.outputAssignments=[...host.querySelectorAll('[data-x32-output-id]:checked')].map(input=>{
    const id=input.dataset.x32OutputId,stagebox=host.querySelector('[data-x32-output-box="'+id+'"]').value;
    return {outputId:id,destination:host.querySelector('[data-x32-output-destination="'+id+'"]').value.trim(),stagebox,port:stagebox?Number(host.querySelector('[data-x32-output-port="'+id+'"]').value)||null:null};
  });
}
function x32ValidateWizardAssignments(wizard,inventory,direction){
  const assignments=wizard[direction+'Assignments'],boxes=allRoutingStageboxes(),used=new Map(),inputIds=new Set(wizard.inputIds);
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
  const titles=['Szene prüfen und Inputs auswählen','Wo sind die Eingänge angeschlossen?','Wofür werden die Busse verwendet?','Wohin führen die Ausgänge?'];
  $('sp-x32-step-title').textContent=(step+1)+' / 4 · '+titles[step];
  $('sp-x32-step-title').focus({preventScroll:true});
  $('sp-x32-step-progress').textContent=['Inputs','Anschlüsse','Busse','Outputs'].map((name,index)=>(index===step?'● ':'○ ')+name).join('  ›  ');
  $('sp-x32-back').hidden=step===0;
  const template=$('sp-x32-mode').value==='template';
  $('sp-x32-next').hidden=step===3||template;$('sp-x32-import').hidden=step!==3&&!template;$('sp-x32-import').disabled=false;
  $('sp-x32-mode-field').hidden=step!==0;
  $('sp-x32-import').textContent=template?'Vorlage speichern':x32Pending.editing?'Zuordnungen übernehmen':'I/O-Routing übernehmen';
  if(step===0){
    host.innerHTML='<p><strong>'+esc(inventory.scene.name||'X32-Szene')+'</strong> · '+inventory.inputs.length+' Inputs · '+inventory.buses.length+' Mixbusse · '+inventory.outputs.length+' Ausgangsadressen</p><p>Welche Inputs brauchst du in der Routingliste? Stereo-Partner bleiben zusammen. Die vollständige Szene bleibt erhalten.</p><div class="sp-actions"><button type="button" class="sp-button" data-x32-input-selection="all">Alle auswählen</button><button type="button" class="sp-button" data-x32-input-selection="named">Benannte Inputs</button></div><div class="sp-x32-scroll"><table><thead><tr><th>Übernehmen</th><th>Input</th><th>Quelle aus Szene</th><th>Format</th></tr></thead><tbody>'+inventory.inputs.map(input=>'<tr><td><input type="checkbox" data-x32-input-id="'+input.id+'" aria-label="'+esc(input.label)+' übernehmen"'+(selected.has(input.id)?' checked':'')+'></td><td>'+esc(input.label)+'</td><td>'+esc(input.sourceAddress.label)+'</td><td>'+(input.linkedWith?'Stereo mit '+input.linkedWith:'Mono')+'</td></tr>').join('')+'</tbody></table></div><p class="sp-muted">„I/O-Routing übernehmen“ ersetzt die bisherigen Routinglisten. Bühnenobjekte bleiben erhalten. Die gesamte Übernahme lässt sich rückgängig machen.</p>';
  }else if(step===1){
    host.innerHTML='<p>Die Szene kennt Pultanschlüsse, aber keine Gerätenamen oder Bühnenpositionen. Ordne vorhandene Stageboxen zu oder lasse die Zuordnung offen. Mehrere Kanäle dürfen dieselbe Eingangsquelle verwenden.</p>'+(!allRoutingStageboxes().length?'<p class="sp-muted">Noch keine Stagebox im Plan. Du kannst sie später auf der Bühne anlegen und diesen Wizard erneut öffnen.</p>':'')+inventory.inputs.filter(input=>selected.has(input.id)).map(input=>'<article class="sp-x32-wizard-row"><div><strong>'+esc(input.label)+'</strong><small>'+esc(input.sourceAddress.label)+'</small></div>'+x32WizardPatchFields(input.id,'input',wizard.inputAssignments.find(item=>item.inputId===input.id))+'</article>').join('');
  }else if(step===2){
    host.innerHTML='<p>Bestätige die Verwendung der Mixbusse. Erkannte Effekt- und Subgruppenwege sind vorbelegt. Monitor oder In-Ear legst du selbst fest; Busnummer und Ausgangsbuchse sind unabhängig.</p>'+inventory.buses.map(bus=>'<article class="sp-x32-wizard-row sp-x32-bus-row"><div><strong>'+esc(bus.label)+'</strong><small>'+esc([bus.linkedWith?'Stereo mit Bus '+bus.linkedWith:'Mono',bus.fxSlots.length?'speist FX '+bus.fxSlots.join(', '):'',bus.main.stereo?'→ Main L/R':'',bus.insert?.enabled?'Insert '+bus.insert.source:''].filter(Boolean).join(' · '))+'</small></div><label>Verwendung<select data-x32-bus-role="'+bus.number+'">'+x32BusRoles.map(([value,label])=>'<option value="'+value+'"'+(wizard.busRoles.find(item=>item.bus===bus.number)?.role===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label></article>').join('')+'<p class="sp-muted">Diese Angaben beschreiben den Aufbau. Sie ändern weder Sends noch Effekte in der Szenendatei.</p>';
  }else{
    const banks=[...new Set(inventory.outputs.map(output=>output.bank))];
    host.innerHTML='<p>Welche Ausgangsadressen werden tatsächlich verwendet? Gib das Ziel an, zum Beispiel „PA links“ oder „IEM Drums“. Bei AES50 legst du zusätzlich fest, an welcher Stagebox-Buchse das Signal anliegt.</p>'+banks.map(bank=>{
      const outputs=inventory.outputs.filter(output=>output.bank===bank),chosen=outputs.filter(output=>wizard.outputAssignments.some(item=>item.outputId===output.id)).length;
      return '<details class="sp-x32-output-bank"'+(chosen||bank==='local'?' open':'')+'><summary>'+esc(({local:'Lokale XLR-Ausgänge','aes50-a':'AES50 A','aes50-b':'AES50 B',card:'Card / USB',aux:'Aux Out',p16:'Ultranet',aes:'AES/EBU',rec:'USB Recorder'})[bank]||bank)+' · '+outputs.length+' Adressen</summary>'+outputs.map(output=>{
        const assignment=wizard.outputAssignments.find(item=>item.outputId===output.id);
        return '<article class="sp-x32-output-row"><label class="sp-x32-check"><input type="checkbox" data-x32-output-id="'+output.id+'"'+(assignment?' checked':'')+'><strong>'+esc(output.label)+'</strong></label><p>'+esc(output.source.label)+(output.tap?' · '+esc(output.tap):'')+(output.delay?.enabled?' · Delay '+output.delay.ms+' ms':'')+'</p><label>Ziel / Gerät<input maxlength="100" data-x32-output-destination="'+output.id+'" value="'+esc(assignment?.destination||'')+'" placeholder="Zuordnung noch offen"></label><div class="sp-x32-output-patch">'+x32WizardPatchFields(output.id,'output',assignment)+'</div></article>';
      }).join('')+'</details>';
    }).join('')+(!banks.length?'<p>In dieser Datei wurden keine physischen Ausgangszuordnungen gefunden. Interne Out-Slots bleiben in der I/O-Liste sichtbar.</p>':'')+'<p class="sp-muted">Die Zuordnungen werden lokal im Projekt gespeichert. Der Ausgangs-Patch der X32-Datei bleibt erhalten.</p>';
  }
  x32Warnings(inventory.warnings,$('sp-x32-wizard-warnings'));
}
function x32WizardPlan(){
  x32ReadWizardStep();const {inventory,wizard,attachment,editing}=x32Pending;
  x32ValidateWizardAssignments(wizard,inventory,'input');x32ValidateWizardAssignments(wizard,inventory,'output');
  const mappings=new Map((attachment.mappings||[]).map(mapping=>[mapping.stagebox,mapping]));
  const inputAssignments=wizard.inputAssignments.filter(item=>wizard.inputIds.includes(item.inputId));
  for(const assignment of inputAssignments)if(assignment.stagebox)mappings.delete(assignment.stagebox);
  for(const assignment of inputAssignments){
    if(!assignment.stagebox)continue;
    const input=inventory.inputs.find(input=>input.id===assignment.inputId),address=input?.sourceAddress;
    if(!address?.resolved||!StageplotX32.BANKS[address.bank])continue;
    const offset=address.port-assignment.port,previous=mappings.get(assignment.stagebox);
    if(offset<0||previous&&(previous.bank!==address.bank||previous.offset!==offset))throw Error('Die Eingangszuordnungen dieser Stagebox passen nicht zu einem gemeinsamen X32-Anschluss. Bitte die Buchsen prüfen.');
    mappings.set(assignment.stagebox,{stagebox:assignment.stagebox,bank:address.bank,offset});
  }
  const baseRows=StageplotX32.importRouting(attachment.text,{includeUnnamed:true}).inputs;
  const inputs=inventory.inputs.filter(input=>wizard.inputIds.includes(input.id)).map(input=>{
    const previous=editing?stage.routing.inputs.find(row=>row.x32?.kind===input.kind&&row.x32.channel===input.number):null;
    const base=input.kind==='channel'?baseRows.find(row=>row.x32.channel===input.number):{id:'route-x32-aux-'+input.number,manual:true,edited:true,number:null,instrument:input.name,mode:input.linkedWith?'Stereo '+(input.number<input.linkedWith?'L':'R'):'Mono',stereoGroup:input.linkedWith?'x32-aux-'+Math.min(input.number,input.linkedWith)+'-'+Math.max(input.number,input.linkedWith):'',pickup:'Direct',signalType:'Line',connector:'Klinke',x32:{kind:'aux',channel:input.number,source:input.source}};
    const assignment=inputAssignments.find(item=>item.inputId===input.id);
    return {...base,...previous,stagebox:assignment?.stagebox||'',stageboxPort:assignment?.port||null};
  });
  const outputs=wizard.outputAssignments.map(assignment=>{
    const output=inventory.outputs.find(output=>output.id===assignment.outputId);if(!output)throw Error('Ein gewählter Ausgang ist nicht mehr in der Szene vorhanden.');
    const role=output.source.kind==='bus'?wizard.busRoles.find(item=>item.bus===output.source.number)?.role:'line',previous=editing?stage.routing.outputs.find(row=>row.x32?.kind==='output'&&row.x32.endpoint===output.id):null;
    return {...previous,id:'route-x32-'+output.id,manual:true,edited:true,sourceKey:'',number:null,instrument:assignment.destination,mode:'Mono',stereoGroup:'',pickup:'Direct',signalType:'Line',connector:output.bank==='aux'?'Klinke':['card','p16','aes','rec'].includes(output.bank)?'Digital':'XLR',outputKind:['monitor','iem'].includes(role)?role:'line',stagebox:assignment.stagebox,stageboxPort:assignment.port,x32:{kind:'output',endpoint:output.id,label:output.label,sourceLabel:output.source.label,sourceKind:output.source.kind,sourceNumber:output.source.number}};
  });
  const nextAttachment=StageplotX32.normalizeAttachment({...attachment,wizard:{...wizard,inputAssignments},mappings:[...mappings.values()]});
  const routing=normalizeRouting({...stage.routing,inputs,outputs,disabledSources:[...new Set([...stage.routing.disabledSources,...generatedInputSpecs().map(row=>row.sourceKey),...generatedOutputSpecs().map(row=>row.sourceKey)])]});
  return {attachment:nextAttachment,routing};
}
$('sp-x32-wizard-body').addEventListener('change',event=>{
  const input=event.target;
  if(input.dataset.x32InputId){
    const entry=x32Pending?.inventory.inputs.find(item=>item.id===input.dataset.x32InputId);
    if(entry?.linkedWith){const partner=$('sp-x32-wizard-body').querySelector('[data-x32-input-id="'+entry.kind+'-'+entry.linkedWith+'"]');if(partner)partner.checked=input.checked;}
  }
  if(input.dataset.x32BusRole){const bus=x32Pending?.inventory.buses.find(bus=>bus.number===Number(input.dataset.x32BusRole));if(bus?.linkedWith){const partner=$('sp-x32-wizard-body').querySelector('[data-x32-bus-role="'+bus.linkedWith+'"]');if(partner)partner.value=input.value;}}
  for(const direction of ['input','output'])if(input.hasAttribute('data-x32-'+direction+'-box')){
    const id=input.getAttribute('data-x32-'+direction+'-box'),port=$('sp-x32-wizard-body').querySelector('[data-x32-'+direction+'-port="'+id+'"]');
    port.disabled=!input.value;if(!input.value)port.value='';
  }
});
$('sp-x32-wizard-body').addEventListener('click',event=>{
  const selection=event.target.closest('[data-x32-input-selection]');if(!selection||!x32Pending)return;
  x32Pending.wizard.inputIds=selection.dataset.x32InputSelection==='all'?x32Pending.inventory.inputs.map(input=>input.id):x32WizardDefaults(x32Pending.inventory).inputIds;x32RenderWizard();
});
$('sp-x32-mode').addEventListener('change',()=>{x32ReadWizardStep();x32RenderWizard();});
$('sp-x32-back').addEventListener('click',()=>{x32ReadWizardStep();x32Error();if(x32Pending.step>0)x32Pending.step--;x32RenderWizard();});
$('sp-x32-next').addEventListener('click',()=>{
  try{x32ReadWizardStep();x32Error();if(x32Pending.step===1)x32ValidateWizardAssignments(x32Pending.wizard,x32Pending.inventory,'input');if(x32Pending.step<3)x32Pending.step++;x32RenderWizard();}catch(error){x32Error(error.message);}
});
$('sp-x32-edit-wizard').addEventListener('click',()=>{if(stage.x32Scene){x32Error();x32InvalidateExport();x32BeginWizard(stage.x32Scene,true);}});

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
      if(plan.routing)stage.routing=plan.routing;
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
    const mappings=x32CurrentMappings(),result=StageplotX32.exportScene(stage.x32Scene.text,{inputs:stage.routing.inputs.filter(row=>row.x32?.kind!=='aux'),outputs:stage.routing.outputs.filter(row=>row.x32?.kind!=='output'),mappings});
    const aux=StageplotX32.parse(stage.x32Scene.text).auxInputs;
    if(stage.routing.inputs.some(row=>row.x32?.kind==='aux'&&row.instrument!==aux.find(input=>input.number===row.x32.channel)?.name))result.warnings.push('Geänderte Aux-/USB-Namen bleiben nur im Stageplot-Projekt; die Szene behält die ursprünglichen Aux-Namen.');
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
