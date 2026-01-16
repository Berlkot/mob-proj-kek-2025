// components/ui/ValidatedInput.tsx
import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';

interface ValidatedInputProps extends TextInputProps {
  label: string;
  unitLabel: string;
  error?: string | null;
  onChangeText: (text: string) => void;
}

export const ValidatedInput = ({ 
  label, 
  unitLabel, 
  value, 
  onChangeText, 
  error,
  ...props 
}: ValidatedInputProps) => {

  const handleChange = (text: string) => {
    // 1. Разрешаем только цифры и одну точку/запятую
    // Заменяем запятую на точку для удобства
    let cleaned = text.replace(',', '.');
    
    // Удаляем всё, что не цифра и не точка
    cleaned = cleaned.replace(/[^0-9.]/g, '');

    // Запрещаем вторую точку
    if ((cleaned.match(/\./g) || []).length > 1) {
      return; 
    }

    onChangeText(cleaned);
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.inputWrapper, error ? styles.inputErrorBorder : null]}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={handleChange}
            keyboardType="numeric" // Или "decimal-pad" на iOS
            placeholderTextColor="#999"
            {...props}
          />
          <Text style={styles.unit}>{unitLabel}</Text>
        </View>
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 16, fontWeight: '500', width: '40%', color: '#333' },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#F2F2F7', 
    borderRadius: 8, 
    paddingHorizontal: 10, 
    width: '55%', 
    height: 44,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  inputErrorBorder: { borderColor: '#FF3B30', backgroundColor: '#FFF0F0' },
  input: { flex: 1, fontSize: 17, color: '#000' },
  unit: { fontSize: 12, color: '#8E8E93', marginLeft: 4 },
  errorText: { color: '#FF3B30', fontSize: 12, textAlign: 'right', marginTop: 4 }
});