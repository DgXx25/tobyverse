"use client";

const URL_SPLIT = /(https?:\/\/[^\s<]+)/gi;

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_SPLIT);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!/^https?:\/\//i.test(part)) return <span key={index}>{part}</span>;
        const href = part.replace(/[),.;!?]+$/g, "");
        const tail = part.slice(href.length);
        return (
          <span key={index}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="chat-link">
              {href}
            </a>
            {tail}
          </span>
        );
      })}
    </span>
  );
}
