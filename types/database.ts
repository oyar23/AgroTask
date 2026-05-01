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
