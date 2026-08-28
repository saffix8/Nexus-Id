import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

const T = {
  bg:         '#0C0E13',
  elevated:   '#13161E',
  border:     '#252C3D',
  primary:    '#EEF0F6',
  secondary:  '#8B92A8',
  tertiary:   '#525A72',
  accent:     '#3B6FE8',
  success:    '#22C55E',
  warning:    '#F59E0B',
  danger:     '#EF4444',
};

export function ProofApprovalModal({ request, credential, decodedFields, onApprove, onReject }) {
  const requestedFields = request.requested_fields;
  const allFields = credential.metadata.selectively_disclosable_fields;
  const hiddenFields = allFields.filter(f => !requestedFields.includes(f));

  return (
    <View style={s.container}>
      <View style={s.handle} />

      <View style={s.verifierBlock}>
        <View style={s.verifierRow}>
          <View style={s.verifierIconBox}>
            <Text style={s.verifierIconText}>
              {request.trusted ? '✓' : '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.verifierName}>{request.verifier_name}</Text>
            <Text style={s.verifierDomain}>{request.verifier_id}</Text>
          </View>
          {request.trusted
            ? <View style={s.trustedBadge}><Text style={s.trustedText}>Verified</Text></View>
            : <View style={s.unknownBadge}><Text style={s.unknownText}>Unknown</Text></View>
          }
        </View>
        <Text style={s.requestSummary}>
          Requesting verification of {requestedFields.length} attribute{requestedFields.length > 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <Text style={s.sectionLabel}>WILL BE SHARED</Text>
          {requestedFields.map(field => (
            <View key={field} style={s.fieldRow}>
              <View style={s.fieldIconSuccess}>
                <Text style={{ fontSize: 10, color: T.success }}>✓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldKey}>
                  {credential.metadata.field_labels[field] ?? field}
                </Text>
                <Text style={s.fieldValue}>
                  {String(decodedFields[field] ?? '—')}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {hiddenFields.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>WILL STAY HIDDEN</Text>
            {hiddenFields.map(field => (
              <View key={field} style={[s.fieldRow, { opacity: 0.5 }]}>
                <View style={s.fieldIconLock}>
                  <Text style={{ fontSize: 10, color: T.tertiary }}>🔒</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldKey}>
                    {credential.metadata.field_labels[field] ?? field}
                  </Text>
                  <Text style={[s.fieldValue, { letterSpacing: 3 }]}>••••••</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.credentialChip}>
          <Text style={s.credentialChipLabel}>USING CREDENTIAL</Text>
          <Text style={s.credentialChipName}>{credential.display_name}</Text>
        </View>
      </ScrollView>

      <View style={s.actions}>
        <TouchableOpacity style={s.rejectBtn} onPress={onReject} activeOpacity={0.8}>
          <Text style={s.rejectText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.approveBtn} onPress={onApprove} activeOpacity={0.8}>
          <Text style={s.approveText}>Approve & Sign</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: T.bg, padding: 20, paddingTop: 12 },
  handle:            { width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 20 },
  verifierBlock:     { backgroundColor: T.elevated, borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: T.border },
  verifierRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  verifierIconBox:   { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1E28', alignItems: 'center', justifyContent: 'center' },
  verifierIconText:  { fontSize: 18 },
  verifierName:      { fontSize: 16, fontWeight: '600', color: T.primary },
  verifierDomain:    { fontSize: 12, color: T.secondary, marginTop: 2 },
  trustedBadge:      { backgroundColor: '#0F2A1A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#16532F' },
  trustedText:       { fontSize: 11, color: T.success, fontWeight: '500' },
  unknownBadge:      { backgroundColor: '#261D07', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#4D3A0E' },
  unknownText:       { fontSize: 11, color: T.warning, fontWeight: '500' },
  requestSummary:    { fontSize: 13, color: T.secondary },
  section:           { marginBottom: 20 },
  sectionLabel:      { fontSize: 10, color: T.tertiary, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 8 },
  fieldRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  fieldIconSuccess:  { width: 24, height: 24, borderRadius: 12, backgroundColor: '#0F2A1A', alignItems: 'center', justifyContent: 'center' },
  fieldIconLock:     { width: 24, height: 24, borderRadius: 12, backgroundColor: '#13161E', alignItems: 'center', justifyContent: 'center' },
  fieldKey:          { fontSize: 11, color: T.secondary, marginBottom: 2 },
  fieldValue:        { fontSize: 14, color: T.primary, fontWeight: '500' },
  credentialChip:    { backgroundColor: T.elevated, borderRadius: 8, padding: 12, marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: T.border },
  credentialChipLabel: { fontSize: 10, color: T.tertiary, letterSpacing: 1.5 },
  credentialChipName: { fontSize: 13, color: T.primary, fontWeight: '500' },
  actions:           { flexDirection: 'row', gap: 12 },
  rejectBtn:         { flex: 1, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4A1515' },
  rejectText:        { fontSize: 16, fontWeight: '600', color: T.danger },
  approveBtn:        { flex: 2, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: T.accent },
  approveText:       { fontSize: 16, fontWeight: '600', color: '#fff' },
});
