// ─────────────────────────────────────────
//  B·Siluets — Autenticación
//  Software SIE © 2025
// ─────────────────────────────────────────

// ── HASH SHA-256 ──
async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── LOGIN ──
async function login() {
  const usuario  = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-err');

  if (!usuario || !password) {
    errEl.style.display = 'block';
    errEl.textContent   = 'Ingresa usuario y contraseña';
    return;
  }

  // Verificar licencia ANTES de buscar el usuario: con la licencia apagada la
  // base de datos (sql/licencia.sql) no devuelve usuarios y el login diría
  // "contraseña incorrecta" en vez de "sistema suspendido".
  if (!(await verificarLicencia())) {
    mostrarSuspendido();
    return;
  }

  const hash = await hashPassword(password);

  const { data, error } = await db
    .from('usuarios')
    .select('id, nombre, usuario, rol, activo')
    .eq('usuario', usuario)
    .eq('password_hash', hash)
    .eq('activo', true)
    .single();

  if (error || !data) {
    errEl.style.display = 'block';
    errEl.textContent   = 'Usuario o contraseña incorrectos';
    return;
  }

  errEl.style.display = 'none';

  // Guardar sesión
  sessionStorage.setItem('bsiluets_user', JSON.stringify({
    id:     data.id,
    nombre: data.nombre,
    usuario: data.usuario,
    rol:    data.rol
  }));

  closeLogin();
  document.getElementById('public-page').style.display = 'none';
  document.getElementById('admin-page').style.display  = 'flex';

  // Mostrar nombre y rol en sidebar
  const suInfo = document.querySelector('.su-info p');
  const suSpan = document.querySelector('.su-info span');
  if (suInfo) suInfo.textContent = data.nombre;
  if (suSpan) suSpan.textContent = data.usuario;

  // Aplicar permisos por rol
  aplicarRol(data.rol);

  initAdmin();
}

// ── APLICAR ROL ──
function aplicarRol(rol) {
  const permisos = {
    admin: ['dashboard','agenda','pacientes','tratamientos','inventario','pagos','paquetes','creditos','reportes','caja','gastos','bot','config'],
    // Recepcionista: ve todo excepto Dashboard, Reportes, Bot/Chat y Configuración.
    recepcionista:['agenda','pacientes','tratamientos','inventario','pagos','paquetes','creditos','caja','gastos'],
    capturista:   ['dashboard','pagos','paquetes'],
    doctora:      ['agenda']
  };

  const permitidos = permisos[rol] || permisos['recepcionista'];

  // Ocultar módulos no permitidos en el sidebar
  document.querySelectorAll('.nav-item[onclick]').forEach(item => {
    const match = item.getAttribute('onclick').match(/showModule\('(\w+)'/);
    if (match) {
      const modulo = match[1];
      item.style.display = permitidos.includes(modulo) ? '' : 'none';
    }
  });

  // Ocultar nav-sections vacías
  document.querySelectorAll('.nav-section').forEach(sec => {
    let siguiente = sec.nextElementSibling;
    let tieneVisible = false;
    while (siguiente && !siguiente.classList.contains('nav-section')) {
      if (siguiente.style.display !== 'none') tieneVisible = true;
      siguiente = siguiente.nextElementSibling;
    }
    sec.style.display = tieneVisible ? '' : 'none';
  });
}

// ── LOGOUT ──
function logout() {
  sessionStorage.removeItem('bsiluets_user');
  document.getElementById('admin-page').style.display  = 'none';
  document.getElementById('public-page').style.display = 'block';
}

// ── AUTORIZACIÓN DE ADMIN (para acciones sensibles hechas por Recepcionista) ──

// Roles que necesitan que un Admin autorice en el momento para poder eliminar
// (Pagos / abonos). Admin nunca pasa por aquí.
function requiereAutorizacionAdmin() {
  const u = JSON.parse(sessionStorage.getItem('bsiluets_user') || '{}');
  return u.rol === 'recepcionista';
}

let _resolverConfirmAdmin = null;

// Abre el modal pidiendo usuario+contraseña de un Admin y regresa una
// Promise<boolean> que se resuelve cuando se autoriza o se cancela.
function pedirAutorizacionAdmin(motivo) {
  return new Promise(resolve => {
    _resolverConfirmAdmin = resolve;
    document.getElementById('confirmar-admin-motivo').textContent = motivo || 'Esta acción requiere autorización de un Administrador.';
    document.getElementById('confirmar-admin-usuario').value  = '';
    document.getElementById('confirmar-admin-password').value = '';
    document.getElementById('confirmar-admin-err').style.display = 'none';
    openModal('confirmar-admin');
    document.getElementById('confirmar-admin-usuario').focus();
  });
}

function cancelarConfirmacionAdmin() {
  closeModal('confirmar-admin');
  if (_resolverConfirmAdmin) { _resolverConfirmAdmin(false); _resolverConfirmAdmin = null; }
}

async function validarConfirmacionAdmin() {
  const usuario  = document.getElementById('confirmar-admin-usuario').value.trim();
  const password = document.getElementById('confirmar-admin-password').value;
  const errEl    = document.getElementById('confirmar-admin-err');

  if (!usuario || !password) {
    errEl.textContent   = 'Ingresa usuario y contraseña';
    errEl.style.display = 'block';
    return;
  }

  const hash = await hashPassword(password);
  const { data, error } = await db
    .from('usuarios')
    .select('id, rol, activo')
    .eq('usuario', usuario)
    .eq('password_hash', hash)
    .eq('activo', true)
    .single();

  if (error || !data || data.rol !== 'admin') {
    errEl.textContent   = 'Usuario o contraseña incorrectos, o la cuenta no es Administrador';
    errEl.style.display = 'block';
    return;
  }

  closeModal('confirmar-admin');
  if (_resolverConfirmAdmin) { _resolverConfirmAdmin(true); _resolverConfirmAdmin = null; }
}