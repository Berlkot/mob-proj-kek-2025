// app/_layout.tsx
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthProvider';
import { View, ActivityIndicator } from 'react-native';

const InitialLayout = () => {
  const { session, loading, isGuest } = useAuth(); // Добавили isGuest
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    // Пользователь авторизован (сессия ИЛИ гость)
    const isAuthorized = !!session || isGuest;

    if (!isAuthorized && !inAuthGroup) {
      // Если не авторизован и не на экране входа -> на вход
      router.replace('/(auth)/sign-in');
    } else if (isAuthorized && inAuthGroup) {
      // Если авторизован и на экране входа -> в приложение
      router.replace('/(main)');
    }
  }, [session, isGuest, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Slot />;
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <InitialLayout />
    </AuthProvider>
  );
}
