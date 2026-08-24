// ─────────────────────────────────────────
//  B·Siluets — Service Worker mínimo
//  Solo habilita "Agregar a pantalla de inicio" en Android/Chrome.
//  No cachea nada: cada carga siempre pide datos frescos a Supabase.
//  Software SIE © 2025
// ─────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
