import { Pressable, StyleSheet, Text } from 'react-native';

import { useAuthStore } from '@/lib/auth-store';
import { confirm } from '@/lib/platform-utils';

export function LogoutButton() {
  const signOut = useAuthStore((s) => s.signOut);

  function handlePress() {
    confirm('¿Cerrar sesión?', undefined, () => {
      void signOut();
    });
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={12}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>Salir</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
