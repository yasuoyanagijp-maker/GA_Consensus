type Props = {
  label?: string;
};

export function SearchProgress({ label = "Zotero を検索しています…" }: Props) {
  return (
    <div className="search-progress" role="status" aria-live="polite">
      <p className="search-progress__label">{label}</p>
      <div className="progress-bar" aria-hidden="true">
        <div className="progress-bar__indeterminate" />
      </div>
    </div>
  );
}
