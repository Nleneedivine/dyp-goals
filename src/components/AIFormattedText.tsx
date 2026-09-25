import { Fragment } from "react";

const normalizeAIFormatting = (value: string) =>
  value
    .replace(/\\([*_])/g, "$1")
    .replace(/\\`/g, "`");

export const stripAIFormatting = (value: string) =>
  normalizeAIFormatting(value)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^\`]+)`/g, "$1")
    .trim();

export function AIFormattedText({ text, className = "" }: { text: string; className?: string }) {
  const normalized = normalizeAIFormatting(text);
  const parts = normalized.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^\`]+`)/g).filter(Boolean);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const boldWithStars = part.startsWith("**") && part.endsWith("**");
        const boldWithUnderscores = part.startsWith("__") && part.endsWith("__");
        const inlineCode = part.startsWith("`") && part.endsWith("`");

        if (boldWithStars || boldWithUnderscores) {
          return (
            <strong key={index} className="font-semibold text-primary">
              {part.slice(2, -2)}
            </strong>
          );
        }

        if (inlineCode) {
          return <Fragment key={index}>{part.slice(1, -1)}</Fragment>;
        }

        return <Fragment key={index}>{part}</Fragment>;
      })}
    </span>
  );
}
