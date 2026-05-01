import { StyleSheet, Text, View } from 'react-native';

type Tono = 'verde' | 'amarillo' | 'azul' | 'gris';

type Props = {
  label: string;
  value: number;
  tono?: Tono;
};

export function StatCard({ label, value, tono = 'gris' }: Props) {
  return (
    <View style={[styles.card, fondo(tono)]}>
      <Text style={[styles.value, color(tono)]}>{value}</Text>
      <Text style={[styles.label, color(tono)]}>{label}</Text>
    </View>
  );
}

function fondo(tono: Tono) {
  switch (tono) {
    case 'verde':
      return styles.verde;
    case 'amarillo':
      return styles.amarillo;
    case 'azul':
      return styles.azul;
    case 'gris':
      return styles.gris;
  }
}

function color(tono: Tono) {
  return tono === 'gris' ? styles.textoOscuro : styles.textoBlanco;
}

const styles = StyleSheet.create({
  card: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
    minHeight: 96,
    justifyContent: 'center',
  },
  value: {
    fontSize: 30,
    fontWeight: '800',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  verde: {
    backgroundColor: '#1f6f3f',
  },
  amarillo: {
    backgroundColor: '#d4a017',
  },
  azul: {
    backgroundColor: '#2980b9',
  },
  gris: {
    backgroundColor: '#eef0f2',
  },
  textoBlanco: {
    color: '#fff',
  },
  textoOscuro: {
    color: '#222',
  },
});
