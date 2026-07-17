// ─────────────────────────────────────────
//  B·Siluets — App principal
//  Software SIE © 2025
// ─────────────────────────────────────────


// ─── INIT ADMIN ───
function initAdmin() {
  showModule('dashboard', document.querySelector('.nav-item'));
}

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
  if(id==='gastos') initGastos();
  if(id==='reportes') initReportes();
  if(id==='config') { cargarFechasBloqueadasConfig(); cargarUsuarios(); }
  
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


// ─── USUARIOS ───
async function cargarUsuarios() {
  const tbody = document.getElementById('tabla-usuarios');
  if (!tbody) return;

  const { data, error } = await db
    .from('usuarios')
    .select('id, nombre, usuario, rol, activo')
    .neq('usuario', 'sie.admin')
    .order('created_at', { ascending: true });

  if (error || !data) return;

  const rolBadge = { admin:'badge-gold', recepcionista:'badge-blue', capturista:'badge-gray' };
  const rolLabel = { admin:'Administrador', recepcionista:'Recepcionista', capturista:'Capturista' };

  tbody.innerHTML = data.map(u => `<tr>
    <td>
      <div style="font-weight:500">${u.nombre}</div>
      <div style="font-size:11px;opacity:.5">${u.usuario}</div>
    </td>
    <td><span class="badge ${rolBadge[u.rol]||'badge-gray'}" style="font-size:10px">${rolLabel[u.rol]||u.rol}</span></td>
    <td>${u.activo ? '<span class="badge badge-green" style="font-size:10px">Activo</span>' : '<span class="badge badge-red" style="font-size:10px">Inactivo</span>'}</td>
    <td>
      <button class="tb-btn" style="padding:3px 7px;font-size:10px;margin-right:4px" onclick="editarUsuario('${u.id}')">✏</button>
      ${u.usuario !== 'admin' ? `<button class="tb-btn danger" style="padding:3px 7px;font-size:10px" onclick="toggleUsuario('${u.id}',${u.activo})">${u.activo ? '🔒' : '🔓'}</button>` : ''}
    </td>
  </tr>`).join('');
}

async function guardarUsuario() {
  const id       = document.getElementById('usr-id').value;
  const nombre   = document.getElementById('usr-nombre').value.trim();
  const usuario  = document.getElementById('usr-usuario').value.trim();
  const password = document.getElementById('usr-password').value;
  const rol      = document.getElementById('usr-rol').value;

  if (!nombre)  { showToast('⚠ El nombre es obligatorio'); return; }
  if (!usuario) { showToast('⚠ El usuario es obligatorio'); return; }
  if (!id && !password) { showToast('⚠ La contraseña es obligatoria'); return; }
  if (password && password.length < 6) { showToast('⚠ La contraseña debe tener mínimo 6 caracteres'); return; }

  const datos = { nombre, usuario, rol };

  if (password) {
    datos.password_hash = await hashPassword(password);
  }

  let error;
  if (id) {
    ({ error } = await db.from('usuarios').update(datos).eq('id', id));
  } else {
    ({ error } = await db.from('usuarios').insert([datos]));
  }

  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('nuevo-usuario');
  limpiarFormUsuario();
  showToast(id ? '✓ Usuario actualizado' : '✓ Usuario creado correctamente');
  cargarUsuarios();
}

async function editarUsuario(id) {
  const { data: u, error } = await db.from('usuarios').select('*').eq('id', id).single();
  if (error || !u) { showToast('❌ Error al cargar'); return; }

  document.getElementById('usr-id').value      = u.id;
  document.getElementById('usr-nombre').value  = u.nombre;
  document.getElementById('usr-usuario').value = u.usuario;
  document.getElementById('usr-password').value = '';
  document.getElementById('usr-rol').value     = u.rol;
  document.getElementById('usuario-modal-title').textContent = 'Editar Usuario';
  openModal('nuevo-usuario');
}

async function toggleUsuario(id, activo) {
  const { error } = await db.from('usuarios').update({ activo: !activo }).eq('id', id);
  if (error) { showToast('❌ Error'); return; }
  showToast(activo ? '🔒 Usuario desactivado' : '🔓 Usuario activado');
  cargarUsuarios();
}

function limpiarFormUsuario() {
  ['usr-id','usr-nombre','usr-usuario','usr-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('usr-rol').value = 'recepcionista';
  document.getElementById('usuario-modal-title').textContent = 'Nuevo Usuario';
}


// ─── DESCARGAR NOTA JPG ───
async function descargarNotaJPG() {
  const el = document.getElementById('nota-imprimible');
  if (!el) return;
  showToast('⏳ Generando imagen...');
  try {
    const canvas = await html2canvas(el, { 
      scale: 2, 
      backgroundColor: '#ffffff',
      useCORS: true 
    });
    const link = document.createElement('a');
    link.download = `nota-bsiluets-${Date.now()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
    showToast('✅ Imagen descargada');
  } catch(e) {
    showToast('❌ Error al generar imagen');
  }
}