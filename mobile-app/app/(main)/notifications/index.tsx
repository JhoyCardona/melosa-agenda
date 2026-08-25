import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';

interface NotificationOrder {
  id: string;
  ticketNumber: number;
  clientName: string;
  deliveryDate: string;
  status: string;
  totalPrice: string;
  depositPaid: string;
}

const statusLabels: Record<string, string> = {
  PENDING_REVIEW: 'Sin revisar',
  AWAITING_PAYMENT: 'Esperando abono',
  EXPIRED: 'Vencido, sin pago',
};

export default function NotificationsScreen() {
  const [orders, setOrders] = useState<NotificationOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders/notifications');
      setOrders(response.data);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function formatDate(isoString: string): string {
    const d = new Date(isoString);
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Pedidos por revisar en los próximos 2 días</Text>

      {loading ? (
        <ActivityIndicator color="#C82333" style={{ marginTop: 30 }} />
      ) : orders.length === 0 ? (
        <Text style={styles.emptyText}>No hay pedidos pendientes de pago próximos</Text>
      ) : (
        orders.map((order) => (
          <TouchableOpacity
            key={order.id}
            style={[styles.card, order.status === 'EXPIRED' && styles.cardExpired]}
            onPress={() => router.push({ pathname: '/(main)/calendar/day', params: { date: order.deliveryDate.slice(0, 10) } })}
          >
            <Text style={styles.clientName}>#{order.ticketNumber} · {order.clientName}</Text>
            <Text style={styles.detail}>Entrega: {formatDate(order.deliveryDate)}</Text>
            <Text style={styles.detail}>
              {statusLabels[order.status] ?? order.status} · Total: ${Number(order.totalPrice).toLocaleString()}
              {Number(order.depositPaid) > 0 ? ` · Abonado: $${Number(order.depositPaid).toLocaleString()}` : ''}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0' },
  content: { padding: 20 },
  title: { fontSize: 16, fontWeight: '600', color: '#3E2723', marginBottom: 16 },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 30 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#F4DCD6',
    padding: 14,
    marginBottom: 10,
  },
  cardExpired: { borderColor: '#C82333', borderWidth: 1 },
  clientName: { fontSize: 15, fontWeight: '600', color: '#3E2723' },
  detail: { fontSize: 13, color: '#666', marginTop: 2 },
});
