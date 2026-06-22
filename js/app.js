// ─────────────────────────────────────────
//  B·Siluets — App principal
//  Software SIE © 2025
// ─────────────────────────────────────────

// ─── BOT ───
const BOT_RESPONSES = {
  'ver servicios': 'Ofrecemos: ✦ Medicina Estética desde $800 ◈ Body Sculpting desde $650 ◇ Faciales desde $550 ⊕ Suplementación desde $450. ¿Te interesa alguno?',
  'agendar cita': 'Para agendar llámanos al 311 000 0000. Horarios: Lun-Vie 9-19h, Sáb 9-14h.',
  'precios': 'Consulta: $350 | Cavitación: $650/ses | Body Sculpting: $700 | Faciales: desde $550.',
  'horarios': 'Lunes a Viernes 9:00-19:00, Sábados 9:00-14:00. Domingos cerrado.'
};
function toggleChat(){document.getElementById('chatbox').classList.toggle('open')}
function sendChip(txt){addMsg(txt,'user');setTimeout(()=>{const k=txt.toLowerCase();addMsg(BOT_RESPONSES[k]||'Gracias, enseguida te atendemos. 🌿','bot')},600)}
function sendChat(){const i=document.getElementById('chat-in');const v=i.value.trim();if(!v)return;addMsg(v,'user');i.value='';setTimeout(()=>{const k=Object.keys(BOT_RESPONSES).find(r=>v.toLowerCase().includes(r));addMsg(k?BOT_RESPONSES[k]:'Gracias por tu mensaje. Te contactaremos pronto. 💫','bot')},700)}
function addMsg(txt,type){const c=document.getElementById('chat-msgs');const d=document.createElement('div');d.className='chat-msg '+type;d.innerHTML=txt;c.appendChild(d);c.scrollTop=c.scrollHeight}

// ─── LOGIN ───
function openLogin(){document.getElementById('login-overlay').classList.add('open')}
function closeLogin(){document.getElementById('login-overlay').classList.remove('open')}
function logout(){
  sessionStorage.removeItem('bsiluets_user');
  document.getElementById('admin-page').style.display='none';
  document.getElementById('public-page').style.display='block';
}

// ─── MODULES ───

function showModule(id,el){
  document.querySelectorAll('.module').forEach(m=>m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('mod-'+id).classList.add('active');
  if(el)el.classList.add('active');
  const titles={dashboard:'Dashboard',agenda:'Agenda',pacientes:'Catálogo de Pacientes',tratamientos:'Tratamientos',inventario:'Suplementos / Inventario',pagos:'Pagos',paquetes:'Paquetes & Visitas',creditos:'Créditos & Adeudos',reportes:'Reportes',bot:'Bot / Chat',config:'Configuración'};
  document.getElementById('module-title').textContent=titles[id]||id;
  if(id==='pacientes')   cargarPacientes();
  if(id==='tratamientos') cargarTratamientos();
  if(id==='inventario')  cargarInventario();
  if(id==='agenda')      initAgenda();
  if(id==='pagos')       initPagos();
  if(id==='paquetes')    initPaquetes();
  if(id==='creditos') initCreditos();
  if(id==='caja') initCaja();
  if(id==='reportes') initReportes();
  if(id==='config') cargarFechasBloqueadasConfig();
  
}

// ─── BARS ───
function renderBars(){
  const bi=document.getElementById('bar-ingresos');
  if(!bi)return;
  const data=[[9200,'Sem 1'],[11400,'Sem 2'],[10800,'Sem 3'],[11450,'Sem 4']];
  const max=Math.max(...data.map(d=>d[0]));
  bi.innerHTML=data.map(([v,l])=>`<div class="bar" style="height:${(v/max*100)}%"><span class="bar-val">$${(v/1000).toFixed(1)}k</span><span class="bar-label">${l}</span></div>`).join('');
  const bt=document.getElementById('bar-trats');
  if(!bt)return;
  const dt=[[24,'Cavit.'],[18,'Body'],[12,'Facial'],[8,'Botox'],[6,'Relleno']];
  const mx=Math.max(...dt.map(d=>d[0]));
  bt.innerHTML=dt.map(([v,l])=>`<div class="bar" style="height:${(v/mx*100)}%"><span class="bar-val">${v}</span><span class="bar-label">${l}</span></div>`).join('');
}

// ─── MÉTODO PAGO ───
function selPM(el){
  document.querySelectorAll('.pm').forEach(p=>p.classList.remove('selected'));
  el.classList.add('selected');
  if(typeof metodoSeleccionado !== 'undefined') metodoSeleccionado = el.dataset.metodo || 'efectivo';
}

// ─── MODALS ───
function openModal(id){
  const el=document.getElementById('modal-'+id);
  if(el)el.classList.add('open');
}
function closeModal(id){
  const el=document.getElementById('modal-'+id);
  if(el)el.classList.remove('open');
}
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',function(e){if(e.target===this)this.classList.remove('open')}));

// ─── TOAST ───
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}

// ─── SCROLL ───
function scrollTo(sel){document.querySelector(sel)?.scrollIntoView({behavior:'smooth'})}

// ─── ABONO (créditos demo) ───
let abonoSaldoActual=0;
function openAbonoModal(nombre,saldo){
  abonoSaldoActual=saldo;
  document.getElementById('abono-paciente-title').textContent='Registrar Abono — '+nombre;
  document.getElementById('abono-saldo-actual').textContent='$'+saldo.toLocaleString();
  document.getElementById('abono-saldo-nuevo').textContent='$'+saldo.toLocaleString();
  document.getElementById('abono-monto').value='';
  openModal('abono');
}
function calcNuevoSaldo(){
  const abono=parseFloat(document.getElementById('abono-monto').value)||0;
  const nuevo=Math.max(0,abonoSaldoActual-abono);
  document.getElementById('abono-saldo-nuevo').textContent='$'+nuevo.toLocaleString();
  document.getElementById('abono-saldo-nuevo').style.color=nuevo===0?'var(--success)':'var(--gold)';
}
function guardarAbono(){
  const monto=parseFloat(document.getElementById('abono-monto').value)||0;
  if(monto<=0){showToast('⚠ Ingresa un monto válido');return;}
  closeModal('abono');
  showToast('✓ Abono de $'+monto.toLocaleString()+' registrado');
}

// ─── SUB-TABS ───
function showModTab(id, el) {
  el.closest('.module').querySelectorAll('.mod-panel').forEach(p => p.classList.remove('active'));
  el.closest('.module').querySelectorAll('.mod-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  el.classList.add('active');
}