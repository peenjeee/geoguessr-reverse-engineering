import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import extensionIcon from "../../icons/icon128.png";
import heroImage from "../../images/hero.png";
import imageOne from "../../images/image1.png";
import imageTwo from "../../images/image2.png";
import imageThree from "../../images/image3.png";
import "./styles.css";

const features = [
  ["Place exact", "Drop the pin on the captured round location."],
  ["Place nearby", "Choose a score range and place close enough."],
  ["Refresh map", "Preview the round location inside the popup."]
];

const repoUrl = "https://github.com/peenjeee/geoguessr-reverse-engineering";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .5A11.5 11.5 0 0 0 8.36 22.9c.58.1.79-.25.79-.56v-2.02c-3.22.7-3.9-1.38-3.9-1.38-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.57-.3-5.28-1.29-5.28-5.73 0-1.27.45-2.3 1.2-3.12-.12-.29-.52-1.48.11-3.08 0 0 .98-.31 3.2 1.2A11.1 11.1 0 0 1 12 6.04c.99 0 1.98.13 2.9.39 2.22-1.51 3.2-1.2 3.2-1.2.63 1.6.23 2.79.11 3.08.75.82 1.2 1.85 1.2 3.12 0 4.45-2.71 5.43-5.3 5.72.42.36.79 1.08.79 2.18v3.01c0 .31.2.67.8.56A11.5 11.5 0 0 0 12 .5Z"
      />
    </svg>
  );
}

function App() {
  const brandIcon = <img className="brand-icon" src={extensionIcon} alt="" />;
  const [showBackTop, setShowBackTop] = useState(false);

  useEffect(() => {
    const updateBackTop = () => setShowBackTop(window.scrollY > 280);

    updateBackTop();
    window.addEventListener("scroll", updateBackTop, { passive: true });
    return () => window.removeEventListener("scroll", updateBackTop);
  }, []);

  return (
    <main id="top">
      <section className="hero" style={{ "--hero-image": `url(${heroImage})` }}>
        <nav className="nav" aria-label="Primary">
          <a className="brand" href="#top" aria-label="PNJ GeoGuessr Tools">
            {brandIcon}
            <span>PNJ GeoGuessr Tools</span>
          </a>
          <div className="nav-actions">
            <a className="github-link" href={repoUrl} target="_blank" rel="noreferrer">
              <GitHubIcon />
              <span>Star this project</span>
            </a>
            <a className="github-link" href={`${repoUrl}/fork`} target="_blank" rel="noreferrer">
              <GitHubIcon />
              <span>Fork this project</span>
            </a>
          </div>
        </nav>

        <div className="hero-copy">
          <p className="eyebrow">Chrome extension helper</p>
          <h1>PNJ GeoGuessr Tools</h1>
          <p className="lead">
            A fast GeoGuessr helper with exact placement, adjustable nearby
            score range, and a map preview built into the popup.
          </p>
          <div className="actions">
            <a className="button primary" href="https://github.com/peenjeee/geoguessr-reverse-engineering/releases">
              Download
            </a>
            <a className="button secondary" href={repoUrl}>
              Source
            </a>
          </div>
        </div>

        <div className="product-shot" aria-label="Extension preview">
          <img src={imageOne} alt="PNJ GeoGuessr Tools popup preview" />
        </div>
      </section>

      <section className="feature-band" aria-label="Features">
        {features.map(([title, text]) => (
          <article className="feature" key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="gallery" aria-label="Screenshots">
        <img src={imageOne} alt="PNJ GeoGuessr Tools popup screenshot" />
        <img src={imageTwo} alt="PNJ GeoGuessr Tools range screenshot" />
        <img src={imageThree} alt="PNJ GeoGuessr Tools map screenshot" />
      </section>

      <section id="install" className="install">
        <div>
          <p className="eyebrow">Manual install</p>
          <h2>Load unpacked in Chrome</h2>
        </div>
        <ol>
          <li>Download and extract the release ZIP.</li>
          <li>Open chrome://extensions.</li>
          <li>Enable Developer mode.</li>
          <li>Click Load unpacked and select the extracted folder.</li>
        </ol>
      </section>

      <footer className="site-footer">
        <div>
          <a className="footer-brand" href="#top">
            {brandIcon}
            <span>PNJ GeoGuessr Tools</span>
          </a>
          <p>Chrome extension helper for faster GeoGuessr rounds.</p>
        </div>
        <div className="footer-links">
          <a href={`${repoUrl}/releases`}>Download</a>
          <a href={repoUrl}>GitHub</a>
          <a href={`${repoUrl}/fork`}>Fork</a>
        </div>
        <small>©2026 PNJ GeoGuessr Tools.</small>
      </footer>

      {showBackTop && (
        <a className="back-top" href="#top" aria-label="Back to top">
          ↑
        </a>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
