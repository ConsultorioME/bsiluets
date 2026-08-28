// ─────────────────────────────────────────
//  B·Siluets — Módulo Paquetes & Visitas
//  Software SIE © 2025
// ─────────────────────────────────────────

let pacSelIdx = -1;
let paqSelData = null;

// ── ABRIR MODAL "NUEVO PAQUETE" (oculta "Cortesía" a quien no sea Admin) ──
// Solo el rol "admin" (incluye la cuenta sie.admin, que también tiene
// rol 'admin') puede regalar paquetes de cortesía.
function abrirModalPaquete() {
  const u = JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}');
  const esAdmin = u.rol === 'admin';
  const optCortesia = document.querySelector('#npaq-esquema option[value="cortesia"]');
  if (optCortesia) {
    optCortesia.hidden = !esAdmin;
    optCortesia.disabled = !esAdmin;
    // Si el esquema quedó en "cortesia" de una sesión anterior con otro
    // rol, se regresa a "total" para no dejar una opción oculta elegida.
    if (!esAdmin && document.getElementById('npaq-esquema').value === 'cortesia') {
      document.getElementById('npaq-esquema').value = 'total';
      toggleEsquema();
    }
  }
  openModal('nuevo-paquete');
}

// ── LIMPIAR FORM DE VISITA (tras cerrar la Nota de Venta) ──
// Evita que queden datos de la visita anterior (paciente, monto, método,
// paquete seleccionado) que puedan causar conflictos al registrar la
// siguiente visita.
function limpiarFormVisita() {
  paqSelData = null;

  const selPac = document.getElementById('vis-paciente');
  if (selPac) selPac.value = '';

  const infoPaq = document.getElementById('info-paq-vis');
  if (infoPaq) infoPaq.style.display = 'none';

  // Quitar el selector de "más de un paquete activo" si quedó insertado
  const selectorPaq = document.getElementById('vis-selector-paq');
  if (selectorPaq) selectorPaq.innerHTML = '';

  const fechaEl = document.getElementById('vis-fecha');
  if (fechaEl) fechaEl.value = fechaHoyISO();

  const tipoPago = document.getElementById('vis-pago-tipo');
  if (tipoPago) tipoPago.value = 'no';
  const bloquePago = document.getElementById('bloque-pago-vis');
  if (bloquePago) bloquePago.style.display = 'none';

  // Dejar un solo renglón de método de pago, en blanco
  const metodosCont = document.getElementById('vis-metodos-container');
  if (metodosCont) {
    metodosCont.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 110px;gap:6px;align-items:center">
        <select class="vis-metodo-sel" style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--cream);outline:none">
          <option value="" selected disabled>Selecciona método...</option>
          <option value="efectivo">💵 Efectivo</option>
          <option value="tarjeta">💳 Tarjeta</option>
          <option value="transferencia">🏦 Transferencia</option>
        </select>
        <input type="number" class="vis-metodo-monto" oninput="actualizarNotaVis()" placeholder="Monto $" step="0.01" style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
      </div>`;
  }

  const preview = document.getElementById('nota-preview-wrap');
  if (preview) preview.innerHTML = '<div style="text-align:center;padding:40px;color:var(--cream);opacity:.2;font-size:13px">Selecciona un paciente para previsualizar</div>';
}

// ── INICIALIZAR ──
async function initPaquetes() {
  await cargarPaquetes();
  await cargarSelectsModal();
  await cargarSelectVisita();
  const hoy = fechaHoyISO();
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
    // Una cortesía siempre queda con saldo $0 (se marca pagada por
    // completo aunque no se haya cobrado nada), así que sin esta excepción
    // se mostraría "Liquidado" igual que un paquete realmente pagado —
    // ocultando que en realidad fue regalado.
    const est    = p.esquema_pago === 'cortesia'
      ? '<span class="badge" style="background:rgba(155,89,182,.15);color:#9b59b6;border:1px solid rgba(155,89,182,.35)">🎁 Cortesía</span>'
      : saldo === 0
        ? '<span class="badge badge-green">Liquidado</span>'
        : p.sesion_actual >= p.total_sesiones
          ? '<span class="badge badge-warn">Última ses.</span>'
          : '<span class="badge badge-gold">En curso</span>';
    const nombreTrat = p.esquema_pago === 'cortesia'
      ? `${trat} <span style="font-size:9px;letter-spacing:.06em;color:#9b59b6;opacity:.85">· PAQUETE DE CORTESÍA</span>`
      : trat;

    return `<tr>
      <td>${nombre}</td>
      <td>${nombreTrat}</td>
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
    .eq('eliminado', false)
    .order('numero_sesion', { ascending: true });

  const saldo = p.precio_total - p.pagado;
  const badgeCortesia = p.esquema_pago === 'cortesia'
    ? ' <span class="badge" style="background:rgba(155,89,182,.15);color:#9b59b6;border:1px solid rgba(155,89,182,.35);font-size:10px;vertical-align:middle">🎁 PAQUETE DE CORTESÍA</span>'
    : '';
  document.getElementById('det-titulo').innerHTML =
    `${p.pacientes?.nombre} ${p.pacientes?.apellidos} — ${p.tratamientos?.nombre} (${p.total_sesiones} ses.)${badgeCortesia}`;

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
        <td><button class="tb-btn" style="padding:4px 10px;font-size:10px;color:#e74c3c" onclick="eliminarVisita('${v.id}','${p.id}',${v.numero_sesion})">🗑</button></td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="opacity:.3;text-align:center;padding:12px">Sin visitas registradas</td></tr>';

  document.getElementById('det-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:18px">
      <div style="background:var(--dark);padding:14px;text-align:center">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream);opacity:.3;margin-bottom:5px">Total</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:24px;color:var(--gold)">$${parseFloat(p.precio_total).toLocaleString()}</div>
      </div>
      <div style="background:var(--dark);padding:14px;text-align:center">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream);opacity:.3;margin-bottom:5px">Pagado</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:24px;color:var(--success)">$${parseFloat(p.pagado).toLocaleString()}</div>
      </div>
      <div style="background:var(--dark);padding:14px;text-align:center">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--cream);opacity:.3;margin-bottom:5px">Saldo</div>
        <div style="font-family:'Space Grotesk',sans-serif;font-size:24px;color:${saldo > 0 ? '#e74c3c' : '#27AE60'}">$${saldo.toLocaleString()}</div>
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
    <table><tr><th>Sesión</th><th>Fecha</th><th>Estado</th><th>Monto</th><th>Acción</th></tr>${histRows}</table>`;

  document.getElementById('detalle-paquete').style.display = 'block';
  document.getElementById('detalle-paquete').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── ELIMINAR UNA SESIÓN/VISITA (con recálculo automático de saldo) ──
async function eliminarVisita(visitaId, paqueteId, numeroSesion) {
  const ok = confirm(
    `¿Seguro que quieres ELIMINAR la Sesión ${numeroSesion}?\n\n` +
    `Esta acción no se puede deshacer. Si esa sesión tenía un pago registrado, ` +
    `el saldo del paquete se recalculará automáticamente.`
  );
  if (!ok) return;

  if (typeof requiereAutorizacionAdmin === 'function' && requiereAutorizacionAdmin()) {
    const autorizado = await pedirAutorizacionAdmin('Eliminar una sesión requiere autorización de un Administrador.');
    if (!autorizado) return;
  }

  const { error: errDel } = await db.from('visitas').delete().eq('id', visitaId);
  if (errDel) { showToast('❌ Error al eliminar la sesión: ' + errDel.message); return; }

  // Recalcular pagado y sesion_actual a partir de las visitas que quedan (fuente de verdad),
  // en vez de solo restar a mano — así nunca queda descuadrado el saldo.
  const { data: restantes, error: errSel } = await db
    .from('visitas')
    .select('numero_sesion, monto_cobrado')
    .eq('paquete_id', paqueteId)
    .eq('eliminado', false);

  if (errSel) { showToast('❌ Sesión eliminada, pero no se pudo recalcular el saldo'); return; }

  const nuevoPagado = (restantes || []).reduce((sum, v) => sum + (parseFloat(v.monto_cobrado) || 0), 0);
  const nuevaSesionActual = (restantes || []).reduce((max, v) => Math.max(max, v.numero_sesion), 0);

  const { error: errUpd } = await db.from('paquetes').update({
    pagado: nuevoPagado,
    sesion_actual: nuevaSesionActual,
  }).eq('id', paqueteId);
  if (errUpd) { showToast('❌ Error al actualizar el saldo del paquete'); return; }

  showToast('✓ Sesión eliminada — saldo recalculado');
  await verDetallePaq(paqueteId);
  await cargarPaquetes();
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
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

  // Solo Admin (incluye sie.admin) puede registrar paquetes de cortesía.
  if (esquema === 'cortesia') {
    const u = JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}');
    if (u.rol !== 'admin') {
      showToast('⚠ Solo un Administrador puede registrar paquetes de cortesía');
      return;
    }
  }

  // La cortesía se marca automáticamente como pagada en su totalidad (no
  // es dinero real: es el valor del tratamiento que se está regalando),
  // por eso no entra en el mismo flujo de cobro que "total"/"enganche".
  let pagadoInicial = 0;
  if (esquema === 'total' || esquema === 'cortesia') pagadoInicial = total;
  else if (esquema === 'enganche') pagadoInicial = parseFloat(document.getElementById('npaq-enganche').value) || 0;

  // Si se cobra algo al registrar el paquete (pago total o enganche), se
  // necesita el método de pago explícito — nunca por default "Efectivo" —
  // para poder reflejar ese ingreso en Caja igual que un cobro normal.
  // La cortesía nunca pide método: no hay dinero real de por medio.
  const metodo = document.getElementById('npaq-metodo').value;
  const esCortesia = esquema === 'cortesia';
  if (pagadoInicial > 0 && !esCortesia && !metodo) {
    showToast('⚠ Selecciona el método de pago');
    return;
  }

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

  const { data: paqueteInsertado, error } = await db.from('paquetes').insert([datos]).select('id').single();
  if (error) { showToast('❌ Error: ' + error.message); return; }

  // Registrar el pago inicial (total o enganche) como abono ligado al
  // paquete, para que Caja lo cuente ese mismo día por su método real
  // (mismo patrón que el pago inicial de un cobro a crédito en Pagos).
  // Una cortesía NUNCA genera este registro: no debe sumar a Caja.
  if (pagadoInicial > 0 && !esCortesia && paqueteInsertado?.id) {
    const { error: errAbono } = await db.from('abonos').insert([{
      paciente_id: pacId,
      paquete_id:  paqueteInsertado.id,
      monto:       pagadoInicial,
      metodo_pago: metodo,
      fecha:       fecha,
      referencia:  esquema === 'enganche' ? 'Enganche inicial del paquete' : 'Pago total del paquete',
    }]);
    if (errAbono) showToast('⚠ Paquete guardado, pero no se pudo registrar el pago inicial en Caja: ' + errAbono.message);
  }

  closeModal('nuevo-paquete');
  showToast('✓ Paquete registrado correctamente');
  await cargarPaquetes();
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
}

// ── ELIMINAR PAQUETE ──
async function eliminarPaquete(id) {
  if (!confirm('¿Eliminar este paquete?')) return;

  if (typeof requiereAutorizacionAdmin === 'function' && requiereAutorizacionAdmin()) {
    const autorizado = await pedirAutorizacionAdmin('Eliminar un paquete requiere autorización de un Administrador.');
    if (!autorizado) return;
  }

  const { error } = await db.from('paquetes').update({ activo: false }).eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Paquete eliminado');
  await cargarPaquetes();
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
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
    
    
      // Al seleccionar tratamiento, sugerir precio
    selTrat?.addEventListener('change', function() {
      const opt = this.options[this.selectedIndex];
      const precio = opt?.dataset?.precio || 0;
      document.getElementById('npaq-precio').value = precio;
      calcTotalPaq();
    });

    // Al cambiar sesiones, recalcular total
    document.getElementById('npaq-sesiones')?.addEventListener('change', calcTotalPaq);


    }

function calcTotalPaq() {
  const sesiones = parseInt(document.getElementById('npaq-sesiones').value) || 0;
  const precio   = parseFloat(document.getElementById('npaq-precio').value) || 0;
  const total    = sesiones * precio;
  document.getElementById('npaq-total').value = total;
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

  // El pago de contado ("total") y el enganche son dinero que entra al
  // momento de registrar el paquete, así que ambos necesitan método de
  // pago. "Pago por sesión" y "Cortesía" no cobran nada al capturarse.
  const bloqueMetodo = document.getElementById('bloque-metodo-inicial');
  const labelMetodo   = document.getElementById('npaq-metodo-label');
  const necesitaMetodo = v === 'total' || v === 'enganche';
  bloqueMetodo.style.display = necesitaMetodo ? 'block' : 'none';
  if (labelMetodo) labelMetodo.textContent = v === 'enganche' ? 'Método de pago (del enganche)' : 'Método de pago (del pago total)';
  if (!necesitaMetodo) document.getElementById('npaq-metodo').value = '';

  const avisoCortesia = document.getElementById('bloque-cortesia-aviso');
  if (avisoCortesia) avisoCortesia.style.display = v === 'cortesia' ? 'block' : 'none';
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
        <select id="vis-select-paquete" style="width:100%;background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:9px 13px;font-family:'Inter',sans-serif;font-size:13px;color:var(--cream);outline:none" onchange="seleccionarPaqueteVis()">
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
    const primerInput = document.querySelector('#vis-metodos-container .vis-metodo-monto');
    if (primerInput) primerInput.value = paqSelData.precio_total - paqSelData.pagado;
  }
  actualizarNotaVis();
}

// ── SUMA EL MONTO CAPTURADO EN TODOS LOS CAMPOS DE MÉTODO DE PAGO ──
function obtenerMontoTotalVis() {
  const montos = document.querySelectorAll('#vis-metodos-container .vis-metodo-monto');
  let total = 0;
  montos.forEach(inp => { total += parseFloat(inp.value) || 0; });
  return total;
}

function actualizarNotaVis() {
  if (!paqSelData) return;
  const tipoPago = document.getElementById('vis-pago-tipo').value;
  const monto    = tipoPago === 'no' ? 0 : obtenerMontoTotalVis();
  const saldoAntes   = paqSelData.precio_total - paqSelData.pagado;
  const saldoDespues = Math.max(0, saldoAntes - monto);
  const folio  = 'NV-' + fechaHoyISO().replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100);
  const fecha  = document.getElementById('vis-fecha').value || fechaHoyISO();
  const esZero = monto === 0;

  // Obtener nombre del paciente del select
  const selPac = document.getElementById('vis-paciente');
  const nombrePac = selPac.options[selPac.selectedIndex]?.text || '—';

  document.getElementById('nota-preview-wrap').innerHTML = `
    <div class="nota-preview">
      <div class="nota-header"><div class="nota-logo"><img src="assets/img/logo-bsiluets.png" alt="B·Siluets" style="height:50px;width:auto;object-fit:contain"></div>${notaContactoHTML()}</div>
      <div class="nota-folio">Folio: <strong>${folio}</strong> &nbsp;|&nbsp; ${fecha}</div>
      <div class="nota-row"><span>Paciente</span><strong>${nombrePac}</strong></div>
      <div class="nota-row"><span>Tratamiento</span><span>${paqSelData.tratamientos?.nombre || '—'}</span></div>
      <div class="nota-row"><span>Sesión</span><span><strong>${paqSelData.sesion_actual + 1}</strong> de ${paqSelData.total_sesiones}</span></div>
      ${esZero ? `<div class="nota-saldo-box">⚠ El paciente asistió a su cita sin realizar pago. Esta nota acredita su visita.</div>` : ''}
      <div class="nota-row ${esZero ? 'zero-row' : 'total-row'}">
        <span>${esZero ? 'ASISTENCIA REGISTRADA' : 'TOTAL COBRADO'}</span>
        <span><strong>$${monto.toLocaleString()}.00</strong></span>
      </div>
      ${!esZero ? `<div class="nota-row" style="font-size:12px"><span>Método</span><span>${formatearMetodoVis(obtenerMetodosVis())}</span></div>` : ''}
      <div class="nota-saldo-box">Saldo pendiente: <strong>$${saldoDespues.toLocaleString()}</strong>${saldoDespues === 0 ? ' — ✓ LIQUIDADO' : ''}</div>
      <div class="nota-firma"><div><div class="nota-linea">Recibió</div></div><div><div class="nota-linea">Paciente</div></div></div>
      <div class="nota-footer-txt">${notaNombreConsultorio()} — Consulta · Tratamiento · Bienestar</div>
    </div>`;
}

async function generarNotaVis() {
  if (!paqSelData) { showToast('⚠ Selecciona un paciente con paquete activo'); return; }
  const fecha    = document.getElementById('vis-fecha').value;
  const tipoPago = document.getElementById('vis-pago-tipo').value;
  const monto    = tipoPago === 'no' ? 0 : obtenerMontoTotalVis();

  // Cada renglón con monto capturado necesita método elegido explícitamente
  // (ya no hay "Efectivo" por default), para no confundir tarjeta/transferencia
  // con efectivo por descuido.
  if (tipoPago !== 'no') {
    const filasMetodoSel = document.querySelectorAll('#vis-metodos-container .vis-metodo-sel');
    const filasMetodoMonto = document.querySelectorAll('#vis-metodos-container .vis-metodo-monto');
    for (let i = 0; i < filasMetodoSel.length; i++) {
      const montoFila = parseFloat(filasMetodoMonto[i]?.value || 0);
      if (montoFila > 0 && !filasMetodoSel[i].value) {
        showToast('⚠ Selecciona el método de pago');
        return;
      }
    }
  }

  const metodo = obtenerMetodosVis();
  const nuevaSesion = paqSelData.sesion_actual + 1;

  // 1. Registrar visita
  const { error: errVisita } = await db.from('visitas').insert([{
    paquete_id:          paqSelData.id,
    paciente_id:         paqSelData.paciente_id,
    numero_sesion:       nuevaSesion,
    fecha:               fecha,
    monto_cobrado:       monto,
    metodo_pago: tipoPago === 'no' ? null : metodo,
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
  document.getElementById('nota-impr-titulo').textContent = 'Nota de Venta';
  openModal('nota-impr');
  showToast('✓ Visita registrada — Sesión ' + nuevaSesion + ' de ' + paqSelData.total_sesiones);

  // 4. Refrescar
  paqSelData.sesion_actual = nuevaSesion;
  paqSelData.pagado = nuevoPagado;
  await cargarPaquetes();

  // La visita recién creada tiene fecha = `fecha`; si el filtro de "Notas
  // del día" se había quedado apuntando a otro día/paciente (de una
  // búsqueda anterior), la nota nueva no aparecería aunque sí se guardó.
  // Se resetea el filtro a la fecha registrada para que siempre sea visible.
  const filtroFechaNotas = document.getElementById('filtro-notas-fecha');
  if (filtroFechaNotas) filtroFechaNotas.value = fecha;
  const filtroPacNotas = document.getElementById('filtro-notas-paciente');
  if (filtroPacNotas) filtroPacNotas.value = '';
  await cargarNotasHoy();

  // Actualizar totales en Pacientes, Dashboard, Créditos, Caja y Reportes
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
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
      <div class="nota-header"><div class="nota-logo"><img src="assets/img/logo-bsiluets.png" alt="B·Siluets" style="height:50px;width:auto;object-fit:contain"></div>${notaContactoHTML()}</div>
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
      <div class="nota-footer-txt">${notaNombreConsultorio()} — Consulta · Tratamiento · Bienestar</div>
    </div>`;
  document.getElementById('nota-impr-titulo').textContent = 'Nota de Venta';
  openModal('nota-impr');
}
// ── FILTROS NOTAS DEL DÍA ──
let todasLasNotas = [];

async function cargarNotasHoy() {
  const hoy = fechaHoyISO();
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
    .eq('eliminado', false)
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
    const hoy = fechaHoyISO();
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
      <td>${v.metodo_pago ? `<span class="badge badge-green">${formatearMetodoVis(v.metodo_pago)}</span>` : '<span class="badge badge-gray">—</span>'}</td>
      <td>${saldo <= 0 ? '<span class="badge badge-green">Liquidado</span>' : `<span class="badge badge-warn">$${saldo.toLocaleString()}</span>`}</td>
      <td style="display:flex;gap:4px">
        <button class="tb-btn" style="padding:4px 10px;font-size:10px" onclick="reimprimirNota(\`${v.id}\`)">🖨</button>
        <button class="tb-btn danger" style="padding:4px 10px;font-size:10px" onclick="eliminarNotaDia(\`${v.id}\`)">🗑</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('subtotal-notas').textContent = '$' + subtotal.toLocaleString();
}

// ── ELIMINAR NOTA DEL DÍA (soft-delete: queda en Historial de Eliminaciones
//    y se recalcula el saldo del paquete y los totales de Caja/Reportes) ──
async function eliminarNotaDia(visitaId) {
  const visita = todasLasNotas.find(v => v.id === visitaId);
  if (!visita) { showToast('❌ No se encontró la nota'); return; }

  const nombre = visita.pacientes ? `${visita.pacientes.nombre} ${visita.pacientes.apellidos}` : 'esta paciente';
  const monto  = parseFloat(visita.monto_cobrado) || 0;
  const avisoMonto = monto > 0
    ? `\n\nEsta nota tiene un pago de $${monto.toLocaleString()} registrado. Al eliminarla, el saldo del paquete de ${nombre} se recalculará y ese monto YA NO se sumará en Caja ni en Reportes.`
    : '';

  const ok = confirm(
    `¿Eliminar la nota del día de ${nombre} (Sesión ${visita.numero_sesion})?\n\n` +
    `Esta acción AFECTARÁ LOS REGISTROS CONTABLES: se recalculará el saldo del paquete y, si tenía pago, se retirará de Caja y Reportes.` +
    avisoMonto +
    `\n\nQuedará un registro en el Historial de Eliminaciones (Configuración). Esta acción no se puede deshacer.`
  );
  if (!ok) return;

  if (typeof requiereAutorizacionAdmin === 'function' && requiereAutorizacionAdmin()) {
    const autorizado = await pedirAutorizacionAdmin('Eliminar una nota del día requiere autorización de un Administrador.');
    if (!autorizado) return;
  }

  const usuario = JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}');
  const { error } = await db.from('visitas').update({
    eliminado:     true,
    eliminado_por: usuario.usuario || 'admin',
    eliminado_at:  new Date().toISOString(),
  }).eq('id', visitaId);

  if (error) { showToast('❌ Error al eliminar la nota: ' + error.message); return; }

  // Recalcular pagado y sesion_actual del paquete a partir de las visitas
  // vigentes (no eliminadas) — misma lógica que eliminarVisita().
  if (visita.paquete_id) {
    const { data: restantes } = await db
      .from('visitas')
      .select('numero_sesion, monto_cobrado')
      .eq('paquete_id', visita.paquete_id)
      .eq('eliminado', false);

    const nuevoPagado       = (restantes || []).reduce((sum, v) => sum + (parseFloat(v.monto_cobrado) || 0), 0);
    const nuevaSesionActual = (restantes || []).reduce((max, v) => Math.max(max, v.numero_sesion), 0);

    await db.from('paquetes').update({
      pagado: nuevoPagado,
      sesion_actual: nuevaSesionActual,
    }).eq('id', visita.paquete_id);
  }

  showToast('✓ Nota eliminada — contabilidad recalculada');

  // Refrescar los módulos contables afectados
  await cargarNotasHoy();
  if (typeof cargarPaquetes === 'function')   await cargarPaquetes();
  if (typeof cargarEliminados === 'function') await cargarEliminados();
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
}

function limpiarFiltrosNotas() {
  const hoy = fechaHoyISO();
  const filtroFecha = document.getElementById('filtro-notas-fecha');
  const filtroPac   = document.getElementById('filtro-notas-paciente');
  if (filtroFecha) filtroFecha.value = hoy;
  if (filtroPac)   filtroPac.value   = '';
  cargarNotasHoy();
}


// ── MÉTODOS DE PAGO VISITA ──
function agregarMetodoVis() {
  const cont = document.getElementById('vis-metodos-container');
  const div  = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 110px 32px;gap:6px;align-items:center';
  div.innerHTML = `
    <select class="vis-metodo-sel" onchange="actualizarNotaVis()" style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--cream);outline:none">
      <option value="" selected disabled>Selecciona método...</option>
      <option value="efectivo">💵 Efectivo</option>
      <option value="tarjeta">💳 Tarjeta</option>
      <option value="transferencia">🏦 Transferencia</option>
    </select>
    <input type="number" class="vis-metodo-monto" oninput="actualizarNotaVis()" placeholder="Monto $" step="0.01" style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
    <button type="button" onclick="this.parentElement.remove();actualizarNotaVis()" style="background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);color:#e74c3c;padding:6px 8px;cursor:pointer;font-size:12px">✕</button>`;
  cont.appendChild(div);
}

function obtenerMetodosVis() {
  const metodos = [];
  const sels   = document.querySelectorAll('#vis-metodos-container .vis-metodo-sel');
  const montos = document.querySelectorAll('#vis-metodos-container .vis-metodo-monto');
  sels.forEach((sel, i) => {
    const monto = parseFloat(montos[i]?.value || 0);
    if (monto > 0) metodos.push(`${sel.value}:${monto}`);
  });
  if (metodos.length === 0) return 'efectivo';
  return metodos.length === 1 ? metodos[0].split(':')[0] : metodos.join('|');
}

// ── FORMATEAR MÉTODO DE PAGO PARA MOSTRAR (capitaliza, soporta combinados con | y :) ──
function formatearMetodoVis(valor) {
  if (!valor) return '—';
  const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return valor.split('|').map(parte => {
    const [met, monto] = parte.split(':');
    return monto ? `${capitalizar(met)} $${parseFloat(monto).toLocaleString()}` : capitalizar(met);
  }).join(' + ');
}