import { z } from 'zod';

// Schema del form "nueva tarea" / "editar tarea". Se valida en cliente
// antes de pegarle a Supabase. La validación de "el empleado pertenece
// al campo" la hace el trigger en Postgres, no la repetimos acá.
export const tareaFormSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(3, 'El título debe tener al menos 3 caracteres')
    .max(120, 'El título es demasiado largo'),
  descripcion: z.string().trim().max(2000, 'La descripción es demasiado larga'),
  empleadoId: z
    .string()
    .min(1, 'Asigná un empleado')
    .uuid('Asigná un empleado'),
  fechaLimite: z.date().nullable(),
});

export type TareaFormInput = z.infer<typeof tareaFormSchema>;

// Schema para crear un campo (lo usa el jefe la primera vez que entra).
// Código del campo: 4-12 caracteres alfanuméricos. Lo normalizamos a
// mayúsculas en el cliente antes de mandar a la base.
export const campoFormSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(80, 'El nombre es demasiado largo'),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]+$/, 'Solo letras y números')
    .min(4, 'El código debe tener al menos 4 caracteres')
    .max(12, 'El código no puede tener más de 12 caracteres'),
});

export type CampoFormInput = z.infer<typeof campoFormSchema>;
