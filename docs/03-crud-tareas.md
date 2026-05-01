# 03 · CRUD de tareas (jefe)

Esta fase agrega lo mínimo para que un jefe pueda crear, listar, ver,
editar y eliminar tareas. Es el corazón del MVP: todo lo demás (vista
del empleado, fotos, dashboard) se monta encima.

## Pantallas y archivos

```
app/(jefe)/
  index.tsx           → home: "crear campo" (si no tiene) o accesos
  tareas/
    index.tsx         → lista con filtros y FAB "+"
    nueva.tsx         → form de creación
    [id].tsx          → detalle, edición y eliminación

hooks/
  use-mi-campo.ts     → trae el campo del usuario actual
  use-empleados.ts    → trae empleados del campo
  use-tareas.ts       → lista, detalle, crear, actualizar, eliminar

components/
  chip.tsx            → filtro tipo "pill"
  dropdown.tsx        → wrapper de @react-native-picker/picker
  date-picker-field.tsx → wrapper cross-platform de DateTimePicker
  tarea-card.tsx      → ítem de lista, compartido jefe/empleado

types/
  tareas.ts           → schemas Zod del form de tarea y de campo
```

## El "primer arranque" del jefe

Cuando un jefe se registra, su `profile.campo_id` queda en `NULL`
(ver `docs/02-auth.md`). Antes de poder crear tareas necesita un
**campo**, así que la primera vez que entra a `(jefe)/index` la
pantalla detecta `useMiCampo() = null` y muestra un formulario para
crear el campo.

El campo se identifica con dos cosas:
- `nombre`: texto libre, lo elige el jefe.
- `codigo`: 4-12 caracteres alfanuméricos, único en toda la base.
  Es el que el jefe le pasa a sus empleados al registrarse, y la RPC
  `buscar_campo_por_codigo` lo usa para resolver `campo_id` durante el
  signup del empleado (ver `docs/02-auth.md`).

Si el INSERT falla por código duplicado, mostramos un mensaje claro y
no avanzamos.

## Cómo se cargan las tareas (RLS hace el filtrado)

```ts
const { tareas } = useTareas(campo.id, filtros);
```

Por dentro:

```ts
supabase
  .from('tareas')
  .select('..., empleado:profiles!tareas_empleado_id_fkey(nombre)')
  .eq('campo_id', campo.id)        // sólo este campo
  .eq('estado', filtros.estado)    // si hay filtro
  .eq('empleado_id', empleadoId)   // si hay filtro
```

Lo importante: **no filtramos por "tareas de mi campo" en el cliente
con un OR explícito**. La policy `tareas_select` ya hace eso:

```sql
USING (
    empleado_id = auth.uid()                      -- empleado: las suyas
    OR public.es_jefe_del_campo(campo_id)         -- jefe: las del campo
)
```

El `.eq('campo_id', campo.id)` que sí ponemos es un filtro UX (a
futuro un jefe puede tener varios campos, hoy es no-op). La seguridad
viene de la base, no del cliente.

## Cómo se respeta "el empleado pertenece al campo"

Esa invariante NO es algo que el cliente valida con un UI check.
Vive en el trigger `validar_empleado_pertenece_al_campo` en
`schema.sql`. Si el cliente intenta crear una tarea con un
`empleado_id` cuyo `profile.campo_id` no coincide con el `campo_id`
de la tarea, Postgres tira:

```
El empleado X no pertenece al campo Y
```

En `hooks/use-tareas.ts` mapeamos esa excepción a un mensaje en
español (`mapErrorTarea`). En la práctica, como los empleados que
listamos vienen filtrados por `campo_id`, este error no debería
aparecer salvo race condition (el empleado se desasoció justo
entremedio).

## Patrón de hooks

Los hooks (`use-tareas`, `use-empleados`, `use-mi-campo`) siguen el
mismo patrón:

- Estado interno: `data`, `loading`, `error`.
- `cargar()` con `useCallback` para evitar re-suscripciones en cada
  render.
- `useEffect(() => void cargar(), [cargar])` para disparar al montar.
- `refresh` expuesto al componente para pull-to-refresh y para
  recargar después de mutaciones.

No usamos React Query / SWR para mantener el bundle chico. La
alternativa simple alcanza para el MVP.

Las **mutaciones** (`crearTarea`, `actualizarTarea`, `eliminarTarea`)
son funciones puras que devuelven `{ ok: true, ... }` o
`{ ok: false, error: string }`. La pantalla decide cómo reaccionar
(navegar, mostrar error, etc.) y llama a `refresh()` del hook si
quiere ver los cambios reflejados en la lista.

## Refresh al volver de otra pantalla

Cuando el jefe crea, edita o elimina una tarea, queremos que la lista
se actualice al volver. Usamos `useFocusEffect` de expo-router:

```ts
useFocusEffect(
  useCallback(() => {
    void refresh();
  }, [refresh]),
);
```

`useFocusEffect` corre cada vez que la pantalla recibe foco
(incluyendo cuando volvés de un push). `useEffect` solo correría al
montar, y la pantalla se mantiene montada por debajo cuando navegás
adelante.

## Validación con Zod

`types/tareas.ts` define dos schemas:

```ts
tareaFormSchema = z.object({
  titulo: z.string().trim().min(3).max(120),
  descripcion: z.string().trim().max(2000),
  empleadoId: z.string().min(1),
  fechaLimite: z.date().nullable(),
});

campoFormSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]+$/).min(4).max(12),
});
```

En las pantallas:

```ts
const parsed = tareaFormSchema.safeParse({...});
if (!parsed.success) {
  // mapear issue.path[0] → setErrors({ campo: issue.message })
  return;
}
// usar parsed.data (ya está limpio: trim, etc.)
```

El patrón es: `safeParse` → si falla, recorremos `issues` y
distribuimos los mensajes a cada input. Si pasa, usamos `parsed.data`
(que ya tiene `.trim()` aplicado donde corresponde).

CLAUDE.md dice "Zod solo en formularios, validaciones internas chicas
con funciones simples". Esto encaja: el formulario es la frontera de
entrada al sistema y queremos un schema fuerte; cuando un hook recibe
un `string` ya validado, no lo re-validamos.

## Componentes nuevos

### Chip
Filtro tipo "pill" con dos estados (selected / unselected). Se usa en
la barra de filtros de la lista. La altura mínima 40 lo hace
suficientemente táctil para manos sucias sin ocupar tanto como un
botón.

### Dropdown
Wrapper sobre `@react-native-picker/picker`. Picker usa `string` para
el valor; encapsulamos para que el caller use `T | null` con `T extends
string`. El sentinel interno es `''` para "sin selección".

### DatePickerField
Wrapper sobre `@react-native-community/datetimepicker`. La librería
nativa se comporta distinto en cada plataforma:
- **Android**: el picker es un dialog modal. Se abre seteando
  `show=true`; al cerrar, dispara `onChange` con `event.type='set'`
  o `'dismissed'`.
- **iOS**: el picker es inline (modo spinner en este wrapper). Se
  muestra hasta que el usuario toca "Listo".
- **Web**: usa `<input type="date">`, también funciona.

### TareaCard
Ítem reutilizable. Tiene un prop `mostrarEmpleado` para esconder el
nombre cuando es la vista del empleado (todas las tareas son suyas).
Marca como "vencida" cuando `fecha_limite < ahora` y la tarea no está
ni `hecha` ni `cancelada`.

## Cosas que NO incluí (a propósito)

- **Bulk operations** (eliminar varias, asignar varias). No están en
  el spec del MVP.
- **Búsqueda full-text** sobre `titulo`/`descripcion`. Los filtros
  por estado y empleado alcanzan; búsqueda se puede agregar después
  con un `.ilike`.
- **Comentarios** en el detalle. La sección está reservada para Fase 5.
- **Realtime updates**: el jefe ve cambios al hacer pull-to-refresh
  o al volver. Suscribirse al canal de Supabase Realtime es trivial
  pero agrega complejidad; lo dejamos para v2.
