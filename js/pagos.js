// ─────────────────────────────────────────
//  B·Siluets — Módulo Pagos
//  Software SIE © 2025
// ─────────────────────────────────────────

let metodoSeleccionado = 'efectivo';
let tratCounter = 0;
let medicCounter = 0;
let suplCounter = 0;

// ── INICIALIZAR PAGOS ──
async function initPagos() {
  const hoy = fechaHoyISO();
  document.getElementById('pago-fecha').value = hoy;
  await cargarSelectPacientesPagos();
  await cargarSelectTratamientosPagos();
  await cargarSelectMedicamentosPagos();
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

async function cargarSelectMedicamentosPagos() {
  const { data } = await db.from('inventario').select('id,nombre,precio_venta,unidad').eq('activo',true).eq('categoria','Medicamento').order('nombre');
  const sel = document.getElementById('pago-medicamento');
  if (sel && data) {
    sel.innerHTML = '<option value="0">Seleccionar...</option>' +
      data.filter(p => p.precio_venta > 0).map(p =>
        `<option value="${p.precio_venta}" data-id="${p.id}" data-nombre="${p.nombre}" data-unidad="${p.unidad}">${p.nombre} ($${parseFloat(p.precio_venta).toLocaleString()}/${p.unidad})</option>`
      ).join('');
  }
}

async function cargarSelectSuplementosPagos() {
  const { data } = await db.from('inventario').select('id,nombre,precio_venta,unidad').eq('activo',true).in('categoria',['Suplemento','Proteína']).order('nombre');
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

  let totalMedics = 0;
  document.querySelectorAll('.medic-item').forEach(item => {
    const precio = parseFloat(item.querySelector('.medic-precio')?.value || 0);
    const qty    = parseFloat(item.querySelector('.medic-qty')?.value || 1);
    totalMedics += precio * qty;
  });

  let totalSupls = 0;
  document.querySelectorAll('.supl-item').forEach(item => {
    const precio = parseFloat(item.querySelector('.supl-precio')?.value || 0);
    const qty    = parseFloat(item.querySelector('.supl-qty')?.value || 1);
    totalSupls += precio * qty;
  });

  const total = totalTrats + totalMedics + totalSupls;
  const stEl = document.getElementById('subtotal-trats');
  const smEl = document.getElementById('subtotal-medics');
  const ssEl = document.getElementById('subtotal-supls');
  if (stEl) stEl.textContent = '$' + totalTrats.toLocaleString();
  if (smEl) smEl.textContent = '$' + totalMedics.toLocaleString();
  if (ssEl) ssEl.textContent = '$' + totalSupls.toLocaleString();
  document.getElementById('tot-trat').textContent  = '$' + totalTrats.toLocaleString();
  document.getElementById('tot-medic').textContent = '$' + totalMedics.toLocaleString();
  document.getElementById('tot-supl').textContent  = '$' + totalSupls.toLocaleString();
  document.getElementById('tot-total').textContent = '$' + total.toLocaleString();
  recalcMetodos();
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
      style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--cream);outline:none;width:100%">
      <option value="0">Seleccionar tratamiento...</option>
      ${opciones.replace(/<option[^>]*>[^<]*Seleccionar[^<]*<\/option>/g,'')}
    </select>
    <input type="number" class="trat-precio" placeholder="Precio $" step="0.01" oninput="recalcPago()"
      style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
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

// ── AGREGAR MEDICAMENTO ──
function agregarMedicPago() {
  const cont = document.getElementById('medics-container');
  const id   = ++medicCounter;
  const opciones = document.getElementById('pago-medicamento')?.innerHTML || '';

  const div = document.createElement('div');
  div.className = 'medic-item';
  div.id = `medic-item-${id}`;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 70px 110px 32px;gap:8px;margin-bottom:8px;align-items:center';
  div.innerHTML = `
    <select class="medic-select" onchange="autoFillMedicPrecio(this,${id})"
      style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--cream);outline:none;width:100%">
      <option value="0">Seleccionar medicamento...</option>
      ${opciones.replace(/<option[^>]*>[^<]*Seleccionar[^<]*<\/option>/g,'')}
    </select>
    <input type="number" class="medic-qty" value="1" step="0.25" min="0.25" oninput="recalcPago()" placeholder="Cant."
      style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--cream);outline:none;width:100%">
    <input type="number" class="medic-precio" placeholder="Precio $" step="0.01" oninput="recalcPago()"
      style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
    <button type="button" onclick="eliminarMedicPago(${id})"
      style="background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);color:#e74c3c;padding:6px 8px;cursor:pointer;font-size:14px">✕</button>`;
  cont.appendChild(div);
  recalcPago();
}

function autoFillMedicPrecio(sel, id) {
  const precio   = sel.options[sel.selectedIndex]?.value || 0;
  const precioEl = document.getElementById(`medic-item-${id}`)?.querySelector('.medic-precio');
  if (precioEl && parseFloat(precio) > 0) precioEl.value = precio;
  recalcPago();
}

function eliminarMedicPago(id) {
  document.getElementById(`medic-item-${id}`)?.remove();
  recalcPago();
}

// ── AGREGAR SUPLEMENTO / PROTEÍNA ──
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
      style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--cream);outline:none;width:100%">
      <option value="0">Seleccionar producto...</option>
      ${opciones.replace(/<option[^>]*>[^<]*Seleccionar[^<]*<\/option>/g,'')}
    </select>
    <input type="number" class="supl-qty" value="1" step="0.25" min="0.25" oninput="recalcPago()" placeholder="Cant."
      style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--cream);outline:none;width:100%">
    <input type="number" class="supl-precio" placeholder="Precio $" step="0.01" oninput="recalcPago()"
      style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
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

  // Recopilar medicamentos
  const medicItems = [];
  document.querySelectorAll('.medic-item').forEach(item => {
    const sel    = item.querySelector('.medic-select');
    const qty    = parseFloat(item.querySelector('.medic-qty')?.value || 1);
    const precio = parseFloat(item.querySelector('.medic-precio')?.value || 0);
    const nombre = sel?.options[sel.selectedIndex]?.dataset?.nombre ||
                   sel?.options[sel.selectedIndex]?.text?.replace(/\s*\(.*\)/, '').trim() || '';
    const id     = sel?.options[sel.selectedIndex]?.dataset?.id || null;
    if (precio > 0 && nombre && !nombre.includes('Seleccionar')) {
      medicItems.push({ nombre, qty, precio, id, monto: precio * qty });
    }
  });

  // Recopilar suplementos / proteínas
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

  if (tratItems.length === 0 && medicItems.length === 0 && suplItems.length === 0) {
    showToast('⚠ Agrega al menos un tratamiento, medicamento o suplemento');
    return;
  }

  const totalTrats  = tratItems.reduce((s, t) => s + t.precio, 0);
  const totalMedics = medicItems.reduce((s, m) => s + m.monto, 0);
  const totalSupls  = suplItems.reduce((s, s2) => s + s2.monto, 0);
  const total      = totalTrats + totalMedics + totalSupls;
  const concepto   = [...tratItems.map(t => t.nombre), ...medicItems.map(m => m.nombre), ...suplItems.map(s => s.nombre)].join(' + ');
  // Cada renglón con un monto capturado debe tener también un método de pago
  // elegido explícitamente (ya no hay "Efectivo" por default): evita que un
  // pago con tarjeta/transferencia se guarde como Efectivo por descuido.
  const filasMetodoSel = document.querySelectorAll('#metodos-pago-container .metodo-sel');
  const filasMetodoMonto = document.querySelectorAll('#metodos-pago-container .metodo-monto');
  for (let i = 0; i < filasMetodoSel.length; i++) {
    const montoFila = parseFloat(filasMetodoMonto[i]?.value || 0);
    if (montoFila > 0 && !filasMetodoSel[i].value) {
      showToast('⚠ Selecciona el método de pago de cada renglón capturado');
      return;
    }
  }

  const folio      = 'NV-' + fecha.replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100);
  const metodoPago     = obtenerMetodosPago();
  const metodoDetalle  = obtenerMetodosPagoDetalle();
  const montoPagado    = metodoDetalle.reduce((s, m) => s + m.monto, 0);
  const tipoCobro      = document.querySelector('input[name="tipo-cobro"]:checked')?.value || 'contado';
  const esCredito      = tipoCobro === 'credito';
  const saldoPendiente = Math.max(0, total - montoPagado);

  // "Contado" implica que se cubre el total; si el monto capturado en
  // Método de pago no alcanza, la nota quedaría incongruente (total distinto
  // a lo realmente cobrado) sin dejar rastro del adeudo. Se pide corregir el
  // monto o cambiar a "A crédito".
  if (!esCredito && Math.abs(montoPagado - total) > 0.5) {
    showToast('⚠ El monto en Método de pago no coincide con el total. Ajústalo o marca "A crédito".');
    return;
  }
  if (esCredito && montoPagado > total + 0.5) {
    showToast('⚠ El monto capturado en Método de pago supera el total del cobro');
    return;
  }

  // Desglose línea por línea (cada tratamiento/medicamento/suplemento por
  // separado, con su nombre, cantidad y monto individual) para poder
  // reimprimir la nota de venta con el mismo detalle que se ve al momento
  // del cobro, en vez de solo los 3 montos agrupados.
  const detalleItems = [
    ...tratItems.map(t => ({ concepto: t.nombre, monto: t.precio })),
    ...medicItems.map(m => ({ concepto: `${m.nombre} x${m.qty}`, monto: m.monto })),
    ...suplItems.map(s => ({ concepto: `${s.nombre} x${s.qty}`, monto: s.monto }))
  ];

  const datos = {
    paciente_id:        pacienteId,
    concepto:           concepto,
    monto_consulta:     0,
    monto_tratamiento:  totalTrats,
    monto_medicamentos: totalMedics,
    monto_suplementos:  totalSupls,
    total:              total,
    metodo_pago:        esCredito ? 'credito' : metodoPago,
    liquidado:          !esCredito,
    fecha:              fecha,
    folio:              folio,
    detalle_items:      detalleItems,
  };

  const { data: pagoInsertado, error } = await db.from('pagos').insert([datos]).select('id').single();
  if (error) { showToast('❌ Error: ' + error.message); return; }

  // Si es a crédito y el paciente dejó un pago inicial (parcial), se
  // registra de inmediato como abono contra ESTE cobro para que el saldo
  // pendiente en Créditos & Adeudos ya refleje total - pago inicial, en
  // lugar del total completo como si no se hubiera pagado nada.
  if (esCredito && montoPagado > 0 && pagoInsertado?.id) {
    const abonosIniciales = metodoDetalle.map(m => ({
      paciente_id: pacienteId,
      pago_id:     pagoInsertado.id,
      monto:       m.monto,
      metodo_pago: m.metodo,
      fecha:       fecha,
      referencia:  'Pago inicial al momento de la venta',
    }));
    await db.from('abonos').insert(abonosIniciales);
  }

  // Descontar stock de cada medicamento y suplemento/proteína
  for (const s of [...medicItems, ...suplItems]) {
    if (s.id && s.qty > 0) {
      const { data: prod } = await db.from('inventario').select('stock').eq('id', s.id).single();
      if (prod) {
        const nuevoStock = Math.max(0, parseFloat(prod.stock) - s.qty);
        await db.from('inventario').update({ stock: nuevoStock }).eq('id', s.id);
      }
    }
  }

  showToast(`✓ Cobro de $${total.toLocaleString()} registrado correctamente`);

  // Nota de venta
  const selPac    = document.getElementById('pago-paciente');
  const nombrePac = selPac.options[selPac.selectedIndex]?.text || '—';
  const detalles  = detalleItems;
  const metodoLabel = { efectivo:'Efectivo', tarjeta:'Tarjeta', credito:'Crédito', transferencia:'Transferencia' };

  // Fila de pago: si es a crédito, mostrar Pagado + Saldo pendiente (para
  // que la nota sea congruente con el adeudo real que queda registrado);
  // si es contado, el método de pago ya cubre el total.
  const filaPagoNota = esCredito
    ? `
      <div class="nota-row" style="font-size:12px"><span>Pagado</span><span>${metodoDetalle.length > 0 ? metodoDetalle.map(m => `${metodoLabel[m.metodo] || m.metodo} $${m.monto.toLocaleString()}`).join(' + ') : '$0'}</span></div>
      <div class="nota-row" style="font-size:13px;color:#e74c3c"><span><strong>Saldo pendiente (a crédito)</strong></span><span><strong>$${saldoPendiente.toLocaleString()}</strong></span></div>`
    : `
      <div class="nota-row" style="font-size:12px"><span>Método de pago</span><span>${metodoPago.includes('|') ? metodoPago.split('|').map(m => { const [met,mon] = m.split(':'); return `${met} $${parseFloat(mon).toLocaleString()}`; }).join(' + ') : (metodoLabel[metodoPago] || metodoPago)}</span></div>`;

  document.getElementById('nota-imprimible').innerHTML = `
    <div class="nota-preview">
      <div class="nota-header">
        <div class="nota-logo"><img src="assets/img/logo-bsiluets.png" alt="B·Siluets" style="height:50px;width:auto;object-fit:contain"></div>
        <div class="nota-sub-hdr">Consultorio Médico Estético · Durango</div>
      </div>
      <div class="nota-folio">Folio: <strong>${folio}</strong> &nbsp;|&nbsp; ${fecha}</div>
      <div class="nota-row"><span>Paciente</span><strong>${nombrePac}</strong></div>
      <div style="border-top:1px solid rgba(184,147,90,.28);margin:10px 0"></div>
      ${detalles.map(d => `<div class="nota-row"><span>${d.concepto}</span><span>$${parseFloat(d.monto).toLocaleString()}</span></div>`).join('')}
      <div style="border-top:1px solid rgba(184,147,90,.28);margin:10px 0"></div>
      <div class="nota-row total-row"><span>TOTAL</span><span><strong>$${total.toLocaleString()}</strong></span></div>
      ${filaPagoNota}
      <div class="nota-firma">
        <div><div class="nota-linea">Recibió</div></div>
        <div><div class="nota-linea">Paciente</div></div>
      </div>
      <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
    </div>`;

  document.getElementById('nota-impr-titulo').textContent = 'Nota de Venta';
  openModal('nota-impr');
  limpiarFormPago();
  await cargarUltimosCobros();

  // Actualizar totales en Pacientes, Dashboard, Créditos, Caja y Reportes
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
}

// ── BUSCAR IDs DE PACIENTES POR TEXTO (nombre y/o apellidos, sin importar
//    el orden en que se escriban las palabras) — usado por el buscador de
//    paciente en Últimos Cobros, para buscar entre TODOS los pacientes y
//    no solo entre los que ya están cargados en pantalla. ──
async function buscarIdsPacientesPorTexto(texto) {
  const tokens = (texto || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let query = db.from('pacientes').select('id');
  tokens.forEach(t => {
    const safe = t.replace(/[%,]/g, '');
    query = query.or(`nombre.ilike.%${safe}%,apellidos.ilike.%${safe}%`);
  });

  const { data } = await query;
  return (data || []).map(p => p.id);
}

// ── CARGAR ÚLTIMOS COBROS ──
async function cargarUltimosCobros() {
  const fecha     = document.getElementById('filtro-cobros-fecha')?.value || '';
  const concepto  = document.getElementById('filtro-cobros-concepto')?.value.trim() || '';
  const paciente  = document.getElementById('filtro-cobros-paciente')?.value.trim() || '';

  let query = db
    .from('pagos')
    .select('*, pacientes(nombre, apellidos)')
    .eq('eliminado', false)
    .order('created_at', { ascending: false });

  if (fecha)    query = query.eq('fecha', fecha);
  if (concepto) query = query.ilike('concepto', `%${concepto}%`);

  if (paciente) {
    const ids = await buscarIdsPacientesPorTexto(paciente);
    if (!ids || ids.length === 0) {
      window._cobrosData = [];
      renderCobros([]);
      return;
    }
    query = query.in('paciente_id', ids);
  }

  // Sin ninguna búsqueda: solo los últimos 50 (vista rápida por defecto).
  // Con búsqueda por concepto y/o paciente: sin límite, para no perder
  // registros antiguos (ej. saldos a favor viejos que ya salieron de los
  // últimos 50).
  if (!concepto && !paciente) query = query.limit(50);

  const { data, error } = await query;

  if (error || !data) return;
  window._cobrosData = data;

  // Saldo pendiente de los cobros en crédito no liquidados que se van a
  // mostrar, para poder pintarlo junto al Total (que siempre es el monto
  // ORIGINAL de la venta y no debe modificarse: lo usan también Caja,
  // Créditos y el recibo).
  const idsCredito = data.filter(p => p.metodo_pago === 'credito' && !p.liquidado).map(p => p.id);
  let abonosPorPago = {};
  if (idsCredito.length > 0) {
    const { data: abonos } = await db.from('abonos').select('pago_id, monto').in('pago_id', idsCredito).eq('eliminado', false);
    (abonos || []).forEach(a => {
      abonosPorPago[a.pago_id] = (abonosPorPago[a.pago_id] || 0) + parseFloat(a.monto || 0);
    });
  }

  renderCobros(data, abonosPorPago);
}

// ── FILTRO POR FECHA (consulta directo a Supabase) ──
function filtrarUltimosCobros() {
  cargarUltimosCobros();
}

// ── FILTRO POR CONCEPTO (consulta directo a Supabase, con debounce) ──
let cobrosConceptoTimeout;
function buscarCobrosPorConcepto() {
  clearTimeout(cobrosConceptoTimeout);
  cobrosConceptoTimeout = setTimeout(() => cargarUltimosCobros(), 400);
}

// ── FILTRO POR PACIENTE (consulta directo a Supabase, con debounce) ──
let cobrosPacienteTimeout;
function buscarCobrosPorPaciente() {
  clearTimeout(cobrosPacienteTimeout);
  cobrosPacienteTimeout = setTimeout(() => cargarUltimosCobros(), 400);
}

function renderCobros(data, abonosPorPago = {}) {
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
    const esCreditoPendiente = p.metodo_pago === 'credito' && !p.liquidado;
    const saldo = esCreditoPendiente ? Math.max(0, parseFloat(p.total || 0) - (abonosPorPago[p.id] || 0)) : 0;
    return `<tr>
      <td style="font-size:12px;opacity:.6">${fecha}</td>
      <td>${nombre}</td>
      <td style="font-size:12px;opacity:.7">${p.concepto || '—'}</td>
      <td><span class="badge ${badge}">${p.metodo_pago || '—'}</span></td>
      <td style="color:var(--gold);font-weight:500">
        $${parseFloat(p.total).toLocaleString()}
        ${esCreditoPendiente && saldo > 0.5 ? `<div style="font-size:10px;color:#e74c3c;font-weight:500">Saldo: $${saldo.toLocaleString()}</div>` : ''}
      </td>
      <td style="display:flex;gap:4px">
      <button class="tb-btn" style="padding:4px 8px;font-size:10px" onclick="reimprimirCobro(\`${p.id}\`)">🖨</button>
      <button class="tb-btn danger" style="padding:4px 8px;font-size:10px;background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);color:#e74c3c" onclick="eliminarCobro(\`${p.id}\`)">✕</button>
    </td>
    </tr>`;
  }).join('');
}

// ── LIMPIAR FORM ──
function limpiarFormPago() {
  document.getElementById('pago-paciente').value = '';
  const notasEl = document.getElementById('pago-notas');
  if (notasEl) notasEl.value = '';

  const tratsEl  = document.getElementById('trats-container');
  const medicsEl = document.getElementById('medics-container');
  const suplsEl  = document.getElementById('supls-container');
  if (tratsEl)  tratsEl.innerHTML  = '';
  if (medicsEl) medicsEl.innerHTML = '';
  if (suplsEl)  suplsEl.innerHTML  = '';

  const stEl = document.getElementById('subtotal-trats');
  const smEl = document.getElementById('subtotal-medics');
  const ssEl = document.getElementById('subtotal-supls');
  if (stEl) stEl.textContent = '$0';
  if (smEl) smEl.textContent = '$0';
  if (ssEl) ssEl.textContent = '$0';

  tratCounter  = 0;
  medicCounter = 0;
  suplCounter  = 0;

  document.getElementById('tot-trat').textContent  = '$0';
  document.getElementById('tot-medic').textContent = '$0';
  document.getElementById('tot-supl').textContent  = '$0';
  document.getElementById('tot-total').textContent = '$0';

  // Resetear métodos de pago
  const cont = document.getElementById('metodos-pago-container');
  if (cont) {
    cont.innerHTML = '';
    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 140px;gap:8px;align-items:center';
    div.innerHTML = `
      <select class="metodo-sel" style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--cream);outline:none">
        <option value="" selected disabled>Selecciona método...</option>
        <option value="efectivo">💵 Efectivo</option>
        <option value="tarjeta">💳 Tarjeta</option>
        <option value="transferencia">🏦 Transferencia</option>
      </select>
      <input type="number" class="metodo-monto" placeholder="Monto $" step="0.01" oninput="recalcMetodos()" style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">`;
    cont.appendChild(div);
  }
  const tpEl = document.getElementById('tot-pagado');
  const tpnEl = document.getElementById('tot-pendiente');
  if (tpEl) tpEl.textContent = '$0';
  if (tpnEl) tpnEl.textContent = '$0';


  // Resetear tipo de cobro
  const contado = document.getElementById('cobro-contado');
  if (contado) contado.checked = true;

  actualizarTipoCobroDisponible(0, 0);
}

// ── REIMPRIMIR COBRO ──
async function reimprimirCobro(id) {
  const { data: p, error } = await db
    .from('pagos')
    .select('*, pacientes(nombre, apellidos)')
    .eq('id', id)
    .single();

  if (error || !p) { showToast('❌ Error al cargar cobro'); return; }

  const metodoLabel = { efectivo:'Efectivo', tarjeta:'Tarjeta', credito:'Crédito', transferencia:'Transferencia' };

  // Preferir el desglose línea por línea guardado al momento del cobro
  // (nombre + cantidad de cada tratamiento/medicamento/suplemento). Los
  // cobros anteriores a este cambio no lo tienen guardado, así que para
  // esos se cae de vuelta a los 3 montos agrupados de siempre.
  let detalles = Array.isArray(p.detalle_items) ? p.detalle_items : [];
  if (detalles.length === 0) {
    if (p.monto_consulta > 0)     detalles.push({ concepto: 'Consulta', monto: p.monto_consulta });
    if (p.monto_tratamiento > 0)  detalles.push({ concepto: 'Tratamiento', monto: p.monto_tratamiento });
    if (p.monto_medicamentos > 0) detalles.push({ concepto: 'Medicamentos', monto: p.monto_medicamentos });
    if (p.monto_suplementos > 0)  detalles.push({ concepto: 'Suplementos / Proteínas', monto: p.monto_suplementos });
  }

  const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos}` : '—';

  // Si es un cobro a crédito, traer los abonos aplicados a ESTE cobro
  // (incluye el pago inicial capturado al momento de la venta, si lo hubo)
  // para reimprimir con el Pagado / Saldo pendiente ACTUALIZADOS, igual
  // que se ve en la nota original y en Últimos Cobros.
  let filaPagoNota;
  if (p.metodo_pago === 'credito') {
    const { data: abonos } = await db.from('abonos').select('monto, metodo_pago').eq('pago_id', p.id).eq('eliminado', false);
    const pagado = (abonos || []).reduce((s, a) => s + parseFloat(a.monto || 0), 0);
    const saldo  = Math.max(0, parseFloat(p.total || 0) - pagado);
    const pagadoTexto = (abonos && abonos.length > 0)
      ? abonos.map(a => `${metodoLabel[a.metodo_pago] || a.metodo_pago} $${parseFloat(a.monto).toLocaleString()}`).join(' + ')
      : '$0';
    filaPagoNota = `
      <div class="nota-row" style="font-size:12px"><span>Pagado</span><span>${pagadoTexto}</span></div>
      <div class="nota-row" style="font-size:13px;color:#e74c3c"><span><strong>Saldo pendiente (a crédito)</strong></span><span><strong>$${saldo.toLocaleString()}</strong></span></div>`;
  } else {
    filaPagoNota = `
      <div class="nota-row" style="font-size:12px"><span>Método de pago</span><span>${metodoLabel[p.metodo_pago] || p.metodo_pago}</span></div>`;
  }

  document.getElementById('nota-imprimible').innerHTML = `
    <div class="nota-preview">
      <div class="nota-header">
        <div class="nota-logo"><img src="data:image/png;base64,${LOGO_B64}" alt="B·Siluets" style="height:50px;width:auto;object-fit:contain"></div>
        <div class="nota-sub-hdr">Consultorio Médico Estético · Durango</div>
      </div>
      <div class="nota-folio">Folio: <strong>${p.folio || '—'}</strong> &nbsp;|&nbsp; ${p.fecha}</div>
      <div class="nota-row"><span>Paciente</span><strong>${nombre}</strong></div>
      <div style="border-top:1px solid rgba(184,147,90,.28);margin:10px 0"></div>
      ${detalles.map(d => `<div class="nota-row"><span>${d.concepto}</span><span>$${parseFloat(d.monto).toLocaleString()}</span></div>`).join('')}
      <div style="border-top:1px solid rgba(184,147,90,.28);margin:10px 0"></div>
      <div class="nota-row total-row"><span>TOTAL</span><span><strong>$${parseFloat(p.total).toLocaleString()}</strong></span></div>
      ${filaPagoNota}
      <div class="nota-firma">
        <div><div class="nota-linea">Recibió</div></div>
        <div><div class="nota-linea">Paciente</div></div>
      </div>
      <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
    </div>`;

  document.getElementById('nota-impr-titulo').textContent = 'Nota de Venta';
  openModal('nota-impr');
}

// ── MÉTODOS DE PAGO COMBINADOS ──
function agregarMetodoPago() {
  const cont = document.getElementById('metodos-pago-container');
  const div  = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 140px 32px;gap:8px;align-items:center';
  div.innerHTML = `
    <select class="metodo-sel" style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--cream);outline:none">
      <option value="" selected disabled>Selecciona método...</option>
      <option value="efectivo">💵 Efectivo</option>
      <option value="tarjeta">💳 Tarjeta</option>
      <option value="transferencia">🏦 Transferencia</option>
    </select>
    <input type="number" class="metodo-monto" placeholder="Monto $" step="0.01" oninput="recalcMetodos()" style="background:var(--dark);border:1px solid rgba(184,147,90,.28);padding:8px 10px;font-family:'Inter',sans-serif;font-size:12px;color:var(--gold);outline:none;width:100%">
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

  actualizarTipoCobroDisponible(totalCobro, totalPagado);
}

// El tipo de cobro ya no lo elige el capturista: lo decide el sistema según
// lo capturado en Método de pago vs. el Total, para evitar que se marque
// "Contado" con un pago incompleto (o "A crédito" con el total ya cubierto).
//   - Pagado == Total  -> "Contado" (automático)
//   - Pagado <  Total  -> "A crédito" (automático)
//   - Pagado >  Total  -> sobrepago: se avisa y se bloquea Registrar Cobro
function actualizarTipoCobroDisponible(totalCobro, totalPagado) {
  const contadoRadio = document.getElementById('cobro-contado');
  const creditoRadio = document.getElementById('cobro-credito');
  const contadoLabel = document.getElementById('cobro-contado-label');
  const aviso         = document.getElementById('cobro-aviso');
  const btnRegistrar  = document.getElementById('btn-registrar-cobro');
  if (!contadoRadio || !creditoRadio) return;

  // Los radios quedan solo informativos: el capturista ya no puede elegir.
  contadoRadio.disabled = true;
  creditoRadio.disabled = true;
  if (contadoLabel) { contadoLabel.style.opacity = '.6'; contadoLabel.style.cursor = 'not-allowed'; }

  const diff      = totalPagado - totalCobro;
  const sobrepago = diff > 0.5;
  const coincide  = Math.abs(diff) <= 0.5;

  if (sobrepago) {
    if (aviso) {
      aviso.textContent   = '⚠ El monto capturado en Método de pago supera el Total del cobro. Corrige el monto antes de continuar.';
      aviso.style.display = '';
    }
    if (btnRegistrar) btnRegistrar.disabled = true;
    return;
  }

  if (coincide) {
    contadoRadio.checked = true;
  } else {
    creditoRadio.checked = true;
  }
  if (aviso) aviso.style.display = 'none';
  if (btnRegistrar) btnRegistrar.disabled = false;
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

// Igual que obtenerMetodosPago() pero como arreglo {metodo, monto}, y sin la
// opción "credito" (que en este selector solo marca "esta parte queda a
// deber", no es un pago real recibido). Se usa para saber cuánto dinero
// ENTRÓ de verdad hoy cuando el cobro se registra "a crédito", y así poder
// generar el abono inicial correspondiente.
function obtenerMetodosPagoDetalle() {
  const detalle = [];
  document.querySelectorAll('#metodos-pago-container .metodo-sel').forEach((sel, i) => {
    const montos = document.querySelectorAll('#metodos-pago-container .metodo-monto');
    const monto  = parseFloat(montos[i]?.value || 0);
    if (monto > 0 && sel.value !== 'credito') detalle.push({ metodo: sel.value, monto });
  });
  return detalle;
}


// ── ELIMINAR COBRO ──
async function eliminarCobro(id) {
  // Si el cobro tiene abonos ligados (pago_id), eliminarlo los dejaría
  // "huérfanos": seguirían apareciendo en el Historial de Créditos & Adeudos
  // pero ya no se restarían de ningún saldo (el dinero recibido desaparecería
  // de la contabilidad del adeudo). Se bloquea hasta reasignar/eliminar esos
  // abonos primero.
  const { data: abonosLigados } = await db.from('abonos').select('id, monto').eq('pago_id', id).eq('eliminado', false);
  if (abonosLigados && abonosLigados.length > 0) {
    const total = abonosLigados.reduce((s, a) => s + parseFloat(a.monto || 0), 0);
    showToast(`⚠ Este cobro tiene ${abonosLigados.length} abono(s) por $${total.toLocaleString()} ligado(s). Reasígnalos o elimínalos antes de borrar el cobro.`);
    return;
  }

  if (!confirm('¿Eliminar este cobro? Quedará un registro de la eliminación y se recalculará el saldo del paciente si era un cobro en crédito.')) return;

  if (typeof requiereAutorizacionAdmin === 'function' && requiereAutorizacionAdmin()) {
    const autorizado = await pedirAutorizacionAdmin('Eliminar un cobro requiere autorización de un Administrador.');
    if (!autorizado) return;
  }

  const usuario = JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}');
  const { error } = await db.from('pagos').update({
    eliminado:      true,
    eliminado_por:  usuario.usuario || 'admin',
    eliminado_at:   new Date().toISOString()
  }).eq('id', id);

  if (error) { showToast('❌ Error: ' + error.message); return; }

  showToast('✓ Cobro eliminado — contabilidad recalculada');

  // Refrescar el propio módulo de Pagos
  await cargarUltimosCobros();
  if (typeof cargarEliminados === 'function') await cargarEliminados();

  // Recalcular en todos los módulos que dependen de "pagos" (créditos, caja,
  // reportes, dashboard, perfil de la paciente en Pacientes)
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
}