import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { TareaCard } from '@/components/tarea-card';
import { useEmpleados } from '@/hooks/use-empleados';
import { useMiCampo } from '@/hooks/use-mi-campo';
import { useTareas, type FiltrosTareas } from '@/hooks/use-tareas';
import type { EstadoTarea } from '@/types/database';

const ESTADOS: { value: EstadoTarea; label: string }[] = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'hecha', label: 'Hechas' },
];

export default function TareasIndex() {
  const router = useRouter();
  const { campo, loading: loadingCampo } = useMiCampo();
  const { empleados } = useEmpleados(campo?.id ?? null);

  const [estado, setEstado] = useState<EstadoTarea | null>(null);
  const [empleadoId, setEmpleadoId] = useState<string | null>(null);

  const filtros: FiltrosTareas = useMemo(
    () => ({ estado, empleadoId }),
    [estado, empleadoId],
  );

  const { tareas, loading, error, refresh } = useTareas(
    campo?.id ?? null,
    filtros,
  );

  // Refrescar al volver a la pantalla (después de crear/editar/eliminar).
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const empleadoOptions: DropdownOption<string>[] = useMemo(
    () => empleados.map((e) => ({ label: e.nombre, value: e.id })),
    [empleados],
  );

  if (loadingCampo) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1f6f3f" size="large" />
      </View>
    );
  }

  if (!campo) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Primero tenés que crear un campo.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
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
        <Dropdown
          value={empleadoId}
          options={empleadoOptions}
          onChange={setEmpleadoId}
          placeholder="Todos los empleados"
        />
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
              <Text style={styles.empty}>No hay tareas todavía</Text>
              <Text style={styles.emptyHelp}>
                Tocá el botón “+” para crear la primera.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TareaCard
              tarea={item}
              onPress={() => router.push(`/(jefe)/tareas/${item.id}`)}
            />
          )}
        />
      )}

      <Pressable
        onPress={() => router.push('/(jefe)/tareas/nueva')}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        accessibilityLabel="Nueva tarea"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  filtros: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  chipsRow: {
    gap: 8,
    paddingRight: 8,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1f6f3f',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabPressed: {
    opacity: 0.85,
  },
  fabText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 36,
  },
});
