import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ScreenContainer } from '@/components/screen-container';
import { TextInput } from '@/components/text-input';
import { useAuthStore } from '@/lib/auth-store';
import { registerSchema } from '@/types/auth';
import type { Rol } from '@/types/database';

type FieldKey =
  | 'nombre'
  | 'email'
  | 'password'
  | 'confirmPassword'
  | 'rol'
  | 'codigoCampo'
  | 'form';

type FieldErrors = Partial<Record<FieldKey, string>>;

export default function RegisterScreen() {
  const signUp = useAuthStore((s) => s.signUp);

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rol, setRol] = useState<Rol | null>(null);
  const [codigoCampo, setCodigoCampo] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!rol) {
      setErrors({ rol: 'Elegí un rol' });
      return;
    }

    const parsed = registerSchema.safeParse({
      nombre,
      email: email.trim(),
      password,
      confirmPassword,
      rol,
      codigoCampo: codigoCampo.trim() || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === 'nombre' ||
          key === 'email' ||
          key === 'password' ||
          key === 'confirmPassword' ||
          key === 'rol' ||
          key === 'codigoCampo'
        ) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    const result = await signUp({
      nombre: parsed.data.nombre,
      email: parsed.data.email,
      password: parsed.data.password,
      rol: parsed.data.rol,
      codigoCampo: parsed.data.codigoCampo,
    });
    setSubmitting(false);

    if (!result.ok) {
      setErrors({ form: result.error });
    }
    // Si ok=true, el layout raíz redirige al grupo del rol.
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Crear cuenta</Text>
      </View>

      <TextInput
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        autoCapitalize="words"
        error={errors.nombre}
        placeholder="Tu nombre"
      />

      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        error={errors.email}
        placeholder="tu@email.com"
      />

      <TextInput
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        error={errors.password}
        placeholder="Mínimo 6 caracteres"
      />

      <TextInput
        label="Repetir contraseña"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        textContentType="newPassword"
        error={errors.confirmPassword}
        placeholder="Mínimo 6 caracteres"
      />

      <View style={styles.rolGroup}>
        <Text style={styles.rolLabel}>¿Cuál es tu rol?</Text>
        <View style={styles.rolButtons}>
          <View style={styles.rolButtonWrapper}>
            <Button
              label="Soy jefe"
              variant="secondary"
              selected={rol === 'jefe'}
              onPress={() => setRol('jefe')}
            />
          </View>
          <View style={styles.rolButtonWrapper}>
            <Button
              label="Soy empleado"
              variant="secondary"
              selected={rol === 'empleado'}
              onPress={() => setRol('empleado')}
            />
          </View>
        </View>
        {errors.rol ? <Text style={styles.errorText}>{errors.rol}</Text> : null}
      </View>

      {rol === 'empleado' ? (
        <TextInput
          label="Código del campo"
          value={codigoCampo}
          onChangeText={setCodigoCampo}
          autoCapitalize="characters"
          error={errors.codigoCampo}
          placeholder="Ej: NORTE1"
        />
      ) : null}

      {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

      <Button
        label="Crear cuenta"
        onPress={handleSubmit}
        loading={submitting}
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>¿Ya tenés cuenta?</Text>
        <Link href="/(auth)/login" replace asChild>
          <Text style={styles.link}>Ingresá</Text>
        </Link>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f6f3f',
  },
  rolGroup: {
    gap: 8,
  },
  rolLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  rolButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  rolButtonWrapper: {
    flex: 1,
  },
  errorText: {
    color: '#c0392b',
    fontSize: 14,
  },
  formError: {
    color: '#c0392b',
    fontSize: 16,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  footerText: {
    fontSize: 16,
    color: '#444',
  },
  link: {
    fontSize: 16,
    color: '#1f6f3f',
    fontWeight: '700',
  },
});
