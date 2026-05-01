import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';

type Variant = 'primary' | 'secondary';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  selected?: boolean;
};

export function Button({
  label,
  variant = 'primary',
  loading = false,
  selected = false,
  disabled,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        selected && variant === 'secondary' ? styles.secondarySelected : null,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? '#fff' : '#1f6f3f'}
          />
        ) : (
          <Text
            style={[
              styles.label,
              variant === 'primary'
                ? styles.labelPrimary
                : styles.labelSecondary,
              selected && variant === 'secondary'
                ? styles.labelSecondarySelected
                : null,
            ]}
          >
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    backgroundColor: '#1f6f3f',
  },
  secondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1f6f3f',
  },
  secondarySelected: {
    backgroundColor: '#1f6f3f',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 18,
    fontWeight: '700',
  },
  labelPrimary: {
    color: '#fff',
  },
  labelSecondary: {
    color: '#1f6f3f',
  },
  labelSecondarySelected: {
    color: '#fff',
  },
});
