// ─────────────────────────────────────────
//  B·Siluets — Módulo Paquetes & Visitas
//  Software SIE © 2025
// ─────────────────────────────────────────

let pacSelIdx = -1;
let paqSelData = null;

// ── INICIALIZAR ──
async function initPaquetes() {
  await cargarPaquetes();
  await cargarSelectsModal();
  await cargarSelectVisita();
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('vis-fecha').value = hoy;
  document.getElementById('npaq-fecha').value = hoy;
  await cargarNotasHoy();
}

// ── CARGAR PAQUETES ──
async function cargarPaquetes(busqueda = '') {
  const tbody = document.getElementById('tabla-paquetes-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;opacity:.4;padding:24px">Cargando...</td></tr>`;

  let query = db
    .from('paquetes')
    .select('*, pacientes(nombre, apellidos), tratamientos(nombre, precio)')
    .eq('activo', true)
    .order('created_at', { ascending: false });

  if (busqueda) {
    const { data: pacs } = await db.from('pacientes')
      .select('id').or(`nombre.ilike.%${busqueda}%,apellidos.ilike.%${busqueda}%`);
    if (pacs && pacs.length > 0) {
      query = query.in('paciente_id', pacs.map(p => p.id));
    }
  }

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="9" style="color:#e74c3c;padding:16px">Error: ${error.message}</td></tr>`;
    return;
  }

  // KPIs
  if (data) {
    const activos  = data.length;
    const conSaldo = data.filter(p => p.pagado < p.precio_total).length;
    const cartera  = data.reduce((s, p) => s + (p.precio_total - p.pagado), 0);
    const hoy      = new Date();
    const vencen   = data.filter(p => p.sesion_actual >= p.total_sesiones - 1).length;

    document.getElementById('kpi-paq-activos').textContent  = activos;
    document.getElementById('kpi-paq-saldo').textContent    = conSaldo;
    document.getElementById('kpi-paq-vencen').textContent   = vencen;
    document.getElementById('kpi-paq-cartera').textContent  = '$' + cartera.toLocaleString();
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;opacity:.35;padding:24px">No se encontraron paquetes</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(p => {
    const saldo  = p.precio_total - p.pagado;
    const pct    = Math.round((p.sesion_actual / p.total_sesiones) * 100);
    const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos}` : '—';
    const trat   = p.tratamientos?.nombre || '—';
    const est    = saldo === 0
      ? '<span class="badge badge-green">Liquidado</span>'
      : p.sesion_actual >= p.total_sesiones
        ? '<span class="badge badge-warn">Última ses.</span>'
        : '<span class="badge badge-gold">En curso</span>';

    return `<tr>
      <td>${nombre}</td>
      <td>${trat}</td>
      <td style="text-align:center">${p.sesion_actual}/${p.total_sesiones}</td>
      <td style="min-width:110px">
        <div style="font-size:11px;color:var(--cream);opacity:.4;margin-bottom:3px">${pct}%</div>
        <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      </td>
      <td>$${parseFloat(p.precio_total).toLocaleString()}</td>
      <td style="color:var(--success)">$${parseFloat(p.pagado).toLocaleString()}</td>
      <td style="color:${saldo > 0 ? '#e74c3c' : '#27AE60'};font-weight:500">$${saldo.toLocaleString()}</td>
      <td>${est}</td>
      <td style="display:flex;gap:4px">
        <button class="tb-btn" style="padding:4px 8px;font-size:10px" onclick="verDetallePaq(\`${p.id}\`)">Ver</button>
        <button class="tb-btn danger" style="padding:4px 8px;font-size:10px" onclick="eliminarPaquete(\`${p.id}\`)">✕</button>
      </td>
    </tr>`;
  }).join('');
}

// ── VER DETALLE ──
async function verDetallePaq(id) {
  const { data: p, error } = await db
    .from('paquetes')
    .select('*, pacientes(nombre, apellidos), tratamientos(nombre)')
    .eq('id', id).single();

  if (error || !p) { showToast('❌ Error al cargar'); return; }

  const { data: visitas } = await db
    .from('visitas')
    .select('*')
    .eq('paquete_id', id)
    .order('numero_sesion', { ascending: true });

  const saldo = p.precio_total - p.pagado;
  document.getElementById('det-titulo').textContent =
    `${p.pacientes?.nombre} ${p.pacientes?.apellidos} — ${p.tratamientos?.nombre} (${p.total_sesiones} ses.)`;

  let dots = '';
  const visitasMap = {};
  if (visitas) visitas.forEach(v => visitasMap[v.numero_sesion] = v);

  for (let i = 1; i <= p.total_sesiones; i++) {
    const v = visitasMap[i];
    if (v && v.monto_cobrado > 0)      dots += `<div class="sdot paid" title="Pagó $${v.monto_cobrado}">${i}</div>`;
    else if (v && v.monto_cobrado == 0) dots += `<div class="sdot visited-nopay" title="Asistió sin pago">${i}</div>`;
    else if (i === p.sesion_actual + 1) dots += `<div class="sdot current">${i}</div>`;
    else                                dots += `<div class="sdot pending">${i}</div>`;
  }

  let histRows = visitas && visitas.length > 0
    ? visitas.map(v => `<tr>
        <td>Sesión ${v.numero_sesion}</td>
        <td>${v.fecha || '—'}</td>
        <td>${v.monto_cobrado > 0 ? '<span class="badge badge-green">Pagó</span>' : '<span class="badge badge-blue">Sin pago</span>'}</td>
        <td style="color:${v.monto_cobrado > 0 ? 'var(--success)' : 'var(--info)'}">
          ${v.monto_cobrado > 0 ? '$' + parseFloat(v.monto_cobrado).toLocaleString() : '$0 — Nota de visita'}
        </td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="opacity:.3;text-align:center;padding:12px">Sin visitas registradas</td></tr>';

  document.getElementById('det-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:18px">
      <div style="background:var(--dark);padding:14px;text-align:center">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream);opacity:.3;margin-bottom:5px">Total</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:24px;color:var(--gold)">$${parseFloat(p.precio_total).toLocaleString()}</div>
      </div>
      <div style="background:var(--dark);padding:14px;text-align:center">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream);opacity:.3;margin-bottom:5px">Pagado</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:24px;color:var(--success)">$${parseFloat(p.pagado).toLocaleString()}</div>
      </div>
      <div style="background:var(--dark);padding:14px;text-align:center">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream);opacity:.3;margin-bottom:5px">Saldo</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:24px;color:${saldo > 0 ? '#e74c3c' : '#27AE60'}">$${saldo.toLocaleString()}</div>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);opacity:.55;margin-bottom:10px">Control de sesiones</div>
      <div class="session-dots">${dots}</div>
      <div class="sdot-legend">
        <span><div class="dot-s" style="background:var(--gold)"></div>Pagada</span>
        <span><div class="dot-s" style="background:rgba(41,128,185,.4);border:1px solid var(--info)"></div>Sin pago</span>
        <span><div class="dot-s" style="border:1px solid var(--gold)"></div>Próxima</span>
      </div>
    </div>
    <table><tr><th>Sesión</th><th>Fecha</th><th>Estado</th><th>Monto</th></tr>${histRows}</table>`;

  document.getElementById('detalle-paquete').style.display = 'block';
  document.getElementById('detalle-paquete').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── GUARDAR PAQUETE ──
async function guardarPaquete() {
  const pacId  = document.getElementById('npaq-paciente').value;
  const tratSel = document.getElementById('npaq-tratamiento');
  const tratId  = tratSel.options[tratSel.selectedIndex]?.dataset?.id || null;
  const total   = parseFloat(document.getElementById('npaq-total').value) || 0;
  const sesiones = parseInt(document.getElementById('npaq-sesiones').value) || 10;
  const esquema  = document.getElementById('npaq-esquema').value;
  const fecha    = document.getElementById('npaq-fecha').value;

  if (!pacId)   { showToast('⚠ Selecciona una paciente'); return; }
  if (!tratId)  { showToast('⚠ Selecciona un tratamiento'); return; }
  if (!total)   { showToast('⚠ El total no puede ser $0'); return; }

  let pagadoInicial = 0;
  if (esquema === 'total') pagadoInicial = total;
  else if (esquema === 'enganche') pagadoInicial = parseFloat(document.getElementById('npaq-enganche').value) || 0;

  const datos = {
    paciente_id:    pacId,
    tratamiento_id: tratId,
    total_sesiones: sesiones,
    sesion_actual:  0,
    precio_total:   total,
    pagado:         pagadoInicial,
    esquema_pago:   esquema,
    fecha_inicio:   fecha,
    activo:         true,
  };

  const { error } = await db.from('paquetes').insert([datos]);
  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('nuevo-paquete');
  showToast('✓ Paquete registrado correctamente');
  await cargarPaquetes();
}

// ── ELIMINAR PAQUETE ──
async function eliminarPaquete(id) {
  if (!confirm('¿Eliminar este paquete?')) return;
  const { error } = await db.from('paquetes').update({ activo: false }).eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Paquete eliminado');
  await cargarPaquetes();
}

// ── CARGAR SELECTS MODAL ──
async function cargarSelectsModal() {
  const { data: pacs }  = await db.from('pacientes').select('id,nombre,apellidos').eq('activo',true).order('nombre');
  const { data: trats } = await db.from('tratamientos').select('id,nombre,precio').eq('activo',true).eq('maneja_paquete',true).order('nombre');

  const selPac  = document.getElementById('npaq-paciente');
  const selTrat = document.getElementById('npaq-tratamiento');

  if (selPac && pacs)
    selPac.innerHTML = '<option value="">Seleccionar...</option>' +
      pacs.map(p => `<option value="${p.id}">${p.nombre} ${p.apellidos}</option>`).join('');

  if (selTrat && trats)
    selTrat.innerHTML = '<option value="0" data-id="" data-precio="0">Seleccionar...</option>' +
      trats.map(t => `<option value="${t.id}" data-id="${t.id}" data-precio="${t.precio}">${t.nombre} ($${parseFloat(t.precio).toLocaleString()})</option>`).join('');
}

function calcTotalPaq() {
  const tratSel = document.getElementById('npaq-tratamiento');
  const precio  = parseFloat(tratSel.options[tratSel.selectedIndex]?.dataset?.precio || 0);
  const sesiones = parseInt(document.getElementById('npaq-sesiones').value) || 10;
  const total   = precio * sesiones;
  document.getElementById('npaq-precio').value = precio;
  document.getElementById('npaq-total').value  = total;
  calcSaldoPaq();
}

function calcSaldoPaq() {
  const total  = parseFloat(document.getElementById('npaq-total').value) || 0;
  const eng    = parseFloat(document.getElementById('npaq-enganche')?.value) || 0;
  const s      = document.getElementById('npaq-saldo');
  if (s) s.value = Math.max(0, total - eng);
}

function toggleEsquema() {
  const v = document.getElementById('npaq-esquema').value;
  document.getElementById('bloque-enganche').style.display = v === 'enganche' ? 'block' : 'none';
}

// ── BÚSQUEDA ──
let paqTimeout;
function buscarPaquete(valor) {
  clearTimeout(paqTimeout);
  paqTimeout = setTimeout(() => cargarPaquetes(valor), 400);
}

// ── VISITA ──
async function cargarSelectVisita() {
  const { data } = await db.from('pacientes').select('id,nombre,apellidos').eq('activo',true).order('nombre');
  const sel = document.getElementById('vis-paciente');
  if (sel && data)
    sel.innerHTML = '<option value="">Seleccionar...</option>' +
      data.map(p => `<option value="${p.id}">${p.nombre} ${p.apellidos}</option>`).join('');
}

async function cargarPaqueteVis() {
  const pacId  = document.getElementById('vis-paciente').value;
  const bloque = document.getElementById('info-paq-vis');
  if (!pacId) { bloque.style.display = 'none'; paqSelData = null; return; }

  const { data: paquetes } = await db
    .from('paquetes')
    .select('*, tratamientos(nombre)')
    .eq('paciente_id', pacId)
    .eq('activo', true);

  const activos = (paquetes || []).filter(p => p.sesion_actual < p.total_sesiones);

  if (!activos || activos.length === 0) {
    bloque.style.display = 'none';
    paqSelData = null;
    document.getElementById('nota-preview-wrap').innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--cream);opacity:.2;font-size:13px">Esta paciente no tiene paquetes activos</div>';
    return;
  }

  // Si tiene más de un paquete activo — mostrar selector
  let selectorHTML = '';
  if (activos.length > 1) {
    selectorHTML = `
      <div class="fg" style="margin-bottom:12px">
        <label style="font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--cream);opacity:.4;display:block;margin-bottom:6px">Seleccionar paquete</label>
        <select id="vis-select-paquete" style="width:100%;background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:9px 13px;font-family:'Jost',sans-serif;font-size:13px;color:var(--cream);outline:none" onchange="seleccionarPaqueteVis()">
          ${activos.map(p => `<option value="${p.id}">${p.tratamientos?.nombre || '—'} — Ses. ${p.sesion_actual+1}/${p.total_sesiones} · Saldo $${(p.precio_total-p.pagado).toLocaleString()}</option>`).join('')}
        </select>
      </div>`;
  }

  // Insertar selector si no existe
  let selCont = document.getElementById('vis-selector-paq');
  if (!selCont) {
    selCont = document.createElement('div');
    selCont.id = 'vis-selector-paq';
    bloque.parentNode.insertBefore(selCont, bloque);
  }
  selCont.innerHTML = selectorHTML;

  // Seleccionar el primero por defecto
  paqSelData = activos[0];
  mostrarInfoPaquete(paqSelData);
}

function seleccionarPaqueteVis() {
  const sel = document.getElementById('vis-select-paquete');
  if (!sel) return;
  // Necesitamos buscar el paquete seleccionado
  db.from('paquetes')
    .select('*, tratamientos(nombre)')
    .eq('id', sel.value)
    .single()
    .then(({ data }) => {
      if (data) { paqSelData = data; mostrarInfoPaquete(data); }
    });
}

function mostrarInfoPaquete(paq) {
  const bloque = document.getElementById('info-paq-vis');
  const saldo  = paq.precio_total - paq.pagado;

  document.getElementById('paq-info-rows').innerHTML = `
    <div><div style="font-size:10px;opacity:.38;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">Sesión</div>
      <div style="color:var(--gold)">${paq.sesion_actual + 1}/${paq.total_sesiones}</div></div>
    <div><div style="font-size:10px;opacity:.38;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">Saldo</div>
      <div style="color:${saldo > 0 ? '#e74c3c' : '#27AE60'}">${saldo > 0 ? '$' + saldo.toLocaleString() : 'Liquidado ✓'}</div></div>
    <div><div style="font-size:10px;opacity:.38;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px">Tratamiento</div>
      <div style="color:var(--cream);font-size:12px">${paq.tratamientos?.nombre || '—'}</div></div>`;

  bloque.style.display = 'block';
  actualizarNotaVis();
}

function togglePagoVis() {
  const v = document.getElementById('vis-pago-tipo').value;
  document.getElementById('bloque-pago-vis').style.display = v === 'no' ? 'none' : 'block';
  if (v === 'total' && paqSelData) {
    document.getElementById('vis-monto').value = paqSelData.precio_total - paqSelData.pagado;
  }
  actualizarNotaVis();
}

function actualizarNotaVis() {
  if (!paqSelData) return;
  const tipoPago = document.getElementById('vis-pago-tipo').value;
  const monto    = tipoPago === 'no' ? 0 : (parseFloat(document.getElementById('vis-monto')?.value) || 0);
  const saldoAntes   = paqSelData.precio_total - paqSelData.pagado;
  const saldoDespues = Math.max(0, saldoAntes - monto);
  const folio  = 'NV-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100);
  const fecha  = document.getElementById('vis-fecha').value || new Date().toISOString().split('T')[0];
  const esZero = monto === 0;

  // Obtener nombre del paciente del select
  const selPac = document.getElementById('vis-paciente');
  const nombrePac = selPac.options[selPac.selectedIndex]?.text || '—';

  document.getElementById('nota-preview-wrap').innerHTML = `
    <div class="nota-preview">
      <div class="nota-header"><div class="nota-logo">B·Siluets</div><div class="nota-sub-hdr">Consultorio Médico Estético · Durango</div></div>
      <div class="nota-folio">Folio: <strong>${folio}</strong> &nbsp;|&nbsp; ${fecha}</div>
      <div class="nota-row"><span>Paciente</span><strong>${nombrePac}</strong></div>
      <div class="nota-row"><span>Tratamiento</span><span>${paqSelData.tratamientos?.nombre || '—'}</span></div>
      <div class="nota-row"><span>Sesión</span><span><strong>${paqSelData.sesion_actual + 1}</strong> de ${paqSelData.total_sesiones}</span></div>
      ${esZero ? `<div class="nota-saldo-box">⚠ El paciente asistió a su cita sin realizar pago. Esta nota acredita su visita.</div>` : ''}
      <div class="nota-row ${esZero ? 'zero-row' : 'total-row'}">
        <span>${esZero ? 'ASISTENCIA REGISTRADA' : 'TOTAL COBRADO'}</span>
        <span><strong>$${monto.toLocaleString()}.00</strong></span>
      </div>
      ${!esZero ? `<div class="nota-row" style="font-size:12px"><span>Método</span><span>${document.getElementById('vis-metodo')?.value || 'Efectivo'}</span></div>` : ''}
      <div class="nota-saldo-box">Saldo pendiente: <strong>$${saldoDespues.toLocaleString()}</strong>${saldoDespues === 0 ? ' — ✓ LIQUIDADO' : ''}</div>
      <div class="nota-firma"><div><div class="nota-linea">Recibió</div></div><div><div class="nota-linea">Paciente</div></div></div>
      <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
    </div>`;
}

async function generarNotaVis() {
  if (!paqSelData) { showToast('⚠ Selecciona un paciente con paquete activo'); return; }
  const fecha    = document.getElementById('vis-fecha').value;
  const tipoPago = document.getElementById('vis-pago-tipo').value;
  const monto    = tipoPago === 'no' ? 0 : (parseFloat(document.getElementById('vis-monto')?.value) || 0);
  const metodo   = document.getElementById('vis-metodo').value.toLowerCase();
  const nuevaSesion = paqSelData.sesion_actual + 1;

  // 1. Registrar visita
  const { error: errVisita } = await db.from('visitas').insert([{
    paquete_id:          paqSelData.id,
    paciente_id:         paqSelData.paciente_id,
    numero_sesion:       nuevaSesion,
    fecha:               fecha,
    monto_cobrado:       monto,
    metodo_pago:         tipoPago === 'no' ? null : metodo,
    folio:               'NV-' + fecha.replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100),
  }]);
  if (errVisita) { showToast('❌ Error al registrar visita: ' + errVisita.message); return; }

  // 2. Actualizar sesion_actual y pagado en paquete
  const nuevoPagado = paqSelData.pagado + monto;
  const { error: errPaq } = await db.from('paquetes').update({
    sesion_actual: nuevaSesion,
    pagado: nuevoPagado,
  }).eq('id', paqSelData.id);
  if (errPaq) { showToast('❌ Error al actualizar paquete'); return; }

  // 3. Mostrar nota en modal
  document.getElementById('nota-imprimible').innerHTML = document.getElementById('nota-preview-wrap').innerHTML;
  openModal('nota-impr');
  showToast('✓ Visita registrada — Sesión ' + nuevaSesion + ' de ' + paqSelData.total_sesiones);

  // 4. Refrescar
  paqSelData.sesion_actual = nuevaSesion;
  paqSelData.pagado = nuevoPagado;
  await cargarPaquetes();
  await cargarNotasHoy();
}


async function reimprimirNota(visitaId) {
  const { data: v } = await db
    .from('visitas')
    .select('*, pacientes(nombre, apellidos), paquetes(precio_total, pagado, total_sesiones, tratamientos(nombre))')
    .eq('id', visitaId).single();

  if (!v) { showToast('❌ No se encontró la nota'); return; }

  const nombre   = v.pacientes ? `${v.pacientes.nombre} ${v.pacientes.apellidos}` : '—';
  const trat     = v.paquetes?.tratamientos?.nombre || '—';
  const saldo    = (v.paquetes?.precio_total || 0) - (v.paquetes?.pagado || 0);
  const esCero   = v.monto_cobrado == 0;

  document.getElementById('nota-imprimible').innerHTML = `
    <div class="nota-preview">
      <div class="nota-header"><div class="nota-logo">B·Siluets</div><div class="nota-sub-hdr">Consultorio Médico Estético · Durango</div></div>
      <div class="nota-folio">Folio: <strong>${v.folio || '—'}</strong> &nbsp;|&nbsp; ${v.fecha}</div>
      <div class="nota-row"><span>Paciente</span><strong>${nombre}</strong></div>
      <div class="nota-row"><span>Tratamiento</span><span>${trat}</span></div>
      <div class="nota-row"><span>Sesión</span><span><strong>${v.numero_sesion}</strong> de ${v.paquetes?.total_sesiones || '?'}</span></div>
      ${esCero ? `<div class="nota-saldo-box">⚠ El paciente asistió a su cita sin realizar pago. Esta nota acredita su visita.</div>` : ''}
      <div class="nota-row ${esCero ? 'zero-row' : 'total-row'}">
        <span>${esCero ? 'ASISTENCIA REGISTRADA' : 'TOTAL COBRADO'}</span>
        <span><strong>$${parseFloat(v.monto_cobrado).toLocaleString()}.00</strong></span>
      </div>
      <div class="nota-saldo-box">Saldo pendiente: <strong>$${saldo.toLocaleString()}</strong>${saldo <= 0 ? ' — ✓ LIQUIDADO' : ''}</div>
      <div class="nota-firma"><div><div class="nota-linea">Recibió</div></div><div><div class="nota-linea">Paciente</div></div></div>
      <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
    </div>`;
  openModal('nota-impr');
}
// ── FILTROS NOTAS DEL DÍA ──
let todasLasNotas = [];

async function cargarNotasHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  const tbody = document.getElementById('tabla-notas-hoy');
  const fechaEl = document.getElementById('notas-fecha-hoy');

  if (fechaEl) {
    const d = new Date(hoy + 'T12:00:00');
    fechaEl.textContent = d.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }

  // Establecer fecha por defecto en el filtro
  const filtroFecha = document.getElementById('filtro-notas-fecha');
  if (filtroFecha && !filtroFecha.value) filtroFecha.value = hoy;

  if (!tbody) return;

  const fecha = filtroFecha?.value || hoy;

  const { data, error } = await db
    .from('visitas')
    .select('*, pacientes(id, nombre, apellidos), paquetes(precio_total, pagado, total_sesiones, tratamientos(nombre))')
    .eq('fecha', fecha)
    .order('created_at', { ascending: false });

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;opacity:.3;padding:16px">Sin notas para esta fecha</td></tr>`;
    return;
  }

  todasLasNotas = data;

  // Poblar select de pacientes
  await poblarSelectFiltroNotas(data);

  renderNotasFiltradas(data);
}

async function poblarSelectFiltroNotas(notas) {
  const sel = document.getElementById('filtro-notas-paciente');
  if (!sel) return;
  const pacientesVistos = new Set();
  const opciones = ['<option value="">Todos</option>'];
  notas.forEach(n => {
    const id = n.pacientes?.id;
    if (id && !pacientesVistos.has(id)) {
      pacientesVistos.add(id);
      const nombre = `${n.pacientes.nombre} ${n.pacientes.apellidos}`;
      opciones.push(`<option value="${id}">${nombre}</option>`);
    }
  });
  sel.innerHTML = opciones.join('');
}

function filtrarNotas() {
  const fecha    = document.getElementById('filtro-notas-fecha')?.value || '';
  const paciente = document.getElementById('filtro-notas-paciente')?.value || '';

  // Si cambió la fecha, recargar desde Supabase
  if (fecha) {
    const hoy = new Date().toISOString().split('T')[0];
    if (fecha !== hoy && todasLasNotas.length > 0 && todasLasNotas[0]?.fecha !== fecha) {
      cargarNotasHoy();
      return;
    }
  }

  let filtradas = [...todasLasNotas];
  if (paciente) filtradas = filtradas.filter(n => n.pacientes?.id === paciente);

  renderNotasFiltradas(filtradas);
}

function renderNotasFiltradas(notas) {
  const tbody = document.getElementById('tabla-notas-hoy');
  if (!tbody) return;

  if (!notas || notas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;opacity:.3;padding:16px">Sin notas para este filtro</td></tr>`;
    document.getElementById('subtotal-notas').textContent = '$0';
    return;
  }

  let subtotal = 0;

  tbody.innerHTML = notas.map(v => {
    const nombre  = v.pacientes ? `${v.pacientes.nombre} ${v.pacientes.apellidos}` : '—';
    const trat    = v.paquetes?.tratamientos?.nombre || '—';
    const total   = v.paquetes?.precio_total || 0;
    const pagado  = v.paquetes?.pagado || 0;
    const saldo   = total - pagado;
    const monto   = parseFloat(v.monto_cobrado) || 0;
    const esCero  = monto === 0;

    if (!esCero) subtotal += monto;

    return `<tr>
      <td><span style="color:var(--gold);font-size:12px">${v.folio || '—'}</span></td>
      <td style="font-size:12px;opacity:.6">${v.fecha || '—'}</td>
      <td>${nombre}</td>
      <td>Sesión ${v.numero_sesion}/${v.paquetes?.total_sesiones || '?'} — ${trat}</td>
      <td style="color:${esCero ? 'var(--info,#2980B9)' : 'var(--success)'}">
        ${esCero ? '$0.00 — Solo visita' : '$' + monto.toLocaleString()}
      </td>
      <td>${v.metodo_pago ? `<span class="badge badge-green">${v.metodo_pago}</span>` : '<span class="badge badge-gray">—</span>'}</td>
      <td>${saldo <= 0 ? '<span class="badge badge-green">Liquidado</span>' : `<span class="badge badge-warn">$${saldo.toLocaleString()}</span>`}</td>
      <td><button class="tb-btn" style="padding:4px 10px;font-size:10px" onclick="reimprimirNota(\`${v.id}\`)">🖨</button></td>
    </tr>`;
  }).join('');

  document.getElementById('subtotal-notas').textContent = '$' + subtotal.toLocaleString();
}

function limpiarFiltrosNotas() {
  const hoy = new Date().toISOString().split('T')[0];
  const filtroFecha = document.getElementById('filtro-notas-fecha');
  const filtroPac   = document.getElementById('filtro-notas-paciente');
  if (filtroFecha) filtroFecha.value = hoy;
  if (filtroPac)   filtroPac.value   = '';
  cargarNotasHoy();
}