import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, TextInput } from 'react-native';
import ImageViewerModal from './ImageViewerModal';

interface OrderItem {
  id: string;
  priceAtOrder: string;
  pointsAtOrder: number;
  // Catalog fields are null for a custom line entered from the web admin form.
  flavor: 'VAINILLA' | 'CHOCOLATE' | null;
  customName: string | null;
  customFlavor: string | null;
  customImageUrl: string | null;
  customText: string | null;
  shape: string | null;
  relleno: string | null;
  customSize: string | null;
  productDesign: { name: string; imageUrl: string | null } | null;
  variant: { label: string } | null;
}

const flavorLabels: Record<string, string> = {
  VAINILLA: 'Vainilla',
  CHOCOLATE: 'Chocolate',
};

// "Torta Corazón - 10 porciones" from a catalog item, or the hand-typed name
// for a custom admin line.
function itemTitle(it: OrderItem): string {
  const name = it.productDesign?.name ?? it.customName ?? 'Personalizado';
  const size = it.variant?.label ?? it.customSize;
  return size ? `${name} - ${size}` : name;
}

function itemFlavor(it: OrderItem): string {
  if (it.flavor) return flavorLabels[it.flavor] ?? it.flavor;
  return it.customFlavor ?? '—';
}

interface Order {
  id: string;
  ticketNumber: number;
  clientName: string;
  clientPhone: string;
  deliveryAddress: string | null;
  deliveryDate: string;
  // Minutes-from-midnight on the delivery timeline. Pickup time = start + duration.
  deliveryStartMinutes: number;
  deliveryDurationMin: number;
  totalPrice: string;
  depositPaid: string;
  status: string;
  notes: string | null;
  items: OrderItem[];
}

// Payment status dot: red = no ha pagado nada, azul = abono, verde = pago completo.
// This is about the transfer/payment, not the order's lifecycle status.
function paymentDotColor(status: string): string {
  if (status === 'FULLY_PAID' || status === 'COMPLETED') return '#2E7D32';
  if (status === 'DEPOSIT_PAID') return '#1565C0';
  return '#C82333';
}

interface OrderCardProps {
  order: Order;
  actions?: { label: string; onPress: () => void; destructive?: boolean }[];
  onPaymentUpdate?: (status: 'DEPOSIT_PAID' | 'FULLY_PAID', depositAmount?: number) => void;
  // For orders past their payment deadline (vencidos): cancels the order but keeps
  // whatever amount the client actually transferred, since Melosa doesn't refund
  // partial payments (e.g. a minicake needs 100% but she got 20%, keeps it anyway).
  onCancelWithAmount?: (depositAmount: number) => void;
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

// minutes-from-midnight -> "3:40 p.m."
function minutesToLabel(minutesFromMidnight: number): string {
  let hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const meridiem = hour >= 12 ? 'p.m.' : 'a.m.';
  hour = hour % 12 || 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${meridiem}`;
}

export default function OrderCard({ order, actions = [], onPaymentUpdate, onCancelWithAmount }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [depositInput, setDepositInput] = useState('');
  const firstItem = order.items[0];

  function handleConfirmDeposit() {
    const amount = Number(depositInput);
    if (!depositInput || Number.isNaN(amount) || amount <= 0) return;
    onPaymentUpdate!('DEPOSIT_PAID', amount);
    setDepositInput('');
  }

  function handleCancelWithAmount() {
    const amount = depositInput ? Number(depositInput) : 0;
    if (Number.isNaN(amount) || amount < 0) return;
    onCancelWithAmount!(amount);
    setDepositInput('');
  }

  const showMarkDeposit = onPaymentUpdate && order.status !== 'DEPOSIT_PAID' && order.status !== 'FULLY_PAID' && order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  const showMarkFull = onPaymentUpdate && order.status !== 'FULLY_PAID' && order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  const showCancelWithAmount = onCancelWithAmount && order.status !== 'CANCELLED' && order.status !== 'COMPLETED';

  return (
    <>
      <TouchableOpacity
        style={styles.card}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={styles.headerRow}>
          <Text style={styles.clientName} numberOfLines={1}>#{order.ticketNumber} · {order.clientName}</Text>
          {(order.status === 'AWAITING_PAYMENT' || order.status === 'EXPIRED') && (
            <View style={styles.unpaidBadge}>
              <Text style={styles.unpaidBadgeText}>NO PAGÓ</Text>
            </View>
          )}
          <View style={[styles.paymentDot, { backgroundColor: paymentDotColor(order.status) }]} />
        </View>
        <Text style={styles.category}>
          {firstItem ? itemTitle(firstItem) : ''}
          {order.items.length > 1 ? ` + ${order.items.length - 1} más` : ''}
        </Text>
        <Text style={styles.price}>Total: ${Number(order.totalPrice).toLocaleString()}</Text>
        {!expanded && typeof order.deliveryStartMinutes === 'number' && (
          <Text style={styles.pickupLine}>
            Recoge desde las{' '}
            {minutesToLabel(order.deliveryStartMinutes + (order.deliveryDurationMin ?? 0))}
          </Text>
        )}

        {expanded && (
          <View style={styles.expandedSection}>
            <View style={styles.divider} />

            <Text style={styles.blockLabel}>Datos de contacto</Text>
            <Text style={styles.detailLine}>Entrega: {formatDeliveryDateTime(order.deliveryDate)}</Text>
            {typeof order.deliveryStartMinutes === 'number' && (
              <Text style={styles.detailLine}>
                Listo a partir de las{' '}
                {minutesToLabel(order.deliveryStartMinutes + (order.deliveryDurationMin ?? 0))}
              </Text>
            )}
            <Text style={styles.detailLine}>Teléfono: {order.clientPhone}</Text>
            {order.deliveryAddress ? (
              <Text style={styles.detailLine}>Dirección: {order.deliveryAddress}</Text>
            ) : null}
            <Text style={styles.detailLine}>Anticipo pagado: ${Number(order.depositPaid).toLocaleString()}</Text>
            {order.notes ? <Text style={styles.detailLine}>Notas: {order.notes}</Text> : null}

            <Text style={styles.blockLabel}>Productos ({order.items.length})</Text>

            {order.items.map((item, index) => {
              // Client's print image if there is one, otherwise the catalog photo
              // of the design (so Melosa always sees what the order looks like).
              const photoUrl = item.customImageUrl ?? item.productDesign?.imageUrl ?? null;
              return (
              <View key={item.id} style={styles.itemDetailCard}>
                <Text style={styles.itemDetailTitle}>
                  {index + 1}. {itemTitle(item)}
                </Text>
                <Text style={styles.detailLine}>Sabor: {itemFlavor(item)}</Text>
                {item.shape ? <Text style={styles.detailLine}>Forma: {item.shape}</Text> : null}
                {item.relleno ? <Text style={styles.detailLine}>Relleno: {item.relleno}</Text> : null}

                {photoUrl && (
                  <TouchableOpacity onPress={() => setViewingImage(photoUrl)}>
                    <Image source={{ uri: photoUrl }} style={styles.itemImage} />
                  </TouchableOpacity>
                )}

                {item.customText ? (
                  <Text style={styles.detailLine}>Texto personalizado: {item.customText}</Text>
                ) : null}

                <Text style={styles.itemDetailPrice}>Precio: ${Number(item.priceAtOrder).toLocaleString()}</Text>
              </View>
              );
            })}

            {(showMarkDeposit || showMarkFull || showCancelWithAmount) && (
              <View style={styles.depositForm}>
                {(showMarkDeposit || showCancelWithAmount) && (
                  <TextInput
                    style={styles.depositInputFull}
                    placeholder="¿Cuánto abonó? Ej: 20000 (vacío = nada)"
                    placeholderTextColor="rgba(62,39,35,0.4)"
                    keyboardType="numeric"
                    value={depositInput}
                    onChangeText={setDepositInput}
                  />
                )}
                <View style={styles.actionsRow}>
                  {showMarkDeposit && (
                    <TouchableOpacity
                      style={[styles.depositButton, !depositInput && styles.buttonDisabled]}
                      onPress={handleConfirmDeposit}
                      disabled={!depositInput}
                    >
                      <Text style={styles.fullPaidText}>Marcar abono pagado</Text>
                    </TouchableOpacity>
                  )}
                  {showMarkFull && (
                    <TouchableOpacity style={styles.fullPaidButton} onPress={() => onPaymentUpdate!('FULLY_PAID')}>
                      <Text style={styles.fullPaidText}>Marcar pago completo</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {showCancelWithAmount && (
                  <TouchableOpacity style={styles.deleteButton} onPress={handleCancelWithAmount}>
                    <Text style={styles.deleteText}>
                      {depositInput ? `Cancelar (se queda con $${Number(depositInput).toLocaleString()})` : 'Cancelar (no pagó nada)'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientName: { fontSize: 15, fontWeight: '600', color: '#3E2723', flex: 1 },
  paymentDot: { width: 12, height: 12, borderRadius: 6, marginLeft: 8 },
  unpaidBadge: { backgroundColor: '#C82333', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
  unpaidBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  category: { fontSize: 13, color: '#C82333', marginTop: 2 },
  price: { fontSize: 13, color: '#999', marginTop: 2 },
  pickupLine: { fontSize: 12, color: '#3E2723', marginTop: 2 },
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
  depositButton: { flex: 1, backgroundColor: '#1565C0', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  depositForm: { marginTop: 12 },
  depositInputFull: {
    borderWidth: 1,
    borderColor: '#F4DCD6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F5EBE0',
    color: '#3E2723',
    marginBottom: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  fullPaidButton: { flex: 1, backgroundColor: '#2E7D32', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  fullPaidText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});