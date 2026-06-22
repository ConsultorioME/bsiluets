// ─────────────────────────────────────────
//  B·Siluets — Conexión Supabase
//  Software SIE © 2025
// ─────────────────────────────────────────

const SUPABASE_URL = 'https://gkgquismlqenimxejctr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrZ3F1aXNtbHFlbmlteGVqY3RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODM1NjAsImV4cCI6MjA5NjE1OTU2MH0.IHMI92Db0_JkMAKUwUZqQn0TTOGUPyvkU88k2ipE4HQ';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── SWITCH DE LICENCIA (activar cuando esté listo el SIE) ───
async function verificarLicencia() {
  return true; // modo desarrollo
}

function mostrarSuspendido(mensaje) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0F0F0F;font-family:'Jost',sans-serif;text-align:center;padding:40px">
      <div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:32px;color:#C9A86C;margin-bottom:16px">B·Siluets</div>
        <div style="font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#888;margin-bottom:32px">Sistema suspendido</div>
        <div style="font-size:15px;color:#FAF7F2;opacity:.6;line-height:1.8;max-width:360px;margin:0 auto">${mensaje}</div>
        <div style="margin-top:32px;font-size:12px;color:#C9A86C;opacity:.5">Software SIE · Tepic, Nayarit</div>
      </div>
    </div>`;
}