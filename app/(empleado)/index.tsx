import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { TareaCard } from '@/components/tarea-card';
import { useTareas, type FiltrosTareas } from '@/hooks/use-tareas';
import { useAuthStore } from '@/lib/auth-store';
import type { EstadoTarea } from '@/types/database';

const ESTADOS: { value: EstadoTarea; label: string }[] = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'hecha', label: 'Hechas' },
];

export default function EmpleadoIndex() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  // Default: mostrar pendientes (lo que tiene "por hacer").
  const [estado, setEstado] = useState<EstadoTarea | null>('pendiente');

  const filtros: FiltrosTareas = useMemo(
    () => ({ estado, empleadoId: null }),
    [estado],
  );

  // No filtramos por campo: el empleado tiene un solo campo y RLS le
  // entrega solo sus tareas.
  const { tareas, loading, error, refresh } = useTareas(null, filtros);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hola, {profile?.nombre ?? ''}</Text>
      </View>
      <View style={styles.filtros}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          <Chip
            label="Todas"
            selected={estado === null}
            onPress={() => setEstado(null)}
          />
          {ESTADOS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={estado === opt.value}
              onPress={() => setEstado(opt.value)}
            />
          ))}
        </ScrollView>
      </View>

      {loading && tareas.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#1f6f3f" size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={tareas}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void refresh()}
              tintColor="#1f6f3f"
            />
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>No hay tareas para mostrar</Text>
              <Text style={styles.emptyHelp}>
                Cuando tu jefe te asigne una, va a aparecer acá.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TareaCard
              tarea={item}
              mostrarEmpleado={false}
              onPress={() => router.push(`/(empleado)/tareas/${item.id}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  greeting: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f6f3f',
  },
  filtros: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  chipsRow: {
    gap: 8,
    paddingRight: 8,
  },
  list: {
    padding: 16,
    flexGrow: 1,
  },
  sep: {
    height: 10,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  empty: {
    fontSize: 18,
    color: '#444',
    fontWeight: '600',
  },
  emptyHelp: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
  },
  errorText: {
    color: '#c0392b',
    fontSize: 16,
    textAlign: 'center',
  },
});
