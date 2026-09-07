export function ProjectPlaceholder({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <p className="text-sm text-foreground">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted">{note}</p>
      </div>
    </div>
  );
}
