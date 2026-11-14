/* Canonical routing rows own signals and patches. DI devices own only physical capacity.
 * This module has no DOM, storage, clock or network dependency. Mutators validate
 * before changing routing; callers retain their existing history/save transaction. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StageplotRoutingModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clean=(value,max=100)=>String(value??'').trim().slice(0,max);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const connectors=new Set(['XLR','Klinke','USB','Digital','MADI','Dante']);
  const signalTypes=new Set(['Mic','Line','Instrument','Digital']);
  const powers=new Set(['48V','battery','external','none']);
  const diModels=Object.freeze([
    Object.freeze({id:'radial-j48',name:'Radial J48',photo:'stageplot-assets/di/radial-j48-photo-v1.jpg',photoAlt:'Radial J48 – Produktfotografie von Radial Engineering',channels:1,active:true,power:'48V',phantom:true}),
    Object.freeze({id:'radial-j48-stereo',name:'Radial J48 Stereo',photo:'stageplot-assets/di/radial-j48-stereo-photo-v1.jpg',photoAlt:'Radial J48 Stereo – Produktfotografie von Radial Engineering',channels:2,active:true,power:'48V',phantom:true}),
    Object.freeze({id:'radial-prod2',name:'Radial ProD2',photo:'stageplot-assets/di/radial-prod2-photo-v1.jpg',photoAlt:'Radial ProD2 – Produktfotografie von Radial Engineering',channels:2,active:false,power:'none',phantom:false}),
    Object.freeze({id:'generic-passive-mono',name:'DI passiv · Mono',photo:'stageplot-assets/di/generic-passive-mono-v1.png',photoAlt:'Generische passive Mono-DI – Illustration',channels:1,active:false,power:'none',phantom:false}),
    Object.freeze({id:'generic-passive-stereo',name:'DI passiv · Stereo',photo:'stageplot-assets/di/generic-passive-stereo-v1.png',photoAlt:'Generische passive Stereo-DI – Illustration',channels:2,active:false,power:'none',phantom:false}),
    Object.freeze({id:'generic-active-mono',name:'DI aktiv · Mono',photo:'stageplot-assets/di/generic-active-mono-v1.png',photoAlt:'Generische aktive Mono-DI – Illustration',channels:1,active:true,power:'48V',phantom:true,configurablePower:true}),
    Object.freeze({id:'generic-active-stereo',name:'DI aktiv · Stereo',photo:'stageplot-assets/di/generic-active-stereo-v1.png',photoAlt:'Generische aktive Stereo-DI – Illustration',channels:2,active:true,power:'48V',phantom:true,configurablePower:true}),
    Object.freeze({id:'custom',name:'Eigene DI',channels:1,active:false,power:'none',phantom:false})
  ]);
  const catalog=new Map(diModels.map(model=>[model.id,model]));
  const modelToken=value=>clean(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  const modelNames=new Map(diModels.flatMap(model=>[[modelToken(model.id),model.id],[modelToken(model.name),model.id]]));
  function modelId(value){
    const text=modelToken(value);
    return modelNames.get(text)||({j48:'radial-j48',j48stereo:'radial-j48-stereo',prod2:'radial-prod2'})[text]||'custom';
  }
  function remapId(value,idMap){const id=clean(value);return idMap?idMap.get(id)||'':id;}
  function remapKey(value,idMap){const key=clean(value,140),split=key.indexOf(':');return split>0&&idMap?.has(key.slice(0,split))?idMap.get(key.slice(0,split))+key.slice(split):key;}
  function integer(value,min,max,fallback){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;}
  function token(value,fallback){return clean(value,80).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'')||fallback;}
  function normalizeDevice(value,index,idMap){
    const source=object(value),id=/^[a-z0-9][a-z0-9-]{0,119}$/.test(source.id||'')?source.id:'di-device-'+(index+1),key=modelId(source.modelId||source.model||source.name),model=catalog.get(key),fixed=key!=='custom';
    const active=fixed?model.active:source.active===true||(!own(source,'active')&&source.phantom===true),power=fixed?(model.configurablePower&&powers.has(source.power)&&source.power!=='none'?source.power:model.power):!active?'none':powers.has(source.power)?source.power:source.phantom===false?'external':'48V';
    return {id,modelId:key,name:clean(source.name,80)||model.name,channels:fixed?model.channels:integer(source.channels,1,32,1),active,power,phantom:active&&power==='48V',objectId:remapId(source.objectId,idMap)};
  }
  function normalizeDevices(raw,idMap=null){
    const ids=new Set();return (Array.isArray(raw)?raw:[]).slice(0,512).map((value,index)=>{
      const device=normalizeDevice(value,index,idMap),base=device.id;let suffix=2;
      while(ids.has(device.id))device.id=base+'-'+suffix++;ids.add(device.id);return device;
    });
  }
  function rowExtras(raw,idMap=null){
    const source=object(raw),pickupOrigin=/:pickup-[a-z0-9-]+$/.test(String(source.sourceKey||''));
    const result={origin:['generated','pickup','manual'].includes(source.origin)?source.origin:pickupOrigin?'pickup':source.sourceKey?'generated':'manual',acquisitionId:remapKey(source.acquisitionId,idMap),sourcePortKey:remapKey(source.sourcePortKey,idMap),sourceConnector:connectors.has(source.sourceConnector)?source.sourceConnector:'',sourceSignalType:signalTypes.has(source.sourceSignalType)?source.sourceSignalType:'',monitorDeviceName:clean(source.monitorDeviceName,80),monitorReceiverName:clean(source.monitorReceiverName,80),monitorAmplifierName:clean(source.monitorAmplifierName,80),monitorDeviceKind:clean(source.monitorDeviceKind,40),monitorActive:source.monitorActive!==false};
    if(/^route-[a-z0-9-]+$/.test(source.mixerSourceId||''))result.mixerSourceId=clean(source.mixerSourceId,120);
    if(source.mixerCopyOrigin)result.mixerCopyOrigin=remapKey(source.mixerCopyOrigin,idMap);
    if(source.mixerCopySide==='L'||source.mixerCopySide==='R')result.mixerCopySide=source.mixerCopySide;
    if(source.mixerUnpatched)result.mixerUnpatched=true;
    // Missing means old data which may need migration; empty means deliberately
    // unassigned. Keeping that distinction makes clearDevice survive every save.
    if(own(source,'diDeviceId')||own(source,'diChannel')){result.diDeviceId=clean(source.diDeviceId,120);result.diChannel=integer(source.diChannel,1,32,null);}
    return result;
  }
  const rowsOf=routing=>Array.isArray(routing?.inputs)?routing.inputs:[];
  const devicesOf=routing=>Array.isArray(routing?.devices)?routing.devices:[];
  function findDevice(routing,id){const device=devicesOf(routing).find(item=>item.id===id);if(!device)throw Error('Diese DI-Box ist nicht mehr verfügbar.');return device;}
  function inputRows(routing,rowIds){
    const ids=Array.isArray(rowIds)?rowIds:[rowIds];
    if(!ids.length||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw Error('Bitte unterschiedliche Eingangssignale wählen.');
    return ids.map(id=>{const row=rowsOf(routing).find(item=>item.id===id);if(!row)throw Error('Dieses Eingangssignal ist nicht mehr verfügbar.');return row;});
  }
  function occupancy(routing,deviceId){
    const device=devicesOf(routing).find(item=>item.id===deviceId);if(!device)return [];
    return Array.from({length:device.channels},(_,index)=>{
      const channel=index+1,row=rowsOf(routing).find(item=>item.diDeviceId===deviceId&&Number(item.diChannel)===channel);
      return {channel,rowId:row?.id||'',sourceKey:row?.sourceKey||'',instrument:row?.instrument||'',free:!row};
    });
  }
  function nextDeviceId(routing,requested=''){
    const ids=new Set(devicesOf(routing).map(device=>device.id));let base=token(requested,'di-device'),id=base,index=1;
    while(ids.has(id))id=base+'-'+(++index);return id;
  }
  function validateDevice(options){
    const key=modelId(options.modelId||options.model||options.name),model=catalog.get(key);
    if(model.configurablePower&&own(options,'power')&&(!powers.has(options.power)||options.power==='none'))throw Error('Eine aktive DI-Box benötigt eine gültige Stromversorgung.');
    if(key!=='custom')return;
    if(own(options,'channels')&&integer(options.channels,1,32,null)===null)throw Error('Eine eigene DI-Box benötigt 1 bis 32 Kanäle.');
    if(own(options,'power')&&!powers.has(options.power))throw Error('Bitte eine gültige Stromversorgung wählen.');
  }
  function createDevice(routing,options={}){
    if(!routing||typeof routing!=='object')throw Error('Kein Routing vorhanden.');
    validateDevice(options);const device=normalizeDevice({...options,id:nextDeviceId(routing,options.id)},devicesOf(routing).length);
    if(device.objectId&&devicesOf(routing).some(item=>item.objectId===device.objectId))throw Error('Dieses Bühnenobjekt gehört bereits zu einer DI-Box.');
    if(devicesOf(routing).length>=512)throw Error('Es können höchstens 512 DI-Boxen angelegt werden.');
    routing.devices=[...devicesOf(routing),device];return device;
  }
  function applyDevice(row,device,channel){
    if(!row.sourceConnector)row.sourceConnector=row.connector==='XLR'?'Klinke':row.connector||'Klinke';
    if(!row.sourceSignalType)row.sourceSignalType=row.signalType||'Instrument';
    Object.assign(row,{pickup:'DI',connector:'XLR',signalType:'Line',microphone:device.name,phantom:device.phantom,edited:true,diDeviceId:device.id,diChannel:channel});
  }
  function assignDevice(routing,rowIds,deviceId,channels){
    const rows=inputRows(routing,rowIds),device=findDevice(routing,deviceId),selected=new Set(rows.map(row=>row.id));
    if(rows.some(row=>row.connector==='Dante'||row.pickup==='Digital'))throw Error('Ein digitales Signal kann nicht durch eine analoge DI-Box geführt werden.');
    const used=new Set(rowsOf(routing).filter(row=>!selected.has(row.id)&&row.diDeviceId===deviceId).map(row=>Number(row.diChannel)));
    let ports;
    if(channels===undefined||channels===null){const free=Array.from({length:device.channels},(_,i)=>i+1).filter(channel=>!used.has(channel));ports=rows.map(row=>{const port=integer(row.diChannel,1,device.channels,null);return row.diDeviceId===deviceId&&port&&!used.has(port)?port:null;});const reserved=new Set();ports=ports.map(port=>{if(port&&reserved.has(port))return null;if(port)reserved.add(port);return port;});ports=ports.map(port=>{if(port)return port;const next=free.find(channel=>!reserved.has(channel));if(next)reserved.add(next);return next;});}
    else ports=Array.isArray(channels)?channels.slice():[channels];
    if(ports.length!==rows.length||ports.some(port=>integer(port,1,device.channels,null)===null))throw Error('Für diese Signale sind nicht genügend DI-Eingänge frei.');
    ports=ports.map(Number);
    if(new Set(ports).size!==ports.length)throw Error('Ein DI-Eingang kann nur einmal belegt werden.');
    if(ports.some(port=>used.has(port)))throw Error('Dieser DI-Eingang ist bereits belegt.');
    rows.forEach((row,index)=>applyDevice(row,device,ports[index]));return rows;
  }
  function clearDevice(routing,rowIds){
    const rows=inputRows(routing,rowIds);for(const row of rows)Object.assign(row,{diDeviceId:'',diChannel:null,edited:true});return rows;
  }
  function updateDevice(routing,id,fields={}){
    const device=findDevice(routing,id),options={...device,...fields,id:device.id};
    if(modelId(options.modelId)==='custom'&&!device.active&&fields.active===true&&!own(fields,'power'))options.power='48V';
    if(catalog.get(modelId(options.modelId)).configurablePower&&!own(fields,'power')&&(!powers.has(options.power)||options.power==='none'))options.power='48V';
    validateDevice(options);
    const next=normalizeDevice(options,0),rows=rowsOf(routing).filter(row=>row.diDeviceId===id);
    if(rows.some(row=>integer(row.diChannel,1,next.channels,null)===null))throw Error('Ein belegter DI-Eingang würde entfallen. Bitte zuerst das Signal umstecken.');
    if(next.objectId&&devicesOf(routing).some(item=>item.id!==id&&item.objectId===next.objectId))throw Error('Dieses Bühnenobjekt gehört bereits zu einer DI-Box.');
    Object.assign(device,next);for(const row of rows)applyDevice(row,device,row.diChannel);return device;
  }
  const sourceIdOf=row=>String(row?.sourceKey||'').split(':')[0];
  function additionalPickup(routing,sourceId,kind='Mic',value=''){
    const owner=clean(sourceId);if(!owner||owner.includes(':'))throw Error('Bitte eine gültige Quelle wählen.');
    if(!['Mic','DI','Direct','Digital'].includes(kind))throw Error('Bitte eine gültige Abnahme wählen.');
    if(rowsOf(routing).length>=512)throw Error('Es können höchstens 512 Eingangssignale angelegt werden.');
    const all=[...rowsOf(routing),...(Array.isArray(routing?.outputs)?routing.outputs:[])],ids=new Set(all.map(row=>row.id)),keys=new Set(all.map(row=>row.sourceKey)),base=token(typeof value==='function'?value():value,'new').slice(0,Math.max(1,126-owner.length)),seed=rowsOf(routing).find(row=>sourceIdOf(row)===owner);let suffix=1,tail=base;
    while(ids.has('route-pickup-'+tail)||keys.has(owner+':pickup-'+tail))tail=base+'-'+(++suffix);
    const key=owner+':pickup-'+tail,connector=['Mic','DI'].includes(kind)?'XLR':kind==='Digital'?'Digital':seed?.sourceConnector||seed?.connector||'XLR',row={id:'route-pickup-'+tail,sourceKey:key,origin:'pickup',acquisitionId:key,sourcePortKey:seed?.sourcePortKey||seed?.sourceKey||'',sourceConnector:seed?.sourceConnector||seed?.connector||'',sourceSignalType:seed?.sourceSignalType||seed?.signalType||'',number:null,instrument:clean(seed?.instrument,100).replace(/\s*·\s*(?:L|R|Out \d+)$/,'')||'Weitere Abnahme',generatedInstrument:'',manual:true,edited:true,pickup:kind,mode:'Mono',signalType:kind==='Mic'?'Mic':kind==='Digital'?'Digital':'Line',connector,portIndex:null,stereoGroup:'',microphone:'',phantom:false,diDeviceId:'',diChannel:null,stagebox:'',stageboxPort:null,notes:'',linkedSources:[]};
    routing.inputs=[...rowsOf(routing),row];return row;
  }
  function removeInput(routing,rowId){
    const [row]=inputRows(routing,[rowId]),disabled=new Set(Array.isArray(routing.disabledSources)?routing.disabledSources:[]);
    for(const member of [row,...(Array.isArray(row.linkedSources)?row.linkedSources:[])])if(member.sourceKey&&member.origin!=='pickup'&&!/:pickup-[a-z0-9-]+$/.test(member.sourceKey))disabled.add(member.sourceKey);
    routing.inputs=rowsOf(routing).filter(item=>item.id!==row.id);routing.disabledSources=[...disabled];return row;
  }
  function ensure(routing,objects=[]){
    if(!routing||typeof routing!=='object')return routing;
    routing.devices=normalizeDevices(routing.devices);routing.disabledSources=[...new Set(Array.isArray(routing.disabledSources)?routing.disabledSources:[])];
    const byObject=new Map((Array.isArray(objects)?objects:[]).map(item=>[item.id,item]));
    for(const direction of ['inputs','outputs'])for(const row of Array.isArray(routing[direction])?routing[direction]:[]){Object.assign(row,rowExtras(row));for(const member of Array.isArray(row.linkedSources)?row.linkedSources:[])Object.assign(member,rowExtras(member));}
    reconcileMixerSockets(rowsOf(routing));
    // Existing device references win. Invalid/duplicate imports stay as unassigned
    // signals instead of silently stealing a port or inventing extra hardware.
    const occupied=new Set();
    for(const row of rowsOf(routing))if(own(row,'diDeviceId')){
      const device=routing.devices.find(item=>item.id===row.diDeviceId),channel=device&&integer(row.diChannel,1,device.channels,null),key=device&&device.id+':'+channel;
      if(device&&channel&&!occupied.has(key)){occupied.add(key);applyDevice(row,device,channel);}
      else {row.diDeviceId='';row.diChannel=null;}
    }
    for(const row of rowsOf(routing)){
      if(own(row,'diDeviceId'))continue;
      if(row.connector==='Dante'||row.pickup==='Digital')continue;
      const members=[row,...(Array.isArray(row.linkedSources)?row.linkedSources:[])],diMember=members.find(member=>byObject.get(sourceIdOf(member))?.type==='di'),diObject=diMember&&byObject.get(sourceIdOf(diMember));
      if(row.pickup!=='DI'&&row.mode!=='DI'&&!diObject)continue;
      const legacyName=clean(row.microphone||diMember?.microphone||diObject?.label,80);
      if(!legacyName&&!diObject)continue;
      // Drum pads used these words as a direct-output mode, not a model name.
      // An existing device reference or a linked physical DI still remains valid.
      if(!diObject&&/^(?:Direktausgang|DI\s*\/\s*Line)$/i.test(legacyName))continue;
      const key=modelId(legacyName),model=catalog.get(key),legacyGroup=row.stereoGroup?rowsOf(routing).filter(other=>!own(other,'diDeviceId')&&other.stereoGroup===row.stereoGroup&&clean(other.microphone,80)===clean(row.microphone,80)):[],group=legacyGroup.length===2&&(!diObject||legacyGroup.every(other=>[other,...(other.linkedSources||[])].some(member=>sourceIdOf(member)===diObject.id)))?legacyGroup:[row];
      let device=diObject&&routing.devices.find(item=>item.objectId===diObject.id);
      if(!device)device=createDevice(routing,{id:diObject?'di-'+token(diObject.id,'object'):'di-legacy-'+token(row.id,'channel'),modelId:key,name:legacyName||'DI-Box',channels:key==='custom'?Math.max(1,group.length):model.channels,active:key==='custom'?row.phantom===true:model.active,power:key==='custom'?(row.phantom?'48V':'none'):model.power,objectId:diObject?.id||''});
      const free=occupancy(routing,device.id).filter(port=>port.free).map(port=>port.channel),count=Math.min(group.length,free.length);
      if(count)assignDevice(routing,group.slice(0,count).map(member=>member.id),device.id,free.slice(0,count));
      // A legacy physical mono box cannot gain a second input through migration.
      if(!count){row.diDeviceId='';row.diChannel=null;}
    }
    return routing;
  }
  function mixerStereoPlan(rows,source,channel){
    const pairOf=row=>row.stereoGroup?rows.filter(item=>item.stereoGroup===row.stereoGroup).sort((a,b)=>(a.mode==='Stereo R')-(b.mode==='Stereo R')):[row];
    const first=channel%2?channel:channel-1;
    const members=pairOf(source),targets=[first,first+1].map(n=>rows.find(row=>row.x32?.kind!=='aux'&&row.number===n));
    const involved=[...new Set([...members,...targets.flatMap(row=>row?pairOf(row):[])])];
    return {first,members,targets,stamp:involved.map(row=>[row.id,row.number,row.stereoGroup,row.mode,row.instrument])};
  }
  function mixerInsertPlan(rows,source,channel,paired){
    const members=paired?rows.filter(row=>row.stereoGroup===source.stereoGroup).sort((a,b)=>(a.mode==='Stereo R')-(b.mode==='Stereo R')):[source];
    if(!source.number||!Number.isInteger(channel)||channel<1||channel>32)throw Error('Ungültiger Zielkanal.');
    if(paired&&(!source.stereoGroup||members.length!==2||members[0].number%2!==1||members[1].number!==members[0].number+1||channel%2!==1))throw Error('Ein Stereo-Paar benötigt zwei benachbarte Kanäle mit ungeradem Start.');
    const slots=Array.from({length:32},(_,i)=>rows.find(row=>row.x32?.kind!=='aux'&&row.number===i+1));
    const origins=slots.map((_,i)=>i+1),sources=members.map(row=>row.number);
    if(sources.includes(channel))throw Error('Das Signal liegt bereits an dieser Position.');
    // Carry occupied slots forward until each inserted channel has found room.
    const queue=sources.slice(),vacancies=[];
    for(let n=channel;n<=32&&queue.length;n++){
      if(sources.includes(n)||!slots[n-1]||slots[n-1].mixerVacant)vacancies.push(n);
      else queue.push(n);
      origins[n-1]=queue.shift();
    }
    if(queue.length){
      // A full bank still permits a reorder: the source slots close the gap.
      const rest=origins.map((_,i)=>i+1).filter(n=>!sources.includes(n));
      rest.splice(channel-1,0,...sources);
      if(rest[channel-1]!==sources[0])throw Error('Das Paar passt nicht auf diese Zielkanäle.');
      return rest;
    }
    const unused=vacancies.filter(n=>!sources.includes(n));
    for(const n of sources)if(!origins.includes(n)||origins[n-1]===n)origins[n-1]=unused.shift()??n;
    return origins;
  }
  const mixerSourceId=row=>row.mixerSourceId||row.id;
  function explicitSocket(row){
    if(row.stagebox&&row.stageboxPort)return {id:row.stagebox,port:row.stageboxPort};
    const port=row.localPort||row.x32?.directPort;
    return port?{id:'@local',port}:null;
  }
  function writeMixerSocket(row,patch){
    row.stagebox=patch&&patch.id!=='@local'?patch.id:'';
    row.stageboxPort=row.stagebox?patch.port:null;
    delete row.localPort;
    if(row.x32)delete row.x32.directPort;
    if(patch?.id==='@local'){
      if(row.x32?.kind==='channel')row.x32.directPort=patch.port;
      else row.localPort=patch.port;
    }
    if(patch)delete row.mixerUnpatched;
    else row.mixerUnpatched=true;
    row.edited=true;
  }
  function reconcileMixerSockets(rows){
    const ordered=rows.filter(row=>!row.mixerVacant&&row.x32?.kind!=='aux');
    const sources=new Map(),occupied=new Map();
    const activeSockets=new Set(ordered.filter(row=>row.number).map(explicitSocket).filter(Boolean).map(p=>p.id+':'+p.port));
    for(const row of ordered){
      const patch=!row.number&&row.mixerDisplaced&&explicitSocket(row);
      if(patch&&activeSockets.has(patch.id+':'+patch.port))writeMixerSocket(row,null);
    }
    const originals=new Map(ordered.map(row=>[row.id,row]));
    // Older drafts linked independent instruments solely because their banks overlapped.
    for(const row of ordered){
      const owner=originals.get(row.mixerSourceId);
      if(!owner||row.mixerCopyOrigin||row.x32?.kind==='channel'||row.instrument===owner.instrument)continue;
      delete row.mixerSourceId;
      row.number=null;
      row.mixerDisplaced=true;
      writeMixerSocket(row,null);
    }
    // The original channel supplies the socket even if a duplicate comes first.
    for(const row of ordered.filter(r=>!r.mixerSourceId).concat(ordered.filter(r=>r.mixerSourceId))){
      const id=mixerSourceId(row),physical=explicitSocket(row);
      if(!sources.has(id)){
        const key=physical&&physical.id+':'+physical.port;
        if(key&&occupied.has(key)){
          // Two X32 scene strips patched to the same input are a hardware split.
          const owner=occupied.get(key);
          if(owner.x32?.kind==='channel'&&row.x32?.kind==='channel')row.mixerSourceId=mixerSourceId(owner);
          else {writeMixerSocket(row,null);sources.set(id,null);}
        }else{
          if(key)occupied.set(key,row);
          sources.set(id,physical);
        }
      }else{
        const patch=sources.get(id);
        if(patch?.id!==physical?.id||patch?.port!==physical?.port)writeMixerSocket(row,patch);
      }
    }
  }
  function localMixer(routing){
    const mixer=globalThis.StageplotStageboxes?.mixers.find(item=>item.id===routing.mixerModel);
    return {id:'@local',type:mixer?.id||'x32-local',name:(mixer?.name||'X32')+' lokal',inputs:mixer?.inputs||32};
  }
  // Phantom power belongs to a physical preamp, independently of channel and signal.
  function preampKey(device){
    return device.id==='@local'?'@local/'+device.type:device.id;
  }
  function normalizePreampPower(value,idMap){
    if(!Array.isArray(value))return [];
    const seen=new Set();
    return value.slice(0,8192).flatMap(entry=>{
      if(typeof entry?.device!=='string'||!entry.device||entry.device.length>100||
        !Number.isInteger(entry.port)||entry.port<1||entry.port>128)return [];
      const device=idMap?.get(entry.device)||entry.device;
      const key=JSON.stringify([device,entry.port]);
      if(seen.has(key))return [];
      seen.add(key);
      return [{device,port:entry.port}];
    });
  }
  function mixerInventory(routing,boxes){
    const rows=routing.inputs.filter(row=>row.x32?.kind!=='aux'&&!row.mixerVacant);
    const local=localMixer(routing),devices=[...boxes,local];
    const options=devices.flatMap(box=>Array.from({length:Math.ceil((box.inputs||0)/8)},(_,i)=>({id:box.id,first:i*8+1,last:Math.min(box.inputs,i*8+8)})));
    const banks=Array.from({length:4},(_,i)=>{
      const saved=routing.mixerBanks?.[i];
      if(saved?.id==='@user')return {id:'@user',first:i*8+1,last:i*8+8};
      if(saved?.id==='@local')return {...saved,last:Math.min(saved.first+7,local.inputs)};
      const patches=rows.filter(row=>Math.floor((row.number-1)/8)===i).map(explicitSocket).filter(Boolean);
      const fixed=options.find(b=>b.id===saved?.id&&b.first===saved.first)
        ||options.find(b=>patches.length&&patches.every(p=>p.id===b.id&&p.port>=b.first&&p.port<=b.last))||options[i];
      if(!fixed)return {id:'@user',first:i*8+1,last:i*8+8};
      // Older drafts could override any individual channel in a fixed bank.
      if(!routing.userInputs&&rows.some(row=>{
        const patch=explicitSocket(row);
        return Math.floor((row.number-1)/8)===i&&patch&&(patch.id!==fixed.id||patch.port!==fixed.first+(row.number-1)%8);
      }))return {id:'@user',first:i*8+1,last:i*8+8,legacy:fixed};
      return fixed;
    });
    function bankSocket(number){
      if(!Number.isInteger(number)||number<1||number>32)return null;
      const bank=banks[Math.floor((number-1)/8)],port=bank.first+(number-1)%8;
      if(bank.id==='@user'){
        if(routing.userInputs){
          const patch=routing.userInputs[number-1];
          return patch?.id==='@local'&&patch.port>local.inputs?null:patch||null;
        }
        const row=rows.find(item=>item.number===number);
        return (row&&explicitSocket(row))||(bank.legacy?{id:bank.legacy.id,port:bank.legacy.first+(number-1)%8}:null);
      }
      return port<=bank.last?{id:bank.id,port}:null;
    }
    const groups=new Map(),ports=new Map();
    for(const row of rows){
      const id=mixerSourceId(row);
      if(!groups.has(id))groups.set(id,{id,rows:[],patch:null});
      groups.get(id).rows.push(row);
    }
    const at=(device,port)=>ports.get(device)?.get(port);
    // Explicit connections take precedence over channel-bank defaults.
    for(const explicit of [true,false])for(const group of groups.values()){
      const origin=group.rows.find(row=>row.id===group.id)||group.rows[0];
      const active=group.rows.find(row=>row.number);
      if(!active&&origin.mixerDisplaced)continue;
      const patch=routing.userInputs&&active?bankSocket(active.number):explicit?explicitSocket(origin)||group.rows.map(explicitSocket).find(Boolean):origin.mixerUnpatched?null:bankSocket(origin.number);
      if(group.patch||!patch||at(patch.id,patch.port))continue;
      if(!ports.has(patch.id))ports.set(patch.id,new Map());
      ports.get(patch.id).set(patch.port,group);group.patch=patch;
    }
    const byOrigin=new Map(),stereoNames=new Map(),monoNames=new Set(),staleMono=new Set();
    for(const row of rows){
      byOrigin.set(row.id,row);
      if(row.sourceKey)byOrigin.set(row.sourceKey,row);
      if(row.stereoGroup && /^Stereo [LR]$/.test(row.mode)){
        const name=String(row.instrument||'').replace(/\s+·\s+[LR]$/,'');
        if(!stereoNames.has(name))stereoNames.set(name,new Set());
        stereoNames.get(name).add(row.stereoGroup);
      }else if(row.sourceKey)monoNames.add(row.instrument);
    }
    for(const row of rows){
      if(!row.number||!row.manual||row.sourceKey||row.stereoGroup||row.mixerCopySide)continue;
      const origin=byOrigin.get(row.mixerCopyOrigin||row.mixerSourceId);
      // Older splits did not keep an origin after their sockets diverged.
      const legacy=!row.mixerCopyOrigin&&!monoNames.has(row.instrument)&&stereoNames.get(row.instrument)?.size===1;
      if(origin&&origin!==row ? origin.stereoGroup&&/^Stereo [LR]$/.test(origin.mode) : legacy)staleMono.add(row.id);
    }
    return {banks,bankSocket,groups,at,staleMono};
  }
  return {localMixer,preampKey,normalizePreampPower,explicitSocket,writeMixerSocket,mixerSourceId,mixerInventory,mixerInsertPlan,mixerStereoPlan,diModels,normalizeDevices,rowExtras,ensure,createDevice,updateDevice,assignDevice,clearDevice,occupancy,additionalPickup,removeInput};
});
