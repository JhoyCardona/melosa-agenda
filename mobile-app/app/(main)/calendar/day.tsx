import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';

interface OrderItem {
  id: string;
  category: string;
  price: string;
  imageUrl: string | null;
  details: Record<string, string>;
}

interface Order {
  id: string;
  clientName: string;
  clientPhone: string;
  deliveryAddress: string | null;
  deliveryDate: string;
  totalPrice: string;
  depositPaid: string;
  notes: string | null;
  items: OrderItem[];
}

const categoryLabels: Record<string, string> = {
  CAKE: 'Torta',
  ALFAJOR_CAKE: 'Torta de alfajor',
  ALFAJOR_UNIT: 'Alfajores por unidad',
  CUPCAKE: 'Cupcakes',
  DESSERT: 'Postre',
};

const detailFieldLabels: Record<string, string> = {
  servings: 'Porciones',
  flavor: 'Sabor',
  filling: 'Relleno',
  color: 'Color',
  decorations: 'Adornos',
  cakeText: 'Texto en la torta',
  unitCount: 'Cantidad de unidades',
};

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [year, month] = date.split('-').map(Number);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders', {
        params: { month, year, status: 'PENDING' },
      });
      const filtered = response.data.filter(
        (o: Order) => o.deliveryDate.slice(0, 10) === date
      );
      setOrders(filtered);
    } catch (error) {
      console.error('Error cargando pedidos del día:', error);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

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
        orders.map((order) => {
          const isExpanded = expandedId === order.id;
          const firstItem = order.items[0];

          return (
            <TouchableOpacity
              key={order.id}
              style={styles.card}
              onPress={() => setExpandedId(isExpanded ? null : order.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.clientName}>{order.clientName}</Text>
              <Text style={styles.category}>
                {firstItem ? categoryLabels[firstItem.category] : ''}
                {order.items.length > 1 ? ` + ${order.items.length - 1} más` : ''}
              </Text>
              <Text style={styles.price}>Total: ${Number(order.totalPrice).toLocaleString()}</Text>

              {isExpanded && (
                <View style={styles.expandedSection}>
                  <View style={styles.divider} />

                  <Text style={styles.blockLabel}>Datos de contacto</Text>
                  <Text style={styles.detailLine}>Teléfono: {order.clientPhone}</Text>
                  {order.deliveryAddress ? (
                    <Text style={styles.detailLine}>Dirección: {order.deliveryAddress}</Text>
                  ) : null}
                  <Text style={styles.detailLine}>Anticipo pagado: ${Number(order.depositPaid).toLocaleString()}</Text>
                  {order.notes ? (
                    <Text style={styles.detailLine}>Notas: {order.notes}</Text>
                  ) : null}

                  <Text style={styles.blockLabel}>
                    Productos ({order.items.length})
                  </Text>

                  {order.items.map((item, index) => (
                    <View key={item.id} style={styles.itemDetailCard}>
                      <Text style={styles.itemDetailTitle}>
                        {index + 1}. {categoryLabels[item.category]}
                      </Text>

                      {item.imageUrl && (
                        <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
                      )}

                      {Object.entries(item.details).map(([key, value]) => {
                        if (!value) return null;
                        const label = detailFieldLabels[key] || key;
                        return (
                          <Text key={key} style={styles.detailLine}>
                            {label}: {value}
                          </Text>
                        );
                      })}

                      <Text style={styles.itemDetailPrice}>
                        Precio: ${Number(item.price).toLocaleString()}
                      </Text>
                    </View>
                  ))}

                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleMarkCompleted(order.id)}>
                      <Text style={styles.actionText}>Completar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton} onPress={() => handleCancel(order.id)}>
                      <Text style={styles.actionText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(order.id)}>
                      <Text style={styles.deleteText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0' },
  content: { padding: 20 },
  title: { fontSize: 16, fontWeight: '600', color: '#3E2723', textTransform: 'capitalize', marginBottom: 16 },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 30 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: '#F4DCD6',
    padding: 14,
    marginBottom: 10,
  },
  clientName: { fontSize: 15, fontWeight: '600', color: '#3E2723' },
  category: { fontSize: 13, color: '#C82333', marginTop: 2 },
  price: { fontSize: 13, color: '#999', marginTop: 2 },
  expandedSection: { marginTop: 4 },
  divider: { height: 1, backgroundColor: '#F4DCD6', marginVertical: 12 },
  blockLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C82333',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 6,
  },
  detailLine: { fontSize: 13, color: '#3E2723', marginBottom: 2 },
  itemDetailCard: {
    backgroundColor: '#F5EBE0',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  itemDetailTitle: { fontSize: 14, fontWeight: '700', color: '#3E2723', marginBottom: 4 },
  itemImage: { width: '100%', height: 120, borderRadius: 6, marginBottom: 6 },
  itemDetailPrice: { fontSize: 13, fontWeight: '600', color: '#C82333', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionButton: {
    flex: 1,
    backgroundColor: '#F4DCD6',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionText: { color: '#3E2723', fontSize: 13, fontWeight: '600' },
  deleteButton: {
    flex: 1,
    backgroundColor: '#C82333',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteText: { color: '#F5EBE0', fontSize: 13, fontWeight: '600' },
});