# 01 · Schema y RLS

Esta es la primera feature. Antes de escribir UI o lógica de app
montamos la base: estructura de datos en Postgres + Row Level Security.

## Diagrama del modelo (DBML)

Pegá esto en https://dbdiagram.io para verlo gráficamente.

```dbml
Table profiles {
  id uuid [pk, ref: > auth_users.id]
  nombre text [not null]
  rol text [not null, note: "'jefe' | 'empleado'"]
  campo_id uuid [ref: > campos.id, null]
  created_at timestamptz
  updated_at timestamptz
}

Table campos {
  id uuid [pk]
  nombre text [not null]
  codigo text [unique, not null, note: "código corto, ej. ABC123"]
  jefe_id uuid [not null, ref: > profiles.id]
  created_at timestamptz
}

Table tareas {
  id uuid [pk]
  titulo text [not null]
  descripcion text
  campo_id uuid [not null, ref: > campos.id]
  empleado_id uuid [not null, ref: > profiles.id]
  creada_por uuid [not null, ref: > profiles.id]
  estado text [not null, note: "'pendiente' | 'en_curso' | 'hecha' | 'cancelada'"]
  fecha_limite timestamptz
  completada_en timestamptz
  created_at timestamptz
  updated_at timestamptz

  Indexes {
    (empleado_id, estado)
    (campo_id, estado)
  }
}

Table fotos {
  id uuid [pk]
  tarea_id uuid [not null, ref: > tareas.id]
  subida_por uuid [not null, ref: > profiles.id]
  storage_path text [not null]
  created_at timestamptz
}

Table comentarios {
  id uuid [pk]
  tarea_id uuid [not null, ref: > tareas.id]
  autor_id uuid [not null, ref: > profiles.id]
  mensaje text [not null]
  created_at timestamptz
}

Table auth_users {
  id uuid [pk, note: "tabla nativa de Supabase auth"]
}
```

## Las tablas, una por una

### `profiles`
Es la "ficha" de cada persona dentro de la app. `auth.users` (de Supabase)
solo guarda email y contraseña; todo lo de negocio (nombre, rol, campo
al que pertenece) vive acá.

- `id` = mismo UUID que `auth.users(id)`. Si se borra el user en auth,
  cascadea y se borra el profile.
- `rol` con CHECK constraint: solo dos valores válidos. Si mañana hay
  un tercer rol, hay que migrar el constraint, lo cual es a propósito
  (te obliga a pensarlo).
- `campo_id` es nullable porque un jefe recién registrado puede no haber
  creado su campo todavía, y un empleado en transición puede quedar sin
  campo si el suyo se borra.

### `campos`
Cada campo es una unidad de negocio aislada. Empleados y jefes existen
"dentro de" un campo.

- `codigo` UNIQUE: si dos jefes intentan usar `ABC123`, gana el primero.
  Es la llave que el empleado tipea al registrarse.
- `jefe_id` con `ON DELETE RESTRICT`: si alguien intenta borrar un
  profile que es jefe de un campo, Postgres lo rechaza. No queremos
  campos huérfanos.

### `tareas`
El corazón de la app. Cada tarea pertenece a UN campo y se asigna a
UN empleado.

- `estado` con cuatro valores (`pendiente`, `en_curso`, `hecha`,
  `cancelada`). El default es `pendiente` para que el INSERT mínimo
  no tenga que setearlo.
- `completada_en` lo maneja un trigger automático: cuando `estado`
  pasa a `hecha`, se setea con `now()`. Si vuelve atrás, se limpia.
  Así no dependemos del cliente para timestamps importantes.
- `creada_por` se separa de `empleado_id` para auditoría: querés saber
  qué jefe creó qué tarea, aunque después ese jefe deje el equipo.

### `fotos`
Una tarea puede tener N fotos como evidencia. `storage_path` apunta al
archivo en Supabase Storage; las fotos en sí no viven en la DB.

### `comentarios`
Un mini-chat por tarea. `mensaje` con `CHECK (length(mensaje) > 0)`
para evitar comentarios vacíos.

## ¿Qué es RLS y por qué confiamos en ella?

**Row Level Security** es un mecanismo de Postgres que evalúa, en cada
query, si la fila X puede ser leída/modificada por el usuario actual.
La regla de filtrado vive en la base, no en la app.

Es como tener un guardia de seguridad pegado a cada tabla que revisa
DNI antes de dejarte ver cada fila.

### Por qué dejamos toda la autorización a la base

1. **No podés olvidarte de chequear.** Si la lógica vive en la app,
   un día metés un endpoint nuevo y te olvidás del check. Con RLS,
   el chequeo viaja con los datos.
2. **No importa cómo entres.** Cliente móvil, edge function, script,
   Supabase Studio: todos pasan por las mismas policies.
3. **El cliente puede ser atacante.** Si el JWT del empleado intenta
   `SELECT * FROM tareas`, la base le devuelve solo SUS tareas, sin
   importar qué WHERE haya escrito el cliente.
4. **Menos código en la app.** Las queries quedan crudas (`SELECT *
   FROM tareas`), no necesitan filtros de seguridad superpuestos.

CLAUDE.md ya lo dice: "La app NO debe tener lógica de autorización
propia". Esto es eso, traducido a SQL.

## Las 3 policies más complicadas, línea por línea

### 1. `profiles_select` y por qué necesita `SECURITY DEFINER`

> Esta policy se expandió de 2 cláusulas a 3 después de un bug
> detectado durante el testeo de Fase 1 (ver "Caso de estudio:
> jefe ciego" más abajo).

```sql
CREATE POLICY profiles_select ON profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR (
            campo_id IS NOT NULL
            AND campo_id = public.current_user_campo_id()
        )
        OR campo_id IN (
            SELECT id FROM campos WHERE jefe_id = auth.uid()
        )
    );
```

- `FOR SELECT TO authenticated`: aplica solo a queries `SELECT`,
  ejecutadas por usuarios logueados (rol nativo `authenticated` de
  Supabase). Anónimos no entran.
- `USING (...)`: condición que cada fila debe cumplir para ser
  visible al usuario actual.
- `id = auth.uid()`: siempre podés ver tu propio profile. Necesario
  en el primer login del empleado, antes de que sepa su `campo_id`.
- `campo_id IS NOT NULL AND campo_id = public.current_user_campo_id()`:
  ramita "mismo campo". La función helper devuelve el `campo_id` del
  usuario actual. Cubre empleado→jefe y empleado→empleado.
- `campo_id IN (SELECT id FROM campos WHERE jefe_id = auth.uid())`:
  ramita "soy jefe de este campo". Necesaria porque un jefe puede
  tener `profile.campo_id = NULL` (sobre todo apenas creó el campo
  y aún no se autoasignó a sí mismo como miembro), y en ese caso
  la cláusula anterior nunca matchearía. Esta cláusula matchea
  por la relación de **autoridad** (`campos.jefe_id`) y no por la
  de **pertenencia** (`profiles.campo_id`), que son dos cosas
  distintas en el modelo.

**El truco está en la función.** Si pusiéramos `campo_id = (SELECT
campo_id FROM profiles WHERE id = auth.uid())`, ese SELECT interno
volvería a disparar `profiles_select`, que volvería a ejecutar el
SELECT interno... recursión infinita. Postgres lo detectaría y
fallaría con `infinite recursion detected in policy`.

`current_user_campo_id()` está marcada `SECURITY DEFINER`, lo que
significa que se ejecuta con los permisos del owner que la creó
(que vos), no con los del caller. **Esos permisos saltean RLS**,
así que la lectura interna de `profiles` no dispara la policy.
La función rompe el ciclo.

Por eso también marcamos `SET search_path = public`: una función
SECURITY DEFINER mal escrita es un vector de ataque clásico (un
atacante podría crear una tabla `profiles` en otro schema y
manipular el `search_path` para que la función la lea). Fijar el
search_path lo cierra.

### 2. `tareas_select` y la composición de visibilidad

```sql
CREATE POLICY tareas_select ON tareas
    FOR SELECT TO authenticated
    USING (
        empleado_id = auth.uid()
        OR public.es_jefe_del_campo(campo_id)
    );
```

- `empleado_id = auth.uid()`: ramita del empleado. Ve sus tareas
  asignadas, y solo esas.
- `public.es_jefe_del_campo(campo_id)`: ramita del jefe. La función
  pregunta a `campos`: "¿el jefe_id de este campo es el usuario
  actual?". Si sí, deja pasar la fila.

Las dos ramitas combinadas con `OR` cubren todos los escenarios.
**No hay lógica para "ver tareas de mis compañeros del mismo
campo"** porque el usuario no la pidió. Si más adelante querés
agregarla, sumás un tercer OR. Hoy: deliberadamente restrictivo.

Una sutileza: cuando un empleado se cambia de campo, sus tareas
**viejas** siguen siendo visibles para él (porque la regla matchea
por `empleado_id`, sin filtrar por campo). Eso es lo que el usuario
pidió y sirve para auditoría histórica.

### 3. `tareas_update` + trigger `restringir_update_empleado_solo_estado`

Esta es la más sutil porque combina dos mecanismos: la **policy**
decide *quién* puede tocar la fila; el **trigger** decide *qué*
columnas puede tocar.

Policy:
```sql
CREATE POLICY tareas_update ON tareas
    FOR UPDATE TO authenticated
    USING (
        public.es_jefe_del_campo(campo_id)
        OR empleado_id = auth.uid()
    )
    WITH CHECK (
        public.es_jefe_del_campo(campo_id)
        OR empleado_id = auth.uid()
    );
```

- `USING`: filtra qué filas puede *ver para actualizar* (en UPDATE,
  Postgres primero ubica la fila, y si `USING` no matchea, ni
  siquiera la considera).
- `WITH CHECK`: validación post-UPDATE. La fila modificada también
  debe matchear la condición. Útil para evitar que el jefe se
  reasigne una tarea a un campo donde NO es jefe (saliendo de su
  propio scope).
- Las dos cláusulas son idénticas acá; eso es a propósito y se
  llama "policy simétrica".

Trigger (resumido, ver `schema.sql` para el cuerpo entero):
```sql
IF auth.uid() = jefe_del_campo THEN return libre;
IF auth.uid() = empleado AND cambió cualquier columna != 'estado' THEN
    RAISE EXCEPTION 'El empleado solo puede modificar la columna estado';
```

**Por qué no se hace todo en RLS:** Postgres permite limitar
columnas en INSERT/SELECT con `GRANT`, pero no es ergonómico para
UPDATE condicional ("estos pueden tocar todo, esos solo una columna").
La forma idiomática es trigger.

**Por qué no se hace todo en trigger:** los triggers no filtran
visibilidad ni decisión de "puede o no puede". RLS hace eso mejor
y se integra con el plan de ejecución.

División de responsabilidades:
- **Policies (RLS):** quién, sobre qué fila.
- **Triggers:** invariantes de datos, qué columnas, valores
  derivados (como `completada_en`).

## Caso de estudio: el "jefe ciego" (bug en `profiles_select`)

Este bug apareció durante el testeo de Fase 1 y vale la pena
estudiarlo, porque ilustra una clase de error que se va a repetir
mientras escribamos RLS: **policies que están bien para el caso
feliz pero se rompen en estados intermedios del modelo**.

### Cómo se manifestó

Setup de prueba:
1. Creamos un jefe nuevo con `INSERT INTO profiles (..., rol='jefe')`.
   En este punto su `campo_id` queda `NULL`.
2. El jefe crea su campo con `INSERT INTO campos (...)`. La policy
   `campos_insert` requiere `current_user_rol() = 'jefe'`, lo que
   funciona porque el rol está seteado.
3. Un empleado se registra con el código del campo y queda con
   `profiles.campo_id = CAMPO_UUID`.
4. El jefe entra a la app y hace `SELECT * FROM profiles` esperando
   ver al empleado. **No ve nada.**

### Por qué fallaba

La policy original era:

```sql
USING (
    id = auth.uid()
    OR (campo_id IS NOT NULL AND campo_id = current_user_campo_id())
)
```

Repasamos las dos cláusulas para una fila que es el profile del
empleado, evaluada desde el JWT del jefe:

- `id = auth.uid()` → el id es del empleado, no del jefe. **False.**
- `campo_id IS NOT NULL AND campo_id = current_user_campo_id()`:
  - `campo_id IS NOT NULL` → True (el empleado tiene campo).
  - `current_user_campo_id()` → devuelve el `campo_id` del jefe,
    que es **NULL** (nunca se autoasignó al campo).
  - `campo_id = NULL` → en SQL esto es **NULL**, no false, pero
    en una expresión booleana se trata como false.
  - **False.**

Ambas cláusulas dan false → la fila no es visible → el jefe ve
una lista vacía.

### Por qué se nos pasó cuando escribimos la policy

Asumimos que "estar en el mismo campo" era la única forma de
relacionar dos profiles. **Eso es cierto para empleados, pero no
para jefes.** En el modelo hay dos relaciones distintas que un
jefe puede tener con un campo:

- **Pertenencia** (`profiles.campo_id` apunta al campo).
- **Autoridad** (`campos.jefe_id` apunta al jefe).

Un jefe normalmente tiene autoridad pero **no necesariamente**
pertenencia. La policy original solo modelaba la primera.

### Por qué la cláusula extra es correcta

La nueva cláusula:

```sql
OR campo_id IN (SELECT id FROM campos WHERE jefe_id = auth.uid())
```

dice: "esta fila es visible si su `campo_id` apunta a algún campo
donde yo, el caller, soy `jefe_id`". Es la traducción literal de
la relación de autoridad.

No introduce recursión porque el subquery toca `campos`, no
`profiles`. La policy de `campos` no se entera del lookup
(Postgres aplica la policy de `campos` a este subquery
automáticamente, pero `campos_select` ya permite ver los campos
donde `jefe_id = auth.uid()`, así que el subquery es válido).

### Lecciones para el resto de las policies

1. **Listar TODOS los caminos por los que un usuario llega a un
   recurso.** Para un jefe, eso es: pertenencia (`campo_id`) y
   autoridad (`jefe_id`). Para un empleado, solo pertenencia.
2. **Probar con datos en estado intermedio**, no solo con datos
   "finales". Un jefe sin `campo_id` autoasignado es un estado
   válido y temporal del modelo, y la policy tenía que tolerarlo.
3. **`NULL` en RLS es traicionero.** Cualquier comparación con
   NULL devuelve NULL, que en booleanos es false. Cuando una
   columna nullable interviene en una policy, hay que pensar
   explícitamente qué pasa con NULL.
4. **Un test rápido que hubiera detectado esto:** después del
   setup de Fase 1, antes de cualquier otra cosa, hacer
   `SET LOCAL "request.jwt.claim.sub" = JEFE_UUID; SELECT *
   FROM profiles;` y verificar que aparezcan jefe + empleado.
   Lo agregamos al checklist de testing.

## Cómo aplicar estos archivos en Supabase

Paso a paso, sin atajos.

### 1. Backup primero
Si tu proyecto Supabase tiene datos, hacé export del schema y de
los datos antes de tocar nada (Supabase Studio → Database →
Backups, o `pg_dump` desde la connection string).

### 2. Abrí el SQL Editor
Dashboard de Supabase → SQL Editor → New query.

### 3. Aplicá `schema.sql`
Abrí `supabase/schema.sql`, copiá TODO el contenido, pegalo en el
SQL Editor, dale Run.

Si te tira error porque las tablas ya existen (corriste algo
parecido antes), o las dropeás manualmente con `DROP TABLE ...
CASCADE` o creás un proyecto Supabase nuevo. **Nunca hagas DROP
sobre datos en producción.**

### 4. Aplicá `policies.sql`
Mismo flujo: abrí `supabase/policies.sql`, copiá todo, pegá, Run.
**Importante**: ya debe estar aplicado `schema.sql`, porque
`policies.sql` referencia las tablas y las funciones helper.

### 5. Verificá en la UI
- **Database → Tables**: deberías ver las 5 tablas con un cartelito
  "RLS enabled".
- **Database → Functions**: tienen que figurar
  `current_user_campo_id`, `current_user_rol`, `es_jefe_del_campo`,
  `set_updated_at`, `set_completada_en`,
  `validar_empleado_pertenece_al_campo`, `bloquear_cambio_de_rol`,
  `restringir_update_empleado_solo_estado`.
- **Authentication → Policies**: cada tabla debe mostrar varias
  policies activas.

### 6. Storage
Supabase Storage es aparte. Para las fotos vas a necesitar un bucket
(ej. `tareas-fotos`) y policies sobre `storage.objects`. Eso queda
como TODO para una próxima sesión.

## Cómo testear que las policies funcionan

### Setup: 2 usuarios de prueba

1. **Authentication → Users → Add user**: creá dos cuentas, anotá los
   UUIDs. Llamémoslos `JEFE_UUID` y `EMPLEADO_UUID`.

2. En el SQL Editor, **conectado como owner** (la conexión por
   defecto del dashboard ya lo es), insertá los profiles:

```sql
INSERT INTO profiles (id, nombre, rol)
VALUES ('JEFE_UUID', 'Don Carlos', 'jefe');

INSERT INTO campos (nombre, codigo, jefe_id)
VALUES ('Estancia La Esperanza', 'ABC123', 'JEFE_UUID')
RETURNING id;
-- guardá el UUID retornado como CAMPO_UUID

UPDATE profiles SET campo_id = 'CAMPO_UUID' WHERE id = 'JEFE_UUID';

INSERT INTO profiles (id, nombre, rol, campo_id)
VALUES ('EMPLEADO_UUID', 'Pedro', 'empleado', 'CAMPO_UUID');
```

### Probar como un usuario específico

En el SQL Editor:

```sql
BEGIN;
  SET LOCAL role = 'authenticated';
  SET LOCAL "request.jwt.claim.sub" = 'EMPLEADO_UUID';

  -- ¿Qué ve el empleado?
  SELECT * FROM tareas;        -- solo las suyas
  SELECT * FROM profiles;      -- el suyo + el jefe (mismo campo)
  SELECT * FROM campos;        -- solo el suyo
ROLLBACK;
```

`ROLLBACK` al final asegura que cualquier cambio que hayas hecho
en la prueba se descarte.

### Tests recomendados (todos los ejemplos están en `policies.sql`)

1. Empleado solo ve sus tareas.
2. Empleado NO puede crear un campo.
3. Empleado NO puede auto-promoverse a jefe (lo bloquea el trigger).
4. Empleado NO puede cambiar el título de su tarea (trigger),
   pero SÍ puede cambiar el estado.
5. Jefe NO puede asignar tarea a empleado de otro campo (trigger).

## Errores típicos que romperían la seguridad

Si en algún momento alguien edita las policies sin entenderlas, estos
son los pasos en falso más probables y por qué duelen:

1. **Sacar `FORCE ROW LEVEL SECURITY` y testear como owner del
   schema.** Ahí las policies parecen no aplicar y uno cree que
   funcionan distinto. Siempre testeá como rol `authenticated` con
   un `request.jwt.claim.sub` específico.

2. **Reemplazar `current_user_campo_id()` por un subquery directo.**
   Te va a recursar y a fallar en runtime. Si la función no te
   convence, leé arriba "Por qué necesita SECURITY DEFINER".

3. **Olvidar `WITH CHECK` en UPDATE.** `USING` filtra qué filas
   se ven para modificar; `WITH CHECK` valida que la fila
   modificada siga siendo válida. Sin `WITH CHECK`, un jefe podría
   reasignar una tarea fuera de su scope ("UPDATE tareas SET
   campo_id = OTRO_CAMPO WHERE ...") y quedaría con una tarea que
   ya no puede ver: pérdida silenciosa de datos.

4. **Sacar el trigger `bloquear_cambio_de_rol` "porque molesta".**
   La policy de UPDATE de profiles permite a cualquier user
   modificar su profile, incluyendo el rol. Sin el trigger, escalada
   de privilegios trivial.

5. **Sacar el trigger `validar_empleado_pertenece_al_campo`.**
   La policy `tareas_insert` valida que el caller sea jefe del
   `campo_id`, pero NO valida que el `empleado_id` pertenezca a ese
   campo. Sin el trigger, un jefe puede asignar tareas a empleados
   de campos ajenos.

6. **Cambiar `SECURITY DEFINER` por `SECURITY INVOKER` en los
   helpers.** Vuelve la recursión.

7. **Quitar `SET search_path = public` en una función SECURITY
   DEFINER.** Abre el vector de ataque clásico de search_path
   hijacking. **Toda** función SECURITY DEFINER en este proyecto
   debe tener `SET search_path` explícito.

8. **Permitir `DELETE` en `profiles`.** Si alguien borra su propio
   profile, las tareas/fotos/comentarios que tiene asociadas
   bloquean el delete (bien, RESTRICT), pero si en el futuro alguien
   afloja a `SET NULL` para "destrabarlo", se pierde la trazabilidad
   histórica. El borrado de profiles es operación administrativa,
   no acción del usuario.

## Próximos pasos (no en este doc)

- Policies de Storage para fotos.
- Trigger o policy específica para crear el profile automáticamente
  al hacer signup en `auth.users` (hoy lo hace la app, pero un
  trigger sería más robusto).
- Vistas materializadas o RPCs para los dashboards si las queries
  agregadas se ponen lentas.
