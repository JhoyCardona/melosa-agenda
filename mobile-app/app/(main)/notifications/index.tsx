import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';
import OrderCard from '../../../src/components/OrderCard';
import ErrorRetry from '../../../src/components/ErrorRetry';

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

// "cambios" = orders a client modified or cancelled from their private web link
// in the last 3 days — gretica has no push notifications, so they surface here.
type Tab = 'porVencer' | 'vencidos' | 'cambios';

// Cancelling an order with money paid: ask whether that money stays as the
// client's saldo a favor (e.g. they asked to cancel by WhatsApp) or is simply
// kept (e.g. they never finished paying). Money is never refunded either way.
function askCreditThen(paid: number, cancel: (creditDeposit: boolean) => void) {
  if (paid <= 0) {
    cancel(false);
    return;
  }
  Alert.alert(
    '¿Dejar el abono como saldo a favor?',
    `El cliente pagó $${paid.toLocaleString()}. Si lo dejas como saldo a favor, lo puede usar en un próximo pedido.`,
    [
      { text: 'Volver', style: 'cancel' },
      { text: 'No, solo cancelar', onPress: () => cancel(false) },
      { text: 'Sí, dejar saldo', onPress: () => cancel(true) },
    ]
  );
}

export default function NotificationsScreen() {
  const [tab, setTab] = useState<Tab>('vencidos');
  const [porVencer, setPorVencer] = useState<Order[]>([]);
  const [vencidos, setVencidos] = useState<Order[]>([]);
  const [cambios, setCambios] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const response = await api.get('/orders/notifications');
      setPorVencer(response.data.porVencer);
      setVencidos(response.data.vencidos);
      setCambios(response.data.modificados ?? []);
    } catch (err) {
      console.error('Error cargando notificaciones:', err);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handlePaymentUpdate(orderId: string, status: 'DEPOSIT_PAID' | 'FULLY_PAID', depositAmount?: number) {
    try {
      await api.patch(`/orders/${orderId}`, { status, ...(depositAmount !== undefined && { depositPaid: depositAmount }) });
      await load('refresh');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el pago');
    }
  }

  async function handleCancelWithAmount(orderId: string, depositAmount: number, creditDeposit: boolean) {
    try {
      await api.patch(`/orders/${orderId}`, { status: 'CANCELLED', depositPaid: depositAmount, creditDeposit });
      await load('refresh');
    } catch (error) {
      Alert.alert('Error', 'No se pudo cancelar el pedido');
    }
  }

  // Pays this order with the client's saldo a favor (as much as it covers).
  async function handleApplyCredit(orderId: string) {
    try {
      const { data } = await api.post(`/orders/${orderId}/apply-credit`);
      Alert.alert('Saldo aplicado', `Se usaron $${Number(data.applied).toLocaleString()} del saldo a favor.`);
      await load('refresh');
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.error ?? 'No se pudo aplicar el saldo a favor');
    }
  }

  const activeOrders = tab === 'porVencer' ? porVencer : tab === 'vencidos' ? vencidos : cambios;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor="#C82333" />
      }
    >
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
        <TouchableOpacity
          style={[styles.tabButton, tab === 'cambios' && styles.tabButtonActive]}
          onPress={() => setTab('cambios')}
        >
          <Text style={[styles.tabText, tab === 'cambios' && styles.tabTextActive]}>
            Cambios{cambios.length > 0 ? ` (${cambios.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#C82333" style={{ marginTop: 30 }} />
      ) : error ? (
        <ErrorRetry onRetry={() => load()} message="No se pudieron cargar las notificaciones." />
      ) : activeOrders.length === 0 ? (
        <Text style={styles.emptyText}>
          {tab === 'porVencer'
            ? 'No hay pedidos por revisar o con pago próximo a vencer'
            : tab === 'vencidos'
              ? 'No hay pedidos vencidos sin pago'
              : 'Ningún cliente ha cambiado o cancelado su pedido en los últimos 3 días'}
        </Text>
      ) : (
        activeOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order as any}
            onPaymentUpdate={
              order.status === 'CANCELLED'
                ? undefined
                : (status, depositAmount) => handlePaymentUpdate(order.id, status, depositAmount)
            }
            onApplyCredit={() => handleApplyCredit(order.id)}
            onCancelWithAmount={
              tab === 'vencidos'
                ? (amount) => askCreditThen(amount, (credit) => handleCancelWithAmount(order.id, amount, credit))
                : undefined
            }
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
