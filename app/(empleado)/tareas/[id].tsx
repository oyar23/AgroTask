import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { FotoGrid } from '@/components/foto-grid';
import { FotoUploader } from '@/components/foto-uploader';
import { ScreenContainer } from '@/components/screen-container';
import { labelEstado } from '@/components/tarea-card';
import { useFotos } from '@/hooks/use-fotos';
import { actualizarTarea, useTarea } from '@/hooks/use-tareas';
import type { EstadoTarea } from '@/types/database';

export default function TareaDetalleEmpleado() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tarea, loading, error, refresh } = useTarea(id ?? null);
  const { fotos, refresh: refreshFotos } = useFotos(id ?? null);

  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  async function cambiarEstado(nuevo: EstadoTarea) {
    if (!tarea) return;
    setUpdating(true);
    setUpdateError(null);
    const result = await actualizarTarea(tarea.id, { estado: nuevo });
    setUpdating(false);
    if (!result.ok) {
      setUpdateError(result.error);
      return;
    }
    void refresh();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1f6f3f" size="large" />
      </View>
    );
  }

  if (error || !tarea) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{error ?? 'No encontramos esta tarea.'}</Text>
        <Button
          label="Volver"
          variant="secondary"
          onPress={() => router.back()}
        />
      </View>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.titulo}>{tarea.titulo}</Text>
        <Text style={styles.estado}>{labelEstado(tarea.estado)}</Text>
      </View>

      <DetalleRow
        label="Descripción"
        value={tarea.descripcion?.trim() ? tarea.descripcion : 'Sin descripción'}
      />
      <DetalleRow
        label="Fecha límite"
        value={tarea.fecha_limite ? formatDate(tarea.fecha_limite) : 'Sin fecha'}
      />
      {tarea.completada_en ? (
        <DetalleRow
          label="Completada el"
          value={formatDate(tarea.completada_en)}
        />
      ) : null}

      {updateError ? <Text style={styles.formError}>{updateError}</Text> : null}

      {tarea.estado === 'pendiente' ? (
        <Button
          label="Marcar en curso"
          onPress={() => void cambiarEstado('en_curso')}
          loading={updating}
        />
      ) : null}
      {tarea.estado === 'en_curso' ? (
        <Button
          label="Marcar como hecha"
          onPress={() => void cambiarEstado('hecha')}
          loading={updating}
        />
      ) : null}
      {tarea.estado === 'hecha' ? (
        <Button
          label="Reabrir tarea"
          variant="secondary"
          onPress={() => void cambiarEstado('en_curso')}
          loading={updating}
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Comentarios</Text>
        <Text style={styles.placeholder}>Próximamente</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fotos</Text>
        <FotoUploader tareaId={tarea.id} onUploaded={() => void refreshFotos()} />
        <View style={styles.gridSpacer}>
          <FotoGrid fotos={fotos} onChange={() => void refreshFotos()} />
        </View>
      </View>
    </ScreenContainer>
  );
}

type DetalleRowProps = {
  label: string;
  value: string;
};

function DetalleRow({ label, value }: DetalleRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
  },
  empty: {
    fontSize: 18,
    color: '#444',
    fontWeight: '600',
  },
  header: {
    gap: 4,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f6f3f',
  },
  estado: {
    fontSize: 16,
    color: '#444',
    fontWeight: '600',
  },
  row: {
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  rowValue: {
    fontSize: 17,
    color: '#111',
  },
  section: {
    paddingTop: 12,
    gap: 10,
  },
  gridSpacer: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  placeholder: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  formError: {
    color: '#c0392b',
    fontSize: 16,
    textAlign: 'center',
  },
});
