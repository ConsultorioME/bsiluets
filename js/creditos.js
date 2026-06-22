// ─────────────────────────────────────────
//  B·Siluets — Módulo Créditos & Adeudos
//  Versión unificada: paquetes + cobros en crédito
//  Software SIE © 2025
// ─────────────────────────────────────────

async function initCreditos() {
  await cargarCreditos();
}

async function cargarCreditos() {
  // 1. Paquetes con saldo pendiente
  const { data: paquetes } = await db
    .from('paquetes')
    .select('*, pacientes(id, nombre, apellidos, telefono), tratamientos(nombre)')
    .eq('activo', true);

  const paqConSaldo = (paquetes || []).filter(p => parseFloat(p.pagado) < parseFloat(p.precio_total));

  // 2. Cobros en crédito no liquidados
  const { data: cobrosCredito } = await db
    .from('pagos')
    .select('*, pacientes(id, nombre, apellidos)')
    .eq('metodo_pago', 'credito')
    .eq('liquidado', false);

  // 3. Consolidar por paciente
  const pacientesMap = {};

  paqConSaldo.forEach(p => {
    const id     = p.pacientes?.id;
    const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos}` : '—';
    if (!pacientesMap[id]) pacientesMap[id] = { id, nombre, paquetes: [], cobros: [], diasDesde: 0 };
    const dias = Math.floor((new Date() - new Date(p.fecha_inicio)) / (1000*60*60*24));
    pacientesMap[id].paquetes.push({ ...p, dias });
    if (dias > pacientesMap[id].diasDesde) pacientesMap[id].diasDesde = dias;
  });

  (cobrosCredito || []).forEach(c => {
    const id     = c.pacientes?.id;
    const nombre = c.pacientes ? `${c.pacientes.nombre} ${c.pacientes.apellidos}` : '—';
    if (!pacientesMap[id]) pacientesMap[id] = { id, nombre, paquetes: [], cobros: [], diasDesde: 0 };
    const dias = Math.floor((new Date() - new Date(c.fecha)) / (1000*60*60*24));
    pacientesMap[id].cobros.push({ ...c, dias });
    if (dias > pacientesMap[id].diasDesde) pacientesMap[id].diasDesde = dias;
  });

  const pacientes = Object.values(pacientesMap);

  // KPIs
  const totalCartera = pacientes.reduce((s, p) => {
    const saldoPaq   = p.paquetes.reduce((a, pk) => a + (pk.precio_total - pk.pagado), 0);
    const saldoCobros = p.cobros.reduce((a, c) => a + parseFloat(c.total), 0);
    return s + saldoPaq + saldoCobros;
  }, 0);

  const vencidos30 = pacientes.filter(p => p.diasDesde > 30).length;

  document.getElementById('kpi-cred-clientes').textContent  = pacientes.length;
  document.getElementById('kpi-cred-cartera').textContent   = '$' + totalCartera.toLocaleString();
  document.getElementById('kpi-cred-vencidos').textContent  = vencidos30;

  renderAlertasCredito(pacientes);
  renderTablaCreditos(pacientes);
}

// ── ALERTAS ──
function renderAlertasCredito(pacientes) {
  const cont = document.getElementById('alertas-credito-cont');
  if (!cont) return;

  if (pacientes.length === 0) {
    cont.innerHTML = `<div style="text-align:center;padding:24px;color:var(--cream);opacity:.3;font-size:13px">Sin adeudos pendientes ✓</div>`;
    return;
  }

  const ordenados = pacientes.sort((a, b) => b.diasDesde - a.diasDesde).slice(0, 5);

  cont.innerHTML = ordenados.map(p => {
    const saldoPaq    = p.paquetes.reduce((a, pk) => a + (pk.precio_total - pk.pagado), 0);
    const saldoCobros = p.cobros.reduce((a, c) => a + parseFloat(c.total), 0);
    const totalSaldo  = saldoPaq + saldoCobros;

    let cls = p.diasDesde > 30 ? 'rojo' : p.diasDesde > 15 ? 'naranja' : 'amarillo';
    let ico = p.diasDesde > 30 ? '🔴' : p.diasDesde > 15 ? '🟠' : '🟡';

    const detalle = [];
    if (saldoPaq > 0)    detalle.push(`Paquetes: $${saldoPaq.toLocaleString()}`);
    if (saldoCobros > 0) detalle.push(`Cobros crédito: $${saldoCobros.toLocaleString()}`);

    return `
      <div class="alerta-credito ${cls}">
        <div class="alerta-icon">${ico}</div>
        <div class="alerta-info">
          <div class="alerta-name">${p.nombre}</div>
          <div class="alerta-detail">${detalle.join(' · ')}</div>
          <div class="alerta-days ${cls}">${p.diasDesde} días de antigüedad</div>
        </div>
        <div style="text-align:right">
          <div class="alerta-monto">$${totalSaldo.toLocaleString()}</div>
          <button class="btn-primary" style="padding:5px 14px;font-size:10px;margin-top:6px"
            onclick="abrirDetalleCredito('${p.id}','${p.nombre}')">
            Ver / Abonar
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── TABLA COMPLETA ──
function renderTablaCreditos(pacientes) {
  const tbody = document.getElementById('tabla-creditos-body');
  if (!tbody) return;

  if (pacientes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;opacity:.3;padding:20px">Sin adeudos pendientes</td></tr>`;
    return;
  }

  tbody.innerHTML = pacientes.sort((a,b) => b.diasDesde - a.diasDesde).map(p => {
    const saldoPaq    = p.paquetes.reduce((a, pk) => a + (pk.precio_total - pk.pagado), 0);
    const saldoCobros = p.cobros.reduce((a, c) => a + parseFloat(c.total), 0);
    const totalSaldo  = saldoPaq + saldoCobros;
    const dias        = p.diasDesde;

    let badge = dias > 30 ? `<span class="badge badge-red">${dias} días</span>`
              : dias > 15 ? `<span class="badge badge-warn">${dias} días</span>`
              : `<span class="badge badge-blue">${dias} días</span>`;

    return `<tr>
      <td><strong>${p.nombre}</strong></td>
      <td style="color:var(--gold);font-size:12px">${saldoPaq > 0 ? '$'+saldoPaq.toLocaleString() : '—'}</td>
      <td style="color:var(--info,#2980B9);font-size:12px;cursor:help" 
        title="${p.cobros && p.cobros.length > 0 ? p.cobros.map(c => (c.concepto||'Cobro') + ': $' + parseFloat(c.total).toLocaleString()).join(' | ') : '—'}">
        ${saldoCobros > 0 ? '$'+saldoCobros.toLocaleString() : '—'}
      </td>
      <td style="color:#e74c3c;font-weight:600">$${totalSaldo.toLocaleString()}</td>
      <td>${badge}</td>
      <td><button class="tb-btn" style="padding:4px 10px;font-size:10px"
        onclick="abrirDetalleCredito('${p.id}','${p.nombre}')">
        Ver / Abonar</button></td>
    </tr>`;
  }).join('');
}

// ── DETALLE Y ABONO ──
let creditoActual = {};

async function abrirDetalleCredito(pacienteId, nombre) {
  // Cargar paquetes con saldo
  const { data: paquetes } = await db
    .from('paquetes')
    .select('*, tratamientos(nombre)')
    .eq('paciente_id', pacienteId)
    .eq('activo', true);

  const paqConSaldo = (paquetes || []).filter(p => parseFloat(p.pagado) < parseFloat(p.precio_total));

  // Cargar cobros en crédito
  const { data: cobros } = await db
    .from('pagos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .eq('metodo_pago', 'credito')
    .eq('liquidado', false);

  const saldoPaq    = paqConSaldo.reduce((a, p) => a + (p.precio_total - p.pagado), 0);
  const saldoCobros = (cobros || []).reduce((a, c) => a + parseFloat(c.total), 0);
  const totalSaldo  = saldoPaq + saldoCobros;

  creditoActual = { pacienteId, nombre, paqConSaldo, cobros: cobros || [], totalSaldo };

  // Llenar modal abono
  document.getElementById('abono-paciente-title').textContent = `Adeudo consolidado — ${nombre}`;
  document.getElementById('abono-saldo-actual').textContent   = '$' + totalSaldo.toLocaleString();
  document.getElementById('abono-saldo-nuevo').textContent    = '$' + totalSaldo.toLocaleString();
  document.getElementById('abono-saldo-nuevo').style.color    = 'var(--gold)';
  document.getElementById('abono-monto').value = '';

  // Historial: mostrar desglose
  const cont = document.getElementById('historial-abonos');
  let html = '';

  if (paqConSaldo.length > 0) {
    html += `<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);opacity:.6;margin-bottom:6px;margin-top:4px">Paquetes con saldo</div>`;
    html += paqConSaldo.map(p => `
      <div class="abono-item">
        <span class="abono-fecha" style="width:auto;margin-right:8px">${p.tratamientos?.nombre || '—'}</span>
        <span class="abono-desc">Ses. ${p.sesion_actual}/${p.total_sesiones}</span>
        <span style="color:#e74c3c;font-weight:500">$${(p.precio_total - p.pagado).toLocaleString()}</span>
      </div>`).join('');
  }

  if (cobros && cobros.length > 0) {
    html += `<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#2980B9;opacity:.8;margin-bottom:6px;margin-top:10px">Cobros en crédito pendientes</div>`;
    html += cobros.map(c => `
      <div class="abono-item">
        <span class="abono-fecha">${c.fecha || '—'}</span>
        <span class="abono-desc">${c.concepto || 'Cobro'}</span>
        <span style="color:#e74c3c;font-weight:500">$${parseFloat(c.total).toLocaleString()}</span>
        <span class="badge badge-gold" style="font-size:10px">Pendiente</span>
      </div>`).join('');
  }

  // Abonos registrados
  const { data: abonos } = await db
    .from('abonos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('fecha', { ascending: false });

  if (abonos && abonos.length > 0) {
    html += `<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#27AE60;opacity:.8;margin-bottom:6px;margin-top:10px">Abonos registrados</div>`;
    html += abonos.map(a => `
      <div class="abono-item">
        <span class="abono-fecha">${a.fecha || '—'}</span>
        <span class="abono-desc">${a.referencia || 'Abono'}</span>
        <span style="color:#27AE60;font-weight:500">-$${parseFloat(a.monto).toLocaleString()}</span>
        <span class="badge badge-green" style="font-size:10px">${a.metodo_pago || '—'}</span>
      </div>`).join('');
  }

  cont.innerHTML = html || '<div style="font-size:12px;color:var(--cream);opacity:.3">Sin detalle disponible</div>';
  openModal('abono');
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('abono-fecha').value = hoy;
}

// ── GUARDAR ABONO CONSOLIDADO ──
async function guardarAbonoReal() {
  const monto  = parseFloat(document.getElementById('abono-monto').value) || 0;
  const metodo = document.getElementById('abono-metodo').value.toLowerCase();
  const fecha  = document.querySelector('#modal-abono input[type=date]').value;
  const ref    = document.querySelector('#modal-abono input[type=text]').value;

  if (monto <= 0)                      { showToast('⚠ Ingresa un monto válido'); return; }
  if (monto > creditoActual.totalSaldo) { showToast('⚠ El abono supera el saldo total'); return; }

  let restante = monto;

  // 1. Aplicar primero a cobros en crédito (de más antiguo a más reciente)
  for (const cobro of creditoActual.cobros) {
    if (restante <= 0) break;
    const montoAplicar = Math.min(restante, parseFloat(cobro.total));
    const nuevoTotal   = parseFloat(cobro.total) - montoAplicar;
    restante -= montoAplicar;

    if (nuevoTotal <= 0) {
      await db.from('pagos').update({ liquidado: true, total: 0 }).eq('id', cobro.id);
    } else {
      await db.from('pagos').update({ total: nuevoTotal }).eq('id', cobro.id);
    }

    // Registrar en historial de abonos
    await db.from('abonos').insert([{
      paciente_id: creditoActual.pacienteId,
      monto:       montoAplicar,
      metodo_pago: metodo,
      fecha:       fecha,
      referencia:  ref || 'Abono a cobro en crédito',
    }]);

  }

  // 2. Aplicar el resto a paquetes
  for (const paq of creditoActual.paqConSaldo) {
    if (restante <= 0) break;
    const saldoPaq     = paq.precio_total - paq.pagado;
    const montoAplicar = Math.min(restante, saldoPaq);
    const nuevoPagado  = parseFloat(paq.pagado) + montoAplicar;
    restante -= montoAplicar;

    await db.from('paquetes').update({ pagado: nuevoPagado }).eq('id', paq.id);

    // Registrar en tabla abonos
    await db.from('abonos').insert([{
      paquete_id:  paq.id,
      paciente_id: creditoActual.pacienteId,
      monto:       montoAplicar,
      metodo_pago: metodo,
      fecha:       fecha,
      referencia:  ref || null,
    }]);
  }

  // Generar nota de abono
    
    const metodoLabel = { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia' };
    const folio = 'AB-' + fecha.replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100);

    document.getElementById('nota-imprimible').innerHTML = `
      <div class="nota-preview">
        <div class="nota-header">
          <div class="nota-logo">B·Siluets</div>
          <div class="nota-sub-hdr">Consultorio Médico Estético · Durango</div>
        </div>
        <div class="nota-folio">Folio: <strong>${folio}</strong> &nbsp;|&nbsp; ${fecha}</div>
        <div class="nota-row"><span>Paciente</span><strong>${creditoActual.nombre}</strong></div>
        <div style="border-top:1px solid rgba(201,168,108,.15);margin:10px 0"></div>
        <div class="nota-row"><span>Concepto</span><span>Abono a adeudo</span></div>
        <div class="nota-row"><span>Referencia</span><span>${document.querySelector('#modal-abono input[type=text]').value || '—'}</span></div>
        <div style="border-top:1px solid rgba(201,168,108,.15);margin:10px 0"></div>
        <div class="nota-row total-row">
          <span>ABONO APLICADO</span>
          <span><strong>$${monto.toLocaleString()}</strong></span>
        </div>
        <div class="nota-row" style="font-size:12px">
          <span>Método de pago</span>
          <span>${metodoLabel[metodo] || metodo}</span>
        </div>
        <div class="nota-row" style="font-size:12px;color:#27AE60">
          <span>Saldo restante</span>
          <span><strong>$${Math.max(0, creditoActual.totalSaldo - monto).toLocaleString()}</strong></span>
        </div>
        <div class="nota-firma">
          <div><div class="nota-linea">Recibió</div></div>
          <div><div class="nota-linea">Paciente</div></div>
        </div>
        <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
      </div>`;

    closeModal('abono');
    showToast(`✓ Abono de $${monto.toLocaleString()} aplicado correctamente`);
    openModal('nota-impr');
    await cargarCreditos();
}