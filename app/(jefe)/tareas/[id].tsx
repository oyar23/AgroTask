import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { DatePickerField } from '@/components/date-picker-field';
import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { ScreenContainer } from '@/components/screen-container';
import { labelEstado } from '@/components/tarea-card';
import { TextInput } from '@/components/text-input';
import { useEmpleados } from '@/hooks/use-empleados';
import {
  actualizarTarea,
  eliminarTarea,
  useTarea,
} from '@/hooks/use-tareas';
import { confirm } from '@/lib/platform-utils';
import { tareaFormSchema } from '@/types/tareas';

type FieldErrors = Partial<{
  titulo: string;
  descripcion: string;
  empleadoId: string;
  fechaLimite: string;
  form: string;
}>;

export default function TareaDetalleJefe() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tarea, loading, error, refresh } = useTarea(id ?? null);
  const { empleados } = useEmpleados(tarea?.campo_id ?? null);

  const [editing, setEditing] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [empleadoId, setEmpleadoId] = useState<string | null>(null);
  const [fechaLimite, setFechaLimite] = useState<Date | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sincronizar el form local cada vez que recargamos la tarea.
  useEffect(() => {
    if (!tarea) return;
    setTitulo(tarea.titulo);
    setDescripcion(tarea.descripcion ?? '');
    setEmpleadoId(tarea.empleado_id);
    setFechaLimite(tarea.fecha_limite ? new Date(tarea.fecha_limite) : null);
  }, [tarea]);

  const empleadoOptions: DropdownOption<string>[] = useMemo(
    () => empleados.map((e) => ({ label: e.nombre, value: e.id })),
    [empleados],
  );

  async function handleGuardar() {
    if (!tarea) return;

    const parsed = tareaFormSchema.safeParse({
      titulo,
      descripcion,
      empleadoId: empleadoId ?? '',
      fechaLimite,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === 'titulo' ||
          key === 'descripcion' ||
          key === 'empleadoId' ||
          key === 'fechaLimite'
        ) {
          next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSubmitting(true);
    const result = await actualizarTarea(tarea.id, {
      titulo: parsed.data.titulo,
      descripcion: parsed.data.descripcion.length > 0
        ? parsed.data.descripcion
        : null,
      empleado_id: parsed.data.empleadoId,
      fecha_limite: parsed.data.fechaLimite
        ? parsed.data.fechaLimite.toISOString()
        : null,
    });
    setSubmitting(false);

    if (!result.ok) {
      setErrors({ form: result.error });
      return;
    }
    setEditing(false);
    void refresh();
  }

  function handleEliminar() {
    if (!tarea) return;
    confirm(
      '¿Eliminar tarea?',
      'Esta acción no se puede deshacer.',
      () => {
        void (async () => {
          setDeleting(true);
          const result = await eliminarTarea(tarea.id);
          setDeleting(false);
          if (!result.ok) {
            setErrors({ form: result.error });
            return;
          }
          router.back();
        })();
      },
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1f6f3f" size="large" />
      </View>
    );
  }

  if (error || !tarea) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{error ?? 'No encontramos esta tarea.'}</Text>
        <Button
          label="Volver"
          variant="secondary"
          onPress={() => router.back()}
        />
      </View>
    );
  }

  if (editing) {
    return (
      <ScreenContainer>
        <TextInput
          label="Título"
          value={titulo}
          onChangeText={setTitulo}
          error={errors.titulo}
          autoCapitalize="sentences"
        />
        <TextInput
          label="Descripción"
          value={descripcion}
          onChangeText={setDescripcion}
          error={errors.descripcion}
          multiline
          numberOfLines={4}
          style={styles.textArea}
          autoCapitalize="sentences"
        />
        <Dropdown
          label="Empleado"
          value={empleadoId}
          options={empleadoOptions}
          onChange={setEmpleadoId}
          error={errors.empleadoId}
          allowEmpty={false}
        />
        <DatePickerField
          label="Fecha límite (opcional)"
          value={fechaLimite}
          onChange={setFechaLimite}
          error={errors.fechaLimite}
        />
        {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}
        <Button label="Guardar" onPress={handleGuardar} loading={submitting} />
        <Button
          label="Cancelar"
          variant="secondary"
          onPress={() => setEditing(false)}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.titulo}>{tarea.titulo}</Text>
        <Text style={styles.estado}>{labelEstado(tarea.estado)}</Text>
      </View>

      <DetalleRow label="Empleado" value={tarea.empleado?.nombre ?? '—'} />
      <DetalleRow
        label="Descripción"
        value={tarea.descripcion?.trim() ? tarea.descripcion : 'Sin descripción'}
      />
      <DetalleRow
        label="Fecha límite"
        value={tarea.fecha_limite ? formatDate(tarea.fecha_limite) : 'Sin fecha'}
      />
      {tarea.completada_en ? (
        <DetalleRow
          label="Completada el"
          value={formatDate(tarea.completada_en)}
        />
      ) : null}
      <DetalleRow label="Creada el" value={formatDate(tarea.created_at)} />

      {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

      <Button label="Editar" onPress={() => setEditing(true)} />
      <Button
        label="Eliminar"
        variant="secondary"
        onPress={handleEliminar}
        loading={deleting}
      />
    </ScreenContainer>
  );
}

type DetalleRowProps = {
  label: string;
  value: string;
};

function DetalleRow({ label, value }: DetalleRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
  },
  empty: {
    fontSize: 18,
    color: '#444',
    fontWeight: '600',
  },
  header: {
    gap: 4,
  },
  titulo: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f6f3f',
  },
  estado: {
    fontSize: 16,
    color: '#444',
    fontWeight: '600',
  },
  row: {
    gap: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  rowValue: {
    fontSize: 17,
    color: '#111',
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  formError: {
    color: '#c0392b',
    fontSize: 16,
    textAlign: 'center',
  },
});
