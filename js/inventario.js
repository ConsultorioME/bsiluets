// ─────────────────────────────────────────
//  B·Siluets — Módulo Inventario
//  Software SIE © 2025
// ─────────────────────────────────────────

// ── CARGAR INVENTARIO ──
async function cargarInventario(busqueda = '') {
  const tbody = document.getElementById('tabla-inventario');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;opacity:.4;padding:24px">Cargando...</td></tr>`;

  const categoria = document.getElementById('filtro-inv-cat')?.value || '';

  let query = db
    .from('inventario')
    .select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (busqueda) {
    query = query.or(`nombre.ilike.%${busqueda}%,categoria.ilike.%${busqueda}%`);
  }
  if (categoria) {
    query = query.eq('categoria', categoria);
  }

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:#e74c3c;padding:16px">Error: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;opacity:.35;padding:24px">No se encontraron productos</td></tr>`;
    renderAlertas([]);
    return;
  }

  // Alertas de stock bajo
  renderAlertas(data.filter(p => parseFloat(p.stock) <= parseFloat(p.stock_minimo)));

  tbody.innerHTML = data.map(p => {
    const stock = parseFloat(p.stock);
    const min   = parseFloat(p.stock_minimo);
    const bajo  = stock <= min;
    const estadoBadge = bajo
      ? '<span class="badge badge-red">Bajo</span>'
      : '<span class="badge badge-green">OK</span>';
    const stockClass = bajo ? 'low' : 'ok';

    return `<tr>
      <td><strong>${p.nombre}</strong></td>
      <td>${p.categoria || '—'}</td>
      <td><span class="qty-badge ${stockClass}">${stock % 1 === 0 ? stock : stock.toFixed(2)}</span></td>
      <td>${p.unidad || '—'}</td>
      <td style="opacity:.6">${min % 1 === 0 ? min : min.toFixed(2)}</td>
      <td style="color:var(--gold)">${p.precio_venta > 0 ? '$' + parseFloat(p.precio_venta).toLocaleString() : '—'}</td>
      <td>${estadoBadge}</td>
      <td style="display:flex;gap:6px">
        <button class="tb-btn" style="padding:4px 10px;font-size:10px" onclick="event.stopPropagation();ajustarStock(\`${p.id}\`,\`${p.nombre}\`,${stock},\`${p.unidad}\`)">± Stock</button>
        <button class="tb-btn" style="padding:4px 10px;font-size:10px" onclick="event.stopPropagation();editarProducto(\`${p.id}\`)">✏</button>
        <button class="tb-btn danger" style="padding:4px 10px;font-size:10px" onclick="event.stopPropagation();eliminarProducto(\`${p.id}\`,\`${p.nombre}\`)">✕</button>
      </td>
    </tr>`;
  }).join('');
}

// ── ALERTAS STOCK BAJO ──
function renderAlertas(bajos) {
  const cont = document.getElementById('stock-alertas');
  if (!cont) return;
  if (bajos.length === 0) { cont.innerHTML = ''; return; }
  cont.innerHTML = `
    <div class="stock-alert">
      ⚠ ${bajos.length} producto${bajos.length > 1 ? 's' : ''} con stock bajo:
      <strong>${bajos.map(p => p.nombre).join(', ')}</strong>
    </div>`;
}

// ── GUARDAR ──
async function guardarProducto() {
  const id = document.getElementById('prod-id').value;

  const datos = {
    nombre:       document.getElementById('prod-nombre').value.trim(),
    categoria:    document.getElementById('prod-categoria').value,
    stock:        parseFloat(document.getElementById('prod-stock').value) || 0,
    unidad:       document.getElementById('prod-unidad').value,
    stock_minimo: parseFloat(document.getElementById('prod-stock-min').value) || 0,
    precio_venta: parseFloat(document.getElementById('prod-precio').value) || 0,
  };

  if (!datos.nombre) { showToast('⚠ El nombre es obligatorio'); return; }

  let error;
  if (id) {
    ({ error } = await db.from('inventario').update(datos).eq('id', id));
  } else {
    ({ error } = await db.from('inventario').insert([datos]));
  }

  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('nuevo-prod');
  showToast(id ? '✓ Producto actualizado' : '✓ Producto registrado');
  limpiarFormProd();
  cargarInventario();
}

// ── EDITAR ──
async function editarProducto(id) {
  const { data: p, error } = await db
    .from('inventario').select('*').eq('id', id).single();
  if (error || !p) { showToast('❌ Error al cargar'); return; }

  document.getElementById('prod-id').value          = p.id;
  document.getElementById('prod-nombre').value      = p.nombre;
  document.getElementById('prod-categoria').value   = p.categoria || 'Suplemento';
  document.getElementById('prod-stock').value       = p.stock;
  document.getElementById('prod-unidad').value      = p.unidad || 'kg';
  document.getElementById('prod-stock-min').value   = p.stock_minimo;
  document.getElementById('prod-precio').value      = p.precio_venta;

  document.querySelector('#modal-nuevo-prod .modal-title').textContent = 'Editar Producto';
  openModal('nuevo-prod');
}

// ── AJUSTAR STOCK ──
async function ajustarStock(id, nombre, stockActual, unidad) {
  const cant = prompt(`${nombre}\nStock actual: ${stockActual} ${unidad}\n\nIngresa la cantidad a sumar (+) o restar (-):\nEj: 5.25 para sumar, -2 para restar`);
  if (cant === null || cant === '') return;

  const ajuste = parseFloat(cant);
  if (isNaN(ajuste)) { showToast('⚠ Ingresa un número válido'); return; }

  const nuevoStock = Math.max(0, stockActual + ajuste);
  const { error } = await db.from('inventario').update({ stock: nuevoStock }).eq('id', id);

  if (error) { showToast('❌ Error: ' + error.message); return; }

  const tipo = ajuste >= 0 ? 'sumaron' : 'restaron';
  showToast(`✓ Se ${tipo} ${Math.abs(ajuste)} ${unidad}. Stock actual: ${nuevoStock}`);
  cargarInventario();
}

// ── ELIMINAR ──
async function eliminarProducto(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}" del inventario?`)) return;
  const { error } = await db.from('inventario').update({ activo: false }).eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Producto eliminado');
  cargarInventario();
}

// ── LIMPIAR FORM ──
function limpiarFormProd() {
  ['prod-id','prod-nombre','prod-stock','prod-stock-min','prod-precio','prod-proveedor'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const titulo = document.querySelector('#modal-nuevo-prod .modal-title');
  if (titulo) titulo.textContent = 'Nuevo Producto';
}

// ── BÚSQUEDA ──
let invTimeout;
function buscarInventario(valor) {
  clearTimeout(invTimeout);
  invTimeout = setTimeout(() => cargarInventario(valor), 400);
}