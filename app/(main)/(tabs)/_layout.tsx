// app/(main)/(tabs)/_layout.tsx
import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';

export default function TabsLayout() {
  const router = useRouter();

  const SettingsButton = () => (
    <TouchableOpacity 
      // Мы пушим в корень (main), где лежит profile
      onPress={() => router.push('/(main)/profile')} 
      style={{ marginRight: 16 }}
    >
      <Ionicons name="settings-outline" size={24} color="#007AFF" />
    </TouchableOpacity>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: { backgroundColor: '#F2F2F7', borderTopColor: '#C7C7CC' },
        headerStyle: { backgroundColor: '#F2F2F7' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Калькулятор',
          tabBarLabel: 'Калькулятор',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calculator-outline" size={size} color={color} />
          ),
          headerRight: () => <SettingsButton />,
        }} 
      />

      <Tabs.Screen 
        name="history" 
        options={{ 
          title: 'История',
          tabBarLabel: 'История',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
          headerRight: () => <SettingsButton />,
        }} 
      />
    </Tabs>
  );
}