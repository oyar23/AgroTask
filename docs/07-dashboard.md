# 07 · Dashboard del jefe

El home del jefe ahora es un dashboard real. Reemplaza el placeholder
de Fase 3.

## Lo que muestra

- 4 cards con métricas: pendientes, en curso, hechas hoy, hechas en
  los últimos 7 días.
- Lista de **progreso por empleado**: para cada empleado del campo,
  cuántas tareas tiene asignadas en los últimos 7 días y qué porcentaje
  completó. Empleados sin tareas figuran con 0/0 y barra vacía
  (mejor que esconderlos: el jefe ve quién no tiene asignaciones).
- Lista de **tareas vencidas**: las que tienen `fecha_limite < ahora`
  y no están `hecha` ni `cancelada`. Tap → detalle de la tarea.
- Botones grandes "Ver todas las tareas" y "Nueva tarea".

Todo se refresca con pull-to-refresh y automáticamente al volver a
la pantalla.

## Por qué cálculos en cliente y no en server

El conjunto de datos para un campo del MVP cabe en una sola query
(cientos de tareas). Hacer:

```ts
const tareas = await supabase.from('tareas').select(...).eq('campo_id', ...);
const stats = calcularDashboard(tareas);
```

es más simple que mantener una vista materializada en Postgres y la
diferencia de performance es invisible para el usuario.

Si en algún momento las queries pasan a ser pesadas (5k+ tareas,
varios campos por jefe), se pueden mover los agregados a una vista o
una RPC `dashboard_jefe(p_campo uuid)`. La interface del hook
`useDashboard` queda igual.

## useFocusEffect vs useEffect

```ts
useFocusEffect(
  useCallback(() => {
    void refreshCampo();
    void refreshDashboard();
  }, [refreshCampo, refreshDashboard]),
);
```

`useEffect(..., [])` corre una sola vez al montar. Si el jefe navega
de Dashboard → Lista → Nueva tarea → vuelve, el Dashboard sigue
montado todo el tiempo (la stack de expo-router no lo desmonta), así
que el effect no vuelve a correr.

`useFocusEffect` corre cada vez que la pantalla **toma foco**: al
montar, y cada vez que volvés a ella desde otra. Es lo que queremos
acá: el jefe creó una tarea, vuelve, y el dashboard ya refleja el
cambio.

`useCallback` adentro evita resuscribir el listener cada render.
Sin él, el effect re-engancharía en cada render del Dashboard, lo
que dispararía refresh excesivo.

## Patrón de cards con datos agregados

Todas las cards consumen `data.stats.{campo}`. La forma del objeto
viene tipada del hook (`DashboardData['stats']`), así que TypeScript
nos avisa si una card pide un campo que no existe.

El cálculo en `calcularDashboard()` es un solo recorrido por el array
de tareas (`O(n)`), incrementando contadores. No hay queries N+1, no
hay `.filter` anidados sobre el mismo array.

Para "pendientes" / "en curso" miramos `t.estado`. Para "hechas hoy /
semana" miramos `t.completada_en`, que setea automáticamente el
trigger `set_completada_en` en `schema.sql` cada vez que `estado`
pasa a `'hecha'`. Esto es importante: usamos el momento de
**completación**, no el de creación, para "hoy" / "semana".

## Por qué los empleados sin tareas aparecen igual

`porEmpleado.set(e.id, { total: 0, hechas: 0 })` antes de iterar las
tareas garantiza que cada empleado del campo tiene una entrada,
incluso si no le asignaron nada en los últimos 7 días. La lista
después se ordena por nombre (la query ya viene ordenada).

Decisión de UX: mostrarlos con 0/0 da visibilidad al jefe ("Pedro
no tiene tareas esta semana"), que es el caso más útil. Esconderlos
los volvería invisibles justo cuando hay que pensar en ellos.

## Por qué no usamos una vista de Postgres

Lo evalué: una vista
`vista_dashboard_jefe(jefe_id, pendientes int, en_curso int, ...)`
con joins agregados podría devolver todo en una sola row. Pero:

- El jefe siempre tiene un solo campo en el MVP. No hay agregación
  cross-campo que justifique mover lógica al server.
- "Hechas en los últimos 7 días" requiere comparar con `now()`, que
  en una vista materializada se vuelve "fresca solo cuando refrescás
  la vista". Una vista no-materializada lo recalcula en cada query
  (igual que hacemos en cliente).
- El hook tiene tipos fuertes (`DashboardData`) que TypeScript chequea
  end-to-end. Una vista en Postgres no participa de eso.

Dejo `supabase/views.sql` como archivo no-existente: si en algún
momento aparece una métrica más cara (por ejemplo, "tiempo promedio
desde asignación hasta completado"), ahí sí conviene la vista.

## TODOs / Pendientes

- **Filtros por rango de fechas.** Hoy "últimos 7 días" está hardcoded
  en JS. Un picker "hoy / semana / mes / personalizado" sería el siguiente
  paso.
- **Gráficos.** Una linea de productividad por día sería útil, pero
  agregar `react-native-chart-kit` o similar suma peso al bundle. v2.
- **Notificación al jefe cuando un empleado completa una tarea.** Hoy
  el trigger de Fase 6 solo notifica al INSERT (jefe → empleado).
  Sumar UPDATE notificando al jefe es trivial pero no estaba en spec.
