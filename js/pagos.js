// ─────────────────────────────────────────
//  B·Siluets — Módulo Pagos
//  Software SIE © 2025
// ─────────────────────────────────────────

let metodoSeleccionado = 'efectivo';
let tratCounter = 0;
let suplCounter = 0;

// ── INICIALIZAR PAGOS ──
async function initPagos() {
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('pago-fecha').value = hoy;
  await cargarSelectPacientesPagos();
  await cargarSelectTratamientosPagos();
  await cargarSelectSuplementosPagos();
  await cargarUltimosCobros();
}

// ── CARGAR SELECTS (ocultos, usados como fuente de opciones) ──
async function cargarSelectPacientesPagos() {
  const { data } = await db.from('pacientes').select('id,nombre,apellidos').eq('activo',true).order('nombre');
  const sel = document.getElementById('pago-paciente');
  if (sel && data) {
    sel.innerHTML = '<option value="">Seleccionar paciente...</option>' +
      data.map(p => `<option value="${p.id}">${p.nombre} ${p.apellidos}</option>`).join('');
  }
}

async function cargarSelectTratamientosPagos() {
  const { data } = await db
    .from('tratamientos')
    .select('id,nombre,precio')
    .eq('activo', true)
    .eq('maneja_paquete', false)
    .order('nombre');
  const sel = document.getElementById('pago-tratamiento');
  if (sel && data) {
    sel.innerHTML = '<option value="0">Seleccionar...</option>' +
      data.map(t => `<option value="${t.precio}" data-id="${t.id}" data-nombre="${t.nombre}">${t.nombre} ($${parseFloat(t.precio).toLocaleString()})</option>`).join('');
  }
}

async function cargarSelectSuplementosPagos() {
  const { data } = await db.from('inventario').select('id,nombre,precio_venta,unidad').eq('activo',true).order('nombre');
  const sel = document.getElementById('pago-suplemento');
  if (sel && data) {
    sel.innerHTML = '<option value="0">Seleccionar...</option>' +
      data.filter(p => p.precio_venta > 0).map(p =>
        `<option value="${p.precio_venta}" data-id="${p.id}" data-nombre="${p.nombre}" data-unidad="${p.unidad}">${p.nombre} ($${parseFloat(p.precio_venta).toLocaleString()}/${p.unidad})</option>`
      ).join('');
  }
}

// ── RECALCULAR TOTALES ──
function recalcPago() {
  let totalTrats = 0;
  document.querySelectorAll('.trat-item').forEach(item => {
    totalTrats += parseFloat(item.querySelector('.trat-precio')?.value || 0);
  });

  let totalSupls = 0;
  document.querySelectorAll('.supl-item').forEach(item => {
    const precio = parseFloat(item.querySelector('.supl-precio')?.value || 0);
    const qty    = parseFloat(item.querySelector('.supl-qty')?.value || 1);
    totalSupls += precio * qty;
  });

  const total = totalTrats + totalSupls;
  const stEl = document.getElementById('subtotal-trats');
  const ssEl = document.getElementById('subtotal-supls');
  if (stEl) stEl.textContent = '$' + totalTrats.toLocaleString();
  if (ssEl) ssEl.textContent = '$' + totalSupls.toLocaleString();
  document.getElementById('tot-trat').textContent  = '$' + totalTrats.toLocaleString();
  document.getElementById('tot-supl').textContent  = '$' + totalSupls.toLocaleString();
  document.getElementById('tot-total').textContent = '$' + total.toLocaleString();
}

// ── MÉTODO DE PAGO ──
function selPM(el) {
  document.querySelectorAll('.pm').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  metodoSeleccionado = el.dataset.metodo || 'efectivo';
}

// ── AGREGAR TRATAMIENTO ──
function agregarTratPago() {
  const cont = document.getElementById('trats-container');
  const id   = ++tratCounter;
  const opciones = document.getElementById('pago-tratamiento')?.innerHTML || '';

  const div = document.createElement('div');
  div.className = 'trat-item';
  div.id = `trat-item-${id}`;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 130px 32px;gap:8px;margin-bottom:8px;align-items:center';
  div.innerHTML = `
    <select class="trat-select" onchange="autoFillTratPrecio(this,${id})"
      style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--cream);outline:none;width:100%">
      <option value="0">Seleccionar tratamiento...</option>
      ${opciones.replace(/<option[^>]*>[^<]*Seleccionar[^<]*<\/option>/g,'')}
    </select>
    <input type="number" class="trat-precio" placeholder="Precio $" step="0.01" oninput="recalcPago()"
      style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
    <button type="button" onclick="eliminarTratPago(${id})"
      style="background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);color:#e74c3c;padding:6px 8px;cursor:pointer;font-size:14px">✕</button>`;
  cont.appendChild(div);
  recalcPago();
}

function autoFillTratPrecio(sel, id) {
  const precio   = sel.options[sel.selectedIndex]?.value || 0;
  const precioEl = document.getElementById(`trat-item-${id}`)?.querySelector('.trat-precio');
  if (precioEl && parseFloat(precio) > 0) precioEl.value = precio;
  recalcPago();
}

function eliminarTratPago(id) {
  document.getElementById(`trat-item-${id}`)?.remove();
  recalcPago();
}

// ── AGREGAR SUPLEMENTO / MEDICAMENTO / PROTEÍNA ──
function agregarSuplPago() {
  const cont = document.getElementById('supls-container');
  const id   = ++suplCounter;
  const opciones = document.getElementById('pago-suplemento')?.innerHTML || '';

  const div = document.createElement('div');
  div.className = 'supl-item';
  div.id = `supl-item-${id}`;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 70px 110px 32px;gap:8px;margin-bottom:8px;align-items:center';
  div.innerHTML = `
    <select class="supl-select" onchange="autoFillSuplPrecio(this,${id})"
      style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--cream);outline:none;width:100%">
      <option value="0">Seleccionar producto...</option>
      ${opciones.replace(/<option[^>]*>[^<]*Seleccionar[^<]*<\/option>/g,'')}
    </select>
    <input type="number" class="supl-qty" value="1" step="0.25" min="0.25" oninput="recalcPago()" placeholder="Cant."
      style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--cream);outline:none;width:100%">
    <input type="number" class="supl-precio" placeholder="Precio $" step="0.01" oninput="recalcPago()"
      style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
    <button type="button" onclick="eliminarSuplPago(${id})"
      style="background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);color:#e74c3c;padding:6px 8px;cursor:pointer;font-size:14px">✕</button>`;
  cont.appendChild(div);
  recalcPago();
}

function autoFillSuplPrecio(sel, id) {
  const precio   = sel.options[sel.selectedIndex]?.value || 0;
  const precioEl = document.getElementById(`supl-item-${id}`)?.querySelector('.supl-precio');
  if (precioEl && parseFloat(precio) > 0) precioEl.value = precio;
  recalcPago();
}

function eliminarSuplPago(id) {
  document.getElementById(`supl-item-${id}`)?.remove();
  recalcPago();
}

// ── REGISTRAR COBRO ──
async function registrarCobro() {
  const pacienteId = document.getElementById('pago-paciente').value;
  const fecha      = document.getElementById('pago-fecha').value;

  if (!pacienteId) { showToast('⚠ Selecciona una paciente'); return; }
  if (!fecha)      { showToast('⚠ La fecha es obligatoria'); return; }

  // Recopilar tratamientos
  const tratItems = [];
  document.querySelectorAll('.trat-item').forEach(item => {
    const sel    = item.querySelector('.trat-select');
    const precio = parseFloat(item.querySelector('.trat-precio')?.value || 0);
    const nombre = sel?.options[sel.selectedIndex]?.dataset?.nombre ||
                   sel?.options[sel.selectedIndex]?.text?.replace(/\s*\(.*\)/, '').trim() || '';
    const id     = sel?.options[sel.selectedIndex]?.dataset?.id || null;
    if (precio > 0 && nombre && !nombre.includes('Seleccionar')) {
      tratItems.push({ nombre, precio, id });
    }
  });

  // Recopilar suplementos
  const suplItems = [];
  document.querySelectorAll('.supl-item').forEach(item => {
    const sel    = item.querySelector('.supl-select');
    const qty    = parseFloat(item.querySelector('.supl-qty')?.value || 1);
    const precio = parseFloat(item.querySelector('.supl-precio')?.value || 0);
    const nombre = sel?.options[sel.selectedIndex]?.dataset?.nombre ||
                   sel?.options[sel.selectedIndex]?.text?.replace(/\s*\(.*\)/, '').trim() || '';
    const id     = sel?.options[sel.selectedIndex]?.dataset?.id || null;
    if (precio > 0 && nombre && !nombre.includes('Seleccionar')) {
      suplItems.push({ nombre, qty, precio, id, monto: precio * qty });
    }
  });

  if (tratItems.length === 0 && suplItems.length === 0) {
    showToast('⚠ Agrega al menos un tratamiento o suplemento');
    return;
  }

  const totalTrats = tratItems.reduce((s, t) => s + t.precio, 0);
  const totalSupls = suplItems.reduce((s, s2) => s + s2.monto, 0);
  const total      = totalTrats + totalSupls;
  const concepto   = [...tratItems.map(t => t.nombre), ...suplItems.map(s => s.nombre)].join(' + ');
  const folio      = 'NV-' + fecha.replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100);
  const metodoPago = obtenerMetodosPago();

  const datos = {
    paciente_id:       pacienteId,
    concepto:          concepto,
    monto_consulta:    0,
    monto_tratamiento: totalTrats,
    monto_suplementos: totalSupls,
    total:             total,
    metodo_pago:       metodoPago,
    fecha:             fecha,
    folio:             folio,
  };

  const { error } = await db.from('pagos').insert([datos]);
  if (error) { showToast('❌ Error: ' + error.message); return; }

  // Descontar stock de cada suplemento
  for (const s of suplItems) {
    if (s.id && s.qty > 0) {
      const { data: prod } = await db.from('inventario').select('stock').eq('id', s.id).single();
      if (prod) {
        const nuevoStock = Math.max(0, parseFloat(prod.stock) - s.qty);
        await db.from('inventario').update({ stock: nuevoStock }).eq('id', s.id);
      }
    }
  }

  // Si es crédito, actualizar módulo créditos
  if (metodoSeleccionado === 'credito' && typeof initCreditos === 'function') {
    const modCreditos = document.getElementById('mod-creditos');
    if (modCreditos?.classList.contains('active')) initCreditos();
  }

  showToast(`✓ Cobro de $${total.toLocaleString()} registrado correctamente`);

  // Nota de venta
  const selPac    = document.getElementById('pago-paciente');
  const nombrePac = selPac.options[selPac.selectedIndex]?.text || '—';
  const detalles  = [
    ...tratItems.map(t => ({ concepto: t.nombre, monto: t.precio })),
    ...suplItems.map(s => ({ concepto: `${s.nombre} x${s.qty}`, monto: s.monto }))
  ];
  const metodoLabel = { efectivo:'Efectivo', tarjeta:'Tarjeta', credito:'Crédito' };

  document.getElementById('nota-imprimible').innerHTML = `
    <div class="nota-preview">
      <div class="nota-header">
        <div class="nota-logo">B·Siluets</div>
        <div class="nota-sub-hdr">Consultorio Médico Estético · Durango</div>
      </div>
      <div class="nota-folio">Folio: <strong>${folio}</strong> &nbsp;|&nbsp; ${fecha}</div>
      <div class="nota-row"><span>Paciente</span><strong>${nombrePac}</strong></div>
      <div style="border-top:1px solid rgba(201,168,108,.15);margin:10px 0"></div>
      ${detalles.map(d => `<div class="nota-row"><span>${d.concepto}</span><span>$${parseFloat(d.monto).toLocaleString()}</span></div>`).join('')}
      <div style="border-top:1px solid rgba(201,168,108,.15);margin:10px 0"></div>
      <div class="nota-row total-row"><span>TOTAL</span><span><strong>$${total.toLocaleString()}</strong></span></div>
      <div class="nota-row" style="font-size:12px"><span>Método de pago</span><span>${metodoPago.includes('|') ? metodoPago.split('|').map(m => { const [met,mon] = m.split(':'); return `${met} $${parseFloat(mon).toLocaleString()}`; }).join(' + ') : (metodoLabel[metodoPago] || metodoPago)}</span></div>
      <div class="nota-firma">
        <div><div class="nota-linea">Recibió</div></div>
        <div><div class="nota-linea">Paciente</div></div>
      </div>
      <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
    </div>`;

  openModal('nota-impr');
  limpiarFormPago();
  await cargarUltimosCobros();
}

// ── CARGAR ÚLTIMOS COBROS ──
async function cargarUltimosCobros() {
  const filtro = document.getElementById('filtro-cobros-fecha');
  if (filtro && !filtro.value) filtro.value = '';

  const { data, error } = await db
    .from('pagos')
    .select('*, pacientes(nombre, apellidos)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return;
  window._cobrosData = data;
  renderCobros(data);
}

function filtrarUltimosCobros() {
  const fecha = document.getElementById('filtro-cobros-fecha')?.value || '';
  const data  = window._cobrosData || [];
  renderCobros(fecha ? data.filter(p => p.fecha === fecha) : data);
}

function renderCobros(data) {
  const tbody = document.getElementById('tabla-ultimos-cobros');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;opacity:.3;padding:16px">Sin cobros registrados</td></tr>`;
    return;
  }

  const metBadge = { efectivo:'badge-green', tarjeta:'badge-blue', credito:'badge-gold', transferencia:'badge-gray' };
  tbody.innerHTML = data.slice(0,15).map(p => {
    const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos.charAt(0)}.` : '—';
    const badge  = metBadge[p.metodo_pago] || 'badge-gray';
    const fecha  = p.fecha ? new Date(p.fecha+'T12:00:00').toLocaleDateString('es-MX', {day:'2-digit',month:'short'}) : '—';
    return `<tr>
      <td style="font-size:12px;opacity:.6">${fecha}</td>
      <td>${nombre}</td>
      <td style="font-size:12px;opacity:.7">${p.concepto || '—'}</td>
      <td><span class="badge ${badge}">${p.metodo_pago || '—'}</span></td>
      <td style="color:var(--gold);font-weight:500">$${parseFloat(p.total).toLocaleString()}</td>
      <td><button class="tb-btn" style="padding:4px 8px;font-size:10px" onclick="reimprimirCobro(\`${p.id}\`)">🖨</button></td>
    </tr>`;
  }).join('');
}

// ── LIMPIAR FORM ──
function limpiarFormPago() {
  document.getElementById('pago-paciente').value = '';
  const notasEl = document.getElementById('pago-notas');
  if (notasEl) notasEl.value = '';

  const tratsEl = document.getElementById('trats-container');
  const suplsEl = document.getElementById('supls-container');
  if (tratsEl) tratsEl.innerHTML = '';
  if (suplsEl) suplsEl.innerHTML = '';

  const stEl = document.getElementById('subtotal-trats');
  const ssEl = document.getElementById('subtotal-supls');
  if (stEl) stEl.textContent = '$0';
  if (ssEl) ssEl.textContent = '$0';

  tratCounter = 0;
  suplCounter = 0;

  document.getElementById('tot-trat').textContent  = '$0';
  document.getElementById('tot-supl').textContent  = '$0';
  document.getElementById('tot-total').textContent = '$0';

  // Resetear métodos de pago
  const cont = document.getElementById('metodos-pago-container');
  if (cont) {
    cont.innerHTML = '';
    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 140px;gap:8px;align-items:center';
    div.innerHTML = `
      <select class="metodo-sel" style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--cream);outline:none">
        <option value="efectivo">💵 Efectivo</option>
        <option value="tarjeta">💳 Tarjeta</option>
        <option value="credito">📲 Crédito</option>
        <option value="transferencia">🏦 Transferencia</option>
      </select>
      <input type="number" class="metodo-monto" placeholder="Monto $" step="0.01" oninput="recalcMetodos()" style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">`;
    cont.appendChild(div);
  }
  const tpEl = document.getElementById('tot-pagado');
  const tpnEl = document.getElementById('tot-pendiente');
  if (tpEl) tpEl.textContent = '$0';
  if (tpnEl) tpnEl.textContent = '$0';
}

// ── REIMPRIMIR COBRO ──
async function reimprimirCobro(id) {
  const { data: p, error } = await db
    .from('pagos')
    .select('*, pacientes(nombre, apellidos)')
    .eq('id', id)
    .single();

  if (error || !p) { showToast('❌ Error al cargar cobro'); return; }

  const metodoLabel = { efectivo:'Efectivo', tarjeta:'Tarjeta', credito:'Crédito' };
  const detalles = [];
  if (p.monto_consulta > 0)    detalles.push({ concepto: 'Consulta', monto: p.monto_consulta });
  if (p.monto_tratamiento > 0) detalles.push({ concepto: 'Tratamiento', monto: p.monto_tratamiento });
  if (p.monto_suplementos > 0) detalles.push({ concepto: 'Suplementos', monto: p.monto_suplementos });

  const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos}` : '—';

  document.getElementById('nota-imprimible').innerHTML = `
    <div class="nota-preview">
      <div class="nota-header">
        <div class="nota-logo">B·Siluets</div>
        <div class="nota-sub-hdr">Consultorio Médico Estético · Durango</div>
      </div>
      <div class="nota-folio">Folio: <strong>${p.folio || '—'}</strong> &nbsp;|&nbsp; ${p.fecha}</div>
      <div class="nota-row"><span>Paciente</span><strong>${nombre}</strong></div>
      <div style="border-top:1px solid rgba(201,168,108,.15);margin:10px 0"></div>
      ${detalles.map(d => `<div class="nota-row"><span>${d.concepto}</span><span>$${parseFloat(d.monto).toLocaleString()}</span></div>`).join('')}
      <div style="border-top:1px solid rgba(201,168,108,.15);margin:10px 0"></div>
      <div class="nota-row total-row"><span>TOTAL</span><span><strong>$${parseFloat(p.total).toLocaleString()}</strong></span></div>
      <div class="nota-row" style="font-size:12px"><span>Método de pago</span><span>${metodoLabel[p.metodo_pago] || p.metodo_pago}</span></div>
      <div class="nota-firma">
        <div><div class="nota-linea">Recibió</div></div>
        <div><div class="nota-linea">Paciente</div></div>
      </div>
      <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
    </div>`;

  openModal('nota-impr');
}

// ── MÉTODOS DE PAGO COMBINADOS ──
function agregarMetodoPago() {
  const cont = document.getElementById('metodos-pago-container');
  const div  = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 140px 32px;gap:8px;align-items:center';
  div.innerHTML = `
    <select class="metodo-sel" style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--cream);outline:none">
      <option value="efectivo">💵 Efectivo</option>
      <option value="tarjeta">💳 Tarjeta</option>
      <option value="credito">📲 Crédito</option>
      <option value="transferencia">🏦 Transferencia</option>
    </select>
    <input type="number" class="metodo-monto" placeholder="Monto $" step="0.01" oninput="recalcMetodos()" style="background:var(--dark);border:1px solid rgba(201,168,108,.15);padding:8px 10px;font-family:'Jost',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
    <button type="button" onclick="this.parentElement.remove();recalcMetodos()" style="background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);color:#e74c3c;padding:6px 8px;cursor:pointer;font-size:12px">✕</button>`;
  cont.appendChild(div);
  recalcMetodos();
}

function recalcMetodos() {
  let totalPagado = 0;
  document.querySelectorAll('.metodo-monto').forEach(el => {
    totalPagado += parseFloat(el.value || 0);
  });
  const totalCobro = parseFloat(document.getElementById('tot-total').textContent.replace(/[$,]/g,'')) || 0;
  const pendiente  = Math.max(0, totalCobro - totalPagado);

  document.getElementById('tot-pagado').textContent    = '$' + totalPagado.toLocaleString();
  document.getElementById('tot-pendiente').textContent = '$' + pendiente.toLocaleString();
  document.getElementById('tot-pendiente').style.color = pendiente > 0 ? '#e74c3c' : '#27AE60';
}


function obtenerMetodosPago() {
  const metodos = [];
  document.querySelectorAll('#metodos-pago-container .metodo-sel').forEach((sel, i) => {
    const montos = document.querySelectorAll('#metodos-pago-container .metodo-monto');
    const monto  = parseFloat(montos[i]?.value || 0);
    if (monto > 0) metodos.push(`${sel.value}:${monto}`);
  });
  return metodos.length === 1 ? metodos[0].split(':')[0] : metodos.join('|');
}