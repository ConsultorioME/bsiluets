-- ─────────────────────────────────────────
--  B·Siluets — Confirmación de citas por WhatsApp (Fase 1)
--  Ejecutar UNA vez en Supabase → SQL Editor.
--
--  Flujo:
--    1. Recepción presiona "Enviar 📲" en la Agenda: se abre WhatsApp con
--       el mensaje y un enlace  confirmar.html?c=<confirmacion_token>.
--       Se guarda confirmacion_enviada_at.
--    2. El paciente abre el enlace (página pública, sin iniciar sesión) y
--       elige "Confirmo" o "Necesito reagendar". La página llama a las
--       funciones de abajo, que SOLO pueden tocar la cita de ese token.
--    3. "Confirmo" → estado = 'confirmada' automáticamente.
--       "Reagendar" → respuesta_paciente = 'reagendar' para que recepción
--       le llame (la cita no se mueve sola).
-- ─────────────────────────────────────────

alter table public.agenda
  add column if not exists confirmacion_token      uuid not null default gen_random_uuid(),
  add column if not exists confirmacion_enviada_at timestamptz,
  add column if not exists confirmacion_envios     integer not null default 0,
  add column if not exists confirmada_at           timestamptz,
  add column if not exists confirmada_por          text,   -- 'paciente' | 'recepcion'
  add column if not exists respuesta_paciente      text,   -- 'confirmada' | 'reagendar'
  add column if not exists respuesta_at            timestamptz;

create unique index if not exists agenda_confirmacion_token_idx on public.agenda (confirmacion_token);

-- ── Ver la cita desde el enlace (solo datos mínimos, nada más del sistema) ──
create or replace function public.cita_confirmacion_ver(p_token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'paciente',           p.nombre,
    'tratamiento',        t.nombre,
    'fecha',              a.fecha::text,
    'hora',               substring(a.hora::text from 1 for 5),
    'estado',             a.estado,
    'respuesta_paciente', a.respuesta_paciente,
    'vencida',            a.fecha < (now() at time zone 'America/Mazatlan')::date
  )
  from public.agenda a
  left join public.pacientes    p on p.id = a.paciente_id
  left join public.tratamientos t on t.id = a.tratamiento_id
  where a.confirmacion_token = p_token;
$$;

-- ── Respuesta del paciente: 'confirmada' o 'reagendar' ──
create or replace function public.cita_confirmacion_responder(p_token uuid, p_respuesta text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.agenda%rowtype;
begin
  if p_respuesta not in ('confirmada', 'reagendar') then
    return json_build_object('ok', false, 'motivo', 'respuesta_invalida');
  end if;

  select * into c from public.agenda where confirmacion_token = p_token for update;
  if not found then
    return json_build_object('ok', false, 'motivo', 'no_encontrada');
  end if;

  -- Citas ya pasadas, canceladas o atendidas no se pueden modificar desde el enlace.
  if c.estado not in ('pendiente', 'confirmada')
     or c.fecha < (now() at time zone 'America/Mazatlan')::date then
    return json_build_object('ok', false, 'motivo', 'no_disponible', 'estado', c.estado);
  end if;

  if p_respuesta = 'confirmada' then
    update public.agenda set
      estado             = 'confirmada',
      confirmada_at      = case when c.estado = 'confirmada' then coalesce(c.confirmada_at, now()) else now() end,
      confirmada_por     = case when c.estado = 'confirmada' then coalesce(c.confirmada_por, 'paciente') else 'paciente' end,
      respuesta_paciente = 'confirmada',
      respuesta_at       = now()
    where id = c.id;
  else
    -- Si ya estaba confirmada y ahora pide cambio, vuelve a Pendiente para
    -- que no se cuente como asistencia segura.
    update public.agenda set
      estado             = 'pendiente',
      confirmada_at      = null,
      confirmada_por     = null,
      respuesta_paciente = 'reagendar',
      respuesta_at       = now()
    where id = c.id;
  end if;

  return json_build_object('ok', true, 'respuesta', p_respuesta);
end;
$$;

grant execute on function public.cita_confirmacion_ver(uuid)             to anon, authenticated;
grant execute on function public.cita_confirmacion_responder(uuid, text) to anon, authenticated;
