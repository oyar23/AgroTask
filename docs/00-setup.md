# 00 — Setup inicial

Guía para entender qué hicimos al armar el proyecto desde cero, pensada para
que alguien que recién arranca con React Native pueda seguir la lógica.

## ¿Qué es Expo?

React Native solo es la librería para hacer apps móviles con JS, pero correr
una app de RN "pelada" implica:

- Configurar Xcode (macOS) y Android Studio.
- Manejar versiones de Java, Gradle, CocoaPods.
- Compilar el binario nativo cada vez que querés probar algo en un celu.
- Pelearte con módulos nativos cuando querés agregar cámara, notificaciones,
  etc.

**Expo** es un toolkit que envuelve todo eso y te resuelve:

1. **Expo Go**: una app que ya tiene compilados los módulos nativos más
   comunes (cámara, ubicación, notificaciones, etc.). Vos solo escribís JS y
   se ejecuta dentro de Expo Go. No compilás nada.
2. **CLI y dev server**: `npm start` levanta un servidor que sirve tu JS y un
   QR. Lo escaneás con Expo Go en el celu y al toque ves la app, con
   hot-reload.
3. **Librerías oficiales** (`expo-camera`, `expo-notifications`, etc.) que
   abstraen las APIs nativas y se actualizan en bloque cuando subís de SDK.
4. **EAS** (Expo Application Services): cuando llega el momento de publicar
   en las stores, te genera el build firmado sin tener que tocar Xcode.

Para el MVP de AgroTasks, **Expo Go alcanza y sobra**. Recién cuando
necesitemos algo que Expo Go no traiga (o publicar en stores) vamos a tener
que hacer un "dev build" nativo.

> **SDK 51**: Expo se versiona por SDK. Cada SDK fija una versión de RN, una
> versión mínima de Node, y un set de librerías compatibles. Estamos en SDK
> 51 porque era la última estable cuando arrancamos. Subir de SDK es una
> operación que se hace explícitamente cada cierto tiempo, no automática.

## ¿Qué es expo-router y por qué file-based routing?

En la mayoría de apps RN se usa `react-navigation`, donde **declarás** las
rutas en código:

```tsx
<Stack.Navigator>
  <Stack.Screen name="Home" component={HomeScreen} />
  <Stack.Screen name="Login" component={LoginScreen} />
</Stack.Navigator>
```

Eso funciona, pero a medida que la app crece se vuelve un solo archivo
gigante con todas las rutas, y los nombres de pantallas viven en strings.

**expo-router** invierte la lógica: la **estructura de carpetas dentro de
`app/` define las rutas**. Cada archivo es una pantalla, y el nombre del
archivo es la URL.

```
app/
  index.tsx              → /  (home)
  login.tsx              → /login
  tareas/
    index.tsx            → /tareas
    [id].tsx             → /tareas/:id
```

Ventajas para alguien que está aprendiendo:

- **Mapa mental directo**: si ves un archivo, sabés qué ruta es. Si querés
  agregar una ruta, creás un archivo.
- **Lazy-loading gratis**: cada pantalla se carga solo cuando se navega a
  ella.
- **Tipado de rutas**: con `experiments.typedRoutes` en `app.json`, TS te
  autocompleta los paths.
- **Es la convención que usa Next.js / Remix** del lado web. Si ya laburás
  con eso, transferís el mismo modelo mental.

### Grupos de rutas con paréntesis

Las carpetas con paréntesis (`(auth)`, `(jefe)`, `(empleado)`) son **grupos
de rutas**: organizan archivos sin afectar la URL. Por ejemplo,
`app/(auth)/login.tsx` es la ruta `/login`, no `/(auth)/login`. Sirven para:

- Agrupar pantallas que comparten layout (un layout específico para auth, otro
  para empleado, otro para jefe).
- Aplicar protecciones por rol sin que la URL dependa del rol.

### `_layout.tsx`

Cada carpeta puede tener un `_layout.tsx` que envuelve sus pantallas. El
`app/_layout.tsx` raíz define el layout que aplica a toda la app.

## El cliente de Supabase y la anon key

Supabase es **Postgres + Auth + Storage + Realtime** detrás de una API HTTP.
La librería `@supabase/supabase-js` te da un cliente para hablar con esa API.

En `lib/supabase.ts` hicimos:

```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

Tres detalles que importan:

1. **`react-native-url-polyfill/auto`**: la lib de Supabase usa la API web
   `URL`, que en RN viene incompleta. El polyfill la completa. Se importa una
   vez al arranque y listo.
2. **`storage: AsyncStorage`**: por defecto, Supabase guarda la sesión en
   `localStorage` (web). En mobile no existe `localStorage`, así que le
   decimos que use `AsyncStorage`. Sin esto, el usuario tendría que loguearse
   cada vez que abre la app.
3. **`detectSessionInUrl: false`**: esto sirve solo en web (por ejemplo, OAuth
   con redirect en URL). En mobile no aplica.

### Qué es la anon key y qué pasa si la exponés mal

Supabase te da dos claves:

- **anon key**: clave pública. Se mete en el cliente (la app del celu, una
  web, etc.). **Por sí sola no da permisos**. Lo único que hace es decir "soy
  un cliente anónimo de este proyecto".
- **service_role key**: clave de superadmin. **Bypassa RLS**. Esta nunca,
  nunca tiene que estar en el celu ni en el repo. Solo en backend privado.

La anon key es "segura para exponer" **solo si tenés Row Level Security (RLS)
prendido en todas las tablas**. Sin RLS, cualquiera con la anon key puede
hacer `SELECT * FROM ...` y bajarse toda la base. Con RLS, las queries se
filtran por las policies que vos definís: "este usuario solo ve sus tareas",
etc.

#### ¿Y si la expongo mal?

- Si me equivoco y subo la **service_role key** al repo o al bundle de la
  app: cualquiera la saca, hace login con privilegios totales y se baja /
  borra / corrompe toda la base. Es game over. Hay que rotarla en el
  dashboard al toque.
- Si subo la **anon key** sin RLS: igual de grave en la práctica. Tienen
  acceso de lectura/escritura a todo lo que las policies permiten… que sin
  policies es todo.
- Si subo la anon key **con RLS bien configurada**: no pasa nada. Está pensada
  para vivir en el cliente.

> Por eso CLAUDE.md dice: *"Supabase RLS para todos los permisos. La app NO
> debe tener lógica de autorización propia, solo confiar en lo que la base
> devuelve."* La seguridad real de AgroTasks vive en las policies de la base,
> no en la app.

### Por qué `EXPO_PUBLIC_*`

Las variables de entorno con prefijo `EXPO_PUBLIC_` son las únicas que Expo
inyecta en el bundle del cliente. Las demás se ignoran en la app (justamente
para evitar que filtres secretos sin querer). El prefijo es un recordatorio
explícito: *"esto va a terminar en el celu del usuario, no pongas nada que no
quieras que vean"*.

## Comandos básicos

```bash
npm install        # instala todas las deps (primera vez)
npm start          # levanta el dev server y muestra el QR
npm run android    # abre en emulador Android
npm run ios        # abre en simulador iOS (solo macOS)
npm run web        # abre la versión web en el browser
```

### Cómo correr en celu (flujo típico)

1. Instalá **Expo Go** en el celu (Play Store / App Store).
2. PC y celu en la misma WiFi.
3. `npm start` en la terminal.
4. Escaneá el QR con la cámara (iOS) o desde la app Expo Go (Android).
5. La app aparece en el celu. Cada vez que guardes un archivo en la PC, se
   recarga automáticamente.

Si la WiFi de tu casa bloquea el descubrimiento entre dispositivos, en el dev
server podés apretar `s` para cambiar de modo "LAN" a "Tunnel" (más lento
pero funciona en cualquier red).

## Estructura del proyecto

```
app/             pantallas (file-based routing de expo-router)
  (auth)/        login, register
  (jefe)/        pantallas del rol jefe
  (empleado)/    pantallas del rol empleado
  _layout.tsx    layout raíz (Stack)
  index.tsx      pantalla home (placeholder por ahora)
components/      componentes reutilizables
lib/             clientes (supabase.ts) y stores
hooks/           hooks custom
types/           tipos TypeScript compartidos
docs/            documentación
supabase/        SQL del backend (schema, policies)
```

## Decisiones del setup

- **Alias `@/`**: configurado en `tsconfig.json` (para que TS resuelva tipos)
  y en `babel.config.js` con `babel-plugin-module-resolver` (para que en
  runtime se resuelva igual). Permite hacer `import { supabase } from
  '@/lib/supabase'` desde cualquier archivo sin contar `../../`.
- **`.env.example` en el repo, `.env` ignorado**: el ejemplo es la doc de qué
  variables necesita el proyecto. Los valores reales viven solo en local.
