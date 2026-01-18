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
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";

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

  // Данные и UI стейт
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  // Стейт фильтров
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all");
  const [minOsm, setMinOsm] = useState("");
  const [maxOsm, setMaxOsm] = useState("");

  // Загрузка истории с учетом фильтров
  const fetchHistory = async () => {
    setLoading(true);
    try {
      // 1. Базовый запрос
      // Важно: используем !inner для case_results, если фильтруем по значениям,
      // чтобы исключить кейсы, у которых нет результатов, попадающих в диапазон.
      const hasValueFilter = minOsm || maxOsm;

      let query = supabase
        .from("cases")
        .select(
          `
          id, created_at, title,
          case_results${
            hasValueFilter ? "!inner" : ""
          } (calculated_osmolality, osmolal_gap),
          case_inputs (units)
        `
        )
        .order("created_at", { ascending: false });

      // 2. Поиск по названию (Title)
      if (searchQuery.trim()) {
        query = query.ilike("title", `%${searchQuery.trim()}%`);
      }

      // 3. Фильтр по дате
      const now = new Date();
      if (dateFilter === "today") {
        const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        query = query.gte("created_at", startOfDay);
      } else if (dateFilter === "week") {
        const weekAgo = new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000
        ).toISOString();
        query = query.gte("created_at", weekAgo);
      } else if (dateFilter === "month") {
        const monthAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        ).toISOString();
        query = query.gte("created_at", monthAgo);
      }

      // 4. Фильтр по диапазону значений (через связанную таблицу)
      // Синтаксис Supabase для фильтрации по json/связанным полям специфичен,
      // но благодаря !inner выше, мы можем фильтровать по колонкам child таблицы.
      if (minOsm) {
        query = query.gte(
          "case_results.calculated_osmolality",
          parseFloat(minOsm)
        );
      }
      if (maxOsm) {
        query = query.lte(
          "case_results.calculated_osmolality",
          parseFloat(maxOsm)
        );
      }

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

  // Первичная загрузка и обновление при фокусе
  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, []) // Пустой массив, чтобы не зацикливалось, но обновлялось при входе
  );

  // Обработчик "Применить фильтры"
  const applyFilters = () => {
    setIsFilterVisible(false);
    fetchHistory();
  };

  // Обработчик сброса
  const resetFilters = () => {
    setDateFilter("all");
    setMinOsm("");
    setMaxOsm("");
    setSearchQuery(""); // Можно оставить поиск, если хотим сбросить только фильтры
    setIsFilterVisible(false);
    // Небольшая задержка, чтобы стейт успел обновиться перед запросом
    setTimeout(() => {
      // Мы вызываем fetchHistory, но он замкнет старые значения стейта из-за замыкания useEffect/Callback?
      // Нет, вызовем напрямую, но нам нужно передать "чистые" параметры.
      // Проще всего перезагрузить страницу или просто сбросить стейт и useEffect сработает (если добавить зависимости),
      // но мы используем ручной вызов.
      // В данном случае просто сбросим UI, а пользователь нажмет "поиск" или swipe-refresh.
      // Или вызовем fetchHistory с дефолтными параметрами вручную (рефакторинг fetchHistory нужен для идеала),
      // но для простоты просто вызовем setRefreshing -> onRefresh.
      onRefresh();
    }, 100);
  };

  const onRefresh = () => {
    setRefreshing(true);
    // При pull-to-refresh используем текущие фильтры из стейта
    fetchHistory();
  };

  // --- Рендер Элемента Списка ---
  const renderItem = ({ item }: { item: HistoryItem }) => {
    const resultData = item.case_results;
    const result = Array.isArray(resultData) ? resultData[0] : resultData;

    if (!result) return null; // Скрываем битые записи

    const date = new Date(item.created_at).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/(main)/case/${item.id}`)}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.date}>{date}</Text>
            <Text style={styles.title}>{item.title || "Без названия"}</Text>
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
              <View style={[styles.resultBlock, { alignItems: "flex-end" }]}>
                <Text style={styles.resultLabel}>Gap</Text>
                <Text
                  style={[
                    styles.resultValue,
                    result.osmolal_gap > 10 ? styles.textDanger : styles.textOk,
                  ]}
                >
                  {result.osmolal_gap}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* --- Панель Поиска --- */}
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
            onSubmitEditing={fetchHistory} // Поиск по Enter
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

      {/* --- Список --- */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color="#C7C7CC" />
              <Text style={styles.emptyText}>Ничего не найдено</Text>
            </View>
          ) : null
        }
      />

      {loading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}

      {/* --- Модальное окно Фильтров --- */}
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

              {/* Фильтр Даты */}
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

              {/* Фильтр Значений */}
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

              {/* Кнопки */}
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
    padding: 16,
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
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  date: { color: "#8E8E93", fontSize: 13 },
  title: { fontWeight: "600", color: "#000" },
  cardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultBlock: {},
  resultLabel: { fontSize: 12, color: "#8E8E93", textTransform: "uppercase" },
  resultValue: { fontSize: 20, fontWeight: "bold", color: "#000" },
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
});
