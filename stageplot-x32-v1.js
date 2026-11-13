/* Offline X32 scene adapter. Original scene text is the source of truth.
 * parse(text) describes a #4.0# template without changing it.
 * importRouting(text) returns manual Stageplot rows; it never invents stage objects.
 * exportScene(text,{inputs,outputs,mappings}) overlays names, odd/even links and
 * explicitly mapped channel sources. Every other byte stays in the template.
 * mappings: [{stagebox: objectId, bank: 'local'|'aes50-a'|'aes50-b'|'card', offset: 0}].
 * offset is added to a stagebox socket number. Existing console input banks are
 * resolved, never reprogrammed. Unknown/User-In/Aux routing remains untouched.
 * normalizeAttachment(value) validates {version:1,text,filename,mappings}.
 * This module has no DOM, storage, network or console-control dependency. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StageplotX32=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_TEXT=250000;
  const BANKS=Object.freeze({local:{label:'Local',limit:32},'aes50-a':{label:'AES50 A',limit:48},'aes50-b':{label:'AES50 B',limit:48},card:{label:'Card',limit:32}});
  const validationCache=new Map();
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
  const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const integer=(value,min,max)=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max;
  const fail=message=>{throw new Error(message);};
  const pad=value=>String(value).padStart(2,'0');
  const cleanText=value=>typeof value==='string'?value:'';

  function tokens(line){
    const result=[];let at=0;
    while(at<line.length){
      while(/[ \t]/.test(line[at]||'')&&at<line.length)at++;
      if(at===line.length)break;
      const start=at;let value='';
      if(line[at]==='"'){
        at++;const content=at;while(at<line.length&&line[at]!=='"')at++;
        if(at===line.length)fail('Die X32-Szene enthält eine nicht geschlossene Zeichenfolge.');
        value=line.slice(content,at++);
        if(at<line.length&&!/[ \t]/.test(line[at]))fail('Ungültige Zeichen nach einem X32-Namen.');
      }else{
        while(at<line.length&&!/[ \t]/.test(line[at]))at++;
        value=line.slice(start,at);
        if(value.includes('"'))fail('Ungültige Anführungszeichen in der X32-Szene.');
      }
      result.push({value,start,end:at});
    }
    return result;
  }

  function read(text){
    if(typeof text!=='string'||!text.length||text.length>MAX_TEXT)fail('Die X32-Szene muss eine Textdatei mit höchstens 250.000 Zeichen sein.');
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))fail('Die X32-Szene enthält ungültige Steuerzeichen.');
    const lines=[];let start=0;
    for(const match of text.matchAll(/\r\n|\n|\r/g)){lines.push({body:text.slice(start,match.index),ending:match[0]});start=match.index+match[0].length;}
    if(start<text.length)lines.push({body:text.slice(start),ending:''});
    if(lines.length>10000)fail('Die X32-Szene enthält zu viele Zeilen.');
    const header=tokens((lines[0]?.body||'').replace(/^\uFEFF/,''));
    if(header[0]?.value!=='#4.0#')fail('Diese X32-Szene wird nicht unterstützt. Bitte eine Szene im Format #4.0# verwenden.');
    const records=new Map();
    for(let index=1;index<lines.length;index++){
      const body=lines[index].body;
      if(!body.trim()||/^\s*#/.test(body))continue;
      const parts=tokens(body),path=parts[0]?.value;
      if(!path?.startsWith('/'))fail('Ungültige Zeile '+(index+1)+' in der X32-Szene.');
      if(records.has(path))fail('Die X32-Szene enthält den Pfad '+path+' mehrfach.');
      records.set(path,{index,path,parts:parts.slice(1)});
    }
    // Group/leaf forms can override each other depending on file order. Editing
    // only one would silently export a different result from the preview.
    for(const path of records.keys()){
      if(/^\/(?:ch|bus)\/\d+\/config\//.test(path)||/^\/config\/(?:chlink|buslink)\//.test(path)||/^\/config\/routing\/(?:IN|PLAY)\//.test(path)){
        fail('Die X32-Szene verwendet einzelne Parameter ('+path+'). Bitte zuerst in X32-Edit als vollständige Szene speichern.');
      }
    }
    const values=path=>(records.get(path)?.parts||[]).map(part=>part.value);
    const links=(path,count)=>{
      const list=values(path);
      if(!list.length)return null;
      if(list.length!==count||list.some(value=>value!=='ON'&&value!=='OFF'))fail('Ungültige Stereo-Verknüpfungen in '+path+'.');
      return list;
    };
    const channelFlags=links('/config/chlink',16),busFlags=links('/config/buslink',8);
    const mode=values('/config/routing')[0]||'',activePath=mode==='REC'?'/config/routing/IN':mode==='PLAY'?'/config/routing/PLAY':'';
    const banks=activePath?values(activePath):[];
    const warnings=[];
    if(!channelFlags)warnings.push('Kanal-Verknüpfungen fehlen in der Vorlage; Stereo-Änderungen sind nicht möglich.');
    if(!busFlags)warnings.push('Bus-Verknüpfungen fehlen in der Vorlage; Stereo-Änderungen sind nicht möglich.');
    if(!activePath||banks.length<4)warnings.push('Die aktive X32-Eingangszuordnung ist nicht vollständig auflösbar; sie bleibt unverändert.');
    const sourceAddress=source=>{
      const unknown={bank:'unknown',port:null,label:source===0?'Aus':'X32-Quelle '+source+' (nicht aufgelöst)',resolved:false};
      if(!integer(source,1,32))return unknown;
      const slot=Number(source)-1,bank=banks[Math.floor(slot/8)]||'',match=/^(AN|A|B|CARD)(\d+)-(\d+)$/.exec(bank);
      if(!match)return {...unknown,label:'Input '+source+(bank?' · '+bank:'')+' (nicht aufgelöst)'};
      const name={AN:'local',A:'aes50-a',B:'aes50-b',CARD:'card'}[match[1]],first=Number(match[2]),last=Number(match[3]),port=first+slot%8;
      if(last-first!==7||first<1||last>BANKS[name].limit)return unknown;
      return {bank:name,port,label:BANKS[name].label+' '+port,resolved:true};
    };
    const channels=[],buses=[],auxInputs=[];
    for(const [path,record] of records){
      const match=/^\/(ch|bus|auxin)\/(\d+)\/config$/.exec(path);if(!match)continue;
      const family=match[1],number=Number(match[2]),max=family==='ch'?32:family==='bus'?16:8,parts=record.parts.map(part=>part.value);
      if(!integer(number,1,max)||match[2]!==pad(number)||parts.length<(family==='bus'?3:4))fail('Ungültiger X32-Kanal in '+path+'.');
      const entry={number,name:parts[0],icon:parts[1],color:parts[2]};
      if(family!=='bus'){
        if(!integer(parts[3],0,65535)||parts[3]==='')fail('Ungültige X32-Eingangsquelle in '+path+'.');
        entry.source=Number(parts[3]);entry.sourceAddress=sourceAddress(entry.source);
      }
      (family==='ch'?channels:family==='bus'?buses:auxInputs).push(entry);
    }
    if(!channels.length)fail('Die Datei enthält keine X32-Eingangskanäle.');
    const sort=list=>list.sort((a,b)=>a.number-b.number);
    const pairs=flags=>(flags||[]).flatMap((value,index)=>value==='ON'?[[index*2+1,index*2+2]]:[]);
    const result={version:'4.0',name:header[1]?.value||'',channels:sort(channels),buses:sort(buses),auxInputs:sort(auxInputs),channelLinks:pairs(channelFlags),busLinks:pairs(busFlags),routing:{mode,activePath,banks:banks.slice(),sources:Array.from({length:32},(_,i)=>({source:i+1,...sourceAddress(i+1)}))},warnings};
    return {text,lines,records,channelFlags,busFlags,result};
  }

  function parse(text){return read(text).result;}

  function importRouting(text,options={}){
    const scene=parse(text),warnings=scene.warnings.slice();
    const selected=(entries,pairs,keep)=>{
      const numbers=new Set(entries.filter(keep).map(entry=>entry.number));
      for(const [left,right] of pairs)if(numbers.has(left)||numbers.has(right)){numbers.add(left);numbers.add(right);}
      return entries.filter(entry=>numbers.has(entry.number));
    };
    const rows=(entries,pairs,kind)=>entries.map(entry=>{
      const pair=pairs.find(pair=>pair.includes(entry.number)),prefix=kind==='channel'?'ch':'bus',stereoGroup=pair?'x32-'+prefix+'-'+pair[0]+'-'+pair[1]:'';
      return {id:'route-x32-'+prefix+'-'+entry.number,manual:true,edited:true,sourceKey:'',number:entry.number,instrument:entry.name,generatedInstrument:'',pickup:'Direct',signalType:'Line',connector:'XLR',mode:pair?'Stereo '+(entry.number===pair[0]?'L':'R'):'Mono',stereoGroup,stagebox:'',stageboxPort:null,notes:'',linkedSources:[],...(kind==='bus'?{outputKind:'line'}:{}),x32:{kind,channel:entry.number,...(kind==='channel'?{source:entry.source}:{})}};
    });
    // rows takes links separately; keeping selection and pairing explicit avoids
    // inferring stereo from channel labels such as "Keys L" alone.
    const inRows=rows(selected(scene.channels,scene.channelLinks,entry=>options.includeUnnamed===true||!!entry.name),scene.channelLinks,'channel');
    const outRows=rows(selected(scene.buses,scene.busLinks,entry=>options.includeUnnamed===true||!!entry.name&&!/^MixBus\s*\d+$/i.test(entry.name)),scene.busLinks,'bus');
    const unresolved=inRows.filter(row=>!scene.channels.find(entry=>entry.number===row.number)?.sourceAddress.resolved).length;
    if(unresolved)warnings.push(unresolved+' Eingang'+(unresolved===1?' hat':'änge haben')+' eine nicht aufgelöste X32-Quelle; die Originalzuordnung bleibt erhalten.');
    if(scene.auxInputs.length)warnings.push('Aux-/USB-Eingänge bleiben in der Originalszene erhalten und werden nicht als Bühnenkanäle importiert.');
    return {inputs:inRows,outputs:outRows,summary:{name:scene.name,inputCount:inRows.length,busCount:outRows.length,channelPairs:scene.channelLinks.filter(pair=>pair.every(number=>inRows.some(row=>row.number===number))).length,busPairs:scene.busLinks.filter(pair=>pair.every(number=>outRows.some(row=>row.number===number))).length,auxCount:scene.auxInputs.length},warnings};
  }

  function normalizeMappings(value){
    if(value==null)return [];
    if(!Array.isArray(value)||value.length>128)fail('Ungültige X32-Stagebox-Zuordnungen.');
    const used=new Set();
    return value.map(item=>{
      if(!object(item)||typeof item.stagebox!=='string'||!item.stagebox.trim()||item.stagebox.length>100||/[\u0000-\u001f\u007f]/.test(item.stagebox)||!own(BANKS,item.bank)||!integer(item.offset??0,0,BANKS[item.bank].limit-1))fail('Ungültige X32-Stagebox-Zuordnung.');
      const stagebox=item.stagebox.trim();if(used.has(stagebox))fail('Eine Stagebox darf nur einmal dem X32 zugeordnet werden.');used.add(stagebox);
      return {stagebox,bank:item.bank,offset:Number(item.offset??0)};
    });
  }

  function normalizeAttachment(value){
    if(value==null)return null;
    if(!object(value)||value.version!==1||typeof value.text!=='string')fail('Die gespeicherte X32-Vorlage ist ungültig.');
    if(!validationCache.has(value.text)){
      read(value.text);validationCache.set(value.text,true);
      if(validationCache.size>2)validationCache.delete(validationCache.keys().next().value);
    }
    const filename=cleanText(value.filename).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120)||'X32-Vorlage.scn';
    return {version:1,text:value.text,filename,mappings:normalizeMappings(value.mappings)};
  }

  function label(value,current,path,warnings){
    const original=String(value??'');
    if(original===current)return original;
    if(/["\\\u0000-\u001f\u007f]/.test(original))fail('Der Name für '+path+' enthält Anführungszeichen, Rückstriche oder Steuerzeichen. Bitte einen einfachen X32-Namen verwenden.');
    const substitutions={'ä':'ae','ö':'oe','ü':'ue','Ä':'Ae','Ö':'Oe','Ü':'Ue','ß':'ss','·':' '};
    const ascii=original.replace(/[äöüÄÖÜß·]/g,char=>substitutions[char]).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');
    const result=ascii.slice(0,12);
    if(original&& !/[A-Za-z0-9]/.test(result)&&/[^\x20-\x7e]/.test(original))fail('Der Name für '+path+' lässt sich nicht als lesbarer X32-Name übertragen.');
    if(result!==original)warnings.push(path+': „'+original+'“ wird als „'+result+'“ übertragen (X32: höchstens 12 ASCII-Zeichen).');
    return result;
  }

  function exportScene(templateText,plan={}){
    if(!object(plan))fail('Ungültige X32-Exportdaten.');
    const data=read(templateText),scene=data.result,warnings=scene.warnings.slice(),changes=[],replacements=new Map(),mappings=normalizeMappings(plan.mappings);
    const patch=(path,index,value,quote=false)=>{
      const record=data.records.get(path);if(!record||!record.parts[index])fail('Der Parameter '+path+' fehlt in der X32-Vorlage.');
      if(record.parts[index].value===String(value))return;
      let map=replacements.get(path);if(!map){map=new Map();replacements.set(path,map);}
      map.set(index,quote?'"'+value+'"':String(value));
    };
    const checkRows=(value,kind,max)=>{
      if(value==null)return [];
      if(!Array.isArray(value)||value.length>max)fail('Das X32 unterstützt höchstens '+max+' '+(kind==='channel'?'Eingangskanäle':'Busse')+'.');
      const used=new Set();
      return value.map(row=>{
        if(!object(row)||!integer(row.number,1,max)||row.number==null||row.number==='')fail('Für den X32-Export braucht jeder '+(kind==='channel'?'Eingang':'Bus')+' eine Nummer von 1 bis '+max+'.');
        const number=Number(row.number);if(used.has(number))fail((kind==='channel'?'Kanal ':'Bus ')+number+' ist im X32-Export mehrfach belegt.');used.add(number);
        if(row.x32&&(!object(row.x32)||row.x32.kind!==kind||!integer(row.x32.channel,1,max)))fail('Die gespeicherte X32-Kanalzuordnung ist ungültig.');
        return row;
      });
    };
    const inputs=checkRows(plan.inputs,'channel',32),outputs=checkRows(plan.outputs,'bus',16);
    const updateLinks=(rows,path,flags)=>{
      const groups=new Map(),byNumber=new Map(rows.map(row=>[Number(row.number),row]));
      for(const row of rows){
        const stereo=/^Stereo [LR]$/.test(row.mode||'');
        if(stereo!==!!row.stereoGroup)fail('Stereo-Kanal '+row.number+' braucht ein vollständiges, verknüpftes L/R-Paar.');
        if(row.stereoGroup){const group=groups.get(row.stereoGroup)||[];group.push(row);groups.set(row.stereoGroup,group);}
      }
      for(const group of groups.values()){
        const left=group.find(row=>row.mode==='Stereo L'),right=group.find(row=>row.mode==='Stereo R');
        if(group.length!==2||!left||!right||Number(left.number)%2!==1||Number(right.number)!==Number(left.number)+1)fail('Das X32 verknüpft nur vollständige ungerade/gerade Stereo-Paare, zum Beispiel 9/10.');
      }
      const count=path==='/config/chlink'?16:8;
      for(let index=0;index<count;index++){
        const left=byNumber.get(index*2+1),right=byNumber.get(index*2+2);if(!left&&!right)continue;
        const linked=left&&right&&left.stereoGroup&&left.stereoGroup===right.stereoGroup;
        if(!flags){if(linked)fail('Stereo-Verknüpfungen fehlen in der X32-Vorlage.');continue;}
        if((!left||!right)&&flags[index]==='ON')fail('Für Änderungen am verknüpften X32-Paar '+(index*2+1)+'/'+(index*2+2)+' müssen beide Kanäle im Export enthalten sein.');
        if(left&&right)patch(path,index,linked?'ON':'OFF');
      }
    };
    updateLinks(inputs,'/config/chlink',data.channelFlags);updateLinks(outputs,'/config/buslink',data.busFlags);
    for(const [rows,kind] of [[inputs,'ch'],[outputs,'bus']])for(const row of rows){
      const path='/'+kind+'/'+pad(row.number)+'/config',entry=(kind==='ch'?scene.channels:scene.buses).find(entry=>entry.number===Number(row.number));
      if(!entry)fail('Der '+(kind==='ch'?'Kanal ':'Bus ')+row.number+' fehlt in der X32-Vorlage.');
      patch(path,0,label(row.instrument,entry.name,path,warnings),true);
      if(row.x32&&Number(row.x32.channel)!==Number(row.number))warnings.push((kind==='ch'?'Kanal ':'Bus ')+row.x32.channel+' wird auf '+row.number+' übertragen. Der ursprüngliche Kanal und die Klangbearbeitung des Zielkanals bleiben unverändert.');
      if(kind==='bus'){
        if(row.stagebox||row.stageboxPort!=null)warnings.push('Bus '+row.number+': Die physische Ausgangszuordnung bleibt wie in der X32-Vorlage. Stagebox-Ausgangsbuchsen werden nicht übertragen.');
        continue;
      }
      let source=entry.source;
      if(row.x32){
        const origin=scene.channels.find(channel=>channel.number===Number(row.x32.channel));
        if(!origin)fail('Der ursprüngliche X32-Kanal '+row.x32.channel+' fehlt in dieser Vorlage. Bitte die Kanäle erneut importieren.');
        if(own(row.x32,'source')&&(!integer(row.x32.source,0,65535)||Number(row.x32.source)!==origin.source))fail('Die gespeicherte X32-Eingangsquelle für Kanal '+row.number+' passt nicht zur Vorlage. Bitte die Kanäle erneut importieren.');
        source=origin.source;
      }
      if(row.stagebox){
        const mapping=mappings.find(mapping=>mapping.stagebox===row.stagebox);
        if(!mapping)fail('Für die Stagebox an Kanal '+row.number+' fehlt die X32-Zuordnung.');
        if(!integer(row.stageboxPort,1,128))fail('Für Kanal '+row.number+' fehlt eine gültige Stagebox-Buchse.');
        const port=Number(row.stageboxPort)+mapping.offset;
        if(port>BANKS[mapping.bank].limit)fail('Die Stagebox-Buchse an Kanal '+row.number+' liegt außerhalb von '+BANKS[mapping.bank].label+'.');
        const matches=scene.routing.sources.filter(candidate=>candidate.resolved&&candidate.bank===mapping.bank&&candidate.port===port);
        if(!matches.length)fail(BANKS[mapping.bank].label+' '+port+' ist in den aktiven Eingangsblöcken der Vorlage nicht enthalten. Bitte das Routing zuerst in X32-Edit vorbereiten.');
        source=(matches.find(candidate=>candidate.source===source)||matches[0]).source;
      }else if(row.stageboxPort!=null&&row.stageboxPort!=='')fail('Kanal '+row.number+' hat eine Buchse ohne zugeordnete Stagebox.');
      if(!row.x32&&!row.stagebox)warnings.push('Kanal '+row.number+' übernimmt die Eingangsquelle der Vorlage ('+entry.sourceAddress.label+').');
      // Numeric spelling (e.g. +1 or 01) is not an edit. Preserve the token too.
      if(source!==entry.source)patch(path,3,source);
    }
    for(const [path,map] of replacements){
      const record=data.records.get(path),line=data.lines[record.index],before=line.body;
      let after=before;
      for(const [index,value] of [...map.entries()].sort((a,b)=>b[0]-a[0])){const part=record.parts[index];after=after.slice(0,part.start)+value+after.slice(part.end);}
      line.body=after;changes.push({path,before,after});
    }
    return {text:data.lines.map(line=>line.body+line.ending).join(''),changes,warnings};
  }

  return {parse,importRouting,exportScene,normalizeAttachment,normalizeMappings,MAX_TEXT,BANKS};
});
