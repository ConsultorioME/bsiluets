// ─────────────────────────────────────────
//  B·Siluets — Módulo Gastos
//  Software SIE © 2025
// ─────────────────────────────────────────

async function initGastos() {
  // Inicializar selector de mes
  const selMes = document.getElementById('gastos-filtro-mes');
  if (selMes && selMes.options.length === 0) {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const hoy = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = `${meses[d.getMonth()]} ${d.getFullYear()}`;
      if (i === 0) opt.selected = true;
      selMes.appendChild(opt);
    }
  }

  // Fecha por defecto en modal
  const hoy = new Date().toISOString().split('T')[0];
  const fechaEl = document.getElementById('gasto-fecha');
  if (fechaEl && !fechaEl.value) fechaEl.value = hoy;

  await cargarGastos();
}

async function cargarGastos() {
  const mes      = document.getElementById('gastos-filtro-mes')?.value || '';
  const categoria = document.getElementById('gastos-filtro-cat')?.value || '';

  if (!mes) return;

  const desde = `${mes}-01`;
  const hasta = `${mes}-${new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1]), 0).getDate()}`;

  // Cargar gastos
  let query = db.from('gastos').select('*').eq('activo', true)
    .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
  if (categoria) query = query.eq('categoria', categoria);

  const { data: gastos, error } = await query;

  if (error) { showToast('❌ Error al cargar gastos'); return; }

  // Cargar ingresos del mes (pagos)
  const { data: pagos } = await db.from('pagos')
    .select('total').gte('fecha', desde).lte('fecha', hasta);

  // Cargar abonos del mes
  const { data: abonos } = await db.from('abonos')
    .select('monto, metodo_pago').gte('fecha', desde).lte('fecha', hasta);

  const totalGastos  = (gastos || []).reduce((s, g) => s + parseFloat(g.monto || 0), 0);
  const totalPagos   = (pagos || []).reduce((s, p) => s + parseFloat(p.total || 0), 0);
  const totalAbonos  = (abonos || []).filter(a => a.metodo_pago !== 'credito')
                        .reduce((s, a) => s + parseFloat(a.monto || 0), 0);
  const totalIngresos = totalPagos + totalAbonos;
  const utilidad      = totalIngresos - totalGastos;

  // KPIs
  document.getElementById('gastos-total-mes').textContent = '$' + totalGastos.toLocaleString();
  document.getElementById('gastos-ingresos').textContent  = '$' + totalIngresos.toLocaleString();

  const utilEl = document.getElementById('gastos-utilidad');
  utilEl.textContent   = '$' + Math.abs(utilidad).toLocaleString();
  utilEl.style.color   = utilidad >= 0 ? '#27AE60' : '#e74c3c';
  if (utilidad < 0) utilEl.textContent = '-$' + Math.abs(utilidad).toLocaleString();

  // Mayor categoría
  const porCat = {};
  (gastos || []).forEach(g => {
    porCat[g.categoria] = (porCat[g.categoria] || 0) + parseFloat(g.monto || 0);
  });
  const mayorCat = Object.entries(porCat).sort((a,b) => b[1]-a[1])[0];
  document.getElementById('gastos-mayor-cat').textContent = mayorCat ? mayorCat[0] : '—';

  // Tabla
  renderTablaGastos(gastos || []);

  // Barras por categoría
  renderGastosPorCat(porCat, totalGastos);
}

function renderTablaGastos(gastos) {
  const tbody = document.getElementById('tabla-gastos');
  if (!tbody) return;

  if (gastos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;opacity:.3;padding:20px">Sin gastos registrados</td></tr>`;
    return;
  }

  const metBadge = { efectivo:'badge-green', tarjeta:'badge-blue', transferencia:'badge-gray' };
  const catIco   = {
    'Insumos y productos':'🧴', 'Servicios':'💡', 'Nómina / honorarios':'👩‍⚕️',
    'Compras de inventario':'🛒', 'Mantenimiento y equipo':'🔧',
    'Publicidad y marketing':'📢', 'Gastos médicos':'🏥', 'Otros':'📦'
  };

  tbody.innerHTML = gastos.map(g => {
    const badge = metBadge[g.metodo_pago] || 'badge-gray';
    const ico   = catIco[g.categoria] || '📦';
    const fecha = g.fecha ? new Date(g.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) : '—';
    return `<tr>
      <td style="font-size:12px;opacity:.6">${fecha}</td>
      <td style="font-size:12px">${ico} ${g.categoria}</td>
      <td>${g.descripcion}</td>
      <td><span class="badge ${badge}" style="font-size:10px">${g.metodo_pago}</span></td>
      <td style="color:#e74c3c;font-weight:500">$${parseFloat(g.monto).toLocaleString()}</td>
      <td style="display:flex;gap:6px">
        <button class="tb-btn" style="padding:4px 8px;font-size:10px" onclick="editarGasto('${g.id}')">✏</button>
        <button class="tb-btn danger" style="padding:4px 8px;font-size:10px" onclick="eliminarGasto('${g.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function renderGastosPorCat(porCat, total) {
  const cont = document.getElementById('gastos-por-cat');
  if (!cont) return;

  if (Object.keys(porCat).length === 0) {
    cont.innerHTML = '<div style="opacity:.3;font-size:13px">Sin datos</div>';
    return;
  }

  const sorted = Object.entries(porCat).sort((a,b) => b[1]-a[1]);
  const colores = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#95a5a6'];

  cont.innerHTML = sorted.map(([cat, monto], i) => {
    const pct = total > 0 ? ((monto/total)*100).toFixed(1) : 0;
    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--cream);opacity:.7">${cat}</span>
          <span style="color:${colores[i % colores.length]};font-weight:500">$${monto.toLocaleString()} (${pct}%)</span>
        </div>
        <div style="background:rgba(255,255,255,.06);height:6px;border-radius:3px">
          <div style="width:${pct}%;background:${colores[i % colores.length]};height:6px;border-radius:3px;transition:width .4s"></div>
        </div>
      </div>`;
  }).join('');
}

async function guardarGasto() {
  const id          = document.getElementById('gasto-id').value;
  const fecha       = document.getElementById('gasto-fecha').value;
  const categoria   = document.getElementById('gasto-categoria').value;
  const descripcion = document.getElementById('gasto-descripcion').value.trim();
  const monto       = parseFloat(document.getElementById('gasto-monto').value) || 0;
  const metodo_pago = document.getElementById('gasto-metodo').value;
  const referencia  = document.getElementById('gasto-referencia').value.trim();

  if (!fecha)       { showToast('⚠ La fecha es obligatoria'); return; }
  if (!descripcion) { showToast('⚠ La descripción es obligatoria'); return; }
  if (monto <= 0)   { showToast('⚠ El monto debe ser mayor a 0'); return; }

  const datos = { fecha, categoria, descripcion, monto, metodo_pago, referencia: referencia || null };

  let error;
  if (id) {
    ({ error } = await db.from('gastos').update(datos).eq('id', id));
  } else {
    ({ error } = await db.from('gastos').insert([datos]));
  }

  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('nuevo-gasto');
  limpiarFormGasto();
  showToast(id ? '✓ Gasto actualizado' : '✓ Gasto registrado');
  await cargarGastos();
}

async function editarGasto(id) {
  const { data: g, error } = await db.from('gastos').select('*').eq('id', id).single();
  if (error || !g) { showToast('❌ Error al cargar'); return; }

  document.getElementById('gasto-id').value          = g.id;
  document.getElementById('gasto-fecha').value       = g.fecha;
  document.getElementById('gasto-categoria').value   = g.categoria;
  document.getElementById('gasto-descripcion').value = g.descripcion;
  document.getElementById('gasto-monto').value       = g.monto;
  document.getElementById('gasto-metodo').value      = g.metodo_pago;
  document.getElementById('gasto-referencia').value  = g.referencia || '';
  document.getElementById('gasto-modal-title').textContent = 'Editar Gasto';
  openModal('nuevo-gasto');
}

async function eliminarGasto(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  const { error } = await db.from('gastos').update({ activo: false }).eq('id', id);
  if (error) { showToast('❌ Error'); return; }
  showToast('✓ Gasto eliminado');
  await cargarGastos();
}

function limpiarFormGasto() {
  ['gasto-id','gasto-descripcion','gasto-monto','gasto-referencia'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('gasto-fecha').value     = hoy;
  document.getElementById('gasto-categoria').value = 'Insumos y productos';
  document.getElementById('gasto-metodo').value    = 'efectivo';
  document.getElementById('gasto-modal-title').textContent = 'Nuevo Gasto';
}
