import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'expo-router';

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'doctor' | 'patient'>('doctor'); // По умолчанию врач
  const [loading, setLoading] = useState(false);

  const signUp = async () => {
    if (!email || !password || !fullName) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          full_name: fullName,
          role: role // <-- Передаем роль в метаданные
        }
      }
    });

    if (error) Alert.alert(error.message);
    else {
      Alert.alert('Успешно', 'Проверьте почту для подтверждения регистрации!');
      router.replace('/(auth)/sign-in');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Регистрация</Text>
      
      <TextInput 
        style={styles.input} 
        placeholder="ФИО / Имя" 
        value={fullName} 
        onChangeText={setFullName} 
      />

      <TextInput 
        style={styles.input} 
        placeholder="Email" 
        value={email} 
        onChangeText={setEmail} 
        autoCapitalize="none" 
        keyboardType="email-address"
      />
      
      <TextInput 
        style={styles.input} 
        placeholder="Пароль" 
        value={password} 
        onChangeText={setPassword} 
        secureTextEntry 
      />

      {/* Выбор роли */}
      <Text style={styles.label}>Кто вы?</Text>
      <View style={styles.roleContainer}>
        <TouchableOpacity 
          style={[styles.roleBtn, role === 'doctor' && styles.roleBtnActive]} 
          onPress={() => setRole('doctor')}
        >
          <Text style={[styles.roleText, role === 'doctor' && styles.roleTextActive]}>Врач</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.roleBtn, role === 'patient' && styles.roleBtnActive]} 
          onPress={() => setRole('patient')}
        >
          <Text style={[styles.roleText, role === 'patient' && styles.roleTextActive]}>Пациент</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.btn} onPress={signUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Зарегистрироваться</Text>}
      </TouchableOpacity>
      
      <TouchableOpacity onPress={() => router.back()} style={{marginTop: 20}}>
        <Text style={{color: '#007AFF'}}>Уже есть аккаунт? Войти</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, textAlign: 'center' },
  input: { backgroundColor: '#F2F2F7', borderRadius: 8, padding: 15, marginBottom: 15, fontSize: 16 },
  label: { marginBottom: 10, fontSize: 16, fontWeight: '500', color: '#333' },
  roleContainer: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  roleBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E5EA', alignItems: 'center' },
  roleBtnActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  roleText: { fontSize: 16, color: '#333' },
  roleTextActive: { color: '#fff', fontWeight: '600' },
  btn: { backgroundColor: '#34C759', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' }
});