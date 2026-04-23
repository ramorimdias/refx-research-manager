import { siteLinks, windowsDownload } from './config'
import './styles.css'

type Page = 'home' | 'download' | 'tutorials' | 'about' | 'privacy' | 'terms' | 'support'

const root = document.getElementById('site')
if (!root) throw new Error('Missing site root')

const page = (root.dataset.page ?? 'home') as Page

function nav() {
  return `
    <header class="site-header">
      <a class="brand" href="${siteLinks.home}" aria-label="Refx home">
        <span class="brand-mark">R</span>
        <span>Refx</span>
      </a>
      <nav>
        <a href="${siteLinks.download}">Download</a>
        <a href="${siteLinks.tutorials}">Tutorials</a>
        <a href="${siteLinks.about}">Who we are</a>
      </nav>
    </header>
  `
}

function footer() {
  return `
    <footer class="site-footer">
      <div>
        <strong>Refx</strong>
        <span>Desktop-first research management for focused writing.</span>
      </div>
      <nav>
        <a href="${siteLinks.download}">Download</a>
        <a href="${siteLinks.tutorials}">Tutorials</a>
        <a href="${siteLinks.support}">Support</a>
        <a href="${siteLinks.privacy}">Privacy</a>
        <a href="${siteLinks.terms}">Terms</a>
      </nav>
    </footer>
  `
}

function shell(content: string) {
  return `
    ${nav()}
    ${content}
    ${footer()}
  `
}

function homePage() {
  return shell(`
    <main>
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow">Research without the paper chase</span>
          <h1>A calm desktop home for papers, references, notes, maps, and writing.</h1>
          <p>
            Refx helps researchers keep their library close, connect ideas visually, and move from reading to writing without losing the thread.
          </p>
          <div class="cta-row">
            <a class="button primary" href="${siteLinks.download}">Download Refx</a>
            <a class="button secondary" href="${siteLinks.tutorials}">Explore workflows</a>
          </div>
        </div>
        <div class="hero-panel" aria-label="Refx workflow preview">
          <div class="orbital-card main-card">
            <span>Journal of Energy Storage</span>
            <strong>Thermal strategy for lithium-ion battery packs</strong>
            <small>DOI · Notes · Citations · Map</small>
          </div>
          <div class="orbit orbit-one">References</div>
          <div class="orbit orbit-two">Notes</div>
          <div class="orbit orbit-three">Word</div>
        </div>
      </section>

      <section class="section-grid">
        <article>
          <span class="card-icon">01</span>
          <h2>Collect and clean your library</h2>
          <p>Bring PDFs into a local-first workspace, improve metadata, track DOI gaps, and keep research material organized by library and work.</p>
        </article>
        <article>
          <span class="card-icon">02</span>
          <h2>Make references usable</h2>
          <p>Attach references to your own works, reorder them intentionally, and prepare the bibliography path before the writing sprint begins.</p>
        </article>
        <article>
          <span class="card-icon">03</span>
          <h2>Think in maps</h2>
          <p>Use visual maps and discovery journeys to explore how papers relate, where citations lead, and what deserves your attention next.</p>
        </article>
      </section>

      <section class="split-section">
        <div>
          <span class="eyebrow">Write with Refx in Word</span>
          <h2>Citations that can be refreshed instead of babysat.</h2>
          <p>
            The Refx Word add-in is a companion to the desktop app. Select one of your Refx works, insert citations from its references, refresh numbering, and rebuild the reference table as your draft changes.
          </p>
          <p class="note">The add-in is not standalone: keep Refx desktop open so Word can connect to the local companion bridge.</p>
        </div>
        <div class="workflow-card">
          <div><strong>1</strong><span>Choose My Work</span></div>
          <div><strong>2</strong><span>Insert references</span></div>
          <div><strong>3</strong><span>Refresh citations</span></div>
          <div><strong>4</strong><span>Rebuild bibliography</span></div>
        </div>
      </section>

      <section class="feature-band">
        <h2>Built for the messy middle of research.</h2>
        <div class="feature-list">
          <span>PDF library</span>
          <span>Metadata cleanup</span>
          <span>My Works</span>
          <span>Reference ordering</span>
          <span>Notes and comments</span>
          <span>Discovery maps</span>
          <span>Word companion</span>
        </div>
      </section>
    </main>
  `)
}

function downloadPage() {
  return shell(`
    <main>
      <section class="page-hero compact">
        <span class="eyebrow">Download</span>
        <h1>Install Refx for Windows.</h1>
        <p>Start with the desktop app. The Word add-in works as a companion and reads your local Refx references while the desktop app is open.</p>
        <div class="cta-row">
          <a class="button primary" href="${windowsDownload.url}" rel="noopener noreferrer">${windowsDownload.label}</a>
          <span class="release-pill">${windowsDownload.versionLabel}</span>
        </div>
      </section>

      <section class="download-grid">
        <article class="download-card primary-card">
          <h2>Windows</h2>
          <p>Recommended for current beta testing and Word companion workflows.</p>
          <a class="button primary" href="${windowsDownload.url}" rel="noopener noreferrer">Get Windows installer</a>
        </article>
        <article class="download-card muted-card">
          <h2>macOS</h2>
          <p>Coming later. The current public download focus is Windows.</p>
        </article>
        <article class="download-card muted-card">
          <h2>Linux</h2>
          <p>Planned placeholder. Packaging and support details are not finalized.</p>
        </article>
      </section>

      <section class="split-section">
        <div>
          <h2>Install notes</h2>
          <p>Download the latest release, run the installer, open Refx, and let your local library load before using companion integrations.</p>
        </div>
        <div class="workflow-card">
          <div><strong>1</strong><span>Install Refx desktop</span></div>
          <div><strong>2</strong><span>Add documents and references</span></div>
          <div><strong>3</strong><span>Open Word add-in</span></div>
          <div><strong>4</strong><span>Insert and refresh citations</span></div>
        </div>
      </section>
    </main>
  `)
}

function tutorialsPage() {
  const cards = [
    ['Getting started', 'Create your first library and import documents.'],
    ['Adding documents', 'Understand PDFs, metadata, DOI checks, and cleanup.'],
    ['Managing references', 'Attach references to My Works and keep them ordered.'],
    ['Using Refx with Word', 'Connect Word to Refx desktop and insert citations.'],
    ['Bibliography refresh', 'Refresh citation numbers and rebuild the reference table.'],
  ]
  return shell(`
    <main>
      <section class="page-hero compact">
        <span class="eyebrow">Tutorials · WIP</span>
        <h1>Guides are being shaped around real research workflows.</h1>
        <p>This section is intentionally scaffolded now so tutorials can grow without changing the site structure later.</p>
      </section>
      <section class="section-grid tutorial-grid">
        ${cards.map(([title, body]) => `
          <article>
            <span class="status-pill">WIP</span>
            <h2>${title}</h2>
            <p>${body}</p>
          </article>
        `).join('')}
      </section>
    </main>
  `)
}

function aboutPage() {
  return shell(`
    <main>
      <section class="page-hero compact">
        <span class="eyebrow">Who we are · WIP</span>
        <h1>Refx is being built for researchers who want tools that respect their attention.</h1>
        <p>The full story, mission, philosophy, and team notes will live here. For now, this page marks the direction: local-first, practical, careful software for long research projects.</p>
      </section>
      <section class="section-grid">
        <article>
          <h2>Mission</h2>
          <p>Make research workflows feel coherent from reading to writing.</p>
        </article>
        <article>
          <h2>Philosophy</h2>
          <p>Prefer user control, local data, transparent metadata, and tools that reduce cognitive drag.</p>
        </article>
        <article>
          <h2>Team</h2>
          <p>Reserved for the people and collaborators behind Refx.</p>
        </article>
      </section>
    </main>
  `)
}

function privacyPage() {
  return shell(`
    <main>
      <section class="page-hero compact">
        <span class="eyebrow">Privacy · Draft</span>
        <h1>Privacy information for the current Refx beta.</h1>
        <p>Refx is desktop-first. The Word add-in reads reference metadata from the local Refx desktop companion bridge and stores citation state inside the Word document.</p>
      </section>
      <section class="split-section">
        <div>
          <h2>Current model</h2>
          <p>The Word add-in does not require a cloud account in the current beta architecture and does not send document contents to a Refx cloud service.</p>
        </div>
        <div class="workflow-card">
          <div><strong>1</strong><span>Local desktop app</span></div>
          <div><strong>2</strong><span>Local bridge</span></div>
          <div><strong>3</strong><span>Word document state</span></div>
          <div><strong>4</strong><span>No standalone cloud backend</span></div>
        </div>
      </section>
    </main>
  `)
}

function termsPage() {
  return shell(`
    <main>
      <section class="page-hero compact">
        <span class="eyebrow">Terms · Draft</span>
        <h1>Terms scaffolding for Refx public beta.</h1>
        <p>Refx for Word is provided as a companion to the Refx desktop app. Users should review citation and bibliography output before submission.</p>
      </section>
      <section class="section-grid">
        <article><h2>Companion requirement</h2><p>The Word add-in needs Refx desktop running locally for full functionality.</p></article>
        <article><h2>Beta scope</h2><p>Some pages and platform packages are still being prepared.</p></article>
        <article><h2>Review required</h2><p>Replace this scaffold with final legal terms before public Marketplace submission.</p></article>
      </section>
    </main>
  `)
}

function supportPage() {
  return shell(`
    <main>
      <section class="page-hero compact">
        <span class="eyebrow">Support</span>
        <h1>Help for Refx and the Word companion add-in.</h1>
        <p>If the Word add-in says Refx is disconnected, open Refx desktop, wait for the library to load, then click Sync Refx in Word.</p>
      </section>
      <section class="section-grid">
        <article><h2>Disconnected bridge</h2><p>Refx desktop must be open on the same computer. The add-in connects to the local bridge at 127.0.0.1.</p></article>
        <article><h2>Missing references</h2><p>Choose the correct My Work and confirm its references are attached inside Refx.</p></article>
        <article><h2>Citation repair</h2><p>Use Refresh citations first. If the document was edited heavily, use Repair.</p></article>
      </section>
    </main>
  `)
}

const pages: Record<Page, () => string> = {
  home: homePage,
  download: downloadPage,
  tutorials: tutorialsPage,
  about: aboutPage,
  privacy: privacyPage,
  terms: termsPage,
  support: supportPage,
}

root.innerHTML = (pages[page] ?? homePage)()
