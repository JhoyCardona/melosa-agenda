import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';
import OrderCard from '../../../src/components/OrderCard';

interface Order {
  id: string;
  deliveryDate: string;
  status: string;
  [key: string]: any;
}

interface FlavorGroup {
  flavor: 'VAINILLA' | 'CHOCOLATE';
  quantity: number;
}

interface ShapeGroup {
  shape: string;
  quantity: number;
  flavors: FlavorGroup[];
}

interface SizeGroup {
  sizeLabel: string;
  quantity: number;
  shapes: ShapeGroup[];
}

const flavorLabels: Record<string, string> = {
  VAINILLA: 'vainilla',
  CHOCOLATE: 'chocolate',
};

type Tab = 'resumen' | 'detalle';

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [tab, setTab] = useState<Tab>('resumen');
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<SizeGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = date.split('-').map(Number);
      const [summaryRes, listRes] = await Promise.all([
        api.get('/orders/day-summary', { params: { date } }),
        api.get('/orders', { params: { month, year } }),
      ]);
      setSummary(summaryRes.data.sizes);
      const filtered = listRes.data.filter(
        (o: Order) => o.deliveryDate.slice(0, 10) === date && o.status !== 'CANCELLED'
      );
      setOrders(filtered);
    } catch (error) {
      console.error('Error cargando datos del día:', error);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  function formatDisplayDate(): string {
    const d = new Date(date + 'T00:00:00');
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]}`;
  }

  async function handleMarkCompleted(orderId: string) {
    try {
      await api.patch(`/orders/${orderId}`, { status: 'COMPLETED' });
      loadData();
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el pedido');
    }
  }

  async function handleCancel(orderId: string) {
    try {
      await api.patch(`/orders/${orderId}`, { status: 'CANCELLED' });
      loadData();
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
            loadData();
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

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'resumen' && styles.tabButtonActive]}
          onPress={() => setTab('resumen')}
        >
          <Text style={[styles.tabText, tab === 'resumen' && styles.tabTextActive]}>Resumen para hornear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'detalle' && styles.tabButtonActive]}
          onPress={() => setTab('detalle')}
        >
          <Text style={[styles.tabText, tab === 'detalle' && styles.tabTextActive]}>Detalle por pedido</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#C82333" style={{ marginTop: 30 }} />
      ) : tab === 'resumen' ? (
        summary.length === 0 ? (
          <Text style={styles.emptyText}>No hay productos agendados este día</Text>
        ) : (
          summary.map((size) => (
            <View key={size.sizeLabel} style={styles.summaryCard}>
              <Text style={styles.summarySize}>{size.sizeLabel} x{size.quantity}</Text>
              {size.shapes.map((shape) => (
                <Text key={shape.shape} style={styles.summaryShapeLine}>
                  {shape.shape} x{shape.quantity}
                  {'  '}
                  {shape.flavors
                    .map((f) => `${flavorLabels[f.flavor] ?? f.flavor} x${f.quantity}`)
                    .join('  ')}
                </Text>
              ))}
            </View>
          ))
        )
      ) : orders.length === 0 ? (
        <Text style={styles.emptyText}>No hay pedidos este día</Text>
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
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F4DCD6', alignItems: 'center' },
  tabButtonActive: { backgroundColor: '#C82333' },
  tabText: { color: '#3E2723', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#F4DCD6',
    padding: 14,
    marginBottom: 10,
  },
  summarySize: { fontSize: 16, color: '#C82333', fontWeight: '700', marginBottom: 6 },
  summaryShapeLine: { fontSize: 13, color: '#3E2723', marginLeft: 8, marginTop: 2 },
});
