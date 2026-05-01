// ============================================================================
// AgroTasks · Edge Function notify-tarea
// ============================================================================
// Recibe { tarea_id } del trigger AFTER INSERT en `tareas` (ver schema-push.sql).
// Levanta el push_token del empleado asignado y manda un push via Expo Push API.
//
// Deno runtime (Supabase Edge Functions). NO se puede importar nada de los
// helpers JS del proyecto: cada Edge Function es su propio bundle.
//
// Deploy:
//   supabase functions deploy notify-tarea --no-verify-jwt
//
// El --no-verify-jwt es porque el trigger pasa el service role key como
// Authorization header. La policy de invocación la chequeamos manualmente
// dentro de la función comparando el token recibido con el que esperamos.
// ============================================================================

// Estos imports usan la convención de Deno (URL imports). El bundler de
// Supabase los descarga en el deploy.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RequestBody {
  tarea_id: string;
}

interface PushToken {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

interface Tarea {
  id: string;
  titulo: string;
  empleado_id: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Cliente con service role: saltea RLS para leer cualquier push_token.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!body.tarea_id) {
    return new Response('tarea_id requerido', { status: 400 });
  }

  // 1. Levantar la tarea (necesitamos el empleado_id y el título).
  const { data: tareaData, error: tareaErr } = await admin
    .from('tareas')
    .select('id, titulo, empleado_id')
    .eq('id', body.tarea_id)
    .maybeSingle();

  if (tareaErr || !tareaData) {
    return new Response(`Tarea no encontrada: ${tareaErr?.message ?? ''}`, {
      status: 404,
    });
  }

  const tarea = tareaData as Tarea;

  // 2. Levantar los tokens del empleado.
  const { data: tokensData, error: tokensErr } = await admin
    .from('push_tokens')
    .select('token, platform')
    .eq('user_id', tarea.empleado_id);

  if (tokensErr) {
    return new Response(`Error leyendo tokens: ${tokensErr.message}`, {
      status: 500,
    });
  }

  const tokens = (tokensData as PushToken[] | null) ?? [];
  if (tokens.length === 0) {
    // Empleado sin token registrado: no es error, solo no enviamos.
    return new Response(JSON.stringify({ enviado: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Construir mensajes para Expo Push API.
  // Spec: https://docs.expo.dev/push-notifications/sending-notifications/
  const messages = tokens.map((t) => ({
    to: t.token,
    title: 'Nueva tarea',
    body: tarea.titulo,
    data: { tarea_id: tarea.id },
    sound: 'default',
    priority: 'high',
  }));

  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(messages),
  });

  if (!expoRes.ok) {
    const text = await expoRes.text();
    return new Response(`Expo Push API error: ${text}`, { status: 502 });
  }

  return new Response(
    JSON.stringify({ enviado: tokens.length }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
