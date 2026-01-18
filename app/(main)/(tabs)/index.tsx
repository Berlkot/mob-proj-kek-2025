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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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

export default function CalculatorScreen() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  // Профиль пользователя (роль)
  const [userRole, setUserRole] = useState<"doctor" | "patient" | null>(null);

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

  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [result, setResult] = useState<{
    calc: number;
    gap: number | null;
  } | null>(null);
  const [currentCaseId, setCurrentCaseId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 1. Загружаем роль
  useEffect(() => {
    if (session?.user) fetchUserRole();
  }, [session]);

  const fetchUserRole = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", session?.user.id)
      .single();

    if (data?.role) {
      const role = data.role === "patient" ? "patient" : "doctor";
      setUserRole(role);
    } else {
      setUserRole("doctor");
    }
  };

  // Сброс
  useEffect(() => {
    setErrors({});
    setResult(null);
    setAiResult(null);
    setCurrentCaseId(null);
  }, [units]);

  // --- AI ---
  const fetchInterpretation = async () => {
    if (!currentCaseId) {
      Alert.alert("Ошибка", "Сначала выполните расчёт");
      return;
    }
    const context = userRole || "doctor";
    setAiLoading(true);
    setAiResult(null);

    try {
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

      const { data, error } = await supabase.functions.invoke(
        "osmolality-interpret",
        { body: payload }
      );

      if (error) throw new Error(error.message || "Ошибка вызова AI");
      if (data && data.error) throw new Error(data.error);

      if (session?.user) {
        await supabase.from("llm_interpretations").insert({
          case_id: currentCaseId,
          user_id: session.user.id,
          context: context,
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

  // --- Validation & Calc ---
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

      if (session?.user) {
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
    setCurrentCaseId(null);
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

          {/* --- ВОССТАНОВЛЕННЫЙ ПЕРЕКЛЮЧАТЕЛЬ --- */}
          <View style={styles.toggleContainer}>
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
                mg/dL (US)
              </Text>
            </TouchableOpacity>
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
                mmol/L (SI)
              </Text>
            </TouchableOpacity>
          </View>
          {/* ------------------------------------- */}

          <View style={styles.card}>
            <ValidatedInput
              label="Na"
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
                  {result.calc} <Text style={styles.unitText}>mOsm/kg</Text>
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

              <View style={styles.aiActions}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Text style={styles.aiHint}>AI Интерпретация</Text>
                  {userRole && (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>
                        {userRole === "doctor"
                          ? "Режим врача"
                          : "Режим пациента"}
                      </Text>
                    </View>
                  )}
                </View>
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
                    {aiLoading ? "Анализирую..." : "Получить анализ"}
                  </Text>
                </TouchableOpacity>
              </View>

              {aiResult && (
                <View style={styles.aiCard}>
                  <Text style={styles.aiTitle}>
                    {aiResult.context === "doctor"
                      ? "ИИ интерпретация"
                      : "ИИ интерпретация"}
                  </Text>
                  <Text style={styles.aiSummary}>{aiResult.summary}</Text>
                  <Text style={styles.aiHeader}>Основные выводы:</Text>
                  {aiResult.interpretation?.map((txt: string, i: number) => (
                    <Text key={`int-${i}`} style={styles.bullet}>
                      • {txt}
                    </Text>
                  ))}
                  {aiResult.red_flags?.length > 0 && (
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

  // Styles for Toggle
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#E5E5EA",
    borderRadius: 8,
    padding: 2,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: { fontSize: 13, fontWeight: "600", color: "#8E8E93" },
  toggleTextActive: { color: "#000" },

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
  unitText: { fontSize: 16, fontWeight: "normal", color: "#666" },
  textOk: { color: "#34C759" },
  textWarn: { color: "#FF9500" },
  textDanger: { color: "#FF3B30" },

  aiActions: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 12,
  },
  aiHint: { fontSize: 16, fontWeight: "600", color: "#333" },
  roleBadge: {
    backgroundColor: "#E5E5EA",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: { fontSize: 12, color: "#666", fontWeight: "500" },
  aiBtnSingle: {
    flexDirection: "row",
    backgroundColor: "#5856D6",
    borderRadius: 12,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  aiBtnTextSingle: { color: "#fff", fontWeight: "bold", fontSize: 16 },
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
