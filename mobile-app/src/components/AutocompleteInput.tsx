import { useState, useEffect } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet } from 'react-native';
import api from '../config/api';

interface AutocompleteInputProps {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  category: string;
  field: string;
  keyboardType?: 'default' | 'numeric';
}

export default function AutocompleteInput({
  placeholder,
  value,
  onChangeText,
  category,
  field,
  keyboardType = 'default',
}: AutocompleteInputProps) {
  const [allSuggestions, setAllSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    async function loadSuggestions() {
      try {
        const response = await api.get('/orders/suggestions/field', {
          params: { category, field },
        });
        setAllSuggestions(response.data);
      } catch (error) {
        console.error('Error cargando sugerencias:', error);
      }
    }
    loadSuggestions();
  }, [category, field]);

  const filteredSuggestions = allSuggestions.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()
  );

  return (
    <View style={styles.wrapper}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="rgba(62,39,35,0.4)"
        value={value}
        onChangeText={(text) => {
          onChangeText(text);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        keyboardType={keyboardType}
      />

      {showSuggestions && value.length > 0 && filteredSuggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          {filteredSuggestions.slice(0, 4).map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.suggestionItem}
              onPress={() => {
                onChangeText(item);
                setShowSuggestions(false);
              }}
            >
              <Text style={styles.suggestionText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12, zIndex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#F4DCD6',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#3E2723',
  },
  suggestionsBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#F4DCD6',
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 150,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F4DCD6',
  },
  suggestionText: { color: '#3E2723', fontSize: 14 },
});