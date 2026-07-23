import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useNewOrder } from '../../../src/context/NewOrderContext';
import AutocompleteInput from '../../../src/components/AutocompleteInput';

export default function CupcakeFormScreen() {
  const { addItem } = useNewOrder();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [unitCount, setUnitCount] = useState('');
  const [flavor, setFlavor] = useState('');
  const [filling, setFilling] = useState('');
  const [decorations, setDecorations] = useState('');
  const [price, setPrice] = useState('');

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Necesitamos acceso a tus fotos para agregar la imagen de referencia');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

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
      category: 'CUPCAKE',
      price,
      imageUrl: imageUri,
      details: { unitCount, flavor, filling, decorations },
    } as any);

    return true;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Cupcakes</Text>

      <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <Text style={styles.imagePickerText}>Agregar imagen de referencia</Text>
        )}
      </TouchableOpacity>

      <TextInput style={styles.input} placeholder="Cantidad de unidades" value={unitCount} onChangeText={setUnitCount} keyboardType="numeric" />
      <AutocompleteInput placeholder="Sabor" value={flavor} onChangeText={setFlavor} category="CUPCAKE" field="flavor" />
      <AutocompleteInput placeholder="Relleno" value={filling} onChangeText={setFilling} category="CUPCAKE" field="filling" />
      <TextInput style={styles.input} placeholder="Decoración" value={decorations} onChangeText={setDecorations} />
      <TextInput style={styles.input} placeholder="Precio de este producto" value={price} onChangeText={setPrice} keyboardType="numeric" />

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
  imagePicker: {
    borderWidth: 1, borderColor: '#F4DCD6', borderStyle: 'dashed', borderRadius: 8,
    height: 220, justifyContent: 'center', alignItems: 'center', marginBottom: 14, overflow: 'hidden',
  },
  imagePickerText: { color: '#999' },
  image: { width: '100%', height: '100%' },
  input: {
    borderWidth: 1, borderColor: '#F4DCD6', borderRadius: 8, padding: 14,
    marginBottom: 12, fontSize: 16, backgroundColor: '#fff', color: '#3E2723',
  },
  actionsRow: { gap: 10, marginTop: 8 },
  secondaryButton: { borderWidth: 1, borderColor: '#C82333', borderRadius: 8, padding: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#C82333', fontSize: 15, fontWeight: '600' },
  button: { backgroundColor: '#C82333', borderRadius: 8, padding: 16, alignItems: 'center' },
  buttonText: { color: '#F5EBE0', fontSize: 16, fontWeight: '600' },
});