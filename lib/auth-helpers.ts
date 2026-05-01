// Traduce errores de Supabase Auth a mensajes amigables en español.
// Nunca exponer al usuario el mensaje crudo: aporta poco y a veces filtra
// detalles que son ruido (códigos internos, stack traces).

const AUTH_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'User already registered': 'Ese email ya está registrado',
  'Email not confirmed': 'Email no confirmado, revisá tu casilla',
  'Password should be at least 6 characters':
    'La contraseña debe tener al menos 6 caracteres',
};

const FALLBACK_MESSAGE = 'Hubo un problema, intentá de nuevo';

export function mapAuthError(error: unknown): string {
  if (!error) return FALLBACK_MESSAGE;

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return AUTH_ERROR_MAP[raw] ?? FALLBACK_MESSAGE;
}
