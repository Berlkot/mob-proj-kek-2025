// app/(main)/profile.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthProvider';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Загрузка дополнительных данных профиля (если есть)
  useEffect(() => {
    if (session?.user) {
      fetchProfile();
    }
  }, [session]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session?.user.id)
        .single();
      
      if (!error && data) {
        setProfile(data);
      }
    } catch (e) {
      // Игнорируем ошибку, если профиля нет, покажем просто email
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Ошибка', error.message);
    }
    // Роутинг обработается автоматически через AuthProvider и RootLayout
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color="#fff" />
        </View>
        <Text style={styles.email}>{session?.user.email}</Text>
        <Text style={styles.role}>
          {profile?.full_name || 'Врач приёмного отделения'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Аккаунт</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>ID Пользователя</Text>
          <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
            {session?.user.id}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Роль</Text>
          <Text style={styles.value}>Doctor</Text>
        </View>
      </View>

      <TouchableOpacity 
        style={styles.logoutBtn} 
        onPress={handleSignOut}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FF3B30" />
        ) : (
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        )}
      </TouchableOpacity>
      
      <Text style={styles.version}>Версия приложения: 1.0.0 (MVP)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7', padding: 16 },
  header: { alignItems: 'center', marginBottom: 30, marginTop: 20 },
  avatar: { 
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#007AFF', 
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5
  },
  email: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  role: { fontSize: 16, color: '#8E8E93', marginTop: 4 },
  
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 12, textTransform: 'uppercase' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  label: { fontSize: 16, color: '#000' },
  value: { fontSize: 16, color: '#8E8E93', maxWidth: '60%' },
  
  logoutBtn: { 
    backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center',
    marginBottom: 20
  },
  logoutText: { color: '#FF3B30', fontSize: 17, fontWeight: '600' },
  version: { textAlign: 'center', color: '#C7C7CC', fontSize: 13 }
});