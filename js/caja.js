// ─────────────────────────────────────────
//  B·Siluets — Módulo Caja
//  Software SIE © 2025
// ─────────────────────────────────────────

async function initCaja() {
  const hoy = fechaHoyISO();
  const inputFecha = document.getElementById('caja-fecha');
  if (inputFecha && !inputFecha.value) inputFecha.value = hoy;
  const fecha = inputFecha?.value || hoy;
  await cargarCaja(fecha);
}

// Desglosa un metodo_pago combinado (ej. "efectivo:700|transferencia:910")
// en un texto legible por método para mostrar como tooltip del monto total,
// p.ej. "Efectivo $700.00 · Transferencia $910.00". Devuelve '' si el pago
// no es combinado (un solo método), para no mostrar tooltip en ese caso.
function desgloseMetodoPago(metodo_pago) {
  if (!metodo_pago || !metodo_pago.includes('|')) return '';
  return metodo_pago.split('|').map(parte => {
    const [met, mon] = parte.split(':');
    const nombre = met ? met.charAt(0).toUpperCase() + met.slice(1).toLowerCase() : '—';
    return `${nombre} $${parseFloat(mon || 0).toFixed(2)}`;
  }).join(' · ');
}

// Etiqueta de tipo de abono, derivada de las columnas reales de la fila
// (paquete_id / pago_id), no del texto libre de "referencia" que el
// usuario puede sobreescribir al capturar el abono.
function tipoAbono(a) {
  if (a.paquete_id) return { label: 'Paquete', badge: 'badge-gold' };
  if (a.pago_id)    return { label: 'Crédito', badge: 'badge-blue' };
  return { label: '—', badge: 'badge-gray' };
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
    .eq('eliminado', false)
    .gt('monto_cobrado', 0)
    .order('created_at', { ascending: true });

  // 3. Abonos del día (módulo Créditos) — incluye tanto "Abono a paquete"
  //    (paquete_id) como "Abono a cobro en crédito" (pago_id); ambos viven
  //    en la misma tabla `abonos`, por lo que se traen paquete_id/pago_id
  //    para poder distinguir y etiquetar cada tipo en la UI y el PDF.
  const { data: abonos } = await db
    .from('abonos')
    .select('*, pacientes(nombre, apellidos)')
    .eq('fecha', fecha)
    .eq('eliminado', false)
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
  function parsearMetodo(metodo_pago, monto_total, destino) {
    destino = destino || totales;
    if (!metodo_pago) return;
    if (metodo_pago.includes('|')) {
      metodo_pago.split('|').forEach(parte => {
        const [met, mon] = parte.split(':');
        const m = met?.toLowerCase().trim();
        if (destino[m] !== undefined) destino[m] += parseFloat(mon || 0);
      });
    } else if (metodo_pago.includes(':')) {
      const [met, mon] = metodo_pago.split(':');
      const m = met?.toLowerCase().trim();
      if (destino[m] !== undefined) destino[m] += parseFloat(mon || 0);
    } else {
      const m = metodo_pago?.toLowerCase().trim();
      if (destino[m] !== undefined) destino[m] += parseFloat(monto_total || 0);
    }
  }

  (pagos || []).forEach(p => parsearMetodo(p.metodo_pago, p.total));
  (visitas || []).forEach(v => parsearMetodo(v.metodo_pago, v.monto_cobrado));

  // Los abonos de la tabla `abonos` son de dos tipos (ver tipoAbono()):
  //  - Abono a Paquete (paquete_id): sí cuenta en efectivo/tarjeta/transferencia,
  //    igual que un cobro normal del día.
  //  - Abono a Crédito/adeudo (pago_id): es la liquidación de una deuda ya
  //    registrada en Pagos en un día anterior, así que NO se suma a
  //    efectivo/tarjeta/transferencia (para no inflar "Total ingresos" del
  //    día con dinero que ya se había contado como deuda). Se guarda aparte
  //    en abonosACreditos y solo se refleja en Utilidad Neta.
  let abonosACreditos = 0;
  (abonos || []).forEach(a => {
    if (a.pago_id) {
      abonosACreditos += parseFloat(a.monto || 0);
    } else {
      parsearMetodo(a.metodo_pago, a.monto);
    }
  });

  // Totales "de caja física" — todo el dinero que efectivamente entró por
  // cada método ese día, incluyendo abonos a créditos (a diferencia de
  // `totales`, que los excluye para no duplicarlos en Total Ingresos/
  // Utilidad Neta, ver abajo). Estos son los que se muestran en los KPIs
  // de Efectivo/Tarjeta/Transferencia/Crédito de Caja.
  const totalesCaja = { ...totales };
  (abonos || []).forEach(a => {
    if (a.pago_id) parsearMetodo(a.metodo_pago, a.monto, totalesCaja);
  });

  // Total ingresos = Efectivo + Tarjeta + Transferencia + Crédito (lo
  // registrado como "a crédito" en Pagos ese día) - Total gastos.
  const totalGastos   = (gastos || []).reduce((s, g) => s + parseFloat(g.monto || 0), 0);
  const totalIngresos = totales.efectivo + totales.tarjeta + totales.transferencia + (totales.credito || 0) - totalGastos;

  // Utilidad neta = Total ingresos + Abonos a adeudos (Créditos) cobrados
  // ese día (dinero real que sí entró a caja al liquidar una deuda vieja).
  const utilidad = totalIngresos + abonosACreditos;

  // ── Subtotales de cada sección (basados en los registros mostrados) ──
  const subtotalPagos   = (pagos || []).reduce((s, p) => s + parseFloat(p.total || 0), 0);
  const subtotalVisitas = (visitas || []).reduce((s, v) => s + parseFloat(v.monto_cobrado || 0), 0);
  const subtotalAbonos  = (abonos || []).reduce((s, a) => s + parseFloat(a.monto || 0), 0);
  const subtotalGastos  = totalGastos;

  const setTexto = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTexto('caja-subtotal-pagos',   '$' + subtotalPagos.toLocaleString());
  setTexto('caja-subtotal-visitas', '$' + subtotalVisitas.toLocaleString());
  setTexto('caja-subtotal-abonos',  '$' + subtotalAbonos.toLocaleString());
  setTexto('caja-efectivo',       '$' + totalesCaja.efectivo.toLocaleString());
  setTexto('caja-tarjeta',        '$' + totalesCaja.tarjeta.toLocaleString());
  setTexto('caja-transferencia',  '$' + totalesCaja.transferencia.toLocaleString());
  setTexto('caja-credito',        '$' + (totalesCaja.credito || 0).toLocaleString());
  setTexto('caja-gastos',         '$' + totalGastos.toLocaleString());

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
        const badge    = metBadge[metodo] || 'badge-gray';
        const desglose = desgloseMetodoPago(p.metodo_pago);
        const montoAttrs = desglose
          ? ` title="${desglose}" style="color:var(--gold);font-weight:500;cursor:help;border-bottom:1px dashed rgba(201,168,108,.5)"`
          : ` style="color:var(--gold);font-weight:500"`;
        return `<tr>
          <td>${nombre}</td>
          <td style="font-size:12px;opacity:.7">${p.concepto || '—'}</td>
          <td><span class="badge ${badge}" style="font-size:10px">${metodo}</span></td>
          <td${montoAttrs}>$${parseFloat(p.total).toLocaleString()}</td>
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

  // ── Tabla Abonos (Paquetes + Créditos) ──
  const tbAbonos = document.getElementById('caja-tabla-abonos');
  if (tbAbonos) {
    if (!abonos || abonos.length === 0) {
      tbAbonos.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.3;padding:12px">Sin abonos este día</td></tr>`;
    } else {
      const metBadge = { efectivo:'badge-green', tarjeta:'badge-blue', transferencia:'badge-gray' };
      tbAbonos.innerHTML = abonos.map(a => {
        const nombre = a.pacientes ? `${a.pacientes.nombre} ${a.pacientes.apellidos.charAt(0)}.` : '—';
        const badge  = metBadge[a.metodo_pago?.toLowerCase()] || 'badge-gray';
        const tipo   = tipoAbono(a);
        return `<tr>
          <td>${nombre}</td>
          <td><span class="badge ${tipo.badge}" style="font-size:10px">${tipo.label}</span></td>
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
        </table>
        <div style="text-align:right;padding:12px 4px 2px;font-size:13px;color:var(--gold);font-weight:600">Subtotal: <span id="caja-subtotal-gastos">$0</span></div>`;
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
  setTexto('caja-subtotal-gastos', '$' + subtotalGastos.toLocaleString());

  // Guardar datos para PDF
  window._cajaData = { fecha, pagos, visitas, abonos, gastos, totales, totalesCaja, totalIngresos, totalGastos, utilidad, abonosACreditos, subtotalPagos, subtotalVisitas, subtotalAbonos, subtotalGastos };
}

// Carga una imagen (misma ruta que usan las notas de venta) y la convierte
// a base64 para poder insertarla en el PDF con jsPDF, devolviendo también
// su ancho/alto reales para poder mantener la proporción correcta.
function cargarImagenParaPDF(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve({ base64: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen: ' + url));
    img.src = url;
  });
}

// Imprime una fila "concepto — monto" en el PDF de Caja partiendo el
// concepto en varios renglones si es muy largo (evita que el texto se
// encime con la columna del monto, que va alineada a la derecha).
// Devuelve la nueva posición Y, ya lista para la siguiente fila.
function imprimirFilaCajaPDF(doc, texto, montoTexto, y) {
  const anchoMaximoConcepto = 145; // deja espacio libre para el monto a la derecha
  const lineas = doc.splitTextToSize(texto, anchoMaximoConcepto);
  lineas.forEach((linea, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(linea, 15, y);
    if (i === 0) doc.text(montoTexto, 195, y, { align: 'right' });
    y += 5;
  });
  return y + 1.5; // pequeño respiro antes de la siguiente fila
}

// Imprime la línea de subtotal de una sección del PDF de Caja (label en
// dorado, monto alineado a la derecha) y devuelve la nueva posición Y.
function imprimirSubtotalCajaPDF(doc, label, monto, y) {
  if (y > 270) { doc.addPage(); y = 20; }
  monto = monto || 0;
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 108);
  doc.text(label + ':', 15, y);
  doc.text(`${monto < 0 ? '-$' : '$'}${Math.abs(monto).toLocaleString()}`, 195, y, { align: 'right' });
  return y + 6;
}

// ── DESCARGAR PDF ──
async function descargarCajaPDF() {
  const d = window._cajaData;
  if (!d) { showToast('⚠ Primero carga los datos de Caja'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Intentar cargar el logo real; si falla (sin conexión, ruta no encontrada,
  // etc.) se usa el texto "B·Siluets" como respaldo para no romper el PDF.
  let logo = null;
  try {
    logo = await cargarImagenParaPDF('assets/img/logo-bsiluets.png');
  } catch (e) {
    console.warn('No se pudo cargar el logo para el PDF, se usará texto:', e);
  }

  // Header
  let headerY;
  if (logo) {
    const logoAnchoMM = 32;
    const logoAltoMM  = logoAnchoMM * (logo.height / logo.width);
    doc.addImage(logo.base64, 'PNG', 105 - logoAnchoMM / 2, 10, logoAnchoMM, logoAltoMM);
    headerY = 10 + logoAltoMM + 6;
  } else {
    doc.setFontSize(18);
    doc.setTextColor(201, 168, 108);
    doc.text('B·Siluets', 105, 20, { align: 'center' });
    headerY = 27;
  }
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text('Consultorio Médico Estético · Durango', 105, headerY, { align: 'center' });
  doc.setFontSize(13);
  doc.setTextColor(50);
  doc.text(`Corte de Caja — ${d.fecha}`, 105, headerY + 9, { align: 'center' });

  // Línea separadora
  doc.setDrawColor(201, 168, 108);
  doc.line(15, headerY + 13, 195, headerY + 13);

  let y = headerY + 22;

  // Totales por método (mismo resumen que los KPIs de Caja en la app)
  const totalesPDF = [
    { label: 'Efectivo',      val: d.totalesCaja.efectivo,      color: [39, 174, 96]  },
    { label: 'Tarjeta',       val: d.totalesCaja.tarjeta,       color: [41, 128, 185] },
    { label: 'Transferencia', val: d.totalesCaja.transferencia, color: [155, 89, 182] },
    { label: 'Crédito',       val: d.totalesCaja.credito || 0,  color: [230, 126, 34] },
    { label: 'Gastos',        val: d.totalGastos,               color: [231, 76, 60]  },
  ];
  const colAncho = 180 / totalesPDF.length;
  totalesPDF.forEach((t, i) => {
    const x = 15 + colAncho * i + colAncho / 2;
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text(t.label.toUpperCase(), x, y, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(t.color[0], t.color[1], t.color[2]);
    doc.text('$' + Math.abs(t.val).toLocaleString(), x, y + 7, { align: 'center' });
  });
  y += 16;
  doc.setDrawColor(201, 168, 108);
  doc.line(15, y, 195, y);
  y += 9;

  doc.setFontSize(10);
  doc.setTextColor(80);

  // Cobros
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 108);
  doc.text('Cobros del día', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(60);
  if (!d.pagos || d.pagos.length === 0) {
    doc.setTextColor(150);
    doc.text('Sin cobros este día', 15, y);
    doc.setTextColor(60);
    y += 6;
  } else {
    d.pagos.forEach(p => {
      const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos.charAt(0)}.` : '—';
      y = imprimirFilaCajaPDF(doc, `${nombre} — ${p.concepto || '—'}`, `$${parseFloat(p.total).toLocaleString()}`, y);
    });
  }
  y = imprimirSubtotalCajaPDF(doc, 'Subtotal Cobros', d.subtotalPagos, y);

  y += 4;
  // Visitas
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 108);
  doc.text('Abonos de sesiones', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(60);
  if (!d.visitas || d.visitas.length === 0) {
    doc.setTextColor(150);
    doc.text('Sin abonos de sesiones este día', 15, y);
    doc.setTextColor(60);
    y += 6;
  } else {
    d.visitas.forEach(v => {
      const nombre = v.pacientes ? `${v.pacientes.nombre} ${v.pacientes.apellidos.charAt(0)}.` : '—';
      y = imprimirFilaCajaPDF(doc, `${nombre} — Ses. ${v.numero_sesion}`, `$${parseFloat(v.monto_cobrado).toLocaleString()}`, y);
    });
  }
  y = imprimirSubtotalCajaPDF(doc, 'Subtotal Abonos de sesiones', d.subtotalVisitas, y);

  y += 4;
  // Abonos (Paquetes + Créditos)
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 108);
  doc.text('Abonos a paquetes y créditos', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(60);
  if (!d.abonos || d.abonos.length === 0) {
    doc.setTextColor(150);
    doc.text('Sin abonos este día', 15, y);
    doc.setTextColor(60);
    y += 6;
  } else {
    d.abonos.forEach(a => {
      const nombre = a.pacientes ? `${a.pacientes.nombre} ${a.pacientes.apellidos.charAt(0)}.` : '—';
      const tipo   = tipoAbono(a).label;
      const texto  = `${nombre} — ${tipo}: ${a.referencia || 'Abono'} (${a.metodo_pago || '—'})`;
      y = imprimirFilaCajaPDF(doc, texto, `$${parseFloat(a.monto).toLocaleString()}`, y);
    });
  }
  y = imprimirSubtotalCajaPDF(doc, 'Subtotal Abonos a adeudos', d.subtotalAbonos, y);
  if (y > 270) { doc.addPage(); y = 20; }

  y += 4;
  // Gastos
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 108);
  doc.text('Gastos del día', 15, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(60);
  (d.gastos || []).forEach(g => {
    y = imprimirFilaCajaPDF(doc, `${g.categoria} — ${g.descripcion}`, `$${parseFloat(g.monto).toLocaleString()}`, y);
  });
  y = imprimirSubtotalCajaPDF(doc, 'Subtotal Gastos', d.subtotalGastos, y);

  if (y > 265) { doc.addPage(); y = 20; }
  y += 3;

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generado el ${new Date().toLocaleString('es-MX')} · Software SIE`, 105, 290, { align: 'center' });

  doc.save(`caja-bsiluets-${d.fecha}.pdf`);
  showToast('✅ PDF descargado');
}