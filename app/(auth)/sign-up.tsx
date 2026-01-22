// app/(auth)/sign-up.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"doctor" | "patient">("doctor");
  const [loading, setLoading] = useState(false);

  const signUp = async () => {
    if (!email || !password || !fullName) {
      Alert.alert("Ошибка", "Заполните все поля");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    });

    if (error) {
      Alert.alert("Ошибка", error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      // Успешный вход
    } else {
      Alert.alert("Почти готово", "Проверьте почту для подтверждения.");
      router.replace("/(auth)/sign-in");
    }

    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Шапка */}
        <View style={styles.header}>
          <Ionicons
            name="person-add"
            size={32}
            color="#fff"
            style={{ marginBottom: 10 }}
          />
          <Text style={styles.headerTitle}>Создание аккаунта</Text>
          <Text style={styles.headerSubtitle}>
            Считайте показатели с помощью Калькулятора осмолярности
          </Text>
        </View>

        <View style={styles.form}>
          {/* Поля ввода */}
          <Text style={styles.label}>Личные данные</Text>
          <TextInput
            style={styles.input}
            placeholder="ФИО или Имя"
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
            placeholder="Пароль (минимум 6 символов)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* Выбор роли */}
          <Text style={styles.label}>Выберите режим работы</Text>
          <View style={styles.roleContainer}>
            <TouchableOpacity
              style={[
                styles.roleCard,
                role === "doctor" && styles.roleCardActive,
              ]}
              onPress={() => setRole("doctor")}
            >
              <Ionicons
                name="medkit"
                size={24}
                color={role === "doctor" ? "#fff" : "#007AFF"}
              />
              <Text
                style={[
                  styles.roleTitle,
                  role === "doctor" && styles.roleTextActive,
                ]}
              >
                Врач
              </Text>
              <Text
                style={[
                  styles.roleDesc,
                  role === "doctor" && styles.roleTextActive,
                ]}
              >
                Проф. термины, быстрый ввод, клинический анализ.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleCard,
                role === "patient" && styles.roleCardActive,
              ]}
              onPress={() => setRole("patient")}
            >
              <Ionicons
                name="person"
                size={24}
                color={role === "patient" ? "#fff" : "#007AFF"}
              />
              <Text
                style={[
                  styles.roleTitle,
                  role === "patient" && styles.roleTextActive,
                ]}
              >
                Пациент
              </Text>
              <Text
                style={[
                  styles.roleDesc,
                  role === "patient" && styles.roleTextActive,
                ]}
              >
                Простой язык, объяснения, контроль состояния.
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.btn}
            onPress={signUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Зарегистрироваться</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace("/(auth)/sign-in")}
            style={{ marginTop: 20 }}
          >
            <Text
              style={{
                color: "#007AFF",
                textAlign: "center",
                fontWeight: "600",
              }}
            >
              Уже есть аккаунт? Войти
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  header: {
    backgroundColor: "#007AFF",
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "center",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 5,
  },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.8)", textAlign: "center"  },

  form: { padding: 20 },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 10,
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },

  roleContainer: { flexDirection: "row", gap: 12, marginBottom: 25 },
  roleCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  roleCardActive: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  roleTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 4,
    color: "#333",
  },
  roleDesc: { fontSize: 11, textAlign: "center", color: "#8E8E93" },
  roleTextActive: { color: "#fff" },

  btn: {
    backgroundColor: "#34C759",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
    shadowColor: "#34C759",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "bold" },
});
