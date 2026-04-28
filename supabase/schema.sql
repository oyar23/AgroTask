-- ============================================================================
-- AgroTasks · schema.sql
-- ============================================================================
-- Estructura de la base de datos: tablas, tipos, triggers e índices.
-- Aplicar ESTE archivo ANTES que policies.sql.
-- ============================================================================

-- pgcrypto provee gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TABLAS
-- ============================================================================

-- profiles
-- Un perfil por usuario de auth.users. Se crea SIN la FK a campos porque
-- existe una dependencia circular: profiles.campo_id -> campos.id y
-- campos.jefe_id -> profiles.id. La FK se agrega más abajo con ALTER TABLE.
CREATE TABLE profiles (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre      text NOT NULL,
    rol         text NOT NULL CHECK (rol IN ('jefe', 'empleado')),
    campo_id    uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- campos
-- Cada campo lo administra un único jefe (jefe_id). El código corto es
-- el que el jefe comparte con sus empleados al registrarse.
CREATE TABLE campos (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      text NOT NULL,
    codigo      text NOT NULL UNIQUE CHECK (length(codigo) BETWEEN 4 AND 12),
    jefe_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Cierre de la dependencia circular profiles <-> campos.
-- ON DELETE SET NULL: si el jefe elimina un campo, los profiles que lo tenían
-- quedan "huérfanos" y la app puede pedirles reingresar el código.
ALTER TABLE profiles
    ADD CONSTRAINT profiles_campo_id_fkey
    FOREIGN KEY (campo_id) REFERENCES campos(id) ON DELETE SET NULL;

-- tareas
-- ON DELETE CASCADE en campo_id: si se borra el campo, sus tareas también.
-- ON DELETE RESTRICT en empleado_id y creada_por: no se permite borrar un
-- profile si tiene tareas asociadas (se preserva el historial/auditoría).
CREATE TABLE tareas (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo          text NOT NULL,
    descripcion     text,
    campo_id        uuid NOT NULL REFERENCES campos(id) ON DELETE CASCADE,
    empleado_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    creada_por      uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    estado          text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_curso', 'hecha', 'cancelada')),
    fecha_limite    timestamptz,
    completada_en   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- fotos
CREATE TABLE fotos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tarea_id        uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
    subida_por      uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    storage_path    text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- comentarios
CREATE TABLE comentarios (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tarea_id    uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
    autor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    mensaje     text NOT NULL CHECK (length(mensaje) > 0),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- updated_at automático en cada UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tareas_updated_at
    BEFORE UPDATE ON tareas
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- completada_en: se setea cuando estado pasa a 'hecha', se limpia si vuelve
-- a otro estado. Se ejecuta en INSERT y UPDATE para cubrir ambos casos.
CREATE OR REPLACE FUNCTION public.set_completada_en()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.estado = 'hecha' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'hecha') THEN
        NEW.completada_en := now();
    ELSIF NEW.estado <> 'hecha' THEN
        NEW.completada_en := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tareas_completada_en
    BEFORE INSERT OR UPDATE ON tareas
    FOR EACH ROW EXECUTE FUNCTION public.set_completada_en();

-- Invariante de negocio: empleado.campo_id = tarea.campo_id.
-- Esto NO se puede expresar con un CHECK constraint porque cruza tablas.
-- Corre en INSERT y en UPDATE de las columnas relevantes.
CREATE OR REPLACE FUNCTION public.validar_empleado_pertenece_al_campo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_campo_empleado uuid;
BEGIN
    SELECT campo_id INTO v_campo_empleado FROM profiles WHERE id = NEW.empleado_id;
    IF v_campo_empleado IS DISTINCT FROM NEW.campo_id THEN
        RAISE EXCEPTION 'El empleado % no pertenece al campo %', NEW.empleado_id, NEW.campo_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tareas_validar_empleado
    BEFORE INSERT OR UPDATE OF empleado_id, campo_id ON tareas
    FOR EACH ROW EXECUTE FUNCTION public.validar_empleado_pertenece_al_campo();

-- Bloquea el cambio de rol vía UPDATE.
-- Las RLS dejan al user actualizar su propio profile, pero sin este trigger
-- un empleado podría auto-promoverse a jefe. El cambio de rol queda como
-- operación administrativa: hay que desactivar el trigger en una sesión
-- privilegiada (ALTER TABLE ... DISABLE TRIGGER) o usar una función con
-- SECURITY DEFINER específica.
CREATE OR REPLACE FUNCTION public.bloquear_cambio_de_rol()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.rol IS DISTINCT FROM NEW.rol THEN
        RAISE EXCEPTION 'No se permite cambiar el rol del profile vía UPDATE'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_bloquear_cambio_rol
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambio_de_rol();

-- Si quien actualiza la tarea es el empleado asignado (y NO el jefe del campo),
-- solo puede modificar 'estado'. Se complementa con la policy tareas_update,
-- que define QUIÉN puede tocar la fila. Esto define QUÉ columnas puede tocar.
CREATE OR REPLACE FUNCTION public.restringir_update_empleado_solo_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_jefe uuid;
BEGIN
    SELECT jefe_id INTO v_jefe FROM campos WHERE id = OLD.campo_id;

    -- Si es el jefe del campo, no aplica restricción.
    IF auth.uid() = v_jefe THEN
        RETURN NEW;
    END IF;

    -- Si es el empleado asignado, solo puede tocar 'estado' (y los timestamps
    -- automáticos, que se manejan en otros triggers).
    IF auth.uid() = OLD.empleado_id THEN
        IF NEW.titulo       IS DISTINCT FROM OLD.titulo
           OR NEW.descripcion IS DISTINCT FROM OLD.descripcion
           OR NEW.campo_id    IS DISTINCT FROM OLD.campo_id
           OR NEW.empleado_id IS DISTINCT FROM OLD.empleado_id
           OR NEW.creada_por  IS DISTINCT FROM OLD.creada_por
           OR NEW.fecha_limite IS DISTINCT FROM OLD.fecha_limite
           OR NEW.created_at  IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'El empleado solo puede modificar la columna estado de sus tareas'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tareas_restringir_update_empleado
    BEFORE UPDATE ON tareas
    FOR EACH ROW EXECUTE FUNCTION public.restringir_update_empleado_solo_estado();

-- ============================================================================
-- ÍNDICES
-- ============================================================================

-- Índices en todas las foreign keys (Postgres no los crea automáticamente).
CREATE INDEX idx_profiles_campo_id      ON profiles(campo_id);
CREATE INDEX idx_campos_jefe_id         ON campos(jefe_id);
CREATE INDEX idx_tareas_campo_id        ON tareas(campo_id);
CREATE INDEX idx_tareas_empleado_id     ON tareas(empleado_id);
CREATE INDEX idx_tareas_creada_por      ON tareas(creada_por);
CREATE INDEX idx_fotos_tarea_id         ON fotos(tarea_id);
CREATE INDEX idx_fotos_subida_por       ON fotos(subida_por);
CREATE INDEX idx_comentarios_tarea_id   ON comentarios(tarea_id);
CREATE INDEX idx_comentarios_autor_id   ON comentarios(autor_id);

-- Compuestos: queries típicas de la app.
-- (empleado_id, estado): "mis tareas pendientes/en curso" del empleado.
-- (campo_id, estado): dashboard del jefe agrupado por estado.
CREATE INDEX idx_tareas_empleado_estado ON tareas(empleado_id, estado);
CREATE INDEX idx_tareas_campo_estado    ON tareas(campo_id, estado);
