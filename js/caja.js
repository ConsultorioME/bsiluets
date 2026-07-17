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
  // 1. Cobros del día (módulo Pagos) — excluir eliminados
  const { data: pagos } = await db
    .from('pagos')
    .select('*, pacientes(nombre, apellidos)')
    .eq('fecha', fecha)
    .eq('eliminado', false)
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

  // 4. Gastos del día
  const { data: gastos } = await db
    .from('gastos')
    .select('*')
    .eq('fecha', fecha)
    .eq('activo', true)
    .order('created_at', { ascending: true });

  // ── Calcular totales por método ──
  const totales = { efectivo: 0, tarjeta: 0, credito: 0, transferencia: 0 };

  // Parsear métodos combinados (ej. "efectivo:2000|tarjeta:3000")
  function parsearMetodo(metodo_pago, monto_total) {
    if (!metodo_pago) return;
    if (metodo_pago.includes('|')) {
      metodo_pago.split('|').forEach(parte => {
        const [met, mon] = parte.split(':');
        const m = met?.toLowerCase().trim();
        if (totales[m] !== undefined) totales[m] += parseFloat(mon || 0);
      });
    } else if (metodo_pago.includes(':')) {
      const [met, mon] = metodo_pago.split(':');
      const m = met?.toLowerCase().trim();
      if (totales[m] !== undefined) totales[m] += parseFloat(mon || 0);
    } else {
      const m = metodo_pago?.toLowerCase().trim();
      if (totales[m] !== undefined) totales[m] += parseFloat(monto_total || 0);
    }
  }

  (pagos || []).forEach(p => parsearMetodo(p.metodo_pago, p.total));
  (visitas || []).forEach(v => parsearMetodo(v.metodo_pago, v.monto_cobrado));
  (abonos || []).forEach(a => {
    if (a.metodo_pago?.toLowerCase() !== 'credito') {
      parsearMetodo(a.metodo_pago, a.monto);
    }
  });

  const totalIngresos = Object.values(totales).reduce((s, v) => s + v, 0);
  const totalGastos   = (gastos || []).reduce((s, g) => s + parseFloat(g.monto || 0), 0);
  const utilidad      = totalIngresos - totalGastos;

  // ── KPIs ──
  document.getElementById('caja-total').textContent        = '$' + totalIngresos.toLocaleString();
  document.getElementById('caja-efectivo').textContent     = '$' + (totales.efectivo || 0).toLocaleString();
  document.getElementById('caja-tarjeta').textContent      = '$' + (totales.tarjeta || 0).toLocaleString();
  document.getElementById('caja-transferencia').textContent= '$' + (totales.transferencia || 0).toLocaleString();
  document.getElementById('caja-credito').textContent      = '$' + (totales.credito || 0).toLocaleString();
  document.getElementById('caja-gastos').textContent       = '$' + totalGastos.toLocaleString();

  const utilEl = document.getElementById('caja-utilidad');
  utilEl.textContent = (utilidad < 0 ? '-$' : '$') + Math.abs(utilidad).toLocaleString();
  utilEl.style.color = utilidad >= 0 ? '#27AE60' : '#e74c3c';

  // ── Tabla Pagos ──
  const tbPagos = document.getElementById('caja-tabla-pagos');
  if (tbPagos) {
    if (!pagos || pagos.length === 0) {
      tbPagos.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:12px">Sin cobros este día</td></tr>`;
    } else {
      const metBadge = { efectivo:'badge-green', tarjeta:'badge-blue', credito:'badge-gold', transferencia:'badge-gray' };
      tbPagos.innerHTML = pagos.map(p => {
        const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos.charAt(0)}.` : '—';
        const metodo = p.metodo_pago?.includes('|') 
          ? p.metodo_pago.split('|').map(m => m.split(':')[0]).join('+')
          : p.metodo_pago?.split(':')[0] || '—';
        const badge  = metBadge[metodo] || 'badge-gray';
        return `<tr>
          <td>${nombre}</td>
          <td style="font-size:12px;opacity:.7">${p.concepto || '—'}</td>
          <td><span class="badge ${badge}" style="font-size:10px">${metodo}</span></td>
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
        const metodo = v.metodo_pago?.includes('|')
          ? v.metodo_pago.split('|').map(m => m.split(':')[0]).join('+')
          : v.metodo_pago?.split(':')[0] || '—';
        const metBadge = { efectivo:'badge-green', tarjeta:'badge-blue', transferencia:'badge-gray' };
        const badge  = metBadge[metodo?.toLowerCase()] || 'badge-gray';
        return `<tr>
          <td>${nombre}</td>
          <td style="font-size:12px;opacity:.7">Ses. ${v.numero_sesion} — ${trat}</td>
          <td><span class="badge ${badge}" style="font-size:10px">${metodo}</span></td>
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
          <td><span class="badge ${badge}" style="font-size:10px">${a.metodo_pago || '—'}</span></td>
          <td style="color:#27AE60;font-weight:500">$${parseFloat(a.monto).toLocaleString()}</td>
        </tr>`;
      }).join('');
    }
  }

  // ── Tabla Gastos ──
  let tbGastos = document.getElementById('caja-tabla-gastos');
  if (!tbGastos) {
    // Crear tabla de gastos si no existe
    const cajaMod = document.getElementById('mod-caja');
    if (cajaMod) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginTop = '20px';
      card.innerHTML = `
        <div class="card-title">Gastos del día</div>
        <table>
          <tr><th>Categoría</th><th>Descripción</th><th>Método</th><th>Monto</th></tr>
          <tbody id="caja-tabla-gastos"></tbody>
        </table>`;
      cajaMod.appendChild(card);
      tbGastos = document.getElementById('caja-tabla-gastos');
    }
  }

  if (tbGastos) {
    if (!gastos || gastos.length === 0) {
      tbGastos.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:12px">Sin gastos este día</td></tr>`;
    } else {
      tbGastos.innerHTML = gastos.map(g => `<tr>
        <td style="font-size:12px">${g.categoria}</td>
        <td style="font-size:12px;opacity:.7">${g.descripcion}</td>
        <td><span class="badge badge-gray" style="font-size:10px">${g.metodo_pago}</span></td>
        <td style="color:#e74c3c;font-weight:500">$${parseFloat(g.monto).toLocaleString()}</td>
      </tr>`).join('');
    }
  }

  // Guardar datos para PDF
  window._cajaData = { fecha, pagos, visitas, abonos, gastos, totales, totalIngresos, totalGastos, utilidad };
}

// ── DESCARGAR PDF ──
async function descargarCajaPDF() {
  const d = window._cajaData;
  if (!d) { showToast('⚠ Primero carga los datos de Caja'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Header
  doc.setFontSize(18);
  doc.setTextColor(201, 168, 108);
  doc.text('B·Siluets', 105, 20, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text('Consultorio Médico Estético · Durango', 105, 27, { align: 'center' });
  doc.setFontSize(13);
  doc.setTextColor(50);
  doc.text(`Corte de Caja — ${d.fecha}`, 105, 36, { align: 'center' });

  // Línea separadora
  doc.setDrawColor(201, 168, 108);
  doc.line(15, 40, 195, 40);

  // KPIs
  let y = 48;
  doc.setFontSize(10);
  doc.setTextColor(80);
  const kpis = [
    ['Total Ingresos', `$${d.totalIngresos.toLocaleString()}`],
    ['Efectivo',       `$${(d.totales.efectivo||0).toLocaleString()}`],
    ['Tarjeta',        `$${(d.totales.tarjeta||0).toLocaleString()}`],
    ['Transferencia',  `$${(d.totales.transferencia||0).toLocaleString()}`],
    ['Crédito',        `$${(d.totales.credito||0).toLocaleString()}`],
    ['Total Gastos',   `$${d.totalGastos.toLocaleString()}`],
    ['Utilidad Neta',  `$${d.utilidad.toLocaleString()}`],
  ];
  kpis.forEach(([label, val]) => {
    doc.text(label + ':', 15, y);
    doc.text(val, 195, y, { align: 'right' });
    y += 7;
  });

  doc.line(15, y, 195, y);
  y += 8;

  // Cobros
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 108);
  doc.text('Cobros del día', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(60);
  (d.pagos || []).forEach(p => {
    const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos.charAt(0)}.` : '—';
    doc.text(`${nombre} — ${p.concepto || '—'}`, 15, y);
    doc.text(`$${parseFloat(p.total).toLocaleString()}`, 195, y, { align: 'right' });
    y += 6;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  y += 4;
  // Visitas
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 108);
  doc.text('Abonos de sesiones', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(60);
  (d.visitas || []).forEach(v => {
    const nombre = v.pacientes ? `${v.pacientes.nombre} ${v.pacientes.apellidos.charAt(0)}.` : '—';
    doc.text(`${nombre} — Ses. ${v.numero_sesion}`, 15, y);
    doc.text(`$${parseFloat(v.monto_cobrado).toLocaleString()}`, 195, y, { align: 'right' });
    y += 6;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  y += 4;
  // Gastos
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 108);
  doc.text('Gastos del día', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(60);
  (d.gastos || []).forEach(g => {
    doc.text(`${g.categoria} — ${g.descripcion}`, 15, y);
    doc.text(`$${parseFloat(g.monto).toLocaleString()}`, 195, y, { align: 'right' });
    y += 6;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generado el ${new Date().toLocaleString('es-MX')} · Software SIE`, 105, 290, { align: 'center' });

  doc.save(`caja-bsiluets-${d.fecha}.pdf`);
  showToast('✅ PDF descargado');
}