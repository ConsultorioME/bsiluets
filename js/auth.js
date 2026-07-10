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

// Verificar licencia
const licenciaOk = await verificarLicencia();
if (!licenciaOk) {
  document.getElementById('admin-page').style.display = 'none';
  document.getElementById('public-page').style.display = 'block';
  setTimeout(() => {
    alert('⚠ Aviso importante\n\nEstimada Dra. Bianca,\n\nSu suscripción al sistema B·Siluets está pendiente de pago.\n\nPara continuar usando el sistema, por favor contacte a su proveedor de software.\n\nSoftware SIE — 311 145 8100');
  }, 300);
  return;
}

  initAdmin();
}

// ── APLICAR ROL ──
function aplicarRol(rol) {
  const permisos = {
    admin: ['dashboard','agenda','pacientes','tratamientos','inventario','pagos','paquetes','creditos','reportes','caja','gastos','bot','config'],
    recepcionista:['dashboard','agenda','pacientes','pagos','paquetes'],
    capturista:   ['dashboard','pagos','paquetes']
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