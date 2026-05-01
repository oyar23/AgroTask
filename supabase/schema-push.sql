-- ============================================================================
-- AgroTasks · schema-push.sql
-- ============================================================================
-- Tabla `push_tokens` y trigger que dispara la Edge Function `notify-tarea`
-- después de un INSERT en `tareas`.
--
-- Aplicar DESPUÉS de schema.sql + policies.sql + policies-storage.sql, y
-- DESPUÉS de desplegar la Edge Function (ver supabase/edge-functions/notify-tarea).
-- ============================================================================

-- ============================================================================
-- TABLA push_tokens
-- ============================================================================
-- Un usuario puede tener varios tokens (varios dispositivos: teléfono,
-- tablet). El UNIQUE garantiza que un mismo token no se duplica si el
-- cliente registra dos veces.
CREATE TABLE IF NOT EXISTS push_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token       text NOT NULL UNIQUE,
    platform    text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

-- ============================================================================
-- RLS de push_tokens
-- ============================================================================
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens FORCE  ROW LEVEL SECURITY;

-- Cada user puede leer/insertar/borrar sus propios tokens. Nadie ve los
-- tokens de otros (un token expuesto permitiría a un atacante mandarle
-- pushes spoof al dueño).
CREATE POLICY push_tokens_select ON push_tokens
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY push_tokens_insert ON push_tokens
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY push_tokens_delete ON push_tokens
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- TRIGGER · notificar al empleado cuando se crea una tarea
-- ============================================================================
-- Llama a la Edge Function `notify-tarea` con el id de la tarea recién creada.
-- La función levanta el token del empleado y manda el push vía Expo Push API.
--
-- Requiere la extensión `pg_net` habilitada en Supabase (en el dashboard,
-- Database → Extensions → pg_net → Enable). Sin pg_net, el trigger no puede
-- hacer HTTP requests desde Postgres.
--
-- También requiere las variables `app.supabase_url` y `app.service_role_key`
-- definidas en la base. Set:
--
--   ALTER DATABASE postgres SET app.supabase_url = 'https://xxxx.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = 'eyJ...';
--
-- (El service role key se usa para que la Edge Function pueda saltear RLS
-- al levantar el push_token del empleado.)

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notificar_nueva_tarea()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url     text;
    v_key     text;
BEGIN
    SELECT current_setting('app.supabase_url', true)      INTO v_url;
    SELECT current_setting('app.service_role_key', true)  INTO v_key;

    IF v_url IS NULL OR v_key IS NULL THEN
        -- Sin la config, no fallamos el INSERT de la tarea.
        RAISE NOTICE 'app.supabase_url o app.service_role_key no configurados; no se envió push';
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url     := v_url || '/functions/v1/notify-tarea',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body    := jsonb_build_object('tarea_id', NEW.id)
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tareas_notificar_nueva
    AFTER INSERT ON tareas
    FOR EACH ROW EXECUTE FUNCTION public.notificar_nueva_tarea();
