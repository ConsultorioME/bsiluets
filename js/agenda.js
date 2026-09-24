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
let diaActivo     = fmtFecha(new Date()); // día mostrado en la vista móvil (lista)

let fechasBloqueadasSet = new Set();
window._fechasBloqueadasData = {};

let _citasPorDiaCache    = {};
let _bloqueosPorDiaCache = {};

// Estado original de la cita que se está editando (para detectar cuándo
// pasa a "completada") y datos del paciente para el aviso post-guardado.
let citaEstadoAlAbrir        = null;
let citaCompletadaPacienteId = null;
let citaCompletadaId         = null; // id de la cita — se usa para vincular (cita_id) la visita/cobro que se registre desde el aviso, y así poder cuadrar Agenda con Pagos/Paquetes & Visitas.

// Fecha/hora originales de la cita en edición: si cambian, el recordatorio
// de WhatsApp ya enviado deja de valer y la cita vuelve a "Sin enviar".
let citaFechaAlAbrir = null;
let citaHoraAlAbrir  = null;

// ── PERMISOS: SOLO ADMIN PUEDE CANCELAR / ELIMINAR CITAS ──
// Evita que una cita "Completada" (con tratamiento ya aplicado) se cambie a
// "Cancelada" o se borre para tapar un cobro que no se registró (robo hormiga).
function esAdminAgenda() {
  try {
    const u = JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}');
    return u.rol === 'admin';
  } catch (e) {
    return false;
  }
}

// Oculta la opción "Cancelada" del select de Estado para quien no sea Admin.
function aplicarPermisosEstadoCita() {
  const opt = document.querySelector('#cita-estado option[value="cancelada"]');
  if (!opt) return;
  const esAdmin = esAdminAgenda();
  opt.hidden   = !esAdmin;
  opt.disabled = !esAdmin;
  // Si el select había quedado en "cancelada" (cita cargada antes de este
  // cambio de permisos) y el usuario no es Admin, no se toca — solo se le
  // impide dejarla así de nuevo si la cambia y regresa.
}

// ── ROL DE SOLO LECTURA (p. ej. la doctora, que solo consulta su agenda) ──
function esRolSoloLectura() {
  try {
    const u = JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}');
    return u.rol === 'doctora';
  } catch (e) {
    return false;
  }
}

// ── FORMATO DE HORA 12H (para la lista del día) ──
function formatHora12(hhmm) {
  if (!hhmm) return { h: '--:--', ampm: '' };
  const [hh, mm] = hhmm.substring(0, 5).split(':').map(Number);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { h: `${h12}:${String(mm).padStart(2, '0')}`, ampm: hh < 12 ? 'AM' : 'PM' };
}

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
  const soloLectura = esRolSoloLectura();
  const btnDesktop = document.getElementById('btn-nueva-cita-desktop');
  if (btnDesktop) btnDesktop.style.display = soloLectura ? 'none' : '';

  if (!soloLectura) await cargarSelectsPacientesTratamientos();
  await cargarCitasSemana();
}

// ── NAVEGACIÓN DE SEMANA ──
function semanaNav(dir) {
  semanaInicio.setDate(semanaInicio.getDate() + dir * 7);
  cargarCitasSemana();
}

function irHoySemana() {
  semanaInicio = getLunesSemana(new Date());
  diaActivo    = fmtFecha(new Date());
  cargarCitasSemana();
}

// ── NAVEGACIÓN DE DÍA (vista móvil) ──
function diaNav(dir) {
  const d = new Date(diaActivo + 'T12:00:00');
  d.setDate(d.getDate() + dir);
  const nuevaFecha = fmtFecha(d);
  const nuevoLunes  = getLunesSemana(d);

  if (fmtFecha(nuevoLunes) !== fmtFecha(semanaInicio)) {
    semanaInicio = nuevoLunes;
    diaActivo    = nuevaFecha;
    cargarCitasSemana(); // el día cayó fuera de la semana cargada: recarga
  } else {
    diaActivo = nuevaFecha;
    renderVistaMovil(_citasPorDiaCache, _bloqueosPorDiaCache); // misma semana: solo repinta
  }
}

function seleccionarDia(fecha) {
  diaActivo = fecha;
  renderVistaMovil(_citasPorDiaCache, _bloqueosPorDiaCache);
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

  // ── CRUCE CON PAGOS / VISITAS: ¿esta cita "Completada" tiene un cobro o
  // una sesión registrada (cita_id), o sigue sin evidencia de haberse
  // cobrado? Evita que una cita se marque Completada y el cobro "se le
  // pase" a la capturista sin que quede visible en la Agenda.
  const idsCompletadas = (citas || []).filter(c => c.estado === 'completada').map(c => c.id);
  const citasConRegistro = new Set();
  if (idsCompletadas.length) {
    const [{ data: pagosLigados }, { data: visitasLigadas }] = await Promise.all([
      db.from('pagos').select('cita_id').in('cita_id', idsCompletadas).eq('eliminado', false),
      db.from('visitas').select('cita_id').in('cita_id', idsCompletadas).eq('eliminado', false),
    ]);
    (pagosLigados   || []).forEach(p => p.cita_id && citasConRegistro.add(p.cita_id));
    (visitasLigadas || []).forEach(v => v.cita_id && citasConRegistro.add(v.cita_id));
  }
  (citas || []).forEach(c => {
    c._sinRegistro = c.estado === 'completada' && !citasConRegistro.has(c.id);
  });

  const citasPorDia = {};
  (citas || []).forEach(c => {
    if (!citasPorDia[c.fecha]) citasPorDia[c.fecha] = [];
    citasPorDia[c.fecha].push(c);
  });

  // Si el día activo de la vista móvil quedó fuera de la semana visible, se ajusta al lunes
  if (!dias.some(d => fmtFecha(d) === diaActivo)) diaActivo = fmtFecha(dias[0]);

  _citasPorDiaCache    = citasPorDia;
  _bloqueosPorDiaCache = bloqueosPorDia;

  renderSemanaGrid(citasPorDia, bloqueosPorDia);
  renderVistaMovil(citasPorDia, bloqueosPorDia);
  cargarPanelConfirmaciones();

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

  const soloLectura = esRolSoloLectura();

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
      const clickAttr = soloLectura ? '' : `onclick="event.stopPropagation();editarCita('${c.id}')"`;
      const avisoSinRegistro = c._sinRegistro
        ? `<span title="Completada sin cobro ni visita registrada en Pagos/Paquetes & Visitas" style="position:absolute;top:2px;right:3px;font-size:10px;line-height:1;text-shadow:0 0 2px #000">⚠️</span>`
        : '';
      return `<div ${clickAttr}
                title="${horaTxt} — ${nombre} — ${trat}${c._sinRegistro ? ' — ⚠ sin cobro/visita registrada' : ''}"
                style="position:absolute;left:2px;right:2px;top:${top}px;height:${alto}px;background:${color};border-radius:3px;padding:3px 5px;overflow:hidden;cursor:${soloLectura ? 'default' : 'pointer'};font-size:10px;line-height:1.25;color:#1a1a1a;font-family:'Inter',sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.3);z-index:1">
                ${avisoSinRegistro}
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
      return `<div style="position:absolute;left:0;right:0;top:${top}px;height:${alto}px;background:repeating-linear-gradient(45deg,rgba(15,23,42,.025),rgba(15,23,42,.025) 8px,rgba(15,23,42,.06) 8px,rgba(15,23,42,.06) 16px)"></div>`;
    }).join('');

    return `
      <div style="display:flex;flex-direction:column;min-width:0">
        <div style="height:${ROW_H}px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;border-left:1px solid rgba(184,147,90,.18);background:${esHoy ? 'rgba(184,147,90,.18)' : 'transparent'}">
          <div style="font-size:10px;letter-spacing:.1em;color:var(--gold);opacity:.6">${nombresDia[d.getDay()]}</div>
          <div style="font-family:'Space Grotesk',sans-serif;font-size:19px;color:${esHoy ? 'var(--gold)' : 'var(--cream)'}">${d.getDate()}</div>
        </div>
        <div ${soloLectura ? '' : `onclick="crearCitaEnSlot(event,'${fecha}')"`}
             style="position:relative;height:${alturaTotal}px;border-left:1px solid rgba(184,147,90,.18);cursor:${(bloqueo || soloLectura) ? (soloLectura ? 'default' : 'not-allowed') : 'copy'};background-image:repeating-linear-gradient(to bottom, rgba(184,147,90,.13) 0, rgba(184,147,90,.13) 1px, transparent 1px, transparent ${ROW_H}px)">
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

// ── DIBUJAR LA VISTA MÓVIL (DÍA EN LISTA) ──
function renderVistaMovil(citasPorDia, bloqueosPorDia) {
  const navFecha = document.getElementById('dia-nav-fecha');
  const navDia   = document.getElementById('dia-nav-dia');
  const weekstrip = document.getElementById('agenda-weekstrip');
  const lista     = document.getElementById('dia-lista');
  const btnFab    = document.getElementById('btn-nueva-cita-mobile');
  if (!navFecha || !lista) return;

  const dias      = diasSemanaArray();
  const hoyStr    = fmtFecha(new Date());
  const nombresD  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const nombresC  = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const meses     = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const soloLectura = esRolSoloLectura();

  const fechaActivaDate = new Date(diaActivo + 'T12:00:00');
  navFecha.textContent = diaActivo === hoyStr
    ? `Hoy, ${fechaActivaDate.getDate()} de ${meses[fechaActivaDate.getMonth()]}`
    : `${fechaActivaDate.getDate()} de ${meses[fechaActivaDate.getMonth()]}`;
  navDia.textContent = nombresD[fechaActivaDate.getDay()];

  // Tira de días de la semana
  weekstrip.innerHTML = dias.map(d => {
    const fecha = fmtFecha(d);
    const clases = ['wchip'];
    if (fecha === hoyStr) clases.push('today');
    if (fecha === diaActivo) clases.push('selected');
    if ((citasPorDia[fecha] || []).length > 0) clases.push('has-citas');
    return `<button class="${clases.join(' ')}" onclick="seleccionarDia('${fecha}')">
              <span class="wl">${nombresC[d.getDay()]}</span>
              <span class="wn">${d.getDate()}</span>
              <span class="wdot"></span>
            </button>`;
  }).join('');

  // Lista de citas del día seleccionado
  const bloqueo = bloqueosPorDia[diaActivo];
  const citas   = (citasPorDia[diaActivo] || []);

  if (bloqueo) {
    const tipos = { vacaciones: 'Vacaciones', cierre: 'Cierre del consultorio', festivo: 'Día festivo', otro: 'Otro motivo' };
    lista.innerHTML = `<div class="agenda-blocked">🔒 ${tipos[bloqueo.tipo] || bloqueo.tipo}<br>${bloqueo.razon}</div>`;
  } else if (citas.length === 0) {
    lista.innerHTML = `<div class="agenda-empty">Sin citas este día</div>`;
  } else {
    lista.innerHTML = citas.map(c => {
      const { h, ampm } = formatHora12(c.hora);
      const color  = coloresEstadoLista[c.estado] || coloresEstadoLista.pendiente;
      const nombre = c.pacientes ? `${c.pacientes.nombre} ${c.pacientes.apellidos}` : 'Sin paciente';
      const trat   = c.tratamientos?.nombre || '';
      const clickAttr = soloLectura ? '' : `onclick="editarCita('${c.id}')"`;
      const avisoSinRegistro = c._sinRegistro
        ? `<span title="Completada sin cobro ni visita registrada en Pagos/Paquetes & Visitas" style="font-size:13px;margin-left:4px">⚠️</span>`
        : '';
      return `<div class="appt-card" ${clickAttr}>
                <div class="appt-time"><div class="h">${h}</div><div class="m">${ampm}</div></div>
                <div class="appt-body"><div class="appt-name">${nombre}${avisoSinRegistro}</div><div class="appt-trat">${trat}</div></div>
                <div class="appt-status" style="background:${color}"></div>
              </div>`;
    }).join('');
  }

  if (btnFab) btnFab.style.display = (soloLectura || bloqueo) ? 'none' : '';
}

const coloresEstadoLista = {
  pendiente:  '#E8B84B',
  confirmada: '#27AE60',
  en_sala:    '#2980B9',
  completada: '#8a8a8a',
  cancelada:  '#e74c3c',
};

// ── CREAR CITA AL DAR CLIC EN UN ESPACIO VACÍO DE LA CUADRÍCULA ──
function crearCitaEnSlot(ev, fecha) {
  if (esRolSoloLectura()) return;
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

// ── ABRIR MODAL DESDE EL BOTÓN "+ NUEVA CITA" (vista de escritorio) ──
function abrirModalCita() {
  const hoy   = fmtFecha(new Date());
  const dias  = diasSemanaArray().map(fmtFecha);
  const fechaDefault = dias.includes(hoy) ? hoy : dias[0];
  abrirModalCitaParaFecha(fechaDefault);
}

// ── ABRIR MODAL DE NUEVA CITA PARA UNA FECHA ESPECÍFICA (usado por la vista móvil) ──
function abrirModalCitaParaFecha(fecha) {
  if (esRolSoloLectura()) return;
  limpiarFormCita();

  const bloqueo = verificarFechaBloqueada(fecha);
  if (bloqueo) {
    const tipos = { vacaciones: 'Vacaciones', cierre: 'Cierre del consultorio', festivo: 'Día festivo', otro: 'Otro motivo' };
    showToast(`⛔ No se pueden agendar citas — ${tipos[bloqueo.tipo] || bloqueo.tipo}: ${bloqueo.razon}`);
    return;
  }

  document.getElementById('cita-fecha').value = fecha;
  document.getElementById('cita-hora').value  = '';
  checkFechaBloqueada(fecha);
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
  if (esRolSoloLectura()) { showToast('🔒 Tu usuario solo tiene acceso de lectura a la Agenda'); return; }
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
  if (!datos.fecha)          { showToast('⚠ La fecha es obligatoria'); return; }
  if (!datos.hora)           { showToast('⚠ La hora es obligatoria'); return; }
  if (!datos.tratamiento_id) { showToast('⚠ El tratamiento es obligatorio'); return; }

  // Solo un Admin puede dejar una cita como "Cancelada" — evita que se use
  // para tapar una cita ya atendida (y su cobro) sin dejar rastro.
  if (datos.estado === 'cancelada' && !esAdminAgenda()) {
    showToast('🔒 Solo un Administrador puede cancelar una cita');
    return;
  }

  const bloqueo = verificarFechaBloqueada(datos.fecha);
  if (bloqueo) {
    showToast(`⛔ Fecha bloqueada: ${bloqueo.razon}`);
    return;
  }

  if (!citaCaeDentroHorario(datos.fecha, datos.hora, datos.duracion_min)) {
    showToast('⛔ Ese horario está fuera de tus Horarios de Atención (revisa Configuración)');
    return;
  }

  // Rastro de la confirmación: quién la confirmó y cuándo. Si la recepción
  // la marca a mano (p. ej. confirmó por llamada) queda como 'recepcion';
  // cuando el paciente confirma desde el enlace lo registra la función SQL.
  if (datos.estado === 'confirmada' && citaEstadoAlAbrir !== 'confirmada') {
    datos.confirmada_at  = new Date().toISOString();
    datos.confirmada_por = 'recepcion';
  } else if (datos.estado !== 'confirmada' && citaEstadoAlAbrir === 'confirmada') {
    datos.confirmada_at  = null;
    datos.confirmada_por = null;
  }
  // Si se movió la fecha u hora, el recordatorio enviado ya no aplica.
  if (id && (datos.fecha !== citaFechaAlAbrir || datos.hora !== citaHoraAlAbrir)) {
    datos.confirmacion_enviada_at = null;
    datos.confirmacion_envios     = 0;
    datos.respuesta_paciente      = null;
    datos.respuesta_at            = null;
  }

  let error, citaId = id;
  if (id) {
    ({ error } = await db.from('agenda').update(datos).eq('id', id));
  } else {
    const { data: citaInsertada, error: errIns } = await db.from('agenda').insert([datos]).select('id').single();
    error  = errIns;
    citaId = citaInsertada?.id || null;
  }
  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('nueva-cita');
  showToast(id ? '✓ Cita actualizada' : '✓ Cita agendada correctamente');

  // ¿La cita acaba de pasar a "Completada"? Si tiene paciente asociado,
  // ofrecemos ir directo a registrar el cobro/visita en Paquetes & Visitas
  // para que no se le olvide a la capturista. Guardamos el id de la cita
  // para que, si se registra, quede vinculada (cita_id) y así poder cuadrar
  // Agenda con Pagos/Paquetes & Visitas más adelante.
  const pasoACompletada = datos.estado === 'completada' && citaEstadoAlAbrir !== 'completada';
  let pacienteNombre = '';
  if (pasoACompletada && datos.paciente_id) {
    const selPac = document.getElementById('cita-paciente');
    pacienteNombre = selPac?.options[selPac.selectedIndex]?.text || '';
  }

  limpiarFormCita();

  // Si la cita cae fuera de la semana visible, saltamos a esa semana
  const fechaCita = new Date(datos.fecha + 'T12:00:00');
  semanaInicio = getLunesSemana(fechaCita);
  await cargarCitasSemana();

  if (pasoACompletada && datos.paciente_id) {
    mostrarAvisoCitaCompletada(datos.paciente_id, pacienteNombre, citaId);
  }
}

// ── EDITAR CITA ──
async function editarCita(id) {
  const { data: c, error } = await db.from('agenda')
    .select('*, pacientes(nombre,apellidos,telefono), tratamientos(nombre)')
    .eq('id', id).single();
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
  citaEstadoAlAbrir = c.estado || 'pendiente';
  citaFechaAlAbrir  = c.fecha;
  citaHoraAlAbrir   = c.hora?.substring(0, 5) || '';
  aplicarPermisosEstadoCita();
  renderBoxWhatsappCita(c);

  document.querySelector('#modal-nueva-cita .modal-title').textContent = 'Editar Cita';
  const btnEliminar = document.getElementById('btn-eliminar-cita');
  if (btnEliminar) btnEliminar.style.display = 'inline-block';
  openModal('nueva-cita');
}

// ── AVISO: CITA COMPLETADA → REGISTRAR VISITA/COBRO ──
function mostrarAvisoCitaCompletada(pacienteId, pacienteNombre, citaId) {
  citaCompletadaPacienteId = pacienteId;
  citaCompletadaId         = citaId || null;
  const nombreEl = document.getElementById('cita-completada-paciente');
  if (nombreEl) nombreEl.textContent = pacienteNombre || 'el paciente';
  openModal('cita-completada');
}

// ── DESCARTAR EL AVISO SIN REGISTRAR NADA ──
function descartarAvisoCitaCompletada() {
  closeModal('cita-completada');
  citaCompletadaPacienteId = null;
  citaCompletadaId         = null;
}

// ── IR A REGISTRAR LA VISITA/COBRO EN PAQUETES & VISITAS ──
async function irARegistrarVisitaDesdeAgenda() {
  const pacienteId = citaCompletadaPacienteId;
  closeModal('cita-completada');
  if (!pacienteId) return;

  showModule('paquetes', document.querySelector('.nav-item[onclick*="paquetes"]'));
  await initPaquetes();

  const sel = document.getElementById('vis-paciente');
  if (sel) {
    sel.value = pacienteId;
    await cargarPaqueteVis();
    sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // citaCompletadaId queda disponible para que generarNotaVis() (paquetes.js)
  // vincule (cita_id) la visita que se registre a continuación con esta cita.
}

// ── ELIMINAR CITA DESDE EL MODAL DE EDICIÓN ──
async function eliminarCitaDesdeModal() {
  if (esRolSoloLectura()) { showToast('🔒 Tu usuario solo tiene acceso de lectura a la Agenda'); return; }
  const id = document.getElementById('cita-id').value;
  if (!id) return;
  if (!confirm('¿Seguro que quieres eliminar esta cita? Esta acción no se puede deshacer.')) return;

  if (typeof requiereAutorizacionAdmin === 'function' && requiereAutorizacionAdmin()) {
    const autorizado = await pedirAutorizacionAdmin('Eliminar una cita requiere autorización de un Administrador.');
    if (!autorizado) return;
  }

  const { error } = await db.from('agenda').delete().eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  closeModal('nueva-cita');
  limpiarFormCita();
  showToast('✓ Cita eliminada');
  await cargarCitasSemana();
}

// ── ELIMINAR CITA ──
async function eliminarCita(id) {
  if (esRolSoloLectura()) { showToast('🔒 Tu usuario solo tiene acceso de lectura a la Agenda'); return; }
  if (!confirm('¿Eliminar esta cita?')) return;

  if (typeof requiereAutorizacionAdmin === 'function' && requiereAutorizacionAdmin()) {
    const autorizado = await pedirAutorizacionAdmin('Eliminar una cita requiere autorización de un Administrador.');
    if (!autorizado) return;
  }

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
  citaEstadoAlAbrir = null;
  citaFechaAlAbrir  = null;
  citaHoraAlAbrir   = null;
  aplicarPermisosEstadoCita();
  const boxWa = document.getElementById('cita-whatsapp-box');
  if (boxWa) { boxWa.style.display = 'none'; boxWa.innerHTML = ''; }
  const titulo = document.querySelector('#modal-nueva-cita .modal-title');
  if (titulo) titulo.textContent = 'Nueva Cita';
  const btnEliminar = document.getElementById('btn-eliminar-cita');
  if (btnEliminar) btnEliminar.style.display = 'none';
}

// ── FECHAS BLOQUEADAS ──
async function guardarBloqueo() {
  if (esRolSoloLectura()) { showToast('🔒 Tu usuario solo tiene acceso de lectura a la Agenda'); return; }
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

  const hoy = fechaHoyISO();
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
  if (esRolSoloLectura()) { showToast('🔒 Tu usuario solo tiene acceso de lectura a la Agenda'); return; }
  if (!confirm('¿Eliminar este bloqueo?')) return;
  const { error } = await db.from('fechas_bloqueadas').delete().eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Bloqueo eliminado');
  cargarFechasBloqueadasConfig();
  await cargarCitasSemana();
}

// ─────────────────────────────────────────
//  CONFIRMACIÓN DE CITAS POR WHATSAPP (Fase 1)
//  La recepción envía el recordatorio con un clic (se abre WhatsApp con el
//  mensaje ya escrito). El mensaje lleva un enlace a confirmar.html, donde
//  el PACIENTE confirma y la cita pasa sola a "Confirmada" — nadie tiene
//  que acordarse de marcarla. Requiere sql/confirmacion_whatsapp.sql.
// ─────────────────────────────────────────

let _citasConfCache     = {};    // id → cita (panel y modal), para armar el mensaje
let _panelConfColapsado = false;

// Días que cubre el panel: desde mañana hasta el siguiente día hábil entre
// semana, incluyendo sábados/domingos abiertos que haya en medio. Así el
// viernes se ven las del sábado (si abren) Y las del lunes, y antes de un
// festivo (Fechas bloqueadas) se ven las del día en que se reabre.
function fechasParaConfirmar(bloqueadas) {
  const fechas = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    const f = fmtFecha(d);
    const abierto = obtenerRangosParaFecha(f).length > 0 && !bloqueadas.has(f);
    if (!abierto) continue;
    fechas.push(f);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) break;
  }
  return fechas;
}

// Teléfono → formato internacional para wa.me (México: 52 + 10 dígitos).
function normalizarTelWhatsapp(tel) {
  const dig = String(tel || '').replace(/\D/g, '');
  if (dig.length === 10) return '52' + dig;
  if (dig.length === 12 && dig.startsWith('52')) return dig;
  if (dig.length === 13 && dig.startsWith('521')) return '52' + dig.slice(3);
  return null;
}

function linkConfirmacion(c) {
  return new URL('confirmar.html?c=' + c.confirmacion_token, window.location.href).href;
}

function fechaLargaCita(fecha) {
  const d = new Date(fecha + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

function horaCitaTexto(hora) {
  const { h, ampm } = formatHora12(hora);
  return `${h} ${ampm === 'AM' ? 'a.m.' : 'p.m.'}`;
}

function mensajeConfirmacion(c) {
  const nombre = (c.pacientes?.nombre || '').trim().split(/\s+/)[0] || '';
  const trat   = c.tratamientos?.nombre ? `\n💆 ${c.tratamientos.nombre}` : '';
  return `Hola ${nombre} 👋\n` +
    `Te recordamos tu cita en *B·Siluets*:\n\n` +
    `📅 ${fechaLargaCita(c.fecha)}\n` +
    `🕐 ${horaCitaTexto(c.hora)}${trat}\n\n` +
    `Por favor confirma tu asistencia aquí:\n${linkConfirmacion(c)}\n\n` +
    `Si necesitas cambiar tu cita, en el mismo enlace puedes avisarnos. ¡Te esperamos!`;
}

function horaCortaDeTimestamp(ts) {
  const d = new Date(ts);
  const hora = d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  return fmtFecha(d) === fechaHoyISO() ? hora : `${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} ${hora}`;
}

// Situación del recordatorio de una cita → { clave, html, accion }
function estadoConfirmacion(c) {
  const tel = normalizarTelWhatsapp(c.pacientes?.telefono);
  if (c.estado === 'confirmada') {
    const quien = c.confirmada_por === 'paciente' ? 'por el paciente' : (c.confirmada_por === 'recepcion' ? 'por recepción' : '');
    return { clave: 'confirmada', html: `🟢 Confirmada${quien ? `<small>${quien}</small>` : ''}`, accion: '' };
  }
  if (!c.paciente_id) {
    return { clave: 'sin_tel', html: '⚠️ Sin paciente asignado', accion: '' };
  }
  if (c.respuesta_paciente === 'reagendar') {
    return {
      clave: 'reagendar',
      html: `🟠 Pidió reagendar<small>Contáctalo y mueve la cita</small>`,
      accion: tel ? `<button class="conf-btn sec" onclick="event.stopPropagation();abrirChatWhatsapp('${c.id}')">📲 Escribirle</button>` : '',
    };
  }
  if (!tel) {
    return { clave: 'sin_tel', html: `⚠️ ${c.pacientes?.telefono ? 'Teléfono no válido' : 'Sin teléfono'}<small>Corrígelo en Pacientes</small>`, accion: '' };
  }
  if (c.confirmacion_enviada_at) {
    const veces = (c.confirmacion_envios || 0) > 1 ? ` (${c.confirmacion_envios} veces)` : '';
    return {
      clave: 'enviado',
      html: `🟡 Mensaje enviado ${horaCortaDeTimestamp(c.confirmacion_enviada_at)}${veces}<small>Sin respuesta todavía</small>`,
      accion: `<button class="conf-btn sec" onclick="event.stopPropagation();enviarConfirmacionWhatsapp('${c.id}')">Reenviar 📲</button>`,
    };
  }
  return {
    clave: 'sin_enviar',
    html: '🔴 Sin enviar',
    accion: `<button class="conf-btn" onclick="event.stopPropagation();enviarConfirmacionWhatsapp('${c.id}')">Enviar 📲</button>`,
  };
}

// ── PANEL "CONFIRMACIONES" ARRIBA DE LA AGENDA (todas las agendas) ──
async function cargarPanelConfirmaciones() {
  const panel = document.getElementById('panel-confirmaciones');
  if (!panel) return;
  if (esRolSoloLectura()) { panel.style.display = 'none'; return; }

  const ini = new Date(); ini.setDate(ini.getDate() + 1);
  const fin = new Date(); fin.setDate(fin.getDate() + 15);
  const { data: bloq } = await db.from('fechas_bloqueadas').select('fecha')
    .gte('fecha', fmtFecha(ini)).lte('fecha', fmtFecha(fin));
  const fechas = fechasParaConfirmar(new Set((bloq || []).map(b => b.fecha)));
  if (!fechas.length) { panel.style.display = 'none'; return; }

  const { data: citas, error } = await db.from('agenda')
    .select('id, fecha, hora, estado, agenda_tipo, paciente_id, confirmacion_token, confirmacion_enviada_at, confirmacion_envios, confirmada_por, respuesta_paciente, pacientes(nombre,apellidos,telefono), tratamientos(nombre)')
    .in('fecha', fechas)
    .in('estado', ['pendiente', 'confirmada'])
    .order('fecha').order('hora');

  // Si aún no se ejecutó el SQL de confirmaciones, el panel simplemente no aparece.
  if (error || !citas || !citas.length) { panel.style.display = 'none'; return; }

  citas.forEach(c => { _citasConfCache[c.id] = c; });
  const estados  = citas.map(c => ({ c, e: estadoConfirmacion(c) }));
  const contar   = clave => estados.filter(x => x.e.clave === clave).length;
  const nConf    = contar('confirmada');
  const nSinEnv  = contar('sin_enviar');
  const nEnviado = contar('enviado');
  const nReag    = contar('reagendar');
  const nSinTel  = contar('sin_tel');

  const diasTxt = fechas.map(f =>
    new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' })
  ).join(' y ');
  const titulo = fechas.length === 1 && fechas[0] === fmtFecha(ini)
    ? `📲 Confirmaciones para mañana (${diasTxt})`
    : `📲 Confirmaciones para ${diasTxt}`;

  const resumen = [
    `<span style="color:#27AE60">${nConf} de ${citas.length} confirmada${citas.length !== 1 ? 's' : ''}</span>`,
    nSinEnv  ? `<span style="color:#e74c3c">🔴 ${nSinEnv} sin enviar</span>` : '',
    nEnviado ? `<span style="color:#B7950B">🟡 ${nEnviado} sin respuesta</span>` : '',
    nReag    ? `<span style="color:#E67E22">🟠 ${nReag} por reagendar</span>` : '',
    nSinTel  ? `<span style="color:#E67E22">⚠️ ${nSinTel} sin teléfono</span>` : '',
  ].filter(Boolean).join('');

  let cuerpo;
  if (nConf === citas.length) {
    cuerpo = `<div class="conf-ok">✓ Todas las citas están confirmadas.</div>`;
  } else {
    let diaPrevio = null;
    cuerpo = estados.map(({ c, e }) => {
      let encabezado = '';
      if (fechas.length > 1 && c.fecha !== diaPrevio) {
        diaPrevio  = c.fecha;
        encabezado = `<div class="conf-dia">${fechaLargaCita(c.fecha)}</div>`;
      }
      const { h, ampm } = formatHora12(c.hora);
      const nombre = c.pacientes ? `${c.pacientes.nombre} ${c.pacientes.apellidos || ''}` : 'Sin paciente';
      return `${encabezado}
        <div class="conf-row">
          <div class="conf-hora">${h} <small style="font-weight:400;opacity:.6">${ampm}</small></div>
          <div class="conf-pac" onclick="editarCita('${c.id}')" title="Abrir la cita">${nombre}</div>
          <div class="conf-trat">${c.tratamientos?.nombre || ''}<small>${c.agenda_tipo || ''}</small></div>
          <div class="conf-est">${e.html}</div>
          <div class="conf-accion">${e.accion}</div>
        </div>`;
    }).join('');
  }

  panel.className = 'conf-panel' + (_panelConfColapsado ? ' collapsed' : '');
  panel.innerHTML = `
    <div class="conf-head" onclick="togglePanelConfirmaciones()">
      <span class="conf-head-title">${titulo}</span>
      <span class="conf-head-res">${resumen}<span style="opacity:.4">${_panelConfColapsado ? '▾' : '▴'}</span></span>
    </div>
    <div class="conf-body">${cuerpo}</div>`;
  panel.style.display = '';
}

function togglePanelConfirmaciones() {
  _panelConfColapsado = !_panelConfColapsado;
  cargarPanelConfirmaciones();
}

// ── ENVIAR EL RECORDATORIO ──
async function enviarConfirmacionWhatsapp(id) {
  const c = _citasConfCache[id];
  if (!c) return;
  const tel = normalizarTelWhatsapp(c.pacientes?.telefono);
  if (!tel) { showToast('⚠ El paciente no tiene un teléfono válido de 10 dígitos'); return; }
  if (!c.confirmacion_token) { showToast('⚠ Falta ejecutar el SQL de confirmaciones en Supabase'); return; }

  // Se abre ANTES de cualquier await para que el navegador no lo bloquee.
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajeConfirmacion(c))}`, '_blank');

  if (['localhost', '127.0.0.1', ''].includes(window.location.hostname)) {
    showToast('⚠ Estás en modo local: el enlace del mensaje no abrirá en el celular del paciente');
  }

  const cambios = {
    confirmacion_enviada_at: new Date().toISOString(),
    confirmacion_envios:     (c.confirmacion_envios || 0) + 1,
  };
  const { error } = await db.from('agenda').update(cambios).eq('id', id);
  if (error) { showToast('❌ No se pudo registrar el envío: ' + error.message); return; }
  Object.assign(c, cambios);

  if (document.getElementById('cita-id')?.value === id) renderBoxWhatsappCita(c);
  cargarPanelConfirmaciones();
}

// Abre el chat con el paciente sin mensaje prellenado (p. ej. pidió reagendar).
function abrirChatWhatsapp(id) {
  const tel = normalizarTelWhatsapp(_citasConfCache[id]?.pacientes?.telefono);
  if (!tel) { showToast('⚠ El paciente no tiene un teléfono válido'); return; }
  window.open(`https://wa.me/${tel}`, '_blank');
}

// ── RECUADRO DE WHATSAPP DENTRO DEL MODAL "EDITAR CITA" ──
function renderBoxWhatsappCita(c) {
  const box = document.getElementById('cita-whatsapp-box');
  if (!box) return;
  const vigente = ['pendiente', 'confirmada'].includes(c.estado) && c.fecha >= fechaHoyISO();
  if (!vigente || !c.paciente_id || !c.confirmacion_token) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  _citasConfCache[c.id] = c;
  const e = estadoConfirmacion(c);
  let accion = e.accion;
  if (e.clave === 'confirmada' && normalizarTelWhatsapp(c.pacientes?.telefono)) {
    accion = `<button class="conf-btn sec" onclick="enviarConfirmacionWhatsapp('${c.id}')">Enviar recordatorio 📲</button>`;
  }
  box.innerHTML = `
    <div class="conf-est"><strong style="font-weight:500">Confirmación por WhatsApp:</strong> ${e.html}
      <small>El mensaje usa los datos guardados de la cita.</small></div>
    <div>${accion}</div>`;
  box.style.display = 'flex';
}
