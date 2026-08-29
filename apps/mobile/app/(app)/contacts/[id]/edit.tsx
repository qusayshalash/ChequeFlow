import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { ContactType } from '@cheque-flow/shared-types';
import { updateContactSchema } from '@cheque-flow/validation';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { Button, ErrorView, Field, LoadingView, Picker, Section } from '@/components/ui';
import { fieldErrorsFrom, validateForm, type FieldErrors } from '@/lib/form';

export default function EditContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['contact', id],
    queryFn: () => api.getContact(id),
    enabled: Boolean(id),
  });

  const [type, setType] = useState<string>(ContactType.CUSTOMER);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const contact = query.data;
  useEffect(() => {
    if (!contact) return;
    setType(contact.type);
    setName(contact.name);
    setCompanyName(contact.companyName ?? '');
    setPhone(contact.phone ?? '');
    setEmail(contact.email ?? '');
    setTaxNumber(contact.taxNumber ?? '');
    setNationalId(contact.nationalId ?? '');
    setAddress(contact.address ?? '');
    setNotes(contact.notes ?? '');
  }, [contact]);

  const mutation = useMutation({
    mutationFn: async () => {
      const validated = validateForm(updateContactSchema, {
        type,
        name: name.trim(),
        companyName: companyName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        taxNumber: taxNumber.trim() || null,
        nationalId: nationalId.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
      if (!validated.ok) {
        setErrors(validated.errors);
        throw new Error('validation');
      }
      setErrors({});
      return api.updateContact(id, validated.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['contact-statement', id] });
      router.back();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'validation') return;
      if (error instanceof ApiClientError) {
        const serverErrors = fieldErrorsFrom(error.details);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
          return;
        }
        setFormError(t(error.messageKey));
        return;
      }
      setFormError(t('errors.saveFailed'));
    },
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;

  const error = (field: string): string | undefined =>
    errors[field] ? t(errors[field]) : undefined;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Section title={t('contact.editTitle')}>
        <Picker
          label={t('contact.type')}
          required
          options={Object.values(ContactType).map((value) => ({
            value,
            label: t(`contactType.${value}`),
          }))}
          value={type}
          onChange={setType}
          error={error('type')}
        />
        <Field
          label={t('contact.name')}
          required
          value={name}
          onChangeText={setName}
          error={error('name')}
        />
        <Field
          label={t('contact.companyName')}
          value={companyName}
          onChangeText={setCompanyName}
          error={error('companyName')}
        />
        <Field
          label={t('contact.phone')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          ltr
          error={error('phone')}
        />
        <Field
          label={t('contact.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          ltr
          error={error('email')}
        />
        <Field
          label={t('contact.nationalId')}
          value={nationalId}
          onChangeText={setNationalId}
          ltr
          error={error('nationalId')}
        />
        <Field
          label={t('contact.taxNumber')}
          value={taxNumber}
          onChangeText={setTaxNumber}
          ltr
          error={error('taxNumber')}
        />
        <Field
          label={t('contact.address')}
          value={address}
          onChangeText={setAddress}
          multiline
          error={error('address')}
        />
        <Field
          label={t('common.notes')}
          value={notes}
          onChangeText={setNotes}
          multiline
          error={error('notes')}
        />
      </Section>

      {formError ? <ErrorView label={formError} /> : null}

      <Button
        label={t('common.save')}
        onPress={() => {
          setFormError(null);
          mutation.mutate();
        }}
        loading={mutation.isPending}
        large
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    paddingBottom: spacing.xxl,
  },
});
