'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, ChevronLeft, Lightbulb, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { APP_TOUR_STEPS, type AppTourDynamicPath, type AppTourPlacement } from '@/lib/app-tour'
import { translate, type AppLocale, useLocale } from '@/lib/localization'
import { useDocumentStore } from '@/lib/stores/document-store'
import { cn } from '@/lib/utils'

type AppTourContextValue = {
  isOpen: boolean
  startAppTour: () => void
  closeAppTour: () => void
  nextTourStep: () => void
  previousTourStep: () => void
  skipAppTour: () => void
}

type AppTourProviderProps = {
  children: React.ReactNode
  enabled: boolean
  shouldAutostart: boolean
  onTourCompleted: () => Promise<void> | void
}

type SpotlightRect = {
  top: number
  left: number
  width: number
  height: number
}

const TARGET_SELECTOR_PREFIX = '[data-tour-id="'
const TARGET_WAIT_TIMEOUT_MS = 2400
const BALLOON_WIDTH = 360
const VIEWPORT_PADDING = 24
const GAP = 18

const APP_TOUR_TRANSLATIONS: Partial<Record<AppLocale, Record<string, string>>> = {
  'pt-BR': {
    'tour.steps.navigatorOverview.title': 'Navegador principal',
    'tour.steps.navigatorOverview.body': 'Este menu à esquerda é o navegador principal do app e dá acesso rápido a cada área importante.',
    'tour.steps.homeOverview.title': 'Tela inicial',
    'tour.steps.homeOverview.body': 'Aqui você encontra suas bibliotecas, atividade recente e documentos abertos recentemente.',
    'tour.steps.searchOverview.title': 'Página de busca',
    'tour.steps.searchOverview.body': 'Use a busca simples para pesquisas rápidas, a busca complexa para lógica em grupos e as opções para refinar os resultados.',
    'tour.steps.librariesToolbar.title': 'Controles da biblioteca',
    'tour.steps.librariesToolbar.body': 'Crie bibliotecas, importe PDFs, registre livros físicos, troque de biblioteca e ajuste a visualização do espaço.',
    'tour.steps.librariesImport.title': 'Importar documentos',
    'tour.steps.librariesImport.body': 'Use este botão para importar documentos PDF para a biblioteca atual.',
    'tour.steps.librariesPhysicalBook.title': 'Adicionar livro físico',
    'tour.steps.librariesPhysicalBook.body': 'Use esta opção para registrar um livro físico e guardar notas mesmo sem arquivo PDF.',
    'tour.steps.librariesViews.title': 'Modos de visualização da biblioteca',
    'tour.steps.librariesViews.body': 'Alterne entre tabela, grade e lista dependendo de como deseja navegar pela biblioteca atual.',
    'tour.steps.librariesList.title': 'Conteúdo da biblioteca',
    'tour.steps.librariesList.body': 'Esta área mostra o conteúdo da biblioteca ativa com ordenação, filtros e ações sobre os documentos.',
    'tour.steps.documentDetailsInformation.title': 'Editar detalhes: informação',
    'tour.steps.documentDetailsInformation.body': 'Aqui você edita as informações principais do documento, incluindo título, autores, ano, estado de leitura e resumo.',
    'tour.steps.documentDetailsTags.title': 'Editar detalhes: tags',
    'tour.steps.documentDetailsTags.body': 'Use a seção de tags para adicionar tags próprias, revisar sugestões e classificar o documento do seu jeito.',
    'tour.steps.documentDetailsReferences.title': 'Editar detalhes: referências',
    'tour.steps.documentDetailsReferences.body': 'A área de referências mostra links de entrada e saída para revisar como este documento se conecta ao resto da biblioteca.',
    'tour.steps.documentDetailsMetadata.title': 'Buscar metadados online',
    'tour.steps.documentDetailsMetadata.body': 'Use esta ação para consultar provedores online e preencher metadados ausentes com informações mais limpas.',
    'tour.steps.commentsOverview.title': 'Comentários do documento',
    'tour.steps.commentsOverview.body': 'Esta página de comentários é onde você escreve o comentário geral do documento usando as notas salvas como apoio.',
    'tour.steps.readerHighlights.title': 'Destaques no leitor',
    'tour.steps.readerHighlights.body': 'No leitor de PDF você pode destacar trechos diretamente na página e trabalhar dentro do documento.',
    'tour.steps.readerNotes.title': 'Notas no leitor',
    'tour.steps.readerNotes.body': 'Adicione notas diretamente no leitor e prenda cada uma ao ponto exato da leitura.',
    'tour.steps.readerSearch.title': 'Busca no leitor',
    'tour.steps.readerSearch.body': 'Use a busca do leitor para encontrar texto dentro do documento e navegar entre as ocorrências.',
    'tour.steps.referencesWork.title': 'Minhas referências',
    'tour.steps.referencesWork.body': 'Você pode adicionar seus trabalhos aqui e gerenciar as referências ligadas a eles.',
    'tour.steps.notesListOverview.title': 'Notas de todos os documentos',
    'tour.steps.notesListOverview.body': 'Esta lista reúne notas de todos os documentos para você revisar tudo em um só lugar antes de editar a nota selecionada.',
    'tour.steps.notesOverview.title': 'Notas',
    'tour.steps.notesOverview.body': 'Aqui você pode gerenciar suas notas e editá-las na hora.',
    'tour.steps.mapsOverview.title': 'Mapas',
    'tour.steps.mapsOverview.body': 'Crie conexões visuais e relacionamentos entre artigos, documentos e seus próprios trabalhos.',
    'tour.steps.metadataOverview.title': 'Metadados',
    'tour.steps.metadataOverview.body': 'Importe metadados da web e gerencie informações ausentes dos documentos da sua biblioteca.',
    'tour.steps.settingsOptions.title': 'Opções de configurações',
    'tour.steps.settingsOptions.body': 'Estas seções agrupam as principais preferências do app, da configuração geral até aparência, processamento, dados e sobre.',
  },
  fr: {
    'tour.steps.navigatorOverview.title': 'Navigateur principal',
    'tour.steps.navigatorOverview.body': 'Ce menu à gauche est le navigateur principal de l’application et donne un accès rapide à chaque zone importante.',
    'tour.steps.homeOverview.title': 'Écran d’accueil',
    'tour.steps.homeOverview.body': 'Vous y trouvez vos bibliothèques, l’activité récente et les documents ouverts récemment.',
    'tour.steps.searchOverview.title': 'Page de recherche',
    'tour.steps.searchOverview.body': 'Utilisez la recherche simple pour aller vite, la recherche complexe pour la logique par groupes et les options pour affiner les résultats.',
    'tour.steps.librariesToolbar.title': 'Contrôles de la bibliothèque',
    'tour.steps.librariesToolbar.body': 'Créez des bibliothèques, importez des PDF, enregistrez des livres papier, changez de bibliothèque et ajustez l’affichage.',
    'tour.steps.librariesImport.title': 'Importer des documents',
    'tour.steps.librariesImport.body': 'Utilisez ce bouton pour importer des documents PDF dans la bibliothèque actuelle.',
    'tour.steps.librariesPhysicalBook.title': 'Ajouter un livre papier',
    'tour.steps.librariesPhysicalBook.body': 'Utilisez cette option pour enregistrer un livre papier et conserver des notes même sans fichier PDF.',
    'tour.steps.librariesViews.title': 'Modes d’affichage de la bibliothèque',
    'tour.steps.librariesViews.body': 'Basculez entre tableau, grille et liste selon la façon dont vous voulez parcourir la bibliothèque actuelle.',
    'tour.steps.librariesList.title': 'Contenu de la bibliothèque',
    'tour.steps.librariesList.body': 'Cette zone affiche le contenu de la bibliothèque active avec tri, filtres et actions sur les documents.',
    'tour.steps.documentDetailsInformation.title': 'Modifier les détails : informations',
    'tour.steps.documentDetailsInformation.body': 'Cette page vous permet de modifier les informations principales du document, dont le titre, les auteurs, l’année, le statut de lecture et le résumé.',
    'tour.steps.documentDetailsTags.title': 'Modifier les détails : tags',
    'tour.steps.documentDetailsTags.body': 'Utilisez la section tags pour ajouter vos propres tags, revoir les suggestions et classer le document comme vous le souhaitez.',
    'tour.steps.documentDetailsReferences.title': 'Modifier les détails : références',
    'tour.steps.documentDetailsReferences.body': 'La zone de références montre les liens entrants et sortants pour comprendre comment ce document se connecte au reste de la bibliothèque.',
    'tour.steps.documentDetailsMetadata.title': 'Récupérer les métadonnées en ligne',
    'tour.steps.documentDetailsMetadata.body': 'Utilisez cette action pour interroger les fournisseurs en ligne et compléter les métadonnées manquantes avec des informations plus propres.',
    'tour.steps.commentsOverview.title': 'Commentaires du document',
    'tour.steps.commentsOverview.body': 'Cette page de commentaires est l’endroit où vous rédigez le commentaire global d’un document en vous appuyant sur les notes enregistrées.',
    'tour.steps.readerHighlights.title': 'Surlignages dans le lecteur',
    'tour.steps.readerHighlights.body': 'Dans le lecteur PDF, vous pouvez surligner directement sur la page et travailler dans le document.',
    'tour.steps.readerNotes.title': 'Notes dans le lecteur',
    'tour.steps.readerNotes.body': 'Ajoutez des notes directement dans le lecteur et attachez-les à l’endroit exact de votre lecture.',
    'tour.steps.readerSearch.title': 'Recherche dans le lecteur',
    'tour.steps.readerSearch.body': 'Utilisez la recherche du lecteur pour trouver du texte dans le document et naviguer entre les résultats.',
    'tour.steps.referencesWork.title': 'Mes références',
    'tour.steps.referencesWork.body': 'Vous pouvez ajouter vos travaux ici et gérer les références qui leur sont liées.',
    'tour.steps.notesListOverview.title': 'Notes de tous les documents',
    'tour.steps.notesListOverview.body': 'Cette liste rassemble les notes de tous les documents afin de tout parcourir au même endroit avant de modifier la note sélectionnée.',
    'tour.steps.notesOverview.title': 'Notes',
    'tour.steps.notesOverview.body': 'Vous pouvez y gérer vos notes et les modifier à la volée.',
    'tour.steps.mapsOverview.title': 'Cartes',
    'tour.steps.mapsOverview.body': 'Créez des connexions visuelles et des relations entre articles, documents et vos propres travaux.',
    'tour.steps.metadataOverview.title': 'Métadonnées',
    'tour.steps.metadataOverview.body': 'Importez des métadonnées depuis le web et gérez les informations manquantes des documents de votre bibliothèque.',
    'tour.steps.settingsOptions.title': 'Options des réglages',
    'tour.steps.settingsOptions.body': 'Ces sections regroupent les principales préférences de l’application, de la configuration générale à l’apparence, au traitement, aux données et à la section À propos.',
  },
}

const AppTourContext = createContext<AppTourContextValue>({
  isOpen: false,
  startAppTour: () => undefined,
  closeAppTour: () => undefined,
  nextTourStep: () => undefined,
  previousTourStep: () => undefined,
  skipAppTour: () => undefined,
})

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function queryTourTarget(targetTourId: string) {
  return document.querySelector<HTMLElement>(`${TARGET_SELECTOR_PREFIX}${targetTourId}"]`)
}

function translateTour(locale: AppLocale, key: string, params?: Record<string, string | number>) {
  const localized = APP_TOUR_TRANSLATIONS[locale]?.[key]
  if (localized) {
    return Object.entries(params ?? {}).reduce(
      (message, [paramKey, value]) => message.replaceAll(`{${paramKey}}`, String(value)),
      localized,
    )
  }

  return translate(locale, key, params)
}

function resolveDynamicPath(
  dynamicPath: AppTourDynamicPath,
  documents: ReturnType<typeof useDocumentStore.getState>['documents'],
) {
  if (dynamicPath === 'first-document-comments') {
    const firstCommentableDocument = [...documents]
      .filter((document) => document.documentType === 'pdf' || document.documentType === 'physical_book' || document.documentType === 'my_work')
      .sort((left, right) => {
        const titleComparison = left.title.localeCompare(right.title)
        if (titleComparison !== 0) return titleComparison
        return left.createdAt.getTime() - right.createdAt.getTime()
      })[0]

    if (!firstCommentableDocument) return null
    return `/comments?id=${firstCommentableDocument.id}`
  }

  if (dynamicPath !== 'first-pdf-reader') return null

  const firstReadablePdf = [...documents]
    .filter((document) => document.documentType === 'pdf' && document.filePath)
    .sort((left, right) => {
      const titleComparison = left.title.localeCompare(right.title)
      if (titleComparison !== 0) return titleComparison
      return left.createdAt.getTime() - right.createdAt.getTime()
    })[0]

  if (!firstReadablePdf) return null
  return `/reader/view?id=${firstReadablePdf.id}`
}

function normalizeRouteLocation(path: string | null) {
  if (!path) return null
  try {
    const url = new URL(path, 'http://refx.local')
    const normalizedSearchParams = new URLSearchParams(url.search)
    normalizedSearchParams.sort()
    const query = normalizedSearchParams.toString()
    return query ? `${url.pathname}?${query}` : url.pathname
  } catch {
    const [pathname, rawQuery = ''] = path.split('?')
    const normalizedSearchParams = new URLSearchParams(rawQuery)
    normalizedSearchParams.sort()
    const query = normalizedSearchParams.toString()
    return query ? `${pathname ?? path}?${query}` : (pathname ?? path)
  }
}

function computePlacement(
  preferred: AppTourPlacement,
  rect: SpotlightRect,
  viewportWidth: number,
  viewportHeight: number,
) {
  const remaining = {
    top: rect.top,
    bottom: viewportHeight - (rect.top + rect.height),
    left: rect.left,
    right: viewportWidth - (rect.left + rect.width),
  }

  if (preferred === 'top' && remaining.top >= 220) return 'top'
  if (preferred === 'bottom' && remaining.bottom >= 220) return 'bottom'
  if (preferred === 'left' && remaining.left >= BALLOON_WIDTH + GAP + VIEWPORT_PADDING) return 'left'
  if (preferred === 'right' && remaining.right >= BALLOON_WIDTH + GAP + VIEWPORT_PADDING) return 'right'

  const ranked = (Object.entries(remaining) as Array<[AppTourPlacement, number]>)
    .sort((left, right) => right[1] - left[1])
    .map(([placement]) => placement)

  return ranked[0] ?? preferred
}

function buildBalloonStyle(rect: SpotlightRect, placement: AppTourPlacement): CSSProperties {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  if (placement === 'top' || placement === 'bottom') {
    const left = clamp(
      rect.left + rect.width / 2 - BALLOON_WIDTH / 2,
      VIEWPORT_PADDING,
      viewportWidth - BALLOON_WIDTH - VIEWPORT_PADDING,
    )
    const top = placement === 'top'
      ? Math.max(VIEWPORT_PADDING, rect.top - GAP - 210)
      : Math.min(viewportHeight - 210 - VIEWPORT_PADDING, rect.top + rect.height + GAP)
    return { top, left, width: BALLOON_WIDTH }
  }

  const left = placement === 'left'
    ? Math.max(VIEWPORT_PADDING, rect.left - BALLOON_WIDTH - GAP)
    : Math.min(viewportWidth - BALLOON_WIDTH - VIEWPORT_PADDING, rect.left + rect.width + GAP)
  const top = clamp(
    rect.top + rect.height / 2 - 105,
    VIEWPORT_PADDING,
    viewportHeight - 210 - VIEWPORT_PADDING,
  )

  return { top, left, width: BALLOON_WIDTH }
}

function buildArrowPath(rect: SpotlightRect, balloonStyle: CSSProperties) {
  const balloonLeft = Number(balloonStyle.left ?? 0)
  const balloonTop = Number(balloonStyle.top ?? 0)
  const balloonWidth = Number(balloonStyle.width ?? BALLOON_WIDTH)
  const balloonHeight = 210
  const fromX = balloonLeft + balloonWidth / 2
  const fromY = balloonTop + balloonHeight / 2
  const toX = rect.left + rect.width / 2
  const toY = rect.top + rect.height / 2
  const midX = (fromX + toX) / 2
  return `M ${fromX} ${fromY} Q ${midX} ${fromY} ${toX} ${toY}`
}

function Spotlight({
  rect,
  title,
  body,
  stepLabel,
  locale,
  placement,
  onBack,
  onNext,
  onSkip,
  isFirstStep,
  isLastStep,
}: {
  rect: SpotlightRect
  title: string
  body: string
  stepLabel: string
  locale: AppLocale
  placement: AppTourPlacement
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  isFirstStep: boolean
  isLastStep: boolean
}) {
  const balloonStyle = buildBalloonStyle(rect, placement)
  const arrowPath = buildArrowPath(rect, balloonStyle)

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[1600]">
      <div className="absolute inset-0 bg-slate-950/18" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <marker
            id="tour-arrow-head"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 9 3 L 0 6 z" fill="rgba(253, 186, 116, 0.95)" />
          </marker>
        </defs>
        <path
          d={arrowPath}
          fill="none"
          stroke="rgba(253, 186, 116, 0.95)"
          strokeWidth="2.5"
          strokeDasharray="6 6"
          markerEnd="url(#tour-arrow-head)"
        />
      </svg>

      <div
        className="pointer-events-none absolute rounded-[22px] border-2 border-amber-300/95 bg-white/5 shadow-[0_0_0_9999px_rgba(15,23,42,0.12),0_0_0_12px_rgba(253,186,116,0.12)] transition-all duration-200"
        style={{
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        }}
      />

      <div
        className="pointer-events-auto absolute rounded-3xl border border-amber-200/50 bg-background/98 p-5 shadow-[0_28px_90px_rgba(15,23,42,0.42)]"
        style={balloonStyle}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80">{stepLabel}</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={translateTour(locale, 'tour.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            {translateTour(locale, 'tour.skip')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onBack} disabled={isFirstStep}>
              <ChevronLeft className="h-4 w-4" />
              {translateTour(locale, 'tour.back')}
            </Button>
            <Button size="sm" onClick={onNext}>
              {isLastStep ? translateTour(locale, 'tour.finish') : translateTour(locale, 'tour.next')}
              {!isLastStep ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function AppTourProvider({
  children,
  enabled,
  shouldAutostart,
  onTourCompleted,
}: AppTourProviderProps) {
  const { locale } = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const documents = useDocumentStore((state) => state.documents)
  const [isOpen, setIsOpen] = useState(false)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [rect, setRect] = useState<SpotlightRect | null>(null)
  const [resolvedPlacement, setResolvedPlacement] = useState<AppTourPlacement>('bottom')
  const hasAutostartedRef = useRef(false)
  const completeOnceRef = useRef(false)

  const completeTour = useCallback(async () => {
    if (completeOnceRef.current) return
    completeOnceRef.current = true
    await onTourCompleted()
  }, [onTourCompleted])

  const closeTour = useCallback(() => {
    setIsOpen(false)
    setRect(null)
  }, [])

  const startAppTour = useCallback(() => {
    if (!enabled) return
    completeOnceRef.current = false
    setCurrentStepIndex(0)
    setRect(null)
    setIsOpen(true)
  }, [enabled])

  const finishTour = useCallback(async () => {
    await completeTour()
    closeTour()
  }, [closeTour, completeTour])

  const skipAppTour = useCallback(() => {
    void (async () => {
      await completeTour()
      closeTour()
      router.push('/')
    })()
  }, [closeTour, completeTour, router])

  const nextTourStep = useCallback(() => {
    setRect(null)
    setCurrentStepIndex((current) => {
      if (current >= APP_TOUR_STEPS.length - 1) {
        void finishTour()
        return current
      }
      return current + 1
    })
  }, [finishTour])

  const previousTourStep = useCallback(() => {
    setRect(null)
    setCurrentStepIndex((current) => Math.max(0, current - 1))
  }, [])

  const currentStep = APP_TOUR_STEPS[currentStepIndex] ?? null
  const currentStepPath = useMemo(() => {
    if (!currentStep) return null
    if (currentStep.path) return currentStep.path
    if (currentStep.dynamicPath) return resolveDynamicPath(currentStep.dynamicPath, documents)
    return null
  }, [currentStep, documents])
  const currentRoute = useMemo(
    () => normalizeRouteLocation(
      searchParams.toString().length > 0 ? `${pathname}?${searchParams.toString()}` : pathname,
    ),
    [pathname, searchParams],
  )
  const currentStepRoute = useMemo(
    () => normalizeRouteLocation(currentStepPath),
    [currentStepPath],
  )

  useEffect(() => {
    if (!enabled || !shouldAutostart || hasAutostartedRef.current) return
    hasAutostartedRef.current = true
    startAppTour()
  }, [enabled, shouldAutostart, startAppTour])

  useEffect(() => {
    if (!isOpen || !currentStep) return
    if (!currentStepPath) {
      if (currentStep.skipIfUnavailable) {
        nextTourStep()
      }
      return
    }
    if (currentRoute === currentStepRoute) return
    setRect(null)
    router.push(currentStepPath)
  }, [currentRoute, currentStep, currentStepPath, currentStepRoute, isOpen, nextTourStep, router])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void skipAppTour()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        nextTourStep()
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previousTourStep()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, nextTourStep, previousTourStep, skipAppTour])

  useLayoutEffect(() => {
    if (!isOpen || !currentStep || !currentStepRoute || currentRoute !== currentStepRoute) return

    let cancelled = false
    let frameId = 0
    const deadline = Date.now() + TARGET_WAIT_TIMEOUT_MS

    const measure = () => {
      if (cancelled) return
      const element = queryTourTarget(currentStep.targetTourId)
      if (!element) {
        if (Date.now() >= deadline) {
          nextTourStep()
          return
        }
        frameId = window.requestAnimationFrame(measure)
        return
      }

      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
      const nextRect = element.getBoundingClientRect()
      const spotlightRect = {
        top: nextRect.top,
        left: nextRect.left,
        width: nextRect.width,
        height: nextRect.height,
      }
      setRect(spotlightRect)
      setResolvedPlacement(
        computePlacement(currentStep.placement, spotlightRect, window.innerWidth, window.innerHeight),
      )
    }

    measure()

    return () => {
      cancelled = true
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [currentRoute, currentStep, currentStepRoute, isOpen, nextTourStep])

  useEffect(() => {
    if (!isOpen || !currentStep || !currentStepRoute || currentRoute !== currentStepRoute || !rect) return

    const updateRect = () => {
      const element = queryTourTarget(currentStep.targetTourId)
      if (!element) return
      const nextRect = element.getBoundingClientRect()
      const spotlightRect = {
        top: nextRect.top,
        left: nextRect.left,
        width: nextRect.width,
        height: nextRect.height,
      }
      setRect(spotlightRect)
      setResolvedPlacement(
        computePlacement(currentStep.placement, spotlightRect, window.innerWidth, window.innerHeight),
      )
    }

    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [currentRoute, currentStep, currentStepRoute, isOpen, rect])

  const value = useMemo<AppTourContextValue>(
    () => ({
      isOpen,
      startAppTour,
      closeAppTour: closeTour,
      nextTourStep,
      previousTourStep,
      skipAppTour,
    }),
    [closeTour, isOpen, nextTourStep, previousTourStep, skipAppTour, startAppTour],
  )

  const stepLabel = currentStep
    ? translateTour(locale, 'tour.stepCounter', {
        current: currentStepIndex + 1,
        total: APP_TOUR_STEPS.length,
      })
    : ''
  const hasVisibleSpotlight = Boolean(isOpen && currentStep && rect)
  const spotlightRect = rect

  return (
    <AppTourContext.Provider value={value}>
      <div className={cn(hasVisibleSpotlight ? 'tour-active' : undefined)}>{children}</div>
      {hasVisibleSpotlight && spotlightRect ? (
        <Spotlight
          rect={spotlightRect}
          title={translateTour(locale, currentStep.titleKey)}
          body={translateTour(locale, currentStep.bodyKey)}
          stepLabel={stepLabel}
          locale={locale}
          placement={resolvedPlacement}
          onBack={previousTourStep}
          onNext={nextTourStep}
          onSkip={skipAppTour}
          isFirstStep={currentStepIndex === 0}
          isLastStep={currentStepIndex === APP_TOUR_STEPS.length - 1}
        />
      ) : null}
    </AppTourContext.Provider>
  )
}

export function useAppTour() {
  return useContext(AppTourContext)
}
