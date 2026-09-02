import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import api from '../../../src/config/api';

interface BlockedDay {
  date: string; // YYYY-MM-DD
  type: 'VACATION' | 'MANUAL_BLOCK';
}

const months = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const weekdayHeaders = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export default function BlockDaysScreen() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [blockedByDay, setBlockedByDay] = useState<Record<number, BlockedDay['type']>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadBlockedDays = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<BlockedDay[]>('/blocked-days', {
        params: { month: currentMonth + 1, year: currentYear },
      });
      const byDay: Record<number, BlockedDay['type']> = {};
      response.data.forEach((b) => {
        const day = Number(b.date.slice(8, 10));
        byDay[day] = b.type;
      });
      setBlockedByDay(byDay);
    } catch (error) {
      console.error('Error cargando días bloqueados:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear]);

  useFocusEffect(
    useCallback(() => {
      setSelected(new Set());
      loadBlockedDays();
    }, [loadBlockedDays])
  );

  function goToPreviousMonth() {
    setSelected(new Set());
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    setSelected(new Set());
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function dateStrFor(day: number): string {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  async function unblock(dateStr: string) {
    try {
      await api.delete(`/blocked-days/${dateStr}`);
      loadBlockedDays();
    } catch (error) {
      Alert.alert('Error', 'No se pudo desbloquear el día');
    }
  }

  function handleDayPress(day: number) {
    const dateStr = dateStrFor(day);
    const existingType = blockedByDay[day];

    if (existingType) {
      const reason = existingType === 'VACATION' ? 'por vacaciones' : 'manualmente';
      Alert.alert(
        'Día ya bloqueado',
        `Este día ya está bloqueado ${reason}. ¿Deseas desbloquearlo?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Desbloquear', style: 'destructive', onPress: () => unblock(dateStr) },
        ]
      );
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }

  async function handleSave(type: BlockedDay['type']) {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await api.post('/blocked-days', { dates: Array.from(selected), type });
      setSelected(new Set());
      await loadBlockedDays();
    } catch (error) {
      Alert.alert('Error', 'No se pudieron bloquear los días seleccionados');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Toca los días que quieres bloquear y luego elige el motivo abajo. Tocar un día ya
        bloqueado te permite desbloquearlo.
      </Text>

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
            const dateStr = day ? dateStrFor(day) : null;
            const persistedType = day ? blockedByDay[day] : undefined;
            const isPendingSelection = dateStr ? selected.has(dateStr) : false;
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.cell,
                  persistedType === 'VACATION' && styles.cellVacation,
                  persistedType === 'MANUAL_BLOCK' && styles.cellManualBlock,
                  isPendingSelection && styles.cellPending,
                ]}
                disabled={!day}
                onPress={() => day && handleDayPress(day)}
              >
                {day && (
                  <Text style={[
                    styles.cellDay,
                    (persistedType || isPendingSelection) && styles.cellDayLight,
                  ]}>
                    {day}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.actionsBar}>
        <TouchableOpacity
          style={[styles.actionButton, styles.vacationButton, (selected.size === 0 || saving) && styles.actionButtonDisabled]}
          disabled={selected.size === 0 || saving}
          onPress={() => handleSave('VACATION')}
        >
          <Text style={styles.actionButtonText}>Agendar vacaciones</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.blockButton, (selected.size === 0 || saving) && styles.actionButtonDisabled]}
          disabled={selected.size === 0 || saving}
          onPress={() => handleSave('MANUAL_BLOCK')}
        >
          <Text style={styles.actionButtonText}>Bloquear estos días</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CELL_SIZE = '13.5%';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0', padding: 16 },
  hint: { fontSize: 13, color: '#3E2723', marginBottom: 12 },
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
  cellVacation: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  cellManualBlock: { backgroundColor: '#C82333', borderColor: '#C82333' },
  cellPending: { borderWidth: 2, borderColor: '#3E2723', backgroundColor: '#F4DCD6' },
  cellDay: { fontSize: 13, color: '#3E2723' },
  cellDayLight: { color: '#fff', fontWeight: '700' },
  actionsBar: { flexDirection: 'row', gap: 10, marginTop: 20 },
  actionButton: { flex: 1, borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  vacationButton: { backgroundColor: '#2E7D32' },
  blockButton: { backgroundColor: '#C82333' },
  actionButtonDisabled: { opacity: 0.4 },
  actionButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
