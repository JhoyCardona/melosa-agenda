import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ItemCategory } from '../../../src/types/order';

const categories: { label: string; value: ItemCategory }[] = [
  { label: 'Torta', value: 'CAKE' },
  { label: 'Torta de alfajor', value: 'ALFAJOR_CAKE' },
  { label: 'Alfajores por unidad', value: 'ALFAJOR_UNIT' },
  { label: 'Cupcakes', value: 'CUPCAKE' },
  { label: 'Postre', value: 'DESSERT' },
];

export default function CategoryScreen() {
  function handleSelect(category: ItemCategory) {
    if (category === 'CAKE' || category === 'ALFAJOR_CAKE') {
      router.push({ pathname: '/(main)/add-order/cake-form', params: { category } });
    } else {
      alert('Esta categoría todavía no está lista, la agregamos pronto');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Elige la categoría</Text>

      {categories.map((cat) => (
        <TouchableOpacity
          key={cat.value}
          style={styles.button}
          onPress={() => handleSelect(cat.value)}
        >
          <Text style={styles.buttonText}>{cat.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F5EBE0', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: '#C82333', marginBottom: 16 },
  button: {
    backgroundColor: '#F4DCD6',
    borderRadius: 8,
    padding: 16,
  },
  buttonText: { color: '#3E2723', fontSize: 16, fontWeight: '600' },
});