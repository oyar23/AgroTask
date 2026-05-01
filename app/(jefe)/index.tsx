import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmpleadoProgressItem } from '@/components/empleado-progress';
import { StatCard } from '@/components/stat-card';
import { TextInput } from '@/components/text-input';
import { useDashboard } from '@/hooks/use-dashboard';
import { useMiCampo } from '@/hooks/use-mi-campo';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import { campoFormSchema } from '@/types/tareas';

export default function JefeIndex() {
  const profile = useAuthStore((s) => s.profile);
  const router = useRouter();
  const { campo, loading: loadingCampo, refresh: refreshCampo } = useMiCampo();
  const { data, loading: loadingData, refresh: refreshDashboard } = useDashboard(
    campo?.id ?? null,
  );

  // Refrescar datos al volver a esta pantalla.
  useFocusEffect(
    useCallback(() => {
      void refreshCampo();
      void refreshDashboard();
    }, [refreshCampo, refreshDashboard]),
  );

  if (loadingCampo) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#1f6f3f" size="large" />
      </View>
    );
  }

  if (!campo) {
    return <CrearCampoForm onCreated={() => void refreshCampo()} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loadingData}
            onRefresh={() => void refreshDashboard()}
            tintColor="#1f6f3f"
          />
        }
      >
        <View>
          <Text style={styles.greeting}>Hola, {profile?.nombre}</Text>
          <Text style={styles.campoNombre}>{campo.nombre}</Text>
          <Text style={styles.codigo}>
            Código del campo: <Text style={styles.codigoValor}>{campo.codigo}</Text>
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Pendientes" value={data.stats.pendientes} tono="amarillo" />
          <StatCard label="En curso" value={data.stats.enCurso} tono="azul" />
          <StatCard label="Hechas hoy" value={data.stats.hechasHoy} tono="verde" />
          <StatCard label="Hechas semana" value={data.stats.hechasSemana} tono="gris" />
        </View>

        <Section title="Progreso por empleado (últimos 7 días)">
          {data.porEmpleado.length === 0 ? (
            <Text style={styles.empty}>
              Aún no hay empleados. Compartí el código {campo.codigo} para que se registren.
            </Text>
          ) : (
            data.porEmpleado.map((e) => (
              <EmpleadoProgressItem key={e.id} empleado={e} />
            ))
          )}
        </Section>

        <Section title="Tareas vencidas">
          {data.vencidas.length === 0 ? (
            <Text style={styles.empty}>Sin tareas vencidas. ¡Bien ahí!</Text>
          ) : (
            data.vencidas.map((v) => (
              <Pressable
                key={v.id}
                onPress={() => router.push(`/(jefe)/tareas/${v.id}`)}
                style={({ pressed }) => [
                  styles.vencidaItem,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.vencidaTitulo} numberOfLines={1}>
                  {v.titulo}
                </Text>
                <Text style={styles.vencidaSub}>
                  {v.empleadoNombre} · vencida el {formatDate(v.fechaLimite)}
                </Text>
              </Pressable>
            ))
          )}
        </Section>

        <View style={styles.actions}>
          <Button
            label="Ver todas las tareas"
            onPress={() => router.push('/(jefe)/tareas')}
          />
          <Button
            label="Nueva tarea"
            variant="secondary"
            onPress={() => router.push('/(jefe)/tareas/nueva')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
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
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f6f3f',
  },
  campoNombre: {
    fontSize: 16,
    color: '#444',
  },
  codigo: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  codigoValor: {
    fontWeight: '700',
    color: '#1f6f3f',
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  sectionBody: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  empty: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  vencidaItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pressed: {
    opacity: 0.7,
  },
  vencidaTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c0392b',
  },
  vencidaSub: {
    fontSize: 13,
    color: '#666',
  },
  actions: {
    gap: 10,
    paddingTop: 8,
  },
  // Crear campo
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1f6f3f',
  },
  subtitle: {
    fontSize: 16,
    color: '#444',
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
