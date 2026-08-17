export const isSafeInternalRedirect = (redirect: string | null | undefined): redirect is string => {
  if (
    typeof redirect !== 'string'
    || !redirect.startsWith('/')
    || redirect.startsWith('//')
    || redirect.includes('\\')
    || /%5c/i.test(redirect)
  ) {
    return false;
  }

  try {
    const origin = typeof window === 'undefined' ? 'https://jointvibe.invalid' : window.location.origin;
    return new URL(redirect, origin).origin === origin;
  } catch {
    return false;
  }
};

export const buildAuthContextSearch = ({
  role,
  redirect,
}: {
  role?: string | null;
  redirect?: string | null;
}) => {
  const params = new URLSearchParams();

  if (role === 'venue') {
    params.set('role', 'venue');
  }

  if (isSafeInternalRedirect(redirect)) {
    params.set('redirect', redirect);
  }

  const search = params.toString();
  return search ? `?${search}` : '';
};

export const getAuthContextSearch = (search: string) => {
  const params = new URLSearchParams(search);
  return buildAuthContextSearch({
    role: params.get('role'),
    redirect: params.get('redirect'),
  });
};
