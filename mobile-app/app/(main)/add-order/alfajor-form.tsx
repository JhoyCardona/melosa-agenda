import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useNewOrder } from '../../../src/context/NewOrderContext';
import AutocompleteInput from '../../../src/components/AutocompleteInput';

export default function AlfajorUnitFormScreen() {
  const { addItem } = useNewOrder();

  const [unitCount, setUnitCount] = useState('');
  const [flavor, setFlavor] = useState('');
  const [price, setPrice] = useState('');

  function handleAddAnother() {
    if (!saveItem()) return;
    Alert.alert('✓ Producto agregado', '', [
      { text: 'OK', onPress: () => router.push('/(main)/add-order/category') },
    ]);
  }

  function handleFinish() {
    if (!saveItem()) return;
    router.push('/(main)/add-order/summary');
  }

  function saveItem(): boolean {
    if (!unitCount || !flavor || !price) {
      Alert.alert('Faltan datos', 'Cantidad, sabor y precio son obligatorios');
      return false;
    }

    addItem({
      category: 'ALFAJOR_UNIT',
      price,
      imageUrl: null,
      details: { unitCount, flavor },
    } as any);

    return true;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Alfajores por unidad</Text>

      <TextInput
        style={styles.input}
        placeholder="Cantidad de unidades"
        value={unitCount}
        onChangeText={setUnitCount}
        keyboardType="numeric"
      />

      <AutocompleteInput
        placeholder="Sabor"
        value={flavor}
        onChangeText={setFlavor}
        category="ALFAJOR_UNIT"
        field="flavor"
      />

      <TextInput
        style={styles.input}
        placeholder="Precio de este producto"
        value={price}
        onChangeText={setPrice}
        keyboardType="numeric"
      />

      <Text style={styles.hint}>
        Si es venta al por mayor, ajustá el precio manualmente acá.
      </Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleAddAnother}>
          <Text style={styles.secondaryButtonText}>+ Agregar otro producto</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleFinish}>
          <Text style={styles.buttonText}>Finalizar pedido</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5EBE0' },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#C82333', marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#F4DCD6',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#3E2723',
  },
  hint: { fontSize: 12, color: '#999', marginBottom: 16, fontStyle: 'italic' },
  actionsRow: { gap: 10, marginTop: 8 },
  secondaryButton: { borderWidth: 1, borderColor: '#C82333', borderRadius: 8, padding: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#C82333', fontSize: 15, fontWeight: '600' },
  button: { backgroundColor: '#C82333', borderRadius: 8, padding: 16, alignItems: 'center' },
  buttonText: { color: '#F5EBE0', fontSize: 16, fontWeight: '600' },
});