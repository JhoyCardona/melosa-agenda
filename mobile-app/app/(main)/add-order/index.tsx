import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNewOrder } from '../../../src/context/NewOrderContext';

export default function ClientDataScreen() {
  const { clientData, setClientData } = useNewOrder();

  const [clientName, setClientName] = useState(clientData.clientName);
  const [clientPhone, setClientPhone] = useState(clientData.clientPhone);
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(
    clientData.deliveryDate ? new Date(clientData.deliveryDate + 'T00:00:00') : null
  );
  const [deliveryTime, setDeliveryTime] = useState<Date | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState(clientData.deliveryAddress);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  function formatDisplayDate(date: Date): string {
    const weekday = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${weekday}, ${day} de ${month} de ${year}`;
  }

  function formatDisplayTime(time: Date): string {
    let hours = time.getHours();
    const minutes = String(time.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${period}`;
  }

  function toDateTimeString(date: Date, time: Date | null): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (!time) {
      return `${year}-${month}-${day}T00:00:00`;
    }

    const hours = String(time.getHours()).padStart(2, '0');
    const minutes = String(time.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:00`;
  }

  function handleDateChange(event: any, selectedDate?: Date) {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDeliveryDate(selectedDate);
    }
  }

  function handleTimeChange(event: any, selectedTime?: Date) {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setDeliveryTime(selectedTime);
    }
  }

  function handleContinue() {
    if (!clientName || !clientPhone || !deliveryDate) {
      alert('Nombre, teléfono y fecha de entrega son obligatorios');
      return;
    }

    setClientData({
      clientName,
      clientPhone,
      deliveryDate: toDateTimeString(deliveryDate, deliveryTime),
      deliveryAddress,
    });
    router.push('/(main)/add-order/category');
  }

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

      <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
        <Text style={deliveryDate ? styles.dateButtonText : styles.dateButtonPlaceholder}>
          {deliveryDate ? formatDisplayDate(deliveryDate) : 'Seleccionar fecha de entrega'}
        </Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={deliveryDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      <TouchableOpacity style={styles.dateButton} onPress={() => setShowTimePicker(true)}>
        <Text style={deliveryTime ? styles.dateButtonText : styles.dateButtonPlaceholder}>
          {deliveryTime ? formatDisplayTime(deliveryTime) : 'Hora estimada de entrega (opcional)'}
        </Text>
      </TouchableOpacity>

      {showTimePicker && (
        <DateTimePicker
          value={deliveryTime || new Date()}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}

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
  dateButton: {
    borderWidth: 1,
    borderColor: '#F4DCD6',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  dateButtonText: { color: '#3E2723', fontSize: 16 },
  dateButtonPlaceholder: { color: '#999', fontSize: 16 },
  button: {
    backgroundColor: '#C82333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#F5EBE0', fontSize: 16, fontWeight: '600' },
});