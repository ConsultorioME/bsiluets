// ─────────────────────────────────────────
//  B·Siluets — Autenticación
//  Software SIE © 2025
// ─────────────────────────────────────────

// Usuarios hardcoded por ahora (después se migra a Supabase Auth)
const USUARIOS = [
  { usuario: 'admin',     password: '1234',   nombre: 'Administrador', rol: 'admin' },
  { usuario: 'recepcion', password: 'bsiluets', nombre: 'Recepción',   rol: 'recepcion' },
];

// ── LOGIN ──
async function login() {
  const usuario  = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const errEl    = document.getElementById('login-err');

  errEl.style.display = 'none';

  const encontrado = USUARIOS.find(u => u.usuario === usuario && u.password === password);

  if (!encontrado) {
    errEl.style.display = 'block';
    return;
  }

  // Verificar licencia antes de entrar
  const activo = await verificarLicencia();
  if (!activo) return;

  // Guardar sesión
  sessionStorage.setItem('bsiluets_user', JSON.stringify({
    usuario:  encontrado.usuario,
    nombre:   encontrado.nombre,
    rol:      encontrado.rol,
    ingreso:  new Date().toISOString()
  }));

  // Entrar al panel
  document.getElementById('login-overlay').classList.remove('open');
  document.getElementById('public-page').style.display  = 'none';
  document.getElementById('admin-page').style.display   = 'flex';

  // Mostrar nombre en sidebar
  const sesion = getSesion();
  if (sesion) {
    document.querySelector('.su-info p').textContent   = sesion.nombre;
    document.querySelector('.su-info span').textContent = sesion.usuario;
    document.querySelector('.su-avatar').textContent    = sesion.nombre.charAt(0).toUpperCase();
  }

  initAdmin();
}

// ── LOGOUT ──
function logout() {
  sessionStorage.removeItem('bsiluets_user');
  document.getElementById('admin-page').style.display  = 'none';
  document.getElementById('public-page').style.display = 'block';
}

// ── OBTENER SESIÓN ──
function getSesion() {
  const data = sessionStorage.getItem('bsiluets_user');
  return data ? JSON.parse(data) : null;
}

// ── VERIFICAR SESIÓN AL CARGAR ──
function checkSesion() {
  const sesion = getSesion();
  if (sesion) {
    document.getElementById('public-page').style.display  = 'none';
    document.getElementById('admin-page').style.display   = 'flex';
    document.querySelector('.su-info p').textContent       = sesion.nombre;
    document.querySelector('.su-info span').textContent    = sesion.usuario;
    document.querySelector('.su-avatar').textContent       = sesion.nombre.charAt(0).toUpperCase();
    initAdmin();
  }
}
