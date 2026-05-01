# 06 · Push notifications (preparado, requiere dev build)

Esta fase queda **preparada pero no activada**. La razón es técnica:
desde Expo SDK 53, las notificaciones push no funcionan en **Expo
Go**. Hace falta un **development build** (binario propio firmado con
las credenciales del proyecto).

Mientras no haya dev build, el código está en el repo pero las
llamadas activas están comentadas con `TODO Fase 6 (push)`.

## Qué hay listo

```
supabase/schema-push.sql                       → tabla + RLS + trigger
supabase/edge-functions/notify-tarea/index.ts  → Edge Function que envía push
lib/push.ts                                    → cliente: registrar token + tap handler
lib/auth-store.ts                              → tiene TODOs marcados donde wirear push
```

## Qué hay que hacer (manual, una sola vez)

### 1 · Crear el dev build

Los push requieren credenciales nativas (FCM en Android, APNs en
iOS). El dev build las trae embebidas. Pasos generales:

```bash
npm install --global eas-cli
eas login
eas build:configure                  # primera vez en este repo
eas build --profile development --platform android
# (o --platform ios; necesita Apple Developer)
```

Lo que hace EAS:
- Genera credenciales FCM (Android Firebase project) automáticamente
  o usa las que vos configures.
- Compila un APK/IPA con `expo-dev-client` adentro, que es como
  Expo Go pero para tu proyecto.
- Te devuelve un link para descargar el binario.

Instalalo en el dispositivo y ya podés correr `npx expo start --dev-client`
en lugar de `npx expo start`.

### 2 · Ejecutar el SQL

Después de aplicar `policies.sql` y `policies-storage.sql`, ejecutar
en el SQL Editor de Supabase:

```sql
\i supabase/schema-push.sql
```

(O copiar y pegar.)

Esto:
- Crea la tabla `push_tokens` con RLS.
- Habilita la extensión `pg_net` (necesaria para hacer HTTP desde
  Postgres).
- Crea el trigger `trg_tareas_notificar_nueva` AFTER INSERT en
  `tareas`.

Después, configurar las dos variables de DB que usa el trigger:

```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://TU-PROYECTO.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = 'eyJ...el-service-role-key';
```

(El service role key sale del dashboard → Project Settings → API.)

> ⚠️ El service role key salta toda RLS. Mantenelo en variables de la
> base, no lo pongas en `app.json` ni en logs.

### 3 · Desplegar la Edge Function

```bash
npm install -g supabase
supabase login
supabase link --project-ref TU-PROYECTO-REF
supabase functions deploy notify-tarea --no-verify-jwt
```

`--no-verify-jwt` porque el trigger pasa el service role key como
Authorization header. La función no usa JWT de usuario.

La Edge Function lee `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
del runtime (Supabase los inyecta automáticamente).

### 4 · Activar el wiring en el cliente

En `lib/auth-store.ts`, descomentar las dos líneas marcadas con
`TODO Fase 6 (push)`:

```ts
import { registrarParaPush } from '@/lib/push';

// dentro de signIn, después de set({ session, profile }):
void registrarParaPush(profile.id);

// idem dentro de signUp.
```

Y en `app/_layout.tsx` (o donde corresponda), suscribirse al tap:

```ts
useEffect(() => {
  const sub = suscribirseTapNotificacion((data) => {
    if (data.tarea_id) router.push(`/(empleado)/tareas/${data.tarea_id}`);
  });
  return () => sub.remove();
}, []);
```

### 5 · Configurar `extra.eas.projectId` en app.json

EAS necesita un `projectId` para que `getExpoPushTokenAsync` sepa
para qué proyecto pedir el token. `eas build:configure` lo agrega
automáticamente; si no, agregalo a mano:

```json
"extra": {
  "eas": {
    "projectId": "tu-uuid-de-eas"
  }
}
```

## Cómo testear el envío manual

Una vez que tenés un dev build instalado y un token registrado:

```bash
# Conseguir el token desde la base:
SELECT token FROM push_tokens WHERE user_id = 'EMPLEADO_UUID';

# Mandar push de prueba directo a Expo:
curl -H "Content-Type: application/json" \
     -X POST "https://exp.host/--/api/v2/push/send" \
     -d '{
       "to": "ExponentPushToken[xxxxx]",
       "title": "Test",
       "body": "Hola desde curl",
       "data": { "tarea_id": "alguno" }
     }'
```

Si llega, el lazo `cliente → Expo` funciona. Después podés probar el
trigger creando una tarea y verificando que llega push:

```sql
INSERT INTO tareas (titulo, campo_id, empleado_id, creada_por)
VALUES ('Test push', 'CAMPO_UUID', 'EMPLEADO_UUID', 'JEFE_UUID');
```

Si no llega, revisar (en orden):

1. **Logs de la Edge Function**: `supabase functions logs notify-tarea`.
2. **Logs de pg_net**: `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;`
3. **Variables de DB**: `SELECT current_setting('app.supabase_url', true);`
4. **Receipt de Expo**: la API de Expo Push tiene endpoint para ver
   si la entrega final fue exitosa o falló (token invalidado, etc.).

## Por qué este diseño y no otro

### ¿Por qué pg_net + Edge Function en vez de pg_net solo?

Podríamos hacer la HTTP request a Expo Push directamente desde el
trigger con `pg_net`, sin Edge Function. Pero:
- La Edge Function levanta los tokens del empleado, formatea el
  payload, maneja errores parciales (si un token está invalidado,
  Expo Push devuelve un receipt para limpieza).
- En Postgres puro, la lógica termina siendo más fea.
- La Edge Function se puede testear, evolucionar, y debuggear con
  `console.log`. Un trigger PL/pgSQL es más opaco.

### ¿Por qué Expo Push y no FCM/APNs directos?

- Expo Push es una capa que abstrae las dos. Mandás el `ExponentPushToken[...]`
  que el cliente te dio, y Expo se encarga de FCM o APNs según la
  plataforma.
- Para producción a escala (millones de pushes) podría tener sentido
  ir directo a FCM/APNs, pero requiere configurar credenciales en
  ambos providers y mantener servidores propios. Para el MVP es
  overkill.

### ¿Por qué NO un Realtime channel en lugar de push?

Realtime sirve para "estoy con la app abierta y quiero ver cambios
en vivo". Push sirve para "tengo la app cerrada y quiero enterarme".
El use case del empleado es el segundo: está trabajando, la app
está cerrada, llega tarea nueva → notificación.

A futuro podríamos sumar Realtime para refrescar listas en vivo
cuando la app está abierta. No reemplaza el push.

## TODOs / Pendientes

- **Borrar tokens al cerrar sesión.** `lib/push.ts` tiene
  `eliminarTokenLocal` listo, pero `signOut` del store no lo llama
  porque no tenemos forma de recordar el último token que se
  registró. Alternativas: guardarlo en AsyncStorage, o pedirlo de
  nuevo con `getExpoPushTokenAsync` antes del DELETE.
- **Limpieza de tokens inválidos.** Cuando Expo Push devuelve
  `DeviceNotRegistered`, deberíamos borrar el token de la base. La
  Edge Function actual no procesa los receipts; va por el path feliz.
- **Notificar también al cambiar estado o al asignar.** Hoy solo
  notificamos al INSERT. UPDATE de estado podría notificar al jefe
  ("Pedro marcó como hecha la tarea X"); v2.
