// ─────────────────────────────────────────
//  B·Siluets — Módulo Reportes
//  Software SIE © 2025
// ─────────────────────────────────────────

// ── INICIALIZAR ──
async function initReportes() {
  poblarSelectMes();
  const sel = document.getElementById('reporte-mes');
  const [year, month] = (sel?.value || new Date().toISOString().slice(0,7)).split('-');
  await cargarReportes(parseInt(year), parseInt(month));
}

// ── POBLAR SELECT DE MESES ──
function poblarSelectMes() {
  const sel = document.getElementById('reporte-mes');
  if (!sel || sel.options.length > 0) return;
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const hoy = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl = `${meses[d.getMonth()]} ${d.getFullYear()}`;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = lbl;
    sel.appendChild(opt);
  }
}

// ── CARGAR REPORTES ──
async function cargarReportes(year, month) {
  const desde = `${year}-${String(month).padStart(2,'0')}-01`;
  const hasta = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;

  // Cargar pagos del mes
  const { data: pagos } = await db
    .from('pagos')
    .select('*, pacientes(nombre, apellidos)')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false });

  // Cargar visitas del mes
  const { data: visitas } = await db
    .from('visitas')
    .select('*, paquetes(tratamientos(nombre))')
    .gte('fecha', desde)
    .lte('fecha', hasta);

  // ── KPIs ──
  const ingresos   = pagos ? pagos.reduce((s, p) => s + parseFloat(p.total || 0), 0) : 0;
  const sesiones   = visitas ? visitas.length : 0;
  const pacientes  = pagos ? new Set(pagos.map(p => p.paciente_id)).size : 0;

  document.getElementById('rep-ingresos').textContent  = '$' + ingresos.toLocaleString();
  document.getElementById('rep-sesiones').textContent  = sesiones;
  document.getElementById('rep-pacientes').textContent = pacientes;

  // Tratamiento top
  if (visitas && visitas.length > 0) {
    const conteo = {};
    visitas.forEach(v => {
      const t = v.paquetes?.tratamientos?.nombre || 'Otro';
      conteo[t] = (conteo[t] || 0) + 1;
    });
    const top = Object.entries(conteo).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('rep-top').textContent = top ? top[0] : '—';
  } else {
    document.getElementById('rep-top').textContent = '—';
  }

  // ── BARRAS INGRESOS POR SEMANA ──
  renderBarrasSemanales(pagos || [], year, month);

  // ── BARRAS SESIONES POR TRATAMIENTO ──
  renderBarrasTratamientos(visitas || []);

  // ── MÉTODOS DE PAGO ──
  renderMetodosPago(pagos || [], ingresos);

  // ── TABLA ÚLTIMOS COBROS ──
  renderUltimosCobros(pagos || []);
}

// ── BARRAS SEMANALES ──
function renderBarrasSemanales(pagos, year, month) {
  const bi = document.getElementById('bar-ingresos');
  if (!bi) return;

  const diasEnMes = new Date(year, month, 0).getDate();
  const semanas   = [0, 0, 0, 0];

  pagos.forEach(p => {
    const dia = parseInt(p.fecha?.split('-')[2] || 0);
    const sem = Math.min(Math.floor((dia - 1) / 7), 3);
    semanas[sem] += parseFloat(p.total || 0);
  });

  const max = Math.max(...semanas, 1);
  bi.innerHTML = semanas.map((v, i) => `
    <div class="bar" style="height:${(v/max*100)}%;flex:1">
      <span class="bar-val">$${v > 0 ? (v/1000).toFixed(1)+'k' : '0'}</span>
      <span class="bar-label">Sem ${i+1}</span>
    </div>`).join('');
}

// ── BARRAS TRATAMIENTOS ──
function renderBarrasTratamientos(visitas) {
  const bt = document.getElementById('bar-trats');
  if (!bt) return;

  const conteo = {};
  visitas.forEach(v => {
    const t = v.paquetes?.tratamientos?.nombre || 'Otro';
    conteo[t] = (conteo[t] || 0) + 1;
  });

  const entries = Object.entries(conteo).sort((a,b) => b[1]-a[1]).slice(0, 5);

  if (entries.length === 0) {
    bt.innerHTML = `<div style="color:var(--cream);opacity:.25;font-size:12px;padding:20px">Sin sesiones este mes</div>`;
    return;
  }

  const max = Math.max(...entries.map(e => e[1]), 1);
  bt.innerHTML = entries.map(([nombre, cnt]) => {
    const short = nombre.length > 8 ? nombre.slice(0,8)+'.' : nombre;
    return `<div class="bar" style="height:${(cnt/max*100)}%;flex:1">
      <span class="bar-val">${cnt}</span>
      <span class="bar-label">${short}</span>
    </div>`;
  }).join('');
}

// ── MÉTODOS DE PAGO ──
function renderMetodosPago(pagos, totalIngresos) {
  const cont = document.getElementById('rep-metodos');
  if (!cont) return;

  if (pagos.length === 0) {
    cont.innerHTML = `<div style="color:var(--cream);opacity:.25;font-size:12px">Sin cobros este mes</div>`;
    return;
  }

  const metodos = {};
  pagos.forEach(p => {
    const m = p.metodo_pago || 'otro';
    metodos[m] = (metodos[m] || 0) + parseFloat(p.total || 0);
  });

  const total = totalIngresos || 1;
  const colores = { efectivo:'var(--gold)', tarjeta:'rgba(201,168,108,.5)', credito:'rgba(201,168,108,.25)', transferencia:'rgba(41,128,185,.5)' };

  cont.innerHTML = Object.entries(metodos).map(([m, v]) => {
    const pct  = Math.round((v / total) * 100);
    const color = colores[m] || 'var(--gold)';
    return `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--cream);opacity:.6;margin-bottom:4px">
          <span style="text-transform:capitalize">${m}</span>
          <span>${pct}% — $${v.toLocaleString()}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.06);border-radius:2px">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:.6s"></div>
        </div>
      </div>`;
  }).join('');
}

// ── ÚLTIMOS COBROS ──
function renderUltimosCobros(pagos) {
  const tbody = document.getElementById('tabla-rep-cobros');
  if (!tbody) return;

  if (pagos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;opacity:.3;padding:16px">Sin cobros este mes</td></tr>`;
    return;
  }

  tbody.innerHTML = pagos.slice(0, 8).map(p => {
    const nombre = p.pacientes ? `${p.pacientes.nombre} ${p.pacientes.apellidos.charAt(0)}.` : '—';
    const fecha  = p.fecha ? new Date(p.fecha+'T12:00:00').toLocaleDateString('es-MX', {day:'2-digit',month:'short'}) : '—';
    return `<tr>
      <td style="font-size:12px;opacity:.6">${fecha}</td>
      <td>${nombre}</td>
      <td style="font-size:12px;opacity:.6">${p.concepto || '—'}</td>
      <td style="color:var(--gold);font-weight:500">$${parseFloat(p.total).toLocaleString()}</td>
    </tr>`;
  }).join('');
}