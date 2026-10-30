import assert from 'node:assert/strict';
import { reportProjectKind } from '../src/lib/reportProjectKind';

assert.equal(reportProjectKind(null), 'orphan');
assert.equal(reportProjectKind(undefined), 'orphan');

assert.equal(
  reportProjectKind({ relatedType: 'webandsystem', profileType: 'system' }),
  'system',
);
assert.equal(
  reportProjectKind({ relatedType: 'webandsystem', profileType: 'website' }),
  'website',
);
assert.equal(
  reportProjectKind({ relatedType: 'webandsystem', profileType: '' }),
  'website',
);
assert.equal(
  reportProjectKind({ relatedType: 'quotation_client', profileType: 'website' }),
  'quotation_client',
);
assert.equal(reportProjectKind({ relatedType: 'vchannel' }), 'vchannel');
assert.equal(reportProjectKind({ relatedType: 'manual' }), 'manual');
assert.equal(reportProjectKind({ relatedType: 'something_else' }), 'orphan');

console.log('report project kind ok');
