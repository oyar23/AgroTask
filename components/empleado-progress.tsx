import { StyleSheet, Text, View } from 'react-native';

import type { EmpleadoProgreso } from '@/hooks/use-dashboard';

type Props = {
  empleado: EmpleadoProgreso;
};

export function EmpleadoProgressItem({ empleado }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.nombre}>{empleado.nombre}</Text>
        <Text style={styles.contador}>
          {empleado.hechas}/{empleado.total}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${empleado.porcentaje}%` },
            empleado.porcentaje >= 80 ? styles.barOk : null,
          ]}
        />
      </View>
      <Text style={styles.porcentaje}>{empleado.porcentaje}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nombre: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  contador: {
    fontSize: 14,
    color: '#666',
  },
  barTrack: {
    height: 10,
    backgroundColor: '#eef0f2',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#3498db',
    borderRadius: 5,
  },
  barOk: {
    backgroundColor: '#1f6f3f',
  },
  porcentaje: {
    fontSize: 12,
    color: '#666',
    alignSelf: 'flex-end',
  },
});
