// app/(main)/case/[id].tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '../../../lib/supabase';

export default function CaseDetailsScreen() {
  const { id } = useLocalSearchParams(); // Получаем ID из URL
  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState<any>(null);

  useEffect(() => {
    fetchCaseDetails();
  }, [id]);

  const fetchCaseDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select(`
          *,
          case_inputs (*),
          case_results (*),
          llm_interpretations (*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setCaseData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!caseData) {
    return (
      <View style={styles.center}>
        <Text>Данные не найдены</Text>
      </View>
    );
  }

  // Упрощаем доступ к вложенным объектам (массивам 1:1)
  const inputs = Array.isArray(caseData.case_inputs) ? caseData.case_inputs[0] : caseData.case_inputs;
  const results = Array.isArray(caseData.case_results) ? caseData.case_results[0] : caseData.case_results;
  
  // Интерпретаций может быть несколько (если перегенерировали), берем последнюю
  const llmRecord = caseData.llm_interpretations && caseData.llm_interpretations.length > 0
    ? caseData.llm_interpretations[0] 
    : null;
    
  // В базе лежит JSON внутри поля result_json
  const aiData = llmRecord ? llmRecord.result_json : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Настройка заголовка экрана */}
      <Stack.Screen options={{ title: caseData.title || 'Детали расчёта' }} />

      <Text style={styles.date}>
        {new Date(caseData.created_at).toLocaleString('ru-RU')}
      </Text>

      {/* 1. Блок Результатов (Главное) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Результаты</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Осмоляльность (Расч.)</Text>
          <Text style={styles.valueBig}>{results?.calculated_osmolality} <Text style={styles.unit}>mOsm/kg</Text></Text>
        </View>
        
        {results?.osmolal_gap !== null && (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Осмоляльный разрыв</Text>
              <Text style={[styles.valueBig, results.osmolal_gap > 10 ? styles.textDanger : styles.textOk]}>
                {results.osmolal_gap}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* 2. Блок Входных данных */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Входные данные ({inputs?.units})</Text>
        
        <InfoRow label="Натрий (Na)" value={inputs?.na} />
        <InfoRow label="Глюкоза" value={inputs?.glucose} />
        <InfoRow label={inputs?.units === 'mg/dL' ? "BUN" : "Мочевина"} value={inputs?.bun} />
        <InfoRow label="Этанол" value={inputs?.ethanol ?? '-'} />
        <InfoRow label="Измеренная осм." value={inputs?.measured_osmolality ?? '-'} />
      </View>

      {/* 3. Блок AI Интерпретации */}
      {aiData ? (
        <View style={styles.aiCard}>
          <Text style={styles.aiTitle}>
            Анализ AI
          </Text>
          
          <Text style={styles.aiSummary}>{aiData.summary}</Text>

          <Text style={styles.aiSectionHeader}>Интерпретация:</Text>
          {aiData.interpretation?.map((t: string, i: number) => (
            <Text key={i} style={styles.bullet}>• {t}</Text>
          ))}

          {aiData.red_flags && aiData.red_flags.length > 0 && (
            <>
              <Text style={[styles.aiSectionHeader, { color: '#D32F2F' }]}>⚠️ Тревожные признаки:</Text>
              {aiData.red_flags.map((t: string, i: number) => (
                <Text key={i} style={styles.bulletDanger}>• {t}</Text>
              ))}
            </>
          )}

          <Text style={styles.disclaimer}>
            Ограничения: {aiData.limitations}
          </Text>
        </View>
      ) : (
        <View style={styles.emptyAi}>
          <Text style={styles.emptyAiText}>Интерпретация AI не запрашивалась для этого кейса.</Text>
        </View>
      )}

    </ScrollView>
  );
}

const InfoRow = ({ label, value }: { label: string, value: any }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  date: { color: '#8E8E93', textAlign: 'center', marginBottom: 16 },
  
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 12, textTransform: 'uppercase' },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 12 },
  
  label: { fontSize: 16, color: '#000' },
  valueBig: { fontSize: 24, fontWeight: 'bold' },
  unit: { fontSize: 16, fontWeight: 'normal', color: '#8E8E93' },
  textOk: { color: '#34C759' },
  textDanger: { color: '#FF3B30' },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#F2F2F7' },
  infoLabel: { fontSize: 16, color: '#333' },
  infoValue: { fontSize: 16, fontWeight: '500', color: '#000' },

  aiCard: { backgroundColor: '#F0F9FF', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#BCE0FD' },
  aiTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#004085' },
  aiSummary: { fontStyle: 'italic', marginBottom: 12, color: '#333' },
  aiSectionHeader: { fontWeight: 'bold', marginTop: 10, marginBottom: 4, color: '#333' },
  bullet: { marginLeft: 8, marginBottom: 4, color: '#444' },
  bulletDanger: { marginLeft: 8, marginBottom: 4, color: '#D32F2F', fontWeight: '500' },
  disclaimer: { fontSize: 12, color: '#888', marginTop: 16, fontStyle: 'italic' },
  
  emptyAi: { alignItems: 'center', padding: 20 },
  emptyAiText: { color: '#8E8E93' }
});