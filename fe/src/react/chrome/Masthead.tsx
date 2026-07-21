/* Header tetap: wordmark, navigasi, tombol pencarian, pengalih bahasa.

   Status aktif nav dari NavLink (aria-current otomatis). Pengalih bahasa
   memanggil setLocale; seluruh pohon React re-render lewat useLocale. */
import { Link, NavLink } from "react-router";
import { setLocale, useLocale, useT } from "../i18n.tsx";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function Masthead({ onSearch }: { onSearch: () => void }) {
  const t = useT();
  const locale = useLocale();
  return (
    <header className="masthead" id="masthead">
      <Link className="wordmark" to="/" aria-label="Notemae, home">
        Notemae<em>dupe guide</em>
      </Link>
      <nav className="masthead__nav" aria-label="Main navigation">
        <NavLink className="nav-link" to="/katalog">{t("nav.catalog")}</NavLink>
        <NavLink className="nav-link" to="/konsultan">{t("nav.consultant")}</NavLink>
        <button className="nav-search" id="nav-search" type="button" aria-label={t("nav.search")} onClick={onSearch}>
          <SearchIcon />
          <span>{t("nav.search")}</span>
        </button>
        <div className="locale-switch" role="group" aria-label="Language">
          <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
          <span aria-hidden="true">/</span>
          <button type="button" aria-pressed={locale === "id"} onClick={() => setLocale("id")}>ID</button>
        </div>
      </nav>
    </header>
  );
}
