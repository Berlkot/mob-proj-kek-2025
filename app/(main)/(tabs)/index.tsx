// app/(main)/(tabs)/index.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router"; // Для настройки заголовка
import { Ionicons } from "@expo/vector-icons";

import { ValidatedInput } from "../../../components/ui/ValidatedInput";
import {
  calculateGap,
  calculateOsmolality,
  OSMOLALITY_REF_RANGE,
} from "../../../constants/formulas";
import { SAFETY_LIMITS, validateInput } from "../../../constants/validation";
import { useAuth } from "../../../contexts/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { UnitType } from "../../../types/db";

// Включаем анимацию для Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function CalculatorScreen() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<"doctor" | "patient" | null>(null);

  // --- Настройки ---
  const [units, setUnits] = useState<UnitType>("mmol/L"); // По умолчанию СИ
  const [showAdvanced, setShowAdvanced] = useState(false); // Свернуть/развернуть доп. поля

  // --- Значения ---
  const [values, setValues] = useState({
    na: "",
    glucose: "",
    bun: "",
    ethanol: "",
    measured_osmolality: "",
  });

  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<{
    calc: number;
    gap: number | null;
  } | null>(null);

  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 1. Загрузка роли
  useEffect(() => {
    if (session?.user) fetchUserRole();
  }, [session]);

  const fetchUserRole = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session?.user.id)
      .single();
    setUserRole(data?.role === "patient" ? "patient" : "doctor");
  };

  // Сброс при смене единиц
  useEffect(() => {
    setErrors({});
    setResult(null);
    setAiResult(null);
    setCurrentCaseId(null);
  }, [units]);

  // --- Вспомогательные функции UI ---
  const toggleAdvanced = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAdvanced(!showAdvanced);
  };

  // Определение цвета для Разрыва (более опасный цвет при больших отклонениях)
  const getGapSeverity = (gap: number) => {
    const absGap = Math.abs(gap);
    if (absGap <= 10) return { color: "#34C759", label: "Норма" }; // Зеленый
    if (absGap <= 20)
      return { color: "#FF9500", label: "Умеренное отклонение" }; // Оранжевый
    if (absGap <= 35) return { color: "#FF3B30", label: "Высокий риск" }; // Красный
    return { color: "#8B0000", label: "Критическое значение" }; // Темно-красный (Бордовый)
  };

  // Определение цвета для Осмолярности
  const getOsmSeverity = (val: number) => {
    if (val < OSMOLALITY_REF_RANGE.min) return "#007AFF"; // Синий (гипо)
    if (val > OSMOLALITY_REF_RANGE.max) return "#FF3B30"; // Красный (гипер)
    return "#34C759"; // Зеленый
  };

  // --- Логика (сокращена, т.к. не менялась функционально) ---
  const handleVerifyField = (
    key: string,
    text: string,
    isBlur: boolean = false,
  ) => {
    const limitGroup = SAFETY_LIMITS[key as keyof typeof SAFETY_LIMITS];
    // @ts-ignore
    const limit = limitGroup?.[units] || limitGroup?.["common"];
    if (!limit || !text) {
      setErrors((prev) => ({ ...prev, [key]: null }));
      return;
    }
    const num = parseFloat(text);
    if (isNaN(num)) return;
    let errorMsg: string | null = null;
    if (num > limit.max) errorMsg = `Максимум: ${limit.max}`;
    else if (num < limit.min && isBlur) errorMsg = `Минимум: ${limit.min}`;
    if (num >= limit.min && num <= limit.max) errorMsg = null;
    setErrors((prev) => ({ ...prev, [key]: errorMsg }));
  };

  const handleChange = (key: string, text: string) => {
    setValues((prev) => ({ ...prev, [key]: text }));
    handleVerifyField(key, text, false);
    if (result) setResult(null);
    if (aiResult) setAiResult(null);
    if (currentCaseId) setCurrentCaseId(null);
  };

  const handleBlur = (key: string) =>
    handleVerifyField(key, values[key as keyof typeof values], true);

  const validateOnSubmit = () => {
    const keys = ["na", "glucose", "bun", "ethanol", "measured_osmolality"];
    let isValid = true;
    const newErrors = { ...errors };
    keys.forEach((key) => {
      const val = values[key as keyof typeof values];
      if ((key === "ethanol" || key === "measured_osmolality") && !val) return;
      const error = validateInput(key, val, units);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    });
    setErrors(newErrors);
    return isValid;
  };

  const handleCalculate = async () => {
    if (!values.na || !values.glucose || !values.bun) {
      Alert.alert("Внимание", "Введите Натрий, Глюкозу и Мочевину");
      return;
    }
    if (!validateOnSubmit()) {
      Alert.alert("Ошибка данных", "Проверьте поля, выделенные красным");
      return;
    }
    setLoading(true);
    try {
      const valNa = parseFloat(values.na);
      const valGlu = parseFloat(values.glucose);
      const valBun = parseFloat(values.bun);
      const valEth = values.ethanol ? parseFloat(values.ethanol) : 0;
      const valMeasured = values.measured_osmolality
        ? parseFloat(values.measured_osmolality)
        : null;
      const calculatedOsm = calculateOsmolality(
        valNa,
        valGlu,
        valBun,
        valEth,
        units,
      );
      const gap = valMeasured ? calculateGap(valMeasured, calculatedOsm) : null;

      setResult({ calc: calculatedOsm, gap });

      if (session?.user) {
        // ... (Сохранение в БД без изменений)
        const { data: caseData, error: caseError } = await supabase
          .from("cases")
          .insert({
            user_id: session.user.id,
            status: "draft",
            title: `Пациент ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          })
          .select()
          .single();
        if (caseError) throw caseError;
        setCurrentCaseId(caseData.id);
        await supabase.from("case_inputs").insert({
          case_id: caseData.id,
          units: units,
          na: valNa,
          glucose: valGlu,
          bun: valBun,
          ethanol: valEth || null,
          measured_osmolality: valMeasured,
        });
        await supabase.from("case_results").insert({
          case_id: caseData.id,
          formula_id: units === "mg/dL" ? "2na_glu_bun_us" : "2na_glu_bun_si",
          calculated_osmolality: calculatedOsm,
          osmolal_gap: gap,
        });
      }
    } catch (e: any) {
      Alert.alert("Ошибка", e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchInterpretation = async () => {
    if (!currentCaseId) return;
    const context = userRole || "doctor";
    setAiLoading(true);
    setAiResult(null);
    try {
      const payload = {
        context,
        units,
        inputs: {
          Na: values.na,
          Glucose: values.glucose,
          BUN: values.bun,
          Ethanol: values.ethanol || null,
          Measured_osmolality: values.measured_osmolality || null,
        },
        results: {
          Calculated_osmolality: result?.calc,
          Osmolal_gap: result?.gap,
        },
      };
      const { data, error } = await supabase.functions.invoke(
        "osmolality-interpret",
        { body: payload },
      );
      if (error) throw new Error(error.message);
      if (session?.user) {
        await supabase.from("llm_interpretations").insert({
          case_id: currentCaseId,
          user_id: session.user.id,
          context,
          model: "nvidia/nemotron-3-nano-30b-a3b:free",
          result_json: data,
          status: "ok",
        });
      }
      setAiResult(data);
    } catch (e: any) {
      Alert.alert("Ошибка AI", e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const clearForm = () => {
    setValues({
      na: "",
      glucose: "",
      bun: "",
      ethanol: "",
      measured_osmolality: "",
    });
    setResult(null);
    setAiResult(null);
    setCurrentCaseId(null);
    setErrors({});
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Настройка заголовка экрана */}
      <Stack.Screen
        options={{
          title: "Калькулятор осмолярности",
          headerTitleAlign: "center",
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Переключатель Единиц (SI по умолчанию) */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                units === "mmol/L" && styles.toggleBtnActive,
              ]}
              onPress={() => setUnits("mmol/L")}
            >
              <Text
                style={[
                  styles.toggleText,
                  units === "mmol/L" && styles.toggleTextActive,
                ]}
              >
                Система СИ (mmol/L)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                units === "mg/dL" && styles.toggleBtnActive,
              ]}
              onPress={() => setUnits("mg/dL")}
            >
              <Text
                style={[
                  styles.toggleText,
                  units === "mg/dL" && styles.toggleTextActive,
                ]}
              >
                США (mg/dL)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Карточка ввода Основных параметров */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Базовые параметры</Text>
            <ValidatedInput
              label="Натрий"
              value={values.na}
              onChangeText={(t) => handleChange("na", t)}
              onBlur={() => handleBlur("na")}
              unitLabel={units === "mg/dL" ? "mEq/L" : "mmol/L"}
              placeholder="140"
              error={errors.na}
            />
            <ValidatedInput
              label="Глюкоза"
              value={values.glucose}
              onChangeText={(t) => handleChange("glucose", t)}
              onBlur={() => handleBlur("glucose")}
              unitLabel={units}
              placeholder={units === "mg/dL" ? "90" : "5.0"}
              error={errors.glucose}
            />
            <ValidatedInput
              label="Мочевина"
              value={values.bun}
              onChangeText={(t) => handleChange("bun", t)}
              onBlur={() => handleBlur("bun")}
              unitLabel={units}
              placeholder={units === "mg/dL" ? "15" : "5.4"}
              error={errors.bun}
            />
          </View>

          {/* Опциональные параметры (Dropdown) */}
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.accordionHeader}
              onPress={toggleAdvanced}
            >
              <Text style={styles.cardTitle}>Дополнительно (Разрыв)</Text>
              <Ionicons
                name={showAdvanced ? "chevron-up" : "chevron-down"}
                size={20}
                color="#007AFF"
              />
            </TouchableOpacity>

            {showAdvanced && (
              <View style={{ marginTop: 12 }}>
                <ValidatedInput
                  label="Этанол"
                  value={values.ethanol}
                  onChangeText={(t) => handleChange("ethanol", t)}
                  onBlur={() => handleBlur("ethanol")}
                  unitLabel={units}
                  placeholder="0"
                  error={errors.ethanol}
                />
                <View style={styles.divider} />
                <ValidatedInput
                  label="Измеренная осмолярность"
                  value={values.measured_osmolality}
                  onChangeText={(t) => handleChange("measured_osmolality", t)}
                  onBlur={() => handleBlur("measured_osmolality")}
                  unitLabel="mOsm/kg"
                  placeholder="285"
                  error={errors.measured_osmolality}
                />
              </View>
            )}
            {!showAdvanced && (
              <Text style={styles.hintText}>
                Нажмите, чтобы ввести этанол или измеренную осмолярность для
                расчёта разрыва.
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.calcButton}
            onPress={handleCalculate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.calcButtonText}>РАССЧИТАТЬ ПОКАЗАТЕЛИ</Text>
            )}
          </TouchableOpacity>

          {/* Результаты */}
          {result && (
            <View style={styles.resultContainer}>
              {/* Расчетная */}
              <View style={styles.resultRow}>
                <View>
                  <Text style={styles.resultLabel}>Расчётная осмолярность</Text>
                  <Text style={styles.resultSub}>
                    Норма: {OSMOLALITY_REF_RANGE.min}–{OSMOLALITY_REF_RANGE.max}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.resultValue,
                    { color: getOsmSeverity(result.calc) },
                  ]}
                >
                  {result.calc} <Text style={styles.unitText}>mOsm/kg</Text>
                </Text>
              </View>

              <View style={styles.divider} />

              {/* Разрыв (Gap) */}
              {result.gap !== null ? (
                <View style={styles.resultRow}>
                  <View>
                    <Text style={styles.resultLabel}>Осмоляльный разрыв</Text>
                    <Text
                      style={[
                        styles.resultSub,
                        {
                          color: getGapSeverity(result.gap).color,
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {getGapSeverity(result.gap).label}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.resultValue,
                      { color: getGapSeverity(result.gap).color },
                    ]}
                  >
                    {result.gap > 0 ? `+${result.gap}` : result.gap}{" "}
                    <Text style={styles.unitText}>mOsm/kg</Text>
                  </Text>
                </View>
              ) : (
                <Text style={styles.missingGapText}>
                  Для расчёта разрыва введите измеренную осмолярность в доп.
                  параметрах.
                </Text>
              )}

              {/* AI Кнопка */}
              <View style={styles.aiActions}>
                <TouchableOpacity
                  style={styles.aiBtnSingle}
                  onPress={fetchInterpretation}
                  disabled={aiLoading}
                >
                  <Ionicons
                    name="sparkles"
                    size={20}
                    color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.aiBtnTextSingle}>
                    {aiLoading
                      ? "Анализирую..."
                      : "Интерпретировать результаты"}
                  </Text>
                </TouchableOpacity>
              </View>

              {aiResult && (
                <View style={styles.aiCard}>
                  <Text style={styles.aiTitle}>Интерпретация ИИ</Text>
                  <Text style={styles.aiSummary}>{aiResult.summary}</Text>
                  <View style={styles.divider} />
                  {aiResult.interpretation?.map((txt: string, i: number) => (
                    <Text key={i} style={styles.bullet}>
                      • {txt}
                    </Text>
                  ))}
                  {aiResult.red_flags?.length > 0 && (
                    <>
                      <Text style={[styles.aiHeader, { color: "#D32F2F" }]}>
                        ⚠️ Тревожные признаки:
                      </Text>
                      {aiResult.red_flags.map((txt: string, i: number) => (
                        <Text key={i} style={styles.bulletDanger}>
                        • {txt}
                        </Text>
                      ))}
                    </>
                  )}
                  <Text style={styles.disclaimer}>
                    ⚠️ {aiResult.limitations}
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.clearBtn} onPress={clearForm}>
                <Text style={styles.clearBtnText}>Очистить расчёт</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  scrollContent: { padding: 16, paddingBottom: 40 },

  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#E5E5EA",
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleText: { fontSize: 13, fontWeight: "500", color: "#8E8E93" },
  toggleTextActive: { color: "#000", fontWeight: "600" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 12,
    color: "#000",
  },
  accordionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hintText: { fontSize: 13, color: "#8E8E93", marginTop: 4 },

  divider: { height: 1, backgroundColor: "#F2F2F7", marginVertical: 12 },

  calcButton: {
    backgroundColor: "#007AFF",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#007AFF",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  calcButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },

  resultContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  resultLabel: { fontSize: 16, color: "#333", fontWeight: "500" },
  resultSub: { fontSize: 13, color: "#8E8E93", marginTop: 2 },
  resultValue: { fontSize: 22, fontWeight: "800" },
  unitText: { fontSize: 14, fontWeight: "600", color: "#8E8E93" },
  missingGapText: {
    color: "#8E8E93",
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 8,
  },

  aiActions: { marginTop: 20 },
  aiBtnSingle: {
    flexDirection: "row",
    backgroundColor: "#5856D6",
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  aiBtnTextSingle: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  aiCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#Fbfbfd",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  aiTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 8, color: "#333" },
  aiSummary: { fontSize: 15, lineHeight: 22, color: "#333", marginBottom: 12 },
  aiHeader: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 6,
    color: "#333",
  },
  bullet: {
    fontSize: 14,
    marginLeft: 4,
    marginBottom: 6,
    color: "#444",
    lineHeight: 20,
  },
  bulletDanger: {
    fontSize: 14,
    marginLeft: 4,
    marginBottom: 4,
    color: "#D32F2F",
    fontWeight: "500",
  },
  disclaimer: {
    fontSize: 12,
    color: "#999",
    marginTop: 16,
    textAlign: "center",
  },

  clearBtn: { marginTop: 20, alignItems: "center" },
  clearBtnText: { color: "#007AFF", fontSize: 15, fontWeight: "500" },
});
