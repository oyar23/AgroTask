import { Stack } from 'expo-router';

import { LogoutButton } from '@/components/logout-button';

export default function JefeLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1f6f3f' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Inicio',
          headerRight: () => <LogoutButton />,
        }}
      />
      <Stack.Screen
        name="tareas/index"
        options={{
          title: 'Tareas',
          headerRight: () => <LogoutButton />,
        }}
      />
      <Stack.Screen
        name="tareas/nueva"
        options={{
          title: 'Nueva tarea',
        }}
      />
      <Stack.Screen
        name="tareas/[id]"
        options={{
          title: 'Detalle',
        }}
      />
    </Stack>
  );
}
