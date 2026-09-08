import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Shown when a screen's data load failed, so a network / cold-start / expired
// error doesn't look identical to "there's nothing here".
export default function ErrorRetry({
  onRetry,
  message,
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>
        {message ?? 'No se pudo cargar. Revisá tu internet e intentá de nuevo.'}
      </Text>
      <TouchableOpacity style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  text: { color: '#3E2723', textAlign: 'center', marginBottom: 16, fontSize: 14 },
  button: {
    backgroundColor: '#C82333',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
