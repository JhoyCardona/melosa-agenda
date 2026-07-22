import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useNewOrder } from '../../../src/context/NewOrderContext';

export default function ClientDataScreen() {
  const { clientData, setClientData } = useNewOrder();

  const [clientName, setClientName] = useState(clientData.clientName);
  const [clientPhone, setClientPhone] = useState(clientData.clientPhone);
  const [deliveryDate, setDeliveryDate] = useState(clientData.deliveryDate);
  const [deliveryAddress, setDeliveryAddress] = useState(clientData.deliveryAddress);

  function getWeekday(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) return '';

    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return days[date.getDay()];
  }

  function handleContinue() {
    if (!clientName || !clientPhone || !deliveryDate) {
      alert('Nombre, teléfono y fecha de entrega son obligatorios');
      return;
    }

    setClientData({ clientName, clientPhone, deliveryDate, deliveryAddress });
    router.push('/(main)/add-order/category');
  }

  const weekday = getWeekday(deliveryDate);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Datos del cliente</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre del cliente"
        value={clientName}
        onChangeText={setClientName}
      />

      <TextInput
        style={styles.input}
        placeholder="Teléfono"
        value={clientPhone}
        onChangeText={setClientPhone}
        keyboardType="phone-pad"
      />

      <TextInput
        style={styles.input}
        placeholder="Fecha de entrega (AAAA-MM-DD)"
        value={deliveryDate}
        onChangeText={setDeliveryDate}
      />
      {weekday ? <Text style={styles.weekdayHint}>Día: {weekday}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Dirección de entrega"
        value={deliveryAddress}
        onChangeText={setDeliveryAddress}
      />

      <TouchableOpacity style={styles.button} onPress={handleContinue}>
        <Text style={styles.buttonText}>Agregar producto</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0' },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#C82333', marginBottom: 24 },
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
  weekdayHint: { color: '#3E2723', marginBottom: 12, marginTop: -6, fontStyle: 'italic' },
  button: {
    backgroundColor: '#C82333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#F5EBE0', fontSize: 16, fontWeight: '600' },
});