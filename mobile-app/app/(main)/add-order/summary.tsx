import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useNewOrder } from '../../../src/context/NewOrderContext';
import api from '../../../src/config/api';

function formatDeliveryDateTime(isoString: string): string {
  const date = new Date(isoString);
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const weekday = days[date.getUTCDay()];
  const day = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const hours24 = date.getUTCHours();
  const minutes = date.getUTCMinutes();

  const dateLabel = `${weekday}, ${day} de ${month}`;

  if (hours24 === 0 && minutes === 0) {
    return dateLabel;
  }

  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  const minutesStr = String(minutes).padStart(2, '0');

  return `${dateLabel} · ${hours12}:${minutesStr} ${period}`;
}

const categoryLabels: Record<string, string> = {
  CAKE: 'Torta',
  ALFAJOR_CAKE: 'Torta de alfajor',
  ALFAJOR_UNIT: 'Alfajores por unidad',
  CUPCAKE: 'Cupcakes',
  DESSERT: 'Postre',
};

export default function SummaryScreen() {
  const { clientData, items, resetOrder } = useNewOrder();

  const [depositPaid, setDepositPaid] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const totalPrice = items.reduce((sum, item) => sum + Number(item.price || 0), 0);

  async function uploadImageIfNeeded(imageUri: string | null): Promise<string | null> {
    if (!imageUri) return null;

    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    } as any);

    const response = await api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data.imageUrl;
  }

  async function handleConfirm() {
    setSaving(true);

    try {
      const orderResponse = await api.post('/orders', {
        clientName: clientData.clientName,
        clientPhone: clientData.clientPhone,
        deliveryDate: clientData.deliveryDate,
        deliveryAddress: clientData.deliveryAddress,
        notes,
        depositPaid: depositPaid ? Number(depositPaid) : 0,
      });

      const orderId = orderResponse.data.id;

      for (const item of items) {
        const uploadedImageUrl = await uploadImageIfNeeded(item.imageUrl);

        await api.post(`/orders/${orderId}/items`, {
          category: item.category,
          price: Number(item.price),
          imageUrl: uploadedImageUrl,
          details: item.details,
        });
      }

      resetOrder();

      Alert.alert('✓ Pedido finalizado', '', [
        { text: 'OK', onPress: () => router.replace('/(main)/home') },
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo guardar el pedido. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Resumen del pedido</Text>

      <Text style={styles.sectionLabel}>Cliente</Text>
      <Text style={styles.infoText}>{clientData.clientName}</Text>
      <Text style={styles.infoText}>{clientData.clientPhone}</Text>
      <Text style={styles.infoText}>Entrega: {formatDeliveryDateTime(clientData.deliveryDate)}</Text>

      <Text style={styles.sectionLabel}>Productos</Text>
      {items.map((item, index) => (
        <View key={index} style={styles.itemCard}>
          <Text style={styles.itemCategory}>{categoryLabels[item.category]}</Text>
          <Text style={styles.itemPrice}>${Number(item.price).toLocaleString()}</Text>
        </View>
      ))}

      <Text style={styles.totalText}>Total: ${totalPrice.toLocaleString()}</Text>

      <TextInput
        style={styles.input}
        placeholder="Anticipo pagado"
        value={depositPaid}
        onChangeText={setDepositPaid}
        keyboardType="numeric"
      />

      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Notas generales del pedido"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <TouchableOpacity style={styles.button} onPress={handleConfirm} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#F5EBE0" />
        ) : (
          <Text style={styles.buttonText}>Finalizar pedido</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0' },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#C82333', marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#3E2723', marginTop: 16, marginBottom: 6, textTransform: 'uppercase' },
  infoText: { color: '#3E2723', fontSize: 15, marginBottom: 2 },
  itemCard: {
    backgroundColor: '#F4DCD6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemCategory: { color: '#3E2723', fontWeight: '600' },
  itemPrice: { color: '#3E2723' },
  totalText: { fontSize: 18, fontWeight: '700', color: '#C82333', marginVertical: 16, textAlign: 'right' },
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
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#C82333',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#F5EBE0', fontSize: 16, fontWeight: '600' },
});