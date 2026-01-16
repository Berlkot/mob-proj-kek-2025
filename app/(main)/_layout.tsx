// app/(main)/_layout.tsx
import { Stack } from 'expo-router';

export default function MainStackLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: '#F2F2F7' } }}>
      
      {/* Группа Табов (Главная + История) */}
      <Stack.Screen 
        name="(tabs)" 
        options={{ 
          headerShown: false // Скрываем заголовок стека, так как у табов свои заголовки
        }} 
      />

      {/* Экран Профиля */}
      <Stack.Screen 
        name="profile" 
        options={{ 
          title: 'Настройки',
          presentation: 'card', // 'modal' для открытия снизу вверх (iOS стиль) или 'card' для сдвига
          headerBackTitle: 'Назад', // Текст кнопки назад (iOS)
        }} 
      />
        <Stack.Screen 
    name="case/[id]" 
    options={{ 
      title: 'Детали', // Заголовок по умолчанию, внутри файла мы его перезаписываем title-ом кейса
      headerBackTitle: 'История' 
    }} 
  />
    </Stack>
  );
}