import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, Play } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onRunInSandbox?: (code: string, language: string) => void;
}

function CodeBlock({
  language,
  code,
  onRunInSandbox,
}: {
  language: string;
  code: string;
  onRunInSandbox?: (code: string, language: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked
    }
  };

  const canRun =
    onRunInSandbox &&
    ['js', 'javascript', 'ts', 'typescript', 'html'].includes(
      language.toLowerCase(),
    );

  return (
    <div
      className="my-3 w-full max-w-full min-w-0 rounded-lg overflow-hidden border text-xs"
      style={{
        borderColor: 'var(--app-border-color)',
        backgroundColor: '#090d16',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b text-slate-300"
        style={{
          borderColor: 'var(--app-border-color)',
          backgroundColor: '#111827',
        }}
      >
        <span className="font-mono text-[11px] text-slate-400">
          {language || 'code'}
        </span>
        <div className="flex items-center gap-2">
          {canRun && (
            <button
              type="button"
              onClick={() => onRunInSandbox(code, language)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors whitespace-nowrap"
            >
              <Play className="w-3 h-3" />
              Run in Sandbox
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 text-[11px] transition-colors whitespace-nowrap"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" /> Copy
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="p-3 w-full max-w-full overflow-x-auto text-slate-100 leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({
  content,
  onRunInSandbox,
}: MarkdownRendererProps) {
  return (
    <div className="prose-sm w-full min-w-0 max-w-none leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold mt-3 mb-2 font-display">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mt-3 mb-1.5 font-display">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-2.5 mb-1 font-display">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-2.5 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-2.5 space-y-1">{children}</ol>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 text-blue-400 hover:text-blue-300 [overflow-wrap:anywhere]"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="my-2 px-3 py-2 rounded-md border text-sm opacity-90"
              style={{
                borderColor: 'var(--app-border-color)',
                backgroundColor: 'var(--app-elevated-bg)',
              }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table
                className="w-full text-xs border-collapse border"
                style={{ borderColor: 'var(--app-border-color)' }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className="px-2.5 py-1.5 text-left font-semibold border"
              style={{
                borderColor: 'var(--app-border-color)',
                backgroundColor: 'var(--app-elevated-bg)',
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className="px-2.5 py-1.5 border"
              style={{ borderColor: 'var(--app-border-color)' }}
            >
              {children}
            </td>
          ),
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children).replace(/\n$/, '');
            if (match || text.includes('\n')) {
              return (
                <CodeBlock
                  language={match?.[1] ?? 'text'}
                  code={text}
                  onRunInSandbox={onRunInSandbox}
                />
              );
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded text-[12px] font-mono [overflow-wrap:anywhere]"
                style={{ backgroundColor: 'var(--app-elevated-bg)' }}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
