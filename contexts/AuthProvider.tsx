// contexts/AuthProvider.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react"; // Добавьте useRef
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import NetInfo from "@react-native-community/netinfo";
import { syncQueue } from "../lib/offline-queue";

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  isGuest: boolean;
  isConnected: boolean;
  loginAsGuest: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  isGuest: false,
  isConnected: true,
  loginAsGuest: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  // Ref для отслеживания предыдущего состояния, чтобы не спамить syncQueue
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    // 1. Слушатель сети
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = !!(state.isConnected && state.isInternetReachable);
      setIsConnected(online);

      // Логика "Rising Edge": Запускаем синхронизацию только если
      // интернет появился, а до этого его не было (или это первый запуск).
      // Также проверяем session, так как гостю синхронизация не нужна.
      if (online && session) {
        if (wasOfflineRef.current) {
          console.log("[Auth] Connection restored. Triggering sync...");
          syncQueue();
        }
        wasOfflineRef.current = false; // Теперь мы онлайн
      } else {
        wasOfflineRef.current = true; // Мы оффлайн
      }
    });

    // 2. Слушатель сессии
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      // При инициализации тоже можно попробовать синхронизировать, если есть сеть
      if (session) syncQueue();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setIsGuest(false);
        syncQueue();
      }
    });

    return () => {
      unsubscribeNet();
      subscription.unsubscribe();
    };
  }, [session]); // session в зависимостях важен, чтобы syncQueue видел актуального юзера (хотя он берет ID из очереди)

  const loginAsGuest = () => {
    setIsGuest(true);
  };

  const logout = async () => {
    if (isGuest) {
      setIsGuest(false);
    } else {
      await supabase.auth.signOut();
    }
  };

  return (
    <AuthContext.Provider
      value={{ session, loading, isGuest, isConnected, loginAsGuest, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
