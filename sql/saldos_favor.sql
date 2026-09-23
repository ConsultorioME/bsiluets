-- ─────────────────────────────────────────
--  B·Siluets — Saldo a favor de pacientes
--  Ejecutar UNA vez en Supabase → SQL Editor.
--
--  Cada fila es un MOVIMIENTO; el saldo NO se guarda, se calcula:
--    saldo = SUM(deposito) - SUM(aplicacion) - SUM(devolucion)
--  (solo filas con eliminado = false).
--
--  deposito   → el paciente deja dinero (excedente de un cobro o anticipo).
--               Es dinero que SÍ entra a caja ese día (metodo_pago real).
--  aplicacion → se usa el saldo para pagar un cobro (pago_id). NO es
--               dinero nuevo: Caja no lo cuenta como ingreso.
--  devolucion → se le regresa el dinero al paciente (sale de caja).
-- ─────────────────────────────────────────

create table if not exists public.saldos_favor (
  id             uuid primary key default gen_random_uuid(),
  paciente_id    uuid not null references public.pacientes(id),
  tipo           text not null check (tipo in ('deposito', 'aplicacion', 'devolucion')),
  monto          numeric(12,2) not null check (monto > 0),
  metodo_pago    text,
  pago_id        uuid references public.pagos(id),
  fecha          date not null default current_date,
  referencia     text,
  registrado_por text,
  eliminado      boolean not null default false,
  eliminado_por  text,
  eliminado_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists saldos_favor_paciente_idx on public.saldos_favor (paciente_id) where eliminado = false;
create index if not exists saldos_favor_fecha_idx    on public.saldos_favor (fecha)       where eliminado = false;
create index if not exists saldos_favor_pago_idx     on public.saldos_favor (pago_id);

-- Mismo acceso que el resto de las tablas del sistema (la app usa la anon key).
grant select, insert, update, delete on public.saldos_favor to anon, authenticated;
alter table public.saldos_favor enable row level security;
drop policy if exists "saldos_favor_acceso_app" on public.saldos_favor;
create policy "saldos_favor_acceso_app" on public.saldos_favor
  for all using (true) with check (true);

-- Sincronización en tiempo real entre computadoras (js/supabase.js).
alter publication supabase_realtime add table public.saldos_favor;
