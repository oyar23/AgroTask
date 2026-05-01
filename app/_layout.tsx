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

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Cargando…</Text>
      </View>
    );
  }

  // Decidimos la redirección durante el render con <Redirect>. La
  // alternativa imperativa con router.replace() en useEffect deja al árbol
  // en un estado inconsistente cuando la URL inicial no matchea el grupo
  // del rol: el _layout del grupo intenta montarse antes de que el effect
  // dispare el replace. <Redirect> se evalúa en el render path y nunca
  // monta el subárbol equivocado.
  const inAuth = segments[0] === '(auth)';

  // Sin sesión válida (incluye el caso "huérfano": session sin profile, que
  // puede pasar si la signup quedó a medias): a login si no estamos ya en
  // (auth).
  if (!session || !profile) {
    if (!inAuth) return <Redirect href="/(auth)/login" />;
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
