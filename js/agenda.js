// ─────────────────────────────────────────
//  B·Siluets — Módulo Agenda (Vista Semanal)
//  Software SIE © 2025
// ─────────────────────────────────────────

// ── CONFIG DE LA CUADRÍCULA ──
const HORA_INICIO = 9;   // 9:00 am
const HORA_FIN    = 19;  // 7:00 pm
const ROW_H       = 52;  // px por hora

// ── ESTADO ──
let agendaActiva  = 'Dra. Bianca Salas';
let semanaInicio  = getLunesSemana(new Date());

let fechasBloqueadasSet = new Set();
window._fechasBloqueadasData = {};

// ── HELPERS DE FECHAS ──
function getLunesSemana(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0=Domingo
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function fmtFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasSemanaArray() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(semanaInicio);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// ── HORARIOS DE ATENCIÓN (configurados en Configuración → Horarios de Atención) ──
function horaEnMinutos(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Devuelve los turnos activos (en minutos) del día de la semana que le corresponde a "fecha"
function obtenerRangosParaFecha(fecha) {
  const h = window.horarioAtencion || HORARIO_ATENCION_DEFAULT;
  const d = new Date(fecha + 'T12:00:00');
  const dow = d.getDay(); // 0=domingo ... 6=sábado
  const grupo = dow === 0 ? h.dom : (dow === 6 ? h.sab : h.lv);
  const rangos = [];
  ['am', 'pm'].forEach(turno => {
    const t = grupo[turno];
    if (t && t.activo && t.ini && t.fin) rangos.push({ ini: t.ini, fin: t.fin });
  });
  return rangos;
}

// ¿La hora indicada cae dentro de algún turno activo de ese día?
function estaDentroHorario(fecha, horaHHMM) {
  const rangos = obtenerRangosParaFecha(fecha);
  if (rangos.length === 0) return false;
  const min = horaEnMinutos(horaHHMM);
  return rangos.some(r => min >= horaEnMinutos(r.ini) && min < horaEnMinutos(r.fin));
}

// ¿La cita completa (inicio + duración) cabe dentro de un solo turno activo, sin salirse?
function citaCaeDentroHorario(fecha, horaHHMM, duracionMin) {
  const rangos = obtenerRangosParaFecha(fecha);
  if (rangos.length === 0) return false;
  const inicio = horaEnMinutos(horaHHMM);
  const fin    = inicio + (parseInt(duracionMin) || 60);
  return rangos.some(r => inicio >= horaEnMinutos(r.ini) && fin <= horaEnMinutos(r.fin));
}

// Calcula los tramos SIN servicio dentro de la ventana visible de la cuadrícula (para pintarlos en gris)
function segmentosCerrados(rangos) {
  const ordenados = [...rangos].sort((a, b) => horaEnMinutos(a.ini) - horaEnMinutos(b.ini));
  const segmentos = [];
  let cursor = HORA_INICIO * 60;
  ordenados.forEach(r => {
    const ini = horaEnMinutos(r.ini), fin = horaEnMinutos(r.fin);
    if (ini > cursor) segmentos.push({ ini: cursor, fin: Math.min(ini, HORA_FIN * 60) });
    cursor = Math.max(cursor, fin);
  });
  if (cursor < HORA_FIN * 60) segmentos.push({ ini: cursor, fin: HORA_FIN * 60 });
  return segmentos.filter(s => s.fin > s.ini);
}

// ── AGENDA ACTIVA ──
function selAgenda(tipo, el) {
  agendaActiva = tipo;
  document.querySelectorAll('.agenda-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  cargarCitasSemana();
}

// ── INICIALIZAR AGENDA ──
async function initAgenda() {
  await cargarSelectsPacientesTratamientos();
  await cargarCitasSemana();
}

// ── NAVEGACIÓN DE SEMANA ──
function semanaNav(dir) {
  semanaInicio.setDate(semanaInicio.getDate() + dir * 7);
  cargarCitasSemana();
}

function irHoySemana() {
  semanaInicio = getLunesSemana(new Date());
  cargarCitasSemana();
}

// ── CARGAR CITAS + BLOQUEOS DE LA SEMANA VISIBLE ──
async function cargarCitasSemana() {
  const dias     = diasSemanaArray();
  const fechaIni = fmtFecha(dias[0]);
  const fechaFin = fmtFecha(dias[6]);

  const grid = document.getElementById('semana-grid');
  if (grid) grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--cream);opacity:.3;font-size:13px">Cargando...</div>`;

  const [{ data: citas, error: errCitas }, { data: bloqueos }] = await Promise.all([
    db.from('agenda')
      .select('*, pacientes(nombre,apellidos), tratamientos(nombre)')
      .gte('fecha', fechaIni).lte('fecha', fechaFin)
      .eq('agenda_tipo', agendaActiva)
      .order('hora'),
    db.from('fechas_bloqueadas')
      .select('fecha, razon, tipo')
      .gte('fecha', fechaIni).lte('fecha', fechaFin)
  ]);

  if (errCitas) {
    if (grid) grid.innerHTML = `<div style="color:#e74c3c;padding:16px;font-size:13px">Error: ${errCitas.message}</div>`;
    return;
  }

  fechasBloqueadasSet = new Set();
  window._fechasBloqueadasData = {};
  const bloqueosPorDia = {};
  (bloqueos || []).forEach(b => {
    fechasBloqueadasSet.add(b.fecha);
    window._fechasBloqueadasData[b.fecha] = b;
    bloqueosPorDia[b.fecha] = b;
  });

  const citasPorDia = {};
  (citas || []).forEach(c => {
    if (!citasPorDia[c.fecha]) citasPorDia[c.fecha] = [];
    citasPorDia[c.fecha].push(c);
  });

  renderSemanaGrid(citasPorDia, bloqueosPorDia);

  const resumen = document.getElementById('resumen-semana');
  if (resumen) {
    const total       = (citas || []).length;
    const confirmadas = (citas || []).filter(c => c.estado === 'confirmada').length;
    const pendientes  = (citas || []).filter(c => c.estado === 'pendiente').length;
    resumen.innerHTML = total > 0
      ? `<span style="color:var(--gold)">${total} cita${total > 1 ? 's' : ''} esta semana</span>
         <span style="opacity:.5;margin:0 6px">·</span>
         <span style="color:#27AE60">${confirmadas} confirmada${confirmadas !== 1 ? 's' : ''}</span>
         <span style="opacity:.5;margin:0 6px">·</span>
         <span style="color:#E67E22">${pendientes} pendiente${pendientes !== 1 ? 's' : ''}</span>`
      : `<span style="color:var(--cream);opacity:.35">Sin citas esta semana</span>`;
  }
}

// ── DIBUJAR LA CUADRÍCULA SEMANAL ──
function renderSemanaGrid(citasPorDia, bloqueosPorDia) {
  const dias        = diasSemanaArray();
  const hoyStr       = fmtFecha(new Date());
  const nombresDia   = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const meses        = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const ini = dias[0], fin = dias[6];
  const lbl = ini.getMonth() === fin.getMonth()
    ? `${ini.getDate()} – ${fin.getDate()} de ${meses[ini.getMonth()]} ${ini.getFullYear()}`
    : `${ini.getDate()} ${meses[ini.getMonth()]} – ${fin.getDate()} ${meses[fin.getMonth()]} ${fin.getFullYear()}`;
  const semanaLbl = document.getElementById('semana-lbl');
  if (semanaLbl) semanaLbl.textContent = lbl;

  const totalHoras  = HORA_FIN - HORA_INICIO;
  const alturaTotal = totalHoras * ROW_H;

  let horasHTML = `<div style="height:${ROW_H}px"></div>`;
  for (let h = HORA_INICIO; h < HORA_FIN; h++) {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    horasHTML += `<div style="height:${ROW_H}px;text-align:right;padding-right:8px;font-size:10px;color:var(--cream);opacity:.35;box-sizing:border-box">${h12}${h < 12 ? 'am' : 'pm'}</div>`;
  }

  const coloresEstado = {
    pendiente:  '#E8B84B',
    confirmada: '#27AE60',
    en_sala:    '#2980B9',
    completada: '#8a8a8a',
    cancelada:  '#e74c3c',
  };

  const colsHTML = dias.map(d => {
    const fecha  = fmtFecha(d);
    const esHoy  = fecha === hoyStr;
    const bloqueo = bloqueosPorDia[fecha];
    const citas  = citasPorDia[fecha] || [];

    const bloques = citas.map(c => {
      const partes    = (c.hora || '00:00').substring(0, 5).split(':').map(Number);
      const inicioMin = partes[0] * 60 + partes[1];
      const dur       = c.duracion_min || 60;
      let top   = ((inicioMin - HORA_INICIO * 60) / 60) * ROW_H;
      let alto  = Math.max((dur / 60) * ROW_H - 2, 18);
      top = Math.max(0, Math.min(top, alturaTotal - 4));
      const color  = coloresEstado[c.estado] || coloresEstado.pendiente;
      const nombre = c.pacientes ? `${c.pacientes.nombre} ${c.pacientes.apellidos}` : 'Sin paciente';
      const trat   = c.tratamientos?.nombre || '';
      const horaTxt = c.hora?.substring(0, 5) || '';
      return `<div onclick="event.stopPropagation();editarCita('${c.id}')"
                title="${horaTxt} — ${nombre} — ${trat}"
                style="position:absolute;left:2px;right:2px;top:${top}px;height:${alto}px;background:${color};border-radius:3px;padding:3px 5px;overflow:hidden;cursor:pointer;font-size:10px;line-height:1.25;color:#1a1a1a;font-family:'Jost',sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.3);z-index:1">
                <strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${horaTxt} ${nombre}</strong>
                <span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.75">${trat}</span>
              </div>`;
    }).join('');

    const overlayBloqueo = bloqueo
      ? `<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,rgba(231,76,60,.10),rgba(231,76,60,.10) 8px,rgba(231,76,60,.20) 8px,rgba(231,76,60,.20) 16px);display:flex;align-items:center;justify-content:center;text-align:center;padding:6px;font-size:10px;color:#e74c3c;z-index:2" title="${bloqueo.razon}">🔒 ${bloqueo.razon}</div>`
      : '';

    // Tramos fuera de los Horarios de Atención configurados (fuera de turno o día cerrado)
    const rangosServicio = obtenerRangosParaFecha(fecha);
    const overlaysCerrado = bloqueo ? '' : segmentosCerrados(rangosServicio).map(s => {
      const top  = ((s.ini - HORA_INICIO * 60) / 60) * ROW_H;
      const alto = ((s.fin - s.ini) / 60) * ROW_H;
      if (alto <= 0) return '';
      return `<div style="position:absolute;left:0;right:0;top:${top}px;height:${alto}px;background:repeating-linear-gradient(45deg,rgba(255,255,255,.015),rgba(255,255,255,.015) 8px,rgba(255,255,255,.04) 8px,rgba(255,255,255,.04) 16px)"></div>`;
    }).join('');

    return `
      <div style="display:flex;flex-direction:column;min-width:0">
        <div style="height:${ROW_H}px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;border-left:1px solid rgba(201,168,108,.1);background:${esHoy ? 'rgba(201,168,108,.1)' : 'transparent'}">
          <div style="font-size:10px;letter-spacing:.1em;color:var(--gold);opacity:.6">${nombresDia[d.getDay()]}</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:19px;color:${esHoy ? 'var(--gold)' : 'var(--cream)'}">${d.getDate()}</div>
        </div>
        <div onclick="crearCitaEnSlot(event,'${fecha}')"
             style="position:relative;height:${alturaTotal}px;border-left:1px solid rgba(201,168,108,.1);cursor:${bloqueo ? 'not-allowed' : 'copy'};background-image:repeating-linear-gradient(to bottom, rgba(201,168,108,.07) 0, rgba(201,168,108,.07) 1px, transparent 1px, transparent ${ROW_H}px)">
          ${overlaysCerrado}
          ${bloques}
          ${overlayBloqueo}
        </div>
      </div>`;
  }).join('');

  const grid = document.getElementById('semana-grid');
  if (!grid) return;
  grid.innerHTML = `
    <div style="display:grid;grid-template-columns:46px repeat(7,minmax(120px,1fr));min-width:900px">
      <div style="display:flex;flex-direction:column">${horasHTML}</div>
      ${colsHTML}
    </div>`;
}

// ── CREAR CITA AL DAR CLIC EN UN ESPACIO VACÍO DE LA CUADRÍCULA ──
function crearCitaEnSlot(ev, fecha) {
  const bloqueo = verificarFechaBloqueada(fecha);
  if (bloqueo) {
    const tipos = { vacaciones: 'Vacaciones', cierre: 'Cierre del consultorio', festivo: 'Día festivo', otro: 'Otro motivo' };
    showToast(`⛔ No se pueden agendar citas — ${tipos[bloqueo.tipo] || bloqueo.tipo}: ${bloqueo.razon}`);
    return;
  }

  const rect = ev.currentTarget.getBoundingClientRect();
  const y = ev.clientY - rect.top;
  let totalMin = HORA_INICIO * 60 + (y / ROW_H) * 60;
  totalMin = Math.round(totalMin / 15) * 15;
  totalMin = Math.max(HORA_INICIO * 60, Math.min(HORA_FIN * 60 - 15, totalMin));
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  const horaStr = `${hh}:${mm}`;

  if (!estaDentroHorario(fecha, horaStr)) {
    showToast('⛔ Ese horario está fuera de tus Horarios de Atención (Configuración)');
    return;
  }

  limpiarFormCita();
  document.getElementById('cita-fecha').value = fecha;
  document.getElementById('cita-hora').value  = horaStr;
  checkFechaBloqueada(fecha);
  cargarSelectsPacientesTratamientos();
  openModal('nueva-cita');
}

// ── ABRIR MODAL DESDE EL BOTÓN "+ NUEVA CITA" ──
function abrirModalCita() {
  limpiarFormCita();
  const hoy   = fmtFecha(new Date());
  const dias  = diasSemanaArray().map(fmtFecha);
  const fechaDefault = dias.includes(hoy) ? hoy : dias[0];

  const bloqueo = verificarFechaBloqueada(fechaDefault);
  if (bloqueo) {
    const tipos = { vacaciones: 'Vacaciones', cierre: 'Cierre del consultorio', festivo: 'Día festivo', otro: 'Otro motivo' };
    showToast(`⛔ No se pueden agendar citas — ${tipos[bloqueo.tipo] || bloqueo.tipo}: ${bloqueo.razon}`);
    return;
  }

  document.getElementById('cita-fecha').value = fechaDefault;
  document.getElementById('cita-hora').value  = '';
  checkFechaBloqueada(fechaDefault);
  cargarSelectsPacientesTratamientos();
  openModal('nueva-cita');
}

// ── CARGAR SELECTS ──
async function cargarSelectsPacientesTratamientos() {
  const { data: pacientes }    = await db.from('pacientes').select('id,nombre,apellidos').eq('activo', true).order('nombre');
  const { data: tratamientos } = await db.from('tratamientos').select('id,nombre').eq('activo', true).order('nombre');

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
    agenda_tipo:    agendaActiva,
  };
  if (!datos.fecha) { showToast('⚠ La fecha es obligatoria'); return; }
  if (!datos.hora)  { showToast('⚠ La hora es obligatoria'); return; }

  const bloqueo = verificarFechaBloqueada(datos.fecha);
  if (bloqueo) {
    showToast(`⛔ Fecha bloqueada: ${bloqueo.razon}`);
    return;
  }

  if (!citaCaeDentroHorario(datos.fecha, datos.hora, datos.duracion_min)) {
    showToast('⛔ Ese horario está fuera de tus Horarios de Atención (revisa Configuración)');
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

  // Si la cita cae fuera de la semana visible, saltamos a esa semana
  const fechaCita = new Date(datos.fecha + 'T12:00:00');
  semanaInicio = getLunesSemana(fechaCita);
  await cargarCitasSemana();
}

// ── EDITAR CITA ──
async function editarCita(id) {
  const { data: c, error } = await db.from('agenda').select('*').eq('id', id).single();
  if (error || !c) { showToast('❌ Error al cargar cita'); return; }

  await cargarSelectsPacientesTratamientos();

  document.getElementById('cita-id').value          = c.id;
  document.getElementById('cita-paciente').value    = c.paciente_id    || '';
  document.getElementById('cita-tratamiento').value = c.tratamiento_id || '';
  document.getElementById('cita-fecha').value       = c.fecha;
  document.getElementById('cita-hora').value        = c.hora?.substring(0, 5) || '';
  document.getElementById('cita-duracion').value    = c.duracion_min || 60;
  document.getElementById('cita-estado').value      = c.estado || 'pendiente';
  document.getElementById('cita-notas').value       = c.notas || '';

  document.querySelector('#modal-nueva-cita .modal-title').textContent = 'Editar Cita';
  const btnEliminar = document.getElementById('btn-eliminar-cita');
  if (btnEliminar) btnEliminar.style.display = 'inline-block';
  openModal('nueva-cita');
}

// ── ELIMINAR CITA DESDE EL MODAL DE EDICIÓN ──
async function eliminarCitaDesdeModal() {
  const id = document.getElementById('cita-id').value;
  if (!id) return;
  if (!confirm('¿Seguro que quieres eliminar esta cita? Esta acción no se puede deshacer.')) return;
  const { error } = await db.from('agenda').delete().eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  closeModal('nueva-cita');
  limpiarFormCita();
  showToast('✓ Cita eliminada');
  await cargarCitasSemana();
}

// ── ELIMINAR CITA ──
async function eliminarCita(id) {
  if (!confirm('¿Eliminar esta cita?')) return;
  const { error } = await db.from('agenda').delete().eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Cita eliminada');
  await cargarCitasSemana();
}

// ── LIMPIAR FORM ──
function limpiarFormCita() {
  ['cita-id', 'cita-notas'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['cita-paciente', 'cita-tratamiento'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cita-estado').value   = 'pendiente';
  document.getElementById('cita-duracion').value = '60';
  const titulo = document.querySelector('#modal-nueva-cita .modal-title');
  if (titulo) titulo.textContent = 'Nueva Cita';
  const btnEliminar = document.getElementById('btn-eliminar-cita');
  if (btnEliminar) btnEliminar.style.display = 'none';
}

// ── FECHAS BLOQUEADAS ──
async function guardarBloqueo() {
  const fechaIni = document.getElementById('bloqueo-fecha-ini').value;
  const fechaFin = document.getElementById('bloqueo-fecha-fin').value || fechaIni;
  const razon    = document.getElementById('bloqueo-razon').value.trim();
  const tipo     = document.getElementById('bloqueo-tipo').value;

  if (!fechaIni) { showToast('⚠ Selecciona la fecha inicial'); return; }
  if (!razon)    { showToast('⚠ Ingresa la razón del bloqueo'); return; }
  if (fechaFin < fechaIni) { showToast('⚠ La fecha final no puede ser menor a la inicial'); return; }

  const fechas = [];
  const cur = new Date(fechaIni + 'T12:00:00');
  const fin = new Date(fechaFin + 'T12:00:00');
  while (cur <= fin) {
    fechas.push({ fecha: cur.toISOString().split('T')[0], razon, tipo });
    cur.setDate(cur.getDate() + 1);
  }

  const { error } = await db.from('fechas_bloqueadas').insert(fechas);
  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('bloquear-fecha');
  const dias = fechas.length;
  showToast(`🔒 ${dias} día${dias > 1 ? 's' : ''} bloqueado${dias > 1 ? 's' : ''}: ${razon}`);

  document.getElementById('bloqueo-fecha-ini').value = '';
  document.getElementById('bloqueo-fecha-fin').value = '';
  document.getElementById('bloqueo-razon').value = '';

  await cargarCitasSemana();
}

function verificarFechaBloqueada(fecha) {
  if (!fechasBloqueadasSet.has(fecha)) return null;
  return window._fechasBloqueadasData[fecha];
}

function checkFechaBloqueada(fecha) {
  const alerta     = document.getElementById('alerta-fecha-bloqueada');
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
      <td>${new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
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
  await cargarCitasSemana();
}
