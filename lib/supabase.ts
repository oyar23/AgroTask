import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copiá .env.example a .env y completá los valores.',
  );
}

// En SSR (build estático web sin DOM) no podemos usar AsyncStorage porque
// importa código que toca `window` al evaluarse. Pasarle `undefined` al
// cliente Supabase deja al GoTrueClient en un estado limbo donde
// `getSession()` se cuelga. La solución es darle siempre un storage válido:
// memoryStorage no-op en SSR, AsyncStorage real en mobile y web client.
const inSSR = typeof window === 'undefined';

const memoryStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: inSSR ? memoryStorage : AsyncStorage,
    autoRefreshToken: !inSSR,
    persistSession: !inSSR,
    detectSessionInUrl: false,
  },
});
