import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>AgroTasks</Text>
      <Text style={styles.subtitle}>Setup inicial listo. Próximo paso: auth.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
    color: '#555',
  },
});
