import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Hola, Melosa</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/(main)/calendar')}
      >
        <Text style={styles.buttonText}>Pedidos pendientes</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/(main)/block-days')}
      >
        <Text style={styles.buttonText}>Bloquear días</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/(main)/finished')}
      >
        <Text style={styles.buttonText}>Pedidos terminados</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/(main)/notifications')}
      >
        <Text style={styles.buttonText}>Notificaciones</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/(main)/search')}
      >
        <Text style={styles.buttonText}>Buscar por ticket</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F5EBE0',
    gap: 12,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#C82333',
    marginBottom: 24,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#F4DCD6',
    borderRadius: 8,
    padding: 16,
  },
  buttonText: {
    color: '#3E2723',
    fontSize: 16,
    fontWeight: '600',
  },
});