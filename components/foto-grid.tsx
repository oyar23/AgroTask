import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { eliminarFoto, obtenerUrlFoto } from '@/lib/storage';
import { useAuthStore } from '@/lib/auth-store';
import { confirm } from '@/lib/platform-utils';
import type { Foto } from '@/types/database';

type Props = {
  fotos: Foto[];
  onChange: () => void;
};

// Grid 3 columnas con miniaturas. Tap → modal full screen. La miniatura
// usa la misma signed URL que el modal: la imagen ya está cacheada por el
// renderer así que no se descarga dos veces.
export function FotoGrid({ fotos, onChange }: Props) {
  const [activa, setActiva] = useState<Foto | null>(null);

  if (fotos.length === 0) {
    return <Text style={styles.placeholder}>Sin fotos todavía</Text>;
  }

  return (
    <>
      <View style={styles.grid}>
        {fotos.map((foto) => (
          <Miniatura key={foto.id} foto={foto} onPress={() => setActiva(foto)} />
        ))}
      </View>
      <Modal
        visible={!!activa}
        transparent
        animationType="fade"
        onRequestClose={() => setActiva(null)}
      >
        {activa ? (
          <FotoFullScreen
            foto={activa}
            onClose={() => setActiva(null)}
            onDeleted={() => {
              setActiva(null);
              onChange();
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

type MiniaturaProps = {
  foto: Foto;
  onPress: () => void;
};

function Miniatura({ foto, onPress }: MiniaturaProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void obtenerUrlFoto(foto.storage_path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [foto.storage_path]);

  return (
    <Pressable onPress={onPress} style={styles.miniatura}>
      {url ? (
        <Image source={{ uri: url }} style={styles.miniaturaImg} />
      ) : (
        <View style={styles.miniaturaLoading}>
          <ActivityIndicator color="#1f6f3f" />
        </View>
      )}
    </Pressable>
  );
}

type FullScreenProps = {
  foto: Foto;
  onClose: () => void;
  onDeleted: () => void;
};

function FotoFullScreen({ foto, onClose, onDeleted }: FullScreenProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);

  useEffect(() => {
    let cancelled = false;
    void obtenerUrlFoto(foto.storage_path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [foto.storage_path]);

  function handleEliminar() {
    confirm('¿Eliminar foto?', 'No se puede deshacer.', () => {
      void (async () => {
        setDeleting(true);
        setError(null);
        const result = await eliminarFoto(foto.id, foto.storage_path);
        setDeleting(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDeleted();
      })();
    });
  }

  const puedeBorrar = userId === foto.subida_por;

  return (
    <View style={styles.modalRoot}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalContent}>
        {url ? (
          <ScrollView
            maximumZoomScale={3}
            minimumZoomScale={1}
            contentContainerStyle={styles.zoomContent}
            centerContent
          >
            <Image source={{ uri: url }} style={styles.fullImg} resizeMode="contain" />
          </ScrollView>
        ) : (
          <View style={styles.modalLoading}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.modalActions}>
          {puedeBorrar ? (
            <Pressable
              onPress={handleEliminar}
              disabled={deleting}
              style={({ pressed }) => [
                styles.modalBtn,
                styles.modalBtnDanger,
                (pressed || deleting) && styles.pressed,
              ]}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalBtnText}>Eliminar</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.modalBtn,
              styles.modalBtnClose,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.modalBtnCloseText}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const screen = Dimensions.get('window');
const COLS = 3;
const GAP = 6;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  miniatura: {
    width: `${100 / COLS - 1}%`,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#eee',
  },
  miniaturaImg: {
    width: '100%',
    height: '100%',
  },
  miniaturaLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    flex: 1,
    padding: 20,
    gap: 12,
    justifyContent: 'center',
  },
  zoomContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  fullImg: {
    width: screen.width - 40,
    height: screen.height * 0.7,
  },
  modalLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 20,
  },
  modalBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnClose: {
    backgroundColor: '#fff',
  },
  modalBtnDanger: {
    backgroundColor: '#c0392b',
  },
  modalBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  modalBtnCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f6f3f',
  },
  pressed: {
    opacity: 0.85,
  },
  errorText: {
    color: '#fff',
    backgroundColor: '#c0392b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    fontSize: 14,
    textAlign: 'center',
  },
});
