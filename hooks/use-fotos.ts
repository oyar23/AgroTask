import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Foto } from '@/types/database';

// Lista las fotos de una tarea. RLS limita a quien puede ver la tarea
// asociada (ver `fotos_select` en policies.sql).
export function useFotos(tareaId: string | null) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!tareaId) {
      setFotos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('fotos')
        .select('*')
        .eq('tarea_id', tareaId)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setFotos((data as Foto[] | null) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar las fotos');
    } finally {
      setLoading(false);
    }
  }, [tareaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { fotos, loading, error, refresh: cargar };
}
