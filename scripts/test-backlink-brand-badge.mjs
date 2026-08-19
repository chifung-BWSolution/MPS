import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const moduleSrc = readFileSync(join(root, 'src/components/marketing/BacklinkModule.tsx'), 'utf8');
const tabSrc = readFileSync(join(root, 'src/components/website/WebsiteDetailTabs.tsx'), 'utf8');
const libSrc = readFileSync(join(root, 'src/lib/backlinkBrand.ts'), 'utf8');

assert.match(libSrc, /resolveBacklinkBrandListId/);
assert.match(libSrc, /brandId/);
assert.match(moduleSrc, /BrandBadge/);
assert.match(moduleSrc, /resolveBacklinkBrandLabel/);
assert.match(moduleSrc, /bg-teal-50 text-teal-700/);
assert.doesNotMatch(
  moduleSrc,
  /<td className="px-4 py-3">\s*<Select[\s\S]*BACKLINK_BRANDS/,
);
assert.doesNotMatch(
  moduleSrc,
  /<th className="text-left px-4 py-2.5 font-medium text-muted-foreground">供應商網址<\/th>/,
);
assert.match(tabSrc, /siteBrandLabel/);
assert.match(tabSrc, /bg-teal-50 text-teal-700/);

console.log('backlink brand badge source checks passed');
