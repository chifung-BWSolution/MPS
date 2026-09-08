import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

type AdvisorMarkdownProps = {
  content: string;
  className?: string;
};

const headingClass =
  'mb-1.5 mt-3 text-[13px] font-semibold leading-snug text-slate-900 first:mt-0';

export function AdvisorMarkdown({ content, className }: AdvisorMarkdownProps) {
  return (
    <div className={cn('min-w-0 break-words [overflow-wrap:anywhere] text-[13px] leading-relaxed text-slate-800', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrlTransform}
        components={{
          h1: ({ children }) => <h2 className={headingClass}>{children}</h2>,
          h2: ({ children }) => <h2 className={headingClass}>{children}</h2>,
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2.5 text-[13px] font-semibold leading-snug text-slate-800 first:mt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1 mt-2 text-[13px] font-medium leading-snug text-slate-800 first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-1.5 list-disc space-y-1 break-words pl-4 first:mt-0 last:mb-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 list-decimal space-y-1 break-words pl-4 first:mt-0 last:mb-0">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="min-w-0 break-words leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          hr: () => <hr className="my-2.5 border-slate-200" />,
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 border-teal-300 pl-2.5 text-slate-600">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-teal-700 underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ children, className: codeClass }) => {
            const isBlock = Boolean(codeClass);
            return (
              <code
                className={cn(
                  'font-mono text-[12px] text-slate-800',
                  isBlock
                    ? codeClass
                    : 'whitespace-pre-wrap break-all rounded bg-slate-200/80 px-1 py-0.5',
                )}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md bg-slate-100 px-2 py-1.5 text-[12px] leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-md border border-[rgba(13,26,45,0.08)]">
              <table className="w-full min-w-[220px] border-collapse text-[12px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/80">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5 text-left font-medium text-slate-500">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-t border-slate-100 px-2 py-1.5 align-top text-slate-800">{children}</td>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

function safeUrlTransform(url: string): string {
  const next = defaultUrlTransform(url);
  const lower = next.trim().toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return '';
  }
  return next;
}
