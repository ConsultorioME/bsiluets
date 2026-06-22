// ─────────────────────────────────────────
//  B·Siluets — Módulo Pagos
//  Software SIE © 2025
// ─────────────────────────────────────────

let metodoSeleccionado = 'efectivo';

// ── INICIALIZAR PAGOS ──
async function initPagos() {
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('pago-fecha').value = hoy;
  await cargarSelectPacientesPagos();
  await cargarSelectTratamientosPagos();
  await cargarSelectSuplementosPagos();
  await cargarUltimosCobros();
}

// ── CARGAR SELECTS ──
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
      data.map(t => `<option value="${t.precio}" data-id="${t.id}" data-nombre="${t.nombre}">
        ${t.nombre} ($${parseFloat(t.precio).toLocaleString()})</option>`).join('');
  }
}

async function cargarSelectSuplementosPagos() {
  const { data } = await db.from('inventario').select('id,nombre,precio_venta,unidad').eq('activo',true).order('nombre');
  const sel = document.getElementById('pago-suplemento');
  if (sel && data) {
    sel.innerHTML = '<option value="0">Seleccionar...</option>' +
      data.filter(p => p.precio_venta > 0).map(p =>
        `<option value="${p.precio_venta}" data-id="${p.id}" data-nombre="${p.nombre}" data-unidad="${p.unidad}">
          ${p.nombre} ($${parseFloat(p.precio_venta).toLocaleString()}/${p.unidad})</option>`
      ).join('');
  }
}

// ── RECALCULAR TOTALES ──
function recalcPago() {
  // Consulta
  const chkConsulta = document.getElementById('chk-consulta');
  const bloqConsulta = document.getElementById('consulta-block');
  if (bloqConsulta) bloqConsulta.style.display = chkConsulta?.checked ? 'block' : 'none';
  const montoConsulta = chkConsulta?.checked
    ? parseFloat(document.getElementById('pago-consulta-tipo')?.value || 0) : 0;

  // Tratamiento
  const chkTrat = document.getElementById('chk-trat');
  const bloqTrat = document.getElementById('trat-block');
  if (bloqTrat) bloqTrat.style.display = chkTrat?.checked ? 'block' : 'none';
  const montoTrat = chkTrat?.checked
    ? parseFloat(document.getElementById('pago-tratamiento')?.value || 0) : 0;

  // Suplementos
  const chkSupl = document.getElementById('chk-supl');
  const bloqSupl = document.getElementById('supl-block');
  if (bloqSupl) bloqSupl.style.display = chkSupl?.checked ? 'block' : 'none';
  const precioSupl = chkSupl?.checked
    ? parseFloat(document.getElementById('pago-suplemento')?.value || 0) : 0;
  const qty = chkSupl?.checked
    ? parseFloat(document.getElementById('pago-supl-qty')?.value || 1) : 0;
  const montoSupl = precioSupl * qty;

  const total = montoConsulta + montoTrat + montoSupl;

  document.getElementById('tot-consulta').textContent = '$' + montoConsulta.toLocaleString();
  document.getElementById('tot-trat').textContent     = '$' + montoTrat.toLocaleString();
  document.getElementById('tot-supl').textContent     = '$' + montoSupl.toFixed(2);
  document.getElementById('tot-total').textContent    = '$' + total.toLocaleString();
}

// ── MÉTODO DE PAGO ──
function selPM(el) {
  document.querySelectorAll('.pm').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  metodoSeleccionado = el.dataset.metodo || 'efectivo';
}

// ── REGISTRAR COBRO ──
async function registrarCobro() {
  const pacienteId = document.getElementById('pago-paciente').value;
  const fecha      = document.getElementById('pago-fecha').value;

  if (!pacienteId) { showToast('⚠ Selecciona una paciente'); return; }
  if (!fecha)      { showToast('⚠ La fecha es obligatoria'); return; }

  const chkConsulta = document.getElementById('chk-consulta').checked;
  const chkTrat     = document.getElementById('chk-trat').checked;
  const chkSupl     = document.getElementById('chk-supl').checked;

  if (!chkConsulta && !chkTrat && !chkSupl) {

    // Si el cobro es en crédito, actualizar módulo de créditos si está visible
    if (metodoSeleccionado === 'credito' && typeof initCreditos === 'function') {
      const modCreditos = document.getElementById('mod-creditos');
      if (modCreditos?.classList.contains('active')) initCreditos();
    }

    showToast('⚠ Agrega al menos un concepto al cobro');
    return;
  }

  const montoConsulta = chkConsulta
    ? parseFloat(document.getElementById('pago-consulta-tipo').value || 0) : 0;

  const tratSel = document.getElementById('pago-tratamiento');
  const montoTrat = chkTrat ? parseFloat(tratSel.value || 0) : 0;
  const tratId    = chkTrat ? tratSel.options[tratSel.selectedIndex]?.dataset?.id || null : null;
  const tratNombre = chkTrat ? tratSel.options[tratSel.selectedIndex]?.dataset?.nombre || '' : '';

  const suplSel = document.getElementById('pago-suplemento');
  const precioSupl = chkSupl ? parseFloat(suplSel.value || 0) : 0;
  const qty = chkSupl ? parseFloat(document.getElementById('pago-supl-qty').value || 1) : 0;
  const montoSupl = precioSupl * qty;
  const suplId    = chkSupl ? suplSel.options[suplSel.selectedIndex]?.dataset?.id || null : null;

  const total = montoConsulta + montoTrat + montoSupl;

  // Construir concepto
  const conceptos = [];
  if (chkConsulta) conceptos.push('Consulta');
  if (chkTrat && tratNombre) conceptos.push(tratNombre);
  if (chkSupl) conceptos.push('Suplemento');
  const concepto = conceptos.join(' + ');

  const folio = 'NV-' + fecha.replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100);

  const datos = {
    paciente_id:         pacienteId,
    concepto:            concepto,
    monto_consulta:      montoConsulta,
    monto_tratamiento:   montoTrat,
    monto_suplementos:   montoSupl,
    total:               total,
    metodo_pago:         metodoSeleccionado,
    fecha:               fecha,
    folio:               folio,
  };

  const { error } = await db.from('pagos').insert([datos]);
  if (error) { showToast('❌ Error: ' + error.message); return; }

  // Descontar stock si hay suplemento
  if (chkSupl && suplId && qty > 0) {
    const { data: prod } = await db.from('inventario').select('stock').eq('id', suplId).single();
    if (prod) {
      const nuevoStock = Math.max(0, parseFloat(prod.stock) - qty);
      await db.from('inventario').update({ stock: nuevoStock }).eq('id', suplId);
    }
  }

  showToast(`✓ Cobro de $${total.toLocaleString()} registrado correctamente`);
  
  // Generar nota de venta
  const selPac = document.getElementById('pago-paciente');
  const nombrePac = selPac.options[selPac.selectedIndex]?.text || '—';
  

  const detalles = [];
  if (chkConsulta) detalles.push({ concepto: 'Consulta', monto: montoConsulta });
  if (chkTrat && montoTrat > 0) {
    const tratNombreCompleto = document.getElementById('pago-tratamiento').options[document.getElementById('pago-tratamiento').selectedIndex]?.dataset?.nombre || 'Tratamiento';
    detalles.push({ concepto: tratNombreCompleto, monto: montoTrat });
  }
  if (chkSupl && montoSupl > 0) {
    const suplNombre = document.getElementById('pago-suplemento').options[document.getElementById('pago-suplemento').selectedIndex]?.dataset?.nombre || 'Suplemento';
    detalles.push({ concepto: `${suplNombre} x${qty}`, monto: montoSupl });
  }

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
      ${detalles.map(d => `
        <div class="nota-row">
          <span>${d.concepto}</span>
          <span>$${parseFloat(d.monto).toLocaleString()}</span>
        </div>`).join('')}
      <div style="border-top:1px solid rgba(201,168,108,.15);margin:10px 0"></div>
      <div class="nota-row total-row">
        <span>TOTAL</span>
        <span><strong>$${total.toLocaleString()}</strong></span>
      </div>
      <div class="nota-row" style="font-size:12px">
        <span>Método de pago</span>
        <span>${metodoLabel[metodoSeleccionado] || metodoSeleccionado}</span>
      </div>
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
  const hoy = new Date().toISOString().split('T')[0];
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
  const filtrados = fecha ? data.filter(p => p.fecha === fecha) : data;
  renderCobros(filtrados);
}

function renderCobros(data) {
  const tbody = document.getElementById('tabla-ultimos-cobros');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.3;padding:16px">Sin cobros registrados</td></tr>`;
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
  document.getElementById('pago-notas').value    = '';
  document.getElementById('pago-supl-qty').value = '1';

  ['chk-consulta','chk-trat','chk-supl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  ['consulta-block','trat-block','supl-block'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  document.getElementById('tot-consulta').textContent = '$0';
  document.getElementById('tot-trat').textContent     = '$0';
  document.getElementById('tot-supl').textContent     = '$0';
  document.getElementById('tot-total').textContent    = '$0';

  document.querySelectorAll('.pm').forEach(p => p.classList.remove('selected'));
  document.querySelector('.pm')?.classList.add('selected');
  metodoSeleccionado = 'efectivo';
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
      ${detalles.map(d => `
        <div class="nota-row">
          <span>${d.concepto}</span>
          <span>$${parseFloat(d.monto).toLocaleString()}</span>
        </div>`).join('')}
      <div style="border-top:1px solid rgba(201,168,108,.15);margin:10px 0"></div>
      <div class="nota-row total-row">
        <span>TOTAL</span>
        <span><strong>$${parseFloat(p.total).toLocaleString()}</strong></span>
      </div>
      <div class="nota-row" style="font-size:12px">
        <span>Método de pago</span>
        <span>${metodoLabel[p.metodo_pago] || p.metodo_pago}</span>
      </div>
      <div class="nota-firma">
        <div><div class="nota-linea">Recibió</div></div>
        <div><div class="nota-linea">Paciente</div></div>
      </div>
      <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
    </div>`;

  openModal('nota-impr');
}