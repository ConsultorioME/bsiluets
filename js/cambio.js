// ─────────────────────────────────────────
//  B·Siluets — Calculadora de cambio (cobros en efectivo)
//  Software SIE © 2025
// ─────────────────────────────────────────
//  Ayuda a recepción a saber cuánto cambio entregar cuando el paciente paga
//  en efectivo (cobro $1,850, entrega $2,000 → cambio $150). Es SOLO de
//  apoyo: lo que se guarda y lo que cuenta Caja sigue siendo el monto
//  cobrado, nunca lo recibido. "Recibido" y "Cambio" solo se imprimen en la
//  nota; no se guardan en la base de datos.
//
//  Uso en cada formulario de cobro:
//    HTML:  <div id="cambio-xxx" style="display:none"></div>
//    actualizarCambio('cambio-xxx', montoEnEfectivo, alCambiarOpcional)
//    filaCambioNota('cambio-xxx')  → filas para la nota impresa
//    limpiarCambio('cambio-xxx')   → al abrir / reiniciar el formulario

// Funciones a llamar cuando se teclea "Recibido" (p. ej. refrescar la vista
// previa de la nota de visita), por id de recuadro.
const _cambioAlCambiar = {};

function formatoCambio(n) {
  return '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Muestra el recuadro si hay monto en efectivo y lo oculta si no.
function actualizarCambio(boxId, efectivo, alCambiar) {
  const box = document.getElementById(boxId);
  if (!box) return;
  if (alCambiar) _cambioAlCambiar[boxId] = alCambiar;

  efectivo = Math.round((parseFloat(efectivo) || 0) * 100) / 100;
  box.dataset.efectivo = efectivo;
  if (efectivo <= 0) { box.style.display = 'none'; return; }

  // Se pinta una sola vez para no borrar lo que ya se tecleó en "Recibido".
  if (!box.dataset.listo) {
    box.innerHTML = `
      <div style="background:rgba(39,174,96,.06);border:1px solid rgba(39,174,96,.28);padding:10px 12px;margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--cream);opacity:.8;margin-bottom:8px">
          <span>💵 Cobro en efectivo</span><span class="cambio-efectivo" style="font-weight:600"></span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:12px;color:var(--cream);opacity:.8">Recibido del paciente</span>
          <input type="number" class="cambio-recibido" placeholder="$0.00" step="0.01" min="0" oninput="pintarCambio('${boxId}', true)"
            style="width:130px;background:var(--dark);border:1px solid rgba(39,174,96,.4);padding:7px 10px;font-size:14px;color:var(--cream);outline:none;text-align:right">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(39,174,96,.2);padding-top:8px">
          <span class="cambio-etiqueta" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;color:var(--cream);opacity:.7">Cambio a entregar</span>
          <span class="cambio-resultado" style="font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:600;color:var(--cream);opacity:.5">—</span>
        </div>
        <div style="font-size:10px;color:var(--cream);opacity:.4;margin-top:6px">Solo es ayuda para dar el cambio: no modifica el monto cobrado.</div>
      </div>`;
    box.dataset.listo = '1';
  }
  box.style.display = '';
  pintarCambio(boxId);
}

function pintarCambio(boxId, desdeRecibido) {
  const box = document.getElementById(boxId);
  if (!box || !box.dataset.listo) return;
  const efectivo = parseFloat(box.dataset.efectivo) || 0;
  const recibido = parseFloat(box.querySelector('.cambio-recibido').value) || 0;
  const etiqueta = box.querySelector('.cambio-etiqueta');
  const res      = box.querySelector('.cambio-resultado');

  box.querySelector('.cambio-efectivo').textContent = formatoCambio(efectivo);

  if (recibido <= 0) {
    etiqueta.textContent = 'Cambio a entregar';
    res.textContent = '—';
    res.style.color = 'var(--cream)'; res.style.opacity = '.5';
  } else if (recibido >= efectivo - 0.005) {
    etiqueta.textContent = 'Cambio a entregar';
    res.textContent = formatoCambio(recibido - efectivo);
    res.style.color = '#27AE60'; res.style.opacity = '1';
  } else {
    etiqueta.textContent = 'Faltan';
    res.textContent = formatoCambio(efectivo - recibido);
    res.style.color = '#e74c3c'; res.style.opacity = '1';
  }

  if (desdeRecibido && _cambioAlCambiar[boxId]) _cambioAlCambiar[boxId]();
}

// { recibido, cambio } solo si se capturó un "Recibido" que cubre el efectivo.
function datosCambio(boxId) {
  const box = document.getElementById(boxId);
  if (!box || !box.dataset.listo || box.style.display === 'none') return null;
  const efectivo = parseFloat(box.dataset.efectivo) || 0;
  const recibido = parseFloat(box.querySelector('.cambio-recibido').value) || 0;
  if (efectivo <= 0 || recibido < efectivo - 0.005) return null;
  return { recibido, cambio: Math.round((recibido - efectivo) * 100) / 100 };
}

function filaCambioNota(boxId) {
  const d = datosCambio(boxId);
  if (!d) return '';
  return `
    <div class="nota-row" style="font-size:12px"><span>Efectivo recibido</span><span>${formatoCambio(d.recibido)}</span></div>
    <div class="nota-row" style="font-size:12px"><span>Cambio entregado</span><span>${formatoCambio(d.cambio)}</span></div>`;
}

function limpiarCambio(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const inp = box.querySelector('.cambio-recibido');
  if (inp) inp.value = '';
  box.dataset.efectivo = 0;
  box.style.display = 'none';
}
