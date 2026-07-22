import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HeaderProps {
  showBack?: boolean;
}

export default function Header({ showBack = true }: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <View style={styles.side}>
        {showBack && (
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.center}>
        {/* Acá va el logo + "Melosa Bakery" cuando tengamos el logo listo */}
      </View>

      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#C82333',
  },
  side: { width: 40 },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 28, color: '#F5EBE0', fontWeight: '600' },
});