// app/(main)/history.tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../../../lib/supabase';


type HistoryItem = {
  id: string;
  created_at: string;
  title: string;
  case_results: any; // Используем any, так как может прийти массив или объект
  case_inputs: any;
};

export default function HistoryScreen() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const fetchHistory = async () => {
    try {
      // Запрашиваем данные
      const { data, error } = await supabase
        .from('cases')
        .select(`
          id, created_at, title,
          case_results (calculated_osmolality, osmolal_gap),
          case_inputs (units)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching history:', error);
        throw error;
      }
      
      // console.log('History Data:', JSON.stringify(data, null, 2)); // Для отладки
      setItems(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    // ИСПРАВЛЕНИЕ: Обработка 1:1 связи (Supabase может вернуть объект вместо массива)
    const resultData = item.case_results;
    const result = Array.isArray(resultData) ? resultData[0] : resultData;
    
    // Если result пустой или null - показываем "Нет данных"
    if (!result) {
      // Для отладки можно вывести, что пришло
      // console.log('Empty result for item:', item.id, item.case_results);
      return (
        <View style={styles.card}>
           <View style={styles.cardHeader}>
            <Text style={styles.date}>
              {new Date(item.created_at).toLocaleString('ru-RU')}
            </Text>
            <Text style={styles.title}>{item.title}</Text>
          </View>
          <Text style={styles.noData}>Нет результатов</Text>
        </View>
      );
    }

    const date = new Date(item.created_at).toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    return (
        <TouchableOpacity 
    activeOpacity={0.7}
    onPress={() => router.push(`/(main)/case/${item.id}`)} // <-- Переход
  >
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.date}>{date}</Text>
          <Text style={styles.title}>{item.title || 'Без названия'}</Text>
        </View>
        
        <View style={styles.cardBody}>
          <View style={styles.resultBlock}>
            <Text style={styles.resultLabel}>Osm</Text>
            <Text style={styles.resultValue}>
              {result.calculated_osmolality}
              <Text style={styles.unit}> mOsm/kg</Text>
            </Text>
          </View>

          {result.osmolal_gap !== null && (
            <View style={[styles.resultBlock, { alignItems: 'flex-end' }]}>
              <Text style={styles.resultLabel}>Gap</Text>
              <Text style={[
                styles.resultValue, 
                result.osmolal_gap > 10 ? styles.textDanger : styles.textOk
              ]}>
                {result.osmolal_gap}
              </Text>
            </View>
          )}
        </View>
      </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyText}>История пуста</Text>
            <Text style={{color: '#999', fontSize: 12, marginTop: 5}}>
              Сделайте первый расчёт на главном экране
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16 },
  
  card: { 
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  date: { color: '#8E8E93', fontSize: 13 },
  title: { fontWeight: '600', color: '#000' },
  
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultBlock: {},
  resultLabel: { fontSize: 12, color: '#8E8E93', textTransform: 'uppercase' },
  resultValue: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  unit: { fontSize: 12, fontWeight: 'normal', color: '#8E8E93' },
  
  textOk: { color: '#34C759' },
  textDanger: { color: '#FF3B30' },
  noData: { color: '#C7C7CC', fontStyle: 'italic', textAlign: 'center', marginTop: 10 },

  emptyState: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: '#8E8E93', marginTop: 10, fontSize: 16 }
});