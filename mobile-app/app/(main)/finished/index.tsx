import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';
import OrderCard from '../../../src/components/OrderCard';

// EXPIRED orders live only in Notificaciones → "Vencidos" (that's where the
// "cancel keeping the partial deposit" action is). This screen is just the
// terminal archive.
type TabStatus = 'COMPLETED' | 'CANCELLED';

const tabs: { label: string; status: TabStatus }[] = [
  { label: 'Completados', status: 'COMPLETED' },
  { label: 'Cancelados', status: 'CANCELLED' },
];

export default function FinishedScreen() {
  const [activeTab, setActiveTab] = useState<TabStatus>('COMPLETED');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders', { params: { status: activeTab } });
      setOrders(response.data);
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

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

  function getActionsForTab(orderId: string) {
    if (activeTab === 'CANCELLED') {
      return [{ label: 'Eliminar', onPress: () => handleDelete(orderId), destructive: true }];
    }
    return []; // COMPLETED — terminal, no actions
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.status}
            style={[styles.tab, activeTab === tab.status && styles.tabActive]}
            onPress={() => setActiveTab(tab.status)}
          >
            <Text style={[styles.tabText, activeTab === tab.status && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color="#C82333" style={{ marginTop: 30 }} />
        ) : orders.length === 0 ? (
          <Text style={styles.emptyText}>No hay pedidos en esta categoría</Text>
        ) : (
          orders.map((order) => (
            <OrderCard key={order.id} order={order} actions={getActionsForTab(order.id)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: '#F4DCD6',
  },
  tabActive: { backgroundColor: '#C82333', borderColor: '#C82333' },
  tabText: { fontSize: 13, color: '#3E2723', fontWeight: '600' },
  tabTextActive: { color: '#F5EBE0' },
  content: { padding: 20 },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 30 },
});