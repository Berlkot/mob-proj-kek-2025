// app/(main)/(tabs)/history.tsx
import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthProvider";

type HistoryItem = {
  id: string;
  created_at: string;
  title: string;
  case_results: any;
  case_inputs: any;
};

// Типы для фильтров
type DateFilterType = "all" | "today" | "week" | "month";

export default function HistoryScreen() {
  const router = useRouter();
  const navigation = useNavigation();
const { isGuest, isConnected, loading: authLoading } = useAuth();

  // --- Состояние Данных ---
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // --- Состояние Выделения и Удаления ---
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // --- Состояние Фильтров ---
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all");
  const [minOsm, setMinOsm] = useState("");
  const [maxOsm, setMaxOsm] = useState("");
  // --- Управление Заголовком (Header) ---
  useEffect(() => {
    if (isSelectionMode) {
      // Режим удаления
      navigation.setOptions({
        title: `Выбрано: ${selectedIds.length}`,
        headerLeft: () => (
          <TouchableOpacity
            onPress={cancelSelection}
            style={{ marginLeft: 16 }}
          >
            <Text style={{ fontSize: 17, color: "#007AFF" }}>Отмена</Text>
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity onPress={confirmDelete} style={{ marginRight: 16 }}>
            <Ionicons name="trash" size={24} color="#FF3B30" />
          </TouchableOpacity>
        ),
        headerTitleAlign: "center",
      });
    } else {
      // Обычный режим (Настройки профиля)
      navigation.setOptions({
        title: "История расчётов",
        headerLeft: undefined,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push("/(main)/profile")}
            style={{ marginRight: 16 }}
          >
            <Ionicons name="settings-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
        ),
      });
    }
  }, [isSelectionMode, selectedIds]);

  // --- Загрузка данных ---
  const fetchHistory = async () => {
    if (authLoading) return;

    if (isGuest) return;

    if (!isConnected) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    try {
      const hasValueFilter = minOsm || maxOsm;
      let query = supabase
        .from("cases")
        .select(
          `id, created_at, title, case_results${hasValueFilter ? "!inner" : ""} (calculated_osmolality, osmolal_gap), case_inputs (units)`,
        )
        .order("created_at", { ascending: false });

      if (searchQuery.trim())
        query = query.ilike("title", `%${searchQuery.trim()}%`);
      const now = new Date();
      if (dateFilter === "today")
        query = query.gte(
          "created_at",
          new Date(now.setHours(0, 0, 0, 0)).toISOString(),
        );
      else if (dateFilter === "week")
        query = query.gte(
          "created_at",
          new Date(now.getTime() - 7 * 864e5).toISOString(),
        );
      else if (dateFilter === "month")
        query = query.gte(
          "created_at",
          new Date(now.getTime() - 30 * 864e5).toISOString(),
        );
      if (minOsm)
        query = query.gte(
          "case_results.calculated_osmolality",
          parseFloat(minOsm),
        );
      if (maxOsm)
        query = query.lte(
          "case_results.calculated_osmolality",
          parseFloat(maxOsm),
        );

      const { data, error } = await query.limit(50);
      if (error) throw error;
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
      // Запускаем только если авторизация завершена
      if (!isSelectionMode && !authLoading) fetchHistory();
    }, [isSelectionMode, isConnected, authLoading]) // Добавили authLoading
  );

  // --- Логика Выделения ---
  const handleLongPress = (id: string) => {
    setIsSelectionMode(true);
    toggleSelection(id);
  };

  const handlePress = (id: string) => {
    if (isSelectionMode) {
      toggleSelection(id);
    } else {
      router.push(`/(main)/case/${id}`);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const isSelected = prev.includes(id);
      const newIds = isSelected ? prev.filter((i) => i !== id) : [...prev, id];

      if (newIds.length === 0) setIsSelectionMode(false);
      return newIds;
    });
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  const confirmDelete = () => {
    Alert.alert(
      "Удалить записи?",
      `Выбрано элементов: ${selectedIds.length}. Действие необратимо.`,
      [
        { text: "Отмена", style: "cancel" },
        { text: "Удалить", style: "destructive", onPress: deleteSelected },
      ],
    );
  };

  const deleteSelected = async () => {
    try {
      const { error } = await supabase
        .from("cases")
        .delete()
        .in("id", selectedIds);
      if (error) throw error;

      // Удаляем из локального стейта для мгновенного отклика
      setItems((prev) => prev.filter((item) => !selectedIds.includes(item.id)));
      cancelSelection();
    } catch (e: any) {
      Alert.alert("Ошибка удаления", e.message);
    }
  };

  // --- Фильтры UI ---
  const applyFilters = () => {
    setIsFilterVisible(false);
    fetchHistory();
  };

  const resetFilters = () => {
    setDateFilter("all");
    setMinOsm("");
    setMaxOsm("");
    setSearchQuery("");
    setIsFilterVisible(false);
    setTimeout(() => onRefresh(), 100);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };
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

  // --- Рендер ---
  const renderItem = ({ item }: { item: HistoryItem }) => {
    const result = Array.isArray(item.case_results)
      ? item.case_results[0]
      : item.case_results;
    if (!result) return null;

    const isSelected = selectedIds.includes(item.id);
    const date = new Date(item.created_at).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Цвета
    const gapColor = getGapColor(result.osmolal_gap);
    // Для осмоляльности можно просто черный, или раскрасить
    const osmColor = getOsmColor(result.calculated_osmolality);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={() => handleLongPress(item.id)}
        onPress={() => handlePress(item.id)}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        {isSelectionMode && (
          <View style={styles.selectionIndicator}>
            <Ionicons
              name={isSelected ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={isSelected ? "#007AFF" : "#C7C7CC"}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.cardHeader}>
            <Text style={styles.date}>{date}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {item.title || "Без названия"}
            </Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.resultBlock}>
              <Text style={styles.resultLabel}>Osm</Text>
              <Text style={[styles.resultValue, { color: osmColor }]}>
                {result.calculated_osmolality}{" "}
                <Text style={styles.unit}>mOsm/kg</Text>
              </Text>
            </View>
            {result.osmolal_gap !== null && (
              <View style={[styles.resultBlock, { alignItems: "flex-end" }]}>
                <Text style={styles.resultLabel}>Gap</Text>
                {/* ПРИМЕНЯЕМ ЦВЕТ */}
                <Text style={[styles.resultValue, { color: gapColor }]}>
                  {result.osmolal_gap}
                </Text>
              </View>
            )}
          </View>
        </View>
        {!isSelectionMode && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color="#C7C7CC"
            style={{ marginLeft: 8 }}
          />
        )}
      </TouchableOpacity>
    );
  };

  if (isGuest) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={64} color="#C7C7CC" />
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            marginTop: 20,
            color: "#333",
          }}
        >
          История недоступна
        </Text>
        <Text
          style={{
            textAlign: "center",
            marginHorizontal: 40,
            marginTop: 10,
            color: "#666",
          }}
        >
          Чтобы сохранять результаты расчётов, пожалуйста, войдите в аккаунт.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Панель Поиска (Скрываем при выделении, чтобы не мешала) */}
      {!isConnected && (
        <View
          style={{
            backgroundColor: "#FFEBEE",
            padding: 8,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#D32F2F", fontSize: 12 }}>
            Нет подключения к интернету. Показаны старые данные.
          </Text>
        </View>
      )}
      {!isSelectionMode && (
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Ionicons
              name="search"
              size={20}
              color="#8E8E93"
              style={{ marginRight: 8 }}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск по названию..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={fetchHistory}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  fetchHistory();
                }}
              >
                <Ionicons name="close-circle" size={18} color="#C7C7CC" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => setIsFilterVisible(true)}
          >
            <Ionicons name="options-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              if (isConnected) fetchHistory();
              else setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color="#C7C7CC" />
              <Text style={styles.emptyText}>
                {isConnected ? "Ничего не найдено" : "Нет данных (оффлайн)"}
              </Text>
            </View>
          ) : null
        }
      />

      {loading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}

      {/* Модальное окно Фильтров */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isFilterVisible}
        onRequestClose={() => setIsFilterVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Фильтры</Text>
                <TouchableOpacity onPress={() => setIsFilterVisible(false)}>
                  <Ionicons name="close" size={24} color="#8E8E93" />
                </TouchableOpacity>
              </View>

              <Text style={styles.filterLabel}>Дата создания</Text>
              <View style={styles.dateFilterContainer}>
                {(["all", "today", "week", "month"] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.dateChip,
                      dateFilter === type && styles.dateChipActive,
                    ]}
                    onPress={() => setDateFilter(type)}
                  >
                    <Text
                      style={[
                        styles.dateChipText,
                        dateFilter === type && styles.dateChipTextActive,
                      ]}
                    >
                      {type === "all"
                        ? "Все"
                        : type === "today"
                          ? "Сегодня"
                          : type === "week"
                            ? "Неделя"
                            : "Месяц"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.filterLabel}>Осмоляльность (mOsm/kg)</Text>
              <View style={styles.rangeContainer}>
                <TextInput
                  style={styles.rangeInput}
                  placeholder="От"
                  keyboardType="numeric"
                  value={minOsm}
                  onChangeText={setMinOsm}
                />
                <Text style={{ marginHorizontal: 10 }}>—</Text>
                <TextInput
                  style={styles.rangeInput}
                  placeholder="До"
                  keyboardType="numeric"
                  value={maxOsm}
                  onChangeText={setMaxOsm}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={resetFilters}
                >
                  <Text style={styles.resetBtnText}>Сбросить</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={applyFilters}
                >
                  <Text style={styles.applyBtnText}>Применить</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },

  // Search
  searchContainer: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    alignItems: "center",
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#F2F2F7",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    alignItems: "center",
    marginRight: 10,
  },
  searchInput: { flex: 1, fontSize: 16 },
  filterBtn: { padding: 4 },

  listContent: { padding: 16 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Cards
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  cardSelected: {
    backgroundColor: "#E3F2FD",
    borderColor: "#007AFF",
    borderWidth: 1,
  },
  selectionIndicator: { marginRight: 12 },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  date: { color: "#8E8E93", fontSize: 13 },
  title: { fontWeight: "600", color: "#000", maxWidth: "65%" },

  cardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultBlock: {},
  resultLabel: { fontSize: 11, color: "#8E8E93", textTransform: "uppercase" },
  resultValue: { fontSize: 18, fontWeight: "bold", color: "#000" },
  unit: { fontSize: 12, fontWeight: "normal", color: "#8E8E93" },
  textOk: { color: "#34C759" },
  textDanger: { color: "#FF3B30" },

  emptyState: { alignItems: "center", marginTop: 50 },
  emptyText: { color: "#8E8E93", marginTop: 10, fontSize: 16 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold" },
  filterLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 10,
  },
  dateFilterContainer: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  dateChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F2F2F7",
    borderWidth: 1,
    borderColor: "transparent",
  },
  dateChipActive: { backgroundColor: "#E3F2FD", borderColor: "#007AFF" },
  dateChipText: { color: "#333" },
  dateChipTextActive: { color: "#007AFF", fontWeight: "600" },
  rangeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rangeInput: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    padding: 12,
    borderRadius: 8,
    textAlign: "center",
  },
  modalActions: { flexDirection: "row", marginTop: 30, gap: 15 },
  resetBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
  },
  resetBtnText: { color: "#FF3B30", fontWeight: "600", fontSize: 16 },
  applyBtn: {
    flex: 2,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  applyBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
});
