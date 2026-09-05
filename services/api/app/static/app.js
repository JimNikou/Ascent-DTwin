let twins = [], selected = null, chart = null, timer = null;
const $ = (id) => document.getElementById(id);

// ---- toast notifications
function toast(msg, type='info'){
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 300); }, 3200);
}

async function api(path, opts={}) {
  const r = await fetch(path, {headers:{'Content-Type':'application/json'}, ...opts});
  if(!r.ok){ const t = await r.text(); throw new Error(t||r.statusText); }
  return r.json();
}

async function refreshHealth(){
  try{
    const h = await api('/api/health');
    setDot('api', h.api==='up'); $('st-api').textContent = h.api;
    setDot('mqtt', h.mqtt==='up'); $('st-mqtt').textContent = h.mqtt;
    setDot('influx', String(h.influxdb).startsWith('up')); $('st-influx').textContent = h.influxdb;
  }catch{ setDot('api',false); }
}
function setDot(name, up){ $('dot-'+name).className = 'dot ' + (up?'up':'down'); }

async function loadTwins(){
  // reset the search filter so newly created twins are always visible
  $('search').value = '';
  $('search-clear').style.display = 'none';
  $('twin-list').innerHTML = '<div class="loading">Loading twins…</div>';
  $('cards').innerHTML = '<div class="loading">Loading…</div>';
  try{
    twins = await api('/api/twins');
  }catch(e){
    toast('Failed to load twins: ' + e.message, 'error');
    twins = [];
  }
  if(!selected || !twins.find(t=>t.id===selected.id)){
    selected = twins[0] || null;
  } else {
    selected = twins.find(t=>t.id===selected.id);
  }
  $('lib-title').textContent = `Twin Library (${twins.length})`;
  try{ renderList(); }catch(e){ console.error('renderList', e); }
  try{ renderCards(); }catch(e){ console.error('renderCards', e); }
  try{ renderDetail(); }catch(e){ console.error('renderDetail', e); }
  startLive();
}

function filtered(){
  const q = ($('search').value||'').toLowerCase();
  return twins.filter(t => (t.name+t.id+(t.description||'')).toLowerCase().includes(q));
}

function renderList(){
  const el = $('twin-list'); el.innerHTML='';
  const list = filtered();
  if(!list.length){
    el.innerHTML = twins.length
      ? `<div class="empty">No twins match "<b>${esc($('search').value)}</b>".<br/><button class="btn small" onclick="document.getElementById('search-clear').click()">Clear search</button></div>`
      : `<div class="empty">No twins yet.<br/><button class="btn small" onclick="openModal(null)">Create Twin</button></div>`;
    return;
  }
  list.forEach(t=>{
    const d = document.createElement('div');
    d.className = 'twin-item' + (selected&&selected.id===t.id?' active':'');
    d.innerHTML = `<b>${esc(t.name)}</b><span>${esc(t.id)} · ${esc(t.asset_type||'')}</span>`;
    d.onclick = ()=>{ selected=t; renderList(); renderCards(); renderDetail(); startLive(); };
    el.appendChild(d);
  });
}

function renderCards(){
  const el = $('cards'); el.innerHTML='';
  const list = filtered();
  if(!list.length){
    el.innerHTML = twins.length
      ? `<div class="card empty-card"><h3>No matches</h3><p>No twins match your search.</p><button class="btn" onclick="document.getElementById('search-clear').click()">Clear search</button></div>`
      : `<div class="card empty-card"><h3>No twins yet</h3><p>Create your first digital twin to start collecting live telemetry.</p><button class="btn" onclick="openModal(null)">New Twin</button></div>`;
    return;
  }
  list.forEach(t=>{
    const d = document.createElement('div');
    d.className='card';
    d.innerHTML = `<h3>${esc(t.name)}</h3><p>${esc(t.description||'')}</p>
      <div class="meta"><span class="tag">${esc(t.asset_type||'')}</span><span class="tag">${esc(t.location||'')}</span><span class="tag">${esc(t.status||'active')}</span></div>
      <div class="topic">${esc(t.mqtt_topic||'')}</div>
      <div class="row" style="margin-top:10px">
        <button class="btn small" data-act="view">View</button>
        <button class="btn small ghost" data-act="edit">Edit</button>
        <button class="btn small ghost" data-act="dup">Duplicate</button>
      </div>`;
    d.querySelector('[data-act=view]').onclick=()=>{selected=t;renderList();renderDetail();startLive();window.scrollTo({top:0,behavior:'smooth'});};
    d.querySelector('[data-act=edit]').onclick=()=>openModal(t);
    d.querySelector('[data-act=dup]').onclick=async()=>{
      try{
        await api('/api/twins',{method:'POST',body:JSON.stringify({name:t.name+' copy',description:t.description,asset_type:t.asset_type,location:t.location,fields:t.fields})});
        toast(`Duplicated "${t.name}"`, 'success');
        await loadTwins();
      }catch(e){ toast('Duplicate failed: '+e.message, 'error'); }
    };
    el.appendChild(d);
  });
}

// populate the live-field dropdown from the selected twin's sensors
function populateFields(){
  const sel = $('live-field');
  if(!sel) return;
  const prev = sel.value;
  const fields = (selected && selected.fields && selected.fields.length)
    ? selected.fields
    : ['temperature','humidity','pressure','co2'];
  sel.innerHTML = fields.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
  if(fields.includes(prev)) sel.value = prev;
}

async function renderDetail(){
  populateFields();
  const el = $('detail');
  if(!selected){ el.innerHTML = `<div class="card empty-card"><h3>No twin selected</h3><p>Select a twin from the library or create a new one to view live telemetry.</p><button class="btn" onclick="openModal(null)">New Twin</button></div>`; return; }
  const t = selected;
  if(chart){ chart.destroy(); chart = null; }   // canvas is about to be replaced
  el.innerHTML = `<div class="card">
    <div class="detail-head">
      <h3>${esc(t.name)} <span class="twin-id">/${esc(t.id)}</span></h3>
      <button class="btn small ghost" id="d-edit">Edit</button>
      <button class="btn small ghost" id="d-graf">Grafana</button>
      <button class="btn small danger" id="d-del">Delete</button>
    </div>
    <p>${esc(t.description||'')}</p>
    <div class="meta"><span class="tag">${esc(t.asset_type)}</span><span class="tag">${esc(t.location)}</span><span class="tag">${esc(t.status||'active')}</span>${(t.fields||[]).map(f=>`<span class="tag sensor">${esc(f)}</span>`).join('')}</div>
    <div class="kpis" id="kpis"></div>
    <div class="chart-wrap"><div class="chart-box"><canvas id="live"></canvas></div>
      <div class="chart-meta">
        <span id="live-meta">Waiting for telemetry&hellip;</span>
        <span style="flex:1"></span>
        <span>MQTT: <code id="d-topic">${esc(t.mqtt_topic)}</code> &middot; HTTP POST /api/twins/${esc(t.id)}/telemetry</span>
      </div>
    </div>
  </div>`;
  $('d-edit').onclick=()=>openModal(t);
  $('d-graf').onclick=()=>window.open('http://localhost:3000','_blank');
  $('d-del').onclick=()=>armDelete($('d-del'), 'Delete', async()=>{
    try{
      await api('/api/twins/'+t.id,{method:'DELETE'}); selected=null;
      toast(`Deleted "${t.name}"`, 'success');
    }catch(e){ toast('Delete failed: '+e.message, 'error'); }
    await loadTwins();   // always refresh the UI so the twin disappears immediately
  });
  await updateLive(true);
}

function showChartEmpty(){
  const ctx = $('live'); if(!ctx) return;
  const box = ctx.parentNode;
  if(chart){ chart.destroy(); chart = null; }
  ctx.style.display = 'none';
  let es = $('live-empty');
  if(!es){
    es = document.createElement('div');
    es.id = 'live-empty';
    es.className = 'chart-empty';
    es.innerHTML = `<div><b>No telemetry yet</b><p>This twin has no data. Generate synthetic data or flash an ESP32 to start streaming.</p><button class="btn small" id="btn-sim-inline">Generate Synthetic Data</button></div>`;
    box.appendChild(es);
    es.querySelector('#btn-sim-inline').onclick = ()=>$('btn-sim').click();
  }
  es.style.display = 'flex';
}
function showChart(){
  const ctx = $('live'); if(!ctx) return;
  ctx.style.display = 'block';
  const es = $('live-empty'); if(es) es.style.display = 'none';
}

async function updateLive(first=false){
  if(!selected) return;
  const field = $('live-field').value;
  try{
    const pts = await api(`/api/twins/${selected.id}/telemetry?limit=100`);
    const labels = pts.map(p=>new Date(p.time).toLocaleTimeString());
    const vals = pts.map(p=>Number(p[field] ?? NaN));
    const last = pts[pts.length-1] || {};
    // KPIs — always render 4 slots so the layout height never changes
    const k = $('kpis');
    if(k){
      const show = ['temperature','humidity','pressure','co2'].filter(f=>last[f]!==undefined);
      const fields = (show.length?show:Object.keys(last).filter(x=>x!=='time')).slice(0,4);
      const cells = [];
      for(let i=0;i<4;i++){
        const f = fields[i];
        cells.push(f ? `<div class="kpi"><small>${f}</small><b>${last[f] ?? '—'}</b></div>`
                     : `<div class="kpi"><small>&nbsp;</small><b>—</b></div>`);
      }
      k.innerHTML = cells.join('');
    }
    const m = $('live-meta');
    if(m) m.textContent = pts.length ? `${pts.length} points &middot; last ${labels[labels.length-1]||''}` : 'No telemetry yet. The synthetic generator feeds esp32-demo every 2s; flash an ESP32 for live data.';
    const ctx = $('live'); if(!ctx) return;
    if(!pts.length){ showChartEmpty(); return; }
    showChart();
    if(chart){
      // update in place — no destroy/recreate, no layout shift, no scroll jump
      chart.data.labels = labels;
      chart.data.datasets[0].label = field;
      chart.data.datasets[0].data = vals;
      chart.update('none');
    } else {
      chart = new Chart(ctx, {type:'line',
        data:{labels, datasets:[{label:field, data:vals, borderColor:'#0969da', backgroundColor:'rgba(9,105,218,.10)', fill:true, tension:.3, pointRadius:0, borderWidth:1.5}]},
        options:{responsive:true, maintainAspectRatio:false,
          plugins:{legend:{labels:{color:'#57606a', boxWidth:12, font:{size:11}}}},
          scales:{x:{ticks:{color:'#8b949e',maxTicksLimit:8,font:{size:11}}, grid:{color:'#eef0f3'}}, y:{ticks:{color:'#8b949e',font:{size:11}}, grid:{color:'#eef0f3'}}}}});
    }
  }catch(e){ console.warn(e); }
}

function startLive(){
  if(timer) clearInterval(timer);
  const tick = ()=>{ if($('live-toggle').checked) updateLive(); };
  timer = setInterval(tick, 2000);
}

// ---- modal CRUD
let editing = null;
function openModal(t=null){
  editing = t;
  resetDeleteBtn();
  $('modal-title').textContent = t ? `Edit ${t.name}` : 'New Twin';
  $('f-name').value = t?.name||''; $('f-desc').value=t?.description||'';
  $('f-type').value=t?.asset_type||'esp32.sensor'; $('f-location').value=t?.location||'IHU Lab';
  $('f-topic').value=t?.mqtt_topic||''; $('f-fields').value=(t?.fields||['temperature','humidity']).join(',');
  $('modal-delete').style.display = t?'':'none';
  $('modal-back').classList.add('open');
}
function closeModal(){ $('modal-back').classList.remove('open'); editing=null; }

// ---- two-step delete confirmation (no native confirm() — can be blocked)
let delArmed = null, delTimer = null;
function armDelete(btn, label, fn){
  if(delArmed !== btn){
    delArmed = btn;
    btn.textContent = 'Confirm Delete?';
    btn.classList.add('armed');
    delTimer = setTimeout(()=>{ btn.textContent = label; btn.classList.remove('armed'); delArmed = null; }, 3000);
    return;
  }
  clearTimeout(delTimer); delArmed = null;
  btn.textContent = label; btn.classList.remove('armed');
  fn();
}
function resetDeleteBtn(){
  if(delArmed){ clearTimeout(delTimer); delArmed.textContent='Delete'; delArmed.classList.remove('armed'); delArmed=null; }
}

async function saveModal(){
  const body = {
    name:$('f-name').value, description:$('f-desc').value,
    asset_type:$('f-type').value, location:$('f-location').value,
    mqtt_topic:$('f-topic').value||undefined,
    fields:$('f-fields').value.split(',').map(s=>s.trim()).filter(Boolean)
  };
  if(!body.name.trim()){ toast('Name is required', 'error'); return; }
  try{
    if(editing) await api('/api/twins/'+editing.id,{method:'PUT',body:JSON.stringify(body)});
    else {
      const created = await api('/api/twins',{method:'POST',body:JSON.stringify(body)});
      selected = created;   // select the new twin so its detail + sensors show immediately
    }
    toast(editing ? `Updated "${body.name}"` : `Created "${body.name}"`, 'success');
    closeModal(); await loadTwins();
  }catch(e){ toast('Save failed: '+e.message, 'error'); }
}

function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ---- ESP32 modal
function espSnippet(){
  const t = selected || {id:'esp32-demo', mqtt_topic:'ascent/esp32-demo/telemetry'};
  return `#include <WiFi.h>\n#include <PubSubClient.h>\n// ID: ${t.id}\nconst char* WIFI_SSID="YOUR_WIFI";\nconst char* WIFI_PASS="YOUR_PASS";\nconst char* MQTT_HOST="YOUR_PC_IP"; // docker host IP, port 1883\nconst char* TOPIC="${t.mqtt_topic||('ascent/'+t.id+'/telemetry')}";\nWiFiClient esp; PubSubClient mqtt(esp);\nvoid setup(){ Serial.begin(115200); WiFi.begin(WIFI_SSID,WIFI_PASS);\n while(WiFi.status()!=WL_CONNECTED) delay(500);\n mqtt.setServer(MQTT_HOST,1883); }\nvoid loop(){ if(!mqtt.connected()) mqtt.connect("esp32-${t.id}");\n float temp=22+random(0,300)/100.0; float hum=45+random(0,1000)/100.0;\n char buf[128]; snprintf(buf,sizeof(buf),"{{\\"temperature\\":%.2f,\\"humidity\\":%.2f}}",temp,hum);\n mqtt.publish(TOPIC,buf); delay(2000); }`;
}

$('btn-new').onclick=()=>openModal(null);
$('modal-cancel').onclick=closeModal;
$('modal-save').onclick=()=>saveModal();
$('modal-delete').onclick=()=>{ if(!editing) return; const id = editing.id, name = editing.name; armDelete($('modal-delete'), 'Delete', async()=>{
  try{
    await api('/api/twins/'+id,{method:'DELETE'}); closeModal(); selected=null;
    toast(`Deleted "${name}"`, 'success');
  }catch(e){ toast('Delete failed: '+e.message, 'error'); }
  await loadTwins();   // always refresh the UI so the twin disappears immediately
}); };
$('btn-refresh').onclick=()=>{refreshHealth();loadTwins();};
$('search').oninput=()=>{
  $('search-clear').style.display = $('search').value ? 'block' : 'none';
  renderList(); renderCards();
};
$('search-clear').onclick=()=>{ $('search').value=''; $('search-clear').style.display='none'; renderList(); renderCards(); };
$('live-field').onchange=()=>updateLive(true);
$('btn-sim').onclick=async()=>{ if(!selected) return toast('Select a twin first', 'error');
  try{
    const r = await api(`/api/twins/${selected.id}/simulate?n=30`,{method:'POST'});
    toast(`Injected ${r.inserted} synthetic points`, 'success'); updateLive(true);
  }catch(e){ toast('Simulate failed: '+e.message, 'error'); } };
$('btn-esp32').onclick=()=>{ $('esp-code').textContent=espSnippet(); $('esp-back').classList.add('open'); };
$('esp-close').onclick=()=>$('esp-back').classList.remove('open');
$('esp-copy').onclick=()=>{ navigator.clipboard.writeText($('esp-code').textContent); toast('Snippet copied to clipboard', 'success'); };
document.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>window.open(b.dataset.link,'_blank'));

refreshHealth(); loadTwins(); setInterval(refreshHealth,5000);
