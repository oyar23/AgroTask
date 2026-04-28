# AgroTasks - Contexto del Proyecto

## Qué es
App mobile para que jefes de campo asignen tareas a empleados 
agrarios y vean su progreso. Empleados reciben notificaciones, 
marcan tareas como hechas y suben fotos como evidencia.

## Stack
- Expo SDK 51 + React Native + TypeScript
- expo-router (file-based routing)
- Supabase: auth, postgres, storage, realtime
- Zustand para estado global
- expo-notifications, expo-image-picker, expo-camera
- AsyncStorage para persistencia local

## Estructura de carpetas
/app          → pantallas (expo-router)
  /(auth)     → login, register
  /(jefe)     → pantallas del rol jefe
  /(empleado) → pantallas del rol empleado
/components   → componentes reutilizables
/lib          → clientes (supabase.ts, auth store, etc)
/hooks        → hooks custom
/types        → tipos TypeScript compartidos
/docs         → documentación de aprendizaje
/supabase     → SQL (schema, policies, migrations)

## Modelo de datos
[acá pegás tu schema una vez que lo tengas, en SQL o como diagrama]

## Convenciones
- Todo el texto de UI en español rioplatense.
- Botones grandes (mínimo 56px de alto), alta legibilidad. 
  La app se usa con sol fuerte y manos sucias.
- Nombres de archivos en kebab-case, componentes en PascalCase.
- No usar `any` en TypeScript salvo último recurso justificado.
- Imports absolutos con alias @/ apuntando a la raíz.

## Decisiones tomadas
- Zustand en lugar de Redux: menos boilerplate, suficiente para 
  el scope del MVP.
- expo-router en vez de react-navigation: viene integrado, file-based, 
  más simple para empezar.
- Supabase RLS para todos los permisos. La app NO debe tener 
  lógica de autorización propia, solo confiar en lo que la base devuelve.
- Fotos comprimidas a 1024px máximo antes de subir, para ahorrar 
  storage y datos móviles.

## Cómo trabajamos
- Una feature por sesión. Al iniciar, leé este archivo, 
  DECISIONS.md y los archivos relevantes a la feature.
- Antes de codear, proponé un plan paso a paso y esperá aprobación.
- Después de cada feature, documentar en /docs/NN-feature.md 
  con explicaciones para alguien que está aprendiendo.
- Comentarios solo en partes no obvias del código.
- Commits descriptivos al terminar cada feature.

## Cosas que el usuario maneja a mano (no tocar sin pedir)
- /supabase/schema.sql (el modelo de datos lo hace el usuario)
- /supabase/policies.sql (las RLS las hace el usuario)
- Configuración de despliegue (EAS, certificados)