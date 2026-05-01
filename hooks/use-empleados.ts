import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

// Lista de empleados de un campo. El RLS ya filtra qué profiles puede ver
// el caller (ver `profiles_select` en policies.sql), así que sólo limitamos
// por `campo_id` y `rol = 'empleado'` para no incluir al propio jefe ni
// otros usuarios sin rol relevante.
export function useEmpleados(campoId: string | null) {
  const [empleados, setEmpleados] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!campoId) {
      setEmpleados([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('campo_id', campoId)
        .eq('rol', 'empleado')
        .order('nombre', { ascending: true });
      if (err) throw err;
      setEmpleados((data as Profile[] | null) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar empleados');
    } finally {
      setLoading(false);
    }
  }, [campoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { empleados, loading, error, refresh: cargar };
}
