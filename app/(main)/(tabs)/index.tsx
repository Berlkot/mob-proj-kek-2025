// app/(main)/index.tsx
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ValidatedInput } from "../../../components/ui/ValidatedInput";
import {
  calculateGap,
  calculateOsmolality,
  OSMOLALITY_REF_RANGE,
} from "../../../constants/formulas";
import { SAFETY_LIMITS, validateInput } from "../../../constants/validation"; // Убедись, что экспортировал SAFETY_LIMITS
import { useAuth } from "../../../contexts/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { UnitType } from "../../../types/db";

export default function CalculatorScreen() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  // --- Состояние формы ---
  const [units, setUnits] = useState<UnitType>("mg/dL");

  // Значения
  const [values, setValues] = useState({
    na: "",
    glucose: "",
    bun: "",
    ethanol: "",
    measured_osmolality: "",
  });

  // Ошибки
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  // Результаты
  const [result, setResult] = useState<{
    calc: number;
    gap: number | null;
  } | null>(null);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);

  // Состояние для хранения AI ответа
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // app/(main)/index.tsx

  const fetchInterpretation = async (context: "doctor" | "patient") => {
    // Проверка: есть ли ID кейса? (Мы должны сначала сохранить расчёт)
    if (!currentCaseId) {
      Alert.alert("Ошибка", "Сначала выполните расчёт");
      return;
    }

    setAiLoading(true);
    setAiResult(null);

    try {
      // 1. Формируем payload для Edge Function
      const payload = {
        context: context,
        units: units,
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

      // 2. Вызываем функцию (она теперь только ГЕНЕРИРУЕТ, но не сохраняет)
      const { data, error } = await supabase.functions.invoke(
        "osmolality-interpret",
        {
          body: payload,
        }
      );

      if (error) throw new Error(error.message || "Ошибка вызова AI");
      if (data && data.error) throw new Error(data.error);

      const aiData = data; // Это наш JSON с интерпретацией

      // 3. НОВОЕ: Сохраняем результат в БД прямо с клиента
      if (session?.user) {
        const { error: dbError } = await supabase
          .from("llm_interpretations")
          .insert({
            case_id: currentCaseId, // ID, который мы сохранили при расчёте
            user_id: session.user.id,
            context: context,
            model: "nvidia/nemotron-3-nano-30b-a3b:free",
            result_json: aiData,
            status: "ok",
          });

        if (dbError) {
          console.error("Ошибка сохранения AI в БД:", dbError);
          // Не блокируем показ результата, но предупреждаем в консоль
        }
      }

      setAiResult(aiData);
    } catch (e: any) {
      Alert.alert("Ошибка AI", e.message);
    } finally {
      setAiLoading(false);
    }
  };
  // Сброс при смене единиц
  useEffect(() => {
    setErrors({});
    setResult(null);
    setAiResult(null);
    setCurrentCaseId(null);
  }, [units]);

  // --- Умная валидация при вводе ---
  const handleVerifyField = (
    key: string,
    text: string,
    isBlur: boolean = false
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
    if (num > limit.max) errorMsg = `Макс: ${limit.max}`;
    else if (num < limit.min && isBlur) errorMsg = `Мин: ${limit.min}`;
    if (num >= limit.min && num <= limit.max) errorMsg = null;
    setErrors((prev) => {
      if (prev[key] === errorMsg) return prev;
      if (!isBlur && num < limit.min && prev[key]) return prev;
      return { ...prev, [key]: errorMsg };
    });
  };
  const handleChange = (key: string, text: string) => {
    setValues((prev) => ({ ...prev, [key]: text }));
    handleVerifyField(key, text, false);
    // Сброс при изменении данных, чтобы не показывать старый результат
    if (result) setResult(null);
    if (aiResult) setAiResult(null);
    if (currentCaseId) setCurrentCaseId(null);
  };

  const handleBlur = (key: string) =>
    handleVerifyField(key, values[key as keyof typeof values], true);

  // --- Финальная проверка перед расчётом ---
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
      Alert.alert("Внимание", "Введите Na, Глюкозу и Мочевину");
      return;
    }
    if (!validateOnSubmit()) {
      Alert.alert("Ошибка данных", "Проверьте красные поля");
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
        units
      );
      const gap = valMeasured ? calculateGap(valMeasured, calculatedOsm) : null;

      setResult({ calc: calculatedOsm, gap });

      // Сохранение в БД
      if (session?.user) {
        // 1. Создаем кейс
        const { data: caseData, error: caseError } = await supabase
          .from("cases")
          .insert({
            user_id: session.user.id,
            status: "draft",
            title: `Пациент ${new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`,
          })
          .select()
          .single();

        if (caseError) throw caseError;

        // 2. Запоминаем ID кейса для AI
        setCurrentCaseId(caseData.id);

        // 3. Сохраняем входы
        await supabase.from("case_inputs").insert({
          case_id: caseData.id,
          units: units,
          na: valNa,
          glucose: valGlu,
          bun: valBun,
          ethanol: valEth || null,
          measured_osmolality: valMeasured,
        });

        // 4. Сохраняем результаты
        await supabase.from("case_results").insert({
          case_id: caseData.id,
          formula_id: units === "mg/dL" ? "2na_glu_bun_us" : "2na_glu_bun_si",
          calculated_osmolality: calculatedOsm,
          osmolal_gap: gap,
        });
      }
    } catch (e: any) {
      Alert.alert("Ошибка сохранения", e.message);
    } finally {
      setLoading(false);
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
    setCurrentCaseId(null); // Сбрасываем ID
    setErrors({});
  };

  const isAbnormal = (val: number) =>
    val < OSMOLALITY_REF_RANGE.min || val > OSMOLALITY_REF_RANGE.max;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.headerTitle}>Осмолярность</Text>

          {/* ... Inputs UI (как раньше) ... */}
          <View style={styles.card}>
            <ValidatedInput
              label="Na+"
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
              label={units === "mg/dL" ? "BUN" : "Мочевина"}
              value={values.bun}
              onChangeText={(t) => handleChange("bun", t)}
              onBlur={() => handleBlur("bun")}
              unitLabel={units}
              placeholder={units === "mg/dL" ? "15" : "5.4"}
              error={errors.bun}
            />
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
              label="Измер. Осм."
              value={values.measured_osmolality}
              onChangeText={(t) => handleChange("measured_osmolality", t)}
              onBlur={() => handleBlur("measured_osmolality")}
              unitLabel="mOsm/kg"
              placeholder="285"
              error={errors.measured_osmolality}
            />
          </View>

          <TouchableOpacity
            style={styles.calcButton}
            onPress={handleCalculate}
            disabled={loading}
          >
            <Text style={styles.calcButtonText}>РАССЧИТАТЬ</Text>
          </TouchableOpacity>

          {/* Результаты Расчета */}
          {result && (
            <View style={styles.resultContainer}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Расчётная</Text>
                <Text
                  style={[
                    styles.resultValue,
                    isAbnormal(result.calc) ? styles.textWarn : styles.textOk,
                  ]}
                >
                  {result.calc}
                </Text>
              </View>
              {result.gap !== null && (
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Разрыв</Text>
                  <Text
                    style={[
                      styles.resultValue,
                      result.gap > 10 ? styles.textDanger : styles.textOk,
                    ]}
                  >
                    {result.gap}
                  </Text>
                </View>
              )}

              {/* Кнопки вызова AI */}
              <View style={styles.aiActions}>
                <Text style={styles.aiHint}>Получить интерпретацию:</Text>
                <View style={styles.aiButtonsRow}>
                  <TouchableOpacity
                    style={[styles.aiBtn, styles.aiBtnDoctor]}
                    onPress={() => fetchInterpretation("doctor")}
                    disabled={aiLoading}
                  >
                    <Text style={styles.aiBtnText}>Для врача</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.aiBtn, styles.aiBtnPatient]}
                    onPress={() => fetchInterpretation("patient")}
                    disabled={aiLoading}
                  >
                    <Text style={styles.aiBtnText}>Для пациента</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {aiLoading && (
                <ActivityIndicator
                  style={{ marginTop: 10 }}
                  size="small"
                  color="#007AFF"
                />
              )}

              {/* Блок ответа AI */}
              {aiResult && (
                <View style={styles.aiCard}>
                  <Text style={styles.aiTitle}>
                    {aiResult.context === "doctor"
                      ? "👨‍⚕️ Мнение (Врач)"
                      : "🧑‍🦱 Справка (Пациент)"}
                  </Text>

                  <Text style={styles.aiSummary}>{aiResult.summary}</Text>

                  {/* Интерпретация */}
                  <Text style={styles.aiHeader}>Основные выводы:</Text>
                  {aiResult.interpretation?.map((txt: string, i: number) => (
                    <Text key={`int-${i}`} style={styles.bullet}>
                      • {txt}
                    </Text>
                  ))}

                  {/* Красные флаги */}
                  {aiResult.red_flags && aiResult.red_flags.length > 0 && (
                    <>
                      <Text style={[styles.aiHeader, { color: "#D32F2F" }]}>
                        Тревожные признаки:
                      </Text>
                      {aiResult.red_flags.map((txt: string, i: number) => (
                        <Text key={`red-${i}`} style={styles.bulletDanger}>
                          ⚠️ {txt}
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
                <Text style={styles.clearBtnText}>Очистить</Text>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#000",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  divider: { height: 1, backgroundColor: "#E5E5EA", marginVertical: 12 },

  calcButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  calcButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  resultContainer: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    alignItems: "center",
  },
  resultLabel: { fontSize: 16, color: "#333" },
  resultValue: { fontSize: 20, fontWeight: "bold" },
  textOk: { color: "#34C759" },
  textWarn: { color: "#FF9500" },
  textDanger: { color: "#FF3B30" },

  // AI Styles
  aiActions: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 12,
  },
  aiHint: { fontSize: 14, color: "#666", marginBottom: 8 },
  aiButtonsRow: { flexDirection: "row", gap: 10 },
  aiBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: "center" },
  aiBtnDoctor: { backgroundColor: "#E3F2FD" },
  aiBtnPatient: { backgroundColor: "#F3E5F5" },
  aiBtnText: { color: "#333", fontWeight: "600", fontSize: 14 },

  aiCard: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#FAFAFA",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  aiTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 8, color: "#333" },
  aiSummary: {
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 10,
    color: "#444",
  },
  aiHeader: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 4,
    color: "#333",
  },
  bullet: { fontSize: 14, marginLeft: 4, marginBottom: 2, color: "#444" },
  bulletDanger: {
    fontSize: 14,
    marginLeft: 4,
    marginBottom: 2,
    color: "#D32F2F",
  },
  disclaimer: {
    fontSize: 11,
    color: "#999",
    marginTop: 12,
    textAlign: "center",
  },

  clearBtn: { marginTop: 16, alignItems: "center" },
  clearBtnText: { color: "#007AFF" },
});
