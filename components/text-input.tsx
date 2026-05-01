import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  View,
} from 'react-native';

type Props = RNTextInputProps & {
  label: string;
  error?: string;
};

export const TextInput = forwardRef<RNTextInput, Props>(
  ({ label, error, style, ...rest }, ref) => {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.label}>{label}</Text>
        <RNTextInput
          ref={ref}
          style={[styles.input, error ? styles.inputError : null, style]}
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  },
);

TextInput.displayName = 'TextInput';

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    color: '#111',
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#c0392b',
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
  },
});
