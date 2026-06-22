// ─────────────────────────────────────────
//  B·Siluets — Módulo Caja
//  Software SIE © 2025
// ─────────────────────────────────────────

async function initCaja() {
  const hoy = new Date().toISOString().split('T')[0];
  const inputFecha = document.getElementById('caja-fecha');
  if (inputFecha && !inputFecha.value) inputFecha.value = hoy;
  const fecha = inputFecha?.value || hoy;
  await cargarCaja(fecha);
}

async function cargarCaja(fecha) {
  // 1. Cobros del día (módulo Pagos)
  const { data: pagos } = await db
    .from('pagos')
    .select('*, pacientes(nombre, apellidos)')
    .eq('fecha', fecha)
    .order('created_at', { ascending: true });

  // 2. Visitas del día con pago (módulo Paquetes)
  const { data: visitas } = await db
    .from('visitas')
    .select('*, pacientes(nombre, apellidos), paquetes(tratamientos(nombre))')
    .eq('fecha', fecha)
    .gt('monto_cobrado', 0)
    .order('created_at', { ascending: true });

  // 3. Abonos del día (módulo Créditos)
  const { data: abonos } = await db
    .from('abonos')
    .select('*, pacientes(nombre, apellidos)')
    .eq('fecha', fecha)
    .order('created_at', { ascending: true });

  // ── Calcular totales por método ──
  const totales = { efectivo: 0, tarjeta: 0, credito: 0, transferencia: 0 };

  (pagos || []).forEach(p => {
    const m = p.metodo_pago || 'efectivo';
    totales[m] = (totales[m] || 0) + parseFloat(p.total || 0);
  });

  (visitas || []).forEach(v => {
    const m = v.metodo_pago?.toLowerCase() || 'efectivo';
    totales[m] = (totales[m] || 0) + parseFloat(v.monto_cobrado || 0);
  });

  (abonos || []).forEach(a => {
    const m = a.metodo_pago?.toLowerCase() || 'efectivo';
    // Los abonos en crédito NO cuentan como ingreso real
    if (m !== 'credito') {
      totales[m] = (totales[m] || 0) + parseFloat(a.monto || 0);
    }
  });

  const totalDia = Object.values(totales).reduce((s, v) => s + v, 0);

  // ── KPIs ──
  document.getElementById('caja-total').textContent    = '$' + totalDia.toLocaleString();
  document.getElementById('caja-efectivo').textContent = '$' + (totales.efectivo || 0).toLocaleString();
  document.getElementById('caja-tarjeta').textContent  = '$' + (totales.tarjeta || 0).toLocaleString();
  document.getElementById('caja-credito').textContent  = '$' + (totales.credito || 0).toLocaleString();

  // ── Tabla Pagos ──
  const tbPagos = document.getElementById('caja-tabla-pagos');
  if (tbPagos) {
    if (!pagos || pagos.length === 0) {
      tbPagos.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:12px">Sin cobros este día</td></tr>`;
    } else {
      const metBadge = { efectivo:'badge-green', tarjeta:'badge-blue', credito:'badge-gold', transferencia:'badge-gray' };
      tbPagos.innerHTML = pagos.map(p => {
        const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos.charAt(0)}.` : '—';
        const badge  = metBadge[p.metodo_pago] || 'badge-gray';
        return `<tr>
          <td>${nombre}</td>
          <td style="font-size:12px;opacity:.7">${p.concepto || '—'}</td>
          <td><span class="badge ${badge}">${p.metodo_pago || '—'}</span></td>
          <td style="color:var(--gold);font-weight:500">$${parseFloat(p.total).toLocaleString()}</td>
        </tr>`;
      }).join('');
    }
  }

  // ── Tabla Visitas ──
  const tbVisitas = document.getElementById('caja-tabla-visitas');
  if (tbVisitas) {
    if (!visitas || visitas.length === 0) {
      tbVisitas.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:12px">Sin abonos de sesiones este día</td></tr>`;
    } else {
      tbVisitas.innerHTML = visitas.map(v => {
        const nombre = v.pacientes ? `${v.pacientes.nombre} ${v.pacientes.apellidos.charAt(0)}.` : '—';
        const trat   = v.paquetes?.tratamientos?.nombre || '—';
        const metBadge = { efectivo:'badge-green', tarjeta:'badge-blue', transferencia:'badge-gray' };
        const badge  = metBadge[v.metodo_pago?.toLowerCase()] || 'badge-gray';
        return `<tr>
          <td>${nombre}</td>
          <td style="font-size:12px;opacity:.7">Ses. ${v.numero_sesion} — ${trat}</td>
          <td><span class="badge ${badge}">${v.metodo_pago || '—'}</span></td>
          <td style="color:var(--gold);font-weight:500">$${parseFloat(v.monto_cobrado).toLocaleString()}</td>
        </tr>`;
      }).join('');
    }
  }

  // ── Tabla Abonos ──
  const tbAbonos = document.getElementById('caja-tabla-abonos');
  if (tbAbonos) {
    if (!abonos || abonos.length === 0) {
      tbAbonos.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:12px">Sin abonos a adeudos este día</td></tr>`;
    } else {
      const metBadge = { efectivo:'badge-green', tarjeta:'badge-blue', transferencia:'badge-gray' };
      tbAbonos.innerHTML = abonos.map(a => {
        const nombre = a.pacientes ? `${a.pacientes.nombre} ${a.pacientes.apellidos.charAt(0)}.` : '—';
        const badge  = metBadge[a.metodo_pago?.toLowerCase()] || 'badge-gray';
        return `<tr>
          <td>${nombre}</td>
          <td style="font-size:12px;opacity:.7">${a.referencia || 'Abono'}</td>
          <td><span class="badge ${badge}">${a.metodo_pago || '—'}</span></td>
          <td style="color:#27AE60;font-weight:500">$${parseFloat(a.monto).toLocaleString()}</td>
        </tr>`;
      }).join('');
    }
  }
}