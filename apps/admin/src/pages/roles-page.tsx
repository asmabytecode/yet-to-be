import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRoleSchema,
  type Permission,
  type RoleDto,
  updateRoleSchema,
} from '@yet-to-be/shared';
import {
  Badge,
  Button,
  Card,
  CheckboxField,
  ConfirmDialog,
  Dialog,
  Field,
  FormError,
  Spinner,
  useToast,
} from '@yet-to-be/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, keys } from '../api/admin-api';
import { Can, useAdminSession } from '../app/access';
import { useStepUp } from '../app/step-up';
import { errorMessage } from '../shared-errors';

const cancelled = (failure: unknown): boolean =>
  failure instanceof Error && failure.message === 'Step-up cancelled';

interface Draft {
  key: string;
  name: string;
  description: string;
  requiresMfa: boolean;
  permissions: Permission[];
}

const EMPTY: Draft = { key: '', name: '', description: '', requiresMfa: false, permissions: [] };

function RoleDialog({
  role,
  catalog,
  available,
  onClose,
}: {
  /** null — нова роль. */
  role: RoleDto | null;
  catalog: readonly Permission[];
  /** Права, які поточний користувач може видати (антиескалація: лише свої). */
  available: (permission: Permission) => boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const stepUp = useStepUp();
  const [draft, setDraft] = useState<Draft>(
    role === null
      ? EMPTY
      : {
          key: role.key,
          name: role.name,
          description: role.description ?? '',
          requiresMfa: role.requiresMfa,
          permissions: [...role.permissions],
        },
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (role === null) {
        const input = createRoleSchema.parse({
          key: draft.key.trim(),
          name: draft.name.trim(),
          ...(draft.description.trim() === '' ? {} : { description: draft.description.trim() }),
          requiresMfa: draft.requiresMfa,
          permissions: draft.permissions,
        });
        return stepUp(() => adminApi.roles.create(input));
      }
      const input = updateRoleSchema.parse({
        name: draft.name.trim(),
        description: draft.description.trim() === '' ? null : draft.description.trim(),
        requiresMfa: draft.requiresMfa,
        permissions: draft.permissions,
      });
      return stepUp(() => adminApi.roles.update(role.id, input));
    },
    onSuccess: () => {
      toast.success(role === null ? t('roles.created') : t('common.saved'));
      void client.invalidateQueries({ queryKey: keys.roles });
      onClose();
    },
    onError: (failure) => {
      if (cancelled(failure)) return;
      setError(
        failure instanceof Error && failure.name === 'ZodError'
          ? t('errors.VALIDATION_FAILED')
          : errorMessage(failure),
      );
    },
  });

  const toggle = (permission: Permission, on: boolean): void => {
    setDraft((current) => ({
      ...current,
      permissions: on
        ? [...current.permissions, permission]
        : current.permissions.filter((item) => item !== permission),
    }));
  };

  return (
    <Dialog
      open
      title={role === null ? t('roles.new') : t('roles.edit')}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {role === null ? (
        <Field
          label={t('roles.fields.key')}
          maxLength={40}
          value={draft.key}
          onChange={(event) => {
            setDraft({ ...draft, key: event.target.value });
          }}
        />
      ) : null}
      <Field
        label={t('roles.fields.name')}
        maxLength={60}
        value={draft.name}
        onChange={(event) => {
          setDraft({ ...draft, name: event.target.value });
        }}
      />
      <Field
        label={t('roles.fields.description')}
        maxLength={300}
        value={draft.description}
        onChange={(event) => {
          setDraft({ ...draft, description: event.target.value });
        }}
      />
      <CheckboxField
        label={t('roles.fields.requiresMfa')}
        checked={draft.requiresMfa}
        onChange={(event) => {
          setDraft({ ...draft, requiresMfa: event.target.checked });
        }}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">
          {t('roles.fields.permissions')}
        </legend>
        {catalog.map((permission) => (
          <CheckboxField
            key={permission}
            label={t(`permissions.${permission}`)}
            hint={permission}
            checked={draft.permissions.includes(permission)}
            disabled={!available(permission) && !draft.permissions.includes(permission)}
            onChange={(event) => {
              toggle(permission, event.target.checked);
            }}
          />
        ))}
      </fieldset>
      <FormError message={error} />
    </Dialog>
  );
}

export function RolesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const stepUp = useStepUp();
  const session = useAdminSession();
  const roles = useQuery({ queryKey: keys.roles, queryFn: () => adminApi.roles.list() });
  const catalog = useQuery({ queryKey: keys.catalog, queryFn: () => adminApi.roles.catalog() });
  const [editing, setEditing] = useState<RoleDto | 'new' | null>(null);
  const [removing, setRemoving] = useState<RoleDto | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => stepUp(() => adminApi.roles.remove(id)),
    onSuccess: () => {
      setRemoving(null);
      toast.success(t('common.deleted'));
      void client.invalidateQueries({ queryKey: keys.roles });
    },
    onError: (failure) => {
      setRemoving(null);
      if (!cancelled(failure)) toast.error(errorMessage(failure));
    },
  });

  if (roles.isPending || catalog.isPending) return <Spinner label={t('app.loading')} />;
  if (roles.isError || catalog.isError) {
    return (
      <Card>
        <p role="alert">{errorMessage(roles.error ?? catalog.error)}</p>
      </Card>
    );
  }

  const access = session.data?.access;
  const available = (permission: Permission): boolean =>
    access !== undefined && (access.isOwner || access.permissions.includes(permission));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('roles.title')}</h1>
        <Can permissions={['roles:manage']}>
          <Button
            onClick={() => {
              setEditing('new');
            }}
          >
            {t('roles.new')}
          </Button>
        </Can>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {roles.data.items.map((role) => (
          <li key={role.id}>
            <Card>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{role.name}</h2>
                  <code className="text-xs text-slate-500">{role.key}</code>
                  {role.isSystem ? <Badge>{t('roles.system')}</Badge> : null}
                  {role.requiresMfa ? <Badge tone="info">MFA</Badge> : null}
                </div>
                {role.description === null ? null : (
                  <p className="text-sm text-slate-700">{role.description}</p>
                )}
                <p className="text-xs text-slate-600">
                  {t('roles.members', { count: role.memberCount })}
                </p>
                <ul className="flex flex-wrap gap-1">
                  {role.permissions.map((permission) => (
                    <li key={permission}>
                      <Badge>{t(`permissions.${permission}`)}</Badge>
                    </li>
                  ))}
                </ul>
                {role.isSystem ? null : (
                  <Can permissions={['roles:manage']}>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditing(role);
                        }}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => {
                          setRemoving(role);
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </Can>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {editing === null ? null : (
        <RoleDialog
          role={editing === 'new' ? null : editing}
          catalog={catalog.data.permissions}
          available={available}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t('roles.deleteTitle')}
        description={t('roles.deleteText')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        typeToConfirm={removing?.key}
        pending={remove.isPending}
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing !== null) remove.mutate(removing.id);
        }}
      />
    </div>
  );
}
