// ============================================================================
// AgroTasks · Push notifications cliente
// ============================================================================
// Este módulo registra el token de Expo Push del dispositivo y lo guarda en
// la tabla `push_tokens`. También configura el handler para cuando el user
// toca una notificación con la app abierta o en background.
//
// IMPORTANTE: el push real **no funciona en Expo Go a partir de SDK 53**.
// Hace falta un development build (`eas build --profile development`).
// Hasta que el dev build esté listo:
//   - registrarParaPush() loguea un warning y devuelve null sin romper nada.
//   - el resto del flujo de auth no se bloquea.
//
// Una vez en dev build:
//   1. expo-notifications ya está instalado en package.json (no hay que
//      hacer nada extra).
//   2. Ejecutar el SQL de schema-push.sql en Supabase.
//   3. Desplegar la Edge Function notify-tarea.
//   4. Llamar a registrarParaPush() después del login.
// ============================================================================

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Configura cómo se muestran las notificaciones cuando la app está
// foreground. Por default Expo no las muestra; pedimos que sí.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Pide permisos y obtiene el token de Expo Push. Devuelve null si:
//   - estamos en Expo Go (SDK 53+ no permite push en Go).
//   - el user negó permisos.
//   - cualquier otro error (sin internet, simulador sin Google Play, etc.).
export async function registrarParaPush(userId: string): Promise<string | null> {
  try {
    // Permisos.
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const { status: requested } = await Notifications.requestPermissionsAsync();
      status = requested;
    }
    if (status !== 'granted') {
      return null;
    }

    // Android necesita un canal de notificación con prioridad alta para
    // que la notif no quede silenciada.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'AgroTasks',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1f6f3f',
      });
    }

    // El projectId lo lee Expo de app.json/app.config.js. En dev build
    // viene del slug + EAS project. En Expo Go falla con un warning.
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Guardar en `push_tokens`. Si ya existe, ON CONFLICT lo deja igual.
    // (La tabla tiene UNIQUE(token), así que un INSERT duplicado falla con
    // 23505 — lo ignoramos.)
    const platform: 'ios' | 'android' | 'web' =
      Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';

    const { error } = await supabase.from('push_tokens').insert({
      user_id: userId,
      token,
      platform,
    });

    if (error && !error.message.includes('duplicate key')) {
      throw error;
    }

    return token;
  } catch {
    // No queremos que el push registration rompa el login.
    return null;
  }
}

// Suscribe al evento "user tocó una notificación". El callback recibe el
// payload (que incluye `tarea_id` en nuestro flujo). Devuelve la suscripción
// para que el caller pueda llamar `.remove()` al desmontar.
export function suscribirseTapNotificacion(
  callback: (payload: Record<string, unknown>) => void,
): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data && typeof data === 'object') {
      callback(data as Record<string, unknown>);
    }
  });
}

// Borrar el token al hacer logout. Mantiene `push_tokens` limpia y evita
// que un dispositivo compartido siga recibiendo pushes del user anterior.
export async function eliminarTokenLocal(token: string | null): Promise<void> {
  if (!token) return;
  await supabase.from('push_tokens').delete().eq('token', token);
}
