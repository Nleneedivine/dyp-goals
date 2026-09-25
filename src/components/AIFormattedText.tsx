import { Fragment } from "react";

export const stripAIFormatting = (value: string) =>
  value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .trim();

export function AIFormattedText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g).filter(Boolean);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const boldWithStars = part.startsWith("**") && part.endsWith("**");
        const boldWithUnderscores = part.startsWith("__") && part.endsWith("__");

        if (boldWithStars || boldWithUnderscores) {
          return (
            <strong key={index} className="font-semibold text-primary">
              {part.slice(2, -2)}
            </strong>
          );
        }

        return <Fragment key={index}>{part}</Fragment>;
      })}
    </span>
  );
}
