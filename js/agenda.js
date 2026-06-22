// ─────────────────────────────────────────
//  B·Siluets — Módulo Agenda
//  Software SIE © 2025
// ─────────────────────────────────────────

let calDate = new Date();
let fechaSeleccionada = new Date().toISOString().split('T')[0];

// ── INICIALIZAR AGENDA ──
async function initAgenda() {
  renderCal();
  await cargarCitasDia(fechaSeleccionada);
  await cargarSelectsPacientesTratamientos();
  marcarDiasConCitas();
}

// ── RENDER CALENDARIO ──
function renderCal() {
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  document.getElementById('cal-month-lbl').textContent =
    `${months[calDate.getMonth()]} ${calDate.getFullYear()}`;

  const g = document.getElementById('cal-grid');
  g.innerHTML = '';

  ['Do','Lu','Ma','Mi','Ju','Vi','Sa'].forEach(d => {
    const s = document.createElement('div');
    s.className = 'cal-dow';
    s.textContent = d;
    g.appendChild(s);
  });

  const hoy = new Date();
  const firstDay = new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay();
  const daysInMonth = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div');
    e.className = 'cal-day empty';
    g.appendChild(e);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const e = document.createElement('div');
    e.className = 'cal-day';
    e.textContent = i;

    const fechaStr = `${calDate.getFullYear()}-${String(calDate.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;

    if (i === hoy.getDate() && calDate.getMonth() === hoy.getMonth() &&
        calDate.getFullYear() === hoy.getFullYear()) {
      e.classList.add('today');
    }
    if (fechaStr === fechaSeleccionada) e.classList.add('selected');

    e.onclick = () => seleccionarDia(fechaStr, e);
    g.appendChild(e);
  }

  cargarFechasBloqueadas();
}

function calNav(dir) {
  calDate = new Date(calDate.getFullYear(), calDate.getMonth() + dir, 1);
  renderCal();
}

// ── SELECCIONAR DIA ──
async function seleccionarDia(fecha, el) {
  fechaSeleccionada = fecha;
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
  await cargarCitasDia(fecha);
}

// ── CARGAR CITAS DEL DIA ──
async function cargarCitasDia(fecha) {
  const slotList   = document.getElementById('slot-list');
  const slotHeader = document.getElementById('slot-header');
  const resumen    = document.getElementById('resumen-dia');

  if (!slotList) return;

  const d = new Date(fecha + 'T12:00:00');
  const opciones = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
  if (slotHeader) slotHeader.textContent = `Citas — ${d.toLocaleDateString('es-MX', opciones)}`;

  slotList.innerHTML = `<div style="text-align:center;padding:24px;color:var(--cream);opacity:.3;font-size:13px">Cargando...</div>`;

  const { data, error } = await db
    .from('agenda')
    .select('*, pacientes(nombre, apellidos), tratamientos(nombre)')
    .eq('fecha', fecha)
    .order('hora', { ascending: true });

  if (error) {
    slotList.innerHTML = `<div style="color:#e74c3c;padding:16px;font-size:13px">Error: ${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    slotList.innerHTML = `<div style="text-align:center;padding:40px;color:var(--cream);opacity:.25;font-size:13px">Sin citas para este dia</div>`;
    if (resumen) resumen.innerHTML = `<span style="color:var(--cream);opacity:.35">Sin citas agendadas</span>`;
    return;
  }

  const confirmadas = data.filter(c => c.estado === 'confirmada').length;
  const pendientes  = data.filter(c => c.estado === 'pendiente').length;
  if (resumen) resumen.innerHTML = `
    <span style="color:var(--gold)">${data.length} cita${data.length > 1 ? 's' : ''}</span>
    <span style="opacity:.5;margin:0 6px">·</span>
    <span style="color:#27AE60">${confirmadas} confirmada${confirmadas !== 1 ? 's' : ''}</span>
    <span style="opacity:.5;margin:0 6px">·</span>
    <span style="color:#E67E22">${pendientes} pendiente${pendientes !== 1 ? 's' : ''}</span>`;

  const badges = { pendiente:'badge-gold', confirmada:'badge-green', en_sala:'badge-blue', completada:'badge-gray', cancelada:'badge-red' };
  const labels = { pendiente:'Pendiente', confirmada:'Confirmada', en_sala:'En sala', completada:'Completada', cancelada:'Cancelada' };

  slotList.innerHTML = data.map(c => {
    const hora   = c.hora?.substring(0,5) || '--:--';
    const nombre = c.pacientes ? `${c.pacientes.nombre} ${c.pacientes.apellidos}` : 'Sin paciente';
    const trat   = c.tratamientos?.nombre || '--';
    const badge  = badges[c.estado] || 'badge-gray';
    const label  = labels[c.estado] || c.estado;
    return `
      <div class="slot-item">
        <span class="slot-time">${hora}</span>
        <div class="slot-info">
          <div class="slot-patient">${nombre}</div>
          <div class="slot-treatment">${trat}${c.notas ? ' · ' + c.notas : ''}</div>
        </div>
        <span class="badge ${badge}" style="align-self:center">${label}</span>
        <div class="slot-actions">
          <button class="icon-btn" onclick="editarCita(\`${c.id}\`)">✏</button>
          <button class="icon-btn" onclick="eliminarCita(\`${c.id}\`)">✕</button>
        </div>
      </div>`;
  }).join('');
}

// ── CARGAR SELECTS ──
async function cargarSelectsPacientesTratamientos() {
  const { data: pacientes }    = await db.from('pacientes').select('id,nombre,apellidos').eq('activo',true).order('nombre');
  const { data: tratamientos } = await db.from('tratamientos').select('id,nombre').eq('activo',true).order('nombre');

  const selPac  = document.getElementById('cita-paciente');
  const selTrat = document.getElementById('cita-tratamiento');

  if (selPac && pacientes)
    selPac.innerHTML = '<option value="">Seleccionar...</option>' +
      pacientes.map(p => `<option value="${p.id}">${p.nombre} ${p.apellidos}</option>`).join('');

  if (selTrat && tratamientos)
    selTrat.innerHTML = '<option value="">Seleccionar...</option>' +
      tratamientos.map(t => `<option value="${t.id}">${t.nombre}</option>`).join('');
}

// ── GUARDAR CITA ──
async function guardarCita() {
  const id = document.getElementById('cita-id').value;
  const datos = {
    paciente_id:    document.getElementById('cita-paciente').value    || null,
    tratamiento_id: document.getElementById('cita-tratamiento').value || null,
    fecha:          document.getElementById('cita-fecha').value,
    hora:           document.getElementById('cita-hora').value,
    duracion_min:   parseInt(document.getElementById('cita-duracion').value) || 60,
    estado:         document.getElementById('cita-estado').value,
    notas:          document.getElementById('cita-notas').value.trim(),
  };
  if (!datos.fecha) { showToast('⚠ La fecha es obligatoria'); return; }
  if (!datos.hora)  { showToast('⚠ La hora es obligatoria'); return; }

  // Verificar si la fecha está bloqueada
  const bloqueo = verificarFechaBloqueada(datos.fecha);
  if (bloqueo) {
    showToast(`⛔ Fecha bloqueada: ${bloqueo.razon}`);
    return;
  }

  let error;
  if (id) {
    ({ error } = await db.from('agenda').update(datos).eq('id', id));
  } else {
    ({ error } = await db.from('agenda').insert([datos]));
  }
  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('nueva-cita');
  showToast(id ? '✓ Cita actualizada' : '✓ Cita agendada correctamente');
  limpiarFormCita();
  await cargarCitasDia(datos.fecha);
  await marcarDiasConCitas();
}

// ── EDITAR CITA ──
async function editarCita(id) {
  const { data: c, error } = await db.from('agenda').select('*').eq('id', id).single();
  if (error || !c) { showToast('❌ Error al cargar cita'); return; }

  await cargarSelectsPacientesTratamientos();

  document.getElementById('cita-id').value           = c.id;
  document.getElementById('cita-paciente').value     = c.paciente_id    || '';
  document.getElementById('cita-tratamiento').value  = c.tratamiento_id || '';
  document.getElementById('cita-fecha').value        = c.fecha;
  document.getElementById('cita-hora').value         = c.hora?.substring(0,5) || '';
  document.getElementById('cita-duracion').value     = c.duracion_min || 60;
  document.getElementById('cita-estado').value       = c.estado || 'pendiente';
  document.getElementById('cita-notas').value        = c.notas || '';

  document.querySelector('#modal-nueva-cita .modal-title').textContent = 'Editar Cita';
  openModal('nueva-cita');
}

// ── ELIMINAR CITA ──
async function eliminarCita(id) {
  if (!confirm('¿Eliminar esta cita?')) return;
  const { error } = await db.from('agenda').delete().eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Cita eliminada');
  await cargarCitasDia(fechaSeleccionada);
}

// ── LIMPIAR FORM ──
function limpiarFormCita() {
  ['cita-id','cita-notas'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['cita-paciente','cita-tratamiento'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cita-estado').value    = 'pendiente';
  document.getElementById('cita-duracion').value  = '60';
  const titulo = document.querySelector('#modal-nueva-cita .modal-title');
  if (titulo) titulo.textContent = 'Nueva Cita';
}

// ── MARCAR DÍAS CON CITAS EN EL CALENDARIO ──
async function marcarDiasConCitas() {
  const year  = calDate.getFullYear();
  const month = String(calDate.getMonth() + 1).padStart(2, '0');
  const desde = `${year}-${month}-01`;
  const hasta = `${year}-${month}-${new Date(year, calDate.getMonth()+1, 0).getDate()}`;

  const { data } = await db
    .from('agenda')
    .select('fecha')
    .gte('fecha', desde)
    .lte('fecha', hasta);

  if (!data || data.length === 0) return;

  // Usar Set con fechas exactas sin conversión de zona horaria
  const diasConCitas = new Set(data.map(c => c.fecha));

  document.querySelectorAll('.cal-day').forEach(el => {
    if (!el.textContent.trim() || el.classList.contains('empty')) return;
    const dia = String(el.textContent.trim()).padStart(2, '0');
    const fechaEl = `${year}-${month}-${dia}`;
    if (diasConCitas.has(fechaEl)) {
      el.classList.add('has-event');
    } else {
      el.classList.remove('has-event');
    }
  });
}

// ── FECHAS BLOQUEADAS ──
let fechasBloqueadasSet = new Set();

async function cargarFechasBloqueadas() {
  const year  = calDate.getFullYear();
  const month = String(calDate.getMonth() + 1).padStart(2, '0');
  const desde = `${year}-${month}-01`;
  const hasta = `${year}-${month}-${new Date(year, calDate.getMonth()+1, 0).getDate()}`;

  const { data } = await db
    .from('fechas_bloqueadas')
    .select('fecha, razon, tipo')
    .gte('fecha', desde)
    .lte('fecha', hasta);

  fechasBloqueadasSet = new Set();
  window._fechasBloqueadasData = {};

  if (data) {
    data.forEach(f => {
      fechasBloqueadasSet.add(f.fecha);
      window._fechasBloqueadasData[f.fecha] = f;
    });
  }

  marcarDiasBloqueados();
}

function marcarDiasBloqueados() {
  const year  = calDate.getFullYear();
  const month = String(calDate.getMonth() + 1).padStart(2, '0');

  document.querySelectorAll('.cal-day').forEach(el => {
    if (!el.textContent.trim() || el.classList.contains('empty')) return;
    const dia     = String(el.textContent.trim()).padStart(2, '0');
    const fechaEl = `${year}-${month}-${dia}`;
    if (fechasBloqueadasSet.has(fechaEl)) {
      el.classList.add('blocked');
      el.title = window._fechasBloqueadasData[fechaEl]?.razon || 'Fecha bloqueada';
    } else {
      el.classList.remove('blocked');
      el.title = '';
    }
  });
}

async function guardarBloqueo() {
  const fechaIni = document.getElementById('bloqueo-fecha-ini').value;
  const fechaFin = document.getElementById('bloqueo-fecha-fin').value || fechaIni;
  const razon    = document.getElementById('bloqueo-razon').value.trim();
  const tipo     = document.getElementById('bloqueo-tipo').value;

  if (!fechaIni) { showToast('⚠ Selecciona la fecha inicial'); return; }
  if (!razon)    { showToast('⚠ Ingresa la razón del bloqueo'); return; }
  if (fechaFin < fechaIni) { showToast('⚠ La fecha final no puede ser menor a la inicial'); return; }

  // Generar array de fechas entre ini y fin
  const fechas = [];
  const cur = new Date(fechaIni + 'T12:00:00');
  const fin = new Date(fechaFin + 'T12:00:00');
  while (cur <= fin) {
    fechas.push({
      fecha: cur.toISOString().split('T')[0],
      razon,
      tipo
    });
    cur.setDate(cur.getDate() + 1);
  }

  const { error } = await db.from('fechas_bloqueadas').insert(fechas);
  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('bloquear-fecha');
  const dias = fechas.length;
  showToast(`🔒 ${dias} día${dias > 1 ? 's' : ''} bloqueado${dias > 1 ? 's' : ''}: ${razon}`);

  // Limpiar campos
  document.getElementById('bloqueo-fecha-ini').value = '';
  document.getElementById('bloqueo-fecha-fin').value = '';
  document.getElementById('bloqueo-razon').value = '';

  await cargarFechasBloqueadas();
  await marcarDiasConCitas();
}

function verificarFechaBloqueada(fecha) {
  if (!fechasBloqueadasSet.has(fecha)) return null;
  return window._fechasBloqueadasData[fecha];
}

function abrirModalCita() {
  // Verificar bloqueo solo si hay fecha seleccionada
  if (fechaSeleccionada) {
    const bloqueo = verificarFechaBloqueada(fechaSeleccionada);
    if (bloqueo) {
      const tipos = { vacaciones:'Vacaciones', cierre:'Cierre del consultorio', festivo:'Día festivo', otro:'Otro motivo' };
      showToast(`⛔ No se pueden agendar citas — ${tipos[bloqueo.tipo] || bloqueo.tipo}: ${bloqueo.razon}`);
      return;
    }
  }
  // Pre-llenar fecha seleccionada
  document.getElementById('cita-fecha').value = fechaSeleccionada || '';
  checkFechaBloqueada(fechaSeleccionada || '');
  cargarSelectsPacientesTratamientos();
  openModal('nueva-cita');
}

function checkFechaBloqueada(fecha) {
  const alerta = document.getElementById('alerta-fecha-bloqueada');
  const btnAgendar = document.querySelector('#modal-nueva-cita .btn-primary');
  if (!fecha) {
    if (alerta) alerta.style.display = 'none';
    if (btnAgendar) btnAgendar.disabled = false;
    return;
  }
  const bloqueo = verificarFechaBloqueada(fecha);
  if (bloqueo) {
    if (alerta) {
      alerta.style.display = 'block';
      alerta.innerHTML = `⛔ <strong>Fecha bloqueada</strong> — ${bloqueo.razon} (${bloqueo.tipo})`;
    }
    if (btnAgendar) btnAgendar.disabled = true;
  } else {
    if (alerta) alerta.style.display = 'none';
    if (btnAgendar) btnAgendar.disabled = false;
  }
}

async function cargarFechasBloqueadasConfig() {
  const tbody = document.getElementById('tabla-fechas-bloqueadas');
  if (!tbody) return;

  const hoy = new Date().toISOString().split('T')[0];
  const { data } = await db
    .from('fechas_bloqueadas')
    .select('*')
    .gte('fecha', hoy)
    .order('fecha', { ascending: true });

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:12px">Sin fechas bloqueadas</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(f => `
    <tr>
      <td>${new Date(f.fecha+'T12:00:00').toLocaleDateString('es-MX', {day:'2-digit',month:'short',year:'numeric'})}</td>
      <td><span class="badge badge-red" style="font-size:10px">${f.tipo}</span></td>
      <td style="font-size:12px">${f.razon}</td>
      <td><button class="tb-btn danger" style="padding:3px 8px;font-size:10px" onclick="eliminarBloqueo('${f.id}')">✕</button></td>
    </tr>`).join('');
}

async function eliminarBloqueo(id) {
  if (!confirm('¿Eliminar este bloqueo?')) return;
  const { error } = await db.from('fechas_bloqueadas').delete().eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Bloqueo eliminado');
  cargarFechasBloqueadasConfig();
  await cargarFechasBloqueadas();
  await marcarDiasConCitas();
}