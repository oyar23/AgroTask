import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import type { Foto } from '@/types/database';

const BUCKET = 'fotos';

// Tamaño máximo del lado mayor (px). Vea CLAUDE.md "Decisiones tomadas".
const MAX_WIDTH = 1024;
const COMPRESSION = 0.7;

// URLs firmadas en lugar de públicas. Validez de 1 hora alcanza para mostrar
// la foto en la pantalla y refrescar al volver. Privacidad: ningún URL queda
// vivo si el usuario rota credenciales o si el bucket cambia de policy.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type SubirFotoResult =
  | { ok: true; foto: Foto }
  | { ok: false; error: string };

// Sube una foto:
//   1. Comprime/escala la imagen a 1024px (lado mayor) JPEG calidad 0.7.
//   2. Genera un id de fila en `fotos` y arma el path `{tareaId}/{fotoId}.jpg`.
//   3. Convierte el archivo local a ArrayBuffer (forma uniforme cross-platform
//      vs. FormData que requiere casts).
//   4. Sube a Storage y registra la fila en la tabla `fotos`.
// Si el INSERT a la tabla falla después del upload, intentamos limpiar el
// archivo huérfano. Si el upload falla, no llegamos al INSERT.
export async function subirFoto(
  tareaId: string,
  uri: string,
): Promise<SubirFotoResult> {
  const userId = useAuthStore.getState().session?.user.id;
  if (!userId) return { ok: false, error: 'No hay sesión activa' };

  try {
    const manipulated = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_WIDTH } }],
      { compress: COMPRESSION, format: SaveFormat.JPEG },
    );

    // El id de la fila tiene que existir antes del path: lo generamos en JS
    // con un uuid (`crypto.randomUUID` está disponible en RN moderno y en
    // navegadores; supabase-js ya carga el polyfill `react-native-url-polyfill`
    // en `lib/supabase.ts`).
    const fotoId = generateUuid();
    const storagePath = `${tareaId}/${fotoId}.jpg`;

    const arrayBuffer = await fetch(manipulated.uri).then((r) =>
      r.arrayBuffer(),
    );

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });
    if (upErr) {
      return { ok: false, error: mapStorageError(upErr.message) };
    }

    const { data: row, error: rowErr } = await supabase
      .from('fotos')
      .insert({
        id: fotoId,
        tarea_id: tareaId,
        subida_por: userId,
        storage_path: storagePath,
      })
      .select('*')
      .single();

    if (rowErr || !row) {
      // Limpieza best-effort. Si esto también falla, queda un archivo
      // huérfano; en el MVP convivimos con eso. El listado de fotos parte
      // de la tabla, así que el huérfano no se muestra.
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return { ok: false, error: mapStorageError(rowErr?.message ?? '') };
    }

    return { ok: true, foto: row as Foto };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'No pudimos subir la foto',
    };
  }
}

// URL firmada para mostrar una foto en pantalla. Devuelve `null` si no se
// pudo firmar (sin permiso, archivo no existe, etc.).
export async function obtenerUrlFoto(
  storagePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

type EliminarFotoResult = { ok: true } | { ok: false; error: string };

// Elimina la foto: primero la fila (las policies lo permiten al subidor o al
// jefe del campo); después el archivo. Si la fila no se puede borrar, no
// borramos el archivo. Si la fila se borra pero el archivo no, el listado
// igual deja de mostrarla (la fuente de verdad es la tabla).
export async function eliminarFoto(
  fotoId: string,
  storagePath: string,
): Promise<EliminarFotoResult> {
  const { error: rowErr } = await supabase
    .from('fotos')
    .delete()
    .eq('id', fotoId);
  if (rowErr) return { ok: false, error: mapStorageError(rowErr.message) };

  await supabase.storage.from(BUCKET).remove([storagePath]);
  return { ok: true };
}

function mapStorageError(raw: string): string {
  if (!raw) return 'No pudimos completar la operación';
  if (raw.includes('row-level security') || raw.includes('policy')) {
    return 'No tenés permiso para esta foto';
  }
  if (raw.toLowerCase().includes('network')) {
    return 'Sin conexión, intentá de nuevo';
  }
  return 'Hubo un problema con la foto, intentá de nuevo';
}

// crypto.randomUUID si existe; fallback compatible con RN sin crypto global.
function generateUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 manual fallback. Lo evitamos en lo posible (el polyfill de
  // url-polyfill ya provee crypto.getRandomValues en RN).
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
