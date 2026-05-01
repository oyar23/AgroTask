# 04 · Vista del empleado

El empleado tiene mucho menos UI que el jefe. Sólo ve sus tareas,
las marca como en curso o hechas, y nada más. Las fotos vienen en
Fase 5.

## Pantallas

```
app/(empleado)/
  index.tsx          → lista de mis tareas con filtros
  tareas/[id].tsx    → detalle: ver datos, cambiar estado
```

Reusamos los hooks (`useTareas`, `useTarea`, `actualizarTarea`),
componentes (`TareaCard`, `Chip`, `Button`), todo lo que hicimos en
Fase 3.

## Cómo RLS hace el filtrado (no filtramos en cliente)

La policy `tareas_select`:

```sql
USING (
    empleado_id = auth.uid()
    OR public.es_jefe_del_campo(campo_id)
)
```

Cuando el caller es el empleado, el branch `es_jefe_del_campo` es
siempre `false`, y el resultado es: solo ve tareas con
`empleado_id = auth.uid()`.

En el código del empleado:

```ts
const { tareas } = useTareas(null, filtros);
```

Pasamos `campoId = null` (no filtramos por campo en cliente). La
base ya filtra. Si en el futuro alguien cambia la policy y permite
ver más, el cliente no necesita cambios — sigue siendo "lo que la
base devuelve".

Esta es la idea central de CLAUDE.md ("La app NO debe tener lógica
de autorización propia"): la app pregunta y muestra; el filtrado
está en la base, no en `if (tarea.empleado_id === miId)`.

## Por qué el UPDATE de estado funciona pero no el resto

El empleado puede actualizar su tarea, pero solo la columna
`estado`. Esto se enforce en dos lugares:

1. **Policy `tareas_update`** (en `policies.sql`): quién puede
   actualizar la fila.

   ```sql
   USING (
       public.es_jefe_del_campo(campo_id)
       OR empleado_id = auth.uid()
   )
   ```

   Para el empleado, pasa por la segunda cláusula.

2. **Trigger `restringir_update_empleado_solo_estado`** (en
   `schema.sql`): qué columnas puede tocar.

   Si el caller no es el jefe del campo y sí es el empleado
   asignado, compara `OLD` vs `NEW` columna por columna y rechaza
   con `RAISE EXCEPTION` si tocó algo distinto a `estado`.

¿Por qué dos lugares en vez de uno? Porque RLS por sí solo no
puede expresar "X usuarios pueden tocar la fila pero solo
estas columnas". RLS opera a nivel fila. La granularidad por columna
(que sí existe en Postgres como GRANT) no compone bien con políticas
que dependen de identidad.

La consecuencia práctica para el cliente: el empleado puede llamar
`actualizarTarea(id, { estado: 'hecha' })` y funciona. Si llamara
`actualizarTarea(id, { titulo: 'algo' })` la base devolvería:

```
El empleado solo puede modificar la columna estado de sus tareas
```

En el cliente lo mapeamos a "Solo el jefe puede modificar este dato"
(ver `mapErrorTarea` en `hooks/use-tareas.ts`).

## Patrón de pantallas read-only

La pantalla `(empleado)/tareas/[id].tsx` es read-only para los
campos editables del jefe (título, descripción, empleado, fecha)
y solo expone botones para cambiar `estado`:

- **pendiente** → botón "Marcar en curso"
- **en_curso** → botón "Marcar como hecha"
- **hecha** → botón "Reabrir tarea" (vuelve a `en_curso`)
- **cancelada** → no se muestra acción (la cancela el jefe)

No exponemos `cancelada` al empleado: cancelar tareas es decisión del
jefe en el contexto del MVP.

Las secciones de "Comentarios" y "Fotos" están con un placeholder
"Próximamente" para no dejar la pantalla vacía. Se completan en
Fase 5.

## Refresh al volver

Igual que en jefe: usamos `useFocusEffect`. Si el empleado entra al
detalle, marca la tarea como hecha y vuelve, la lista refleja el
cambio sin pull-to-refresh manual.

## Pull-to-refresh

`<RefreshControl refreshing={loading} onRefresh={refresh} />`
en la `FlatList`. El `tintColor` matchea con el verde de la app.

## Empty state

Cuando filtra por estado y no tiene nada, mostramos un mensaje
contextualizado: "No hay tareas para mostrar / Cuando tu jefe te
asigne una, va a aparecer acá."

No usamos imagen / ilustración: en el MVP alcanza con texto. La
limpieza visual ayuda en condiciones de sol fuerte donde el contraste
matters más que la decoración.
