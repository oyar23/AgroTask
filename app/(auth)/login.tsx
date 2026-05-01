import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { ScreenContainer } from '@/components/screen-container';
import { TextInput } from '@/components/text-input';
import { useAuthStore } from '@/lib/auth-store';
import { loginSchema } from '@/types/auth';

type FieldErrors = Partial<Record<'email' | 'password' | 'form', string>>;

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'email' || key === 'password') {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    const result = await signIn(parsed.data.email, parsed.data.password);
    setSubmitting(false);

    if (!result.ok) {
      setErrors({ form: result.error });
    }
    // Si ok=true, el layout raíz redirige automáticamente al detectar profile.
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>AgroTasks</Text>
        <Text style={styles.subtitle}>Ingresá a tu cuenta</Text>
      </View>

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
        textContentType="password"
        autoComplete="password"
        error={errors.password}
        placeholder="Mínimo 6 caracteres"
      />

      {errors.form ? <Text style={styles.formError}>{errors.form}</Text> : null}

      <Button label="Ingresar" onPress={handleSubmit} loading={submitting} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>¿No tenés cuenta?</Text>
        <Link href="/(auth)/register" replace asChild>
          <Text style={styles.link}>Registrate</Text>
        </Link>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1f6f3f',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
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
