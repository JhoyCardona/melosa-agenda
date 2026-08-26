import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';
import OrderCard from '../../../src/components/OrderCard';

interface Order {
  id: string;
  ticketNumber: number;
  clientName: string;
  clientPhone: string;
  deliveryAddress: string | null;
  deliveryDate: string;
  status: string;
  totalPrice: string;
  depositPaid: string;
  notes: string | null;
  items: any[];
}

type Tab = 'porVencer' | 'vencidos';

export default function NotificationsScreen() {
  const [tab, setTab] = useState<Tab>('vencidos');
  const [porVencer, setPorVencer] = useState<Order[]>([]);
  const [vencidos, setVencidos] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders/notifications');
      setPorVencer(response.data.porVencer);
      setVencidos(response.data.vencidos);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handlePaymentUpdate(orderId: string, status: 'DEPOSIT_PAID' | 'FULLY_PAID', depositAmount?: number) {
    try {
      await api.patch(`/orders/${orderId}`, { status, ...(depositAmount !== undefined && { depositPaid: depositAmount }) });
      load();
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el pago');
    }
  }

  async function handleCancelWithAmount(orderId: string, depositAmount: number) {
    try {
      await api.patch(`/orders/${orderId}`, { status: 'CANCELLED', depositPaid: depositAmount });
      load();
    } catch (error) {
      Alert.alert('Error', 'No se pudo cancelar el pedido');
    }
  }

  const activeOrders = tab === 'porVencer' ? porVencer : vencidos;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Notificaciones</Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'porVencer' && styles.tabButtonActive]}
          onPress={() => setTab('porVencer')}
        >
          <Text style={[styles.tabText, tab === 'porVencer' && styles.tabTextActive]}>
            Por vencer{porVencer.length > 0 ? ` (${porVencer.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'vencidos' && styles.tabButtonActive]}
          onPress={() => setTab('vencidos')}
        >
          <Text style={[styles.tabText, tab === 'vencidos' && styles.tabTextActive]}>
            Vencidos{vencidos.length > 0 ? ` (${vencidos.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#C82333" style={{ marginTop: 30 }} />
      ) : activeOrders.length === 0 ? (
        <Text style={styles.emptyText}>
          {tab === 'porVencer' ? 'No hay pedidos por revisar o con pago próximo a vencer' : 'No hay pedidos vencidos sin pago'}
        </Text>
      ) : (
        activeOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order as any}
            onPaymentUpdate={(status, depositAmount) => handlePaymentUpdate(order.id, status, depositAmount)}
            onCancelWithAmount={tab === 'vencidos' ? (amount) => handleCancelWithAmount(order.id, amount) : undefined}
          />
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
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tabButton: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F4DCD6', alignItems: 'center' },
  tabButtonActive: { backgroundColor: '#C82333' },
  tabText: { color: '#3E2723', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
});
