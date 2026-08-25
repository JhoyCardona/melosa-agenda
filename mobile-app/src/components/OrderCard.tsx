import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import ImageViewerModal from './ImageViewerModal';

interface OrderItem {
  id: string;
  priceAtOrder: string;
  pointsAtOrder: number;
  flavor: 'VAINILLA' | 'CHOCOLATE';
  customImageUrl: string | null;
  customText: string | null;
  productDesign: { name: string };
  variant: { label: string };
}

const flavorLabels: Record<string, string> = {
  VAINILLA: 'Vainilla',
  CHOCOLATE: 'Chocolate',
};

interface Order {
  id: string;
  ticketNumber: number;
  clientName: string;
  clientPhone: string;
  deliveryAddress: string | null;
  deliveryDate: string;
  totalPrice: string;
  depositPaid: string;
  status: string;
  notes: string | null;
  items: OrderItem[];
}

const statusLabels: Record<string, string> = {
  PENDING_REVIEW: 'Sin revisar',
  AWAITING_PAYMENT: 'Esperando abono',
  DEPOSIT_PAID: 'Abonado',
  FULLY_PAID: 'Pagado',
  COMPLETED: 'Entregado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Vencido',
};

interface OrderCardProps {
  order: Order;
  actions?: { label: string; onPress: () => void; destructive?: boolean }[];
}

function formatDeliveryDateTime(isoString: string): string {
  const date = new Date(isoString);
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const weekday = days[date.getUTCDay()];
  const day = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const hours24 = date.getUTCHours();
  const minutes = date.getUTCMinutes();

  const dateLabel = `${weekday}, ${day} de ${month}`;

  if (hours24 === 0 && minutes === 0) {
    return dateLabel;
  }

  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  const minutesStr = String(minutes).padStart(2, '0');

  return `${dateLabel} · ${hours12}:${minutesStr} ${period}`;
}

export default function OrderCard({ order, actions = [] }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const firstItem = order.items[0];

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <Text style={styles.clientName}>#{order.ticketNumber} · {order.clientName}</Text>
        <Text style={styles.category}>
          {firstItem ? `${firstItem.productDesign.name} - ${firstItem.variant.label}` : ''}
          {order.items.length > 1 ? ` + ${order.items.length - 1} más` : ''}
        </Text>
        <Text style={styles.price}>
          Total: ${Number(order.totalPrice).toLocaleString()} · {statusLabels[order.status] ?? order.status}
        </Text>

        {expanded && (
          <View style={styles.expandedSection}>
            <View style={styles.divider} />

            <Text style={styles.blockLabel}>Datos de contacto</Text>
            <Text style={styles.detailLine}>Entrega: {formatDeliveryDateTime(order.deliveryDate)}</Text>
            <Text style={styles.detailLine}>Teléfono: {order.clientPhone}</Text>
            {order.deliveryAddress ? (
              <Text style={styles.detailLine}>Dirección: {order.deliveryAddress}</Text>
            ) : null}
            <Text style={styles.detailLine}>Anticipo pagado: ${Number(order.depositPaid).toLocaleString()}</Text>
            {order.notes ? <Text style={styles.detailLine}>Notas: {order.notes}</Text> : null}

            <Text style={styles.blockLabel}>Productos ({order.items.length})</Text>

            {order.items.map((item, index) => (
              <View key={item.id} style={styles.itemDetailCard}>
                <Text style={styles.itemDetailTitle}>
                  {index + 1}. {item.productDesign.name} - {item.variant.label}
                </Text>
                <Text style={styles.detailLine}>Sabor: {flavorLabels[item.flavor] ?? item.flavor}</Text>

                {item.customImageUrl && (
                  <TouchableOpacity onPress={() => setViewingImage(item.customImageUrl)}>
                    <Image source={{ uri: item.customImageUrl }} style={styles.itemImage} />
                  </TouchableOpacity>
                )}

                {item.customText ? (
                  <Text style={styles.detailLine}>Texto personalizado: {item.customText}</Text>
                ) : null}

                <Text style={styles.itemDetailPrice}>Precio: ${Number(item.priceAtOrder).toLocaleString()}</Text>
              </View>
            ))}

            {actions.length > 0 && (
              <View style={styles.actionsRow}>
                {actions.map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={action.destructive ? styles.deleteButton : styles.actionButton}
                    onPress={action.onPress}
                  >
                    <Text style={action.destructive ? styles.deleteText : styles.actionText}>
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
      <ImageViewerModal
      visible={!!viewingImage}
      imageUrl={viewingImage}
      onClose={() => setViewingImage(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
  itemDetailCard: { backgroundColor: '#F5EBE0', borderRadius: 6, padding: 10, marginBottom: 8 },
  itemDetailTitle: { fontSize: 14, fontWeight: '700', color: '#3E2723', marginBottom: 4 },
  itemImage: { width: '100%', height: 120, borderRadius: 6, marginBottom: 6 },
  itemDetailPrice: { fontSize: 13, fontWeight: '600', color: '#C82333', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionButton: { flex: 1, backgroundColor: '#F4DCD6', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  actionText: { color: '#3E2723', fontSize: 13, fontWeight: '600' },
  deleteButton: { flex: 1, backgroundColor: '#C82333', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  deleteText: { color: '#F5EBE0', fontSize: 13, fontWeight: '600' },
});