// app/(main)/case/[id].tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthProvider"; // <-- Импорт

export default function CaseDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isConnected } = useAuth(); // <-- Проверка сети

  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState<any>(null);
  const [isOfflineError, setIsOfflineError] = useState(false); // <-- Флаг для UI

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCaseDetails();
  }, [id, isConnected]); // Перезагружаем, если появился интернет

  const fetchCaseDetails = async () => {
    // Сброс ошибок
    setIsOfflineError(false);

    // 1. Проверка сети перед запросом
    if (!isConnected) {
      setLoading(false);
      setIsOfflineError(true);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cases")
        .select(
          `
          *,
          case_inputs (*),
          case_results (*),
          llm_interpretations (*)
        `,
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      setCaseData(data);
    } catch (e: any) {
      // Если ошибка всё же случилась (сеть отвалилась в процессе)
      console.error(e);
      if (e.message?.includes("Network") || e.message?.includes("fetch")) {
        setIsOfflineError(true);
      } else {
        Alert.alert("Ошибка загрузки", "Не удалось получить данные");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!newTitle.trim()) {
      Alert.alert("Ошибка", "Название не может быть пустым");
      return;
    }
    if (!isConnected) {
      Alert.alert("Оффлайн", "Нельзя редактировать записи без интернета");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("cases")
        .update({ title: newTitle.trim() })
        .eq("id", id);

      if (error) throw error;

      setCaseData({ ...caseData, title: newTitle.trim() });
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert("Ошибка обновления", e.message);
    } finally {
      setSaving(false);
    }
  };

  // Хелпер цвета
  const getGapColor = (gap: number) => {
    const abs = Math.abs(gap);
    if (abs > 35) return "#8B0000";
    if (abs > 20) return "#FF3B30";
    if (abs > 10) return "#FF9500";
    return "#34C759";
  };
  const getOsmColor = (val: number) => {
    if (val < 275) return "#007AFF";
    if (val > 295) return "#FF3B30";
    return "#34C759"; // Зеленый если норма
  };

  // --- UI: ЗАГЛУШКА ОФФЛАЙН ---
  if (isOfflineError) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Нет связи" }} />
        <Ionicons name="cloud-offline-outline" size={64} color="#C7C7CC" />
        <Text style={styles.errorTitle}>Нет подключения</Text>
        <Text style={styles.errorText}>
          Детальная информация хранится на сервере. Подключитесь к интернету,
          чтобы просмотреть запись.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchCaseDetails}>
          <Text style={styles.retryText}>Попробовать снова</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

  const inputs = Array.isArray(caseData.case_inputs)
    ? caseData.case_inputs[0]
    : caseData.case_inputs;
  const results = Array.isArray(caseData.case_results)
    ? caseData.case_results[0]
    : caseData.case_results;

  const interpretations = caseData.llm_interpretations || [];
  const llmRecord =
    interpretations.length > 0
      ? interpretations.sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0]
      : null;
  const aiData = llmRecord ? llmRecord.result_json : null;

  return (
    <View style={{ flex: 1, backgroundColor: "#F2F2F7" }}>
      <Stack.Screen
        options={{
          title: caseData.title || "Детали",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                setNewTitle(caseData.title || "");
                setIsEditing(true);
              }}
              style={{ padding: 8 }}
            >
              <Ionicons name="pencil" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.date}>
          {new Date(caseData.created_at).toLocaleString("ru-RU")}
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Результаты</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Осмоляльность</Text>
            <Text style={[styles.valueBig , { color: getOsmColor(results?.calculated_osmolality) }]}>
              {results?.calculated_osmolality}{" "}
              <Text style={styles.unit}>mOsm/kg</Text>
            </Text>
          </View>

          {results?.osmolal_gap !== null && (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <View>
                  <Text style={styles.label}>Осмоляльный разрыв</Text>
                  <Text
                    style={{
                      fontSize: 12,
                      marginTop: 2,
                      color: getGapColor(results.osmolal_gap),
                      fontWeight: "500",
                    }}
                  >
                    {Math.abs(results.osmolal_gap) > 10
                      ? Math.abs(results.osmolal_gap) > 20
                        ? "Высокий риск"
                        : "Отклонение"
                      : "В норме"}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.valueBig,
                    { color: getGapColor(results.osmolal_gap) },
                  ]}
                >
                  {results.osmolal_gap}{" "}
                  <Text
                    style={[
                      styles.unit,
                    ]}
                  >
                    mOsm/kg
                  </Text>
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Входные данные ({inputs?.units})
          </Text>
          <InfoRow label="Натрий (Na)" value={inputs?.na} />
          <InfoRow label="Глюкоза" value={inputs?.glucose} />
          <InfoRow
            label={
              inputs?.units === "mg/dL" ? "Азот мочевины (BUN)" : "Мочевина"
            }
            value={inputs?.bun}
          />
          {inputs?.ethanol ? (
            <InfoRow label="Этанол" value={inputs.ethanol} />
          ) : (
            <InfoRow label="Этанол" value="Не указан" isDimmed />
          )}
          {inputs?.measured_osmolality ? (
            <InfoRow
              label="Измеренная осмолярность"
              value={`${inputs.measured_osmolality} mOsm/kg`}
            />
          ) : (
            <InfoRow
              label="Измеренная осмолярность"
              value="Не указана"
              isDimmed
            />
          )}
        </View>

        {aiData && (
          <View style={styles.aiCard}>
            <Text style={styles.aiTitle}>ИИ интерпретация</Text>
            <Text style={styles.aiSummary}>{aiData.summary}</Text>
            <Text style={styles.aiSectionHeader}>Интерпретация:</Text>
            {aiData.interpretation?.map((t: string, i: number) => (
              <Text key={i} style={styles.bullet}>
                • {t}
              </Text>
            ))}
            {aiData.red_flags?.length > 0 && (
              <>
                <Text style={[styles.aiSectionHeader, { color: "#D32F2F" }]}>
                  ⚠️Возможные тревожные признаки:
                </Text>
                {aiData.red_flags.map((t: string, i: number) => (
                  <Text key={i} style={styles.bulletDanger}>
                    • {t}
                  </Text>
                ))}
              </>
            )}
            <Text style={styles.disclaimer}>
              Ограничения: {aiData.limitations}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Modal Edit */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isEditing}
        onRequestClose={() => setIsEditing(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Переименовать запись</Text>
            <TextInput
              style={styles.modalInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Например: Пациент Иванов"
              autoFocus={true}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setIsEditing(false)}
                disabled={saving}
              >
                <Text style={styles.modalBtnTextCancel}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={handleSaveTitle}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnTextSave}>Сохранить</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const InfoRow = ({
  label,
  value,
  isDimmed,
}: {
  label: string;
  value: any;
  isDimmed?: boolean;
}) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text
      style={[
        styles.infoValue,
        isDimmed && { color: "#C7C7CC", fontWeight: "normal" },
      ]}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  date: { color: "#8E8E93", textAlign: "center", marginBottom: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  divider: { height: 1, backgroundColor: "#E5E5EA", marginVertical: 12 },
  label: { fontSize: 16, color: "#000" },
  valueBig: { fontSize: 24, fontWeight: "bold" },
  unit: { fontSize: 16, fontWeight: "normal", color: "#8E8E93" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F2F2F7",
  },
  infoLabel: { fontSize: 16, color: "#333" },
  infoValue: { fontSize: 16, fontWeight: "500", color: "#000" },
  aiCard: {
    backgroundColor: "#F0F9FF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#BCE0FD",
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#004085",
  },
  aiSummary: { fontStyle: "italic", marginBottom: 12, color: "#333" },
  aiSectionHeader: {
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 4,
    color: "#333",
  },
  bullet: { marginLeft: 8, marginBottom: 4, color: "#444" },
  bulletDanger: {
    marginLeft: 8,
    marginBottom: 4,
    color: "#D32F2F",
    fontWeight: "500",
  },
  disclaimer: {
    fontSize: 12,
    color: "#888",
    marginTop: 16,
    fontStyle: "italic",
  },

  // Оффлайн заглушка
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
    color: "#333",
  },
  errorText: {
    textAlign: "center",
    color: "#666",
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  retryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#F2F2F7",
    borderRadius: 8,
  },
  retryText: { color: "#007AFF", fontWeight: "600" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  modalInput: {
    backgroundColor: "#F2F2F7",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalBtnCancel: { backgroundColor: "#F2F2F7" },
  modalBtnSave: { backgroundColor: "#007AFF" },
  modalBtnTextCancel: { color: "#007AFF", fontSize: 16, fontWeight: "600" },
  modalBtnTextSave: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
