import { Alert, Platform } from 'react-native';

// Wrapper de confirmación cross-platform.
// `Alert.alert` no se renderiza fiable en react-native-web (en algunas
// versiones es no-op silencioso), así que en web caemos a `window.confirm`,
// que es modal y síncrono. Pierde el styling "destructive" del dialog
// nativo de iOS/Android pero el comportamiento es correcto.
export function confirm(
  title: string,
  body: string | undefined,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    const text = body ? `${title}\n\n${body}` : title;
    if (typeof window !== 'undefined' && window.confirm(text)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, body, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Salir', style: 'destructive', onPress: onConfirm },
  ]);
}
