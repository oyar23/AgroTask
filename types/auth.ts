import { z } from 'zod';

// Schemas de Zod para los formularios de auth.
// Los mensajes son los que ve el usuario, en español rioplatense.

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Ingresá tu email')
    .email('Email inválido'),
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres'),
    email: z
      .string()
      .min(1, 'Ingresá tu email')
      .email('Email inválido'),
    password: z
      .string()
      .min(6, 'La contraseña debe tener al menos 6 caracteres'),
    confirmPassword: z.string(),
    rol: z.enum(['jefe', 'empleado'], {
      errorMap: () => ({ message: 'Elegí un rol' }),
    }),
    codigoCampo: z.string().trim().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
  .refine(
    (data) =>
      data.rol !== 'empleado' ||
      (data.codigoCampo !== undefined && data.codigoCampo.length > 0),
    {
      message: 'Ingresá el código del campo',
      path: ['codigoCampo'],
    },
  );

export type RegisterInput = z.infer<typeof registerSchema>;
