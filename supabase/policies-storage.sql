-- ============================================================================
-- AgroTasks · policies-storage.sql
-- ============================================================================
-- Habilita RLS sobre `storage.objects` para el bucket "fotos" y define las
-- policies. Aplicar DESPUÉS de schema.sql + policies.sql.
--
-- ANTES de ejecutar este archivo:
--   1. En el dashboard de Supabase → Storage, crear el bucket "fotos"
--      como **privado** (no marcar "public bucket"). Si ya existe, dejarlo.
--   2. NO subir nada todavía: las policies se aplican apenas existe el
--      bucket; sin ellas, los INSERTs van a fallar para usuarios normales.
--
-- Path convention de los archivos:
--   {tarea_id}/{foto_id}.jpg
--
-- - El primer segmento es el `tarea_id` (uuid), que usamos en las policies
--   para resolver permisos vía la tabla `tareas`.
-- - El segundo segmento es el `id` de la fila de `fotos` que el cliente
--   genera con gen_random_uuid() antes de insertar (para que el path y la
--   fila apunten al mismo archivo).
--
-- Las queries de policies extraen `tarea_id` con
-- `split_part(name, '/', 1)::uuid`. `name` es la columna de
-- `storage.objects` que guarda el path completo dentro del bucket.
-- ============================================================================

-- ============================================================================
-- HABILITAR RLS sobre storage.objects
-- ============================================================================
-- En Supabase Storage, el RLS sobre `storage.objects` ya viene habilitado
-- por default; lo dejamos explícito para no depender de eso.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- INSERT · subir una foto al bucket "fotos"
-- ============================================================================
-- Permite subir si:
--   - el bucket es "fotos",
--   - el caller es el "owner" del archivo (Supabase setea owner = auth.uid()
--     automáticamente en el upload),
--   - el primer segmento del path es un uuid existente en `tareas`,
--   - y el caller es el empleado asignado o el jefe del campo de esa tarea.
CREATE POLICY fotos_storage_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'fotos'
        AND owner = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.tareas t
            WHERE t.id::text = split_part(name, '/', 1)
              AND (
                  t.empleado_id = auth.uid()
                  OR public.es_jefe_del_campo(t.campo_id)
              )
        )
    );

-- ============================================================================
-- SELECT · ver una foto (para signed URL u operaciones internas)
-- ============================================================================
-- Refleja la lógica de `fotos_select` en policies.sql: cualquiera que pueda
-- ver la tarea, puede leer la foto.
CREATE POLICY fotos_storage_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'fotos'
        AND EXISTS (
            SELECT 1 FROM public.tareas t
            WHERE t.id::text = split_part(name, '/', 1)
              AND (
                  t.empleado_id = auth.uid()
                  OR public.es_jefe_del_campo(t.campo_id)
              )
        )
    );

-- ============================================================================
-- DELETE · borrar una foto
-- ============================================================================
-- Solo el que la subió (owner = auth.uid()) o el jefe del campo de la tarea.
CREATE POLICY fotos_storage_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'fotos'
        AND (
            owner = auth.uid()
            OR EXISTS (
                SELECT 1 FROM public.tareas t
                WHERE t.id::text = split_part(name, '/', 1)
                  AND public.es_jefe_del_campo(t.campo_id)
            )
        )
    );

-- ============================================================================
-- UPDATE · sin policy permisiva = bloqueado
-- ============================================================================
-- No tiene sentido "actualizar" una foto en el MVP: si querés cambiarla,
-- borrás y subís de nuevo. Sin policy de UPDATE permisiva, queda bloqueado.

-- ============================================================================
-- TESTING
-- ============================================================================
-- En el SQL Editor, simular ser un usuario:
--
-- BEGIN;
--   SET LOCAL role = 'authenticated';
--   SET LOCAL "request.jwt.claim.sub" = 'EMPLEADO_UUID';
--   -- Esto debería fallar si la tarea no es del empleado:
--   SELECT * FROM storage.objects
--   WHERE bucket_id = 'fotos'
--     AND name LIKE 'TAREA_AJENA_UUID/%';
--   -- Esperado: 0 filas
-- ROLLBACK;
--
-- Para testing real, mejor hacerlo desde la app: subir una foto,
-- intentar leerla con un user de otro campo, etc.
