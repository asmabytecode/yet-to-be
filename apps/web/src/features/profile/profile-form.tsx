import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProfileSchema, type UpdateProfileInput, type UserDto } from '@yet-to-be/shared';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { applyServerError } from '../../shared/api/errors';
import { SESSION_KEY } from '../../shared/api/query-client';
import { Button } from '../../shared/ui/button';
import { Field, FormError, TextAreaField } from '../../shared/ui/field';
import { useToast } from '../../shared/ui/toast';
import { profileApi } from './api';

const FIELDS = ['displayName', 'firstName', 'lastName', 'bio'] as const;
type FormValues = Record<(typeof FIELDS)[number], string>;

function valuesOf(user: UserDto): FormValues {
  return {
    displayName: user.displayName,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    bio: user.bio ?? '',
  };
}

/** Лише змінені поля: решту сервер не чіпає, а зайві дані не летять мережею. */
export function changedFields(initial: FormValues, current: FormValues): UpdateProfileInput {
  const diff: UpdateProfileInput = {};
  for (const field of FIELDS) {
    if (current[field] !== initial[field]) diff[field] = current[field];
  }
  return diff;
}

export function ProfileForm({ user }: { user: UserDto }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const initial = valuesOf(user);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(updateProfileSchema) as unknown as Resolver<FormValues>,
    defaultValues: initial,
  });

  const update = useMutation({
    mutationFn: profileApi.update,
    onSuccess: (dto) => {
      client.setQueryData(SESSION_KEY, dto);
      reset(valuesOf(dto));
      toast.success(t('profile.saved'));
    },
    onError: (error) => {
      setFormError(applyServerError(error, setError, [...FIELDS]));
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        setFormError(null);
        void handleSubmit((values) => {
          const diff = changedFields(initial, values);
          if (Object.keys(diff).length === 0) {
            toast.success(t('profile.nothingChanged'));
            return;
          }
          update.mutate(diff);
        })(event);
      }}
    >
      <FormError message={formError} />
      <p className="text-sm text-slate-600">
        {t('profile.email')}: <span className="font-medium">{user.email}</span>
      </p>
      <Field
        label={t('profile.displayName')}
        error={errors.displayName}
        {...register('displayName')}
      />
      <Field
        label={t('profile.firstName')}
        autoComplete="given-name"
        error={errors.firstName}
        {...register('firstName')}
      />
      <Field
        label={t('profile.lastName')}
        autoComplete="family-name"
        error={errors.lastName}
        {...register('lastName')}
      />
      <TextAreaField label={t('profile.bio')} error={errors.bio} {...register('bio')} />
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? t('profile.saving') : t('profile.save')}
      </Button>
    </form>
  );
}
