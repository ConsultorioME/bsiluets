// ─────────────────────────────────────────
//  B·Siluets — Módulo Tratamientos
//  Software SIE © 2025
// ─────────────────────────────────────────

// ── CARGAR TRATAMIENTOS ──
async function cargarTratamientos(busqueda = '') {
  const grid = document.getElementById('treat-grid-container');
  if (!grid) return;

  grid.innerHTML = `<div style="color:var(--cream);opacity:.35;padding:24px;font-size:13px">Cargando...</div>`;

  const categoria = document.getElementById('filtro-categoria')?.value || '';

  let query = db
    .from('tratamientos')
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
    grid.innerHTML = `<div style="color:#e74c3c;padding:16px;font-size:13px">Error: ${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    grid.innerHTML = `<div style="color:var(--cream);opacity:.35;padding:24px;font-size:13px;grid-column:1/-1">No se encontraron tratamientos</div>`;
    return;
  }

  grid.innerHTML = data.map(t => {
    const paquetes = [];
    if (t.sesiones_paquete_8)  paquetes.push('8 sesiones');
    if (t.sesiones_paquete_10) paquetes.push('10 sesiones');
    const paqText = paquetes.length > 0 ? `Paquete ${paquetes.join(' / ')}` : 'Sesión individual';
    const paqBadge = paquetes.length > 0
      ? `<span style="font-size:10px;background:rgba(201,168,108,.15);color:var(--gold);padding:3px 8px;border-radius:2px;letter-spacing:.08em">📦 Con paquete</span>`
      : `<span style="font-size:10px;background:rgba(255,255,255,.06);color:var(--cream);opacity:.5;padding:3px 8px;border-radius:2px;letter-spacing:.08em">✦ Sesión individual</span>`;
    return `
      <div class="treat-card" style="position:relative" onclick="void(0)">
        <div style="position:absolute;top:12px;right:12px;display:flex;gap:6px">
          <button class="icon-btn" title="Editar" onclick="event.stopPropagation();editarTratamiento(\`${t.id}\`)">✏</button>
          <button class="icon-btn danger" title="Eliminar" onclick="event.stopPropagation();eliminarTratamiento(\`${t.id}\`,\`${t.nombre}\`)">✕</button>
        </div>
        <div class="treat-cat">${t.categoria || 'General'}</div>
        <div class="treat-name">${t.nombre}</div>
        <div class="treat-price">$${parseFloat(t.precio).toLocaleString()} MXN / sesión</div>
        <div class="treat-sessions">${paqText}</div>
        
        ${paqBadge}

        ${t.descripcion ? `<div style="font-size:12px;color:var(--cream);opacity:.4;margin-top:10px;line-height:1.5">${t.descripcion}</div>` : ''}
      </div>`;
  }).join('');
}

// ── GUARDAR (CREAR / EDITAR) ──
async function guardarTratamiento() {
  const id = document.getElementById('trat-id').value;
  const datos = {
    nombre:              document.getElementById('trat-nombre').value.trim(),
    categoria:           document.getElementById('trat-categoria').value,
    precio:              parseFloat(document.getElementById('trat-precio').value) || 0,
    descripcion:         document.getElementById('trat-descripcion').value.trim(),
    maneja_paquete:      document.getElementById('trat-maneja-paquete').checked,
    sesiones_paquete_8:  document.getElementById('trat-paq8').checked,
    sesiones_paquete_10: document.getElementById('trat-paq10').checked,
  };
  if (!datos.nombre) { showToast('⚠ El nombre es obligatorio'); return; }
  if (!datos.precio)  { showToast('⚠ El precio es obligatorio'); return; }
  let error;
  if (id) {
    ({ error } = await db.from('tratamientos').update(datos).eq('id', id));
  } else {
    ({ error } = await db.from('tratamientos').insert([datos]));
  }
  if (error) { showToast('❌ Error: ' + error.message); return; }
  closeModal('nuevo-trat');
  showToast(id ? '✓ Tratamiento actualizado' : '✓ Tratamiento registrado');
  limpiarFormTratamiento();
  cargarTratamientos();
}

// ── EDITAR ──
async function editarTratamiento(id) {
  const { data: t, error } = await db
    .from('tratamientos').select('*').eq('id', id).single();
  if (error || !t) { showToast('❌ Error al cargar'); return; }
  document.getElementById('trat-id').value           = t.id;
  document.getElementById('trat-nombre').value       = t.nombre;
  document.getElementById('trat-categoria').value    = t.categoria || 'General';
  document.getElementById('trat-precio').value       = t.precio;
  document.getElementById('trat-descripcion').value  = t.descripcion || '';
  document.getElementById('trat-maneja-paquete').checked = t.maneja_paquete || false;
  togglePaqueteOpts();
  document.querySelector('#modal-nuevo-trat .modal-title').textContent = 'Editar Tratamiento';
  openModal('nuevo-trat');
}

// ── ELIMINAR ──
async function eliminarTratamiento(id, nombre) {
  if (!confirm(`¿Eliminar el tratamiento "${nombre}"?`)) return;
  const { error } = await db.from('tratamientos').update({ activo: false }).eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Tratamiento eliminado');
  cargarTratamientos();
}

// ── LIMPIAR FORM ──
function limpiarFormTratamiento() {
  ['trat-id','trat-nombre','trat-precio','trat-descripcion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['trat-maneja-paquete','trat-paq8','trat-paq10'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  const cat = document.getElementById('trat-categoria');
  if (cat) cat.value = 'Medicina Estética';
  document.getElementById('bloque-paquetes-opts').style.display = 'none';
  const titulo = document.querySelector('#modal-nuevo-trat .modal-title');
  if (titulo) titulo.textContent = 'Nuevo Tratamiento';
}

// ── TOGGLE PAQUETE OPTS ──
function togglePaqueteOpts() {
  const chk = document.getElementById('trat-maneja-paquete');
  const bloque = document.getElementById('bloque-paquetes-opts');
  if (bloque) bloque.style.display = chk?.checked ? 'block' : 'none';
}

// ── BÚSQUEDA ──
let tratTimeout;
function buscarTratamiento(valor) {
  clearTimeout(tratTimeout);
  tratTimeout = setTimeout(() => cargarTratamientos(valor), 400);
}
// ── AGREGAR CATEGORÍA PERSONALIZADA ──
function agregarCategoriaTrat() {
  const nueva = prompt('Nombre de la nueva categoría:');
  if (!nueva || !nueva.trim()) return;
  const sel = document.getElementById('trat-categoria');
  const opt = document.createElement('option');
  opt.value = nueva.trim();
  opt.textContent = nueva.trim();
  opt.selected = true;
  sel.appendChild(opt);
  showToast(`✓ Categoría "${nueva.trim()}" agregada`);
}