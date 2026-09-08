import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import api from '../../../src/config/api';
import OrderCard from '../../../src/components/OrderCard';

export default function SearchByTicketScreen() {
  const [ticketInput, setTicketInput] = useState('');
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function handleSearch() {
    if (!ticketInput.trim()) return;
    setLoading(true);
    setNotFound(false);
    setLoadError(false);
    setOrder(null);
    try {
      const response = await api.get(`/orders/ticket/${ticketInput.trim()}`);
      setOrder(response.data);
    } catch (error: any) {
      // 400/404 = ese ticket no existe; cualquier otra cosa = fallo de conexión.
      if (error?.response?.status === 404 || error?.response?.status === 400) {
        setNotFound(true);
      } else {
        setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePaymentUpdate(status: 'DEPOSIT_PAID' | 'FULLY_PAID', depositAmount?: number) {
    if (!order) return;
    try {
      await api.patch(`/orders/${order.id}`, { status, ...(depositAmount !== undefined && { depositPaid: depositAmount }) });
      await handleSearch();
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el pago');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Buscar pedido por ticket</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Número de ticket"
          placeholderTextColor="rgba(62,39,35,0.4)"
          value={ticketInput}
          onChangeText={setTicketInput}
          keyboardType="numeric"
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Buscar</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color="#C82333" style={{ marginTop: 30 }} />}

      {notFound && !loading && (
        <Text style={styles.emptyText}>No existe un pedido con el ticket #{ticketInput}</Text>
      )}

      {loadError && !loading && (
        <View style={{ alignItems: 'center', marginTop: 30 }}>
          <Text style={styles.emptyText}>No se pudo conectar. Revisá tu internet.</Text>
          <TouchableOpacity
            style={[styles.searchButton, { paddingVertical: 10, marginTop: 12 }]}
            onPress={handleSearch}
          >
            <Text style={styles.searchButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {order && !loading && (
        <OrderCard order={order} onPaymentUpdate={handlePaymentUpdate} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0' },
  content: { padding: 20 },
  title: { fontSize: 16, fontWeight: '600', color: '#3E2723', marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#F4DCD6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#3E2723',
  },
  searchButton: {
    backgroundColor: '#C82333',
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  searchButtonText: { color: '#fff', fontWeight: '600' },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 30 },
});
