import { useState, useCallback } from 'react';
import { Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';
import OrderCard from '../../../src/components/OrderCard';

interface Order {
  id: string;
  deliveryDate: string;
  [key: string]: any;
}

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [year, month] = date.split('-').map(Number);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders', {
        params: { month, year, status: 'PENDING' },
      });
      const filtered = response.data.filter((o: Order) => o.deliveryDate.slice(0, 10) === date);
      setOrders(filtered);
    } catch (error) {
      console.error('Error cargando pedidos del día:', error);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

  function formatDisplayDate(): string {
    const d = new Date(date + 'T00:00:00');
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]}`;
  }

  async function handleMarkCompleted(orderId: string) {
    try {
      await api.patch(`/orders/${orderId}`, { status: 'COMPLETED' });
      loadOrders();
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el pedido');
    }
  }

  async function handleCancel(orderId: string) {
    try {
      await api.patch(`/orders/${orderId}`, { status: 'CANCELLED' });
      loadOrders();
    } catch (error) {
      Alert.alert('Error', 'No se pudo cancelar el pedido');
    }
  }

  function handleDelete(orderId: string) {
    Alert.alert('Eliminar pedido', '¿Estás segura? Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/orders/${orderId}`);
            loadOrders();
          } catch (error) {
            Alert.alert('Error', 'No se pudo eliminar el pedido');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{formatDisplayDate()} · {orders.length} pedido{orders.length !== 1 ? 's' : ''}</Text>

      {loading ? (
        <ActivityIndicator color="#C82333" style={{ marginTop: 30 }} />
      ) : orders.length === 0 ? (
        <Text style={styles.emptyText}>No hay pedidos pendientes este día</Text>
      ) : (
        orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order as any}
            actions={[
              { label: 'Completar', onPress: () => handleMarkCompleted(order.id) },
              { label: 'Cancelar', onPress: () => handleCancel(order.id) },
              { label: 'Eliminar', onPress: () => handleDelete(order.id), destructive: true },
            ]}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0' },
  content: { padding: 20 },
  title: { fontSize: 16, fontWeight: '600', color: '#3E2723', textTransform: 'capitalize', marginBottom: 16 },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 30 },
});