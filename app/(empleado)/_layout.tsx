import { Stack } from 'expo-router';

import { LogoutButton } from '@/components/logout-button';

export default function EmpleadoLayout() {
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
          title: 'Mis tareas',
          headerRight: () => <LogoutButton />,
        }}
      />
      <Stack.Screen
        name="tareas/[id]"
        options={{
          title: 'Tarea',
        }}
      />
    </Stack>
  );
}
