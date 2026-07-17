const DEFAULT_ORGANIZATION_LABEL = '当前组织';

/**
 * Organization records created during bootstrap can carry a login-derived or
 * generated technical identifier. Those values are valid database keys, but
 * they are not safe customer-facing names and can accidentally expose account
 * identifiers. Keep readable business names and mask opaque identifiers until
 * an explicit organization-name editor is available.
 */
export function organizationNameForCustomer(name: string | null | undefined): string {
  const value = name?.trim();
  if (!value) return DEFAULT_ORGANIZATION_LABEL;

  const identifierLike = /^[a-z0-9_-]+$/i.test(value);
  const opaqueIdentifier =
    identifierLike && (value.length >= 20 || /\d/.test(value));

  return opaqueIdentifier ? DEFAULT_ORGANIZATION_LABEL : value;
}
