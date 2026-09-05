import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { SystemRole, UserStatus, type UserView } from '@cheque-flow/shared-types';
import { createUserSchema } from '@cheque-flow/validation';

import { useApi, useApp, useTranslator } from '@/components/providers';
import {
  Badge,
  Body,
  Button,
  EmptyView,
  ErrorView,
  Field,
  LoadingView,
  Picker,
  Sheet,
} from '@/components/ui';
import { fieldErrorsFrom, validateForm, type FieldErrors } from '@/lib/form';
import { TAP, accent, elevation, radius, space, surface, text, type } from '@/theme';

/**
 * Members of the organization and what they may do.
 *
 * Users are never deleted here, only disabled: every cheque event and audit
 * row names the person who performed it, and deleting the user would leave
 * that history pointing at nobody.
 */
export default function UsersScreen() {
  const api = useApi();
  const t = useTranslator();
  const { dateTime } = useApp();
  const queryClient = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>(SystemRole.DATA_ENTRY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['users'], queryFn: () => api.listUsers({ pageSize: 100 }) });

  const create = useMutation({
    mutationFn: async () => {
      const validated = validateForm(createUserSchema, {
        name: name.trim(),
        email: email.trim(),
        password,
        phone: null,
        branchId: null,
        roles: [role],
      });
      if (!validated.ok) {
        setErrors(validated.errors);
        throw new Error('validation');
      }
      setErrors({});
      return api.createUser(validated.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setSheetOpen(false);
      setName('');
      setEmail('');
      setPassword('');
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

  const toggleStatus = useMutation({
    mutationFn: (user: UserView) =>
      api.updateUser(user.id, {
        status: user.status === UserStatus.ACTIVE ? UserStatus.DISABLED : UserStatus.ACTIVE,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (error: unknown) => {
      setFormError(error instanceof ApiClientError ? t(error.messageKey) : t('errors.saveFailed'));
    },
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;
  if (query.isError) {
    return (
      <ErrorView
        label={t('errors.loadFailed')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const error = (field: string): string | undefined =>
    errors[field] ? t(errors[field]) : undefined;

  return (
    <View style={styles.container}>
      {formError ? <ErrorView label={formError} /> : null}

      <FlatList<UserView>
        data={query.data?.data ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        ListEmptyComponent={<EmptyView label={t('user.empty')} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              <View style={styles.avatar}>
                <Text style={styles.initial}>{item.name.trim().charAt(0) || '؟'}</Text>
              </View>
              <Text style={styles.name}>{item.name}</Text>
              {item.status === UserStatus.ACTIVE ? null : (
                <Badge label={t(`userStatus.${item.status}`)} />
              )}
            </View>
            <Text style={styles.meta}>{item.email}</Text>
            <Text style={styles.meta}>
              {t('user.roles')}: {item.roles.map((entry) => t(`role.${entry}`)).join('، ') || '—'}
            </Text>
            <Text style={styles.meta}>
              {t('user.lastLogin')}: {item.lastLoginAt ? dateTime(item.lastLoginAt) : '—'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => toggleStatus.mutate(item)}
              style={styles.statusToggle}
            >
              <Text style={styles.statusToggleText}>
                {item.status === UserStatus.ACTIVE
                  ? t('userStatus.DISABLED')
                  : t('userStatus.ACTIVE')}
              </Text>
            </Pressable>
          </View>
        )}
      />

      <Button label={t('user.newTitle')} onPress={() => setSheetOpen(true)} large />

      <Sheet visible={sheetOpen} title={t('user.newTitle')} onClose={() => setSheetOpen(false)}>
        <Field
          label={t('user.name')}
          required
          value={name}
          onChangeText={setName}
          error={error('name')}
        />
        <Field
          label={t('auth.username')}
          required
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          ltr
          hint={t('auth.usernameHint')}
          error={error('email')}
        />
        <Field
          label={t('auth.password')}
          required
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          ltr
          error={error('password')}
        />
        <Picker
          label={t('user.roles')}
          required
          options={Object.values(SystemRole).map((value) => ({
            value,
            label: t(`role.${value}`),
          }))}
          value={role}
          onChange={setRole}
          error={error('roles')}
        />
        <Body muted>{t('auth.passwordHint')}</Body>
        <Button
          label={t('common.save')}
          onPress={() => {
            setFormError(null);
            create.mutate();
          }}
          loading={create.isPending}
          large
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space['3'] },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: accent.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { ...type.bodyStrong, color: accent.dark },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    padding: space['4'],
    gap: space['2'],
  },
  list: { gap: space['2'], paddingBottom: space['4'] },
  row: {
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['4'],
    gap: 4,
  },
  header: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: text.primary, textAlign: 'right' },
  meta: { fontSize: 13, color: text.secondary, textAlign: 'right' },
  statusToggle: { alignSelf: 'flex-start', minHeight: TAP, justifyContent: 'center' },
  statusToggleText: { fontSize: 14, color: accent.base, fontWeight: '600' },
});
