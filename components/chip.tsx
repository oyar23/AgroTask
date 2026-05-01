import { Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
};

export function Chip({ label, selected = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text
        style={[
          styles.label,
          selected ? styles.labelSelected : styles.labelUnselected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    minHeight: 40,
    justifyContent: 'center',
  },
  unselected: {
    backgroundColor: '#fff',
    borderColor: '#1f6f3f',
  },
  selected: {
    backgroundColor: '#1f6f3f',
    borderColor: '#1f6f3f',
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  labelUnselected: {
    color: '#1f6f3f',
  },
  labelSelected: {
    color: '#fff',
  },
});
