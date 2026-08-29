import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { ContactType } from '@cheque-flow/shared-types';
import { createContactSchema } from '@cheque-flow/validation';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { Button, ErrorView, Field, Picker, Section } from '@/components/ui';
import { fieldErrorsFrom, validateForm, type FieldErrors } from '@/lib/form';

export default function NewContactScreen() {
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const queryClient = useQueryClient();

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

  const mutation = useMutation({
    mutationFn: async () => {
      const validated = validateForm(createContactSchema, {
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
      return api.createContact(validated.data);
    },
    onSuccess: (contact) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      router.replace(`/(app)/contacts/${contact.id}`);
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

  const error = (field: string): string | undefined =>
    errors[field] ? t(errors[field]) : undefined;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Section title={t('contact.newTitle')}>
        {/* A party can be both a customer and a supplier; the type is how the
            contact is listed, not a restriction on what they can do. */}
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
