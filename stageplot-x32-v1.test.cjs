const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const X=require('./stageplot-x32-v1.js');
const clone=value=>JSON.parse(JSON.stringify(value));

// Generated, synthetic scene data only. No user scene or contact data is kept in
// repository fixtures. Deliberately unusual spacing exposes lossy serializers.
function fixture({ending='\n',finalNewline=true,bom=false,mode='REC'}={}){
  const channelLinks=Array(16).fill('OFF');channelLinks[4]='ON';
  const busLinks=Array(8).fill('OFF');busLinks[1]='ON';
  const lines=[
    (bom?'\uFEFF':'')+'#4.0# "Synthetic" "" %000000000 1     ',
    '# Arbitrary comment retained exactly',
    '/config/chlink '+channelLinks.join(' '),
    '/config/buslink '+busLinks.join(' '),
    '/config/routing '+mode,
    '/config/routing/IN AN1-8 AN9-16 A1-8 A9-16 AUX1-4',
    '/config/routing/PLAY CARD1-8 CARD9-16 CARD17-24 CARD25-32 AUX1-4',
    '/config/routing/AES50A OUT1-8 OUT9-16 OUT1-8 OUT9-16 P161-8 P169-16',
    '/config/userrout/in '+Array(32).fill('0').join(' '),
    '/config/future-feature "opaque value" +1.00 OFF',
  ];
  for(let number=1;number<=32;number++){
    const name=({1:'Kick',2:'Snare',9:'Keys L',10:'Keys R',17:'Vocal'})[number]||'';
    lines.push('/ch/'+String(number).padStart(2,'0')+'/config  "'+name+'"\t 3 BL  '+number+'   ');
  }
  lines.push('/auxin/01/config "Playback" 55 GN 33');
  for(let number=1;number<=16;number++){
    const name=({1:'MON STAGE',3:'IEM KIT L',4:'IEM KIT R',13:'HALL'})[number]||'MixBus '+number;
    lines.push('/bus/'+String(number).padStart(2,'0')+'/config "'+name+'" 63 YE');
  }
  lines.push('/ch/01/eq/1 PEQ 123.0 -3.00 2.0','/ch/01/dyn ON COMP PEAK LOG -24.0 4.0 1 0.00 10 10.0 151 POST 0 100 OFF','/ch/01/mix ON -6.0 +0 ON -oo','/ch/01/mix/01 ON -12.0 +0 EQ-> 0','/headamp/000 +22.5 ON','/outputs/main/01 4 POST OFF','/outputs/main/01/delay ON 13.2','/fx/1/type HALL','/future/opaque "unknown original text"', '');
  if(!finalNewline)lines.pop();
  return lines.join(ending);
}

const text=fixture(),parsed=X.parse(text),imported=X.importRouting(text);
assert.equal(parsed.version,'4.0');assert.equal(parsed.name,'Synthetic');
assert.equal(parsed.channels.length,32);assert.equal(parsed.buses.length,16);
assert.deepEqual(parsed.channelLinks,[[9,10]]);assert.deepEqual(parsed.busLinks,[[3,4]]);
assert.equal(parsed.channels[0].sourceAddress.bank,'local');assert.equal(parsed.channels[0].sourceAddress.port,1);
assert.deepEqual(parsed.channels[16].sourceAddress,{bank:'aes50-a',port:1,label:'AES50 A 1',resolved:true});
assert.equal(parsed.channels[31].sourceAddress.port,16);
assert.deepEqual(imported.inputs.map(row=>row.number),[1,2,9,10,17]);
assert.deepEqual(imported.outputs.map(row=>row.number),[1,3,4,13]);
assert(imported.outputs.every(row=>row.outputKind==='line'),'Bus labels do not invent physical monitor types');
assert.equal(imported.inputs.find(row=>row.number===9).mode,'Stereo L');
assert.equal(imported.inputs.find(row=>row.number===10).mode,'Stereo R');
assert.equal(imported.inputs[0].x32.source,1);assert.equal(imported.inputs[0].manual,true);
assert.equal(imported.inputs[0].sourceKey,'');assert.equal(imported.inputs[0].stagebox,'');
assert.equal(imported.summary.channelPairs,1);assert.equal(imported.summary.busPairs,1);
assert.equal(imported.summary.auxCount,1);assert(imported.warnings.some(warning=>warning.includes('Aux-/USB')));

// Import -> export is byte exact: header padding, unknown paths, numeric spelling,
// whitespace, BOM, CRLF and missing final newlines are all retained.
for(const options of [{},{ending:'\r\n',bom:true},{ending:'\r',finalNewline:false},{finalNewline:false}]){
  const source=fixture(options),result=X.exportScene(source,X.importRouting(source));
  assert.equal(result.text,source);assert.deepEqual(result.changes,[]);
}
assert.equal(X.exportScene(text,{}).text,text,'An empty overlay cannot clear channels');
assert.equal(X.exportScene(text,{inputs:[clone(imported.inputs[0])]}).text,text,'Unmanaged channels stay byte exact');

// A minimal template can be inspected, but writing a missing target is rejected.
const minimum='#4.0# "Synthetic"\n/ch/01/config "Kick" 1 BL 1\n';
assert.equal(X.parse(minimum).channels.length,1);
assert.equal(X.exportScene(minimum,{inputs:[{number:1,instrument:'Kick'}]}).text,minimum);
assert.throws(()=>X.exportScene(minimum,{inputs:[{number:2,instrument:'Snare'}]}),/fehlt/);

const changed=clone(imported);changed.inputs[0].instrument='Kick In';changed.outputs[0].instrument='Wedge';
const before=clone(changed),renamed=X.exportScene(text,changed);
assert.deepEqual(changed,before,'The exporter does not mutate the plan');
assert.deepEqual(renamed.changes.map(change=>change.path),['/ch/01/config','/bus/01/config']);
assert(renamed.text.includes('/ch/01/config  "Kick In"\t 3 BL  1   '));
for(const path of ['/headamp/000','/ch/01/eq/1','/ch/01/dyn','/ch/01/mix','/ch/01/mix/01','/outputs/main/01','/outputs/main/01/delay','/config/routing/AES50A','/fx/1/type','/future/opaque']){
  const original=text.split('\n').find(line=>line.startsWith(path+' '));
  assert(renamed.text.split('\n').includes(original),path+' remains unchanged');
}
const patched=clone(imported);patched.inputs[0].stagebox='stagebox-a';patched.inputs[0].stageboxPort=3;
patched.mappings=[{stagebox:'stagebox-a',bank:'aes50-a',offset:0}];
const patchResult=X.exportScene(text,patched);
assert.equal(X.parse(patchResult.text).channels[0].source,19,'Stagebox A3 selects active input slot19, not physical source3');
assert.equal(X.parse(patchResult.text).channels[0].sourceAddress.port,3);
assert.deepEqual(patchResult.changes.map(change=>change.path),['/ch/01/config']);
assert(patchResult.text.includes('/headamp/000 +22.5 ON'),'Patching never transfers gain/phantom');
patched.mappings[0].offset=8;
assert.equal(X.parse(X.exportScene(text,patched).text).channels[0].source,27,'Daisy-chain offset is explicit');
patched.mappings=[];assert.throws(()=>X.exportScene(text,patched),/Zuordnung/);
patched.mappings=[{stagebox:'stagebox-a',bank:'aes50-b',offset:0}];
assert.throws(()=>X.exportScene(text,patched),/aktiven Eingangsblöcken/);
patched.mappings=[{stagebox:'stagebox-a',bank:'aes50-a',offset:47}];
assert.throws(()=>X.exportScene(text,patched),/außerhalb/);
patched.inputs[0].stageboxPort=null;assert.throws(()=>X.exportScene(text,patched),/Buchse/);
assert.throws(()=>X.exportScene(text,{inputs:[{number:1,instrument:'Kick',stageboxPort:2}]}),/ohne zugeordnete/);

const play=fixture({mode:'PLAY'}),playScene=X.parse(play);
assert.equal(playScene.routing.activePath,'/config/routing/PLAY');assert.equal(playScene.channels[0].sourceAddress.bank,'card');
const cardPlan=clone(imported);cardPlan.inputs[0].stagebox='card-device';cardPlan.inputs[0].stageboxPort=8;cardPlan.mappings=[{stagebox:'card-device',bank:'card',offset:8}];
assert.equal(X.parse(X.exportScene(play,cardPlan).text).channels[0].source,16);

const userRouting=text.replace('AN1-8 AN9-16','UIN1-8 AN9-16');
assert.equal(X.parse(userRouting).channels[0].sourceAddress.resolved,false);
assert.equal(X.exportScene(userRouting,X.importRouting(userRouting)).text,userRouting,'Unresolved User-In is preserved');
const auxSource=text.replace('/ch/01/config  "Kick"\t 3 BL  1','/ch/01/config  "Kick"\t 3 BL  33');
assert.equal(X.parse(auxSource).channels[0].sourceAddress.resolved,false);
assert.equal(X.exportScene(auxSource,X.importRouting(auxSource)).text,auxSource,'Unresolved direct Aux selector is preserved');
const opaqueSource=text.replace('/ch/01/config  "Kick"\t 3 BL  1','/ch/01/config  "Kick"\t 3 BL  65');
const opaqueImport=X.importRouting(opaqueSource);assert.equal(X.exportScene(opaqueSource,opaqueImport).text,opaqueSource);
const opaqueMoved=clone(opaqueImport.inputs[0]);opaqueMoved.number=8;delete opaqueMoved.x32.source;
assert.equal(X.parse(X.exportScene(opaqueSource,{inputs:[opaqueMoved]}).text).channels[7].source,65,'Origin template supplies preserved opaque sources even without redundant metadata');
for(const numeric of ['01','+1']){
  const padded=text.replace('/ch/01/config  "Kick"\t 3 BL  1','/ch/01/config  "Kick"\t 3 BL  '+numeric);
  assert.equal(X.exportScene(padded,X.importRouting(padded)).text,padded,'Unchanged numeric source spelling stays byte exact');
}

// Link flags are data, not a guess based on names. Deleting one member cannot
// silently overwrite an unmanaged partner, and X32 rejects even/odd pairs.
const unlinked=text.replace('/config/chlink OFF OFF OFF OFF ON','/config/chlink OFF OFF OFF OFF OFF');
assert(X.importRouting(unlinked).inputs.filter(row=>[9,10].includes(row.number)).every(row=>row.mode==='Mono'));
const unnamedPartner=text.replace('"Keys R"','""');
assert(X.importRouting(unnamedPartner).inputs.some(row=>row.number===10&&row.instrument===''));
assert.equal(X.exportScene(unnamedPartner,X.importRouting(unnamedPartner)).text,unnamedPartner);
const pairPlan=clone(imported);
for(const row of pairPlan.inputs.filter(row=>[9,10].includes(row.number))){row.mode='Mono';row.stereoGroup='';}
assert.deepEqual(X.parse(X.exportScene(text,pairPlan).text).channelLinks,[]);
pairPlan.inputs.find(row=>row.number===9).number=8;pairPlan.inputs.find(row=>row.number===10).number=9;
pairPlan.inputs.find(row=>row.number===8).mode='Stereo L';pairPlan.inputs.find(row=>row.number===8).stereoGroup='bad';
pairPlan.inputs.find(row=>row.number===9).mode='Stereo R';pairPlan.inputs.find(row=>row.number===9).stereoGroup='bad';
assert.throws(()=>X.exportScene(text,pairPlan),/ungerade\/gerade/);
assert.throws(()=>X.exportScene(text,{inputs:[clone(imported.inputs.find(row=>row.number===9))]}),/vollständige/);
assert.throws(()=>X.exportScene(text,{inputs:[{number:9,instrument:'Mono',mode:'Mono'}]}),/beide Kanäle/);

const moved=clone(imported.inputs[0]);moved.number=8;
const movedExport=X.exportScene(text,{inputs:[moved]});
assert.equal(X.parse(movedExport.text).channels[7].source,1);assert.equal(X.parse(movedExport.text).channels[7].name,'Kick');
assert(movedExport.text.includes('/ch/01/config  "Kick"\t 3 BL  1   '));
assert(movedExport.warnings.some(warning=>warning.includes('ursprüngliche Kanal')));
assert.throws(()=>X.exportScene(text,{inputs:[{number:1,instrument:'A'},{number:1,instrument:'B'}]}),/mehrfach/);
assert.throws(()=>X.exportScene(text,{inputs:[{number:33,instrument:'A'}]}),/1 bis 32/);
assert.throws(()=>X.exportScene(text,{outputs:[{number:17,instrument:'A'}]}),/1 bis 16/);
assert.throws(()=>X.exportScene(text,{inputs:[{number:null,instrument:'A'}]}),/Nummer/);
assert.throws(()=>X.exportScene(text,{inputs:[{number:1,instrument:'A',x32:{kind:'bus'}}]}),/Kanalzuordnung/);
assert.throws(()=>X.exportScene(text,{inputs:[{number:1,instrument:'A',x32:{kind:'channel',channel:0,source:1}}]}),/Kanalzuordnung/);
assert.throws(()=>X.exportScene(text,{inputs:[{number:1,instrument:'A',x32:{kind:'channel',channel:1,source:65535}}]}),/passt nicht zur Vorlage/);
assert.throws(()=>X.exportScene(minimum,{inputs:[{number:1,instrument:'A',x32:{kind:'channel',channel:2}}]}),/ursprüngliche X32-Kanal/);
assert(X.exportScene(text,{outputs:[{number:1,instrument:'MON STAGE',stagebox:'outputs',stageboxPort:1}]}).warnings.some(warning=>warning.includes('Ausgangszuordnung bleibt')));

const longName=X.exportScene(text,{inputs:[{number:1,instrument:'Übergröße · Keys'}]});
assert.equal(X.parse(longName.text).channels[0].name,'Uebergroesse');
assert(longName.warnings.some(warning=>warning.includes('12 ASCII')));
for(const instrument of ['A"B','A\\B','A\nB','A\tB'])assert.throws(()=>X.exportScene(text,{inputs:[{number:1,instrument}]}),/einfachen X32-Namen/);
const legacyName=text.replace('"Kick"','"Überlanges Original"');
assert.equal(X.exportScene(legacyName,X.importRouting(legacyName)).text,legacyName,'Existing non-ASCII/long labels stay verbatim');

const attachment=X.normalizeAttachment({version:1,text,filename:'folder/scene.scn',mappings:[{stagebox:'box',bank:'local',offset:0}],secret:'excluded'});
assert.deepEqual(Object.keys(attachment),['version','text','filename','mappings']);assert.equal(attachment.filename,'scene.scn');
assert.deepEqual(X.normalizeAttachment(clone(attachment)),attachment);assert.equal(X.normalizeAttachment(null),null);
assert.throws(()=>X.normalizeAttachment({version:2,text}),/ungültig/);
assert.throws(()=>X.normalizeAttachment({version:1,text:'invalid'}),/nicht unterstützt/);
assert.throws(()=>X.normalizeMappings([{stagebox:'box',bank:'local',offset:0},{stagebox:'box',bank:'card',offset:0}]),/nur einmal/);
assert.throws(()=>X.normalizeMappings([{stagebox:'box',bank:'__proto__',offset:0}]),/Ungültige/);

for(const bad of [
  text.replace('#4.0#','#2.0#'),
  text+'\n/ch/01/config "Duplicate" 1 BL 1',
  text+'\n/ch/01/config/source 2',
  text+'\n/ch/01/config/name "Override"',
  text+'\n/config/routing/IN/1-8 A1-8',
  text.replace('"Kick"','"Unclosed'),
  text.replace('/ch/01/config','/ch/33/config'),
  text.replace('/config/chlink OFF','/config/chlink MAYBE'),
  text+'\u0000',
  'x'.repeat(X.MAX_TEXT+1),
])assert.throws(()=>X.parse(bad));

// The same pure implementation also exposes the browser global, without Node.
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('stageplot-x32-v1.js','utf8'),context);
assert.equal(typeof context.StageplotX32.exportScene,'function');
assert.equal(context.StageplotX32.exportScene(text,context.StageplotX32.importRouting(text)).text,text);
console.log('PASS X32 SCENES: exact template roundtrip, known input-bank mapping, explicit stagebox offsets, sparse overlays, channel/bus stereo, unchanged DSP/phantom/outputs, native-name preview, metadata validation and malformed-scene rejection.');
