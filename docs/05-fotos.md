# 05 · Fotos con storage

El empleado saca fotos para documentar tareas (alambrado, animal,
maquinaria) y las sube como evidencia. El jefe las ve. En este MVP
el jefe no sube fotos.

## Setup de policies de storage en el dashboard

> ⚠️ **No se ejecuta `supabase/policies-storage.sql` en el SQL Editor.**
>
> En proyectos Supabase Cloud, `storage.objects` es propiedad de
> `supabase_storage_admin`, no de `postgres`. Si intentás
> `CREATE POLICY` directo, te tira:
>
>     ERROR: 42501: must be owner of table objects
>
> Las policies de storage se crean desde el dashboard. Los pasos
> abajo son la traducción 1-a-1 del archivo `.sql`.

### Paso 1 · Crear el bucket

1. Storage → **New bucket**.
2. Name: `fotos`.
3. **NO** marcar "Public bucket".
4. File size limit: dejar el default (50 MB alcanza).
5. Allowed MIME types: dejar vacío (cualquier tipo) o limitar a
   `image/jpeg`. Al MVP no le cambia nada.
6. Save.

### Paso 2 · Verificar que RLS está activo

En el SQL Editor:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'objects'
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'storage');
```

`relrowsecurity = true`. Supabase lo deja así por default; si lo ves
en `false`, contactá soporte (no es algo que vamos a tocar nosotros).

### Paso 3 · Crear las tres policies

Storage → seleccionar bucket **`fotos`** → tab **Policies** →
**New policy** → "For full customization".

Cada policy se crea por separado. Pegá el nombre exacto, la
operación, los roles y la expresión que va abajo.

#### Policy 1 · `fotos_storage_insert`

Permite subir si el caller es el dueño del archivo y el primer
segmento del path es el id de una tarea visible para él.

| Campo | Valor |
|---|---|
| **Policy name** | `fotos_storage_insert` |
| **Allowed operation** | `INSERT` |
| **Target roles** | `authenticated` |

**Policy definition (WITH CHECK):**

```sql
bucket_id = 'fotos'
AND owner = auth.uid()
AND EXISTS (
    SELECT 1 FROM public.tareas t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (
          t.empleado_id = auth.uid()
          OR public.es_jefe_del_campo(t.campo_id)
      )
)
```

#### Policy 2 · `fotos_storage_select`

Permite leer si el path apunta a una tarea visible para el caller
(empleado asignado o jefe del campo). Necesario para resolver signed
URLs y para listados internos del SDK de Storage.

| Campo | Valor |
|---|---|
| **Policy name** | `fotos_storage_select` |
| **Allowed operation** | `SELECT` |
| **Target roles** | `authenticated` |

**Policy definition (USING):**

```sql
bucket_id = 'fotos'
AND EXISTS (
    SELECT 1 FROM public.tareas t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (
          t.empleado_id = auth.uid()
          OR public.es_jefe_del_campo(t.campo_id)
      )
)
```

#### Policy 3 · `fotos_storage_delete`

Permite borrar si el caller subió el archivo (`owner = auth.uid()`)
o es el jefe del campo de la tarea.

| Campo | Valor |
|---|---|
| **Policy name** | `fotos_storage_delete` |
| **Allowed operation** | `DELETE` |
| **Target roles** | `authenticated` |

**Policy definition (USING):**

```sql
bucket_id = 'fotos'
AND (
    owner = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.tareas t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND public.es_jefe_del_campo(t.campo_id)
    )
)
```

#### UPDATE · sin policy

No creamos policy de UPDATE. Sin policy permisiva, queda bloqueado.
En el MVP no hay caso de uso para "modificar" un archivo; si hay que
cambiar la foto, borrás y subís otra.

### Por qué `storage.foldername(name)` y no `split_part`

Las dos sirven. `(storage.foldername(name))[1]` es la helper que
provee Supabase específicamente para parsear paths en el contexto
de storage:

- `storage.foldername('abc/def.jpg')` devuelve `{abc}` (text array
  con los directorios; no incluye el filename).
- `(storage.foldername(name))[1]` extrae el primero, que en nuestra
  convención es el `tarea_id`.

Es equivalente a `split_part(name, '/', 1)` pero más legible y, si
algún día Supabase agrega validación o caching sobre `foldername`,
heredamos automático.

### Por qué las helper de `public.*` funcionan acá

`public.es_jefe_del_campo(...)` está definida como `SECURITY DEFINER`
con `SET search_path = public` en `policies.sql`. Eso significa:

- Cualquier usuario autenticado puede llamarla (`GRANT EXECUTE` lo
  da Supabase por default sobre funciones del schema `public`).
- Internamente corre con permisos del owner, así que la subquery
  contra `campos` no dispara la policy `campos_select` y no hay
  recursión.

Lo único que cambia respecto a su uso en `policies.sql` es que
desde una policy de storage hay que prefijar con `public.` (porque
el contexto de la policy no tiene `public` en el `search_path`).

### Cómo verificar que quedaron bien

Storage → bucket `fotos` → tab Policies. Tenés que ver tres filas:

```
fotos_storage_insert    INSERT    authenticated
fotos_storage_select    SELECT    authenticated
fotos_storage_delete    DELETE    authenticated
```

Probar end-to-end (recomendado, más confiable que el SQL):

1. Logueado como empleado, ir al detalle de una tarea suya y subir
   una foto. Debe aparecer en la grilla.
2. Como ese mismo empleado, intentar abrir la foto que subió → tap
   en miniatura → modal full screen.
3. Como jefe del campo, abrir la misma tarea → debe ver la foto.
4. Como **otro** empleado de **otro** campo (si tenés cómo armar el
   caso): la query a `fotos` no devuelve nada para esa tarea, así
   que el grid sale vacío.

Si la subida falla con "No tenés permiso para esta foto", lo más
probable es que falte la policy de INSERT o que `bucket_id` no
matche el nombre exacto del bucket.

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
