import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import { mapAuthError } from '@/lib/auth-helpers';
import type { Profile, Rol } from '@/types/database';

type SignUpData = {
  nombre: string;
  email: string;
  password: string;
  rol: Rol;
  codigoCampo?: string;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
};

type AuthActions = {
  loadSession: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (data: SignUpData) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

type AuthStore = AuthState & AuthActions;

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  error: null,

  clearError: () => set({ error: null }),

  loadSession: async () => {
    // SSR: no hay window, no hay storage real, no hay sesión posible.
    // Salimos rápido para que el HTML pre-renderizado no quede colgado en
    // "Cargando…" y el cliente, al hidratar, vea loading=false y dispare
    // el redirect a /(auth)/login.
    if (typeof window === 'undefined') {
      set({ session: null, profile: null, loading: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      // Timeout defensivo: si getSession se cuelga (storage no inicializado,
      // red caída, bug futuro de supabase-js), no dejamos al user varado en
      // "Cargando…". 3s alcanza para una lectura local + chequeo de refresh
      // contra el server; si no llegó, asumimos sin sesión.
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>(
          (resolve) =>
            setTimeout(
              () => resolve({ data: { session: null }, error: null }),
              3000,
            ),
        ),
      ]);

      const { data, error } = sessionResult;
      if (error) throw error;

      const session = data.session;
      if (!session) {
        set({ session: null, profile: null, loading: false });
        return;
      }

      const profile = await fetchProfile(session.user.id);

      // Caso "huérfano": auth válido pero sin profile. La signup quedó a medias
      // (la app se cerró entre auth.signUp y el INSERT de profiles, o el
      // INSERT falló). Cerrar sesión para forzar registro de nuevo.
      if (!profile) {
        await supabase.auth.signOut();
        set({
          session: null,
          profile: null,
          loading: false,
          error:
            'Tu cuenta quedó sin completar. Registrate de nuevo o pedile ayuda al admin.',
        });
        return;
      }

      set({ session, profile, loading: false });
    } catch (err) {
      set({ session: null, profile: null, loading: false, error: mapAuthError(err) });
    }
  },

  signIn: async (email, password) => {
    set({ error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error('No se pudo iniciar sesión');

      const profile = await fetchProfile(data.session.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        const msg =
          'Tu cuenta quedó sin completar. Registrate de nuevo o pedile ayuda al admin.';
        set({ session: null, profile: null, error: msg });
        return { ok: false, error: msg };
      }

      set({ session: data.session, profile });

      // TODO Fase 6 (push): cuando esté listo el dev build, descomentar:
      // void registrarParaPush(profile.id);
      // (import { registrarParaPush } from '@/lib/push' arriba del archivo)
      // En Expo Go la llamada falla silenciosa, así que dejarla activa allí
      // tampoco rompe nada — pero el warning de "expo-notifications no
      // funciona en Expo Go SDK 53+" ensucia los logs.

      return { ok: true };
    } catch (err) {
      const msg = mapAuthError(err);
      set({ error: msg });
      return { ok: false, error: msg };
    }
  },

  signUp: async (data) => {
    set({ error: null });

    try {
      // 1. Si es empleado, validar el código del campo ANTES del signUp.
      //    Usamos la RPC SECURITY DEFINER porque las policies de campos no
      //    permiten que un anon (ni un user recién creado sin profile) lea
      //    campos por código.
      let campoId: string | null = null;
      if (data.rol === 'empleado') {
        const codigo = data.codigoCampo?.trim();
        if (!codigo) return { ok: false, error: 'Ingresá el código del campo' };

        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'buscar_campo_por_codigo',
          { p_codigo: codigo },
        );
        if (rpcError) throw rpcError;
        if (!rpcData) {
          return { ok: false, error: 'No existe un campo con ese código' };
        }
        campoId = rpcData as string;
      }

      // 2. Crear el user en auth.users.
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
        {
          email: data.email,
          password: data.password,
        },
      );
      if (signUpError) throw signUpError;

      const session = signUpData.session;
      const user = signUpData.user;
      if (!session || !user) {
        // Email confirmation activo en el dashboard: signUp no devuelve session.
        // En el MVP esto está desactivado, así que si pasa avisamos genérico.
        throw new Error('No se pudo iniciar sesión luego del registro');
      }

      // 3. Insertar el profile. Si esto falla, hacemos signOut para no dejar al
      //    user con session activa pero sin profile (estado "huérfano").
      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        nombre: data.nombre.trim(),
        rol: data.rol,
        campo_id: campoId,
      });
      if (profileError) {
        await supabase.auth.signOut();
        throw profileError;
      }

      // 4. Cargar el profile recién creado al store. La redirección por rol
      //    la dispara el layout raíz al detectar profile != null.
      const profile = await fetchProfile(user.id);
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('No se pudo leer el profile recién creado');
      }

      set({ session, profile });

      // TODO Fase 6 (push): mismo TODO que en signIn:
      // void registrarParaPush(profile.id);

      return { ok: true };
    } catch (err) {
      const msg = mapAuthError(err);
      set({ error: msg });
      return { ok: false, error: msg };
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      set({ session: null, profile: null, error: null });
    }
  },
}));

// Mantener el store sincronizado con cambios de sesión que no pasan por las
// acciones del store (ej: refresh de token automático, signOut desde otro
// dispositivo, expiración). Si llega una session nueva y no tenemos profile,
// lo cargamos; si llega null, limpiamos.
supabase.auth.onAuthStateChange(async (_event, session) => {
  const current = useAuthStore.getState();

  if (!session) {
    if (current.session !== null || current.profile !== null) {
      useAuthStore.setState({ session: null, profile: null });
    }
    return;
  }

  if (current.session?.access_token === session.access_token && current.profile) {
    return;
  }

  try {
    const profile = await fetchProfile(session.user.id);
    if (!profile) {
      await supabase.auth.signOut();
      useAuthStore.setState({
        session: null,
        profile: null,
        error:
          'Tu cuenta quedó sin completar. Registrate de nuevo o pedile ayuda al admin.',
      });
      return;
    }
    useAuthStore.setState({ session, profile });
  } catch (err) {
    useAuthStore.setState({ error: mapAuthError(err) });
  }
});
