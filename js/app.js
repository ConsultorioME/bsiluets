// ─────────────────────────────────────────
//  B·Siluets — App principal
//  Software SIE © 2025
// ─────────────────────────────────────────


// ─── SERVICE WORKER (permite "Agregar a pantalla de inicio") ───
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ─── INIT ADMIN ───
function initAdmin() {
  if (typeof iniciarRealtime === 'function') iniciarRealtime();

  cargarConfigConsultorio();
  cargarHorarioAtencion();

  let rol = 'recepcionista';
  try { rol = (JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}').rol) || rol; } catch (e) {}

  // Recepcionista ya no tiene acceso a Dashboard, así que aterriza en Agenda.
  const landing = (rol === 'doctora' || rol === 'recepcionista') ? 'agenda' : 'dashboard';
  if (landing === 'dashboard') initDashboard();
  const navEl = document.querySelector(`.nav-item[onclick*="showModule('${landing}'"]`) || document.querySelector('.nav-item');
  showModule(landing, navEl);
}

// ─── DATOS DEL CONSULTORIO (dinámicos para Notas de Venta) ───
window.configConsultorio = {
  nombre:     'B·Siluets Consultorio Médico Estético',
  direccion:  'Tepic, Nayarit, México',
  telefono:   '311 000 0000',
  correo:     'contacto@bsiluets.mx',
  instagram:  '@bsiluets'
};

async function cargarConfigConsultorio() {
  try {
    const { data, error } = await db.from('configuracion').select('*').eq('id', 1).single();
    if (!error && data) {
      window.configConsultorio = {
        nombre:    data.nombre    || window.configConsultorio.nombre,
        direccion: data.direccion || window.configConsultorio.direccion,
        telefono:  data.telefono  || window.configConsultorio.telefono,
        correo:    data.correo    || window.configConsultorio.correo,
        instagram: data.instagram || window.configConsultorio.instagram,
      };
    }
  } catch (e) {
    // Si la tabla no existe todavía o falla la consulta, se usan los valores por defecto
  }
  const campos = { 'cfg-nombre':'nombre', 'cfg-direccion':'direccion', 'cfg-telefono':'telefono', 'cfg-correo':'correo', 'cfg-instagram':'instagram' };
  Object.keys(campos).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = window.configConsultorio[campos[id]];
  });
}

async function guardarConfigConsultorio() {
  const datos = {
    id:        1,
    nombre:    document.getElementById('cfg-nombre').value.trim(),
    direccion: document.getElementById('cfg-direccion').value.trim(),
    telefono:  document.getElementById('cfg-telefono').value.trim(),
    correo:    document.getElementById('cfg-correo').value.trim(),
    instagram: document.getElementById('cfg-instagram').value.trim(),
  };
  const { error } = await db.from('configuracion').upsert([datos]);
  if (error) { showToast('❌ Error al guardar: ' + error.message); return; }
  window.configConsultorio = {
    nombre: datos.nombre, direccion: datos.direccion, telefono: datos.telefono,
    correo: datos.correo, instagram: datos.instagram
  };
  showToast('✓ Datos guardados correctamente');
}

// ─── HORARIOS DE ATENCIÓN (usados por Agenda para bloquear horarios fuera de servicio) ───
const HORARIO_ATENCION_DEFAULT = {
  lv:  { am: { activo: true,  ini: '09:00', fin: '14:00' }, pm: { activo: true,  ini: '16:00', fin: '19:00' } },
  sab: { am: { activo: true,  ini: '09:00', fin: '14:00' }, pm: { activo: false, ini: '',      fin: ''      } },
  dom: { am: { activo: false, ini: '',      fin: ''      }, pm: { activo: false, ini: '',      fin: ''      } },
  citaMinima: 30
};
window.horarioAtencion = JSON.parse(JSON.stringify(HORARIO_ATENCION_DEFAULT));

async function cargarHorarioAtencion() {
  try {
    const { data, error } = await db.from('configuracion').select('horarios').eq('id', 1).single();
    if (!error && data && data.horarios) {
      window.horarioAtencion = data.horarios;
    }
  } catch (e) {
    // Si la columna no existe todavía o falla la consulta, se usan los valores por defecto
  }
  pintarHorarioAtencionEnForm();
}

function pintarHorarioAtencionEnForm() {
  const h = window.horarioAtencion;
  ['lv', 'sab', 'dom'].forEach(grupo => {
    ['am', 'pm'].forEach(turno => {
      const t   = h[grupo][turno];
      const act = document.getElementById(`hor-${grupo}-${turno}-activo`);
      const ini = document.getElementById(`hor-${grupo}-${turno}-ini`);
      const fin = document.getElementById(`hor-${grupo}-${turno}-fin`);
      if (act) act.checked = !!t.activo;
      if (ini) ini.value = t.ini || '';
      if (fin) fin.value = t.fin || '';
    });
  });
  const cm = document.getElementById('hor-cita-minima');
  if (cm) cm.value = h.citaMinima || 30;
}

async function guardarHorarioAtencion() {
  const leerTurno = (grupo, turno) => ({
    activo: document.getElementById(`hor-${grupo}-${turno}-activo`)?.checked || false,
    ini:    document.getElementById(`hor-${grupo}-${turno}-ini`)?.value || '',
    fin:    document.getElementById(`hor-${grupo}-${turno}-fin`)?.value || '',
  });

  const nuevo = {
    lv:  { am: leerTurno('lv', 'am'),  pm: leerTurno('lv', 'pm')  },
    sab: { am: leerTurno('sab', 'am'), pm: leerTurno('sab', 'pm') },
    dom: { am: leerTurno('dom', 'am'), pm: leerTurno('dom', 'pm') },
    citaMinima: parseInt(document.getElementById('hor-cita-minima')?.value) || 30,
  };

  // Validar que cada turno activo tenga hora de inicio y fin, y que el fin sea mayor al inicio
  for (const grupo of ['lv', 'sab', 'dom']) {
    for (const turno of ['am', 'pm']) {
      const t = nuevo[grupo][turno];
      if (t.activo && (!t.ini || !t.fin)) { showToast('⚠ Falta hora de inicio o fin en un turno activo'); return; }
      if (t.activo && t.fin <= t.ini)     { showToast('⚠ La hora de fin debe ser mayor a la de inicio'); return; }
    }
  }

  const { error } = await db.from('configuracion').upsert([{ id: 1, horarios: nuevo }]);
  if (error) { showToast('❌ Error al guardar horarios: ' + error.message); return; }
  window.horarioAtencion = nuevo;
  showToast('✓ Horarios de atención actualizados');
}

// Bloque de contacto que se inserta en las Notas de Venta (Pagos, Paquetes & Visitas, Créditos)
function notaContactoHTML() {
  const c = window.configConsultorio || {};
  const partes = [c.telefono, c.correo, c.instagram].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `<div class="nota-sub-hdr">${c.direccion || ''}</div>` +
    (partes ? `<div style="font-size:11px;text-align:center;opacity:.6;margin-bottom:4px">${partes}</div>` : '');
}

// Nombre del consultorio para el pie de la Nota de Venta
function notaNombreConsultorio() {
  return (window.configConsultorio && window.configConsultorio.nombre) || 'B·Siluets';
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

// ─── SIDEBAR (cajón deslizable en celular) ───
function toggleSidebar(){
  document.querySelector('.sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('open');
}
function closeSidebar(){
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
}

// ─── MODULES ───

function showModule(id,el){
  document.querySelectorAll('.module').forEach(m=>m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('mod-'+id).classList.add('active');
  if(el)el.classList.add('active');
  closeSidebar();
  const titles={dashboard:'Dashboard',agenda:'Agenda',pacientes:'Catálogo de Pacientes',tratamientos:'Tratamientos',inventario:'Suplementos / Inventario',pagos:'Pagos',paquetes:'Paquetes & Visitas',creditos:'Créditos & Adeudos',reportes:'Reportes',bot:'Bot / Chat',config:'Configuración'};
  document.getElementById('module-title').textContent=titles[id]||id;
  if(id==='dashboard')   initDashboard();
  if(id==='pacientes') {
    cargarPacientes();
    // Si ya había un perfil abierto (p. ej. se salió a registrar un cobro
    // en otro módulo y se volvió a Pacientes), se recarga en silencio para
    // que el adeudo/saldo se vea al día sin tener que volver a dar "Ver".
    if (typeof pacienteActualId !== 'undefined' && pacienteActualId) verPaciente(pacienteActualId, true);
  }
  if(id==='tratamientos') cargarTratamientos();
  if(id==='inventario')  cargarInventario();
  if(id==='agenda')      initAgenda();
  if(id==='pagos')       initPagos();
  if(id==='paquetes')    initPaquetes();
  if(id==='creditos') initCreditos();
  if(id==='caja') initCaja();
  if(id==='gastos') initGastos();
  if(id==='reportes') initReportes();
  if(id==='config') { cargarFechasBloqueadasConfig(); cargarUsuarios(); cargarEliminados(); cargarConfigConsultorio(); cargarHorarioAtencion(); }
  
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

// Nota: la lógica de "Abono" (calcNuevoSaldo, guardarAbonoReal, seleccionar
// concepto, etc.) del módulo real de Créditos vive en creditos.js. El código
// demo que existía aquí (openAbonoModal/abonoSaldoActual/guardarAbono, nunca
// invocado desde la UI real) se eliminó para no duplicar/confundir con
// calcNuevoSaldo() de creditos.js.

// ─── SINCRONIZAR TOTALES ENTRE MÓDULOS ───
// Cada módulo recarga sus propios datos al abrirse (showModule), pero un
// pago/abono/cobro registrado en un módulo (Pagos, Paquetes & Visitas,
// Créditos) también cambia totales que se muestran en otros módulos que
// pueden seguir abiertos en pantalla (Dashboard, Caja, Reportes, Créditos,
// y sobre todo el perfil de una paciente ya abierto en Pacientes). Sin esto
// esos totales quedaban desactualizados hasta recargar la página. Se llama
// al final de cada acción que registra/edita/elimina un pago, abono o cobro.
function sincronizarModulosFinancieros() {
  if (typeof initDashboard === 'function')  initDashboard();
  if (typeof initCaja === 'function')       initCaja();
  if (typeof initReportes === 'function')   initReportes();
  if (typeof initCreditos === 'function')   initCreditos();
  if (typeof cargarPacientes === 'function') cargarPacientes();
  if (typeof pacienteActualId !== 'undefined' && pacienteActualId && typeof verPaciente === 'function') {
    verPaciente(pacienteActualId, true);
  }
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

  const rolBadge = { admin:'badge-gold', recepcionista:'badge-blue', capturista:'badge-gray', doctora:'badge-gold' };
  const rolLabel = { admin:'Administrador', recepcionista:'Recepcionista', capturista:'Capturista', doctora:'Doctora' };

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



// ─── HISTORIAL ELIMINADOS ───
async function cargarEliminados() {
  const tbody = document.getElementById('tabla-eliminados');
  if (!tbody) return;

  const [{ data: cobros }, { data: notas }, { data: abonos }] = await Promise.all([
    db.from('pagos')
      .select('*, pacientes(nombre, apellidos)')
      .eq('eliminado', true)
      .order('eliminado_at', { ascending: false }),
    db.from('visitas')
      .select('*, pacientes(nombre, apellidos)')
      .eq('eliminado', true)
      .order('eliminado_at', { ascending: false }),
    db.from('abonos')
      .select('*, pacientes(nombre, apellidos)')
      .eq('eliminado', true)
      .order('eliminado_at', { ascending: false }),
  ]);

  const filas = [
    ...(cobros || []).map(p => ({
      tipo:      'Cobro',
      badge:     'badge-gray',
      fecha:     p.fecha || '—',
      nombre:    p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos}` : '—',
      concepto:  p.concepto || '—',
      monto:     parseFloat(p.total) || 0,
      por:       p.eliminado_por,
      at:        p.eliminado_at,
    })),
    ...(notas || []).map(v => ({
      tipo:      'Nota de visita',
      badge:     'badge-blue',
      fecha:     v.fecha || '—',
      nombre:    v.pacientes ? `${v.pacientes.nombre} ${v.pacientes.apellidos}` : '—',
      concepto:  `Sesión ${v.numero_sesion}${v.folio ? ' — ' + v.folio : ''}`,
      monto:     parseFloat(v.monto_cobrado) || 0,
      por:       v.eliminado_por,
      at:        v.eliminado_at,
    })),
    ...(abonos || []).map(a => ({
      tipo:      'Abono',
      badge:     'badge-gold',
      fecha:     a.fecha || '—',
      nombre:    a.pacientes ? `${a.pacientes.nombre} ${a.pacientes.apellidos}` : '—',
      concepto:  a.referencia || 'Abono',
      monto:     parseFloat(a.monto) || 0,
      por:       a.eliminado_por,
      at:        a.eliminado_at,
    })),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  if (filas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;opacity:.3;padding:12px">Sin registros eliminados</td></tr>`;
    return;
  }

  tbody.innerHTML = filas.map(f => {
    const fechaElim = f.at ? new Date(f.at).toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
    return `<tr>
      <td><span class="badge ${f.badge}" style="font-size:10px">${f.tipo}</span></td>
      <td style="font-size:12px;opacity:.6">${f.fecha}</td>
      <td>${f.nombre}</td>
      <td style="font-size:12px;opacity:.7">${f.concepto}</td>
      <td style="color:#e74c3c">$${f.monto.toLocaleString()}</td>
      <td style="font-size:12px;color:var(--gold)">${f.por || '—'}</td>
      <td style="font-size:11px;opacity:.5">${fechaElim}</td>
    </tr>`;
  }).join('');
}


// ─── DASHBOARD ───
async function initDashboard() {
  const hoy   = fechaHoyISO();
  const mes   = hoy.substring(0, 7);
  const desde = `${mes}-01`;
  const hasta = `${mes}-${new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate()}`;

  // Citas hoy
  const { data: citasHoy } = await db.from('agenda').select('id,estado').eq('fecha', hoy);
  const totalCitas    = citasHoy?.length || 0;
  const pendientes    = citasHoy?.filter(c => c.estado === 'pendiente').length || 0;

  // Ingresos del mes
  const { data: pagosM } = await db.from('pagos').select('total').gte('fecha', desde).lte('fecha', hasta).eq('eliminado', false);
  const ingresosM = (pagosM || []).reduce((s, p) => s + parseFloat(p.total || 0), 0);

  // Pacientes activos
  const { data: pacs } = await db.from('pacientes').select('id').eq('activo', true);
  const totalPacs = pacs?.length || 0;

  // Paquetes activos
  const { data: paqsActivos } = await db.from('paquetes').select('id,sesion_actual,total_sesiones').eq('activo', true);
  const totalPaqs    = paqsActivos?.length || 0;
  const porVencer    = (paqsActivos || []).filter(p => p.total_sesiones - p.sesion_actual <= 2).length;

  // Stock bajo (comparación stock <= stock_minimo: PostgREST no compara dos
  // columnas entre sí vía filtros de URL, así que se trae el inventario
  // activo y se compara en el cliente)
  const { data: inventarioActivo } = await db.from('inventario').select('stock, stock_minimo').eq('activo', true);
  const totalStockBajo = (inventarioActivo || []).filter(i => parseFloat(i.stock) <= parseFloat(i.stock_minimo)).length;

  // KPIs
  document.getElementById('dash-citas-hoy').textContent    = totalCitas;
  document.getElementById('dash-citas-pend').textContent   = `${pendientes} pendientes`;
  document.getElementById('dash-ingresos').textContent     = '$' + ingresosM.toLocaleString();
  document.getElementById('dash-pacientes').textContent    = totalPacs;
  document.getElementById('dash-paquetes').textContent     = totalPaqs;
  document.getElementById('dash-por-vencer').textContent   = `${porVencer} completan pronto`;
  document.getElementById('dash-stock-bajo').textContent   = totalStockBajo;

  // Próximas citas hoy
  const { data: proxCitas } = await db
    .from('agenda')
    .select('hora, estado, pacientes(nombre,apellidos), tratamientos(nombre)')
    .eq('fecha', hoy)
    .order('hora');

  const tbCitas = document.getElementById('dash-tabla-citas');
  if (tbCitas) {
    if (!proxCitas || proxCitas.length === 0) {
      tbCitas.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:12px">Sin citas hoy</td></tr>`;
    } else {
      const badgeEstado = { confirmada:'badge-green', pendiente:'badge-gold', 'en sala':'badge-blue', 'sin confirmar':'badge-gray' };
      tbCitas.innerHTML = proxCitas.map(c => `<tr>
        <td style="color:var(--gold)">${c.hora?.substring(0,5) || '—'}</td>
        <td>${c.pacientes ? c.pacientes.nombre + ' ' + c.pacientes.apellidos : '—'}</td>
        <td style="font-size:12px;opacity:.7">${c.tratamientos?.nombre || '—'}</td>
        <td><span class="badge ${badgeEstado[c.estado?.toLowerCase()] || 'badge-gray'}" style="font-size:10px">${c.estado || '—'}</span></td>
      </tr>`).join('');
    }
  }

  // Paquetes por vencer
  const { data: paqsVencer } = await db
    .from('paquetes')
    .select('sesion_actual, total_sesiones, pacientes(nombre,apellidos), tratamientos(nombre)')
    .eq('activo', true)
    .order('sesion_actual', { ascending: false })
    .limit(5);

  const tbPaqs = document.getElementById('dash-tabla-paquetes');
  if (tbPaqs) {
    if (!paqsVencer || paqsVencer.length === 0) {
      tbPaqs.innerHTML = `<tr><td colspan="2" style="text-align:center;opacity:.3;padding:12px">Sin paquetes activos</td></tr>`;
    } else {
      tbPaqs.innerHTML = paqsVencer.map(p => `<tr>
        <td>${p.pacientes ? p.pacientes.nombre + ' ' + p.pacientes.apellidos.charAt(0) + '.' : '—'}</td>
        <td style="font-size:12px;opacity:.6">Ses. ${p.sesion_actual}/${p.total_sesiones} — ${p.tratamientos?.nombre || '—'}</td>
      </tr>`).join('');
    }
  }

  // Últimos pagos
  const { data: ultPagos } = await db
    .from('pagos')
    .select('total, pacientes(nombre,apellidos)')
    .eq('eliminado', false)
    .order('created_at', { ascending: false })
    .limit(5);

  const tbPagos = document.getElementById('dash-tabla-pagos');
  if (tbPagos) {
    if (!ultPagos || ultPagos.length === 0) {
      tbPagos.innerHTML = `<tr><td colspan="2" style="text-align:center;opacity:.3;padding:12px">Sin pagos recientes</td></tr>`;
    } else {
      tbPagos.innerHTML = ultPagos.map(p => `<tr>
        <td>${p.pacientes ? p.pacientes.nombre + ' ' + p.pacientes.apellidos.charAt(0) + '.' : '—'}</td>
        <td style="color:var(--gold);font-weight:500">$${parseFloat(p.total).toLocaleString()}</td>
      </tr>`).join('');
    }
  }
}