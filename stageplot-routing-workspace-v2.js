(function (global) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const normalized = value => String(value || '').toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sourceId = row => String(row?.sourceKey || '').split(':')[0];
  const baseName = name => String(name || '').replace(/\s*(?:·\s*)?[LR]$/, '');
  const pickupName = kind => ({Mic:'Mikrofon', DI:'DI-Box', Direct:'Direktausgang', Digital:'Digital'}[kind] || 'Abnahme');
  const pickupKind = row => row.pickup || (row.mode === 'DI' ? 'DI' : row.signalType === 'Mic' ? 'Mic' : row.signalType === 'Digital' ? 'Digital' : 'Direct');
  const kindName = kind => ({iem:'IEM', monitor:'Wedge', line:'Line'}[kind] || 'Line');
  const monitorKind = (row, object) => row.outputKind || (row.iemMode || row.iemGroup || ['rack','iem-earphones'].includes(object?.type) ? 'iem' : object?.type === 'wedge' ? 'monitor' : 'line');
  const attrs = values => Object.entries(values).filter(([, value]) => value !== undefined && value !== null).map(([key,value]) => ' ' + key + '="' + esc(value) + '"').join('');
  const monoWarning='<span class="mx-mono-warning" role="img" aria-label="Quelle ist jetzt stereo. Mono-Zuweisung neu routen." title="Quelle ist jetzt stereo. Mono-Zuweisung neu routen.">!</span>';
  const pencil = '<span class="rw-pencil" aria-hidden="true">✎</span>';
  const idsOf = rows => rows.map(row => row.id).join('|');
  const splitIds = value => String(value || '').split('|').filter(Boolean);

  function create(host, api) {
    if (!host || !api?.getState || !api?.dispatch) throw new Error('Routing-Arbeitsbereich benötigt Host und Datenzugriff.');
    let state, sources = [], monitors = [], activeSource = '', activeMonitor = '', activeBox = '', activePort = null;
    let query = '', micQuery = '', openCard = '', pickerBox = '', error = '', destroyed = false, frame = 0, lastTab = '', toolsOpen = false, stageboxLayout = 'grid', pendingField = null;
    let stageObserver = null, resizeTarget = null, highlighted = [], diPickerRow = '', diPickerFocus = null, diPickerDevices = false, diPickerNew = false;
    let channelListOpen = false, channelQuery = '', channelUnconnected = false, channelDetail = '', channelNotice = '', channelFlash = [];
    const tabScrolls = new Map();
    let sceneOpen = false, sceneMapping = null, sceneText = null, sceneData = null, sceneError = '', sceneQuery = '';
    const nativeOutput = row => row?.x32?.kind === 'output';
    const nativeAux = row => row?.x32?.kind === 'aux';
    const directPort = row => !row?.stagebox && (row?.localPort || row?.x32?.directPort);
    const nativeDirect = row => Number.isInteger(directPort(row)) && directPort(row)>=1 && directPort(row)<=32;
    let localMixer, panelInventory;
    const mixerDevices = () => [...state.boxes.filter(item=>item.inputs),localMixer];
    const analogRows = () => state.routing.inputs.filter(row=>!nativeAux(row));
    const channelRow = number => analogRows().find(row=>row.number===number);
    const deviceLabel = id => id==='@user'?'User In':mixerDevices().find(item=>item.id===id)?.name || 'Stagebox';
    let mixerOpen=true, mixerProject, mixerTab='channels', mixerChannel=1, mixerSignal='', mixerDevice='', mixerPort=null, bankEditor=null, addingBox=false;
    const zoomByModel = new Map();
    const zoomSteps = [1, 1.5, 2, 3, 4];
    function preampButton(device,port){
      const key=global.StageplotRoutingModel.preampKey(device);
      const active=state.routing.preampPower?.some(entry=>entry.device===key&&entry.port===port)===true;
      const label=device.name+' · IN '+port+' · 48 V';
      return '<button type="button" class="rw-preamp"'+attrs({'data-rw-preamp':port,'data-device':device.id,'data-model':device.type,'aria-pressed':String(active),'aria-label':label,title:label+(active?' · Ein':' · Aus')})+(readonly()?' disabled':'')+'><i aria-hidden="true"></i><span aria-hidden="true">48 V</span></button>';
    }
    function zoomableSurface(type, renderPort, directions, deviceId) {
      const device=mixerDevices().find(item=>item.id===deviceId);
      const renderSocket=(direction,port)=>renderPort(direction,port)+(device&&direction==='inputs'?preampButton(device,port):'');
      const scale = zoomByModel.get(type) || 1;
      const control = (action, label, symbol, disabled) => '<button type="button"'+attrs({'data-panel-zoom':action,'aria-label':label,title:label})+(disabled?' disabled':'')+'>'+symbol+'</button>';
      return '<div class="rw-zoom-panel" data-zoom-model="'+esc(type)+'"'+attrs({'data-panel-device':deviceId})+' style="--panel-scale:'+scale+'"><div class="rw-panel-controls" role="group" aria-label="Buchsenansicht zoomen">'+
        control('out','Ansicht verkleinern','−',scale===1)+'<output aria-live="polite">'+Math.round(scale*100)+' %</output>'+
        control('in','Ansicht vergrößern','+',scale===4)+'<button type="button" data-panel-expand aria-haspopup="dialog">⛶ Vollbild</button></div>'+global.StageplotStageboxes.surface(type,renderSocket,directions)+'</div>';
    }
    function gridSurface(device,port) {
      const grid=Array.from({length:device.inputs},(_,i)=>port(i+1)).join('');
      return '<div class="rw-zoom-panel"'+attrs({'data-panel-device':device.id,'data-zoom-model':device.type})+'><div class="rw-panel-controls"><button type="button" data-panel-expand aria-haspopup="dialog">⛶ Vollbild</button></div><div class="sp-stagebox-device-scroll"><div class="mx-local">'+grid+'</div></div></div>';
    }
    let expandedView = null;
    function expandPanel(panel) {
      const viewport = panel.querySelector('.sp-stagebox-device-scroll');
      const model = global.StageplotStageboxes.get(panel.dataset.zoomModel);
      const devices = [localMixer, ...state.boxes.filter(box=>box.inputs)];
      const current = devices.find(device=>device.id===panel.dataset.panelDevice);
      const name = current?.name || model?.name || 'Stagebox';
      const choices = devices.map(device=>'<button type="button"'+attrs({'data-full-device':device.id,'aria-pressed':String(device.id===current?.id)})+'>'+esc(device.name)+'</button>').join('');
      const dialog = host.ownerDocument.createElement('dialog');
      dialog.className = 'rw-panel-fullscreen';
      dialog.setAttribute('aria-label', name + ' · Buchsenansicht');
      dialog.style.setProperty('--device-ratio', model ? model.viewBox[2] / model.viewBox[3] : 3);
      dialog.innerHTML = '<header><div class="rw-full-devices" role="group" aria-label="Gerät wählen">'+choices+'</div><button type="button" data-panel-collapse>Vollbild schließen</button></header><div class="rw-full-frame"></div>';
      const previousScroll = viewport.scrollLeft;
      expandedView = {deviceId:current?.id,model:panel.dataset.zoomModel, picker:!!panel.closest('.mx-picker')};
      panel.append(dialog);
      dialog.lastElementChild.append(viewport);
      if(error){
        const notice=host.ownerDocument.createElement('p');
        notice.className='rw-error';
        notice.setAttribute('role','alert');
        notice.textContent=error;
        dialog.querySelector('header').append(notice);
      }
      dialog.showModal();
      viewport.scrollLeft = 0;
      function close() {
        expandedView = null;
        dialog.close();
        panel.append(viewport);
        dialog.remove();
        viewport.scrollLeft = previousScroll;
        panel.querySelector('[data-panel-expand]').focus({preventScroll:true});
      }
      dialog.querySelector('[data-panel-collapse]').onclick = close;
      dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    }
    function restoreExpandedPanel(inPicker) {
      if (!expandedView || expandedView.picker !== inPicker) return;
      const panel = [...host.querySelectorAll('.rw-zoom-panel')].find(el=>
        el.dataset.zoomModel===expandedView.model && el.dataset.panelDevice===expandedView.deviceId && !!el.closest('.mx-picker')===inPicker);
      if (panel) expandPanel(panel);
      else expandedView=null;
    }
    function zoomSurface(control) {
      const panel=control.closest('.rw-zoom-panel'), model=panel.dataset.zoomModel;
      const step=zoomSteps.indexOf(zoomByModel.get(model)||1);
      const scale=zoomSteps[step+(control.dataset.panelZoom==='in'?1:-1)];
      if(!scale)return;
      zoomByModel.set(model,scale);
      const viewport=panel.querySelector('.sp-stagebox-device-scroll');
      const center=(viewport.scrollLeft+viewport.clientWidth/2)/viewport.scrollWidth;
      panel.style.setProperty('--panel-scale',scale);
      panel.querySelector('output').textContent=Math.round(scale*100)+' %';
      panel.querySelector('[data-panel-zoom="out"]').disabled=scale===1;
      panel.querySelector('[data-panel-zoom="in"]').disabled=scale===4;
      if(control.disabled)panel.querySelector('button:not(:disabled)').focus({preventScroll:true});
      viewport.scrollLeft=center*viewport.scrollWidth-viewport.clientWidth/2;
    }
    function bankOptions(){
      return mixerDevices().flatMap(device=>Array.from({length:Math.ceil(device.inputs/8)},(_,i)=>({id:device.id,first:i*8+1,last:Math.min(i*8+8,device.inputs)})));
    }
    function mixerChoice(label,key,value,selected=false,extra={}){
      return '<button type="button"'+attrs({['data-rw-'+key]:value,'aria-pressed':String(selected),...extra})+'>'+esc(label)+'</button>';
    }
    // Manual and imported channels can have a name without a linked stage object.
    const socketAliases=[
      [/\b(?:keyboard|keys?|synth|piano|klavier|rhodes|organ|orgel)\b/,'keys-stage4'],
      [/\b(?:acoustic|akustik)/,'acoustic'],[/\b(?:bass|ebass)\b/,'bass'],
      [/guitar|gitarre/,'guitar'],[/vocal|gesang|mikro|\bvox\b|\bmic\b/,'mic-wireless-ewd'],
      [/sax/,'saxophone'],[/geige/,'violin'],[/playback|clicktrack/,'laptop']
    ];
    const drumBadges=[
      [/kick|bassdrum|bass drum/,'kick-overhead-v3.png',{width:512,height:543,crop:[0,0,512,320]}],[/snare/,'snare.webp'],
      [/hi[ -]?hat/,'hihat-overhead-v2.png',{width:313,height:512,crop:[0,0,313,310]}],[/floor[ -]?tom/,'floor-tom.webp'],[/tom/,'rack-tom.webp'],
      [/ride/,'ride.webp'],[/crash|overhead/,'crash.webp']
    ];
    function socketInstrumentArt(type,source,drum){
      if(drum){
        const frame=drum[2],file='stageplot-assets/drums/'+drum[1];
        return frame?'<svg viewBox="'+frame.crop.join(' ')+'" aria-hidden="true"><image href="'+file+'" width="'+frame.width+'" height="'+frame.height+'"/></svg>':'<img src="'+file+'" alt="">';
      }
      const thumbnail=api.socketIcon?.(source?{...source,angle:0}:type);
      if(thumbnail)return thumbnail;
      const compactSymbol=/^keys(?:-|$)/.test(type||'')?'🎹':/^mic(?:-|$)/.test(type||'')?'🎤':'';
      return compactSymbol||(type?icon(source?{...source,angle:0}:type):'');
    }
    function socketBadge(row){
      if(!row)return '';
      const name=row.instrument||row.generatedInstrument||'Signal', text=normalized(name);
      const source=object(sourceId(row)), side=/^Stereo ([LR])$/.exec(row.mode||'')?.[1]||'';
      const drum=(!source||source.type.startsWith('drum'))&&drumBadges.find(([re])=>re.test(text));
      const match=!source&&!drum&&Object.values(state.catalog||{}).filter(c=>c.instrument!==false).find(c=>
        [c.id,c.name,c.short].some(label=>label&&normalized(baseName(name)).trim()===normalized(label)));
      const type=source?.type||match?.id||socketAliases.find(([re])=>re.test(text))?.[1];
      const glyph=socketInstrumentArt(type,source,drum);
      const initials=name.trim().split(/[\s·_-]+/u).slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase('de');
      return '<span class="mx-socket-badge" aria-hidden="true"><span class="mx-socket-glyph">'+(glyph||'<span class="mx-socket-initials">'+esc(initials||'♪')+'</span>')+'</span>'+'<span class="mx-signal-caption">'+esc((side?baseName(name):name).replace(/^Drums\s*·\s*/,'')||name)+'</span>'+(side?'<b>'+side+'</b>':'')+(side&&row.stereoGroup?'<span class="mx-link-symbol" aria-hidden="true">SL</span>':'')+'</span>';
    }
    const socketNumber=port=>'<span class="mx-input-number" aria-hidden="true">'+port+'</span>';
    const physicalOrigin=group=>group?.rows.find(row=>row.id===group.id)||group?.rows[0];
    let sourcePicker=null;
    const transferNames={move:'Verschieben',duplicate:'Duplizieren',switch:'Tauschen'};
    function closeSourcePicker(){
      const choosingMixer=sourcePicker?.chooseMixer;
      const link=sourcePicker?.link,port=sourcePicker?.socket?.port,slot=sourcePicker?.userSlot;
      sourcePicker=null;error='';render();
      if(choosingMixer){host.querySelector('[data-rw-mixer-choose-console]')?.focus({preventScroll:true});return;}
      if(slot){host.querySelector('[data-rw-mixer-user-slot="'+slot+'"]')?.focus({preventScroll:true});return;}
      if(port){host.querySelector('[data-rw-mixer-port="'+port+'"]')?.focus({preventScroll:true});return;}
      if(link){host.querySelector('[data-rw-mixer-link="'+link+'"]')?.focus({preventScroll:true});return;}
      host.querySelector('[data-rw-mixer-channel="'+mixerChannel+'"]')?.focus({preventScroll:true});
    }
    function fixedSocketChannel(device,port,selected) {
      const inventory=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes);
      const matches=channel=>{
        const patch=inventory.bankSocket(channel);
        return patch?.id===device && patch.port===port;
      };
      if(matches(selected))return selected;
      for(let channel=1;channel<=32;channel++){
        if(inventory.banks[Math.floor((channel-1)/8)].id!=='@user' && matches(channel))return channel;
      }
      return null;
    }
    function applySourceChoice(row,operation){
      const channel=sourcePicker.pairStart||mixerChannel;
      const banks=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes).banks;
      const fixedTarget=sourcePicker.socket && banks[Math.floor((mixerChannel-1)/8)].id!=='@user' &&
        fixedSocketChannel(sourcePicker.socket.boxId,sourcePicker.socket.port,mixerChannel)===mixerChannel;
      const done=doAction({type:sourcePicker.socket&&!fixedTarget?'transferToMixerSocket':operation==='insert'?'insertMixerSignal':'transferMixerSignal',...sourcePicker.socket,slotIds:sourcePicker.slotIds,rowId:row.id,channel,previous:sourcePicker.previous,targetId:sourcePicker.targetId,stereo:sourcePicker.stereo,stereoStamp:sourcePicker.stamp,operation});
      if(done===false)return;
      if(sourcePicker.socket)mixerTab='channels';
      mixerChannel=channel;mixerSignal='';mixerPort=null;mixerDevice='';closeSourcePicker();
      api.announce?.((row.instrument||'Signal')+' auf CH '+mixerChannel);
    }
    function pendingRight(channel){
      if(channel%2!==0)return;
      const left=channelRow(channel-1);
      if(left?.mode==='Stereo L'&&left.stereoGroup)return analogRows().find(row=>row.stereoGroup===left.stereoGroup&&row.mode==='Stereo R'&&!row.number&&!row.mixerVacant);
    }
    function evenPairOptions(left){
      if(readonly()||!left?.number||left.number%2||left.mode!=='Stereo L'||!left.stereoGroup)return '';
      const right=analogRows().find(r=>r.stereoGroup===left.stereoGroup&&r.mode==='Stereo R'&&!r.number&&!r.mixerVacant);
      if(!right)return '';
      return '<div class="mx-start-options mx-even-options">'+[left.number-1,left.number+1].filter(n=>n>=1&&n<32).map(first=>{
        const slots=[channelRow(first),channelRow(first+1)];
        const blocked=slots.some(r=>r?.stereoGroup&&r!==left);
        return '<button type="button"'+attrs({'data-rw-mixer-even-pair':first,'data-right':right.id})+(blocked?' disabled':'')+'><strong>CH '+first+'/'+(first+1)+'</strong><small>'+slots.map((r,i)=>'CH '+(first+i)+' · '+esc(r?.instrument||'Frei')).join('<br>')+(blocked?'<br>Bereits verlinkt':'')+'</small></button>';
      }).join('')+'</div>';
    }
    function stereoCompletion(right,first){
      const plan=global.StageplotRoutingModel.mixerStereoPlan(state.routing.inputs,right,first);
      return {type:'completeMixerStereo',first,rowId:right.id,previous:plan.members[0].number,stamp:plan.stamp};
    }
    function offerCompletion(right){
      const action=stereoCompletion(right,mixerChannel-1),target=channelRow(mixerChannel);
      sourcePicker={completion:action};
      if(!target||target.mixerVacant&&!target.stereoGroup){
        if(doAction(action)!==false)closeSourcePicker();
      }else render();
    }
    function displacedChannelChoices(action,number){
      const moves=action.moves||{},selected=moves[number]||0,free=[];
      for(let n=1;n<=32;n++){
        if(n===action.first||n===action.first+1)continue;
        const row=channelRow(n);
        if(row&&(!row.mixerVacant||row.stereoGroup))continue;
        if(n!==selected&&Object.values(moves).includes(n))continue;
        free.push(n);
      }
      const button=n=>mixerChoice('CH '+n,'mixer-relocate',n,selected===n,{'data-from':number});
      const visible=free.filter(n=>n===selected||free.indexOf(n)<3);
      const more=free.filter(n=>!visible.includes(n));
      return '<fieldset><legend>'+esc(channelRow(number)?.instrument)+' · CH '+number+'</legend>'+
        (free.length?'<p>Auf freien Kanal verschieben</p>'+visible.map(button).join('')+
        (more.length?'<details><summary>Weitere freie Kanäle</summary>'+more.map(button).join('')+'</details>':''):'<p>Kein freier Mixerkanal verfügbar.</p>')+
        mixerChoice('Als offenes Signal behalten','mixer-relocate',0,!selected,{'data-from':number})+'</fieldset>';
    }
    function completionPreview(action,conflicts){
      const model=global.StageplotRoutingModel;
      const inventory=model.mixerInventory(state.routing,state.boxes);
      function assignment(row,channel){
        const patch=channel?inventory.bankSocket(channel):null;
        const socket=patch?deviceLabel(patch.id)+' · IN '+patch.port:'—';
        return '<tr><td>'+esc(row.instrument)+'</td><td>'+(channel?'CH '+channel:'Offen')+'</td><td>'+esc(socket)+'</td></tr>';
      }
      const pair=model.mixerStereoPlan(state.routing.inputs,route(action.rowId),action.first).members;
      const rows=pair.map((row,i)=>assignment(row,action.first+i));
      for(const n of conflicts)rows.push(assignment(channelRow(n),action.moves?.[n]));
      return '<table class="mx-completion-preview"><caption>Neue Belegung</caption><thead><tr><th>Signal</th><th>Mixerkanal</th><th>Physische Buchse</th></tr></thead><tbody>'+rows.join('')+'</tbody></table>';
    }
    function sourcePickerView(){
      if(sourcePicker.chooseMixer){
        const catalog=global.StageplotStageboxes.mixers;
        const brands=[...new Set(catalog.map(m=>m.brand))];
        const groups=brands.map(brand=>'<section><h3>'+esc(brand)+'</h3><div class="mx-console-grid">'+
          catalog.filter(m=>m.brand===brand).map(m=>'<button type="button"'+attrs({'data-rw-mixer-console':m.id,'aria-pressed':String(localMixer.type===m.id)})+'>'+
          global.StageplotStageboxes.picture(m.id)+'<strong>'+esc(m.name)+'</strong><small>'+m.inputs+' Mic/Line-Eingänge</small></button>').join('')+'</div></section>');
        return '<dialog class="mx-picker mx-console-picker" aria-labelledby="mx-picker-title"><header><h2 id="mx-picker-title">Mischpult wählen</h2><button data-rw-mixer-close aria-label="Schließen">×</button></header>'+groups.join('')+'</dialog>';
      }
      if(sourcePicker.evenConflict){
        const a=sourcePicker.completion;
        return '<dialog class="mx-picker" aria-labelledby="mx-picker-title"><header><h2 id="mx-picker-title">CH '+a.first+'/'+(a.first+1)+' belegen</h2><button data-rw-mixer-close aria-label="Schließen">×</button></header>'+sourcePicker.evenConflict.map(n=>displacedChannelChoices(a,n)).join('')+completionPreview(a,sourcePicker.evenConflict)+'<button data-rw-mixer-replace>Stereopaar zuweisen</button>'+(error?'<p role="alert">'+esc(error)+'</p>':'')+'</dialog>';
      }
      if(sourcePicker.completion){
        const action=sourcePicker.completion,n=action.first+1,target=channelRow(n);
        const pairs=[];
        for(let first=1;first<32;first+=2){
          if([first,first+1].every(ch=>{const r=channelRow(ch);return !r||r.mixerVacant&&!r.stereoGroup;}))
            pairs.push(mixerChoice('CH '+first+'/'+(first+1),'mixer-free-pair',first));
        }
        const replace=target&&!target.stereoGroup?displacedChannelChoices(action,n)+completionPreview(action,[n])+'<button data-rw-mixer-replace>CH '+n+' durch '+esc(route(action.rowId)?.instrument)+' ersetzen</button>':'';
        return '<dialog class="mx-picker" aria-labelledby="mx-picker-title"><header><h2 id="mx-picker-title">CH '+n+' ist mit '+esc(target?.instrument||'einem Stereopaar')+' belegt</h2><button data-rw-mixer-close aria-label="Schließen">×</button></header>'+replace+(pairs.length?'<fieldset><legend>L/R auf ein freies Paar verschieben</legend>'+pairs.join('')+'</fieldset>':'')+(error?'<p role="alert">'+esc(error)+'</p>':'')+'</dialog>';
      }
      if(sourcePicker.userSlot){
        const {userSlot,deviceId}=sourcePicker,devices=mixerDevices();
        const device=devices.find(item=>item.id===deviceId)||localMixer;
        const inventory=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes),patch=inventory.bankSocket(userSlot);
        const overlay=!!global.StageplotStageboxes?.get(device.type);
        const target=channelRow(userSlot);
        const targetSource=target&&!target.mixerVacant?global.StageplotRoutingModel.mixerSourceId(target):null;
        const port=n=>{
          const group=inventory.at(device.id,n);
          const row=physicalOrigin(group);
          const occupied=Boolean(row);
          const blocked=occupied&&targetSource&&targetSource!==group.id;
          const label='IN '+n+' · '+(occupied?row.instrument:'Frei');
          const name=occupied?row.instrument.split(' · ').filter(part=>part!=='L'&&part!=='R').pop():'';
          const marker=occupied?'<span class="mx-port-name">'+esc(name||row.instrument)+'</span>':'<span class="mx-port-free" aria-hidden="true">+</span>';
          return '<button type="button"'+attrs({'data-rw-mixer-user-port':n,'data-device':device.id,'data-used':String(occupied),class:overlay?'rw-port sp-stagebox-image-port':'mx-local-port','aria-pressed':String(patch?.id===device.id&&patch.port===n),'aria-label':label,title:label})+(blocked?' disabled':'')+'>'+socketBadge(row)+(overlay?socketNumber(n)+(occupied?'':marker):marker+'IN '+n)+'</button>';
        };
        const hardware=overlay?zoomableSurface(device.type,(_,n)=>port(n),['inputs'],device.id):gridSurface(device,port);
        return '<dialog class="mx-picker" aria-labelledby="mx-picker-title"><header><h2 id="mx-picker-title">User In '+userSlot+' · Buchse für CH '+userSlot+'</h2><button data-rw-mixer-close aria-label="Schließen">×</button></header><div class="mx-devices">'+devices.map(item=>mixerChoice(item.name,'mixer-user-device',item.id,device.id===item.id)).join('')+'</div><div class="mx-port-key"><span>＋ Frei</span><span>● Belegt</span></div>'+hardware+(error?'<p role="alert">'+esc(error)+'</p>':'')+'</dialog>';
      }
      const row=route(sourcePicker.row), target=channelRow(mixerChannel), occupied=target&&!target.mixerVacant;
      let body='';
      if(!row){
        const inventory=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes);
        const entries=[];
        for(const group of inventory.groups.values()){
          const members=group.rows.filter(item=>item.instrument);
          if(!members.length)continue;
          for(const stale of [false,true]){
          const matching=members.filter(r=>inventory.staleMono.has(r.id)===stale);
          if(!matching.length)continue;
          const assigned=matching.filter(item=>item.number).sort((a,b)=>a.number-b.number);
          const candidates=assigned.length?assigned:matching;
          const item=candidates.find(r=>r.id===group.id)||candidates[0];
          const channels=assigned.map(r=>'CH '+r.number).join(', ');
          entries.push({item,stale,first:assigned[0]?.number||0,label:(assigned.length>1?'Split · ':'')+channels});
          }
        }
        entries.sort((a,b)=>a.first-b.first);
        const sections=[['Noch nicht zugewiesen',entries.filter(e=>!e.first)],['Bereits zugewiesen',entries.filter(e=>e.first)]];
        body='<div class="mx-picker-list">'+sections.map(([heading,items])=>items.length?'<section><h3>'+heading+'</h3>'+items.map(({item,label,stale})=>'<button type="button"'+attrs({'data-rw-mixer-pick':item.id})+'><strong>'+esc(item.instrument)+(stale?monoWarning:'')+'</strong><small>'+esc(label)+'</small></button>').join('')+'</section>':'').join('')+(entries.length?'':'<p>Noch keine Signalquellen im Projekt.</p>')+'</div>';
      }else{
        const operation=sourcePicker.operation;
        const actions=row.number?['move','duplicate','switch']:['assign'];
        body='<p><strong>'+esc(row.instrument)+'</strong> · '+(row.number?'CH '+row.number+' → ':'')+'CH '+mixerChannel+'</p>';
        const id=global.StageplotRoutingModel.mixerSourceId;
        const group=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes).groups.get(id(row));
        const split=group?.rows.filter(item=>item.number).length>1;
        const input=group?.patch;
        const inputLabel=input?deviceLabel(input.id)+' · IN '+input.port:'Keine Buchse zugewiesen';
        const stereo=!!(row.stereoGroup||target?.stereoGroup);
        if(stereo){
          const plan=global.StageplotRoutingModel.mixerStereoPlan(state.routing.inputs,row,sourcePicker.pairStart||mixerChannel);
          const paired=sourcePicker.stereo==='pair';
          body='<p><strong>'+esc(row.instrument)+'</strong> · Stereo-Link</p>';
          const evenStart=row.stereoGroup&&row.mode!=='Stereo R'&&mixerChannel%2===0;
          if(evenStart){
            const starts=[mixerChannel-1,mixerChannel+1].filter(n=>n<32);
            body+='<section class="mx-start-warning"><h3>CH '+mixerChannel+' kann kein Stereo-Paar beginnen</h3><p>Im Kanalplan liegt links der ungerade Kanal, rechts der direkt folgende gerade Kanal. Wähle den Startkanal für beide Signale.</p><div class="mx-start-options">'+starts.map(n=>'<button type="button"'+attrs({'data-rw-mixer-start':n,'aria-pressed':String(sourcePicker.pairStart===n)})+'><strong>'+ (n<mixerChannel?'Tiefer':'Höher')+' · CH '+n+'/'+(n+1)+'</strong><small>CH '+n+' (L) · '+esc(channelRow(n)?.instrument||'Frei')+'<br>CH '+(n+1)+' (R) · '+esc(channelRow(n+1)?.instrument||'Frei')+'</small></button>').join('')+'</div></section>';
          }
          body+='<div class="mx-transfer">';
          if(row.stereoGroup&&!evenStart)body+=mixerChoice('Beide Kanäle mitnehmen','mixer-stereo','pair',paired);
          body+=mixerChoice('Stereo-Link aufheben','mixer-stereo','split',sourcePicker.stereo==='split')+'</div>';
          if(paired){
            body+='<h3>Zielbelegung</h3>'+plan.targets.map((item,i)=>'<p><b>CH '+(plan.first+i)+'</b> · '+esc(item?.instrument||'Frei')+' → <strong>'+esc(plan.members[i]?.instrument||'—')+'</strong></p>').join('');
            if(operation==='insert')body+='<p>Die folgenden Signale werden versetzt.</p>';else if(plan.targets.some(item=>item&&!item.mixerVacant))body+='<p>'+(operation==='switch'?'Belegte Zielsignale wechseln auf die bisherigen Quellkanäle.':'Beim Verschieben oder Duplizieren werden belegte Zielsignale zu offenen Signalen.')+'</p>';
          }else if(sourcePicker.stereo==='split'){
            const groups=new Set([row.stereoGroup,target?.stereoGroup].filter(Boolean));
            const linked=analogRows().filter(item=>groups.has(item.stereoGroup));
            body+='<p>Link aufheben für '+linked.map(item=>esc(item.instrument)+(item.number?' (CH '+item.number+')':'')).join(', ')+'.</p><p>Einzelnes Ziel: CH '+mixerChannel+' · '+esc(target?.instrument||'Frei')+' → '+esc(row.instrument)+'</p>';
          }
        }else if(operation==='insert')body+='<p>Auf CH '+mixerChannel+' einschieben und die folgenden Signale versetzen.</p>';else if(occupied)body+='<p>'+esc(target.instrument)+' '+(operation==='switch'?'wechselt auf CH '+row.number:operation?'wird als offenes Signal erhalten.':'liegt auf dem Zielkanal.')+'</p>';
        if(split)body+='<p>Physischer Eingang · <strong>'+esc(inputLabel)+'</strong></p>';
        if(row.number&&!sourcePicker.dropOperation&&(!stereo||sourcePicker.stereo))body+='<div class="mx-transfer">'+actions.map(action=>mixerChoice(transferNames[action],'mixer-operation',action,action===operation)).join('')+'</div>';

      }
      const location=sourcePicker.socket?esc(deviceLabel(sourcePicker.socket.boxId))+' · IN '+sourcePicker.socket.port+' → CH ':'CH ';
      return '<dialog class="mx-picker" aria-labelledby="mx-picker-title"><header><h2 id="mx-picker-title">Signal für '+location+mixerChannel+'</h2><button type="button" data-rw-mixer-close aria-label="Schließen">×</button></header>'+body+(error?'<p role="alert">'+esc(error)+'</p>':'')+'</dialog>';
    }
    function mixerView(){
      const model=global.StageplotRoutingModel,inventory=panelInventory;
      const banks=inventory.banks,bankIndex=Math.floor((mixerChannel-1)/8),bank=banks[bankIndex];
      const groupFor=row=>row&&inventory.groups.get(model.mixerSourceId(row));
      const channelSocket=number=>inventory.bankSocket(number);
      const splitLabel=group=>{
        const channels=(group?.rows||[]).map(row=>row.number).filter(Boolean).sort((a,b)=>a-b);
        return channels.length>1?'Split · '+channels.map(n=>'CH '+n).join(', '):'';
      };
      const current=channelRow(mixerChannel), signal=route(mixerSignal)||(current?.mixerVacant?null:current);
      const devices=mixerDevices(), currentPatch=channelSocket(mixerChannel,current);
      const selected=devices.find(item=>item.id===mixerDevice)||devices.find(item=>item.id===(currentPatch?.id||bank?.id))||localMixer;
      const port=mixerPort||(currentPatch?.id===selected.id?currentPatch.port:null);
      const open=analogRows().filter(row=>!row.mixerVacant&&!['Dante','USB','MADI','Digital'].includes(row.connector)&&(!row.number||!channelSocket(row.number,row)));
      const bankCards=banks.map((item,index)=>'<button type="button" class="mx-bank"'+attrs({'data-rw-bank':index,'aria-expanded':String(bankEditor===index),'data-color':item.id===localMixer.id?'local':devices.findIndex(d=>d.id===item.id)%2?'teal':'blue'})+'><strong>Mixerkanäle '+(index*8+1)+'–'+(index*8+8)+'</strong><span>'+esc(deviceLabel(item.id))+'</span><small>'+(item.last<item.first?'Keine lokale Buchse':(item.id==='@user'?'Slots ':'Buchsen ')+item.first+'–'+item.last)+'</small></button>').join('');
      const editor=bankEditor===null?'':'<div class="mx-choices" aria-label="Quelle der Kanalbank">'+mixerChoice('User In · User Routing Slot Sources','bank-option','@user',banks[bankEditor].id==='@user',{'data-first':bankEditor*8+1})+bankOptions().map(item=>mixerChoice(deviceLabel(item.id)+' · IN '+item.first+'–'+item.last,'bank-option',item.id,banks[bankEditor].id===item.id&&banks[bankEditor].first===item.first,{'data-first':item.first})).join('')+'</div>';
      const channelButton=n=>{
        const row=channelRow(n),p=channelSocket(n,row);
        const side=row?.mode==='Stereo L'?'L':row?.mode==='Stereo R'?'R':'';
        const partner=side&&row.stereoGroup&&analogRows().find(other=>other.stereoGroup===row.stereoGroup&&other.mode===(side==='L'?'Stereo R':'Stereo L')&&other.number>=1&&other.number<=32);
        const adjacent=partner&&Math.abs(partner.number-n)===1;
        const channelLabel='CH '+n;
        const socket=p?deviceLabel(p.id)+' · IN '+p.port:'—';
        const split=splitLabel(groupFor(row));
        const linkLabel=partner?'Stereo '+(side==='L'?'links':'rechts')+', verbunden mit CH '+partner.number:'';
        const badge=partner?'<span class="mx-side" title="'+esc(linkLabel)+'">'+side+(adjacent?'':' · CH '+partner.number)+'</span>':'';
        const pending=!readonly()&&pendingRight(n);
        const conflict=pending&&row&&(!row.mixerVacant||row.stereoGroup);
        const suggestion=pending?(conflict?' <span class="mx-mono-warning" aria-label="Stereo-Routing klären">!</span>':'<strong>R auf CH '+n+' ergänzen</strong>'):'';
        const edit=banks[Math.floor((n-1)/8)].id==='@user'&&!readonly();
        const slotButton=edit?'<button type="button" class="mx-user-slot" data-rw-mixer-user-slot="'+n+'" aria-label="Physische Buchse für CH '+n+' wählen">'+esc(p?socket:'Buchse wählen')+' ▾</button>':'';
        return '<div class="mx-channel-entry"><button type="button" class="mx-row"'+attrs({draggable:row&&!row.mixerVacant&&!readonly()?'true':undefined,'data-rw-mixer-channel':n,'aria-pressed':String(n===mixerChannel),'data-pair-edge':adjacent?(partner.number>n?'top':'bottom'):undefined,'aria-label':partner?[channelLabel,linkLabel,row.instrument,split,socket].filter(Boolean).join(', '):undefined})+'><b class="mx-channel-number">'+channelLabel+badge+'</b><span>'+(pending&&!conflict?'':esc(row?.instrument||'—'))+suggestion+(inventory.staleMono.has(row?.id)?monoWarning:'')+(split?'<small class="mx-signal-split">'+esc(split)+'</small>':'')+'</span><small'+(edit?' aria-hidden="true" style="visibility:hidden"':'')+'>'+esc(socket)+'</small></button>'+slotButton+'</div>'+evenPairOptions(row);
      };
      const channelList='<div class="mx-columns"><span>Mixerkanal</span><span>Signalname</span><span>Physische Buchse</span></div>'+Array.from({length:16},(_,i)=>{
        const first=i*2+1,left=channelRow(first),right=channelRow(first+1);
        const linked=!!left?.stereoGroup&&left.stereoGroup===right?.stereoGroup;
        const available=linked||(!left?.stereoGroup&&!right?.stereoGroup);
        const label='CH '+first+' und CH '+(first+1)+(linked?' – Stereo-Link aufheben':' als Stereopaar verlinken');
        const control=available?'<button type="button" class="mx-link-control"'+attrs({'data-rw-mixer-link':first,'data-linked':String(linked),'aria-label':label,title:label})+(readonly()?' disabled':'')+'><span aria-hidden="true">'+(linked?'':'＋')+'</span></button>':'';
        return '<div class="mx-channel-pair">'+control+channelButton(first)+channelButton(first+1)+'</div>';
      }).join('');
      const signals=open.map(row=>mixerChoice(row.instrument||'Signal','mixer-signal',row.id,row.id===signal?.id)).join('')||'<p>Alle Signale sind zugeordnet.</p>';
      const overlay=!!global.StageplotStageboxes?.get(selected.type);
      const socket=n=>{
        const group=inventory.at(selected.id,n),occupants=group?.rows||[];
        const used=occupants.find(row=>row.number===mixerChannel)||occupants.find(row=>row.number);
        const origin=physicalOrigin(group),names=origin?.instrument||'';
        const split=splitLabel(group);
        const label=['IN '+n,names||'Frei',split].filter(Boolean).join(' · ');
        return '<button type="button" class="'+(overlay?'rw-port sp-stagebox-image-port':'mx-local-port')+'"'+attrs({'data-rw-mixer-port':n,'data-device':selected.id,'data-socket-source':group?.id,'data-occupant-channel':used?.number,'data-used':String(!!names),'data-selected':String(port===n),'aria-pressed':String(port===n),'aria-label':label,title:label})+'>'+socketBadge(origin)+(overlay?socketNumber(n):'IN '+n)+'</button>';
      };
      const hardware=overlay?zoomableSurface(selected.type,(direction,n)=>{
        if(direction==='inputs')return socket(n);
        const out=state.routing.outputs.find(row=>row.stagebox===selected.id&&row.stageboxPort===n);
        return '<span class="mx-output-caption"'+attrs({title:out?.instrument||'OUT '+n})+'>'+esc(out?.instrument||'OUT '+n)+'</span>';
      },['inputs','outputs'],selected.id):gridSurface(selected,n=>'<div class="mx-generic-jack">'+socket(n)+preampButton(selected,n)+'</div>');
      const models=addingBox?'<div class="mx-choices"><label>Name <input data-rw-mixer-name maxlength="42" placeholder="z. B. Bühne links"></label>'+Object.values(state.catalog||{}).filter(item=>item.id.startsWith('stagebox-')).map(item=>mixerChoice(item.short||item.name,'mixer-model',item.id)).join('')+'</div>':'';
      const mixerButton='<button type="button" data-rw-mixer-choose-console'+(readonly()?' disabled':'')+'>Mischpult · '+esc(global.StageplotStageboxes.get(localMixer.type).name.replace(/ lokal$/,''))+' ▾</button>';
      return '<div class="mx-console-heading"><h1>Quellen der Mixerkanäle</h1>'+mixerButton+'</div><div class="mx-banks">'+bankCards+'</div>'+editor+'<div class="mx-panels"><section class="mx-left"><div class="mx-tabs">'+mixerChoice('Mixerkanäle','mixer-tab','channels',mixerTab==='channels')+mixerChoice('Offene Signale ('+open.length+')','mixer-tab','signals',mixerTab==='signals')+'</div><div class="mx-scroll '+(mixerTab==='signals'?'mx-signals':'')+'">'+(mixerTab==='channels'?channelList:signals)+'</div></section><section class="mx-right"><h2>Stageboxen</h2><div class="mx-devices">'+devices.map(item=>mixerChoice(item.name,'mixer-device',item.id,item.id===selected.id)).join('')+(readonly()?'':mixerChoice('＋ Stagebox','mixer-add','1',addingBox))+'</div>'+models+'<div class="mx-strip">'+esc(signal?.instrument||'Signal wählen')+' → CH '+mixerChannel+'</div>'+hardware+'<div class="mx-strip">'+esc(selected.name)+' · '+(port?'IN '+port:'Buchse wählen')+' → CH '+mixerChannel+'</div></section></div>';
    }
    let dropMark=null;
    const dropLabel=host.ownerDocument.createElement('span');
    dropLabel.className='mx-drop-label';
    const blankDragImage=host.ownerDocument.createElement('img');
    blankDragImage.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    function drawDragPreview(row,channel,insert){
      let destination=channel?'CH '+channel:'';
      let detail='';
      if(channel&&row.stereoGroup){
        const starts=channel%2?[channel]:[channel-1,channel+1].filter(n=>n<32);
        destination=starts.map(n=>'CH '+n+'/'+(n+1)).join(' oder ');
        detail='Einzeln → CH '+channel;
      }else if(channel&&!insert){
        const target=channelRow(channel);
        if(target&&!target.mixerVacant)detail=target.instrument+' → CH '+row.number;
      }
      const old='CH '+row.number;
      dropLabel.innerHTML='<b class="mx-drag-route">'+(channel?'<s>'+old+'</s> → '+destination:old)+'</b><strong>'+esc(row.instrument)+'</strong>'+
        (channel?'<small>'+(insert?'Einschieben':'Tauschen')+(detail?' · '+esc(detail):'')+'</small>':'');
    }
    let drag=null,dragFrame=0,suppressClick=false;
    const doc=host.ownerDocument;
    function finishDrag(){
      if(dragFrame)cancelAnimationFrame(dragFrame);
      dragFrame=0;
      const pointer=drag?.pointer;
      drag=null;
      if(pointer!=null&&host.hasPointerCapture(pointer))host.releasePointerCapture(pointer);
      if(dropMark)delete dropMark.dataset.mxDrop;
      dropMark=null;dropLabel.remove();
    }
    function updateDrag(scroll){
      const d=drag;
      if(!d?.active)return;
      const {x,y,list}=d;
      const area=list.getBoundingClientRect();
      const inside=x>=area.left&&x<=area.right&&y>=area.top&&y<=area.bottom;
      if(scroll&&inside){
        const edge=24,delta=Math.max(0,edge-(area.bottom-y))-Math.max(0,edge-(y-area.top));
        const before=list.scrollTop;
        list.scrollTop+=Math.sign(delta)*Math.ceil(Math.abs(delta)/3);
        if(list.scrollTop!==before)queueDrag();
      }
      const button=inside&&doc.elementFromPoint(x,y)?.closest('[data-rw-mixer-channel]');
      let channel=null,insert=false,mark=null;
      if(button&&list.contains(button)){
        const rect=button.getBoundingClientRect(),fraction=(y-rect.top)/rect.height;
        insert=fraction<0.25||fraction>0.75;
        const n=Number(button.dataset.rwMixerChannel)+(fraction>0.75?1:0);
        if(n<=32&&n!==d.row.number){
          channel=n;
          mark=insert?list.querySelector('[data-rw-mixer-channel="'+n+'"]'):button;
        }
      }
      if(!dropLabel.isConnected||d.channel!==channel||d.insert!==insert){
        if(dropMark)delete dropMark.dataset.mxDrop;
        dropMark=mark;
        if(mark)mark.dataset.mxDrop=insert?'insert':'switch';
        drawDragPreview(d.row,channel,insert);
        if(!dropLabel.isConnected)host.append(dropLabel);
        d.width=dropLabel.offsetWidth;d.height=dropLabel.offsetHeight;
        d.channel=channel;d.insert=insert;
      }
      const left=Math.max(4,Math.min(x+12,doc.defaultView.innerWidth-d.width-4));
      dropLabel.style.transform='translate3d('+left+'px,'+(y-d.height-12>=4?y-d.height-12:y+12)+'px,0)';
    }
    function queueDrag(){
      if(!dragFrame)dragFrame=requestAnimationFrame(()=>{dragFrame=0;updateDrag(true);});
    }
    let socketDrag=null;
    function clearSocketTargets(d){
      for(const button of d.targets){
        delete button.dataset.socketDrop;
        button.querySelector('.mx-socket-drop-label')?.remove();
      }
      d.targets=[];
    }
    function fixedStereoDrag(from){
      const inventory=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes);
      const row=channelRow(Number(from.dataset.occupantChannel));
      if(!row?.stereoGroup)return null;
      const {members}=global.StageplotRoutingModel.mixerStereoPlan(state.routing.inputs,row,row.number);
      const panel=from.closest('.rw-zoom-panel');
      const ports=new Map();
      for(let n=1;n<=32;n++){
        if(inventory.banks[Math.floor((n-1)/8)].id==='@user')continue;
        const patch=inventory.bankSocket(n);
        if(patch?.id===from.dataset.device)ports.set(n,panel.querySelector('[data-rw-mixer-port="'+patch.port+'"]'));
      }
      const buttons=members.map(member=>ports.get(member.number));
      if(buttons.length!==2||buttons.some(button=>!button)||!buttons.includes(from))return null;
      return {row,ports,buttons};
    }
    function endSocketDrag(){
      if(!socketDrag)return;
      const {moving,pointer}=socketDrag;
      clearSocketTargets(socketDrag);
      socketDrag=null;
      for(const button of moving){
        button.querySelector('.mx-socket-badge')?.style.removeProperty('translate');
        delete button.dataset.socketDragging;
      }
      if(host.hasPointerCapture(pointer))host.releasePointerCapture(pointer);
    }
    function handleSocketDrag(event){
      const {type,pointerId}=event;
      if(type==='pointerdown'){
        const from=event.target.closest('[data-rw-mixer-port][data-socket-source]');
        if(!from||readonly()||event.button!==0||socketDrag)return false;
        const pair=fixedStereoDrag(from);
        socketDrag={from,pair,moving:pair?.buttons||[from],targets:[],pointer:pointerId,x:event.clientX,y:event.clientY,active:false};
        return true;
      }
      const d=socketDrag;
      if(!d||d.pointer!==pointerId)return false;
      if(type==='pointercancel'||type==='lostpointercapture'){endSocketDrag();return true;}
      if(type!=='pointermove'&&type!=='pointerup')return false;
      if(!d.active&&type==='pointermove'&&Math.hypot(event.clientX-d.x,event.clientY-d.y)>=5){
        d.active=true;host.setPointerCapture(pointerId);for(const button of d.moving)button.dataset.socketDragging='true';
      }
      if(d.active){
        event.preventDefault();
        for(const button of d.moving){
          const badge=button.querySelector('.mx-socket-badge');
          if(badge)badge.style.translate=(event.clientX-d.x)+'px '+(event.clientY-d.y)+'px';
        }
        const hit=host.ownerDocument.elementFromPoint(event.clientX,event.clientY)?.closest('[data-rw-mixer-port]');
        const over=hit!==d.from&&hit?.dataset.device===d.from.dataset.device?hit:null;
        if(over!==d.over){
          clearSocketTargets(d);
          d.first=null;
          if(over&&d.pair){
            const channel=[...d.pair.ports].find(([,button])=>button===over)?.[0];
            if(channel){
              const first=channel%2?channel:channel-1;
              const targets=[d.pair.ports.get(first),d.pair.ports.get(first+1)];
              if(targets.every(button=>button&&!d.moving.includes(button))){
                d.first=first;
                d.targets=targets;
              }
            }
          }else if(over)d.targets=[over];
          const swap=d.targets.some(button=>button.dataset.socketSource);
          d.targets.forEach((button,i)=>{
            button.dataset.socketDrop=swap?'swap':'move';
            if(!d.pair)return;
            const label=host.ownerDocument.createElement('span');
            label.className='mx-socket-drop-label';
            label.textContent=(i?'R':'L')+' → IN '+button.dataset.rwMixerPort;
            button.append(label);
          });
          d.over=over;
        }
      }
      if(type==='pointerup'){
        const {from,over,active,first}=d;
        const swap=d.targets.some(button=>button.dataset.socketSource);
        endSocketDrag();
        if(active)suppressClick=true;
        if(active&&d.pair&&first){
          const row=d.pair.row;
          const target=channelRow(first);
          mixerChannel=first;
          sourcePicker={row:row.id,previous:row.number,targetId:target?.id||'',pairStart:first,stereo:'pair',
            operation:swap?'switch':'move',dropOperation:swap?'switch':'move',
            stamp:global.StageplotRoutingModel.mixerStereoPlan(state.routing.inputs,row,first).stamp};
          applySourceChoice(row,sourcePicker.operation);return true;
        }
        if(active&&d.pair&&over&&d.pair.ports.size && [...d.pair.ports.values()].includes(over))return true;
        if(active&&over){
          const originChannel=Number(from.dataset.occupantChannel);
          const row=channelRow(originChannel);
          const banks=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes).banks;
          const fixedOrigin=originChannel && banks[Math.floor((originChannel-1)/8)].id!=='@user';
          const destination=fixedOrigin&&fixedSocketChannel(over.dataset.device,Number(over.dataset.rwMixerPort),Number(over.dataset.occupantChannel));
          if(row && destination && (row.stereoGroup || channelRow(destination)?.stereoGroup)){
            openMixerDrop(row,destination,false);
            return true;
          }
        }
        if(active&&over)doAction({type:'moveMixerSocket',boxId:from.dataset.device,from:Number(from.dataset.rwMixerPort),to:Number(over.dataset.rwMixerPort),sourceId:from.dataset.socketSource,targetId:over.dataset.socketSource||''});
      }
      return true;
    }
    function mixerDrag(event){
      const type=event.type;
      if(type==='pointerdown')suppressClick=false;
      if(handleSocketDrag(event))return;
      const button=event.target.closest('[data-rw-mixer-channel]');
      if(type==='pointerdown'||type==='dragstart'){
        if(type==='pointerdown'&&(event.pointerType==='touch'||event.button!==0))return;
        if(type==='dragstart'&&drag?.pointer!=null){event.preventDefault();return;}
        const row=button&&channelRow(Number(button.dataset.rwMixerChannel));
        if(!row||row.mixerVacant||readonly())return;
        suppressClick=false;
        drag={row,list:button.closest('.mx-scroll'),x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,pointer:event.pointerId,active:type==='dragstart'};
        if(type==='dragstart'){
          event.dataTransfer.setDragImage(blankDragImage,0,0);
          event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',row.instrument);
        }
        return;
      }
      if(!drag||event.pointerId!=null&&drag.pointer!==event.pointerId)return;
      if(['dragend','pointercancel','lostpointercapture'].includes(type)){finishDrag();return;}
      drag.x=event.clientX;drag.y=event.clientY;
      if(type==='pointermove'||type==='dragover'){
        if(!drag.active){
          if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<4)return;
          drag.active=true;host.setPointerCapture(drag.pointer);
        }
        event.preventDefault();queueDrag();return;
      }
      if(type==='pointerup'||type==='drop'){
        const d=drag;
        if(d.active){event.preventDefault();updateDrag(false);suppressClick=type==='pointerup';}
        finishDrag();
        if(d.active&&d.channel&&!readonly())openMixerDrop(d.row,d.channel,d.insert);
      }
    }
    function openMixerDrop(row,channel,insert){
      const target=channelRow(channel);
      mixerChannel=channel;
      const dropOperation=insert?'insert':'switch';
      sourcePicker={row:row.id,previous:row.number,targetId:target?.id||'',dropOperation,
        operation:dropOperation,slotIds:Array.from({length:32},(_,i)=>channelRow(i+1)?.id||'')};
      if(row.stereoGroup||target?.stereoGroup){
        sourcePicker.stamp=global.StageplotRoutingModel.mixerStereoPlan(state.routing.inputs,row,channel).stamp;
        sourcePicker.operation='';
        error='';render();return;
      }
      applySourceChoice(row,dropOperation);
    }
    const dragEvents=['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','dragstart','dragover','drop','dragend'];
    function mixerClick(data){
      if(data.rwMixerChooseConsole!==undefined){sourcePicker={chooseMixer:true};render();return;}
      if(data.rwMixerConsole){
        if(doAction({type:'setMixerModel',model:data.rwMixerConsole})===false)return;
        mixerDevice='@local';mixerPort=null;bankEditor=null;closeSourcePicker();
        return;
      }
      if(data.rwMixerEvenPair){
        const action=stereoCompletion(route(data.right),Number(data.rwMixerEvenPair));
        const conflicts=[action.first,action.first+1].filter(n=>n!==action.previous&&channelRow(n)&&!channelRow(n).mixerVacant);
        mixerChannel=action.previous;
        if(conflicts.length){sourcePicker={completion:action,evenConflict:conflicts};render();}
        else if(doAction(action)!==false){mixerChannel=action.first;closeSourcePicker();}
        return;
      }
      if(data.rwMixerRelocate!==undefined){
        const action=sourcePicker.completion;
        action.moves={...action.moves,[data.from]:Number(data.rwMixerRelocate)};
        render();return;
      }
      if(data.rwMixerReplace!==undefined||data.rwMixerFreePair){
        const original=sourcePicker.completion;
        const action=data.rwMixerFreePair?stereoCompletion(route(original.rowId),Number(data.rwMixerFreePair)):original;
        if(doAction(action)!==false){mixerChannel=action.first+1;closeSourcePicker();}return;
      }
      if(data.rwMixerUserSlot){
        mixerChannel=Number(data.rwMixerUserSlot);
        const patch=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes).bankSocket(mixerChannel);
        sourcePicker={userSlot:mixerChannel,deviceId:patch?.id||localMixer.id};error='';render();return;
      }
      if(data.rwMixerUserDevice){sourcePicker.deviceId=data.rwMixerUserDevice;render();return;}
      if(data.rwMixerUserPort){
        if(doAction({type:'setUserMixerInput',channel:sourcePicker.userSlot,boxId:data.device,port:Number(data.rwMixerUserPort)})!==false)closeSourcePicker();
        return;
      }
      if(data.rwMixerLink){
        const first=Number(data.rwMixerLink),left=channelRow(first),right=channelRow(first+1);
        const unlink=left?.stereoGroup&&left.stereoGroup===right?.stereoGroup;
        doAction(unlink?{type:'unlinkStereo',rowIds:[left.id,right.id]}:{type:'linkMixerChannels',first,ids:[left?.id,right?.id]});
        host.querySelector('[data-rw-mixer-link="'+first+'"]')?.focus({preventScroll:true});
        return;
      }
      if(data.rwMixerClose!==undefined){closeSourcePicker();return;}
      if(data.rwMixerPick){
        const picked=route(data.rwMixerPick),target=channelRow(mixerChannel);
        if(!sourcePicker.socket&&picked&&picked===pendingRight(mixerChannel)){offerCompletion(picked);return;}
        const id=global.StageplotRoutingModel.mixerSourceId;
        const row=target&&id(target)===id(picked)?target:picked;
        if(row===target){
          if(sourcePicker.socket&&doAction({type:'assignMixerInput',rowId:row.id,channel:mixerChannel,...sourcePicker.socket})===false)return;
          if(sourcePicker.socket)mixerTab='channels';
          closeSourcePicker();return;
        }
        sourcePicker={socket:sourcePicker.socket,row:row.id,previous:row.number,targetId:target?.id||'',operation:row.number?'':'assign'};
        if(row.stereoGroup||target?.stereoGroup)sourcePicker.stamp=global.StageplotRoutingModel.mixerStereoPlan(state.routing.inputs,row,mixerChannel).stamp;
        if(!sourcePicker.stamp&&!row.number){applySourceChoice(row,'assign');return;}
        error='';render();return;
      }
      if(data.rwMixerStart||data.rwMixerStereo){
        sourcePicker.stereo=data.rwMixerStart?'pair':data.rwMixerStereo;
        sourcePicker.pairStart=sourcePicker.stereo==='pair'?(Number(data.rwMixerStart)||global.StageplotRoutingModel.mixerStereoPlan(state.routing.inputs,route(sourcePicker.row),mixerChannel).first):null;
        const channel=sourcePicker.pairStart||mixerChannel;
        sourcePicker.targetId=channelRow(channel)?.id||'';
        sourcePicker.stamp=global.StageplotRoutingModel.mixerStereoPlan(state.routing.inputs,route(sourcePicker.row),channel).stamp;
        sourcePicker.operation=sourcePicker.dropOperation||(sourcePicker.previous?'':'assign');
        if(sourcePicker.operation)applySourceChoice(route(sourcePicker.row),sourcePicker.operation);
        else {error='';render();}
        return;
      }
      if(data.rwMixerOperation){applySourceChoice(route(sourcePicker.row),data.rwMixerOperation);return;}
      if(data.rwBank!==undefined){if(!readonly())bankEditor=bankEditor===Number(data.rwBank)?null:Number(data.rwBank);}
      else if(data.rwBankOption){if(doAction({type:'setMixerBank',index:bankEditor,boxId:data.rwBankOption,first:Number(data.first)})===false)return;bankEditor=null;mixerDevice='';mixerPort=null;}
      else if(data.rwMixerTab)mixerTab=data.rwMixerTab;
      else if(data.rwMixerChannel){mixerChannel=Number(data.rwMixerChannel);const pending=!readonly()&&pendingRight(mixerChannel);if(pending){offerCompletion(pending);return;}mixerSignal=channelRow(mixerChannel)?.mixerVacant?'':channelRow(mixerChannel)?.id||'';if(!readonly())sourcePicker={};mixerPort=null;mixerDevice='';}
      else if(data.rwMixerSignal){mixerSignal=data.rwMixerSignal;const row=route(mixerSignal);if(channelRow(mixerChannel)&&channelRow(mixerChannel).id!==row.id)mixerChannel=row.number<=32&&row.number?row.number:Array.from({length:32},(_,i)=>i+1).find(n=>!channelRow(n))||mixerChannel;mixerPort=null;mixerDevice='';}
      else if(data.rwMixerDevice){mixerDevice=data.rwMixerDevice;mixerPort=null;addingBox=false;}
      else if(data.rwMixerPort){
        mixerPort=Number(data.rwMixerPort);mixerDevice=data.device;
        if(!readonly()){
          const selected=Number(data.occupantChannel)||mixerChannel;
          const inventory=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes);
          const userSlot=inventory.banks[Math.floor((selected-1)/8)].id==='@user';
          mixerChannel=userSlot?selected:fixedSocketChannel(mixerDevice,mixerPort,selected)||selected;
          sourcePicker={socket:{boxId:mixerDevice,port:mixerPort}};
        }
      }
      else if(data.rwMixerAdd)addingBox=!addingBox;
      else if(data.rwMixerModel){const ids=new Set(state.boxes.map(b=>b.id));if(doAction({type:'addStagebox',objectType:data.rwMixerModel,name:host.querySelector('[data-rw-mixer-name]')?.value,stayInMixer:true})===false)return;mixerDevice=state.boxes.find(b=>!ids.has(b.id))?.id||'';mixerPort=null;addingBox=false;}
      error='';render();
    }
    const tabs = () => [['mixer','Mixer-Patch'],['channels','Input-Liste'],['inputs','Quellen'],['outputs',state.routing.outputs.some(nativeOutput) ? 'Ausgänge' : 'Monitoring'],['stageboxes','Stagebox'],...(state.stage?.x32Scene ? [['x32','I/O-Liste']] : [])];
    const viewTab = () => mixerOpen ? 'mixer' : channelListOpen ? 'channels' : sceneOpen && state.stage?.x32Scene ? 'x32' : state.tab;
    function sceneInventory() {
      const text = state.stage?.x32Scene?.text;
      const mapping=JSON.stringify([state.stage?.x32Scene?.channelStrips,state.routing.processing,state.routing.sends,state.routing.inputs.filter(row=>row.stereoGroup).map(row=>[row.number,row.mode,row.stereoGroup])]);
      if (text !== sceneText || mapping!==sceneMapping) {
        sceneMapping=mapping;
        sceneText = text; sceneData = null; sceneError = '';
        if (text) try { sceneData = global.StageplotX32.inspectRouting(global.StageplotX32.configuredScene(text,state.stage.x32Scene.channelStrips,state.routing.processing,state.routing.sends,state.routing.inputs)); } catch (exception) { sceneError = exception.message || 'Die Szene konnte nicht gelesen werden.'; }
      }
      return sceneData;
    }
    function selectTab(tab) {
      mixerOpen=tab==='mixer';error='';if(mixerOpen){sceneOpen=false;channelListOpen=false;render();return;}
      if(tab === 'channels'){if(state.tab!=='inputs')api.dispatch({type:'selectTab',tab:'inputs'});channelListOpen=true;sceneOpen=false;render();return;}
      channelListOpen=false;
      if (tab === 'x32' && state.stage?.x32Scene) { sceneOpen = true; toolsOpen = false; render(); return; }
      sceneOpen = false; doAction({type:'selectTab',tab});
    }
    host.classList.add('sp-routing-workspace-v2');

    const object = id => (state.objects || []).find(item => item.id === id);
    const route = (id, direction = 'inputs') => (state.routing?.[direction] || []).find(item => item.id === id);
    const box = id => (state.boxes || []).find(item => item.id === id);
    const device = id => (state.routing?.devices || []).find(item => item.id === id);
    const diChannels = item => Math.max(1, Number(item?.channels || item?.channelCount) || 1);
    const physicalName = item => object(item?.objectId)?.label || item?.name || 'DI-Box';
    const deviceName = item => item?.name || item?.model || item?.modelId || 'DI-Box';
    const diModel = item => (state.diModels || []).find(model => model.id === (item?.modelId || item?.id));
    const diDetails = item => (item.active ? 'Aktiv' + ({'48V':' · 48 V',battery:' · Batterie',external:' · Netzteil'}[item.power] || '') : 'Passiv') + ' · ' + diChannels(item) + (diChannels(item) === 1 ? ' Kanal' : ' Kanäle');
    const readonly = () => state.readonly === true;
    const icon = input => {
      if (!input) return '<span class="rw-art-fallback" aria-hidden="true">♪</span>';
      const type=typeof input==='string'?input:input.type;
      if(global.StageplotStageboxes?.get(type))return global.StageplotStageboxes.picture(type);
      try { return api.objectIcon?.(input) || '<span class="rw-art-fallback" aria-hidden="true">♪</span>'; }
      catch (_) { return '<span class="rw-art-fallback" aria-hidden="true">♪</span>'; }
    };
    const micIcon = name => {
      try { return api.microphoneIcon?.(name) || '<span class="rw-art-fallback" aria-hidden="true">MIC</span>'; }
      catch (_) { return '<span class="rw-art-fallback" aria-hidden="true">MIC</span>'; }
    };
    const diPhoto = item => {
      const model = diModel(item);
      return model?.photo ? '<img class="rw-di-product-photo" src="' + esc(model.photo) + '" alt="' + esc(model.photoAlt || model.name) + '" loading="lazy" decoding="async">' : '<span class="rw-di-custom">' + (item ? 'Eigene DI' : 'DI') + '</span>';
    };
    const art = (content, extra = '') => '<div class="rw-art ' + extra + '" aria-hidden="true">' + content + '</div>';
    const button = (text, data = {}, options = {}) => '<button type="button" class="rw-button ' + (options.className || '') + '"' + attrs(data) + (options.disabled || options.mutation && readonly() ? ' disabled' : '') + (options.pressed !== undefined ? ' aria-pressed="' + String(options.pressed) + '"' : '') + '>' + text + '</button>';
    const field = (label, value, data, options = {}) => '<label class="rw-field' + (options.className ? ' ' + options.className : '') + '"><span>' + esc(label) + '</span><input' + attrs({'data-rw-focus':options.focus || JSON.stringify(data), ...data, type:options.type || 'text', value:value ?? '', maxlength:options.maxlength || 100, min:options.min, max:options.max, placeholder:options.placeholder, 'aria-label':label, autocomplete:'off'}) + (readonly() ? ' readonly' : '') + '></label>';
    const heading = (title, detail = '') => '<div class="rw-view-heading"><h2>' + esc(title) + '</h2>' + detail + '</div>';
    const cardHead = (title, key, content) => '<div class="rw-card-title"><span>' + esc(title) + '</span>' + (key && !readonly() ? button(pencil, {'data-rw-open':key,'aria-label':title + ' bearbeiten','aria-expanded':String(openCard === key)}, {className:'rw-edit'}) : '') + '</div>' + content;
    const monoLabel = rows => rows.length > 1 && rows.every(row => row.stereoGroup && row.stereoGroup === rows[0].stereoGroup) ? 'Stereo' : rows.length === 2 ? 'Dual-Mono' : rows.length > 2 ? rows.length + ' Signale' : 'Mono';
    const connected = rows => rows.filter(row => nativeDirect(row) || row.stagebox && row.stageboxPort || row.connector === 'Dante' && String(object(sourceId(row))?.playback?.target || '').trim()).length;
    const stereoRows = (rows, direction) => {
      const groups = new Set(rows.map(row => row.stereoGroup).filter(Boolean));
      const members = (state.routing[direction] || []).filter(row => rows.some(selected => selected.id === row.id) || groups.has(row.stereoGroup));
      return members.length === 2 && members[0].stereoGroup && members[0].stereoGroup === members[1].stereoGroup ? members.slice().sort((a,b) => Number(a.mode === 'Stereo R') - Number(b.mode === 'Stereo R')) : rows;
    };

    function groups() {
      const inputs = state.routing?.inputs || [], outputs = state.routing?.outputs || [], map = new Map();
      for (const row of inputs) {
        const id = sourceId(row) || row.id, source = object(id);if(source?.type === 'di')continue;
        if (!map.has(id)) map.set(id, {id, object:source, name:source?.label || state.catalog?.[source?.type]?.short || baseName(row.generatedInstrument || row.instrument) || 'Signal', rows:[]});
        map.get(id).rows.push(row);
      }
      for (const source of state.objects || []) {
        if (!map.has(source.id) && (state.catalog?.[source.type]?.instrument || state.sourceOutputs?.[source.id]) && !/^di(?:-|$)/.test(source.type)) {
          map.set(source.id, {id:source.id, object:source, name:source.label || state.catalog[source.type].short || 'Instrument', rows:[]});
        }
      }
      sources = [...map.values()].sort((a,b)=>Math.min(...a.rows.map(row=>row.number||Infinity))-Math.min(...b.rows.map(row=>row.number||Infinity)));
      for(const group of sources)group.rows.sort((a,b)=>(a.number||Infinity)-(b.number||Infinity));
      const monitorMap = new Map();
      for (const row of outputs) {
        const source = object(sourceId(row)), kind = monitorKind(row, source), id = row.stereoGroup || row.iemGroup || row.id;
        if (!monitorMap.has(id)) monitorMap.set(id, {id, name:row.iemName || baseName(row.instrument) || (nativeOutput(row) ? row.x32.label || row.x32.sourceLabel || 'X32-Ausgang' : 'Monitorweg'), object:source, kind, rows:[]});
        monitorMap.get(id).rows.push(row);
      }
      monitors = [...monitorMap.values()];
      if (!sources.some(item => item.id === activeSource)) activeSource = sources[0]?.id || '';
      if (!monitors.some(item => item.id === activeMonitor)) activeMonitor = monitors[0]?.id || '';
      if (!(state.boxes || []).some(item => item.id === activeBox)) { activeBox = state.boxes?.[0]?.id || ''; activePort = null; }
    }

    function doAction(action, options = {}) {
      if (readonly() && !['selectTab','exportPatch','pdf','xlsx'].includes(action.type)) return;
      try {
        error = '';
        const changing = action.type === 'editChannel' && Object.hasOwn(action.fields || {}, 'number') ? route(action.rowId, action.direction) : null;
        const previousNumber = changing?.number, nextNumber = action.fields?.number ? Number(action.fields.number) : null;
        const exchanged = changing && nextNumber ? (state.routing[action.direction || 'inputs'] || []).find(row => row.id !== changing.id && row.number === nextNumber) : null;
        const insertion = action.type === 'insertChannel' ? (action.at === 'end' ? Math.max(0,...state.routing.inputs.map(row=>row.number||0))+1 : Number(action.at)) : null;
        const lastNumber = insertion ? Math.max(0,...state.routing.inputs.map(row=>row.number||0)) : null;
        channelNotice = ''; channelFlash = [];
        const result = api.dispatch(action);
        if (result?.then) throw new Error('Routing-Änderungen müssen lokal und synchron gespeichert werden.');
        if (options.close) openCard = '';
        if (changing && previousNumber !== nextNumber) {
          channelNotice = exchanged ? 'CH ' + previousNumber + ' ↔ CH ' + nextNumber + ' getauscht.' : 'Kanalnummer auf ' + (nextNumber ? 'CH ' + nextNumber : 'offen') + ' geändert.';
          channelFlash = [changing.id,...(exchanged ? [exchanged.id] : [])];
        } else if (insertion) channelNotice = 'CH ' + insertion + ' eingefügt.' + (lastNumber >= insertion ? ' Bisherige CH ' + insertion + '–' + lastNumber + ' sind jetzt CH ' + (insertion+1) + '–' + (lastNumber+1) + '.' : '');
        if (channelNotice) api.announce?.(channelNotice);
        render();
        return result;
      } catch (exception) {
        error = exception?.message || 'Änderung nicht möglich.';
        api.announce?.(error);
        render();
        return false;
      }
    }

    function toolsMenu() {
      const mutations = sceneOpen ? [['undo','↶ Rückgängig'],['redo','↷ Wiederholen'],['x32Scene','Zuordnung bearbeiten']] : channelListOpen ? [['csvImport','CSV importieren'],['x32Scene','X32-Szene importieren / exportieren']] : [['undo','↶ Rückgängig'],['redo','↷ Wiederholen'],['number','Freie Kanalnummern'],['autoPatch','Automatisch verbinden'],['csvImport','CSV importieren'],['x32Scene','X32-Szene']];
      return '<div class="rw-tools" role="group" aria-label="'+(channelListOpen?'Import und Export':'Routing-Werkzeuge')+'">'+(!readonly()?mutations.map(([action,label])=>button(label,{'data-rw-tool':action},{mutation:true})).join(''):'')+(channelListOpen?[]:[['pdf','PDF / Drucken']]).concat([['xlsx','XLSX exportieren']]).map(([action,label])=>button(label,{'data-rw-tool':action})).join('')+button('CSV exportieren',{'data-rw-export':channelListOpen?'inputs':sceneOpen||state.tab==='stageboxes'?'all':state.tab})+'</div>';
    }
    function header() {
      const inputs = state.routing.inputs || [], outputs = state.routing.outputs || [], selectedRows = state.tab === 'outputs' ? outputs : inputs;
      const boxCount = (state.boxes || []).length, total = selectedRows.length, patched = connected(selectedRows), summary = sceneOpen ? 'Inputs · Busse & FX · Outputs' : state.tab === 'stageboxes' ? boxCount + (boxCount === 1 ? ' Stagebox · ' : ' Stageboxen · ') + connected([...inputs,...outputs]) + ' Verbindungen' : state.tab === 'outputs' ? monitors.length + (outputs.some(nativeOutput) ? ' Ausgangswege · ' : ' Monitorwege · ') + outputs.length + ' Ausgänge' : total + ' Signale · ' + patched + ' verbunden' + (total > patched ? ' · ' + (total - patched) + ' offen' : '');
      return '<header class="rw-header"><div class="rw-title-row"><h1>Routing</h1>' + (!channelListOpen?button('Werkzeuge',{'data-rw-tools':'true','aria-expanded':String(toolsOpen)},{className:'rw-tools-button'}):'') + '</div><div class="rw-navigation-row"><nav class="rw-tabs" role="tablist" aria-label="Routing-Bereiche">' + tabs().map(([tab,label]) => '<button type="button" role="tab" data-rw-tab="' + tab + '" aria-selected="' + String(viewTab() === tab) + '" aria-controls="sp-routing-detail-v2">' + label + '</button>').join('') + '</nav><span class="rw-summary">' + esc(summary) + '</span></div>' + (toolsOpen&&!channelListOpen?toolsMenu():'') + '</header>';
    }

    function sidebar() {
      const tab = state.tab, stageboxTab = tab === 'stageboxes', monitoring = tab === 'outputs';
      const items = stageboxTab ? state.boxes || [] : monitoring ? monitors : sources;
      const title = stageboxTab ? 'Stageboxen' : monitoring ? state.routing.outputs.some(nativeOutput) ? 'Ausgangswege' : 'Monitorwege' : 'Instrumente';
      const filtered = items.filter(item => normalized([item.name, ...(item.rows || []).map(row => row.instrument)].join(' ')).includes(normalized(query)));
      const rows = filtered.map(item => {
        const selected = item.id === (stageboxTab ? activeBox : monitoring ? activeMonitor : activeSource);
        const related = stageboxTab ? [...(state.routing.inputs || []), ...(state.routing.outputs || [])].filter(row => row.stagebox === item.id && row.stageboxPort) : item.rows;
        const total = related.length, linked = stageboxTab ? total : connected(related), complete = stageboxTab || total > 0 && linked === total;
        const subtitle = stageboxTab ? (state.routing.inputs || []).filter(row => row.stagebox === item.id && row.stageboxPort).length + '/' + item.inputs + ' In · ' + (state.routing.outputs || []).filter(row => row.stagebox === item.id && row.stageboxPort).length + '/' + item.outputs + ' Out' : monitoring ? (nativeOutput(item.rows[0]) ? item.rows[0].x32.label : kindName(item.kind)) + ' · ' + (item.rows.length > 1 && item.rows[0].stereoGroup ? 'Stereo' : 'Mono') : total ? total + (total === 1 ? ' Signal' : ' Signale') + (monoLabel(item.rows) === 'Stereo' ? ' · Stereo' : '') : 'Noch keine Abnahme';
        return '<button type="button" class="rw-list-item"' + attrs({'data-rw-select':item.id,'aria-pressed':String(selected)}) + '><span class="rw-list-art">' + icon(stageboxTab ? item.type : item.object || (monitoring ? item.kind === 'monitor' ? 'wedge' : 'rack' : 'mic')) + '</span><span class="rw-list-copy"><strong>' + esc(item.name) + '</strong><small>' + esc(subtitle) + '</small></span><span class="rw-state-dot" data-complete="' + complete + '" aria-label="' + (complete ? 'Verbunden' : linked + ' von ' + total + ' verbunden') + '">' + (complete ? '✓' : '•') + '</span></button>';
      }).join('');
      let add = '';
      if (!readonly() && (stageboxTab || monitoring)) {
        const key = stageboxTab ? 'add-box' : 'add-monitor';
        add = '<div class="rw-sidebar-add">' + button('<span aria-hidden="true">＋</span> ' + (stageboxTab ? 'Stagebox' : 'Monitorweg'), {'data-rw-open':key,'aria-expanded':String(openCard === key)}, {className:'rw-add',mutation:true});
        if (openCard === key) add += '<div class="rw-inline-choices">' + (stageboxTab ? Object.values(state.catalog || {}).filter(item => /^stagebox-/.test(item.id)).map(item => button(icon(item.id) + '<span>' + esc(item.short || item.name) + '</span>', {'data-rw-add-box':item.id}, {className:'rw-model-tile',mutation:true})).join('') : ['iem','monitor','line'].map(kind => button(kindName(kind), {'data-rw-add-monitor':kind}, {mutation:true})).join('')) + '</div>';
        add += '</div>';
      }
      return '<aside class="rw-sidebar"><div class="rw-sidebar-heading"><h2>' + title + '</h2><label class="rw-search"><span aria-hidden="true">⌕</span><input type="search" data-rw-search data-rw-focus="source-search" value="' + esc(query) + '" placeholder="Suchen" aria-label="' + title + ' suchen" autocomplete="off"></label></div><div class="rw-source-list">' + (rows || '<p class="rw-empty-small">' + (query ? 'Keine Treffer.' : 'Noch keine ' + title + '.') + '</p>') + add + '</div><figure class="rw-minimap-wrap"><div class="rw-minimap" data-rw-stage id="sp-routing-minimap"></div><figcaption>Bühne · Draufsicht</figcaption></figure></aside>';
    }

    function portButton(direction,selectedBox,selectedRows,purpose,port,onImage=false){
      const count=selectedBox[direction]||0,selectedIds=new Set(selectedRows.map(row=>row.id));
      const assigned=new Map((state.routing[direction]||[]).filter(row=>row.stagebox===selectedBox.id&&row.stageboxPort).map(row=>[Number(row.stageboxPort),row]));
        const occupant = direction==='inputs'&&onImage ? physicalOrigin(panelInventory.at(selectedBox.id,port)) : assigned.get(port), selected = purpose === 'overview' ? activePort?.boxId === selectedBox.id && activePort.direction === direction && activePort.port === port : !!occupant && selectedIds.has(occupant.id);
        const pair = selectedRows.length > 1, conflict = purpose === 'patch' && (Array.from({length:pair ? selectedRows.length : 1}, (_, offset) => assigned.get(port + offset)).some(row => row && !selectedIds.has(row.id)) || port + selectedRows.length - 1 > count);
        const attrsForPort = purpose === 'overview' ? {'data-rw-port':port,'data-rw-box':selectedBox.id,'data-rw-direction':direction} : {'data-rw-patch':port,'data-rw-box':selectedBox.id,'data-rw-direction':direction,'data-rw-rows':idsOf(selectedRows),'data-rw-exact-rows':String(direction === 'inputs' && selectedRows.length > 1 && !!selectedRows[0].diDeviceId && selectedRows.every(row => row.diDeviceId === selectedRows[0].diDeviceId))};
        const stereo = occupant?.stereoGroup, paired = stereo && [...assigned.values()].some(row => row.id !== occupant.id && row.stereoGroup === stereo), side = occupant?.mode === 'Stereo R' ? 'right' : 'left';
        return '<button type="button" class="rw-port' + (onImage ? ' sp-stagebox-image-port' : '') + '"' + attrs({...attrsForPort,'data-used':String(!!occupant),'data-selected':String(selected),'data-stereo':paired ? side : undefined,'aria-pressed':String(selected),'aria-label':(direction === 'inputs' ? 'Eingang ' : 'Ausgang ') + port + ' · ' + (occupant?.instrument || 'Frei') + (conflict ? ' · belegt' : '')}) + (conflict || purpose === 'patch' && readonly() ? ' disabled' : '') + '><span class="rw-port-number">' + String(port).padStart(2,'0') + '</span>' + (purpose === 'overview' && !onImage ? '<span class="sp-stagebox-socket" aria-hidden="true"></span>' : '') + (!onImage && direction==='inputs' && state.routing.preampPower?.some(entry=>entry.device===selectedBox.id&&entry.port===port) ? '<span class="rw-port-phantom">48 V</span>' : '') + (onImage && direction==='inputs' ? socketBadge(occupant) : '') + '<span class="rw-port-name">' + esc(occupant?.instrument?.replace(/^Drums\s*·\s*/, '') || 'Frei') + '</span>' + (paired && !(onImage && direction==='inputs') ? '<span class="rw-stereo-mark" aria-label="Stereo-Paar">' + (side === 'left' ? 'L' : 'R') + '</span>' : '') + '</button>';

    }
    function ports(direction,selectedBox,selectedRows=[],purpose='patch'){
      if(!selectedBox)return '<p class="rw-empty-small">Noch keine Stagebox auf der Bühne.</p>';
      if(purpose==='patch'&&global.StageplotStageboxes?.get(selectedBox.type))return zoomableSurface(selectedBox.type,(d,port)=>portButton(d,selectedBox,selectedRows,purpose,port,true),[direction],selectedBox.id);
      return '<div class="rw-port-grid" data-port-purpose="'+purpose+'">'+Array.from({length:selectedBox[direction]||0},(_,index)=>portButton(direction,selectedBox,selectedRows,purpose,index+1)).join('')+'</div>';
    }

    function patchEditor(rows, direction, key) {
      if (openCard !== key || readonly()) return '';
      const boxes = (state.boxes || []).filter(item => item[direction] > 0);
      const chosen = boxes.find(item => item.id === pickerBox) || boxes.find(item => item.id === rows[0]?.stagebox) || boxes[0];
      return '<div class="rw-card-editor"><div class="rw-choice-row" role="group" aria-label="Stagebox wählen">' + boxes.map(item => button(esc(item.name), {'data-rw-picker-box':item.id}, {pressed:item.id === chosen?.id})).join('') + '</div>' + ports(direction, chosen, rows) + (rows.some(row => row.stagebox) ? button('Verbindung lösen', {'data-rw-unpatch':idsOf(rows),'data-rw-direction':direction,'data-rw-exact-rows':String(direction === 'inputs' && rows.length > 1 && !!rows[0].diDeviceId && rows.every(row => row.diDeviceId === rows[0].diDeviceId))}, {className:'rw-quiet-danger',mutation:true}) : '') + '</div>';
    }

    function patchCard(rows, direction, suffix = '') {
      const key = 'patch-' + direction + '-' + idsOf(rows) + suffix, first = rows[0], assignedBox = box(first?.stagebox), linked = rows.length > 1;
      if (direction === 'outputs' && rows.some(nativeOutput)) {
        return '<article class="rw-card rw-patch-card">' + cardHead('Ausgang',null,art(icon(assignedBox?.type || localMixer.type))) + rows.map(row => '<strong class="rw-native-label">' + esc(row.x32.label || 'X32-Ausgang') + '</strong><p class="rw-card-meta">' + esc(row.stagebox && box(row.stagebox) ? box(row.stagebox).name + ' · OUT ' + row.stageboxPort : 'Zuordnung am Pult') + '</p>').join('') + (!readonly() ? button('Zuordnung bearbeiten',{'data-rw-tool':'x32Scene'},{mutation:true}) : '') + '</article>';
      }
      if (direction === 'inputs' && rows.some(nativeDirect)) {
        return '<article class="rw-card rw-patch-card">' + cardHead('Input',null,art(icon(localMixer.type))) + rows.map(row => '<strong class="rw-native-label">' + esc(nativeDirect(row) ? 'Pult direkt · IN ' + directPort(row) : row.stagebox && box(row.stagebox) ? box(row.stagebox).name + ' · IN ' + (row.stageboxPort || '—') : 'Noch nicht zugeordnet') + '</strong>').join('') + (!readonly() ? button('Zuordnung bearbeiten',{'data-rw-tool':'x32Scene'},{mutation:true}) : '') + '</article>';
      }
      if (direction === 'inputs' && first?.connector === 'Dante') {
        const source = object(sourceId(first));
        return '<article class="rw-card rw-patch-card">' + cardHead('Anschluss',null,art(icon(source || 'laptop'))) + '<strong class="rw-network-label">Dante · Netzwerk</strong><p class="rw-card-meta">RJ45 · CAT5e / CAT6</p><p class="rw-card-meta">' + esc(source?.playback?.target || 'Ziel noch offen') + '</p>' + (source?.type === 'laptop' && !readonly() ? button('Playback-Setup',{'data-rw-playback':source.id},{mutation:true}) : '') + '</article>';
      }
      const locations = [...new Set(rows.map(row => box(row.stagebox)?.name).filter(Boolean))].join(' / ');
      const patchRows = direction === 'inputs' && linked && first.diDeviceId && rows.every(row => row.diDeviceId === first.diDeviceId) ? rows : stereoRows(rows,direction);
      return '<article class="rw-card rw-patch-card" data-rw-card="' + esc(key) + '">' + cardHead(direction === 'inputs' ? 'Anschluss' : 'Ausgänge', key, art(icon(assignedBox?.type || 'stagebox-16'), 'rw-stagebox-art')) + button(esc(locations || 'Stagebox wählen') + pencil, {'data-rw-open':key,'aria-expanded':String(openCard === key)}, {className:'rw-card-value',mutation:true}) + '<div class="rw-port-pills">' + rows.map((row,index) => button(esc((direction === 'inputs' ? 'IN ' : 'OUT ') + (row.stageboxPort ? String(row.stageboxPort).padStart(2,'0') : '—') + (row.stereoGroup ? row.mode === 'Stereo R' ? ' · R' : ' · L' : linked ? ' · ' + (index + 1) : '')), {'data-rw-open':key,'aria-expanded':String(openCard === key)}, {className:row.stageboxPort ? 'rw-connected' : '',mutation:true})).join('') + '</div>' + (openCard === key && patchRows.length > 1 ? '<p class="rw-card-meta">' + (monoLabel(patchRows) === 'Stereo' ? 'Stereo · L / R' : 'Zwei Eingänge') + ' · erste Buchse wählen</p>' : '') + patchEditor(patchRows, direction, key) + '</article>';
    }

    function sharedDiRows(row) {
      if (!row?.diDeviceId || pickupKind(row) !== 'DI') return row ? [row] : [];
      return (state.routing.inputs || []).filter(member => member.diDeviceId === row.diDeviceId && pickupKind(member) === 'DI' && sourceId(member) === sourceId(row)).sort((a,b) => Number(a.diChannel) - Number(b.diChannel));
    }

    function diInputMap(rows) {
      return '<div class="rw-di-input-map" aria-label="Belegte DI-Eingänge">' + rows.map(row => '<div><span>Out ' + esc(row.portIndex || '—') + (row.stereoGroup ? row.mode === 'Stereo R' ? ' · R' : ' · L' : '') + '</span><span aria-hidden="true">→</span><strong>Eingang ' + Number(row.diChannel) + '</strong></div>').join('') + '</div>';
    }

    function diSignalTitle(rows) {
      const aliases = state.sourceOutputs?.[sourceId(rows[0])]?.aliases || [], names = [...new Set(rows.map(row => aliases[Number(row.portIndex) - 1]).filter(Boolean))];
      return '<div class="rw-di-signal-title"><strong>' + esc(names.length ? names.join(' / ') : 'Gemeinsame DI') + '</strong><span>' + rows.map(row => 'Out ' + esc(row.portIndex || '—')).join(' + ') + '</span></div>';
    }

    function diPortButtons(row, item, compact = false) {
      const rows = state.routing.inputs || [], members = sharedDiRows(row);
      if (members.length > 1) {
        const chosen = members.every(member => member.diDeviceId === item.id), busy = rows.some(other => other.diDeviceId === item.id && !members.some(member => member.id === other.id));
        return '<div class="rw-di-ports">' + button(chosen ? 'Verbunden' : 'Diese DI verwenden', {'data-rw-di-device':item.id,'data-rw-di-channel':1,'data-rw-row':row.id}, {pressed:chosen,disabled:chosen || busy || diChannels(item) < members.length,mutation:true}) + '</div>';
      }
      return '<div class="rw-di-ports" role="group" aria-label="Anschlüsse der DI-Box">' + Array.from({length:diChannels(item)}, (_, index) => {
        const channel = index + 1, occupant = rows.find(other => other.diDeviceId === item.id && Number(other.diChannel) === channel), chosen = occupant?.id === row.id;
        const side = occupant?.stereoGroup ? occupant.mode === 'Stereo R' ? 'R' : 'L' : '', label = occupant ? side ? baseName(occupant.instrument) + ' · ' + side : occupant.instrument : 'Frei';
        return button('<b>' + channel + '</b><span>' + esc(label) + '</span>', {'data-rw-di-device':item.id,'data-rw-di-channel':channel,'data-rw-row':row.id,'aria-label':deviceName(item) + ' Eingang ' + channel + ' · ' + label}, {className:(compact ? 'rw-di-port-compact ' : '') + (chosen ? 'rw-connected' : ''),pressed:chosen,disabled:!!occupant && !chosen,mutation:true});
      }).join('') + '</div>';
    }

    function diStereoControl(row, item) {
      if (diChannels(item) < 2) return '';
      const pair = stereoRows([row],'inputs'), shared = pair.length === 2 && pair.every(member => member.diDeviceId === item.id);
      if (shared) return '<p class="rw-di-stereo-status">Gemeinsame DI · ' + (row.mode === 'Stereo R' ? 'R' : 'L') + ' → Eingang ' + Number(row.diChannel) + '</p>';
      if (readonly() || !state.diStereoPairs?.[sourceId(row)]?.some(pair => pair.sourceKeys.includes(row.sourceKey)) || row.origin === 'pickup' || /:(?:pickup|audio)-/.test(row.sourceKey)) return '';
      return button('L + R anschließen', {'data-rw-di-stereo':row.id,'data-rw-di-stereo-device':item.id,'data-rw-row':row.id,'aria-label':'Beide Ausgänge an ' + deviceName(item) + ' anschließen'}, {className:'rw-di-stereo-connect',mutation:true});
    }

    function diEditor(row) {
      const chosen = device(row.diDeviceId), devices = state.routing.devices || [];
      const existing = devices.length ? '<h4>Vorhandene DI-Box</h4><div class="rw-existing-di-list">' + devices.map(item => '<div class="rw-existing-di"><span class="rw-existing-di-art">' + diPhoto(item) + '</span><strong>' + esc(deviceName(item)) + '</strong><small>' + esc(diDetails(item)) + '</small>' + diPortButtons(row,item) + '</div>').join('') + '</div>' : '';
      let settings = '';
      if (chosen) {
        const custom = chosen.modelId === 'custom';
        settings = field('Gerätename', physicalName(chosen), {'data-rw-device-field':'name','data-rw-device':chosen.id}, {maxlength:80});
        if (custom) {
          settings += '<div class="rw-choice-row" role="group" aria-label="DI-Kanäle">' + [1,2].map(count => button(count === 1 ? '1 Kanal' : '2 Kanäle', {'data-rw-device-value':'channels','data-rw-device':chosen.id,'data-rw-value':count}, {pressed:diChannels(chosen) === count,mutation:true})).join('') + '</div>';
          settings += '<div class="rw-choice-row" role="group" aria-label="DI-Bauart">' + [false,true].map(active => button(active ? 'Aktiv' : 'Passiv', {'data-rw-device-value':'active','data-rw-device':chosen.id,'data-rw-value':String(active)}, {pressed:!!chosen.active === active,mutation:true})).join('') + '</div>';
        }
        if (chosen.active && (custom || diModel(chosen)?.configurablePower)) {
          settings += '<div class="rw-choice-row" role="group" aria-label="DI-Stromversorgung">' + [['48V','48 V'],['battery','Batterie'],['external','Netzteil']].map(([value,label]) => button(label, {'data-rw-device-value':'power','data-rw-device':chosen.id,'data-rw-value':value}, {pressed:chosen.power === value,mutation:true})).join('') + '</div>';
        }
        settings = '<div class="rw-device-fields">' + settings + '</div>';
      }
      return '<div class="rw-editor-section">' + existing + settings + '</div>';
    }

    function diPicker() {
      const row = route(diPickerRow);
      if (!row || readonly()) {diPickerRow = '';return '';}
      const chosen = device(row.diDeviceId), source = sources.find(item => item.rows.some(input => input.id === row.id));
      if (diPickerDevices) return diDevicePicker(row,source);
      const models = (state.diModels || []).filter(item => item.id !== 'custom');
      const names = {'generic-passive-mono':'Passiv Mono','generic-passive-stereo':'Passiv Stereo','generic-active-mono':'Aktiv Mono','generic-active-stereo':'Aktiv Stereo'};
      const tiles = models.map(item => {
        const selected = !diPickerNew && chosen?.modelId === item.id;
        const detail = (item.active ? 'Aktiv' : 'Passiv') + ' · ' + (diChannels(item) === 1 ? 'Mono' : 'Stereo') + (item.active && item.power === '48V' ? ' · 48 V' : '');
        return button('<span class="rw-di-picker-art">' + diPhoto(item) + '</span><strong>' + esc(names[item.id] || item.name) + '</strong><small>' + esc(detail) + '</small>' + (selected ? '<span class="rw-di-picker-check" aria-hidden="true">✓</span>' : ''), {'data-rw-create-di':item.id,'data-rw-row':row.id}, {className:'rw-di-picker-tile',pressed:selected,mutation:true});
      }).join('');
      return '<dialog class="rw-di-picker" data-rw-di-dialog aria-labelledby="rw-di-picker-title" aria-describedby="rw-di-picker-source"><header class="rw-di-picker-heading"><div><h2 id="rw-di-picker-title">DI-Box wählen</h2><p id="rw-di-picker-source">' + esc(source?.name || baseName(row.instrument)) + '</p></div>' + button('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>', {'data-rw-di-close':'true','aria-label':'DI-Auswahl schließen'}, {className:'rw-di-picker-close'}) + '</header>' + (error ? '<p class="rw-error" role="alert">' + esc(error) + '</p>' : '') + '<div class="rw-di-picker-grid">' + tiles + '</div></dialog>';
    }

    function diDevicePicker(row, source) {
      const own = sharedDiRows(row), stereo = stereoRows([row],'inputs'), nativePair = stereo.length === 2 && state.diStereoPairs?.[sourceId(row)]?.some(pair => stereo.every(member => pair.sourceKeys.includes(member.sourceKey))), members = nativePair ? stereo : own;
      const tiles = (state.routing.devices || []).filter(item => item.objectId).map(item => {
        const paired = members.length > 1 && diChannels(item) >= members.length, selected = paired ? members : own, ids = new Set(selected.map(member => member.id));
        const occupants = (state.routing.inputs || []).filter(member => member.diDeviceId === item.id), free = Array.from({length:diChannels(item)},(_,i) => i+1).filter(port => !occupants.some(member => Number(member.diChannel) === port && !ids.has(member.id)));
        const locked = object(item.objectId)?.locked, controls = selected.length > 1 ? button('L + R anschließen',{'data-rw-use-di':item.id,'data-rw-row':row.id,'data-rw-di-channel':1},{disabled:locked || ![1,2].every(port => free.includes(port)),mutation:true}) : '<div class="rw-di-instance-ports">' + Array.from({length:diChannels(item)},(_,i) => {const port=i+1,occupant=occupants.find(member => Number(member.diChannel) === port);return button('Eingang '+port+' · '+esc(occupant?.instrument || 'Frei'),{'data-rw-use-di':item.id,'data-rw-row':row.id,'data-rw-di-channel':port},{disabled:locked || !free.includes(port),mutation:true});}).join('') + '</div>';
        const status=selected.length>1?'<div class="rw-di-instance-status">'+Array.from({length:diChannels(item)},(_,i)=>'<span>'+(i+1)+' · '+esc(occupants.find(member=>Number(member.diChannel)===i+1)?.instrument||'Frei')+'</span>').join('')+'</div>':'';
        return '<article class="rw-di-instance" data-rw-di-instance="'+esc(item.id)+'"><span class="rw-di-picker-art">'+diPhoto(item)+'</span><strong>'+esc(physicalName(item))+'</strong><small>'+esc(diModel(item)?.name || deviceName(item))+'</small>'+status+controls+'</article>';
      }).join('');
      return '<dialog class="rw-di-picker" data-rw-di-dialog aria-labelledby="rw-di-picker-title"><header class="rw-di-picker-heading"><div><h2 id="rw-di-picker-title">DI-Box zuordnen</h2><p>'+esc(source?.name || row.instrument)+'</p></div>'+button('×',{'data-rw-di-close':'true','aria-label':'DI-Auswahl schließen'},{className:'rw-di-picker-close'})+'</header>'+(error?'<p class="rw-error" role="alert">'+esc(error)+'</p>':'')+'<div class="rw-di-picker-grid">'+tiles+'</div>'+button('＋ Neue DI',{'data-rw-di-new':row.id},{className:'rw-add',mutation:true})+'</dialog>';
    }

    function openDiPicker(rowId, trigger, existing = false) {
      if (readonly() || !route(rowId)) return;
      diPickerFocus = trigger ? {attributes:[...trigger.attributes].filter(attr => attr.name.startsWith('data-rw-')).map(attr => [attr.name,attr.value]),row:rowId} : preserveFocus();
      diPickerRow = rowId;diPickerDevices = existing;diPickerNew = false;error = '';render();
    }
    function closeDiPicker() {
      const rowId = diPickerRow, focus = diPickerFocus;
      diPickerRow = '';diPickerFocus = null;diPickerDevices = false;diPickerNew = false;error = '';render();
      restoreFocus(focus);
      if (!host.contains(host.ownerDocument.activeElement) || host.ownerDocument.activeElement === host) {
        [...host.querySelectorAll('[data-rw-di-open]')].find(element => element.dataset.rwDiOpen === rowId)?.focus({preventScroll:true});
      }
    }

    function microphoneChoices(row) {
      let microphones = state.microphones || [];
      if (!Array.isArray(microphones)) microphones = Object.values(microphones);
      const queryText = normalized(micQuery);
      return microphones.filter(item => normalized([item.name,item.type,item.brand].join(' ')).includes(queryText)).map(item => button('<span class="rw-mic-photo">' + micIcon(item.name) + '</span><strong>' + esc(item.name) + '</strong><small>' + esc(item.type || '') + (item.phantom ? ' · 48 V' : '') + '</small>', {'data-rw-mic':item.name,'data-rw-row':row.id,'data-rw-phantom':String(!!item.phantom)}, {className:'rw-model-tile',pressed:row.microphone === item.name,mutation:true})).join('') || '<p class="rw-empty-small">Kein passendes Mikrofon.</p>';
    }

    function pickupCard(row, rows = [row]) {
      const shared = rows.length > 1;
      const key = 'pickup-' + row.id, kind = pickupKind(row), di = device(row.diDeviceId), editing = openCard === key && !readonly();
      const kinds = '<div class="rw-choice-row rw-pickup-types" role="group" aria-label="Abnahmeart">' + [['Mic','Mikrofon'],['DI','DI-Box'],['Direct','Direkt'],['Digital','Digital']].map(([value,label]) => button(label, {'data-rw-pickup':value,'data-rw-row':row.id,'aria-label':pickupName(value)}, {pressed:kind === value,mutation:true})).join('') + '</div>';
      let content = '', editor = '';
      if (kind === 'Direct' || kind === 'Digital') {
        content = '<div class="rw-pickup-connection"><span>Anschluss</span><div class="rw-choice-row rw-inline-connectors" role="group" aria-label="Anschlussart">' + (kind === 'Digital' ? ['Dante','MADI','USB','Digital'] : ['XLR','Klinke']).map(connector => button(connector, {'data-rw-connector':connector,'data-rw-row':row.id}, {pressed:row.connector === connector,mutation:true})).join('') + '</div></div>';
      } else {
        const title = kind === 'DI' ? di ? diModel(di)?.name || deviceName(di) : 'DI-Box wählen' : row.microphone || 'Mikrofon wählen', picture = kind === 'DI' ? diPhoto(di) : micIcon(row.microphone);
        content = button('<span class="rw-pickup-thumbnail">' + picture + '</span><span class="rw-pickup-model-copy"><strong>' + esc(title) + '</strong><small>' + (kind === 'DI' && di ? esc(physicalName(di)) : readonly() ? 'Mikrofon' : 'Modell wählen') + '</small></span>' + (!readonly() ? '<span class="rw-pickup-model-chevron" aria-hidden="true">›</span>' : ''), kind === 'DI' ? {'data-rw-di-open':row.id,'aria-haspopup':'dialog'} : {'data-rw-open':key,'aria-expanded':String(editing)}, {className:'rw-card-value rw-pickup-model',mutation:true});
        if (kind === 'DI' && di) content += shared ? diInputMap(rows) : diPortButtons(row,di,true) + diStereoControl(row,di);
        if (kind === 'DI' && !readonly() && (state.routing.devices || []).some(item => item.id !== di?.id && item.objectId)) content += button('Box zuordnen',{'data-rw-di-choose':row.id,'aria-haspopup':'dialog'},{className:'rw-di-choose',mutation:true});
        if (kind === 'Mic' || kind === 'DI' && (!di || di.power === '48V')) content += button('<span class="rw-phantom-dot" aria-hidden="true"></span> 48 V' + (kind === 'DI' && di?.power === '48V' ? ' benötigt' : ''), {'data-rw-toggle-phantom':row.id,'aria-label':'48 V für ' + row.instrument}, {className:'rw-phantom',pressed:!!row.phantom,disabled:kind === 'DI' && !!di,mutation:true});
        if (editing) editor = '<div class="rw-card-editor">' + (kind === 'DI' ? diEditor(row) : '<label class="rw-search"><span aria-hidden="true">⌕</span><input type="search" data-rw-mic-search data-rw-focus="mic-search-' + esc(row.id) + '" data-rw-row="' + esc(row.id) + '" value="' + esc(micQuery) + '" placeholder="Mikrofon suchen" aria-label="Mikrofon suchen" autocomplete="off"></label><div class="rw-model-grid rw-mic-options" data-rw-mic-options>' + microphoneChoices(row) + '</div>' + field('Mikrofonname', row.microphone, {'data-rw-channel-field':'microphone','data-rw-row':row.id,'data-rw-direction':'inputs'})) + '</div>';
      }
      const actions = readonly() ? '' : '<div class="rw-pickup-actions">' + (kind === 'DI' ? button(editing ? 'Einstellungen schließen' : 'Box einstellen',{'data-rw-open':key,'aria-expanded':String(editing)},{className:'rw-pickup-settings'}) : '') + button('Entfernen',{'data-rw-remove-pickup':row.id,'aria-label':'Abnahme entfernen'},{className:'rw-quiet-danger'}) + '</div>';
      return '<article class="rw-card rw-pickup-card"' + attrs({'data-rw-row-card':row.id,'data-rw-rows':idsOf(rows),'data-rw-device-card':di?.id,'data-pickup-kind':kind}) + '>' + (shared ? diSignalTitle(rows) : '') + kinds + content + editor + actions + '</article>';
    }

    function channelCard(row, direction = 'inputs') {
      if (nativeAux(row)) return '<article class="rw-card rw-channel-card">' + cardHead('Aux-Kanal', null, '<div class="rw-channel-emblem" aria-hidden="true"><small>AUX</small><strong>' + esc(row.x32.channel) + '</strong></div>') + field('Kanalname',row.instrument,{'data-rw-channel-field':'instrument','data-rw-row':row.id,'data-rw-direction':direction}) + '<p class="rw-card-meta">Aux-/USB-Kanal aus der Szene</p></article>';
      return '<article class="rw-card rw-channel-card">' + cardHead('Kanal', null, '<div class="rw-channel-emblem" aria-hidden="true"><small>' + (direction === 'inputs' ? 'CH' : 'BUS') + '</small><strong>' + esc(row.number ? String(row.number).padStart(2,'0') : '—') + '</strong></div>') + field('Kanalnummer',row.number,{'data-rw-channel-field':'number','data-rw-row':row.id,'data-rw-direction':direction},{type:'number',min:1,max:999,placeholder:'—',className:'rw-number-field'}) + field('Kanalname',row.instrument,{'data-rw-channel-field':'instrument','data-rw-row':row.id,'data-rw-direction':direction}) + '<p class="rw-card-meta">' + esc(row.stereoGroup ? row.mode === 'Stereo R' ? 'Stereo · R' : 'Stereo · L' : 'Mono') + '</p></article>';
    }

    const connector = '<span class="rw-connector"><svg viewBox="0 0 10 14" fill="none" aria-hidden="true" focusable="false"><path d="m2.5 2.5 4.5 4.5-4.5 4.5"/></svg></span>';
    const arrow = (stereo = false, labels = ['L','R']) => '<div class="rw-arrow' + (stereo ? ' rw-arrow-stereo' : '') + '" aria-hidden="true">' + (stereo ? labels.map(side => '<span class="rw-arrow-lane"><small>' + esc(side) + '</small>' + connector + '</span>').join('') : connector) + '</div>';

    function sourceOutputControls(group) {
      const outputs = state.sourceOutputs?.[group.id];
      if (!outputs) return '';
      const summary = outputs.count + (outputs.count === 1 ? ' Ausgang' : ' Ausgänge') + ' · ' + outputs.connector, locked = readonly() || outputs.locked, disabled = locked || !outputs.editable;
      if (outputs.editor && !outputs.editable) return '<div class="rw-source-outputs"><span class="rw-output-summary">' + esc(summary) + '</span>' + button(({playback:'Playback-Ausgänge',drums:'Drum-Aufbau',percussion:'Percussion-Aufbau',orchestra:'Orchester-Aufbau'}[outputs.editor] || 'Ausgänge') + ' bearbeiten', {'data-rw-source-editor':group.id}, {disabled:locked,mutation:true}) + '</div>';
      const key = 'source-outputs-' + group.id, editing = openCard === key;
      let markup = '<div class="rw-source-outputs">' + button('<span><small>Ausgänge</small><strong>' + esc(summary) + '</strong></span><span aria-hidden="true">' + (editing ? '−' : '+') + '</span>', {'data-rw-source-outputs':group.id,'aria-label':'Ausgänge von ' + group.name + ' bearbeiten','aria-expanded':String(editing)}, {className:'rw-source-output-toggle'});
      if (editing) {
        markup += '<div class="rw-source-output-editor"><div class="rw-output-count"><span>Anzahl</span><div>' + button('−', {'data-rw-source-output-step':-1,'data-rw-source':group.id,'aria-label':'Einen Ausgang weniger'}, {disabled:disabled || outputs.count <= 0,mutation:true}) + '<input type="number" min="0" max="64" step="1" required aria-label="Anzahl Ausgänge" data-rw-source-output-count="' + esc(group.id) + '" data-rw-focus="output-count-' + esc(group.id) + '" value="' + outputs.count + '"' + (disabled ? ' disabled' : '') + '>' + button('+', {'data-rw-source-output-step':1,'data-rw-source':group.id,'aria-label':'Einen Ausgang mehr'}, {disabled:disabled || outputs.count >= 64,mutation:true}) + '</div></div><div class="rw-output-connector"><span>Buchse am Instrument</span><div class="rw-choice-row" role="group" aria-label="Ausgangsbuchse">' + outputs.connectors.map(value => button(esc(value), {'data-rw-source-output-connector':value,'data-rw-source':group.id}, {pressed:value === outputs.connector,disabled,mutation:true})).join('') + '</div></div>';
        if (outputs.ports.length) {
          markup += '<div class="rw-output-port-list">';
          for (const port of outputs.ports) {
            const locked = disabled || port.locked, paired = outputs.stereoPairs.includes(port.number) || outputs.stereoPairs.includes(port.number - 1), side = paired ? outputs.stereoPairs.includes(port.number) ? ' · L' : ' · R' : '';
            markup += '<div class="rw-output-port"><div><strong>Out ' + port.number + side + '</strong>' + button(port.active ? 'Verwendet' : 'Verwenden', {'data-rw-source-output-used':port.number,'data-rw-source':group.id,'data-rw-value':String(!port.active),'aria-label':'Ausgang ' + port.number + (port.active ? ' deaktivieren' : ' verwenden')}, {pressed:port.active,disabled:locked,mutation:true}) + '</div><input type="text" maxlength="60" placeholder="Ausgangsname" aria-label="Name Ausgang ' + port.number + '" data-rw-source-output-alias="' + port.number + '" data-rw-source="' + esc(group.id) + '" data-rw-focus="output-alias-' + esc(group.id) + '-' + port.number + '" value="' + esc(outputs.aliases[port.number - 1] || '') + '"' + (locked ? ' disabled' : '') + '></div>';
            if (port.number % 2 === 0) {
              const start = port.number - 1, linked = outputs.stereoPairs.includes(start), pairLocked = disabled || outputs.ports.some(member => [start,port.number].includes(member.number) && member.locked);
              markup += '<div class="rw-output-pair"><span>Out ' + start + ' + ' + port.number + '</span><div class="rw-choice-row" role="group" aria-label="Format Ausgänge ' + start + ' und ' + port.number + '">' + [[false,'Einzeln'],[true,'Stereo L/R']].map(([value,label]) => button(label, {'data-rw-source-output-stereo':start,'data-rw-source':group.id,'data-rw-value':String(value)}, {pressed:linked === value,disabled:pairLocked,mutation:true})).join('') + '</div></div>';
            }
          }
          markup += '</div>';
        }
        markup += '</div>';
      }
      return markup + '</div>';
    }

    function sourceFlow(group, onlyRow = null) {
      const rows = onlyRow ? sharedDiRows(onlyRow) : group.rows, count = rows.length, linked = count > 1 && monoLabel(rows) === 'Stereo';
      const lanes = [], seen = new Set();
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        const members = sharedDiRows(row).filter(member => rows.some(candidate => candidate.id === member.id));
        members.forEach(member => seen.add(member.id));lanes.push(members);
      }
      const laneCount = lanes.length;
      const sourceCard = '<article class="rw-card rw-source-card" style="grid-row:2 / ' + (Math.max(1,laneCount) + 2) + '">' + cardHead('Quelle', null, art(icon(group.object))) + field('Instrument',group.name,{'data-rw-source-field':'label','data-rw-source':group.id},{maxlength:42}) + sourceOutputControls(group) + '<p class="rw-card-meta">' + laneCount + (laneCount === 1 ? ' Abnahme' : ' Abnahmen') + (count > laneCount ? ' · ' + count + ' Kanäle' : '') + '</p></article>';
      let markup = '<div class="rw-flow-scroll"><div class="rw-source-flow" data-row-count="' + laneCount + '" data-signal-count="' + count + '"><span class="rw-column-title rw-column-source">Quelle</span><span class="rw-column-title rw-column-pickup">Abnahme</span><span class="rw-column-title rw-column-patch">Anschluss</span><span class="rw-column-title rw-column-channel">Kanal</span>' + sourceCard;
      lanes.forEach((members,index) => {
        const gridRow = index + 2, row = members[0], shared = members.length > 1;
        const channels = shared ? '<div class="rw-channel-stack">' + members.map(member => channelCard(member)).join('') + '</div>' : channelCard(row);
        const split = shared ? '<div class="rw-channel-fork" aria-hidden="true">' + members.map((member,i) => '<div data-branch="' + (i === 0 ? 'first' : i === members.length - 1 ? 'last' : 'middle') + '">' + connector + '</div>').join('') + '</div>' : arrow();
        markup += '<div class="rw-branch" data-branch="' + (laneCount === 1 ? 'single' : index === 0 ? 'first' : index === laneCount - 1 ? 'last' : 'middle') + '" style="grid-row:' + gridRow + '" aria-hidden="true">' + connector + '</div><div class="rw-flow-pickup" style="grid-row:' + gridRow + '">' + pickupCard(row,members) + '</div><div class="rw-flow-arrow-one" style="grid-row:' + gridRow + '">' + arrow(shared, members.map(member => member.stereoGroup ? member.mode === 'Stereo R' ? 'R' : 'L' : String(member.diChannel))) + '</div><div class="rw-flow-patch" style="grid-row:' + gridRow + '">' + patchCard(members,'inputs') + '</div><div class="rw-flow-arrow-two' + (shared ? ' rw-flow-split' : '') + '" style="grid-row:' + gridRow + '">' + split + '</div><div class="rw-flow-channel" style="grid-row:' + gridRow + '">' + channels + '</div>';
      });
      if (!onlyRow && !readonly()) markup += '<div class="rw-add-pickup" style="grid-row:' + (laneCount + 2) + '">' + button('＋ Weitere Abnahme',{'data-rw-add-pickup':group.id},{className:'rw-add',mutation:true}) + '</div>';
      markup += '</div></div>';
      if (!onlyRow && count === 2 && !readonly()) markup += '<div class="rw-format-controls" role="group" aria-label="Kanalformat">' + button('Unabhängig · Dual-Mono',{'data-rw-unlink':idsOf(rows)},{pressed:!linked,mutation:true}) + button('Stereo · L / R',{'data-rw-link':idsOf(rows)},{pressed:linked,mutation:true}) + '</div>';
      return markup;
    }

    function notes(rows, direction) {
      if (!rows.length) return '';
      const ids = idsOf(rows), first = rows[0];
      return '<label class="rw-notes"><span>Notiz für die Technik</span><textarea rows="2" maxlength="240" data-rw-notes="' + esc(ids) + '" data-rw-direction="' + direction + '" data-rw-focus="notes-' + esc(ids) + '" placeholder="' + (direction === 'outputs' ? 'Monitormix, besondere Wünsche …' : 'Mikrofonposition, Hinweise …') + '"' + (readonly() ? ' readonly' : '') + '>' + esc(first.notes) + '</textarea></label>';
    }

    function sourcesView() {
      const group = sources.find(item => item.id === activeSource);
      if (!group) return '<div class="rw-empty"><strong>Noch keine Quellen</strong><p>Instrumente auf der Bühne erscheinen hier mit ihren Abnahmen.</p></div>';
      highlighted = [...new Set([group.object?.id,...group.rows.map(row => device(row.diDeviceId)?.objectId)].filter(Boolean))];
      return heading(group.name, '<span class="rw-format-badge">' + (group.rows.length ? monoLabel(group.rows) : 'Offen') + '</span>') + sourceFlow(group) + notes(group.rows,'inputs');
    }

    function monitorView(group = monitors.find(item => item.id === activeMonitor), embedded = false) {
      if (!group) return '<div class="rw-empty"><strong>Noch keine Monitorwege</strong><p>Lege links einen IEM-, Wedge- oder Line-Weg an.</p></div>';
      const rows = group.rows, first = rows[0], stereo = rows.length > 1 && !!first.stereoGroup, ids = idsOf(rows), kind = group.kind, transport = first.iemTransport || 'wireless';
      if (!embedded) highlighted = [...new Set([group.object?.id,...rows.map(row => row.stagebox)].filter(Boolean))];
      const native = rows.some(nativeOutput);
      const mode = '<span class="rw-format-badge">' + kindName(kind) + '</span>' + (native ? '<span class="rw-card-meta">Format aus der Szene</span>' : '<div class="rw-choice-row rw-heading-choices" role="group" aria-label="Monitorformat">' + ['mono','stereo'].map(format => button(format === 'mono' ? 'Mono' : 'Stereo',{'data-rw-monitor-format':format,'data-rw-rows':ids},{pressed:stereo === (format === 'stereo'),mutation:true})).join('') + '</div>');
      const mix = native ? '<article class="rw-card rw-mix-card rw-native-source">' + cardHead('Signalquelle',null,art(icon(localMixer.type))) + rows.map(row => '<strong>' + esc(row.x32.sourceLabel || 'Quelle nicht aufgelöst') + '</strong><span>' + esc(row.x32.label || row.x32.endpoint) + '</span>').join('') + '<p class="rw-card-meta">Ausgangs-Patch aus der Szene</p></article>' : '<article class="rw-card rw-mix-card">' + cardHead('Mix',null,art(icon(localMixer.type))) + field('Mixname',group.name,{'data-rw-monitor-field':'name','data-rw-rows':ids}) + '<div class="rw-bus-fields">' + rows.map((row,index) => field(stereo ? index === 0 ? 'Bus · L' : 'Bus · R' : 'Bus',row.number,{'data-rw-channel-field':'number','data-rw-row':row.id,'data-rw-direction':'outputs'},{type:'number',min:1,max:999,placeholder:'—'})).join('') + '</div><p class="rw-card-meta">' + (stereo ? 'L / R' : 'Mono') + '</p></article>';
      const equipment = '<article class="rw-card rw-monitor-device">' + cardHead('Gerät',null,art(icon(kind === 'monitor' ? 'wedge' : kind === 'iem' ? 'rack' : group.object || 'rack'))) + '<div class="rw-choice-row" role="group" aria-label="Monitorgerät">' + ['iem','monitor','line'].map(value => button(kindName(value),{'data-rw-monitor-kind':value,'data-rw-rows':ids},{pressed:kind === value,mutation:true})).join('') + '</div>' + field(kind === 'iem' ? transport === 'wireless' ? 'IEM-Sender' : 'Kopfhörerverstärker' : 'Modell',first.monitorDeviceName || '',{'data-rw-monitor-field':'monitorDeviceName','data-rw-rows':ids},{placeholder:'Gerätename'}) + (kind === 'iem' ? '<div class="rw-choice-row" role="group" aria-label="IEM-Übertragung">' + [['wireless','Funk'],['cable','Kabel']].map(([value,label]) => button(label,{'data-rw-monitor-value':'iemTransport','data-rw-value':value,'data-rw-rows':ids},{pressed:transport === value,mutation:true})).join('') + '</div>' + (transport === 'wireless' ? field('Frequenz',first.frequencyBand,{'data-rw-monitor-field':'frequencyBand','data-rw-rows':ids},{placeholder:'MHz'}) : '') : kind === 'monitor' ? '<div class="rw-choice-row" role="group" aria-label="Wedge-Bauart">' + [true,false].map(active => button(active ? 'Aktiv' : 'Passiv',{'data-rw-monitor-value':'monitorActive','data-rw-value':String(active),'data-rw-rows':ids},{pressed:(first.monitorActive !== false) === active,mutation:true})).join('') + '</div>' + (first.monitorActive === false ? field('Endstufe',first.monitorAmplifierName,{'data-rw-monitor-field':'monitorAmplifierName','data-rw-rows':ids},{placeholder:'Endstufenmodell'}) : '') : '') + '<p class="rw-card-meta">' + (stereo ? 'Stereo' : 'Mono') + '</p></article>';
      const recipient = '<article class="rw-card rw-monitor-recipient">' + cardHead(kind === 'iem' ? 'Empfänger' : 'Musiker',null,art(icon(kind === 'iem' ? 'iem-earphones' : group.object || 'wedge'))) + field('Musiker',first.monitorReceiverName || first.iemName || group.name,{'data-rw-monitor-field':'monitorReceiverName','data-rw-rows':ids}) + '<p class="rw-card-meta">' + (kind === 'iem' ? transport === 'wireless' ? 'Bodypack · ' : 'Kabel · ' : '') + (stereo ? 'Stereo' : 'Mono') + '</p></article>';
      const chosenBox = box(first.stagebox), compactPorts = chosenBox ? '<section class="rw-monitor-ports"><h3>' + esc(chosenBox.name) + ' · Ausgänge</h3>' + ports('outputs', chosenBox,rows) + '</section>' : '';
      return (embedded ? '' : heading(group.name,mode)) + '<div class="rw-flow-scroll"><div class="rw-monitor-flow">' + mix + arrow(stereo) + patchCard(rows,'outputs',embedded ? '-embedded' : '') + arrow(stereo) + equipment + arrow() + recipient + '</div></div>' + compactPorts + (embedded ? '' : notes(rows,'outputs'));
    }

    function stageboxView() {
      const selectedBox = box(activeBox);
      if (!selectedBox) return '<div class="rw-empty"><strong>Noch keine Stagebox</strong><p>Füge links eine Stagebox hinzu.</p></div>';
      if (!activePort) {
        const preferred = sources.find(item => item.id === activeSource)?.rows.find(row => row.stagebox === selectedBox.id && row.stageboxPort);
        const first = preferred || (state.routing.inputs || []).find(row => row.stagebox === selectedBox.id && row.stageboxPort) || (state.routing.outputs || []).find(row => row.stagebox === selectedBox.id && row.stageboxPort);
        if (first) activePort = {boxId:selectedBox.id,direction:(state.routing.inputs || []).includes(first) ? 'inputs' : 'outputs',port:Number(first.stageboxPort)};
      }
      highlighted = [selectedBox.id];
      const key = 'box-' + selectedBox.id, editing = openCard === key && !readonly();
      let content = heading(selectedBox.name, (!readonly() ? button(pencil,{'data-rw-open':key,'aria-label':'Stagebox bearbeiten','aria-expanded':String(editing)},{className:'rw-edit'}) : '') + '<div class="rw-choice-row rw-heading-choices" role="group" aria-label="Stagebox-Darstellung">' + [['grid','Buchsen'],['list','Liste']].map(([value,label]) => button(label,{'data-rw-box-layout':value},{pressed:stageboxLayout === value})).join('') + '</div>') + '<p class="rw-capacity">' + selectedBox.inputs + ' Eingänge · ' + selectedBox.outputs + ' Ausgänge</p>';
      if (editing) content += '<div class="rw-box-editor">' + field('Stagebox-Name',selectedBox.name,{'data-rw-box-field':'name','data-rw-box':selectedBox.id},{maxlength:42}) + (global.StageplotStageboxes?.get(selectedBox.type) ? '<p class="rw-card-meta">'+esc(global.StageplotStageboxes.get(selectedBox.type).brand+' '+global.StageplotStageboxes.get(selectedBox.type).name)+' · '+(selectedBox.comboJacks?'XLR / Klinke':'XLR')+'</p>' : '<div class="rw-choice-row" role="group" aria-label="Eingangsbuchsen">' + [false,true].map(combo => button(combo ? 'XLR / Klinke' : 'XLR',{'data-rw-combo':String(combo),'data-rw-box':selectedBox.id},{pressed:!!selectedBox.comboJacks === combo,mutation:true})).join('') + '</div>') + '</div>';
      const hardware=global.StageplotStageboxes?.get(selectedBox.type);
      if(hardware&&stageboxLayout==='grid')content+='<section class="rw-stagebox-hardware"><div class="rw-stagebox-legend"><span>'+esc(hardware.brand+' '+hardware.name)+' · '+esc(hardware.protocol)+'</span><span><i></i> Belegt · Buchse antippen</span></div>'+zoomableSurface(selectedBox.type,(direction,port)=>portButton(direction,selectedBox,[],'overview',port,true),undefined,selectedBox.id)+'</section>';
      else for (const direction of ['inputs','outputs']) if (selectedBox[direction]) content += '<section class="rw-stagebox-section" data-rw-port-layout="' + stageboxLayout + '" data-combo-jacks="' + String(selectedBox.comboJacks === true) + '"><header><h3>' + (direction === 'inputs' ? 'Eingänge' : 'Ausgänge') + '</h3><span>' + (state.routing[direction] || []).filter(row => row.stagebox === selectedBox.id && row.stageboxPort).length + ' / ' + selectedBox[direction] + ' belegt</span></header>' + ports(direction,selectedBox,[],'overview') + '</section>';
      if (activePort?.boxId === selectedBox.id) {
        const direction = activePort.direction, occupied = (state.routing[direction] || []).find(row => row.stagebox === selectedBox.id && Number(row.stageboxPort) === activePort.port);
        content += '<section class="rw-selected-route"><h3>' + (direction === 'inputs' ? 'Eingang ' : 'Ausgang ') + String(activePort.port).padStart(2,'0') + '</h3>';
        if (occupied) {
          const source = sources.find(item => item.rows.some(row => row.id === occupied.id));
          const monitor = monitors.find(item => item.rows.some(row => row.id === occupied.id));
          content += direction === 'inputs' && source ? sourceFlow(source,occupied) : monitor ? monitorView(monitor,true) : channelCard(occupied,direction);
          if (!readonly()) content += button('Verbindung lösen',{'data-rw-unpatch':occupied.id,'data-rw-direction':direction},{className:'rw-quiet-danger',mutation:true});
        } else {
          content += '<div class="rw-open-port"><strong>Freie Buchse</strong>' + (readonly() ? '' : '<div class="rw-route-choices">' + (state.routing[direction] || []).filter(row => !nativeOutput(row) && (!row.stagebox || !row.stageboxPort) && row.connector !== 'Dante' && (!row.stereoGroup || row.mode !== 'Stereo R')).map(row => {
            const members = stereoRows([row],direction), pair = members.length > 1, invalid = members.some((member,index) => activePort.port + index > selectedBox[direction] || (state.routing[direction] || []).some(occupant => !members.some(item => item.id === occupant.id) && occupant.stagebox === selectedBox.id && Number(occupant.stageboxPort) === activePort.port + index));
            return button('<strong>' + esc(pair ? baseName(row.instrument) : row.instrument) + '</strong><small>' + (pair ? 'Stereo · L / R · ' : '') + esc(direction === 'inputs' ? row.microphone || pickupName(pickupKind(row)) : kindName(monitorKind(row,object(sourceId(row))))) + '</small>',{'data-rw-patch':activePort.port,'data-rw-box':selectedBox.id,'data-rw-direction':direction,'data-rw-rows':idsOf(members)},{className:'rw-route-choice',disabled:invalid,mutation:true});
          }).join('') + '</div>') + '</div>';
        }
        content += '</section>';
      }
      return content;
    }

    function channelConnectionEditor(row) {
      const members=stereoRows([row],'inputs'),boxes=(state.boxes||[]).filter(item=>item.inputs>0),chosen=boxes.find(item=>item.id===pickerBox)||boxes.find(item=>item.id===row.stagebox)||boxes[0];
      const identity=nativeAux(row)?'AUX '+row.x32.channel:'CH '+(row.number||'—');
      let editor='';
      if(nativeDirect(row)||nativeAux(row)) editor='<p>Quelle aus der X32-Szene: '+esc(nativeDirect(row)?'Pult · IN '+directPort(row):'AUX '+row.x32.channel)+'</p>'+(!readonly()?button('X32-Zuordnung bearbeiten',{'data-rw-tool':'x32Scene'}):'');
      else if(['Dante','MADI','USB','Digital'].includes(row.connector)) editor='<p>'+esc(row.connector)+' · '+esc(object(sourceId(row))?.playback?.target||'Digitaler Signalweg')+'</p>'+(!readonly()&&object(sourceId(row))?.type==='laptop'?button('Playback-Setup',{'data-rw-playback':sourceId(row)}):'');
      else if(readonly()) editor='<p>'+esc(row.stagebox?(box(row.stagebox)?.name||'Stagebox')+' · IN '+(row.stageboxPort||'—'):'Noch nicht verbunden')+'</p>';
      else editor='<p class="rw-channel-patch-help">'+(members.length>1?'Stereo-Paar · erste Eingangsbuchse wählen.':'Stagebox und freie Eingangsbuchse wählen.')+'</p><div class="rw-choice-row" role="group" aria-label="Stagebox wählen">'+boxes.map(item=>button(esc(item.name),{'data-rw-picker-box':item.id},{pressed:item.id===chosen?.id})).join('')+'</div>'+ports('inputs',chosen,members)+(members.some(item=>item.stagebox)?button('Verbindung lösen',{'data-rw-unpatch':idsOf(members),'data-rw-direction':'inputs'},{className:'rw-quiet-danger',mutation:true}):'')+(!boxes.length?button('Stagebox hinzufügen',{'data-rw-tab':'stageboxes'}):'');
      return '<tr class="rw-channel-detail-row"><td colspan="4"><section class="rw-channel-detail" id="rw-channel-detail-'+esc(row.id)+'" aria-label="Anschlüsse für '+esc(row.instrument)+'"><div class="rw-channel-detail-heading"><strong>'+esc(identity+' · '+row.instrument)+'</strong>'+button('Schließen',{'data-rw-channel-details':row.id,'aria-label':'Anschlüsse schließen'})+'</div>'+(error?'<p class="rw-error" role="alert">'+esc(error)+'</p>':'')+editor+'</section></td></tr>';
    }
    function channelListView(){
      const allRows=(state.routing.inputs||[]).slice().sort((a,b)=>Number(nativeAux(a))-Number(nativeAux(b))||(a.number||Infinity)-(b.number||Infinity));
      const rows=allRows.filter(row=>(!channelUnconnected||!connected([row]))&&normalized([row.number,row.instrument,row.microphone,box(row.stagebox)?.name,row.stageboxPort,nativeAux(row)?'AUX':'CH'].join(' ')).includes(normalized(channelQuery)));
      const actions='<div class="rw-channel-files" aria-label="Import und Export">'+button('PDF erstellen',{'data-rw-tool':'pdf'})+button('Import / Export',{'data-rw-tools':'true','aria-expanded':String(toolsOpen)})+(!readonly()?'<span class="rw-channel-history">'+button('↶',{'data-rw-tool':'undo','aria-label':'Rückgängig','title':'Rückgängig'},{mutation:true})+button('↷',{'data-rw-tool':'redo','aria-label':'Wiederholen','title':'Wiederholen'},{mutation:true})+'</span>':'')+'</div>'+(toolsOpen?toolsMenu():'');
      const filters='<div class="rw-channel-filters"><label class="rw-search"><span aria-hidden="true">⌕</span><input type="search" data-rw-channel-search data-rw-focus="channel-search" value="'+esc(channelQuery)+'" placeholder="Kanal, Signal oder Buchse suchen" aria-label="Input-Liste durchsuchen" autocomplete="off"></label>'+button('Nicht verbunden',{'data-rw-channel-filter':'unconnected'},{pressed:channelUnconnected})+'<span class="rw-channel-count">'+rows.length+' / '+allRows.length+'</span></div>';
      const content=rows.map(row=>{
        const number=nativeAux(row)?'<strong class="rw-channel-identity">AUX '+esc(row.x32.channel)+'</strong>':field('Kanalnummer',row.number,{'data-rw-channel-field':'number','data-rw-row':row.id,'data-rw-direction':'inputs'},{type:'number',min:1,max:999});
        const partner=row.stereoGroup?allRows.find(other=>other.id!==row.id&&other.stereoGroup===row.stereoGroup):null;
        const stereo=partner?'<small class="rw-channel-stereo">'+esc(row.mode==='Stereo R'?'R':'L')+' · Stereo mit '+(nativeAux(partner)?'AUX ':'CH ')+esc(partner.number??'—')+'</small>':'';
        const patch=row.stagebox?(box(row.stagebox)?.name||'Stagebox')+' · IN '+(row.stageboxPort||'—'):nativeDirect(row)?'Pult · IN '+directPort(row):nativeAux(row)?'AUX '+row.x32.channel:connected([row])?row.connector+' · Netzwerk':'Anschluss wählen';
        const insert=!readonly()&&row.number&&!nativeAux(row)&&(!partner||row.number<partner.number)?button('+',{'data-rw-insert-channel':row.number,'aria-label':'Kanal vor CH '+row.number+' einfügen','title':'Davor einfügen'},{mutation:true}):'';
        return '<tr data-rw-channel-row="'+esc(row.id)+'" data-expanded="'+(channelDetail===row.id)+'" data-changed="'+channelFlash.includes(row.id)+'"><td>'+number+'</td><td>'+field('Signalname',row.instrument,{'data-rw-channel-field':'instrument','data-rw-row':row.id,'data-rw-direction':'inputs'})+stereo+'</td><td>'+button(esc(patch)+' <span aria-hidden="true">'+(channelDetail===row.id?'▴':'▾')+'</span>',{'data-rw-channel-details':row.id,'aria-label':'Anschlüsse für '+row.instrument,'aria-expanded':String(channelDetail===row.id),'aria-controls':'rw-channel-detail-'+row.id},{className:'rw-channel-patch'})+'</td><td>'+insert+'</td></tr>'+(channelDetail===row.id?channelConnectionEditor(row):'');
      }).join('');
      return heading('Input-Liste',readonly()?'':button('+ Kanal',{'data-rw-insert-channel':'end','aria-label':'Kanal am Ende hinzufügen'},{mutation:true}))+actions+filters+(channelNotice?'<div class="rw-channel-notice" role="status">'+esc(channelNotice)+button('Rückgängig',{'data-rw-tool':'undo'},{mutation:true})+'</div>':'')+(rows.length?'<div class="rw-scene-table-scroll"><table class="rw-channel-list"><thead><tr><th>CH / AUX</th><th>Signal</th><th>Anschluss</th><th><span class="rw-visually-hidden">Kanal einfügen</span></th></tr></thead><tbody>'+content+'</tbody></table></div>':'<p class="rw-channel-empty">'+(allRows.length?'Keine passenden Kanäle. Suche oder Filter ändern.':'Noch keine Inputs. Füge einen Kanal hinzu oder importiere eine CSV- oder X32-Datei.')+'</p>')+'<p class="rw-channel-help">Belegte Kanalnummer = tauschen. + in der Zeile = davor einfügen und folgende Nummern verschieben.</p>';
    }

    function sceneView() {
      const inventory = sceneInventory();
      if (!inventory) return '<p class="rw-error" role="alert">' + esc(sceneError || 'Keine X32-Szene vorhanden.') + '</p>';
      const wizard = state.stage.x32Scene.wizard || {}, roleNames = {unspecified:'Noch offen',monitor:'Monitor',iem:'IEM',subgroup:'Subgruppe',fx:'Effektweg',line:'Line', 'fx-send':'Effektweg'};
      const inputRow = entry => state.routing.inputs.find(row => row.x32?.kind === entry.kind && row.x32.channel === entry.number);
      const outputRow = entry => state.routing.outputs.find(row => nativeOutput(row) && row.x32.endpoint === entry.id);
      const busRow = entry => state.routing.outputs.find(row => row.x32?.kind === 'bus' && row.x32.channel === entry.number);
      const names = new Map([...inventory.inputs,...inventory.buses,...inventory.matrices,...inventory.mains,...inventory.returns].map(entry => [entry.id, (entry.kind === 'channel' || entry.kind === 'aux') && inputRow(entry)?.instrument ? (entry.kind === 'channel' ? 'CH ' : 'Aux ') + entry.number + (inputRow(entry).number && inputRow(entry).number !== entry.number ? ' → CH ' + inputRow(entry).number + ' geplant' : '') + ' · ' + inputRow(entry).instrument : entry.kind === 'bus' && busRow(entry)?.instrument ? 'Bus ' + entry.number + ' · ' + busRow(entry).instrument : entry.label]));
      const matches = values => !sceneQuery || normalized(values.join(' ')).includes(normalized(sceneQuery));
      const text = value => esc(value || '—');
      const target = (row,assignment,direction) => {
        if (direction === 'inputs' && nativeDirect(row)) return 'Pult direkt · IN ' + directPort(row);
        const stagebox = row ? row.stagebox : assignment?.stagebox, port = row ? row.stageboxPort : assignment?.port;
        return stagebox && box(stagebox) ? box(stagebox).name + ' · ' + (direction === 'inputs' ? 'IN ' : 'OUT ') + (port || '—') : stagebox ? 'Stagebox nicht verfügbar' : 'Noch nicht zugeordnet';
      };
      const status = entry => entry.enabled === false ? 'aus' : entry.enabled === true ? 'an' : 'nicht angegeben';
      const level = entry => entry.level === '-oo' ? '−∞ dB' : entry.level !== null && entry.level !== undefined ? entry.level + ' dB' : 'Pegel nicht angegeben';
      const sendDetails = (sends,label='Sends',incoming=false) => !sends.length ? '—' : '<details class="rw-scene-sends"><summary>' + sends.length + ' ' + esc(label) + '</summary><ul>' + sends.map(send => '<li>' + text(names.get(incoming ? send.sourceId : send.destinationId) || send.sourceLabel || send.destinationId) + ' · ' + esc(status(send) + ' · ' + level(send) + (send.tap ? ' · ' + send.tap : '')) + '</li>').join('') + '</ul></details>';
      const table = (title,columns,rows,id) => '<section class="rw-scene-section" data-rw-scene-section="' + id + '"><h3>' + esc(title) + ' <span>' + rows.length + '</span></h3><div class="rw-scene-table-scroll" role="region" aria-label="' + esc(title) + '" tabindex="0"><table><thead><tr>' + columns.map(column => '<th scope="col">' + esc(column) + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + columns.length + '">Keine passenden Einträge.</td></tr>') + '</tbody></table></div></section>';
      const tr = (id,cells) => '<tr data-rw-scene-id="' + esc(id) + '">' + cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
      const inputs = inventory.inputs.flatMap(entry => {
        const row = inputRow(entry), assignment = (wizard.inputAssignments || []).find(item => item.inputId === entry.id), name = (row ? row.instrument : entry.name) || 'Ohne Namen', source = entry.sourceAddress?.label || 'Nicht aufgelöst';
        if (!matches([entry.label,name,source,target(row,assignment,'inputs')])) return [];
        return [tr(entry.id,[text((entry.kind === 'channel' ? 'CH ' : 'Aux ') + entry.number + (entry.kind === 'channel' && row?.number && row.number !== entry.number ? ' → CH ' + row.number + ' geplant' : '')),text(name),'<span class="rw-scene-resolution" data-resolved="' + String(entry.sourceAddress?.resolved === true) + '">' + text(source) + '</span>',text(entry.linkedWith ? 'Stereo mit ' + entry.linkedWith : 'Mono'),text(row ? target(row,assignment,'inputs') : 'Nicht übernommen'),sendDetails(entry.sends || [])])];
      });
      const channelPairs=new Map();
      const channels=new Map(analogRows().map(row=>[row.number,row]));
      for(let n=1;n<32;n+=2){
        const left=channels.get(n),right=channels.get(n+1);
        const imported=inventory.inputs.find(entry=>entry.id==='channel-'+n);
        const linked=left||right?left?.stereoGroup&&left.stereoGroup===right?.stereoGroup:imported?.linkedWith===n+1;
        if(linked){channelPairs.set('channel-'+n,n);channelPairs.set('channel-'+(n+1),n);}
      }
      function busSources(sources){
        const seen=new Set();
        return sources.flatMap(send=>{
          const first=channelPairs.get(send.sourceId);
          if(!first)return [send];
          if(seen.has(first))return [];
          seen.add(first);
          return [{...send,sourceId:'',sourceLabel:'CH '+first+'/'+(first+1)+' · Stereo'}];
        });
      }
      const buses = [...inventory.buses,...inventory.mains,...inventory.matrices].flatMap(entry => {
        const assignment = (wizard.busRoles || []).find(item => item.bus === entry.number), role = entry.kind === 'bus' ? roleNames[assignment?.role] || (entry.roles || []).map(role => roleNames[role] || role).join(' / ') || 'Noch offen' : entry.kind === 'main' ? 'Hauptsumme' : 'Matrix';
        const label = names.get(entry.id) || entry.label, destinations = [];
        if (entry.mix?.mainStereo) destinations.push('Main L/R');
        if (entry.mix?.mainMono) destinations.push('Main M/C');
        if (entry.fxSlots?.length) destinations.push(...entry.fxSlots.map(number => 'FX ' + number));
        const outputs = inventory.outputs.filter(output => output.source?.id === entry.id);
        if (outputs.length) destinations.push(...outputs.map(output => output.label));
        if (!matches([label,role,...destinations])) return [];
        const incoming = entry.kind === 'matrix' ? [...inventory.buses,...inventory.mains].flatMap(source => source.sends.filter(send => send.destinationId === entry.id).map(send => ({...send,sourceId:source.id}))) : entry.kind==='bus'?busSources(entry.sources||[]):entry.sources||[];
        const insert = entry.insert?.slot ? '<small class="rw-scene-extra">Insert FX ' + entry.insert.slot + esc(entry.insert.side) + ' · ' + esc(status(entry.insert)) + ' · ' + esc(entry.insert.position) + '</small>' : '';
        return [tr(entry.id,[text(label),text(role) + insert,text(entry.linkedWith ? 'Stereo mit ' + entry.linkedWith : entry.id === 'main-st' ? 'Stereo' : 'Mono'),sendDetails(incoming,'Quellen',true),text(destinations.join(', ')) + (entry.sends?.length ? sendDetails(entry.sends,'Matrix-Sends') : '')])];
      });
      const effects = inventory.fx.flatMap(entry => {
        const left = names.get(entry.left?.id) || entry.left?.label, right = names.get(entry.right?.id) || entry.right?.label, effectReturns = inventory.returns.filter(item => entry.returns.includes(item.id)), inserts = (entry.inserts || []).map(item => (names.get(item.targetId) || item.targetId) + ' · ' + item.side + ' · ' + status(item) + ' · ' + item.position);
        if (!matches(['FX ' + entry.number,entry.type,left,right,...inserts,...effectReturns.map(item => item.label)])) return [];
        const returns = effectReturns.map(item => '<div class="rw-scene-return"><strong>' + text('FX ' + entry.number + ' ' + item.side + (item.name ? ' · ' + item.name : '')) + '</strong><small>' + esc([item.mix.mainStereo ? 'Main L/R' : '',item.mix.mainMono ? 'Main M/C' : '',status(item.mix),level(item.mix)].filter(Boolean).join(' · ')) + '</small>' + sendDetails(item.sends) + '</div>').join('');
        return [tr(entry.id,[text('FX ' + entry.number),text(entry.type),text('L: ' + (left || 'offen') + ' · R: ' + (right || 'offen')),returns || '—',text(inserts.join('; '))])];
      });
      const outputs = inventory.outputs.flatMap(entry => {
        const row = outputRow(entry), assignment = (wizard.outputAssignments || []).find(item => item.outputId === entry.id), destination = row?.monitorReceiverName || row?.instrument || assignment?.destination || 'Noch offen', source = entry.source?.kind === 'main' ? entry.source.label : names.get(entry.source?.id) || entry.source?.label || 'Nicht aufgelöst';
        if (!matches([entry.label,source,destination,target(row,assignment,'outputs'),entry.block])) return [];
        return [tr(entry.id,[text(entry.label),'<span class="rw-scene-resolution" data-resolved="' + String(entry.resolved === true) + '">' + text(source) + '</span><small class="rw-scene-extra">' + text(inventory.outputSlots.find(slot => slot.id === entry.slotId)?.label || entry.block) + '</small>',text(entry.tap),text(entry.delay?.enabled ? entry.delay.ms + ' ms' : 'Aus'),text(destination),text(row || assignment ? target(row,assignment,'outputs') : 'Nicht übernommen')])];
      });
      const outputSlots = inventory.outputSlots.flatMap(entry => {
        const source = entry.source?.kind === 'main' ? entry.source.label : names.get(entry.source?.id) || entry.source?.label || 'Nicht aufgelöst', connections = inventory.outputs.filter(output => output.slotId === entry.id).map(output => output.label);
        if (!matches([entry.label,source,...connections])) return [];
        return [tr('slot-' + entry.id,[text(entry.label),'<span class="rw-scene-resolution" data-resolved="' + String(entry.source?.resolved === true) + '">' + text(source) + '</span>',text(entry.tap),text(entry.delay?.enabled ? entry.delay.ms + ' ms' : 'Aus'),text(connections.join(', ') || 'Kein aufgelöster Anschluss')])];
      });
      return heading('I/O-Liste der X32-Szene',readonly() ? '' : button('Zuordnung bearbeiten',{'data-rw-tool':'x32Scene'},{mutation:true})) + '<p class="rw-scene-intro">' + text(inventory.scene.name || state.stage.x32Scene.filename) + ' · Die Liste zeigt auch nicht übernommene Kanäle und Anschlüsse. Pegel und Send-Zustände stammen aus der Szene.</p><label class="rw-scene-search"><span>In der Szene suchen</span><input type="search" data-rw-scene-search data-rw-focus="scene-search" value="' + esc(sceneQuery) + '" placeholder="Kanal, Bus, FX oder Ausgang …"></label>' + (inventory.warnings.length ? '<details class="rw-scene-warnings"><summary>' + inventory.warnings.length + ' Hinweise zur Zuordnung</summary><ul>' + inventory.warnings.map(warning => '<li>' + esc(warning) + '</li>').join('') + '</ul></details>' : '') + table('Inputs',['Kanal','Name','Quelle am X32','Format','Stageplot-Zuordnung','Sends'],inputs,'inputs') + table('Busse, Main & Matrizen',['Signal','Verwendung','Format','Quellen','Ziele'],buses,'buses') + table('Effekte & Returns',['Slot','Effekttyp','Eingänge','Returns & Sends','Inserts'],effects,'fx') + table('Interne Output-Slots',['Slot','Signalquelle','Abgriff','Verzögerung','Zugeordnete Anschlüsse'],outputSlots,'output-slots') + table('Physische Ausgänge & Transportkanäle',['Anschluss','Signalquelle','Abgriff','Verzögerung','Ziel','Stageplot-Zuordnung'],outputs,'outputs');
    }

    function footer() {
      const saved = state.saveState || api.getSaveState?.();
      const label = readonly() ? 'Nur Ansicht' : typeof saved === 'string' ? saved : saved?.text || 'Lokaler Entwurf';
      const list = state.tab === 'outputs' ? monitors : sources, active = state.tab === 'outputs' ? activeMonitor : activeSource;
      const index = list.findIndex(item => item.id === active), next = list.length > 1 ? list[(index + 1) % list.length] : null;
      return '<footer class="rw-footer"><span class="rw-save-state"><span aria-hidden="true">' + (readonly() ? '◉' : '✓') + '</span>' + esc(label) + '</span>' + (!channelListOpen && (sceneOpen || state.tab === 'stageboxes') ? button('Patchliste exportieren',{'data-rw-export':'all'},{className:'rw-export'}) : !channelListOpen && next ? button((state.tab === 'outputs' ? 'Nächster Monitorweg' : 'Nächste Quelle') + ' <span aria-hidden="true">→</span>',{'data-rw-select':next.id},{className:'rw-primary'}) : '') + '</footer>';
    }

    function preserveFocus() {
      const active = host.ownerDocument.activeElement;
      if (!active || !host.contains(active)) return null;
      return {key:active.dataset?.rwFocus, attributes:active.matches('button') ? [...active.attributes].filter(attr => attr.name.startsWith('data-rw-')).map(attr => [attr.name,attr.value]) : null, row:active.dataset?.rwRow, start:active.selectionStart, end:active.selectionEnd};
    }
    function restoreFocus(saved) {
      if (!saved) return;
      let input = saved.key ? [...host.querySelectorAll('[data-rw-focus]')].find(element => element.dataset.rwFocus === saved.key) : saved.attributes?.length ? [...host.querySelectorAll('button')].find(element => saved.attributes.every(([name,value]) => element.getAttribute(name) === value)) : null;
      if (!input && saved.row) input = [...host.querySelectorAll('[data-rw-open]')].find(element => element.dataset.rwOpen === 'pickup-' + saved.row);
      if (!input) return;
      input.focus({preventScroll:true});
      if (saved.start !== null && typeof input.setSelectionRange === 'function') try { input.setSelectionRange(saved.start,saved.end); } catch (_) {}
    }
    function renderStage() {
      if (destroyed) return;
      const element = host.querySelector('[data-rw-stage]');
      if (element && element.getBoundingClientRect().width > 0) api.renderStage?.(element,highlighted.slice());
      if (typeof ResizeObserver !== 'undefined' && resizeTarget !== element) {
        stageObserver?.disconnect(); resizeTarget = element;
        if (element) { stageObserver = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (!destroyed && element.isConnected) api.renderStage?.(element,highlighted.slice()); }); }); stageObserver.observe(element); }
      }
    }
    function render() {
      if (destroyed) return;
      const previousTab=host.dataset.tab, outerScroller=host.closest('#sp-routing'), outerScroll=outerScroller?.scrollTop||0;
      if(previousTab)tabScrolls.set(previousTab,{main:host.querySelector('.rw-main')?.scrollTop||0,outer:outerScroll});
      const deviceScrolls=[...host.querySelectorAll('.sp-stagebox-device-scroll')].map(el=>el.scrollLeft);
      const focus = preserveFocus(), mainScroll = host.querySelector('.rw-main')?.scrollTop || 0, listScroll = host.querySelector('.rw-source-list')?.scrollTop || 0, outputScroll = host.querySelector('.rw-output-port-list')?.scrollTop || 0, flowScroll = host.querySelector('.rw-flow-scroll')?.scrollLeft || 0;
      state = api.getState() || {}; state.routing = state.routing || state.stage?.routing || {inputs:[],outputs:[]};
      localMixer=global.StageplotRoutingModel.localMixer(state.routing);
      panelInventory=global.StageplotRoutingModel.mixerInventory(state.routing,state.boxes||[]);
      if (!['inputs','outputs','stageboxes'].includes(state.tab)) state.tab = 'inputs';
      if (!state.stage?.x32Scene) sceneOpen = false;
      if (state.tab !== lastTab) { sceneOpen = false; query = ''; openCard = ''; diPickerRow = ''; lastTab = state.tab; error = ''; }
      groups(); highlighted = [];
      if(mixerProject!==state.projectId){expandedView=null;sourcePicker=null;mixerProject=state.projectId;mixerSignal=mixerDevice='';mixerChannel=1;mixerPort=bankEditor=null;addingBox=false;mixerTab='channels';}
      const mixerScroll=host.querySelector('.mx-scroll')?.scrollTop||0;
      const content = mixerOpen ? mixerView() : channelListOpen ? channelListView() : sceneOpen ? sceneView() : state.tab === 'stageboxes' ? stageboxView() : state.tab === 'outputs' ? monitorView() : sourcesView();
      const inlineChannelError = channelListOpen && content.includes('class="rw-channel-detail"');
      host.dataset.readonly = String(readonly()); host.dataset.tab = viewTab();
      host.innerHTML = header() + '<div class="rw-layout">' + (mixerOpen || sceneOpen || channelListOpen ? '' : sidebar()) + '<div class="rw-detail" id="sp-routing-detail-v2" role="tabpanel"><main class="rw-main">' + (error && !diPickerRow && !inlineChannelError ? '<p class="rw-error" role="alert">' + esc(error) + '</p>' : '') + content + '</main>' + (mixerOpen?'':footer()) + '</div></div>' + (diPickerRow ? diPicker() : '') + (mixerOpen&&sourcePicker&&!readonly()?sourcePickerView():'');
      host.querySelector('.rw-main').scrollTop = previousTab===viewTab()?mainScroll:(tabScrolls.get(viewTab())?.main||0);
      if(outerScroller)outerScroller.scrollTop = previousTab===viewTab()?outerScroll:(tabScrolls.get(viewTab())?.outer||0);
      if (host.querySelector('.rw-source-list')) host.querySelector('.rw-source-list').scrollTop = listScroll;
      if (host.querySelector('.rw-output-port-list')) host.querySelector('.rw-output-port-list').scrollTop = outputScroll;
      if (host.querySelector('.rw-flow-scroll')) host.querySelector('.rw-flow-scroll').scrollLeft = flowScroll;
      host.querySelectorAll('.sp-stagebox-device-scroll').forEach((el,i)=>{el.scrollLeft=deviceScrolls[i]||0;});
      if(host.querySelector('.mx-scroll'))host.querySelector('.mx-scroll').scrollTop=mixerScroll;
      const dialog = host.querySelector('[data-rw-di-dialog]');
      if (dialog) {
        dialog.showModal();
        dialog.addEventListener('cancel', event => {event.preventDefault();closeDiPicker();});
        if (focus?.attributes?.some(([name]) => name === 'data-rw-create-di' || name === 'data-rw-di-close')) restoreFocus(focus);
        else (dialog.querySelector('[aria-pressed="true"]') || dialog.querySelector('[data-rw-create-di]'))?.focus({preventScroll:true});
      } else restoreFocus(focus);
      restoreExpandedPanel(false);
      const picker=host.querySelector('.mx-picker');
      if(picker){
        picker.showModal();
        picker.addEventListener('cancel',event=>{event.preventDefault();closeSourcePicker();});
        (picker.querySelector('[data-rw-mixer-operation],[data-rw-mixer-pick]')||picker.querySelector('button')).focus({preventScroll:true});
      }
      restoreExpandedPanel(true);
      renderStage();
    }

    function onClick(event) {
      if(suppressClick&&event.detail){suppressClick=false;event.preventDefault();return;}
      if (event.target.matches('[data-rw-di-dialog]')) {
        const bounds = event.target.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDiPicker();
        return;
      }
      const target = event.target.closest('button'); if (!target || !host.contains(target) || target.disabled) return;
      if(target.dataset.rwPreamp){
        const {rwPreamp,device,model}=target.dataset;
        doAction({type:'setPreampPower',device,model,port:Number(rwPreamp),enabled:target.getAttribute('aria-pressed')!=='true'});
        const surface=host.querySelector('dialog.rw-panel-fullscreen[open]')||host.querySelector('dialog.mx-picker[open]')||host;
        [...surface.querySelectorAll('[data-rw-preamp]')].find(el=>el.dataset.device===device&&el.dataset.rwPreamp===rwPreamp)?.focus({preventScroll:true});
        return;
      }
      if (target.hasAttribute('data-panel-expand')) {expandPanel(target.closest('.rw-zoom-panel'));return;}
      if (target.dataset.fullDevice && expandedView) {
        const next=mixerDevices().find(device=>device.id===target.dataset.fullDevice);
        if(!next || next.id===expandedView.deviceId)return;
        expandedView.deviceId=next.id;
        expandedView.model=next.type;
        if(expandedView.picker)sourcePicker.deviceId=next.id;
        else {
          mixerOpen=true;
          mixerDevice=next.id;
          mixerPort=null;
        }
        render();
        host.querySelector('.rw-panel-fullscreen [data-full-device][aria-pressed="true"]')?.focus({preventScroll:true});
        return;
      }
      if (target.dataset.panelZoom) {zoomSurface(target);return;}
      const data = {...target.dataset}, clickedFocus = {attributes:[...target.attributes].filter(attr=>attr.name.startsWith('data-rw-')).map(attr=>[attr.name,attr.value])};
      if (pendingField) {const input = pendingField;pendingField = null;const saved = onChange({target:input});if(saved === false || error)return;}
      // WebKit does not focus clicked buttons. Keep the action in the keyboard
      // path before rendering replaces its node (and after any pending edit).
      restoreFocus(clickedFocus);
      if(Object.keys(data).some(key=>key.startsWith('rwMixer')||key==='rwBank'||key==='rwBankOption')){mixerClick(data);return;}
      if (data.rwTab) {selectTab(data.rwTab);return;}
      if (data.rwChannelFilter) {channelUnconnected=!channelUnconnected;render();return;}
      if (data.rwTools) {toolsOpen = !toolsOpen;render();return;}
      if (data.rwBoxLayout) {stageboxLayout = data.rwBoxLayout;render();return;}
      if (data.rwTool) {if(readonly() && !['pdf','xlsx'].includes(data.rwTool))return;doAction({type:data.rwTool,direction:state.tab === 'outputs' ? 'outputs' : 'inputs'});return;}
      if (data.rwSelect) { if (state.tab === 'stageboxes') {activeBox = data.rwSelect;activePort = null;} else if (state.tab === 'outputs') activeMonitor = data.rwSelect; else activeSource = data.rwSelect; openCard = ''; error = ''; render(); return; }
      if (data.rwPort) {activeBox = data.rwBox;activePort = {boxId:activeBox,direction:data.rwDirection,port:Number(data.rwPort)};openCard = '';render();return;}
      if (data.rwExport) {doAction({type:'exportPatch',direction:data.rwExport});return;}
      if(data.rwInsertChannel)return doAction({type:'insertChannel',at:data.rwInsertChannel});
      if(data.rwChannelDetails){
        const row=route(data.rwChannelDetails);if(!row)return;
        channelDetail=channelDetail===row.id?'':row.id;pickerBox=row.stagebox||'';openCard='';error='';render();
        [...host.querySelectorAll('[data-rw-channel-row] [data-rw-channel-details]')].find(button=>button.dataset.rwChannelDetails===row.id)?.focus({preventScroll:true});return;
      }
      if (data.rwSourceOutputs) {openCard = openCard === 'source-outputs-' + data.rwSourceOutputs ? '' : 'source-outputs-' + data.rwSourceOutputs;error = '';render();host.querySelector('.rw-source-output-editor')?.scrollIntoView({block:'nearest',inline:'nearest'});return;}
      if (readonly()) return;
      if (data.rwSourceEditor) return doAction({type:'openSourceEditor',sourceId:data.rwSourceEditor});
      if (data.rwSourceOutputStep) return doAction({type:'setSourceOutputs',sourceId:data.rwSource,fields:{count:state.sourceOutputs[data.rwSource].count + Number(data.rwSourceOutputStep)}});
      if (data.rwSourceOutputConnector) return doAction({type:'setSourceOutputs',sourceId:data.rwSource,fields:{connector:data.rwSourceOutputConnector}});
      if (data.rwSourceOutputStereo) return doAction({type:'setSourceOutputStereo',sourceId:data.rwSource,start:Number(data.rwSourceOutputStereo),linked:data.rwValue === 'true'});
      if (data.rwSourceOutputUsed) return doAction({type:'setSourceOutputUsed',sourceId:data.rwSource,port:Number(data.rwSourceOutputUsed),used:data.rwValue === 'true'});
      if (data.rwDiClose) {closeDiPicker();return;}
      if (data.rwDiChoose) {openDiPicker(data.rwDiChoose,target,true);return;}
      if (data.rwDiNew) {diPickerDevices = false;diPickerNew = true;error = '';render();return;}
      if (data.rwUseDi) {const result = doAction({type:'assignDi',rowId:data.rwRow,rowIds:sharedDiRows(route(data.rwRow)).map(row => row.id),deviceId:data.rwUseDi,channel:Number(data.rwDiChannel),autoPair:true});if(result !== false)closeDiPicker();return;}
      if (data.rwDiOpen) {openDiPicker(data.rwDiOpen,target);return;}
      if (data.rwOpen) {openCard = openCard === data.rwOpen ? '' : data.rwOpen;pickerBox = '';micQuery = '';error = '';render();if(openCard.startsWith('pickup-'))host.querySelector('[data-rw-mic-search]')?.focus({preventScroll:true});return;}
      if (data.rwPickerBox) {pickerBox = data.rwPickerBox;render();return;}
      if (data.rwPlayback) return doAction({type:'openPlayback',sourceId:data.rwPlayback});
      if (data.rwAddPickup) return doAction({type:'addPickup',sourceId:data.rwAddPickup,kind:'Mic'});
      if (data.rwFirstPickup) return doAction({type:'addPickup',sourceId:data.rwSource,kind:data.rwFirstPickup});
      if (data.rwRemovePickup) return doAction({type:'removePickup',rowId:data.rwRemovePickup,rowIds:sharedDiRows(route(data.rwRemovePickup)).map(row => row.id)},{close:true});
      if (data.rwPickup) {if(pickupKind(route(data.rwRow)) === data.rwPickup)return;openCard = '';return doAction({type:'setPickup',rowId:data.rwRow,rowIds:sharedDiRows(route(data.rwRow)).map(row => row.id),kind:data.rwPickup});}
      if (data.rwMic !== undefined) return doAction({type:'setPickup',rowId:data.rwRow,kind:'Mic',microphone:data.rwMic,phantom:data.rwPhantom === 'true'},{close:true});
      if (data.rwCreateDi) {
        if (!diPickerNew && device(route(data.rwRow)?.diDeviceId)?.modelId === data.rwCreateDi) {closeDiPicker();return;}
        const result = doAction({type:'createDi',rowId:data.rwRow,rowIds:sharedDiRows(route(data.rwRow)).map(row => row.id),modelId:data.rwCreateDi,newDevice:diPickerNew});
        if (result !== false) closeDiPicker();
        return result;
      }
      if (data.rwDiStereo) return doAction({type:'connectStereoDi',rowId:data.rwDiStereo,deviceId:data.rwDiStereoDevice},{close:true});
      if (data.rwDiDevice) {if(route(data.rwRow)?.diDeviceId === data.rwDiDevice && Number(route(data.rwRow)?.diChannel) === Number(data.rwDiChannel))return;return doAction({type:'assignDi',rowId:data.rwRow,rowIds:sharedDiRows(route(data.rwRow)).map(row => row.id),deviceId:data.rwDiDevice,channel:Number(data.rwDiChannel)});}
      if (data.rwDeviceValue) return doAction({type:'updateDi',deviceId:data.rwDevice,fields:{[data.rwDeviceValue]:data.rwDeviceValue === 'channels' ? Number(data.rwValue) : data.rwDeviceValue === 'active' ? data.rwValue === 'true' : data.rwValue}});
      if (data.rwPatch) return doAction({type:'patch',direction:data.rwDirection,rowIds:splitIds(data.rwRows),exactRows:data.rwExactRows === 'true',boxId:data.rwBox,port:Number(data.rwPatch)},{close:true});
      if (data.rwUnpatch) return doAction({type:'unpatch',direction:data.rwDirection,rowIds:splitIds(data.rwUnpatch),exactRows:data.rwExactRows === 'true'},{close:true});
      if (data.rwTogglePhantom) {const row = route(data.rwTogglePhantom);if(row)return doAction({type:'editChannel',direction:'inputs',rowId:row.id,fields:{phantom:!row.phantom}});}
      if (data.rwConnector) {if(route(data.rwRow)?.connector === data.rwConnector)return;return doAction({type:'editChannel',direction:'inputs',rowId:data.rwRow,fields:{connector:data.rwConnector}});}
      if (data.rwLink) return doAction({type:'linkStereo',rowIds:splitIds(data.rwLink)});
      if (data.rwUnlink) return doAction({type:'unlinkStereo',rowIds:splitIds(data.rwUnlink)});
      if (data.rwMonitorFormat) return doAction({type:'setMonitorFormat',rowIds:splitIds(data.rwRows),format:data.rwMonitorFormat});
      if (data.rwMonitorKind) return doAction({type:'editMonitor',rowIds:splitIds(data.rwRows),fields:{outputKind:data.rwMonitorKind}});
      if (data.rwMonitorValue) return doAction({type:'editMonitor',rowIds:splitIds(data.rwRows),fields:{[data.rwMonitorValue]:data.rwMonitorValue === 'monitorActive' ? data.rwValue === 'true' : data.rwValue}});
      if (data.rwAddMonitor) return doAction({type:'addMonitor',kind:data.rwAddMonitor},{close:true});
      if (data.rwAddBox) return doAction({type:'addStagebox',objectType:data.rwAddBox},{close:true});
      if (data.rwCombo !== undefined) return doAction({type:'editStagebox',boxId:data.rwBox,fields:{comboJacks:data.rwCombo === 'true'}});
    }

    function onInput(event) {
      if (event.target.matches('[data-rw-channel-search]')) {channelQuery=event.target.value;render();}
      if (event.target.matches('[data-rw-scene-search]')) {sceneQuery = event.target.value;render();}
      if (event.target.matches('[data-rw-search]')) {query = event.target.value;render();}
      if (event.target.matches('[data-rw-mic-search]')) {micQuery = event.target.value;const row = route(event.target.dataset.rwRow);if(row){const panel = host.querySelector('[data-rw-mic-options]');if(panel)panel.innerHTML = microphoneChoices(row);}}
    }
    function onPointerDown(event) {
      const active = host.ownerDocument.activeElement;
      if (!readonly() && event.target.closest('button') && active && host.contains(active) && active.matches('input:not([type="search"]),textarea') && active.value !== active.defaultValue) {
        // Commit the edited field and the clicked action together; replacing the DOM
        // on blur otherwise consumes the first click on a neighbouring card.
        pendingField = active;event.preventDefault();
      }
    }
    function onChange(event) {
      const input = event.target, data = input.dataset; if (readonly()) return;
      if (input.validity && !input.validity.valid) { input.reportValidity(); return false; }
      if (data.rwSourceOutputCount) return doAction({type:'setSourceOutputs',sourceId:data.rwSourceOutputCount,fields:{count:Number(input.value)}});
      if (data.rwSourceOutputAlias) return doAction({type:'setSourceOutputAlias',sourceId:data.rwSource,port:Number(data.rwSourceOutputAlias),value:input.value});
      if (data.rwSourceField) return doAction({type:'editSource',sourceId:data.rwSource,fields:{[data.rwSourceField]:input.value}});
      if (data.rwChannelField) {
        const value=data.rwChannelField === 'number' ? input.value === '' ? null : Number(input.value) : input.value;
        // Tab commits before the native blur/change event. Repeated delivery
        // must not create a second history entry for the same channel value.
        if(route(data.rwRow,data.rwDirection)?.[data.rwChannelField]===value){if(error){error='';render();}return;}
        return doAction({type:'editChannel',direction:data.rwDirection,rowId:data.rwRow,fields:{[data.rwChannelField]:value}});
      }
      if (data.rwDeviceField) return doAction({type:'updateDi',deviceId:data.rwDevice,fields:{[data.rwDeviceField]:input.value}});
      if (data.rwMonitorField) return doAction({type:'editMonitor',rowIds:splitIds(data.rwRows),fields:{[data.rwMonitorField]:input.value}});
      if (data.rwBoxField) return doAction({type:'editStagebox',boxId:data.rwBox,fields:{[data.rwBoxField]:input.value}});
      if (data.rwNotes) return doAction({type:data.rwDirection === 'outputs' ? 'editMonitor' : 'editChannel',direction:data.rwDirection,rowId:splitIds(data.rwNotes)[0],rowIds:splitIds(data.rwNotes),fields:{notes:input.value}});
    }
    function onKeydown(event) {
      if(socketDrag&&event.key==='Escape'){suppressClick=true;endSocketDrag();event.preventDefault();return;}
      if(drag?.active&&event.key==='Escape'){event.preventDefault();suppressClick=true;finishDrag();return;}
      if(sourcePicker&&event.target.closest('.mx-picker')){event.stopPropagation();return;}
      if (event.key === 'Tab' && event.target.matches('[data-rw-source-output-count],[data-rw-source-output-alias],[data-rw-channel-field]') && (event.target.value !== event.target.defaultValue || error && event.target.matches('[data-rw-channel-field]'))) {
        // Save before native Tab navigation: replacing the focused input on blur
        // would otherwise leave the browser with a detached navigation anchor.
        event.preventDefault();
        const key = event.target.dataset.rwFocus, result = onChange({target:event.target});
        if (result === false || error) return;
        const controls = [...host.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')].filter(element => element.getClientRects().length), index = controls.findIndex(element => element.dataset.rwFocus === key);
        if (index >= 0) (controls[index + (event.shiftKey ? -1 : 1)] || controls[index]).focus();
        return;
      }
      if (diPickerRow) {
        event.stopPropagation();
        if (event.key === 'Escape') {event.preventDefault();closeDiPicker();}
        if (event.key === 'Tab') {
          const controls = [...host.querySelectorAll('[data-rw-di-dialog] button:not(:disabled)')], active = host.ownerDocument.activeElement;
          if (controls.length) {
            event.preventDefault();
            const index = controls.indexOf(active), next = index < 0 ? event.shiftKey ? controls.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
            controls[next].focus();
          }
        }
        return;
      }
      if (event.target.matches('[data-rw-tab]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        const choices = tabs().map(([tab]) => tab), current = choices.indexOf(viewTab()), next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : choices.length - 1)) % choices.length;
        event.preventDefault();selectTab(choices[next]);host.querySelector('[data-rw-tab="' + choices[next] + '"]')?.focus();return;
      }
      if(event.key==='Escape'&&channelListOpen&&channelDetail){const id=channelDetail;channelDetail='';error='';render();[...host.querySelectorAll('[data-rw-channel-row] [data-rw-channel-details]')].find(button=>button.dataset.rwChannelDetails===id)?.focus({preventScroll:true});event.stopPropagation();return;}
      if (event.key === 'Escape' && openCard) {const source = openCard.startsWith('source-outputs-') ? openCard.slice('source-outputs-'.length) : '';openCard = '';error = '';render();if(source)[...host.querySelectorAll('[data-rw-source-outputs]')].find(button => button.dataset.rwSourceOutputs === source)?.focus({preventScroll:true});event.stopPropagation();}
      if (event.key === 'Enter' && event.target.matches('input:not([type="search"])')) {event.preventDefault();event.target.blur();}
    }
    dragEvents.forEach(type=>host.addEventListener(type,mixerDrag));
    host.addEventListener('click',onClick); host.addEventListener('pointerdown',onPointerDown); host.addEventListener('input',onInput); host.addEventListener('change',onChange); host.addEventListener('keydown',onKeydown);
    return {
      render,
      selectX32() {mixerOpen=false;channelListOpen = false;sceneOpen = true;render();},
      openSourceOutputs(id) {mixerOpen=false;channelListOpen = false;sceneOpen = false;activeSource = id;openCard = 'source-outputs-' + id;const flow = host.querySelector('.rw-flow-scroll');if(flow)flow.scrollLeft = 0;render();host.querySelector('.rw-source-output-editor')?.scrollIntoView({block:'nearest',inline:'nearest'});host.querySelector('[data-rw-source-output-count]')?.focus({preventScroll:true});},
      selectSource(id) {mixerOpen=false;channelListOpen = false;sceneOpen = false;if(state?.tab === 'outputs')activeMonitor = monitors.find(group => group.id === id || group.object?.id === id || group.rows.some(row => row.id === id || sourceId(row) === id))?.id || id;else activeSource = sources.find(group => group.id === id || group.rows.some(row => row.id === id))?.id || id;openCard = '';render();},
      selectStagebox(id,direction,port) {mixerOpen=false;channelListOpen = false;sceneOpen = false;activeBox = id;activePort = direction && port ? {boxId:id,direction,port:Number(port)} : null;openCard = '';render();},
      destroy() {endSocketDrag();finishDrag();dragEvents.forEach(type=>host.removeEventListener(type,mixerDrag));destroyed = true;stageObserver?.disconnect();if(frame)cancelAnimationFrame(frame);host.removeEventListener('click',onClick);host.removeEventListener('pointerdown',onPointerDown);host.removeEventListener('input',onInput);host.removeEventListener('change',onChange);host.removeEventListener('keydown',onKeydown);host.replaceChildren();}
    };
  }
  global.StageplotRoutingWorkspace = {create};
  if (typeof module !== 'undefined' && module.exports) module.exports = {create};
})(typeof window !== 'undefined' ? window : globalThis);
