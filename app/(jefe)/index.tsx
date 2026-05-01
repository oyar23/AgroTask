import { StyleSheet, Text, View } from 'react-native';

import { useAuthStore } from '@/lib/auth-store';

export default function JefeIndex() {
  const profile = useAuthStore((s) => s.profile);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pantalla de jefe</Text>
      {profile ? (
        <Text style={styles.subtitle}>Hola, {profile.nombre}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f6f3f',
  },
  subtitle: {
    fontSize: 18,
    color: '#444',
  },
});
