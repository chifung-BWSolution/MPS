import assert from 'node:assert/strict';
import {
  matchWebsiteByDomains,
  resolveBacklinkBrandLabel,
  resolveBacklinkBrandListId,
  resolveBacklinkWebsite,
} from '../src/lib/backlinkBrand';
import type { Brand } from '../src/types/app';

const brands: Brand[] = [
  { id: 'brand-bsc', companyId: 'co-1', brandCode: 'BSC', displayName: 'Beauty Skin Care', isActive: true },
  { id: 'brand-bw', companyId: 'co-1', brandCode: 'BW', displayName: 'Branding Works', isActive: true },
];

const websites = [
  {
    id: 'ws-attitude',
    brandId: 'brand-bsc',
    brand: 'BSC',
    domainUrl: 'https://www.attitude-beauty.com/',
    status: 'live',
  },
  {
    id: 'ws-office',
    brandId: 'brand-bw',
    brand: 'BW',
    domainUrl: 'https://hkofficedesign.com/',
    status: 'live',
  },
  {
    id: 'ws-office-old',
    brandId: null,
    brand: '',
    domainUrl: 'https://old.hkofficedesign.com/',
    status: 'archived',
  },
];

assert.equal(
  resolveBacklinkBrandListId({ websiteProfileId: 'ws-attitude' }, websites),
  'brand-bsc',
);
assert.equal(
  resolveBacklinkBrandLabel({ websiteProfileId: 'ws-attitude' }, websites, brands),
  'BSC',
);

assert.equal(
  resolveBacklinkBrandListId({ sourceDomain: 'attitude-beauty.com' }, websites),
  'brand-bsc',
);

const fromAccount = resolveBacklinkWebsite(
  { googleAdsAccountName: 'A1 BSC Attitude-Beauty.com 3184896707' },
  websites,
);
assert.equal(fromAccount?.id, 'ws-attitude');
assert.equal(fromAccount?.brandId, 'brand-bsc');

const office = matchWebsiteByDomains(['hkofficedesign.com'], websites);
assert.equal(office?.id, 'ws-office');
assert.equal(office?.brandId, 'brand-bw');

assert.equal(resolveBacklinkBrandListId({ sourceDomain: 'unknown-site.test' }, websites), undefined);
assert.equal(resolveBacklinkBrandLabel({ sourceDomain: 'unknown-site.test' }, websites, brands), '');

console.log('backlink brand resolver tests passed');
