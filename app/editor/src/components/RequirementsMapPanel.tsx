import { REQUIREMENT_MAP } from "../lib/requirementsMap";
import { useState } from "react";

type Props = {
  currentFile: string | null;
  onSelectFile?: (file: string) => void;
};

export function RequirementsMapPanel({ currentFile, onSelectFile }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="req-panel">
      <h2>課題名</h2>

      {REQUIREMENT_MAP.map((item) => {
        const active = currentFile === item.file;
        return (
          <section key={item.file} className={`req-card${active ? " req-card--active" : ""}`}>
            <div className="req-card__head">
              <button
                type="button"
                className="req-task-btn"
                onClick={() => onSelectFile?.(item.file)}
                title={item.file}
              >
                {item.taskName}
              </button>
              <h3>{item.chapterTitle}</h3>
              <code>{item.file}</code>
            </div>

            <p className="small req-label">対応課題</p>
            <ul className="req-list">
              {item.matchedIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>

            <p className="small req-label">合意形成を目指す事項</p>
            <ol className="req-list req-list--ordered">
              {item.expectedConsensusStatements.map((cs) => (
                <li key={cs}>{cs}</li>
              ))}
            </ol>

            <p className="small req-label">下位項目（クリックで詳細）</p>
            <ul className="req-list">
              {item.subItems.map((s, idx) => {
                const key = `${item.file}-${idx}`;
                const open = !!expanded[key];
                return (
                  <li key={key} className="req-subitem">
                    <button
                      type="button"
                      className="req-subitem__btn"
                      onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                    >
                      {open ? "▼" : "▶"} {s.title}
                    </button>
                    {open && (
                      <div className="req-subitem__detail">
                        <p>
                          <strong>誰の課題か (Whose problem?)</strong>: {s.whoseProblem.join(" / ")}
                        </p>
                        <p>
                          <strong>課題の要因 (Cause)</strong>: {s.cause}
                        </p>
                        <p>
                          <strong>解決方針 (Possible solutions)</strong>: {s.possibleSolutions}
                        </p>
                        <p>
                          <strong>検討事項 (Future perspective)</strong>: {s.futurePerspective}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
