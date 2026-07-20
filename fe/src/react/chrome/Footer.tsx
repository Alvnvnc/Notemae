/* Colophon (footer). Chrome yang menetap di semua rute. */
import { Link } from "react-router";
import { useT } from "../i18n.tsx";

export function Footer() {
  const t = useT();
  return (
    <footer className="colophon" id="colophon">
      <div className="colophon__grid">
        <div className="colophon__brand">
          <span className="wordmark wordmark--foot">ScentSphere<em>dupe guide</em></span>
          <p>{t("footer.description")}</p>
        </div>
        <nav className="colophon__nav" aria-label={t("footer.description")}>
          <Link to="/katalog">{t("nav.catalog")}</Link>
          <Link to="/#pasangan">{t("footer.pairs")}</Link>
          <Link to="/konsultan">{t("footer.consultant")}</Link>
        </nav>
        <div className="colophon__legal">
          <p>{t("footer.legal")}</p>
          <p>{t("footer.data")}</p>
        </div>
      </div>
    </footer>
  );
}
