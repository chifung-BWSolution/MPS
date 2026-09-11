-- Shared SQL canonicalize for webandsystem_list.domain_url.
-- Matches src/lib/canonicalDomainUrl.ts: lowercase host, no scheme/www/path/port.

CREATE OR REPLACE FUNCTION public.canonical_domain_url(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(
    regexp_replace(
      split_part(
        split_part(
          split_part(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  lower(btrim(COALESCE(raw, ''))),
                  '^https?://',
                  ''
                ),
                '^//',
                ''
              ),
              '^www\.',
              ''
            ),
            '/',
            1
          ),
          '?',
          1
        ),
        '#',
        1
      ),
      ':\d+$',
      ''
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.canonical_domain_url(text) IS
  'Bare hostname for website identity: strip scheme, www, path, query, hash, and port.';

GRANT EXECUTE ON FUNCTION public.canonical_domain_url(text) TO anon, authenticated, service_role;
