import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const sample = `## 診斷

正文說明。

| 項目 | 內容 |
|------|------|
| 活動 | Test |

1. 先加負面
2. 再調預算

重點 **$991.22** 與 \`(M05) campaign\`。
`;

const html = renderToStaticMarkup(
  createElement(Markdown, { remarkPlugins: [remarkGfm] }, sample),
);

assert.match(html, /<h2>/, 'headings should render');
assert.match(html, /<p>/, 'body paragraphs should render');
assert.match(html, /<table>/, 'GFM tables should render');
assert.match(html, /<ol>/, 'numbered lists should render');
assert.match(html, /<strong>/, 'bold should render');
assert.match(html, /<code>/, 'inline code should render');
assert.doesNotMatch(html, /## 診斷/, 'raw markdown markers should not remain');

console.log('advisor markdown render ok');
