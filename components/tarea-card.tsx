import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EstadoTarea, TareaConEmpleado } from '@/types/database';

type Props = {
  tarea: TareaConEmpleado;
  onPress: () => void;
  // Si `false`, no mostramos al empleado asignado (vista del empleado, donde
  // todas las tareas son suyas y mostrarlo es ruido).
  mostrarEmpleado?: boolean;
};

export function TareaCard({ tarea, onPress, mostrarEmpleado = true }: Props) {
  const vencida = isVencida(tarea.fecha_limite, tarea.estado);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.titulo} numberOfLines={2}>
          {tarea.titulo}
        </Text>
        <View style={[styles.estadoBadge, estadoStyle(tarea.estado)]}>
          <Text style={styles.estadoText}>{labelEstado(tarea.estado)}</Text>
        </View>
      </View>
      {mostrarEmpleado && tarea.empleado ? (
        <Text style={styles.linea}>👤 {tarea.empleado.nombre}</Text>
      ) : null}
      {tarea.fecha_limite ? (
        <Text style={[styles.linea, vencida ? styles.vencida : null]}>
          📅 Hasta {formatDate(tarea.fecha_limite)}
          {vencida ? ' · vencida' : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function labelEstado(estado: EstadoTarea): string {
  switch (estado) {
    case 'pendiente':
      return 'Pendiente';
    case 'en_curso':
      return 'En curso';
    case 'hecha':
      return 'Hecha';
    case 'cancelada':
      return 'Cancelada';
  }
}

function estadoStyle(estado: EstadoTarea) {
  switch (estado) {
    case 'pendiente':
      return styles.estadoPendiente;
    case 'en_curso':
      return styles.estadoEnCurso;
    case 'hecha':
      return styles.estadoHecha;
    case 'cancelada':
      return styles.estadoCancelada;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function isVencida(fechaLimite: string | null, estado: EstadoTarea): boolean {
  if (!fechaLimite) return false;
  if (estado === 'hecha' || estado === 'cancelada') return false;
  return new Date(fechaLimite).getTime() < Date.now();
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 14,
    gap: 8,
  },
  pressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  titulo: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  estadoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  estadoPendiente: {
    backgroundColor: '#f1c40f',
  },
  estadoEnCurso: {
    backgroundColor: '#3498db',
  },
  estadoHecha: {
    backgroundColor: '#27ae60',
  },
  estadoCancelada: {
    backgroundColor: '#95a5a6',
  },
  estadoText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  linea: {
    fontSize: 15,
    color: '#444',
  },
  vencida: {
    color: '#c0392b',
    fontWeight: '700',
  },
});
