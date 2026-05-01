import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import type { Campo } from '@/types/database';

// Devuelve el campo del usuario actual.
// - Para un jefe: el campo donde figura como `jefe_id` (suele tener
//   `profile.campo_id = NULL` hasta que se autoasigna). Si tiene varios,
//   tomamos el primero por created_at; el MVP asume un campo por jefe.
// - Para un empleado: el campo referenciado por `profile.campo_id`.
//
// `null` significa "todavía no tiene campo": el jefe debe crear uno antes
// de poder usar el resto de la app.
export function useMiCampo() {
  const profile = useAuthStore((s) => s.profile);

  const [campo, setCampo] = useState<Campo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!profile) {
      setCampo(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (profile.rol === 'jefe') {
        const { data, error: err } = await supabase
          .from('campos')
          .select('*')
          .eq('jefe_id', profile.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (err) throw err;
        setCampo((data as Campo | null) ?? null);
      } else {
        if (!profile.campo_id) {
          setCampo(null);
        } else {
          const { data, error: err } = await supabase
            .from('campos')
            .select('*')
            .eq('id', profile.campo_id)
            .maybeSingle();
          if (err) throw err;
          setCampo((data as Campo | null) ?? null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar el campo');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { campo, loading, error, refresh: cargar };
}
