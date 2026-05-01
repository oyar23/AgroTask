-- ============================================================================
-- AgroTasks · policies.sql
-- ============================================================================
-- Habilita RLS y define las policies. Aplicar DESPUÉS de schema.sql.
-- ============================================================================

-- ============================================================================
-- HELPERS · funciones SECURITY DEFINER que bypasean RLS
-- ============================================================================
-- Por qué: una policy en `profiles` que dependa del campo_id del usuario actual
-- necesitaría leer profiles, lo que volvería a disparar la policy de SELECT y
-- causaría recursión infinita. Estas funciones corren con los permisos del
-- owner (no del caller) y por lo tanto saltean RLS, rompiendo el ciclo.
--
-- - STABLE: el planner puede cachear el resultado dentro de la query.
-- - SET search_path: previene ataques de search_path hijacking, regla de oro
--   para CUALQUIER función SECURITY DEFINER.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_campo_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT campo_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT rol FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.es_jefe_del_campo(p_campo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM campos
        WHERE id = p_campo_id AND jefe_id = auth.uid()
    )
$$;

-- ============================================================================
-- HABILITAR RLS
-- ============================================================================
-- ENABLE: aplica RLS a usuarios normales.
-- FORCE:  aplica RLS también al owner del schema. Sin FORCE, cuando uno se
--         conecta como owner desde la consola las policies parecen no estar
--         funcionando, lo que confunde mucho al testear.
-- ============================================================================

ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles    FORCE  ROW LEVEL SECURITY;
ALTER TABLE campos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campos      FORCE  ROW LEVEL SECURITY;
ALTER TABLE tareas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas      FORCE  ROW LEVEL SECURITY;
ALTER TABLE fotos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos       FORCE  ROW LEVEL SECURITY;
ALTER TABLE comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE comentarios FORCE  ROW LEVEL SECURITY;

-- ============================================================================
-- profiles
-- ============================================================================

-- profiles_select cubre tres casos. Los tres son necesarios:
--
--   1. id = auth.uid()
--      Siempre podés leer tu propio profile. Es el caso base que permite
--      que un usuario recién registrado se "vea" antes de tener campo
--      asignado.
--
--   2. campo_id IS NOT NULL AND campo_id = current_user_campo_id()
--      Profiles del mismo campo. Sirve para empleado→jefe y empleado→
--      empleado. Falla cuando el caller tiene campo_id NULL: la función
--      devuelve NULL y la igualdad nunca matchea.
--
--   3. campo_id IN (SELECT id FROM campos WHERE jefe_id = auth.uid())
--      Caso jefe→empleados. Un jefe puede tener su propio profile.campo_id
--      en NULL (es común al recién crear el campo, o si nunca se autoasignó),
--      por lo que el caso 2 no le sirve. Esta cláusula matchea a quienes
--      están en CUALQUIER campo donde el caller figura como jefe_id, sin
--      depender de su propio campo_id.
--
-- El bug original: faltaba el caso 3, así que un jefe con campo_id NULL
-- no podía ver a sus propios empleados (la consulta devolvía 0 filas en
-- vez de la lista). Detectado durante el testeo de Fase 1.
CREATE POLICY profiles_select ON profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR (
            campo_id IS NOT NULL
            AND campo_id = public.current_user_campo_id()
        )
        OR campo_id IN (
            SELECT id FROM campos WHERE jefe_id = auth.uid()
        )
    );

-- Un user puede insertar SU propio profile (típicamente justo después del
-- signup). Esto NO valida el rol ni el campo_id; eso es responsabilidad del
-- cliente al armar el INSERT.
CREATE POLICY profiles_insert ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

-- Un user puede actualizar SU propio profile. El cambio de la columna `rol`
-- está bloqueado por trigger (ver schema.sql) para evitar auto-promoción.
CREATE POLICY profiles_update ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- DELETE: sin policy permisiva = bloqueado para todos los usuarios.
-- El borrado real de un profile ocurre en cascada cuando se borra auth.users.

-- ============================================================================
-- campos
-- ============================================================================

-- Un user ve el campo donde es miembro (profiles.campo_id) o donde figura
-- como jefe.
CREATE POLICY campos_select ON campos
    FOR SELECT TO authenticated
    USING (
        id = public.current_user_campo_id()
        OR jefe_id = auth.uid()
    );

-- Solo usuarios con rol 'jefe' pueden crear campos, y se ponen a sí mismos
-- como jefe_id.
CREATE POLICY campos_insert ON campos
    FOR INSERT TO authenticated
    WITH CHECK (
        public.current_user_rol() = 'jefe'
        AND jefe_id = auth.uid()
    );

-- Solo el jefe del campo puede modificarlo.
CREATE POLICY campos_update ON campos
    FOR UPDATE TO authenticated
    USING (jefe_id = auth.uid())
    WITH CHECK (jefe_id = auth.uid());

-- Solo el jefe del campo puede borrarlo.
CREATE POLICY campos_delete ON campos
    FOR DELETE TO authenticated
    USING (jefe_id = auth.uid());

-- ============================================================================
-- tareas
-- ============================================================================

-- El empleado ve sus propias tareas; el jefe ve las tareas de cualquier campo
-- donde sea jefe.
CREATE POLICY tareas_select ON tareas
    FOR SELECT TO authenticated
    USING (
        empleado_id = auth.uid()
        OR public.es_jefe_del_campo(campo_id)
    );

-- Solo el jefe del campo puede crear tareas, y debe registrarse como
-- creada_por. La invariante "empleado pertenece al campo" la enforcea un
-- trigger en schema.sql, no esta policy.
CREATE POLICY tareas_insert ON tareas
    FOR INSERT TO authenticated
    WITH CHECK (
        public.es_jefe_del_campo(campo_id)
        AND creada_por = auth.uid()
    );

-- Pueden actualizar el jefe del campo o el empleado asignado. La restricción
-- "el empleado solo puede cambiar la columna estado" la enforcea un trigger
-- en schema.sql; aquí solo se decide QUIÉN puede actualizar la fila.
CREATE POLICY tareas_update ON tareas
    FOR UPDATE TO authenticated
    USING (
        public.es_jefe_del_campo(campo_id)
        OR empleado_id = auth.uid()
    )
    WITH CHECK (
        public.es_jefe_del_campo(campo_id)
        OR empleado_id = auth.uid()
    );

-- Solo el jefe del campo puede borrar tareas.
CREATE POLICY tareas_delete ON tareas
    FOR DELETE TO authenticated
    USING (public.es_jefe_del_campo(campo_id));

-- ============================================================================
-- fotos
-- ============================================================================

-- Cualquiera que pueda ver la tarea asociada puede ver sus fotos. Reusamos
-- la lógica de tareas_select via subquery EXISTS, así si esa lógica cambia
-- en el futuro, fotos hereda el cambio automáticamente.
CREATE POLICY fotos_select ON fotos
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tareas t
            WHERE t.id = fotos.tarea_id
              AND (t.empleado_id = auth.uid() OR public.es_jefe_del_campo(t.campo_id))
        )
    );

-- Empleado asignado o jefe del campo, y subida_por debe ser el caller.
CREATE POLICY fotos_insert ON fotos
    FOR INSERT TO authenticated
    WITH CHECK (
        subida_por = auth.uid()
        AND EXISTS (
            SELECT 1 FROM tareas t
            WHERE t.id = fotos.tarea_id
              AND (t.empleado_id = auth.uid() OR public.es_jefe_del_campo(t.campo_id))
        )
    );

-- El que la subió, o el jefe del campo, pueden borrarla.
CREATE POLICY fotos_delete ON fotos
    FOR DELETE TO authenticated
    USING (
        subida_por = auth.uid()
        OR EXISTS (
            SELECT 1 FROM tareas t
            WHERE t.id = fotos.tarea_id
              AND public.es_jefe_del_campo(t.campo_id)
        )
    );

-- ============================================================================
-- comentarios
-- ============================================================================

-- Cualquiera que pueda ver la tarea asociada puede ver sus comentarios.
CREATE POLICY comentarios_select ON comentarios
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tareas t
            WHERE t.id = comentarios.tarea_id
              AND (t.empleado_id = auth.uid() OR public.es_jefe_del_campo(t.campo_id))
        )
    );

-- Empleado asignado o jefe del campo, y autor_id debe ser el caller.
CREATE POLICY comentarios_insert ON comentarios
    FOR INSERT TO authenticated
    WITH CHECK (
        autor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM tareas t
            WHERE t.id = comentarios.tarea_id
              AND (t.empleado_id = auth.uid() OR public.es_jefe_del_campo(t.campo_id))
        )
    );

-- Solo el autor puede editar su comentario.
CREATE POLICY comentarios_update ON comentarios
    FOR UPDATE TO authenticated
    USING (autor_id = auth.uid())
    WITH CHECK (autor_id = auth.uid());

-- Solo el autor puede borrar su comentario.
CREATE POLICY comentarios_delete ON comentarios
    FOR DELETE TO authenticated
    USING (autor_id = auth.uid());

-- ============================================================================
-- RPC · validación de código de campo en signup de empleados
-- ============================================================================
-- Por qué existe esta función:
--
-- En el flujo de registro, ANTES de crear el user en auth.users, la app
-- necesita validar que el `codigo` del campo que el empleado tipeó realmente
-- existe. Sin esto, podríamos crear un user huérfano si el código está mal.
--
-- El problema es que la policy `campos_select` exige
--     id = current_user_campo_id() OR jefe_id = auth.uid()
-- y un usuario que recién está por registrarse cumple ninguna:
--   - es anon (no tiene auth.uid()), o
--   - tiene auth pero no tiene profile aún, así que current_user_campo_id()
--     devuelve NULL y nunca es jefe_id de un campo.
--
-- En cualquiera de los dos casos, un SELECT sobre `campos` devuelve 0 filas
-- y la app no puede distinguir "código mal escrito" de "policy bloqueante".
--
-- Solución: una RPC SECURITY DEFINER que devuelve SOLO el id del campo
-- (no el nombre, ni el jefe, ni el resto de las filas), expuesta a anon y
-- authenticated. Es el mínimo dato necesario para que el cliente pueda
-- proceder con el INSERT en `profiles` con un campo_id válido.
--
-- Endurecimientos estándar de SECURITY DEFINER:
--   - SET search_path = public para evitar search_path hijacking.
--   - STABLE porque no muta estado.
--   - Sólo devuelve uuid; un atacante que enumere códigos solo obtiene
--     "existe / no existe" + el uuid, lo mismo que ya filtra el modelo
--     a cualquier empleado válido.
CREATE OR REPLACE FUNCTION public.buscar_campo_por_codigo(p_codigo text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM campos WHERE codigo = p_codigo
$$;

GRANT EXECUTE ON FUNCTION public.buscar_campo_por_codigo(text) TO anon, authenticated;

-- ============================================================================
-- TESTING · ejemplos didácticos (NO ejecutar en producción)
-- ============================================================================
-- En psql/SQL Editor de Supabase podés simular ser un usuario específico
-- usando los GUC que lee `auth.uid()`. Los siguientes bloques están
-- comentados a propósito; descomentalos uno por uno para probar.
--
-- ============================================================================
-- Setup de prueba (correr una vez con un user privilegiado, sin RLS):
-- ============================================================================
--
-- -- Insertá dos usuarios manualmente en auth.users desde el dashboard de
-- -- Supabase (Authentication > Users > Add user) y guardá los UUIDs.
-- -- Llamémosles JEFE_UUID y EMPLEADO_UUID.
--
-- INSERT INTO profiles (id, nombre, rol)
-- VALUES ('JEFE_UUID',     'Don Carlos', 'jefe');
--
-- INSERT INTO campos (nombre, codigo, jefe_id)
-- VALUES ('Estancia La Esperanza', 'ABC123', 'JEFE_UUID')
-- RETURNING id;  -- guardá este UUID como CAMPO_UUID
--
-- UPDATE profiles SET campo_id = 'CAMPO_UUID' WHERE id = 'JEFE_UUID';
--
-- INSERT INTO profiles (id, nombre, rol, campo_id)
-- VALUES ('EMPLEADO_UUID', 'Pedro',     'empleado', 'CAMPO_UUID');
--
-- ============================================================================
-- Test 1 · el empleado solo ve sus propias tareas
-- ============================================================================
--
-- BEGIN;
--   SET LOCAL role = 'authenticated';
--   SET LOCAL "request.jwt.claim.sub" = 'EMPLEADO_UUID';
--   SELECT id, titulo, estado FROM tareas;  -- debe devolver solo las suyas
-- ROLLBACK;
--
-- ============================================================================
-- Test 2 · un empleado NO puede crear un campo
-- ============================================================================
--
-- BEGIN;
--   SET LOCAL role = 'authenticated';
--   SET LOCAL "request.jwt.claim.sub" = 'EMPLEADO_UUID';
--   INSERT INTO campos (nombre, codigo, jefe_id)
--   VALUES ('Campo Trucho', 'XYZ999', 'EMPLEADO_UUID');
--   -- esperado: ERROR new row violates row-level security policy
-- ROLLBACK;
--
-- ============================================================================
-- Test 3 · un empleado NO puede auto-promoverse a jefe
-- ============================================================================
--
-- BEGIN;
--   SET LOCAL role = 'authenticated';
--   SET LOCAL "request.jwt.claim.sub" = 'EMPLEADO_UUID';
--   UPDATE profiles SET rol = 'jefe' WHERE id = 'EMPLEADO_UUID';
--   -- esperado: ERROR No se permite cambiar el rol del profile vía UPDATE
-- ROLLBACK;
--
-- ============================================================================
-- Test 4 · un empleado solo puede tocar 'estado' de sus tareas
-- ============================================================================
--
-- BEGIN;
--   SET LOCAL role = 'authenticated';
--   SET LOCAL "request.jwt.claim.sub" = 'EMPLEADO_UUID';
--   UPDATE tareas SET titulo = 'hackeo' WHERE empleado_id = 'EMPLEADO_UUID';
--   -- esperado: ERROR El empleado solo puede modificar la columna estado
--   UPDATE tareas SET estado = 'hecha' WHERE empleado_id = 'EMPLEADO_UUID';
--   -- esperado: OK, completada_en se setea automáticamente
-- ROLLBACK;
--
-- ============================================================================
-- Test 5 · un jefe NO puede crear tarea para empleado de otro campo
-- ============================================================================
--
-- BEGIN;
--   SET LOCAL role = 'authenticated';
--   SET LOCAL "request.jwt.claim.sub" = 'JEFE_UUID';
--   INSERT INTO tareas (titulo, campo_id, empleado_id, creada_por)
--   VALUES ('test', 'CAMPO_UUID', 'UUID_EMPLEADO_DE_OTRO_CAMPO', 'JEFE_UUID');
--   -- esperado: ERROR El empleado X no pertenece al campo Y
-- ROLLBACK;
