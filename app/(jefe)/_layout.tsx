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
          title: 'Jefe',
          headerRight: () => <LogoutButton />,
        }}
      />
    </Stack>
  );
}
