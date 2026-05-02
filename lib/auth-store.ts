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
  // Flag que indica si loadSession ya corrió (con éxito o error). Lo
  // usamos para que loadSession sea idempotente: si el RootLayout se
  // re-monta (pasa cuando el árbol alterna entre View/Redirect/Stack
  // durante login), no re-disparamos getSession. Sin esto, cada
  // re-mount tiraba un nuevo getSession + replaceState, y Firefox
  // bloqueaba la cadena con "operation is insecure".
  sessionInitialized: boolean;
};

type AuthActions = {
  loadSession: () => Promise<void>;
  loadProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (data: SignUpData) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

type AuthStore = AuthState & AuthActions;

// Si la promise no resuelve en `ms`, rechaza con un Error etiquetado. Lo
// usamos en signIn/signUp para no dejar al user con el botón en spinner
// permanente cuando el cliente Supabase se cuelga (lock interno de GoTrue,
// storage roto, red caída). El catch del store mapea el error a mensaje
// en español antes de devolverlo al caller.
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Tiempo de espera agotado (${label})`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('Tiempo de espera agotado');
}

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
  sessionInitialized: false,

  clearError: () => set({ error: null }),

  // Llamada por el effect del root layout cuando detecta session sin
  // profile (post-signIn / post-signUp / refresh externo / restauración
  // de sesión en loadSession). Vive afuera del callback onAuthStateChange
  // para no contaminar el lock de GoTrue.
  //
  // Maneja dos casos de borde:
  //   - Huérfano: session válida pero sin profile en la DB → signOut +
  //     mensaje al user. Pasa cuando la signup quedó a medias.
  //   - Cuelgue: si fetchProfile no resuelve en 5s (red, lock interno),
  //     limpiamos la session para no dejar al layout pegado en
  //     "Cargando…". El user vuelve a login con un mensaje.
  loadProfile: async () => {
    const state = get();
    const session = state.session;
    if (!session) return;
    if (state.profile?.id === session.user.id) return;

    try {
      const profile = await withTimeout(
        fetchProfile(session.user.id),
        5000,
        'loadProfile',
      );
      const current = get();
      // Si la session cambió mientras fetcheabamos (signOut concurrente,
      // user diferente), descartar el resultado.
      if (current.session?.access_token !== session.access_token) return;

      if (!profile) {
        await supabase.auth.signOut();
        set({
          session: null,
          profile: null,
          error:
            'Tu cuenta quedó sin completar. Registrate de nuevo o pedile ayuda al admin.',
        });
        return;
      }
      set({ profile });
    } catch (err) {
      if (isTimeoutError(err)) {
        // Si fetchProfile colgó, no podemos dejar al user con session +
        // sin profile: el layout mostraría "Cargando…" para siempre.
        // Forzamos signOut y mandamos al user a login con un mensaje.
        try {
          await supabase.auth.signOut();
        } catch {
          // ignoramos: lo importante es resetear el state local.
        }
        set({
          session: null,
          profile: null,
          error: 'No se pudo cargar tu perfil, probá de nuevo',
        });
        return;
      }
      set({ error: mapAuthError(err) });
    }
  },

  // Carga la SESIÓN inicial al montar la app. NO carga el profile —
  // de eso se encarga loadProfile (via useEffect del root layout) cuando
  // detecta session sin profile. Separar evita doble fetch y deadlocks
  // entre loadSession.fetchProfile y loadProfile concurrentes.
  //
  // Idempotente: si ya corrió antes (flag sessionInitialized), early
  // return. Sin esto, cada re-mount del RootLayout (causado por cambios
  // del tipo de árbol que devuelve: Stack→View→Redirect→Stack) volvía
  // a disparar getSession + replaceState, y Firefox bloqueaba la cadena
  // de navegaciones con "operation is insecure".
  loadSession: async () => {
    if (get().sessionInitialized) return;
    set({ sessionInitialized: true });
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

      const session = data.session ?? null;

      // Si el callback onAuthStateChange ya seteó esta misma session
      // antes que getSession resolviera, no la pisamos (preserva profile
      // si loadProfile concurrente ya lo cargó).
      const current = get();
      if (
        session &&
        current.session?.access_token === session.access_token
      ) {
        set({ loading: false });
      } else {
        set({ session, profile: null, loading: false });
      }
    } catch (err) {
      set({ session: null, profile: null, loading: false, error: mapAuthError(err) });
    }
  },

  signIn: async (email, password) => {
    set({ error: null });

    // Sólo signInWithPassword + set de la session. fetchProfile lo dispara
    // un useEffect del root layout cuando ve session sin profile. Hacerlo
    // acá adentro causaba deadlock con el lock interno de GoTrue: el
    // callback onAuthStateChange (que también hacía await fetchProfile)
    // re-entraba al lock que signInWithPassword aún tenía tomado, y todo
    // quedaba esperando hasta que saltaba el timeout.
    const inner = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (!data.session) throw new Error('No se pudo iniciar sesión');

      // El profile lo carga el effect del layout. El chequeo "huérfano"
      // (session sin profile en la DB) también vive en loadProfile.
      set({ session: data.session });

      // TODO Fase 6 (push): cuando esté listo el dev build, descomentar:
      // void registrarParaPush(data.session.user.id);
      // (import { registrarParaPush } from '@/lib/push' arriba del archivo)
      // En Expo Go la llamada falla silenciosa, así que dejarla activa allí
      // tampoco rompe nada — pero el warning de "expo-notifications no
      // funciona en Expo Go SDK 53+" ensucia los logs.

      return { ok: true };
    };

    try {
      return await withTimeout(inner(), 8000, 'signIn');
    } catch (err) {
      const msg = isTimeoutError(err)
        ? 'El servidor tardó demasiado en responder, probá de nuevo'
        : mapAuthError(err);
      set({ error: msg });
      return { ok: false, error: msg };
    }
  },

  signUp: async (data) => {
    set({ error: null });

    // Mismo razonamiento que signIn: timeout único envolviendo todo el
    // bloque (RPC + signUp + insert profile). Si alguno se cuelga,
    // liberamos al user con un error en español.
    const inner = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
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

      // 4. Set de la session. El profile lo carga el effect del root
      //    layout al detectar session sin profile (mismo patrón que
      //    signIn — evita deadlock con el lock de GoTrue). La redirección
      //    por rol la dispara el layout cuando ya hay profile.
      set({ session });

      // TODO Fase 6 (push): mismo TODO que en signIn:
      // void registrarParaPush(user.id);

      return { ok: true };
    };

    try {
      return await withTimeout(inner(), 8000, 'signUp');
    } catch (err) {
      const msg = isTimeoutError(err)
        ? 'El servidor tardó demasiado en responder, probá de nuevo'
        : mapAuthError(err);
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

// Mantener el store sincronizado con cambios de sesión que no pasan por
// las acciones del store (refresh de token automático, signOut desde otro
// dispositivo, expiración).
//
// IMPORTANTE: este callback es SINCRÓNICO a propósito. GoTrue invoca
// onAuthStateChange con un lock interno tomado durante signInWithPassword
// y otras operaciones de auth. Si acá adentro hacemos `await` (ej:
// fetchProfile), la query queda esperando el lock que GoTrue todavía no
// liberó → deadlock hasta que salta el timeout. Por eso el profile se
// carga afuera, en un useEffect del root layout que reacciona a
// `session && !profile`.
supabase.auth.onAuthStateChange((_event, session) => {
  const current = useAuthStore.getState();

  if (!session) {
    if (current.session !== null || current.profile !== null) {
      useAuthStore.setState({ session: null, profile: null });
    }
    return;
  }

  // Misma session que ya tenemos: nada que hacer.
  if (current.session?.access_token === session.access_token) {
    return;
  }

  // Session nueva. Si es del mismo user, conservar el profile; si es de
  // otro user (login con cuenta distinta tras signOut), limpiarlo para
  // que el effect del layout dispare loadProfile de nuevo.
  const sameUser = current.profile?.id === session.user.id;
  useAuthStore.setState({
    session,
    profile: sameUser ? current.profile : null,
  });
});
