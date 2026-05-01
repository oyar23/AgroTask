import { Picker } from '@react-native-picker/picker';
import { StyleSheet, Text, View } from 'react-native';

export type DropdownOption<T extends string> = {
  label: string;
  value: T;
};

type Props<T extends string> = {
  label?: string;
  value: T | null;
  options: DropdownOption<T>[];
  onChange: (value: T | null) => void;
  placeholder?: string;
  error?: string;
  // Si `false`, no se muestra la opción "placeholder" para deseleccionar.
  // Para filtros suele ser `true`; para formularios obligatorios, `false`.
  allowEmpty?: boolean;
};

// Wrapper sobre `@react-native-picker/picker`. Picker espera value como
// string; usamos '' como sentinel para "sin selección" y lo mapeamos a
// `null` afuera para que el caller no tenga que tratar con strings vacíos.
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Seleccioná…',
  error,
  allowEmpty = true,
}: Props<T>) {
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.pickerWrapper, error ? styles.pickerError : null]}>
        <Picker
          selectedValue={value ?? ''}
          onValueChange={(next: string) =>
            onChange(next === '' ? null : (next as T))
          }
          style={styles.picker}
          dropdownIconColor="#1f6f3f"
        >
          {allowEmpty ? (
            <Picker.Item label={placeholder} value="" color="#888" />
          ) : null}
          {options.map((opt) => (
            <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
          ))}
        </Picker>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
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
  pickerWrapper: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  pickerError: {
    borderColor: '#c0392b',
  },
  picker: {
    color: '#111',
  },
  errorText: {
    color: '#c0392b',
    fontSize: 14,
  },
});
