import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';
import OrderCard from '../../../src/components/OrderCard';

type TabStatus = 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

const tabs: { label: string; status: TabStatus }[] = [
  { label: 'Completados', status: 'COMPLETED' },
  { label: 'Cancelados', status: 'CANCELLED' },
  { label: 'Vencidos', status: 'EXPIRED' },
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

  async function handleReactivate(orderId: string) {
    try {
      await api.patch(`/orders/${orderId}`, { status: 'PENDING_REVIEW' });
      loadOrders();
    } catch (error) {
      Alert.alert('Error', 'No se pudo reactivar el pedido');
    }
  }

  async function handleMarkCompleted(orderId: string) {
    try {
      await api.patch(`/orders/${orderId}`, { status: 'COMPLETED' });
      loadOrders();
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el pedido');
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

  function getActionsForTab(orderId: string) {
    if (activeTab === 'COMPLETED') {
      return [];
    }
    if (activeTab === 'CANCELLED') {
      return [
        { label: 'Reactivar', onPress: () => handleReactivate(orderId) },
        { label: 'Eliminar', onPress: () => handleDelete(orderId), destructive: true },
      ];
    }
    return [
      { label: 'Completar', onPress: () => handleMarkCompleted(orderId) },
      { label: 'Eliminar', onPress: () => handleDelete(orderId), destructive: true },
    ];
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