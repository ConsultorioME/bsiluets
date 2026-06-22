// ─────────────────────────────────────────
//  B·Siluets — Módulo Pacientes
//  Software SIE © 2025
// ─────────────────────────────────────────

// ── LISTAR TODOS ──
async function cargarPacientes(busqueda = '') {
  const tabla = document.getElementById('tabla-pacientes-body');
  if (!tabla) return;

  tabla.innerHTML = `<tr><td colspan="7" style="text-align:center;opacity:.4;padding:24px">Cargando...</td></tr>`;

  let query = db
    .from('pacientes')
    .select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true });

  if (busqueda) {
    query = query.or(`nombre.ilike.%${busqueda}%,apellidos.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`);
  }

  const { data, error } = await query;

  if (error) {
    tabla.innerHTML = `<tr><td colspan="7" style="color:#e74c3c;padding:16px">Error al cargar: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tabla.innerHTML = `<tr><td colspan="7" style="text-align:center;opacity:.35;padding:24px">No se encontraron pacientes</td></tr>`;
    return;
  }

  tabla.innerHTML = data.map(p => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--black);flex-shrink:0">
            ${p.nombre.charAt(0)}${p.apellidos.charAt(0)}
          </div>
          <div>
            <div style="font-weight:500">${p.nombre} ${p.apellidos}</div>
            <div style="font-size:11px;opacity:.4">${p.correo || ''}</div>
          </div>
        </div>
      </td>
      <td>${p.telefono || '—'}</td>
      <td>${p.edad ? p.edad + ' años' : '—'}</td>
      <td>${p.alergias || '—'}</td>
      <td>${formatFecha(p.created_at)}</td>
      <td><span class="badge badge-green">Activa</span></td>
      <td style="display:flex;gap:6px">
        <button class="tb-btn" style="padding:4px 10px;font-size:10px" onclick="verPaciente('${p.id}')">Ver</button>
        <button class="tb-btn" style="padding:4px 10px;font-size:10px" onclick="editarPaciente('${p.id}')">✏</button>
        <button class="tb-btn danger" style="padding:4px 10px;font-size:10px" onclick="eliminarPaciente('${p.id}','${p.nombre} ${p.apellidos}')">✕</button>
      </td>
    </tr>
  `).join('');
}

// ── VER PERFIL COMPLETO ──
async function verPaciente(id) {
  // Marcar fila activa
  document.querySelectorAll('#tabla-pacientes-body tr').forEach(r => r.style.background = '');

  // Cargar datos de la paciente
  const { data: p, error } = await db
    .from('pacientes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !p) { showToast('❌ Error al cargar paciente'); return; }

  // Cargar paquetes
  const { data: paquetes } = await db
    .from('paquetes')
    .select('*, tratamientos(nombre)')
    .eq('paciente_id', id)
    .eq('activo', true);

  // Cargar visitas/historial
  const { data: visitas } = await db
    .from('visitas')
    .select('*')
    .eq('paciente_id', id)
    .order('fecha', { ascending: false })
    .limit(10);

  // ── Llenar perfil ──
  const iniciales = `${p.nombre.charAt(0)}${p.apellidos.charAt(0)}`;
  document.getElementById('perfil-avatar').textContent     = iniciales;
  document.getElementById('perfil-nombre').textContent     = `${p.nombre} ${p.apellidos}`;
  document.getElementById('perfil-tel').textContent        = p.telefono  || '—';
  document.getElementById('perfil-email').textContent      = p.correo    || '—';
  document.getElementById('perfil-edad').textContent       = p.edad ? p.edad + ' años' : '—';
  document.getElementById('perfil-ciudad').textContent     = p.ciudad    || 'Durango';

  // ── Stats ──
  const totalSesiones = paquetes ? paquetes.reduce((s, pk) => s + (pk.sesion_actual || 0), 0) : 0;
  const totalInvertido = paquetes ? paquetes.reduce((s, pk) => s + parseFloat(pk.pagado || 0), 0) : 0;

  document.getElementById('perfil-sesiones').textContent   = totalSesiones;
  document.getElementById('perfil-invertido').textContent  = '$' + totalInvertido.toLocaleString();
  document.getElementById('perfil-paquetes').textContent   = paquetes ? paquetes.length : 0;
  document.getElementById('perfil-proxcita').textContent   = '—';

  // ── Paquetes / contador sesiones ──
  const contPaq = document.getElementById('paquetes-paciente');
  if (contPaq) {
    if (!paquetes || paquetes.length === 0) {
      contPaq.innerHTML = `<div style="font-size:13px;color:var(--cream);opacity:.35;padding:8px 0">Sin paquetes activos</div>`;
    } else {
      contPaq.innerHTML = paquetes.map(pk => {
        const saldo = pk.precio_total - pk.pagado;
        let dots = '';
        for (let i = 1; i <= pk.total_sesiones; i++) {
          if (i < pk.sesion_actual)       dots += `<div class="sdot done">${i}</div>`;
          else if (i === pk.sesion_actual) dots += `<div class="sdot done">${i}</div>`;
          else if (i === pk.sesion_actual + 1) dots += `<div class="sdot current">${i}</div>`;
          else                             dots += `<div class="sdot">${i}</div>`;
        }
        return `
          <div class="session-pkg">
            <div class="pkg-name">
              ${pk.tratamientos?.nombre || 'Tratamiento'} (${pk.total_sesiones} sesiones) —
              <span style="color:var(--gold)">Sesión ${pk.sesion_actual} de ${pk.total_sesiones}</span>
              ${saldo > 0 ? `<span style="color:#e74c3c;font-size:11px;margin-left:8px">Saldo: $${saldo.toLocaleString()}</span>` : '<span style="color:#27AE60;font-size:11px;margin-left:8px">✓ Liquidado</span>'}
            </div>
            <div class="session-dots">${dots}</div>
          </div>`;
      }).join('');
    }
  }

  // ── Historial de visitas ──
  const tablaHist = document.getElementById('tabla-historial');
  if (tablaHist) {
    if (!visitas || visitas.length === 0) {
      tablaHist.innerHTML = `
        <tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>Monto</th></tr>
        <tr><td colspan="4" style="text-align:center;opacity:.3;padding:16px">Sin visitas registradas</td></tr>`;
    } else {
      tablaHist.innerHTML = `
        <tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>Monto</th></tr>
        ${visitas.map(v => `
          <tr>
            <td>${formatFecha(v.fecha)}</td>
            <td>${v.observaciones || 'Visita registrada'}</td>
            <td>${v.metodo_pago ? `<span class="badge badge-green">${v.metodo_pago}</span>` : '<span class="badge badge-gray">—</span>'}</td>
            <td style="color:var(--gold)">${v.monto_cobrado > 0 ? '$' + parseFloat(v.monto_cobrado).toLocaleString() : '<span style="color:var(--info)">$0 — Visita</span>'}</td>
          </tr>`).join('')}`;
    }
  }

  // Scroll al perfil
  document.querySelector('.patient-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(`✓ Perfil de ${p.nombre} cargado`);
}

// ── GUARDAR (CREAR / EDITAR) ──
async function guardarPaciente() {
  const id = document.getElementById('pac-id').value;

  const datos = {
    nombre:           document.getElementById('pac-nombre').value.trim(),
    apellidos:        document.getElementById('pac-apellidos').value.trim(),
    telefono:         document.getElementById('pac-telefono').value.trim(),
    correo:           document.getElementById('pac-correo').value.trim(),
    edad:             parseInt(document.getElementById('pac-edad').value) || null,
    fecha_nacimiento: document.getElementById('pac-nacimiento').value || null,
    alergias:         document.getElementById('pac-alergias').value.trim(),
    notas:            document.getElementById('pac-notas').value.trim(),
  };

  if (!datos.nombre || !datos.apellidos) {
    showToast('⚠ Nombre y apellidos son obligatorios');
    return;
  }

  let error;
  if (id) {
    ({ error } = await db.from('pacientes').update(datos).eq('id', id));
  } else {
    ({ error } = await db.from('pacientes').insert([datos]));
  }

  if (error) { showToast('❌ Error: ' + error.message); return; }

  closeModal('nuevo-paciente');
  showToast(id ? '✓ Paciente actualizada' : '✓ Paciente registrada correctamente');
  limpiarFormPaciente();
  cargarPacientes();
}

// ── EDITAR ──
async function editarPaciente(id) {
  const { data: p, error } = await db
    .from('pacientes').select('*').eq('id', id).single();

  if (error || !p) { showToast('❌ Error'); return; }

  document.getElementById('pac-id').value         = p.id;
  document.getElementById('pac-nombre').value     = p.nombre;
  document.getElementById('pac-apellidos').value  = p.apellidos;
  document.getElementById('pac-telefono').value   = p.telefono   || '';
  document.getElementById('pac-correo').value     = p.correo     || '';
  document.getElementById('pac-edad').value       = p.edad       || '';
  document.getElementById('pac-nacimiento').value = p.fecha_nacimiento || '';
  document.getElementById('pac-alergias').value   = p.alergias   || '';
  document.getElementById('pac-notas').value      = p.notas      || '';

  document.querySelector('#modal-nuevo-paciente .modal-title').textContent = 'Editar Paciente';
  openModal('nuevo-paciente');
}

// ── ELIMINAR (soft delete) ──
async function eliminarPaciente(id, nombre) {
  if (!confirm(`¿Desactivar a ${nombre}? Podrás reactivarla después.`)) return;
  const { error } = await db.from('pacientes').update({ activo: false }).eq('id', id);
  if (error) { showToast('❌ Error: ' + error.message); return; }
  showToast('✓ Paciente desactivada');
  cargarPacientes();
}

// ── LIMPIAR FORM ──
function limpiarFormPaciente() {
  ['pac-id','pac-nombre','pac-apellidos','pac-telefono','pac-correo',
   'pac-edad','pac-nacimiento','pac-alergias','pac-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const titulo = document.querySelector('#modal-nuevo-paciente .modal-title');
  if (titulo) titulo.textContent = 'Nueva Paciente';
}

// ── UTILIDADES ──
function formatFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── BÚSQUEDA EN TIEMPO REAL ──
let busquedaTimeout;
function buscarPaciente(valor) {
  clearTimeout(busquedaTimeout);
  busquedaTimeout = setTimeout(() => cargarPacientes(valor), 400);
}

// ── CALCULAR EDAD ──
function calcularEdad() {
  const nacimiento = document.getElementById('pac-nacimiento').value;
  if (!nacimiento) return;
  const hoy   = new Date();
  const nac   = new Date(nacimiento);
  let edad    = hoy.getFullYear() - nac.getFullYear();
  const mes   = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
  document.getElementById('pac-edad').value = edad;
}