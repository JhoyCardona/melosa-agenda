import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';

interface OrderSummary {
  id: string;
  clientName: string;
  deliveryDate: string;
  status: string;
}

interface BlockedDay {
  date: string; // YYYY-MM-DD
  type: 'VACATION' | 'MANUAL_BLOCK';
}

const months = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const weekdayHeaders = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export default function CalendarScreen() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [blockedByDay, setBlockedByDay] = useState<Record<number, BlockedDay['type']>>({});
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, blockedRes] = await Promise.all([
        api.get('/orders', { params: { month: currentMonth + 1, year: currentYear } }),
        api.get<BlockedDay[]>('/blocked-days', { params: { month: currentMonth + 1, year: currentYear } }),
      ]);
      const pending = ordersRes.data.filter(
        (o: OrderSummary) => o.status !== 'CANCELLED' && o.status !== 'COMPLETED'
      );
      setOrders(pending);
      const byDay: Record<number, BlockedDay['type']> = {};
      blockedRes.data.forEach((b) => {
        byDay[Number(b.date.slice(8, 10))] = b.type;
      });
      setBlockedByDay(byDay);
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  function goToPreviousMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  const ordersCountByDay: Record<number, number> = {};
  orders.forEach((order) => {
    const day = new Date(order.deliveryDate).getUTCDate();
    ordersCountByDay[day] = (ordersCountByDay[day] || 0) + 1;
  });

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function handleDayPress(day: number) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    router.push({ pathname: '/(main)/calendar/day', params: { date: dateStr } });
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{months[currentMonth]} {currentYear}</Text>
        <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayHeaders.map((label, index) => (
          <Text key={index} style={styles.weekdayLabel}>{label}</Text>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#C82333" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.grid}>
          {cells.map((day, index) => {
            const count = day ? ordersCountByDay[day] : undefined;
            const blockedType = day ? blockedByDay[day] : undefined;
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.cell,
                  count ? styles.cellWithOrders : null,
                  blockedType === 'VACATION' && styles.cellVacation,
                  blockedType === 'MANUAL_BLOCK' && styles.cellManualBlock,
                ]}
                disabled={!day}
                onPress={() => day && handleDayPress(day)}
              >
                {day && (
                  <>
                    <Text style={[styles.cellDay, blockedType && styles.cellDayLight]}>{day}</Text>
                    {count ? <Text style={styles.cellCount}>{count}</Text> : null}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const CELL_SIZE = '13.5%';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0', padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navButton: { padding: 8 },
  navButtonText: { fontSize: 22, color: '#C82333', fontWeight: '700' },
  monthLabel: { fontSize: 17, fontWeight: '700', color: '#3E2723', textTransform: 'capitalize' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  weekdayLabel: { width: CELL_SIZE, textAlign: 'center', color: '#999', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: {
    width: CELL_SIZE,
    aspectRatio: 1,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#F4DCD6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  cellWithOrders: { backgroundColor: '#F4DCD6', borderColor: '#C82333' },
  cellVacation: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  cellManualBlock: { backgroundColor: '#C82333', borderColor: '#C82333' },
  cellDay: { fontSize: 13, color: '#3E2723' },
  cellDayLight: { color: '#fff', fontWeight: '700' },
  cellCount: { fontSize: 9, backgroundColor: '#C82333', color: '#fff', borderRadius: 6, paddingHorizontal: 4, marginTop: 2 },
});