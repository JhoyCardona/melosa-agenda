import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import api from '../../src/config/api';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username || !password) {
      Alert.alert('Faltan datos', 'Ingresá tu usuario y contraseña');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/login', { username, password });
      const { token } = response.data;

      await SecureStore.setItemAsync('authToken', token);

      router.replace('/(main)/home');
    } catch (error) {
      Alert.alert('Error', 'Usuario o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Melosa Agenda</Text>

      <TextInput
        style={styles.input}
        placeholder="Usuario"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
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