// ProofStepper — docs/DESIGN.md §5.3 (SCR-009).
//   ●──────●──────○
//   Checking   Generating   Sending
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Check, CircleX } from 'lucide-react-native';
import type { ProofStep } from '../lib/proof';
import { PROOF_STEPS } from '../lib/proof';
import { alpha, colors, fonts, space } from '../styles/tokens';
import { PulseDot, Text } from '../ui';

const LABELS: Record<ProofStep, [string, string]> = {
  check: ['Checking', 'credential'],
  generate: ['Generating', 'proof'],
  send: ['Sending', 'to NexusID'],
};

type StepState = 'done' | 'active' | 'todo' | 'failed';

interface Props {
  current: ProofStep;
  /** All steps finished. */
  complete?: boolean;
  /** The current step failed. */
  failed?: boolean;
}

export function ProofStepper({ current, complete, failed }: Props) {
  const currentIndex = PROOF_STEPS.indexOf(current);
  const stateOf = (i: number): StepState => {
    if (complete || i < currentIndex) return 'done';
    if (i === currentIndex) return failed ? 'failed' : 'active';
    return 'todo';
  };

  return (
    <View
      style={s.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={complete ? 'Proof sent' : `Step ${currentIndex + 1} of 3: ${LABELS[current].join(' ')}${failed ? ', failed' : ''}`}
      accessibilityLiveRegion="polite"
    >
      <View style={s.track}>
        {PROOF_STEPS.map((step, i) => (
          <React.Fragment key={step}>
            {i > 0 ? <View style={[s.line, { backgroundColor: stateOf(i - 1) === 'done' ? colors.accent : colors.border }]} /> : null}
            <Dot state={stateOf(i)} />
          </React.Fragment>
        ))}
      </View>
      <View style={s.labels}>
        {PROOF_STEPS.map((step, i) => {
          const st = stateOf(i);
          const color = st === 'failed' ? colors.danger : st === 'todo' ? colors.textFaint : colors.text;
          return (
            <View key={step} style={s.label}>
              <Text variant="bodySmall" align="center" color={color} style={{ fontFamily: st === 'active' ? fonts.bodySemiBold : fonts.body }}>
                {LABELS[step][0]}
              </Text>
              <Text variant="bodySmall" align="center" color={st === 'todo' ? colors.textFaint : colors.textMuted}>
                {LABELS[step][1]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Dot({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <Animated.View entering={FadeIn.duration(150)} style={[s.dot, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
        <Check size={14} color={colors.white} strokeWidth={3} />
      </Animated.View>
    );
  }
  if (state === 'failed') {
    return (
      <View style={[s.dot, { backgroundColor: alpha(colors.danger, 0.1), borderColor: colors.danger }]}>
        <CircleX size={14} color={colors.danger} strokeWidth={2.5} />
      </View>
    );
  }
  if (state === 'active') {
    return (
      <View style={[s.dot, { borderColor: colors.accent, backgroundColor: alpha(colors.accent, 0.12) }]}>
        <PulseDot color={colors.accentText} size={10} />
      </View>
    );
  }
  return <View style={[s.dot, { borderColor: colors.border, backgroundColor: colors.surface }]} />;
}

const DOT = 28;
const s = StyleSheet.create({
  wrap: { width: '100%', gap: space[3] },
  track: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: '12%' },
  line: { flex: 1, height: 2, marginHorizontal: space[1], borderRadius: 1 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  labels: { flexDirection: 'row' },
  label: { flex: 1 },
});
