import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import api from '../../src/config/api';

export default function LoginScreen() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!password) {
      Alert.alert('Falta la contraseña', 'Ingresá la contraseña de la agenda');
      return;
    }

    setLoading(true);

    try {
      // Single-user system: the mobile app authenticates with the password only.
      const response = await api.post('/auth/login', { password });
      const { token } = response.data;

      await SecureStore.setItemAsync('authToken', token);

      router.replace('/(main)/home');
    } catch (error: any) {
      if (error?.response?.status === 401) {
        Alert.alert('Contraseña incorrecta', 'Revisá la contraseña e intentá de nuevo.');
      } else {
        Alert.alert(
          'No se pudo conectar',
          'Revisá tu internet e intentá de nuevo. Si acabás de abrir la app, puede tardar unos segundos.'
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Melosa Agenda</Text>

      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor="rgba(62,39,35,0.4)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
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
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 32,
    textAlign: 'center',
    color: '#C82333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#F4DCD6',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#3E2723',
  },
  button: {
    backgroundColor: '#C82333',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#F5EBE0',
    fontSize: 16,
    fontWeight: '600',
  },
});