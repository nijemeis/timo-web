"use client";
import { useI18n } from "@/lib/i18n/client";

/** EN/NL segmented toggle; the choice persists in the `timo_lang` cookie. */
export function LangToggle({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useI18n();
  return (
    <div className="langs" style={style} role="group" aria-label="Language">
      {(["en", "nl"] as const).map((l) => (
        <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
