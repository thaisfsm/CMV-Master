type BrandLockupProps = { variant?: "hero" | "compact" | "card" };

export function BrandLockup({ variant = "hero" }: BrandLockupProps) {
  return (
    <div className={`brand-lockup brand-lockup--${variant}`} aria-label="CMV Mestre — Implantação e Gestão de CMV para Gastronomia">
      <span className="brand-mark" aria-hidden="true" />
      <span className="wordmark">
        <span className="wordmark-main"><b>CMV</b> <strong>MESTRE</strong></span>
        {variant !== "compact" && <span className="wordmark-tagline">IMPLANTAÇÃO E GESTÃO DE CMV <i /> PARA GASTRONOMIA</span>}
      </span>
    </div>
  );
}
