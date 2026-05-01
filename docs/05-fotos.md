# 05 · Fotos con storage

El empleado saca fotos para documentar tareas (alambrado, animal,
maquinaria) y las sube como evidencia. El jefe las ve. En este MVP
el jefe no sube fotos.

## Componentes

```
lib/storage.ts            → subir, obtener URL firmada, eliminar
hooks/use-fotos.ts        → listar fotos de una tarea
components/foto-uploader.tsx → cámara/galería + preview + subir
components/foto-grid.tsx     → grid 3 columnas + modal full-screen + borrar
```

## Path convention y por qué importa

Las fotos viven en `storage` con la ruta:

```
fotos/{tarea_id}/{foto_id}.jpg
```

- `tarea_id`: el uuid de la tarea (PRIMERA palabra del path).
- `foto_id`: el uuid de la fila de `fotos` que el cliente genera
  ANTES del upload (con `crypto.randomUUID`). Eso garantiza que la
  fila y el archivo apunten al mismo recurso.

¿Por qué importa? Las **policies de storage** necesitan resolver
permisos sin tocar la fila de `fotos` (la fila puede no existir
todavía cuando se está subiendo). En `policies-storage.sql` lo
hacemos extrayendo el primer segmento del path:

```sql
EXISTS (
    SELECT 1 FROM public.tareas t
    WHERE t.id::text = split_part(name, '/', 1)
      AND (t.empleado_id = auth.uid() OR public.es_jefe_del_campo(t.campo_id))
)
```

`name` es la columna de `storage.objects` que guarda el path
completo. Sin esta convención, no podríamos decir "esta foto
pertenece a tal tarea" antes de tener una fila en la tabla.

## Diferencia entre policies de tablas y de storage.objects

Storage no es mágico: por debajo es una tabla de Postgres
(`storage.objects`) con columnas como `bucket_id`, `name`, `owner`.
Le aplicamos RLS igual que a cualquier otra tabla, pero las queries
de policy dependen de:

- **bucket_id**: para que la policy aplique solo a un bucket
  específico (en nuestro caso, `'fotos'`).
- **name**: el path. Lo parseamos con `split_part`.
- **owner**: lo setea automáticamente Supabase Storage al subir
  (`= auth.uid()`). Lo usamos para la policy de DELETE: "solo el
  que la subió o el jefe del campo".

Las policies de tablas (en `policies.sql`) son sobre las filas de
`fotos`/`tareas`/etc. y operan sobre las columnas de la tabla. Las
de storage son sobre los archivos. **Ambas deben dejar pasar para
que la operación pase**: subir requiere INSERT en `storage.objects`
(policy de storage) y INSERT en `fotos` (policy de tabla).

## Por qué signed URLs en lugar de URLs públicas

Un bucket público devuelve URLs estables que cualquiera con el link
puede ver, sin auth. Si el link se filtra (Slack, email, screenshot,
crawler), la foto queda visible para siempre.

Un bucket privado + signed URL:
- La URL se genera con un token con expiración (1 hora en este MVP).
- Después del TTL, deja de funcionar. Si se filtra, el daño es
  acotado.
- Para mostrar la misma foto más tarde, la app pide otra signed URL.
- Si pasa algo grave, podemos rotar el JWT secret o cambiar las
  policies y todas las signed URLs activas dejan de servir.

El costo: cada vez que mostramos una foto, una llamada extra a
`createSignedUrl`. En la práctica supabase-js hace una request rápida
y el cliente cachea la imagen renderizada, así que el overhead es
mínimo. Para galerías grandes, podríamos firmar en batch con
`createSignedUrls(paths, ttl)`.

## Cómo funciona la compresión y por qué

Las cámaras modernas sacan fotos de 4-12 MB. Subir 12 MB por una
red 3G en el campo es:
- lento (10-30 segundos),
- costoso para el plan de datos del trabajador,
- inútil: la pantalla del jefe muestra a 600px máximo.

Por eso, antes de subir comprimimos con `expo-image-manipulator`:

```ts
const manipulated = await manipulateAsync(
  uri,
  [{ resize: { width: 1024 } }],     // lado mayor 1024px
  { compress: 0.7, format: SaveFormat.JPEG },
);
```

Resultado típico: 12 MB → 200 KB. La pérdida de calidad es
imperceptible para el caso de uso ("¿se ve qué animal es?",
"¿se ve si arreglaron el alambrado?"). El número 0.7 es estándar
para fotos de campo: 1.0 (sin compresión) duplica el tamaño sin
mejora visible.

`SaveFormat.JPEG` porque:
- PNG sería más grande (no descarta info de color).
- HEIC daría aún menos peso pero no es soportado universalmente y
  obliga a más fricción al renderear en web.

### Conversión a ArrayBuffer

Después de comprimir, leemos el archivo local con `fetch(uri)` y
sacamos un `ArrayBuffer`:

```ts
const arrayBuffer = await fetch(manipulated.uri).then((r) => r.arrayBuffer());
```

Lo subimos así:

```ts
await supabase.storage.from('fotos').upload(path, arrayBuffer, {
  contentType: 'image/jpeg',
});
```

¿Por qué no `FormData` con `{ uri, name, type } as any`? Funciona,
pero pide un cast (`as any`). El `ArrayBuffer` es uniforme cross-
platform y tipa solo.

## Flujo completo de subida

```
[empleado] toca "Sacar foto" o "Elegir"
   ↓
ImagePicker pide permisos lazy y abre la UI nativa
   ↓
[empleado] confirma una foto
   ↓
preview en pantalla
   ↓
[empleado] toca "Subir foto"
   ↓
manipulateAsync (resize + compress)
   ↓
fetch + arrayBuffer
   ↓
storage.upload (policy de storage valida con RLS)
   ↓
fotos.insert (policy de tabla valida con RLS)
   ↓
si falla el INSERT, storage.remove (limpieza best-effort)
   ↓
onUploaded() → refrescar lista
```

Si en cualquier paso falla, mostramos un mensaje en español. Sin
internet, `fetch` o `upload` tiran error de red y mapeamos a "Sin
conexión, intentá de nuevo" en `mapStorageError`.

## Borrado

`eliminarFoto`:
1. DELETE en la tabla `fotos`. La policy permite al subidor o al
   jefe del campo (ver `policies.sql`).
2. Si el DELETE de tabla pasó, llamamos a `storage.remove`.
3. Si la fila se borra pero el archivo no, no es problema: el
   listado parte de la tabla.

El UI sólo muestra el botón "Eliminar" si `subida_por = auth.uid()`
(verificado en cliente con el id del store). No es chequeo de
seguridad: si alguien forzara la llamada con un id ajeno, la policy
del storage o de la tabla lo rechazarían.

## Decisiones explícitas

(Las dejo acá para que aparezcan en una sola búsqueda.)

- **No hay modo offline para fotos en el MVP.** Sin internet,
  `subirFoto` falla y mostramos "Sin conexión, intentá de nuevo".
  Una cola de uploads pendientes con persistencia local queda para
  v2.
- **No hay reintentos automáticos.** Si la subida falla, el usuario
  toca "Subir foto" de nuevo manualmente.
- **No comprimimos en el lado del Storage** (Supabase no tiene
  thumbnails automáticos). Las miniaturas usan la misma imagen ya
  comprimida; 200 KB en una grilla 3x3 es manejable.
- **`crypto.randomUUID` con fallback manual.** En SDK 54 / React
  Native moderno está disponible globalmente, pero el fallback
  manual cubre cualquier entorno raro (testing en Jest sin polyfill,
  un futuro web sin crypto).

## Permisos a runtime

`expo-image-picker` pide permisos:
- **Cámara**: `requestCameraPermissionsAsync` (necesario para
  `launchCameraAsync`).
- **Galería**: `requestMediaLibraryPermissionsAsync`.

Las pedimos lazy (al tocar el botón). Si el usuario las niega, le
mostramos un mensaje en español. **No** intentamos abrir Settings
del sistema; eso es UX para v2.

En `app.json` no hace falta agregar nada para Android (las pide en
runtime). Para iOS production sí hay que agregar `NSCameraUsageDescription`
y `NSPhotoLibraryUsageDescription` en `infoPlist`, pero eso lo hace
EAS automáticamente cuando el usuario haga el dev build.
