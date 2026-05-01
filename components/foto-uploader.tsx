import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { subirFoto } from '@/lib/storage';

type Props = {
  tareaId: string;
  onUploaded: () => void;
};

// Componente que permite sacar una foto con la cámara o elegirla de la
// galería, mostrarla en preview y subirla. La compresión la hace
// `lib/storage.ts`.
//
// Pedir permisos: las APIs `requestCameraPermissionsAsync` y
// `requestMediaLibraryPermissionsAsync` son idempotentes (si ya fueron
// otorgados, devuelven inmediatamente). Las llamamos lazy: solo cuando el
// usuario toca el botón, no al montar.
export function FotoUploader({ tareaId, onUploaded }: Props) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegirDeGaleria() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Necesitamos permiso para acceder a tus fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) setPreviewUri(asset.uri);
  }

  async function sacarFoto() {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Necesitamos permiso de cámara para sacar fotos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) setPreviewUri(asset.uri);
  }

  async function confirmarSubida() {
    if (!previewUri) return;
    setUploading(true);
    setError(null);
    const result = await subirFoto(tareaId, previewUri);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreviewUri(null);
    onUploaded();
  }

  if (previewUri) {
    return (
      <View style={styles.previewWrapper}>
        <Image source={{ uri: previewUri }} style={styles.preview} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.row}>
          <Pressable
            onPress={confirmarSubida}
            disabled={uploading}
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              (pressed || uploading) && styles.pressed,
            ]}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnPrimaryText}>Subir foto</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setPreviewUri(null);
              setError(null);
            }}
            disabled={uploading}
            style={({ pressed }) => [
              styles.btn,
              styles.btnSecondary,
              (pressed || uploading) && styles.pressed,
            ]}
          >
            <Text style={styles.btnSecondaryText}>Descartar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={sacarFoto}
        style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
      >
        <Text style={styles.btnPrimaryText}>📷 Sacar foto</Text>
      </Pressable>
      <Pressable
        onPress={elegirDeGaleria}
        style={({ pressed }) => [
          styles.btn,
          styles.btnSecondary,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.btnSecondaryText}>🖼️ Elegir</Text>
      </Pressable>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  previewWrapper: {
    gap: 10,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 10,
    backgroundColor: '#eee',
  },
  btn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  btnPrimary: {
    backgroundColor: '#1f6f3f',
    borderColor: '#1f6f3f',
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  btnSecondary: {
    backgroundColor: '#fff',
    borderColor: '#1f6f3f',
  },
  btnSecondaryText: {
    color: '#1f6f3f',
    fontWeight: '700',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
  errorText: {
    color: '#c0392b',
    fontSize: 14,
    flexBasis: '100%',
    textAlign: 'center',
  },
});
