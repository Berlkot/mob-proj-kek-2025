// lib/offline-queue.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'OFFLINE_CASES_QUEUE';

// Флаг-блокировщик, чтобы не запускать две синхронизации одновременно
let isSyncing = false;

export type OfflineCase = {
  user_id: string;
  created_at: string;
  title: string;
  input_data: {
    units: string;
    na: number;
    glucose: number;
    bun: number;
    ethanol: number | null;
    measured_osmolality: number | null;
  };
  result_data: {
    formula_id: string;
    calculated_osmolality: number;
    osmolal_gap: number | null;
  };
};

export const saveToQueue = async (item: OfflineCase) => {
  try {
    const currentQueueRaw = await AsyncStorage.getItem(QUEUE_KEY);
    const currentQueue: OfflineCase[] = currentQueueRaw ? JSON.parse(currentQueueRaw) : [];
    
    // Простая защита от дубликатов по времени создания
    const exists = currentQueue.some(i => i.created_at === item.created_at);
    if (!exists) {
      currentQueue.push(item);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(currentQueue));
    }
  } catch (e) {
    console.error('Error saving to offline queue', e);
  }
};

export const syncQueue = async () => {
  // 1. Если уже синхронизируемся — выходим, чтобы не наделать дублей
  if (isSyncing) {
    return;
  }

  try {
    isSyncing = true; // БЛОКИРУЕМ

    const currentQueueRaw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!currentQueueRaw) return;

    let queue: OfflineCase[] = JSON.parse(currentQueueRaw);
    if (queue.length === 0) return;

    console.log(`[Sync] Found ${queue.length} items. Starting sync...`);

    const failedItems: OfflineCase[] = [];
    let stopSyncing = false; 

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];

      if (stopSyncing) {
        failedItems.push(item);
        continue;
      }

      try {
        // A. Создаем кейс
        const { data: caseData, error: caseError } = await supabase
          .from('cases')
          .insert({
            user_id: item.user_id,
            status: 'final',
            title: item.title,
            created_at: item.created_at
          })
          .select()
          .single();

        if (caseError) throw caseError;

        // B. Inputs
        const { error: inputError } = await supabase.from('case_inputs').insert({
          case_id: caseData.id,
          ...item.input_data
        });
        if (inputError) throw inputError;

        // C. Results
        const { error: resError } = await supabase.from('case_results').insert({
          case_id: caseData.id,
          ...item.result_data
        });
        if (resError) throw resError;

        // УСПЕХ: ничего не делаем, элемент просто не попадет в failedItems

      } catch (err: any) {
        const msg = err.message || '';
        // Проверка на ошибку сети
        if (msg.includes('Network request failed') || msg.includes('FetchError') || msg.includes('network')) {
          console.log('[Sync] Network drop. Stopping.');
          stopSyncing = true;
        } else {
          console.error('[Sync] Data error:', msg);
        }
        
        failedItems.push(item);
      }
    }

    // Сохраняем остаток очереди
    if (failedItems.length > 0) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failedItems));
    } else {
      await AsyncStorage.removeItem(QUEUE_KEY);
      console.log('[Sync] Success. Queue cleared.');
    }

  } catch (e) {
    console.log('[Sync] Global Error', e);
  } finally {
    isSyncing = false; // РАЗБЛОКИРУЕМ
  }
};