// Tipos source-of-truth para las tablas de Supabase que usa la app.
// Mantener alineado con supabase/schema.sql.

export type Rol = 'jefe' | 'empleado';

export type Profile = {
  id: string;
  nombre: string;
  rol: Rol;
  campo_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Campo = {
  id: string;
  nombre: string;
  codigo: string;
  jefe_id: string;
  created_at: string;
};

export type EstadoTarea = 'pendiente' | 'en_curso' | 'hecha' | 'cancelada';

export type Tarea = {
  id: string;
  titulo: string;
  descripcion: string | null;
  campo_id: string;
  empleado_id: string;
  creada_por: string;
  estado: EstadoTarea;
  fecha_limite: string | null;
  completada_en: string | null;
  created_at: string;
  updated_at: string;
};

// Tarea con el nombre del empleado embebido. Lo usamos en las listas para
// no hacer N+1 SELECTs sobre profiles. Supabase devuelve el nombre via
// `select('*, empleado:profiles!tareas_empleado_id_fkey(nombre)')`.
export type TareaConEmpleado = Tarea & {
  empleado: { nombre: string } | null;
};

export type Foto = {
  id: string;
  tarea_id: string;
  subida_por: string;
  storage_path: string;
  created_at: string;
};

export type Comentario = {
  id: string;
  tarea_id: string;
  autor_id: string;
  mensaje: string;
  created_at: string;
};
