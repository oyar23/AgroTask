import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  error?: string;
  placeholder?: string;
  minimumDate?: Date;
};

// El DateTimePicker nativo se comporta distinto en cada plataforma:
// - Android: es un dialog modal que aparece al tocar; al seleccionar,
//   dispara onChange y se cierra. Para volver a abrirlo hay que volver
//   a setear `show=true`.
// - iOS: es un picker inline o tipo spinner; lo mostramos en un overlay
//   con un botón "Listo" para confirmar.
// - Web: el componente expone un <input type="date">, así que igual
//   lo manejamos como controlado.
export function DatePickerField({
  label,
  value,
  onChange,
  error,
  placeholder = 'Sin fecha',
  minimumDate,
}: Props) {
  const [show, setShow] = useState(false);

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setShow(false);
      if (event.type === 'set' && selected) onChange(selected);
      return;
    }
    if (selected) onChange(selected);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setShow(true)}
        style={[styles.field, error ? styles.fieldError : null]}
      >
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDate(value) : placeholder}
        </Text>
      </Pressable>
      {value ? (
        <Pressable onPress={() => onChange(null)} hitSlop={8}>
          <Text style={styles.clearText}>Quitar fecha</Text>
        </Pressable>
      ) : null}
      {show ? (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          minimumDate={minimumDate}
        />
      ) : null}
      {Platform.OS === 'ios' && show ? (
        <Pressable onPress={() => setShow(false)} style={styles.iosDone}>
          <Text style={styles.iosDoneText}>Listo</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  field: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  fieldError: {
    borderColor: '#c0392b',
  },
  valueText: {
    fontSize: 18,
    color: '#111',
  },
  placeholderText: {
    fontSize: 18,
    color: '#888',
  },
  clearText: {
    color: '#1f6f3f',
    fontSize: 14,
    fontWeight: '600',
  },
  iosDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1f6f3f',
  },
  iosDoneText: {
    color: '#fff',
    fontWeight: '700',
  },
  errorText: {
    color: '#c0392b',
    fontSize: 14,
  },
});
