-- ============================================================================
-- AgroTasks · policies-storage.sql
-- ============================================================================
-- ⚠️  ESTE ARCHIVO NO SE EJECUTA EN EL SQL EDITOR.
--
-- En Supabase Cloud, la tabla `storage.objects` es propiedad de
-- `supabase_storage_admin`, no de `postgres`. Por eso `CREATE POLICY`
-- directo desde el SQL Editor falla con:
--
--     ERROR: 42501: must be owner of table objects
--
-- Las policies de storage se crean desde el dashboard:
--
--     Storage → seleccionar bucket "fotos" → tab "Policies" → New policy
--
-- Las instrucciones paso a paso (nombre, operación, expresión exacta para
-- copiar y pegar en el form) están en `docs/05-fotos.md`, sección "Setup
-- de policies de storage en el dashboard".
--
-- Este archivo queda como **referencia escrita** del intent de cada policy:
-- si algún día Supabase abilita ALTER sobre storage.objects desde el SQL
-- Editor, sirve para aplicar todo de un saque. También sirve como spec si
-- vamos a self-host o a CLI (`supabase migrations`) más adelante.
-- ============================================================================

-- ============================================================================
-- INTENT (no ejecutable acá)
-- ============================================================================

-- Asume que `storage.objects` ya tiene RLS habilitado (Supabase lo hace por
-- default).
--
-- Las helper `public.es_jefe_del_campo(...)` y `auth.uid()` funcionan
-- igual desde una policy de storage que desde una policy de tabla.
-- `(storage.foldername(name))[1]` extrae el primer segmento del path
-- (`tarea_id`) — es el equivalente UI-friendly a
-- `split_part(name, '/', 1)`.

/*
CREATE POLICY fotos_storage_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'fotos'
        AND owner = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.tareas t
            WHERE t.id::text = (storage.foldername(name))[1]
              AND (
                  t.empleado_id = auth.uid()
                  OR public.es_jefe_del_campo(t.campo_id)
              )
        )
    );

CREATE POLICY fotos_storage_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'fotos'
        AND EXISTS (
            SELECT 1 FROM public.tareas t
            WHERE t.id::text = (storage.foldername(name))[1]
              AND (
                  t.empleado_id = auth.uid()
                  OR public.es_jefe_del_campo(t.campo_id)
              )
        )
    );

CREATE POLICY fotos_storage_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'fotos'
        AND (
            owner = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.tareas t
                WHERE t.id::text = (storage.foldername(name))[1]
                  AND public.es_jefe_del_campo(t.campo_id)
            )
        )
    );
*/

-- UPDATE: sin policy permisiva = bloqueado. No tiene sentido "actualizar"
-- una foto en el MVP; si querés cambiarla, borrás y subís de nuevo.
