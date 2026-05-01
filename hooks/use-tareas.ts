import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import type { EstadoTarea, Tarea, TareaConEmpleado } from '@/types/database';

// Filtros de la lista. `null` significa "sin filtro".
export type FiltrosTareas = {
  estado: EstadoTarea | null;
  empleadoId: string | null;
};

const FILTROS_VACIOS: FiltrosTareas = { estado: null, empleadoId: null };

// Lista de tareas. RLS filtra automáticamente:
// - jefe: ve tareas de los campos donde es jefe.
// - empleado: ve solo sus propias tareas (`empleado_id = auth.uid()`).
// Si el caller pasa `campoId`, también limitamos por ese campo en cliente
// (útil cuando el jefe tiene más de un campo en el futuro; hoy es no-op).
export function useTareas(
  campoId: string | null = null,
  filtros: FiltrosTareas = FILTROS_VACIOS,
) {
  const [tareas, setTareas] = useState<TareaConEmpleado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('tareas')
        .select(
          'id, titulo, descripcion, campo_id, empleado_id, creada_por, estado, fecha_limite, completada_en, created_at, updated_at, empleado:profiles!tareas_empleado_id_fkey(nombre)',
        )
        .order('created_at', { ascending: false });

      if (campoId) q = q.eq('campo_id', campoId);
      if (filtros.estado) q = q.eq('estado', filtros.estado);
      if (filtros.empleadoId) q = q.eq('empleado_id', filtros.empleadoId);

      const { data, error: err } = await q;
      if (err) throw err;
      // Supabase infiere el join como array porque no sabe que la FK es 1:1.
      // Pasamos por `unknown` para reformar el tipo a la forma efectiva.
      setTareas((data as unknown as TareaConEmpleado[] | null) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar las tareas');
    } finally {
      setLoading(false);
    }
  }, [campoId, filtros.estado, filtros.empleadoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { tareas, loading, error, refresh: cargar };
}

// Detalle de una tarea. El SELECT está limitado por RLS, así que si el
// caller no tiene acceso, devuelve `null` sin error explícito.
export function useTarea(id: string | null) {
  const [tarea, setTarea] = useState<TareaConEmpleado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!id) {
      setTarea(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('tareas')
        .select(
          'id, titulo, descripcion, campo_id, empleado_id, creada_por, estado, fecha_limite, completada_en, created_at, updated_at, empleado:profiles!tareas_empleado_id_fkey(nombre)',
        )
        .eq('id', id)
        .maybeSingle();
      if (err) throw err;
      setTarea((data as unknown as TareaConEmpleado | null) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar la tarea');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { tarea, loading, error, refresh: cargar };
}

// Mutaciones. Devuelven `{ ok, error }` para que las pantallas decidan UX.
// Mensajes de error en español para mostrar al usuario.

type CrearTareaInput = {
  titulo: string;
  descripcion: string | null;
  campo_id: string;
  empleado_id: string;
  fecha_limite: string | null;
};

export async function crearTarea(
  input: CrearTareaInput,
): Promise<{ ok: true; tarea: Tarea } | { ok: false; error: string }> {
  const userId = useAuthStore.getState().session?.user.id;
  if (!userId) return { ok: false, error: 'No hay sesión activa' };

  const { data, error } = await supabase
    .from('tareas')
    .insert({
      titulo: input.titulo,
      descripcion: input.descripcion,
      campo_id: input.campo_id,
      empleado_id: input.empleado_id,
      creada_por: userId,
      fecha_limite: input.fecha_limite,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: mapErrorTarea(error.message) };
  return { ok: true, tarea: data as Tarea };
}

type ActualizarTareaInput = Partial<{
  titulo: string;
  descripcion: string | null;
  empleado_id: string;
  fecha_limite: string | null;
  estado: EstadoTarea;
}>;

export async function actualizarTarea(
  id: string,
  input: ActualizarTareaInput,
): Promise<{ ok: true; tarea: Tarea } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('tareas')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return { ok: false, error: mapErrorTarea(error.message) };
  return { ok: true, tarea: data as Tarea };
}

export async function eliminarTarea(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('tareas').delete().eq('id', id);
  if (error) return { ok: false, error: mapErrorTarea(error.message) };
  return { ok: true };
}

function mapErrorTarea(raw: string): string {
  // Triggers y RLS devuelven mensajes en español o errores de Postgres.
  // Casos comunes que el usuario podría provocar:
  if (raw.includes('no pertenece al campo')) {
    return 'El empleado seleccionado no pertenece al campo';
  }
  if (raw.includes('row-level security') || raw.includes('policy')) {
    return 'No tenés permiso para esta acción';
  }
  if (raw.includes('solo puede modificar la columna estado')) {
    return 'Solo el jefe puede modificar este dato';
  }
  return 'Hubo un problema, intentá de nuevo';
}
