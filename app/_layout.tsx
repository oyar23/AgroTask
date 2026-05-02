import { Redirect, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthStore } from '@/lib/auth-store';

// Mantener el splash nativo hasta que loadSession termine. En web no hay
// splash nativo: para ese caso renderizamos una pantalla "Cargando…" más
// abajo.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const loading = useAuthStore((s) => s.loading);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const segments = useSegments();

  // loadSession se dispara UNA SOLA VEZ al montar. Llamamos a getState()
  // adentro del effect en vez de capturar la acción como dep para que la
  // dep array sea []. Si el RootLayout llegara a re-montarse (caso raro
  // pero posible cuando alterna entre <Redirect> y <Stack>), un effect con
  // [loadSession] re-disparaba la carga y entraba en loop con el browser
  // throttleando navegaciones.
  useEffect(() => {
    void useAuthStore.getState().loadSession();
  }, []);

  // El profile se carga acá afuera (no dentro del callback de
  // onAuthStateChange) porque GoTrue invoca el callback con su lock
  // interno tomado, y un fetchProfile adentro deadlockeaba con
  // signInWithPassword. Reaccionamos a `session sin profile` y
  // disparamos la carga acá, donde no hay lock.
  useEffect(() => {
    if (session && !profile) {
      void useAuthStore.getState().loadProfile();
    }
  }, [session, profile]);

  const showSplash = loading || (session !== null && profile === null);

  useEffect(() => {
    if (!showSplash) void SplashScreen.hideAsync().catch(() => {});
  }, [showSplash]);

  // Decisión por render path. UN solo punto de salida por estado, sin
  // oscilación. Cada cambio del tipo de raíz (View / Redirect / Stack)
  // causa que expo-router re-monte el RootLayout, así que minimizamos
  // los pasos:
  //
  //   loading=true                   → <Cargando>     (loadSession)
  //   no session                     → <Redirect login> | <Stack> si ya en (auth)
  //   session && no profile          → <Cargando>     (loadProfile)
  //   session && profile, rol mismatch → <Redirect /(rol)>
  //   session && profile, rol ok     → <Stack>
  //
  // El return final del Stack está envuelto en SafeAreaProvider; los
  // returns de "Cargando" y "Redirect" no — porque Redirect no renderiza
  // y la pantalla "Cargando" es global y no necesita safe-area.

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Cargando…</Text>
      </View>
    );
  }

  const inAuth = segments[0] === '(auth)';

  if (!session) {
    if (!inAuth) return <Redirect href="/(auth)/login" />;
  } else if (!profile) {
    // loadProfile en curso (post signIn / signUp / sesión cacheada).
    // Mientras tanto, pantalla estable de "Cargando" — no mezclar con
    // <Redirect> acá.
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Cargando…</Text>
      </View>
    );
  } else if (profile.rol === 'jefe' && segments[0] !== '(jefe)') {
    return <Redirect href="/(jefe)" />;
  } else if (profile.rol === 'empleado' && segments[0] !== '(empleado)') {
    return <Redirect href="/(empleado)" />;
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    fontSize: 18,
    color: '#444',
  },
});
