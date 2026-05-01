import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ScreenContainer } from '@/components/screen-container';
import { TextInput } from '@/components/text-input';
import { useMiCampo } from '@/hooks/use-mi-campo';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import { campoFormSchema } from '@/types/tareas';

export default function JefeIndex() {
  const profile = useAuthStore((s) => s.profile);
  const { campo, loading, refresh } = useMiCampo();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#1f6f3f" size="large" />
      </View>
    );
  }

  if (!campo) {
    return <CrearCampoForm onCreated={() => void refresh()} />;
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Hola, {profile?.nombre}</Text>
        <Text style={styles.subtitle}>{campo.nombre}</Text>
        <View style={styles.codigoCard}>
          <Text style={styles.codigoLabel}>Código del campo</Text>
          <Text style={styles.codigoValue}>{campo.codigo}</Text>
          <Text style={styles.codigoHelp}>
            Compartilo con tus empleados para que se registren.
          </Text>
        </View>
      </View>

      <Button
        label="Ver tareas"
        onPress={() => router.push('/(jefe)/tareas')}
      />
      <Button
        label="Nueva tarea"
        variant="secondary"
        onPress={() => router.push('/(jefe)/tareas/nueva')}
      />
    </ScreenContainer>
  );
}

type CrearCampoFormProps = {
  onCreated: () => void;
};

function CrearCampoForm({ onCreated }: CrearCampoFormProps) {
  const profile = useAuthStore((s) => s.profile);

  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [errors, setErrors] = useState<{
    nombre?: string;
    codigo?: string;
    form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleCrear() {
    if (!profile) return;

    const parsed = campoFormSchema.safeParse({ nombre, codigo });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'nombre' || key === 'codigo') next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setSubmitting(true);
    const { error } = await supabase.from('campos').insert({
      nombre: parsed.data.nombre,
      codigo: parsed.data.codigo,
      jefe_id: profile.id,
    });
    setSubmitting(false);

    if (error) {
      const msg = error.message.includes('duplicate key')
        ? 'Ese código ya está en uso, elegí otro'
        : 'No pudimos crear el campo, intentá de nuevo';
      setErrors({ form: msg });
      return;
    }

    onCreated();
  }

  return (
    <ScrollView contentContainerStyle={styles.formContent}>
      <Text style={styles.title}>Bienvenido</Text>
      <Text style={styles.subtitle}>
        Antes de empezar, creá tu campo. Vas a usarlo para asignar tareas.
      </Text>

      <TextInput
        label="Nombre del campo"
        value={nombre}
        onChangeText={setNombre}
        autoCapitalize="words"
        error={errors.nombre}
        placeholder="Ej: La Esperanza"
      />
      <TextInput
        label="Código corto"
        value={codigo}
        onChangeText={(t) => setCodigo(t.toUpperCase())}
        autoCapitalize="characters"
        error={errors.codigo}
        placeholder="Ej: NORTE1"
      />
      <Text style={styles.help}>
        Tus empleados van a usar este código al registrarse. Letras y números, 4 a 12 caracteres.
      </Text>

      {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

      <Button label="Crear campo" onPress={handleCrear} loading={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1f6f3f',
  },
  subtitle: {
    fontSize: 17,
    color: '#444',
  },
  codigoCard: {
    marginTop: 8,
    padding: 16,
    backgroundColor: '#eef7f0',
    borderRadius: 10,
    gap: 4,
  },
  codigoLabel: {
    fontSize: 13,
    color: '#1f6f3f',
    fontWeight: '700',
  },
  codigoValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f6f3f',
    letterSpacing: 2,
  },
  codigoHelp: {
    fontSize: 13,
    color: '#555',
  },
  formContent: {
    flexGrow: 1,
    padding: 24,
    gap: 14,
    backgroundColor: '#fff',
  },
  help: {
    fontSize: 14,
    color: '#666',
  },
  formError: {
    color: '#c0392b',
    fontSize: 16,
    textAlign: 'center',
  },
});
