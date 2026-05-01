import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { EstadoTarea, Profile } from '@/types/database';

// Métricas que muestra el dashboard. Se calculan en JS sobre el conjunto
// crudo de tareas. Para el volumen del MVP (cientos de tareas por jefe)
// alcanza; si pasa a miles, conviene una vista en Postgres.
export type DashboardData = {
  stats: {
    pendientes: number;
    enCurso: number;
    hechasHoy: number;
    hechasSemana: number;
  };
  porEmpleado: EmpleadoProgreso[];
  vencidas: VencidaListItem[];
};

export type EmpleadoProgreso = {
  id: string;
  nombre: string;
  total: number;
  hechas: number;
  porcentaje: number;
};

export type VencidaListItem = {
  id: string;
  titulo: string;
  empleadoNombre: string;
  fechaLimite: string;
  estado: EstadoTarea;
};

type TareaRaw = {
  id: string;
  titulo: string;
  empleado_id: string;
  estado: EstadoTarea;
  fecha_limite: string | null;
  completada_en: string | null;
  created_at: string;
  empleado: { nombre: string } | null;
};

const DATA_VACIA: DashboardData = {
  stats: { pendientes: 0, enCurso: 0, hechasHoy: 0, hechasSemana: 0 },
  porEmpleado: [],
  vencidas: [],
};

export function useDashboard(campoId: string | null) {
  const [data, setData] = useState<DashboardData>(DATA_VACIA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!campoId) {
      setData(DATA_VACIA);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Tareas + nombre del empleado embebido. RLS limita al jefe del campo.
      const { data: tareasRaw, error: errT } = await supabase
        .from('tareas')
        .select(
          'id, titulo, empleado_id, estado, fecha_limite, completada_en, created_at, empleado:profiles!tareas_empleado_id_fkey(nombre)',
        )
        .eq('campo_id', campoId);
      if (errT) throw errT;

      const tareas = (tareasRaw as unknown as TareaRaw[] | null) ?? [];

      // Empleados del campo (incluso los que no tienen tareas asignadas: deben
      // figurar en la lista de progreso con 0/0).
      const { data: empleados, error: errE } = await supabase
        .from('profiles')
        .select('id, nombre')
        .eq('campo_id', campoId)
        .eq('rol', 'empleado')
        .order('nombre', { ascending: true });
      if (errE) throw errE;

      setData(calcularDashboard(tareas, (empleados as Pick<Profile, 'id' | 'nombre'>[]) ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar el dashboard');
      setData(DATA_VACIA);
    } finally {
      setLoading(false);
    }
  }, [campoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { data, loading, error, refresh: cargar };
}

function calcularDashboard(
  tareas: TareaRaw[],
  empleados: Pick<Profile, 'id' | 'nombre'>[],
): DashboardData {
  const ahora = Date.now();
  const inicioHoy = startOfDay(ahora);
  const haceUnaSemana = ahora - 7 * 24 * 60 * 60 * 1000;

  let pendientes = 0;
  let enCurso = 0;
  let hechasHoy = 0;
  let hechasSemana = 0;

  // Por empleado, contar (asignadas en últimos 7 días, hechas en últimos 7 días).
  const porEmpleado = new Map<string, { total: number; hechas: number }>();
  for (const e of empleados) {
    porEmpleado.set(e.id, { total: 0, hechas: 0 });
  }

  const vencidas: VencidaListItem[] = [];

  for (const t of tareas) {
    if (t.estado === 'pendiente') pendientes += 1;
    if (t.estado === 'en_curso') enCurso += 1;

    if (t.completada_en) {
      const c = new Date(t.completada_en).getTime();
      if (c >= inicioHoy) hechasHoy += 1;
      if (c >= haceUnaSemana) hechasSemana += 1;
    }

    // Asignadas en los últimos 7 días.
    const creada = new Date(t.created_at).getTime();
    if (creada >= haceUnaSemana) {
      const slot = porEmpleado.get(t.empleado_id);
      if (slot) {
        slot.total += 1;
        if (t.estado === 'hecha') slot.hechas += 1;
      }
    }

    // Vencidas: fecha_limite < ahora y estado != hecha/cancelada.
    if (
      t.fecha_limite &&
      new Date(t.fecha_limite).getTime() < ahora &&
      t.estado !== 'hecha' &&
      t.estado !== 'cancelada'
    ) {
      vencidas.push({
        id: t.id,
        titulo: t.titulo,
        empleadoNombre: t.empleado?.nombre ?? '—',
        fechaLimite: t.fecha_limite,
        estado: t.estado,
      });
    }
  }

  // Ordenar vencidas: la más atrasada primero.
  vencidas.sort(
    (a, b) =>
      new Date(a.fechaLimite).getTime() - new Date(b.fechaLimite).getTime(),
  );

  const empleadoProgreso: EmpleadoProgreso[] = empleados.map((e) => {
    const slot = porEmpleado.get(e.id) ?? { total: 0, hechas: 0 };
    const porcentaje = slot.total === 0 ? 0 : Math.round((slot.hechas / slot.total) * 100);
    return {
      id: e.id,
      nombre: e.nombre,
      total: slot.total,
      hechas: slot.hechas,
      porcentaje,
    };
  });

  return {
    stats: { pendientes, enCurso, hechasHoy, hechasSemana },
    porEmpleado: empleadoProgreso,
    vencidas,
  };
}

function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
