import { checkRefxBridge, getBridgeBaseUrl, isMockModeEnabled, searchReferences, searchWorks, type RefxReference, type RefxWork } from '../../api/refxClient'
import { isProductionAddin } from '../../config/environment'
import { createId, insertCitationControl, isWordWebHost } from '../../word/citationControls'
import { runExclusiveDocumentMutation } from '../../word/documentMutationLock'
import { refreshCitations, repairCitationState } from '../../word/refreshCitations'
import type { CitationGroup } from '../../word/types'
import './styles.css'

type AppState = {
  query: string
  workQuery: string
  works: RefxWork[]
  selectedWork: RefxWork | null
  results: RefxReference[]
  status: string
  lastError: string | null
  bridgeOnline: boolean
  mockMode: boolean
  isBusy: boolean
  bibliographyOrder: 'firstAppearance' | 'refxWorkOrder'
  textCitationStyle: 'number' | 'authorYearParen' | 'authorYearComma' | 'author'
  citationContainer: 'square' | 'round' | 'none'
}

const state: AppState = {
  query: '',
  workQuery: '',
  works: [],
  selectedWork: null,
  results: [],
  status: 'Checking Refx bridge...',
  lastError: null,
  bridgeOnline: false,
  mockMode: isMockModeEnabled(),
  isBusy: false,
  bibliographyOrder: 'firstAppearance',
  textCitationStyle: 'number',
  citationContainer: 'square',
}

const appRoot = document.getElementById('app') as HTMLElement | null
if (!appRoot) throw new Error('Missing app root')
const root = appRoot

function sourceSubtitle(reference: RefxReference) {
  return [
    reference.authors.join(', ') || 'Unknown author',
    reference.year ? String(reference.year) : '',
    reference.journal || reference.booktitle || reference.publisher || '',
  ].filter(Boolean).join(' · ')
}

function compactReferenceSubtitle(reference: RefxReference) {
  return [
    reference.authors.join(', ') || 'Unknown author',
    reference.year ? String(reference.year) : '',
  ].filter(Boolean).join(' · ')
}

function workOptionLabel(work: RefxWork) {
  return [
    work.title,
    work.year ? String(work.year) : '',
    `${work.referenceCount} refs`,
  ].filter(Boolean).join(' · ')
}

function setBusy(isBusy: boolean, status?: string) {
  state.isBusy = isBusy
  if (status) state.status = status
  render()
}

function formatTaskpaneError(error: unknown) {
  if (error instanceof Error) {
    const debugInfo = (error as Error & { debugInfo?: unknown }).debugInfo
    return debugInfo
      ? `${error.message} ${JSON.stringify(debugInfo)}`
      : error.message
  }
  return 'Something went wrong.'
}

function isBridgeAction(label: string) {
  return /Refx|bridge|Searching|Loading My Works|Syncing/i.test(label)
}

function isBridgeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /fetch|abort|network|127\.0\.0\.1|38474|bridge/i.test(message)
}

async function runAction<T>(label: string, action: () => Promise<T>): Promise<T | null> {
  try {
    setBusy(true, label)
    const result = await action()
    state.lastError = null
    if (state.status === label) {
      state.status = 'Done.'
    }
    return result
  } catch (error) {
    console.error(label, error)
    if ((isBridgeAction(label) || isBridgeError(error)) && !state.mockMode) {
      state.bridgeOnline = false
    }
    state.lastError = formatTaskpaneError(error)
    state.status = state.lastError
    return null
  } finally {
    state.isBusy = false
    render()
  }
}

async function runWordMutation<T>(label: string, action: () => Promise<T>) {
  await runAction(label, () => runExclusiveDocumentMutation(label, action))
}

async function runSearch() {
  if (!state.selectedWork) {
    state.results = []
    state.status = 'Choose one My Work first. Only that work references are exposed to Word.'
    render()
    return
  }

  await runAction('Searching Refx...', async () => {
    state.results = await searchReferences(state.selectedWork!.id, state.query)
    state.bridgeOnline = !state.mockMode
    state.status = state.bridgeOnline || state.mockMode
      ? `Found ${state.results.length} references.`
      : `Bridge offline. Start Refx desktop before searching references.`
  })
}

async function runWorkSearch() {
  await runAction('Loading My Works...', async () => {
    state.works = await searchWorks('')
    state.bridgeOnline = !state.mockMode
    if (!state.selectedWork && state.works.length === 1) {
      await chooseWork(state.works[0])
    } else if (state.selectedWork) {
      const refreshedSelection = state.works.find((work) => work.id === state.selectedWork?.id)
      if (refreshedSelection) {
        state.selectedWork = refreshedSelection
      }
      state.status = `Synced ${state.works.length} My Works from Refx.`
    } else {
      state.status = `Found ${state.works.length} My Works. Choose the one linked to this Word document.`
    }
  })
}

async function chooseWork(work: RefxWork) {
  state.selectedWork = work
  state.query = ''
  await runSearch()
}

async function syncReferencesFromRefx() {
  await runAction('Syncing Refx references...', async () => {
    state.works = await searchWorks('')
    state.bridgeOnline = !state.mockMode
    if (state.selectedWork) {
      state.selectedWork = state.works.find((work) => work.id === state.selectedWork?.id) ?? state.selectedWork
      state.results = await searchReferences(state.selectedWork.id, state.query)
      state.status = `Synced ${state.results.length} references from Refx.`
      return
    }
    state.status = `Synced ${state.works.length} My Works from Refx. Choose one work.`
  })
}

function setBibliographyOrder(order: AppState['bibliographyOrder']) {
  state.bibliographyOrder = order
  state.status = order === 'refxWorkOrder'
    ? 'Bibliography will follow Refx reference order on refresh.'
    : 'Bibliography will follow first appearance in Word.'
  render()
}

function currentSettingsPatch() {
  return {
    workDocumentId: state.selectedWork?.id,
    workTitle: state.selectedWork?.title,
    bibliographyOrder: state.bibliographyOrder,
    textCitationStyle: state.textCitationStyle,
    citationContainer: state.citationContainer,
  }
}

async function insertReferenceCitation(source: RefxReference) {
  if (!state.selectedWork) {
    state.status = 'Choose one My Work first.'
    render()
    return
  }

  await runWordMutation('Inserting citation...', async () => {
    const group: CitationGroup = {
      id: createId('refx-group'),
      sourceIds: [source.id],
    }
    group.contentControlId = await insertCitationControl(group)
    await refreshCitations({
      rebuildBibliography: false,
      pendingGroups: [{ group, sources: [source] }],
      settingsPatch: currentSettingsPatch(),
    })
    state.status = 'Citation inserted and numbering refreshed.'
  })
}

function renderUnsupportedHost() {
  root.innerHTML = `
    <main class="shell">
      <section class="hero unsupported">
        <div>
          <div class="eyebrow">Refx for Word</div>
          <h1>Desktop Word required</h1>
          <p>This add-in is intentionally enabled only in desktop Word. Word for the web does not reliably support the content-control workflow Refx needs for stable citations, renumbering, and bibliography rebuilds.</p>
        </div>
      </section>
      <section class="panel">
        <div class="section-title">What to do</div>
        <p class="muted">Open this document in Microsoft Word for Windows or macOS, then launch the Refx add-in there. This protects your citation state from the Word web issues that were causing lost references and freezes.</p>
      </section>
    </main>
  `
}

function render() {
  const linkedWorkSummary = state.selectedWork
    ? `${state.selectedWork.title} (${state.selectedWork.referenceCount} references)`
    : 'No My Work selected yet'

  root.innerHTML = `
    <main class="shell">
      <section class="hero">
        <div>
          <div class="eyebrow">Refx for Word</div>
        </div>
        <span class="bridge ${state.bridgeOnline || state.mockMode ? 'online' : 'offline'}">${state.mockMode ? 'Mock' : state.bridgeOnline ? 'Connected' : 'Disconnected'}</span>
      </section>

      ${!state.bridgeOnline && !state.mockMode ? `
        <section class="disconnect-banner" role="status">
          <strong>Refx desktop is not connected.</strong>
          <span>Open Refx on this computer so the Word add-in can load My Works, insert references, and sync bibliography data as intended.</span>
          <ol>
            <li>Open the Refx desktop app.</li>
            <li>Wait for your library to finish loading.</li>
            <li>Return here and click Sync Refx.</li>
          </ol>
          <small>This ${isProductionAddin ? 'hosted' : 'development'} add-in connects to the local companion bridge at ${getBridgeBaseUrl()}.</small>
        </section>
      ` : ''}

      <section class="companion-card">
        <strong>Companion add-in</strong>
        <span>Refx for Word is not standalone. It reads references from the Refx desktop app running on this computer.</span>
        <dl>
          <div>
            <dt>Bridge</dt>
            <dd>${state.bridgeOnline ? 'Connected' : state.mockMode ? 'Mock mode' : 'Disconnected'} - ${getBridgeBaseUrl()}</dd>
          </div>
          <div>
            <dt>Linked work</dt>
            <dd>${linkedWorkSummary}</dd>
          </div>
          ${state.lastError ? `
            <div>
              <dt>Last error</dt>
              <dd>${state.lastError}</dd>
            </div>
          ` : ''}
        </dl>
      </section>

      <section class="panel">
        <div class="work-picker">
          <span class="section-title inline-title">My Work</span>
          <select id="work-select" ${state.isBusy || state.works.length === 0 ? 'disabled' : ''}>
            <option value="">Choose work</option>
            ${state.works.map((work) => `
              <option value="${work.id}" ${state.selectedWork?.id === work.id ? 'selected' : ''}>${workOptionLabel(work)}</option>
            `).join('')}
          </select>
        </div>
        ${state.selectedWork ? `
          <div class="linked-work">
            <strong>${state.selectedWork.title}</strong>
            <span>${sourceSubtitle({ ...state.selectedWork, sourceType: 'work' })} · ${state.selectedWork.referenceCount} references</span>
          </div>
        ` : `<p class="muted">${state.works.length === 0 ? 'No My Work found. Open Refx desktop and click Sync Refx.' : 'Choose one My Work. Word will only see references from that work.'}</p>`}
        <!-- Legacy work list removed; the dropdown above is the single visible picker. -->
        <div hidden>
          ${state.works.map((work) => `
            <button class="work ${state.selectedWork?.id === work.id ? 'active' : ''}" data-work-id="${work.id}">
              <span>${work.title}</span>
              <small>${sourceSubtitle({ ...work, sourceType: 'work' })} · ${work.referenceCount} references</small>
            </button>
          `).join('')}
        </div>
      </section>

      <section class="panel options-panel">
        <div class="section-title">Options</div>
        <label class="option-row">
          <span>Reference table order</span>
          <select id="bibliography-order">
            <option value="firstAppearance" ${state.bibliographyOrder === 'firstAppearance' ? 'selected' : ''}>Text appearance order</option>
            <option value="refxWorkOrder" ${state.bibliographyOrder === 'refxWorkOrder' ? 'selected' : ''}>Refx order</option>
          </select>
        </label>
        <label class="option-row">
          <span>In-text style</span>
          <select id="text-citation-style">
            <option value="number" ${state.textCitationStyle === 'number' ? 'selected' : ''}>Number</option>
            <option value="authorYearParen" ${state.textCitationStyle === 'authorYearParen' ? 'selected' : ''}>Author (Year)</option>
            <option value="authorYearComma" ${state.textCitationStyle === 'authorYearComma' ? 'selected' : ''}>Author, year</option>
            <option value="author" ${state.textCitationStyle === 'author' ? 'selected' : ''}>Author</option>
          </select>
        </label>
        <label class="option-row">
          <span>Container</span>
          <select id="citation-container">
            <option value="square" ${state.citationContainer === 'square' ? 'selected' : ''}>[ ]</option>
            <option value="round" ${state.citationContainer === 'round' ? 'selected' : ''}>( )</option>
            <option value="none" ${state.citationContainer === 'none' ? 'selected' : ''}>None</option>
          </select>
        </label>
      </section>

      <section class="actions">
        <button id="refresh" ${state.isBusy ? 'disabled' : ''}>Refresh citations</button>
        <button id="bibliography" ${state.isBusy ? 'disabled' : ''}>Rebuild table</button>
        <button id="repair" ${state.isBusy ? 'disabled' : ''}>Repair</button>
        <button id="sync-refx" ${state.isBusy || !state.selectedWork ? 'disabled' : ''}>Sync Refx</button>
      </section>

      <section class="status ${state.isBusy ? 'busy' : ''}">${state.status}</section>

      <section class="search reference-search">
        <input id="query" value="${state.query.replace(/"/g, '&quot;')}" placeholder="Search references" />
        <button id="search" ${state.isBusy || !state.selectedWork ? 'disabled' : ''}>Search</button>
      </section>

      <section class="results">
        ${state.results.map((reference) => `
          <article class="result">
            <div class="result-copy">
              <span class="result-title">${reference.title}</span>
              <span class="result-meta">${compactReferenceSubtitle(reference)}</span>
            </div>
            <button class="insert-reference" data-ref-id="${reference.id}" ${state.isBusy ? 'disabled' : ''}>Insert</button>
          </article>
        `).join('')}
      </section>
    </main>
  `

  root.querySelector<HTMLInputElement>('#query')?.addEventListener('input', (event) => {
    state.query = (event.target as HTMLInputElement).value
  })
  root.querySelector<HTMLInputElement>('#query')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void runSearch()
  })
  root.querySelector('#search')?.addEventListener('click', () => void runSearch())
  root.querySelector('#sync-refx')?.addEventListener('click', () => void syncReferencesFromRefx())
  root.querySelector('#refresh')?.addEventListener('click', () => void runWordMutation('Refreshing citations...', async () => {
    const summary = await refreshCitations({
      rebuildBibliography: false,
      settingsPatch: currentSettingsPatch(),
    })
    state.status = `Refreshed ${summary.citationCount} citations from ${summary.sourceCount} sources.`
    return summary
  }))
  root.querySelector('#bibliography')?.addEventListener('click', () => void runWordMutation('Rebuilding bibliography...', async () => {
    const summary = await refreshCitations({
      settingsPatch: currentSettingsPatch(),
    })
    state.status = `Rebuilt reference table with ${summary.sourceCount} sources.`
    return summary
  }))
  root.querySelector('#repair')?.addEventListener('click', () => void runWordMutation('Repairing citation state...', async () => {
    const summary = await repairCitationState(currentSettingsPatch())
    state.status = `Repaired ${summary.citationCount} citations and rebuilt ${summary.sourceCount} sources.`
    return summary
  }))
  root.querySelector<HTMLSelectElement>('#bibliography-order')?.addEventListener('change', (event) => {
    setBibliographyOrder((event.target as HTMLSelectElement).value as AppState['bibliographyOrder'])
  })
  root.querySelector<HTMLSelectElement>('#text-citation-style')?.addEventListener('change', (event) => {
    state.textCitationStyle = (event.target as HTMLSelectElement).value as AppState['textCitationStyle']
    render()
  })
  root.querySelector<HTMLSelectElement>('#citation-container')?.addEventListener('change', (event) => {
    state.citationContainer = (event.target as HTMLSelectElement).value as AppState['citationContainer']
    render()
  })
  root.querySelectorAll<HTMLElement>('.insert-reference').forEach((element) => {
    element.addEventListener('click', () => {
      const reference = state.results.find((item) => item.id === element.dataset.refId)
      if (reference) void insertReferenceCitation(reference)
    })
  })
  root.querySelector<HTMLSelectElement>('#work-select')?.addEventListener('change', (event) => {
    const work = state.works.find((item) => item.id === (event.target as HTMLSelectElement).value)
    if (work) void chooseWork(work)
  })
}

Office.onReady(async () => {
  if (isWordWebHost()) {
    renderUnsupportedHost()
    return
  }

  try {
    await checkRefxBridge()
    state.bridgeOnline = true
    state.status = state.mockMode ? 'Mock mode enabled.' : 'Refx bridge connected.'
  } catch {
    state.bridgeOnline = false
    state.lastError = 'Refx bridge offline.'
    state.status = 'Refx bridge offline. Start Refx desktop, then reopen or refresh this task pane.'
  }
  render()
  if (state.bridgeOnline || state.mockMode) {
    await runWorkSearch()
  }
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled taskpane rejection', event.reason)
  state.isBusy = false
  state.lastError = formatTaskpaneError(event.reason)
  state.status = state.lastError
  render()
})

window.addEventListener('error', (event) => {
  console.error('Unhandled taskpane error', event.error ?? event.message)
  state.isBusy = false
  state.lastError = formatTaskpaneError(event.error ?? new Error(event.message))
  state.status = state.lastError
  render()
})
