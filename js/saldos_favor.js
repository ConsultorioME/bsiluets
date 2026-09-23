// ─────────────────────────────────────────
//  B·Siluets — Saldo a favor de pacientes
//  Tabla `saldos_favor` (ver sql/saldos_favor.sql): cada fila es un
//  movimiento y el saldo NUNCA se guarda, se calcula siempre como
//    depósitos - aplicaciones - devoluciones
//  igual que el saldo de Créditos se calcula a partir de `abonos`.
//    deposito   → el paciente deja dinero (excedente de un cobro o anticipo);
//                 entra a caja ese día con su método real.
//    aplicacion → se usa el saldo para pagar un cobro en Pagos (pago_id);
//                 no es dinero nuevo, Caja no lo vuelve a contar.
//    devolucion → se le regresa el dinero al paciente (sale de caja).
//  Software SIE © 2025
// ─────────────────────────────────────────

const METODO_SALDO_FAVOR = 'saldo_favor';

function signoMovSaldoFavor(tipo) {
  return tipo === 'deposito' ? 1 : -1;
}

function calcularSaldoFavor(movimientos) {
  const saldo = (movimientos || []).reduce((s, m) => s + signoMovSaldoFavor(m.tipo) * parseFloat(m.monto || 0), 0);
  return Math.round(saldo * 100) / 100;
}

// Saldo a favor disponible de un paciente (0 si no tiene o si falla la consulta).
async function obtenerSaldoFavor(pacienteId) {
  if (!pacienteId) return 0;
  const { data, error } = await db
    .from('saldos_favor')
    .select('tipo, monto')
    .eq('paciente_id', pacienteId)
    .eq('eliminado', false);
  if (error) return 0;
  return Math.max(0, calcularSaldoFavor(data));
}

function usuarioActualSaldoFavor() {
  const u = JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}');
  return u.usuario || 'admin';
}

// ── LISTADO EN CRÉDITOS & ADEUDOS ──
let todosSaldosFavor = [];

async function cargarSaldosFavor() {
  const { data, error } = await db
    .from('saldos_favor')
    .select('paciente_id, tipo, monto, fecha, pacientes(nombre, apellidos)')
    .eq('eliminado', false);

  const tbody = document.getElementById('tabla-saldos-favor-body');
  if (error) {
    // Tabla aún no creada en Supabase (falta correr sql/saldos_favor.sql).
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.4;padding:16px">No se pudo cargar saldos a favor: ${error.message}</td></tr>`;
    return;
  }

  const porPaciente = {};
  (data || []).forEach(m => {
    const id = m.paciente_id;
    if (!porPaciente[id]) {
      porPaciente[id] = {
        id,
        nombre: m.pacientes ? `${m.pacientes.nombre} ${m.pacientes.apellidos}` : '—',
        movimientos: [],
        ultimaFecha: m.fecha,
      };
    }
    porPaciente[id].movimientos.push(m);
    if ((m.fecha || '') > (porPaciente[id].ultimaFecha || '')) porPaciente[id].ultimaFecha = m.fecha;
  });

  todosSaldosFavor = Object.values(porPaciente)
    .map(p => ({ ...p, saldo: calcularSaldoFavor(p.movimientos) }))
    .filter(p => p.saldo > 0.5)
    .sort((a, b) => b.saldo - a.saldo);

  const total = todosSaldosFavor.reduce((s, p) => s + p.saldo, 0);
  const setTexto = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTexto('kpi-sf-clientes', todosSaldosFavor.length);
  setTexto('kpi-sf-total', '$' + total.toLocaleString());

  buscarSaldoFavor(document.getElementById('busca-saldo-favor')?.value || '');
}

function buscarSaldoFavor(valor) {
  const q = (valor || '').trim().toLowerCase();
  const filtrados = q
    ? todosSaldosFavor.filter(p => (p.nombre || '').toLowerCase().includes(q))
    : todosSaldosFavor;
  renderTablaSaldosFavor(filtrados);
}

function renderTablaSaldosFavor(lista) {
  const tbody = document.getElementById('tabla-saldos-favor-body');
  if (!tbody) return;

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:20px">Sin saldos a favor</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(p => `<tr>
      <td><strong>${p.nombre}</strong></td>
      <td style="color:#27AE60;font-weight:600">$${p.saldo.toLocaleString()}</td>
      <td style="font-size:12px;opacity:.6">${p.ultimaFecha || '—'}</td>
      <td><button class="tb-btn" style="padding:4px 10px;font-size:10px" onclick="abrirSaldoFavor('${p.id}')">Ver movimientos</button></td>
    </tr>`).join('');
}

// ── MODAL: MOVIMIENTOS / ANTICIPO / DEVOLUCIÓN ──
let saldoFavorActual = { pacienteId: null, nombre: '', saldo: 0 };

// Sin pacienteId: se abre para registrar un anticipo eligiendo al paciente.
async function abrirSaldoFavor(pacienteId) {
  const sel = document.getElementById('sf-paciente');
  const { data: pacientes } = await db.from('pacientes').select('id,nombre,apellidos').eq('activo', true).order('nombre');
  sel.innerHTML = '<option value="">Seleccionar paciente...</option>' +
    (pacientes || []).map(p => `<option value="${p.id}">${p.nombre} ${p.apellidos}</option>`).join('');
  sel.value = pacienteId || '';
  sel.disabled = !!pacienteId;

  document.getElementById('sf-tipo').value       = 'deposito';
  document.getElementById('sf-monto').value      = '';
  document.getElementById('sf-metodo').value     = '';
  document.getElementById('sf-referencia').value = '';
  document.getElementById('sf-fecha').value      = fechaHoyISO();

  await cambiarPacienteSaldoFavor();
  openModal('saldo-favor');
}

async function cambiarPacienteSaldoFavor() {
  const sel = document.getElementById('sf-paciente');
  const pacienteId = sel.value;
  saldoFavorActual = {
    pacienteId: pacienteId || null,
    nombre: pacienteId ? sel.options[sel.selectedIndex]?.text || '—' : '',
    saldo: 0,
  };

  const cont = document.getElementById('sf-historial');
  if (!pacienteId) {
    document.getElementById('sf-saldo-actual').textContent = '—';
    cont.innerHTML = '<div style="font-size:12px;color:var(--cream);opacity:.3">Selecciona un paciente</div>';
    return;
  }

  const { data: movs } = await db
    .from('saldos_favor')
    .select('*')
    .eq('paciente_id', pacienteId)
    .eq('eliminado', false)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false });

  saldoFavorActual.saldo = Math.max(0, calcularSaldoFavor(movs));
  const elSaldo = document.getElementById('sf-saldo-actual');
  elSaldo.textContent = '$' + saldoFavorActual.saldo.toLocaleString();
  elSaldo.style.color = saldoFavorActual.saldo > 0 ? '#27AE60' : 'var(--cream)';

  const tipoInfo = {
    deposito:   { label: 'Depósito',   badge: 'badge-green', signo: '+', color: '#27AE60' },
    aplicacion: { label: 'Aplicado',   badge: 'badge-blue',  signo: '-', color: '#2980B9' },
    devolucion: { label: 'Devolución', badge: 'badge-red',   signo: '-', color: '#e74c3c' },
  };

  cont.innerHTML = (movs && movs.length > 0)
    ? movs.map(m => {
        const t = tipoInfo[m.tipo] || { label: m.tipo, badge: 'badge-gray', signo: '', color: 'var(--cream)' };
        return `
        <div class="abono-item">
          <span class="abono-fecha">${m.fecha || '—'}</span>
          <span class="badge ${t.badge}" style="font-size:10px">${t.label}</span>
          <span class="abono-desc">${m.referencia || '—'}${m.metodo_pago ? ` <span style="opacity:.5">(${m.metodo_pago})</span>` : ''}</span>
          <span style="color:${t.color};font-weight:500">${t.signo}$${parseFloat(m.monto).toLocaleString()}</span>
          <button class="tb-btn danger" style="padding:2px 7px;font-size:10px;background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);color:#e74c3c" onclick="eliminarMovimientoSaldoFavor('${m.id}')">✕</button>
        </div>`;
      }).join('')
    : '<div style="font-size:12px;color:var(--cream);opacity:.3">Sin movimientos</div>';
}

async function guardarMovimientoSaldoFavor() {
  const { pacienteId, nombre, saldo } = saldoFavorActual;
  const tipo   = document.getElementById('sf-tipo').value;
  const monto  = parseFloat(document.getElementById('sf-monto').value) || 0;
  const metodo = document.getElementById('sf-metodo').value;
  const fecha  = document.getElementById('sf-fecha').value;
  const ref    = document.getElementById('sf-referencia').value.trim();

  if (!pacienteId) { showToast('⚠ Selecciona un paciente'); return; }
  if (monto <= 0)  { showToast('⚠ Ingresa un monto válido'); return; }
  if (!metodo)     { showToast('⚠ Selecciona el método de pago'); return; }
  if (!fecha)      { showToast('⚠ La fecha es obligatoria'); return; }

  if (tipo === 'devolucion') {
    if (monto > saldo + 0.5) { showToast(`⚠ La devolución supera el saldo a favor ($${saldo.toLocaleString()})`); return; }
    if (typeof requiereAutorizacionAdmin === 'function' && requiereAutorizacionAdmin()) {
      const autorizado = await pedirAutorizacionAdmin('Devolver saldo a favor requiere autorización de un Administrador.');
      if (!autorizado) return;
    }
  }

  const { error } = await db.from('saldos_favor').insert([{
    paciente_id:    pacienteId,
    tipo,
    monto,
    metodo_pago:    metodo,
    fecha,
    referencia:     ref || (tipo === 'deposito' ? 'Anticipo del paciente' : 'Devolución de saldo a favor'),
    registrado_por: usuarioActualSaldoFavor(),
  }]);
  if (error) { showToast('❌ Error: ' + error.message); return; }

  const nuevoSaldo  = Math.max(0, saldo + signoMovSaldoFavor(tipo) * monto);
  const metodoLabel = { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia' };
  const prefijo     = tipo === 'deposito' ? 'SF-' : 'DV-';
  const folio       = prefijo + fecha.replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100);

  document.getElementById('nota-imprimible').innerHTML = `
    <div class="nota-preview">
      <div class="nota-header">
        <div class="nota-logo"><img src="data:image/png;base64,${LOGO_B64}" alt="B·Siluets" style="height:50px;width:auto;object-fit:contain"></div>
        <div class="nota-sub-hdr">Consultorio Médico Estético · Durango</div>
      </div>
      <div class="nota-folio">Folio: <strong>${folio}</strong> &nbsp;|&nbsp; ${fecha}</div>
      <div class="nota-row"><span>Paciente</span><strong>${nombre}</strong></div>
      <div style="border-top:1px solid rgba(184,147,90,.28);margin:10px 0"></div>
      <div class="nota-row"><span>Concepto</span><span>${tipo === 'deposito' ? 'Anticipo / saldo a favor' : 'Devolución de saldo a favor'}</span></div>
      <div class="nota-row"><span>Referencia</span><span>${ref || '—'}</span></div>
      <div style="border-top:1px solid rgba(184,147,90,.28);margin:10px 0"></div>
      <div class="nota-row total-row"><span>${tipo === 'deposito' ? 'MONTO RECIBIDO' : 'MONTO DEVUELTO'}</span><span><strong>$${monto.toLocaleString()}</strong></span></div>
      <div class="nota-row" style="font-size:12px"><span>Método de pago</span><span>${metodoLabel[metodo] || metodo}</span></div>
      <div class="nota-row" style="font-size:13px;color:#27AE60"><span><strong>Saldo a favor disponible</strong></span><span><strong>$${nuevoSaldo.toLocaleString()}</strong></span></div>
      <div class="nota-firma">
        <div><div class="nota-linea">${tipo === 'deposito' ? 'Recibió' : 'Entregó'}</div></div>
        <div><div class="nota-linea">Paciente</div></div>
      </div>
      <div class="nota-footer-txt">B·Siluets — Consulta · Tratamiento · Bienestar</div>
    </div>`;

  closeModal('saldo-favor');
  showToast(tipo === 'deposito'
    ? `✓ Anticipo de $${monto.toLocaleString()} registrado como saldo a favor`
    : `✓ Devolución de $${monto.toLocaleString()} registrada`);
  document.getElementById('nota-impr-titulo').textContent = tipo === 'deposito' ? 'Comprobante de Anticipo' : 'Comprobante de Devolución';
  openModal('nota-impr');

  await cargarSaldosFavor();
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
}

// Soft-delete de un movimiento (queda en el Historial de Eliminaciones).
// Una aplicación ligada a un cobro no se borra aquí: se elimina el cobro
// desde Pagos, que regresa el saldo automáticamente.
async function eliminarMovimientoSaldoFavor(id) {
  const { data: mov } = await db.from('saldos_favor').select('*').eq('id', id).single();
  if (!mov) { showToast('❌ No se encontró el movimiento'); return; }

  if (mov.tipo === 'aplicacion' && mov.pago_id) {
    showToast('⚠ Este saldo se usó en un cobro. Para regresarlo, elimina ese cobro desde Pagos.');
    return;
  }

  // Quitar un depósito no puede dejar el saldo en negativo (ya se usó).
  const saldoResultante = saldoFavorActual.saldo - signoMovSaldoFavor(mov.tipo) * parseFloat(mov.monto || 0);
  if (saldoResultante < -0.5) {
    showToast('⚠ Este depósito ya se usó (total o parcialmente) en cobros; no se puede eliminar.');
    return;
  }

  if (typeof requiereAutorizacionAdmin === 'function' && requiereAutorizacionAdmin()) {
    const autorizado = await pedirAutorizacionAdmin('Eliminar un movimiento de saldo a favor requiere autorización de un Administrador.');
    if (!autorizado) return;
  }

  if (!confirm('¿Eliminar este movimiento de saldo a favor? El saldo del paciente se recalculará y quedará registro en el Historial de Eliminaciones.')) return;

  const { error } = await db.from('saldos_favor').update({
    eliminado:     true,
    eliminado_por: usuarioActualSaldoFavor(),
    eliminado_at:  new Date().toISOString(),
  }).eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }

  showToast('✓ Movimiento eliminado — saldo recalculado');
  await cambiarPacienteSaldoFavor();
  await cargarSaldosFavor();
  if (typeof cargarEliminados === 'function') await cargarEliminados();
  if (typeof sincronizarModulosFinancieros === 'function') sincronizarModulosFinancieros();
}
