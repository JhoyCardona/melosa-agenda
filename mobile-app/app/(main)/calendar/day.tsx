import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity, Image, Linking } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import api from '../../../src/config/api';
import OrderCard from '../../../src/components/OrderCard';
import ImageViewerModal from '../../../src/components/ImageViewerModal';

const API_URL = 'https://melosa-agenda-backend.onrender.com/api';

interface Order {
  id: string;
  deliveryDate: string;
  status: string;
  [key: string]: any;
}

interface FlavorGroup {
  // 'VAINILLA' / 'CHOCOLATE' for catalog items; a free string for custom lines.
  flavor: string;
  quantity: number;
  unpaidQuantity: number;
}

interface ShapeGroup {
  shape: string;
  quantity: number;
  unpaidQuantity: number;
  flavors: FlavorGroup[];
}

interface SizeGroup {
  sizeLabel: string;
  quantity: number;
  unpaidQuantity: number;
  shapes: ShapeGroup[];
}

const flavorLabels: Record<string, string> = {
  VAINILLA: 'vainilla',
  CHOCOLATE: 'chocolate',
};

interface GalleryImage {
  itemId: string;
  ticketNumber: number;
  clientName: string;
  productDesignName: string;
  variantLabel: string;
  imageUrl: string;
}

type Tab = 'resumen' | 'detalle' | 'galeria';

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [tab, setTab] = useState<Tab>('resumen');
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<SizeGroup[]>([]);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [year, month] = date.split('-').map(Number);
      const [summaryRes, listRes, galleryRes] = await Promise.all([
        api.get('/orders/day-summary', { params: { date } }),
        api.get('/orders', { params: { month, year } }),
        api.get('/orders/day-gallery', { params: { date } }),
      ]);
      setSummary(summaryRes.data.sizes);
      const filtered = listRes.data
        .filter((o: Order) => o.deliveryDate.slice(0, 10) === date && o.status !== 'CANCELLED')
        .sort(
          (a: Order, b: Order) => (a.deliveryStartMinutes ?? 0) - (b.deliveryStartMinutes ?? 0)
        );
      setOrders(filtered);
      setGallery(galleryRes.data);
    } catch (error) {
      console.error('Error cargando datos del día:', error);
    } finally {
      setLoading(false);
    }
  }, [date]);

  // Opens the ZIP in the system browser/downloader instead of fetching it in-app —
  // simplest way to hand Melosa a real file in her phone's Downloads (or, once she
  // copies the link, on her PC too) without adding file-system/sharing dependencies.
  async function handleDownloadZip() {
    setDownloadingZip(true);
    try {
      const token = await SecureStore.getItemAsync('authToken');
      const url = `${API_URL}/orders/day-gallery/zip?date=${date}&token=${encodeURIComponent(token ?? '')}`;
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Error', 'No se pudo iniciar la descarga del ZIP');
    } finally {
      setDownloadingZip(false);
    }
  }

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
    } catch (error: any) {
      const message = error?.response?.data?.error ?? 'No se pudo actualizar el pedido';
      Alert.alert('No se pudo completar', message);
    }
  }

  async function handlePaymentUpdate(orderId: string, status: 'DEPOSIT_PAID' | 'FULLY_PAID', depositAmount?: number) {
    try {
      await api.patch(`/orders/${orderId}`, { status, ...(depositAmount !== undefined && { depositPaid: depositAmount }) });
      loadData();
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el pago');
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
        <TouchableOpacity
          style={[styles.tabButton, tab === 'galeria' && styles.tabButtonActive]}
          onPress={() => setTab('galeria')}
        >
          <Text style={[styles.tabText, tab === 'galeria' && styles.tabTextActive]}>Galería{gallery.length > 0 ? ` (${gallery.length})` : ''}</Text>
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
              <Text style={styles.summarySize}>
                {size.sizeLabel} x{size.quantity}
                {size.unpaidQuantity > 0 ? ` (${size.unpaidQuantity} sin pagar)` : ''}
              </Text>
              {size.shapes.map((shape) => (
                <Text key={shape.shape} style={styles.summaryShapeLine}>
                  {shape.shape} x{shape.quantity}
                  {'  '}
                  {shape.flavors
                    .map((f) => {
                      const label = `${flavorLabels[f.flavor] ?? f.flavor} x${f.quantity}`;
                      return f.unpaidQuantity > 0 ? `${label} (${f.unpaidQuantity} sin pagar)` : label;
                    })
                    .join('  ')}
                </Text>
              ))}
            </View>
          ))
        )
      ) : tab === 'detalle' ? (
        orders.length === 0 ? (
          <Text style={styles.emptyText}>No hay pedidos este día</Text>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order as any}
              onPaymentUpdate={(status, depositAmount) => handlePaymentUpdate(order.id, status, depositAmount)}
              actions={[
                { label: 'Completar', onPress: () => handleMarkCompleted(order.id) },
                { label: 'Cancelar', onPress: () => handleCancel(order.id) },
                { label: 'Eliminar', onPress: () => handleDelete(order.id), destructive: true },
              ]}
            />
          ))
        )
      ) : gallery.length === 0 ? (
        <Text style={styles.emptyText}>No hay imágenes personalizadas este día</Text>
      ) : (
        <>
          <TouchableOpacity
            style={styles.zipButton}
            onPress={handleDownloadZip}
            disabled={downloadingZip}
          >
            <Text style={styles.zipButtonText}>
              {downloadingZip ? 'Preparando descarga...' : `Descargar todo (.zip, ${gallery.length})`}
            </Text>
          </TouchableOpacity>
          <View style={styles.galleryGrid}>
            {gallery.map((image) => (
              <TouchableOpacity
                key={image.itemId}
                style={styles.galleryThumbWrap}
                onPress={() => setViewerImageUrl(image.imageUrl)}
              >
                <Image source={{ uri: image.imageUrl }} style={styles.galleryThumb} />
                <Text style={styles.galleryCaption} numberOfLines={1}>
                  #{image.ticketNumber} · {image.clientName}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <ImageViewerModal
        visible={!!viewerImageUrl}
        imageUrl={viewerImageUrl}
        onClose={() => setViewerImageUrl(null)}
      />
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
  zipButton: {
    backgroundColor: '#C82333',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  zipButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  galleryThumbWrap: { width: '31%' },
  galleryThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#F4DCD6',
  },
  galleryCaption: { fontSize: 11, color: '#3E2723', marginTop: 4 },
});
