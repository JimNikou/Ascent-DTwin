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
    setDot('api', h.api==='up');
    setDot('mqtt', h.mqtt==='up');
    setDot('influx', String(h.influxdb).startsWith('up'));
  }catch{ setDot('api',false); }
}
function setDot(name, up){ $('dot-'+name).className = 'st-dot ' + (up?'up':'down'); }

// ---- page navigation
let currentPage = 'dashboard';
function showPage(name){
  currentPage = name;
  document.querySelectorAll('.page').forEach(p=>p.style.display = p.id==='page-'+name ? 'block' : 'none');
  document.querySelectorAll('.navpage').forEach(b=>b.classList.toggle('active', b.dataset.page===name));
  if(name==='dashboard') renderDashboard();
  if(name==='library') loadTwins();
}

async function renderDashboard(){
  try{
    const [twins, health, activity] = await Promise.all([
      api('/api/twins'), api('/api/health'), api('/api/activity?limit=30')
    ]);
    const healthy = twins.filter(t=>t.health?.status==='healthy').length;
    const degraded = twins.filter(t=>t.health?.status==='degraded').length;
    const critical = twins.filter(t=>t.health?.status==='critical').length;
    const anomalies = twins.reduce((s,t)=>s+(t.health?.anomaly_count||0),0);
    const points = twins.reduce((s,t)=>s+(t.health?.points||0),0);
    $('dash-stats').innerHTML = `
      <div class="stat"><small>Twins</small><b>${twins.length}</b></div>
      <div class="stat s-healthy"><small>Healthy</small><b class="h-healthy">${healthy}</b></div>
      <div class="stat s-degraded"><small>Degraded</small><b class="h-degraded">${degraded}</b></div>
      <div class="stat s-critical"><small>Critical</small><b class="h-critical">${critical}</b></div>
      <div class="stat"><small>Anomalies (window)</small><b>${anomalies.toLocaleString()}</b></div>
      <div class="stat"><small>Telemetry points</small><b>${points.toLocaleString()}</b></div>`;
    $('dash-services').innerHTML = `
      <div class="svc"><span class="dot ${health.api==='up'?'up':'down'}"></span> API <b>${health.api}</b></div>
      <div class="svc"><span class="dot ${health.mqtt==='up'?'up':'down'}"></span> MQTT <b>${health.mqtt}</b></div>
      <div class="svc"><span class="dot ${String(health.influxdb).startsWith('up')?'up':'down'}"></span> InfluxDB <b>${health.influxdb}</b></div>`;
    $('dash-activity').innerHTML = activity.length
      ? activity.map(a=>`<div class="act"><span class="act-time">${new Date(a.time).toLocaleTimeString()}</span><span class="tag act-${a.kind.replace(/\./g,'-')}">${a.kind}</span><span>${esc(a.message)}</span></div>`).join('')
      : '<p class="muted">No activity yet. Create a twin or generate synthetic data.</p>';
    $('dash-twin-rows').innerHTML = twins.map(t=>{
      const h = t.health||{};
      return `<tr class="clickable" data-id="${esc(t.id)}">
        <td><b>${esc(t.name)}</b><br/><span class="muted">${esc(t.id)}</span></td>
        <td><span class="health-badge ${h.status||'unknown'}"><i></i><b>${h.score??'—'}</b><small>${h.status||'unknown'}</small></span></td>
        <td>${esc(t.status||'active')}</td>
        <td title="${esc(h.last_seen||'')}">${relTime(h.last_seen)}</td>
        <td>${(h.points??0).toLocaleString()}</td>
        <td>${h.anomaly_count??0}</td>
        <td><button class="btn small ghost">View</button></td>
      </tr>`;
    }).join('');
    document.querySelectorAll('#dash-twin-rows tr').forEach(tr=>{
      tr.onclick = ()=>{
        const t = twins.find(x=>x.id===tr.dataset.id);
        if(t){ selected = t; showPage('library'); }
      };
    });
  }catch(e){ console.warn('dashboard', e); }
}

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
  const cc = $('lib-count');
  if(cc) cc.textContent = list.length===twins.length ? `${twins.length} twins` : `${list.length} of ${twins.length}`;
  if(!list.length){
    el.innerHTML = twins.length
      ? `<div class="empty">No twins match "<b>${esc($('search').value)}</b>".<br/><button class="btn small" onclick="document.getElementById('search-clear').click()">Clear search</button></div>`
      : `<div class="empty">No twins yet.<br/><button class="btn small" onclick="openModal(null)">Create Twin</button></div>`;
    return;
  }
  list.forEach(t=>{
    const d = document.createElement('div');
    d.className = 'twin-item st-' + ((t.health&&t.health.status)||'unknown') + (selected&&selected.id===t.id?' active':'');
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
    const ch = t.health||{};
    d.innerHTML = `<h3>${esc(t.name)}</h3><p>${esc(t.description||'')}</p>
      <div class="meta"><span class="tag">${esc(t.asset_type||'')}</span><span class="tag">${esc(t.location||'')}</span><span class="tag">${esc(t.status||'active')}</span><span class="health-badge ${ch.status||'unknown'}"><i></i><b>${ch.score??'—'}</b><small>${ch.status||'unknown'}</small></span></div>
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
      <span class="health-badge" id="health-badge"><i></i><b>&hellip;</b><small>loading</small></span>
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
  refreshHealthBadge();
  await updateLive(true);
}

async function refreshHealthBadge(){
  const hb = $('health-badge');
  if(!hb || !selected) return;
  try{
    const h = await api(`/api/twins/${selected.id}/health`);
    hb.className = 'health-badge ' + (h.status||'unknown');
    hb.innerHTML = `<i></i><b>${h.score}</b><small>${h.status}</small>`;
  }catch(e){
    hb.className = 'health-badge unknown';
    hb.innerHTML = `<i></i><b>&mdash;</b><small>unknown</small>`;
  }
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
    es.innerHTML = `<div><b>No telemetry yet</b><p>This twin has no data. Generate synthetic data or connect a device to start streaming.</p><button class="btn small" id="btn-sim-inline">Generate Synthetic Data</button></div>`;
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
    // KPIs — show the twin's actual fields (all of them), not a hardcoded list
    const k = $('kpis');
    if(k){
      const lastKeys = Object.keys(last).filter(x=>x!=='time' && x!=='anomaly');
      const fields = (selected && selected.fields && selected.fields.length ? selected.fields : lastKeys);
      k.innerHTML = fields.map(f => `<div class="kpi"><small>${esc(f)}</small><b>${last[f] ?? '—'}</b></div>`).join('');
    }
    const m = $('live-meta');
    if(m) m.textContent = pts.length ? `${pts.length} points · last ${labels[labels.length-1]||''}` : 'No telemetry yet. Generate synthetic data or connect a device to start streaming.';
    const ctx = $('live'); if(!ctx) return;
    if(!pts.length){ showChartEmpty(); return; }
    showChart();
    if(chart){
      // update in place — no destroy/recreate, no layout shift, no scroll jump
      chart.data.labels = labels;
      chart.data.datasets[0].label = field;
      chart.data.datasets[0].data = vals;
      chart.data.datasets[0].pointRadius = pts.map(p=>p.anomaly?4:0);
      chart.data.datasets[0].pointBackgroundColor = pts.map(p=>p.anomaly?'#d1242f':'transparent');
      chart.data.datasets[0].pointBorderColor = pts.map(p=>p.anomaly?'#d1242f':'transparent');
      chart.update('none');
    } else {
      chart = new Chart(ctx, {type:'line',
        data:{labels, datasets:[{label:field, data:vals, borderColor:'#1f6feb', backgroundColor:'rgba(31,111,235,.08)', fill:true, tension:.3, borderWidth:1.5,
          pointRadius: pts.map(p=>p.anomaly?4:0),
          pointBackgroundColor: pts.map(p=>p.anomaly?'#d1242f':'transparent'),
          pointBorderColor: pts.map(p=>p.anomaly?'#d1242f':'transparent')}]},
        options:{responsive:true, maintainAspectRatio:false,
          interaction:{mode:'index',intersect:false},
          plugins:{
            legend:{labels:{color:'#5b6470', boxWidth:12, font:{size:11, family:'Inter,sans-serif'}}},
            tooltip:{backgroundColor:'#1e2228', titleFont:{size:11, family:'Inter,sans-serif'}, bodyFont:{size:11, family:'ui-monospace,monospace'}, padding:10, cornerRadius:4, displayColors:false}
          },
          scales:{
            x:{ticks:{color:'#8a93a0',maxTicksLimit:8,font:{size:11, family:'ui-monospace,monospace'}}, grid:{color:'#e3e6ea'}},
            y:{ticks:{color:'#8a93a0',font:{size:11, family:'ui-monospace,monospace'}}, grid:{color:'#e3e6ea'}}}}});
    }
    refreshHealthBadge();
  }catch(e){ console.warn(e); }
}

function startLive(){
  if(timer) clearInterval(timer);
  const tick = ()=>{ if(currentPage==='library' && $('live-toggle').checked) updateLive(); };
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
function relTime(iso){
  if(!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime())/1000));
  if(s < 5) return 'just now';
  if(s < 60) return s + 's ago';
  const m = Math.floor(s/60);
  if(m < 60) return m + 'm ago';
  const h = Math.floor(m/60);
  if(h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}

// ---- device connection modal (ESP32 is one example among several)
function deviceSnippets(){
  const t = selected || {id:'esp32-demo', mqtt_topic:'ascent/esp32-demo/telemetry'};
  const topic = t.mqtt_topic || ('ascent/'+t.id+'/telemetry');
  return {
    esp32: `// ESP32 (Arduino) example — twin "${t.id}"
#include <WiFi.h>
#include <PubSubClient.h>
const char* WIFI_SSID="YOUR_WIFI";
const char* WIFI_PASS="YOUR_PASS";
const char* MQTT_HOST="YOUR_PC_IP"; // Docker host LAN IP, port 1883
const char* TOPIC="${topic}";
WiFiClient esp; PubSubClient mqtt(esp);
void setup(){ Serial.begin(115200); WiFi.begin(WIFI_SSID,WIFI_PASS);
 while(WiFi.status()!=WL_CONNECTED) delay(500);
 mqtt.setServer(MQTT_HOST,1883); }
void loop(){ if(!mqtt.connected()) mqtt.connect("esp32-${t.id}");
 float temp=22+random(0,300)/100.0; float hum=45+random(0,1000)/100.0;
 char buf[128]; snprintf(buf,sizeof(buf),"{{\\"temperature\\":%.2f,\\"humidity\\":%.2f}}",temp,hum);
 mqtt.publish(TOPIC,buf); delay(2000); }
// Full sketch: examples/esp32/esp32_telemetry.ino`,
    python: `# Python example — publish telemetry for twin "${t.id}"
import json, time, random
import paho.mqtt.client as mqtt

TWIN_ID = "${t.id}"
MQTT_HOST = "YOUR_PC_IP"   # Docker host LAN IP, port 1883

client = mqtt.Client()
client.connect(MQTT_HOST, 1883)
while True:
    payload = {"temperature": round(22+3*random.random(),2),
               "humidity": round(45+10*random.random(),2)}
    client.publish(f"ascent/{TWIN_ID}/telemetry", json.dumps(payload))
    time.sleep(2)
# Or use the HTTP endpoint: POST /api/twins/${t.id}/telemetry`,
    mqtt: `# Generic MQTT client (mosquitto_pub) — twin "${t.id}"
# Topic: ${topic}
mosquitto_pub -h YOUR_PC_IP -p 1883 -t "${topic}" \\
  -m '{"temperature":23.4,"humidity":48.1,"pressure":1013.2}'`,
    http: `# HTTP POST — same endpoint the web UI uses (twin "${t.id}")
curl -X POST http://localhost:8000/api/twins/${t.id}/telemetry \\
  -H "Content-Type: application/json" \\
  -d '{"temperature":23.4,"humidity":48.1,"pressure":1013.2}'`
  };
}
let devTab = 'esp32';
function openDeviceModal(){
  $('dev-code').textContent = deviceSnippets()[devTab];
  $('dev-back').classList.add('open');
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
$('btn-device').onclick=openDeviceModal;
$('dev-close').onclick=()=>$('dev-back').classList.remove('open');
$('dev-copy').onclick=()=>{ navigator.clipboard.writeText($('dev-code').textContent); toast('Snippet copied to clipboard', 'success'); };
document.querySelectorAll('.dev-tab').forEach(b=>b.onclick=()=>{
  devTab = b.dataset.dev;
  document.querySelectorAll('.dev-tab').forEach(x=>x.classList.toggle('active', x===b));
  $('dev-code').textContent = deviceSnippets()[devTab];
});
document.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>window.open(b.dataset.link,'_blank'));
document.querySelectorAll('.navpage').forEach(b=>b.onclick=()=>showPage(b.dataset.page));

refreshHealth(); loadTwins(); showPage('dashboard');
setInterval(refreshHealth,5000);
setInterval(()=>{ if(currentPage==='dashboard') renderDashboard(); }, 5000);
