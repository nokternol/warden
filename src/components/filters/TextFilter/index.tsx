// ─── TextFilter — a free-text rule (a `string` rule with no fixed options) ───

export function TextFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <input
      type="text"
      aria-label={label}
      placeholder={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="px-2.5 py-1 rounded-md text-xs bg-surface-bg border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary w-36"
    />
  );
}
