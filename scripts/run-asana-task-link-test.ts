import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  asanaStoryToComment,
  attachmentOpenUrl,
  formatAttachmentSize,
  isImageAttachment,
  isAsanaChatStory,
  mapAsanaAttachment,
  parseAsanaTaskGidFromLink,
  stripAsanaHtml,
} from '../src/lib/asanaTaskLink';

assert.equal(parseAsanaTaskGidFromLink(''), null);
assert.equal(parseAsanaTaskGidFromLink('   '), null);
assert.equal(parseAsanaTaskGidFromLink('1209456549512345'), '1209456549512345');
assert.equal(
  parseAsanaTaskGidFromLink('https://app.asana.com/0/0/1209456549512345'),
  '1209456549512345',
);
assert.equal(
  parseAsanaTaskGidFromLink('https://app.asana.com/0/1208704092427502/1209456549512345'),
  '1209456549512345',
);
assert.equal(
  parseAsanaTaskGidFromLink('https://app.asana.com/0/1208704092427502/1209456549512345/1209456549512345'),
  '1209456549512345',
);
assert.equal(
  parseAsanaTaskGidFromLink('https://app.asana.com/1/6649488167653/project/1208704092427502/task/1209456549512345'),
  '1209456549512345',
);
assert.equal(
  parseAsanaTaskGidFromLink('https://app.asana.com/0/inbox/111/list/1209456549512345'),
  '1209456549512345',
);
assert.equal(
  parseAsanaTaskGidFromLink('https://app.asana.com/0/1208704092427502/list?focus=1209456549512345'),
  '1209456549512345',
);

assert.equal(isAsanaChatStory({ type: 'system', resource_subtype: 'assigned' }), false);
assert.equal(isAsanaChatStory({ type: 'comment', resource_subtype: 'comment_added' }), true);
assert.equal(
  asanaStoryToComment({
    gid: 's1',
    type: 'system',
    resource_subtype: 'added_to_project',
    text: 'added this task',
  }),
  null,
);
assert.deepEqual(
  asanaStoryToComment({
    gid: 's2',
    created_at: '2026-08-21T01:00:00.000Z',
    created_by: { name: 'Mak Wai Ki' },
    type: 'comment',
    resource_subtype: 'comment_added',
    text: '已跟進客戶',
  }),
  {
    id: 's2',
    createdAt: '2026-08-21T01:00:00.000Z',
    authorName: 'Mak Wai Ki',
    text: '已跟進客戶',
    attachments: [],
  },
);
assert.deepEqual(
  asanaStoryToComment({
    gid: 's3',
    created_at: '2026-08-21T02:00:00.000Z',
    created_by: { name: 'Spare - BWL OB Marketing' },
    type: 'comment',
    resource_subtype: 'comment_added',
    text: '',
    attachments: [
      {
        gid: 'att1',
        name: 'brief.pdf',
        created_at: '2026-08-21T02:00:00.000Z',
        size: 2048,
        download_url: 'https://example.com/brief.pdf',
      },
    ],
  }),
  {
    id: 's3',
    createdAt: '2026-08-21T02:00:00.000Z',
    authorName: 'Spare - BWL OB Marketing',
    text: '',
    attachments: [
      {
        gid: 'att1',
        name: 'brief.pdf',
        createdAt: '2026-08-21T02:00:00.000Z',
        resourceSubtype: undefined,
        size: 2048,
        downloadUrl: 'https://example.com/brief.pdf',
        viewUrl: null,
        permanentUrl: null,
        host: null,
      },
    ],
  },
);
assert.equal(stripAsanaHtml('<BODY><p>你好<br>世界</p></BODY>'), '你好\n世界');

const mapped = mapAsanaAttachment({
  gid: 'img1',
  name: 'shot.PNG',
  download_url: 'https://example.com/shot.png',
  size: 1536,
});
assert.equal(mapped?.name, 'shot.PNG');
assert.equal(isImageAttachment(mapped!), true);
assert.equal(formatAttachmentSize(1536), '1.5 KB');
assert.equal(attachmentOpenUrl(mapped!), 'https://example.com/shot.png');
assert.equal(mapAsanaAttachment({ name: 'missing-gid.png' }), null);

const followTab = readFileSync(
  new URL('../src/components/quotation/PitchingFollowUpsTab.tsx', import.meta.url),
  'utf8',
);
assert.match(followTab, /fetchAsanaTaskStories/);
assert.match(followTab, /Asana 任務留言/);
assert.match(followTab, /任務附件/);
assert.match(followTab, /留言附件/);
assert.match(followTab, /downloadAsanaAttachment/);

const detail = readFileSync(
  new URL('../src/components/quotation/PitchingModule.tsx', import.meta.url),
  'utf8',
);
assert.match(detail, /PitchingFollowUpsTab/);
assert.doesNotMatch(detail, /暫無跟進記錄/);

const edge = readFileSync(
  new URL('../supabase/functions/asana-task-stories/index.ts', import.meta.url),
  'utf8',
);
assert.match(edge, /quotation_client_project/);
assert.match(edge, /asana_link/);
assert.match(edge, /listTaskStories/);
assert.match(edge, /listTaskAttachments/);
assert.match(edge, /attachments/);

const downloadEdge = readFileSync(
  new URL('../supabase/functions/asana-attachment-download/index.ts', import.meta.url),
  'utf8',
);
assert.match(downloadEdge, /getAttachment/);
assert.match(downloadEdge, /download_url/);

const api = readFileSync(
  new URL('../src/lib/asanaPitchingApi.ts', import.meta.url),
  'utf8',
);
assert.match(api, /asana-attachment-download/);
assert.match(api, /downloadAsanaAttachment/);

console.log('asana task link: ok');
