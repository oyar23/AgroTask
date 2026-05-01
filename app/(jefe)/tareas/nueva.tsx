import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { DatePickerField } from '@/components/date-picker-field';
import { Dropdown, type DropdownOption } from '@/components/dropdown';
import { ScreenContainer } from '@/components/screen-container';
import { TextInput } from '@/components/text-input';
import { useEmpleados } from '@/hooks/use-empleados';
import { useMiCampo } from '@/hooks/use-mi-campo';
import { crearTarea } from '@/hooks/use-tareas';
import { tareaFormSchema } from '@/types/tareas';

type FieldErrors = Partial<{
  titulo: string;
  descripcion: string;
  empleadoId: string;
  fechaLimite: string;
  form: string;
}>;

export default function NuevaTarea() {
  const router = useRouter();
  const { campo, loading: loadingCampo } = useMiCampo();
  const { empleados, loading: loadingEmpleados } = useEmpleados(
    campo?.id ?? null,
  );

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [empleadoId, setEmpleadoId] = useState<string | null>(null);
  const [fechaLimite, setFechaLimite] = useState<Date | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const empleadoOptions: DropdownOption<string>[] = useMemo(
    () => empleados.map((e) => ({ label: e.nombre, value: e.id })),
    [empleados],
  );

  async function handleSubmit() {
    if (!campo) return;

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
    const result = await crearTarea({
      titulo: parsed.data.titulo,
      descripcion: parsed.data.descripcion.length > 0
        ? parsed.data.descripcion
        : null,
      campo_id: campo.id,
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
    router.back();
  }

  if (loadingCampo || loadingEmpleados) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1f6f3f" size="large" />
      </View>
    );
  }

  if (!campo) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Primero tenés que crear un campo.</Text>
      </View>
    );
  }

  if (empleados.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Aún no hay empleados en este campo.</Text>
        <Text style={styles.emptyHelp}>
          Compartí el código {campo.codigo} para que se registren.
        </Text>
      </View>
    );
  }

  return (
    <ScreenContainer>
      <TextInput
        label="Título"
        value={titulo}
        onChangeText={setTitulo}
        error={errors.titulo}
        placeholder="Ej: Limpiar el alambrado norte"
        autoCapitalize="sentences"
      />
      <TextInput
        label="Descripción"
        value={descripcion}
        onChangeText={setDescripcion}
        error={errors.descripcion}
        placeholder="Detalles, ubicación, herramientas, etc."
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
        placeholder="Elegí un empleado"
        error={errors.empleadoId}
        allowEmpty={false}
      />
      <DatePickerField
        label="Fecha límite (opcional)"
        value={fechaLimite}
        onChange={setFechaLimite}
        error={errors.fechaLimite}
        minimumDate={new Date()}
      />

      {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

      <Button label="Crear tarea" onPress={handleSubmit} loading={submitting} />
      <Button
        label="Cancelar"
        variant="secondary"
        onPress={() => router.back()}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
    backgroundColor: '#fff',
  },
  empty: {
    fontSize: 18,
    color: '#444',
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyHelp: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
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
