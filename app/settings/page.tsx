'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Cloud, Database, Download, FolderOpen, HardDrive, Loader2, Palette, RefreshCw, RotateCcw, Settings, ShieldAlert, Sparkles, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { open, save } from '@/lib/tauri/client'
import {
  DEFAULT_APP_SETTINGS,
  getBaseThemeMode,
  getThemeAccentVariant,
  GEMINI_MODEL_OPTIONS,
  loadAppSettings,
  saveAppSettings,
  type StoredAppSettings,
} from '@/lib/app-settings'
import * as repo from '@/lib/repositories/local-db'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { AppUpdateDialog } from '@/components/refx/app-update-dialog'
import { PageHeader } from '@/components/refx/page-header'
import { checkForAppUpdate, downloadAndInstallAppUpdate, type AppUpdateSummary } from '@/lib/services/app-update-service'
import { isUsageTelemetryConfigured } from '@/lib/services/usage-telemetry-service'
import { APP_LOCALES, useLocale, useT } from '@/lib/localization'
import { getRemoteVaultDisplayMessage, getRemoteVaultModeLabel } from '@/lib/remote-vault-copy'
import { APP_VERSION, getAppVersion } from '@/lib/app-version'
import { useDocumentActions, useDocumentStore } from '@/lib/stores/document-store'
import { useRuntimeActions, useRuntimeState } from '@/lib/stores/runtime-store'

type SettingsSection = 'general' | 'display' | 'processing' | 'data' | 'about'
type SettingsBackupMetadata = repo.DbBackupFileMetadata | repo.DbRemoteVaultBackupMetadata

const isRemoteVaultBackup = (backup: SettingsBackupMetadata): backup is repo.DbRemoteVaultBackupMetadata => (
  'revision' in backup
)

export default function SettingsPage() {
  const t = useT()
  const { locale } = useLocale()
  const router = useRouter()
  const { setTheme } = useTheme()
  const documents = useDocumentStore((state) => state.documents)
  const { scanDocumentsOcr, classifyDocuments } = useDocumentActions()
  const { clearLocalData, refreshData } = useRuntimeActions()
  const { isDesktopApp } = useRuntimeState()
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [isClearing, setIsClearing] = useState(false)
  const [isScanningOcr, setIsScanningOcr] = useState(false)
  const [isCreatingBackup, setIsCreatingBackup] = useState(false)
  const [isRestoringBackup, setIsRestoringBackup] = useState(false)
  const [backups, setBackups] = useState<SettingsBackupMetadata[]>([])
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [settings, setSettings] = useState<StoredAppSettings>(DEFAULT_APP_SETTINGS)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)
  const [displayVersion, setDisplayVersion] = useState(APP_VERSION)
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateSummary | null>(null)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [ocrScanTargetIds, setOcrScanTargetIds] = useState<string[]>([])
  const [ocrScanStatus, setOcrScanStatus] = useState<string | null>(null)
  const [classificationTargetIds, setClassificationTargetIds] = useState<string[]>([])
  const [classificationRunStatus, setClassificationRunStatus] = useState<string | null>(null)
  const [isClassifyingDocuments, setIsClassifyingDocuments] = useState(false)
  const [isRecheckingDoiReferences, setIsRecheckingDoiReferences] = useState(false)
  const [doiReferenceStatus, setDoiReferenceStatus] = useState<string | null>(null)
  const [remoteVaultStatus, setRemoteVaultStatus] = useState<repo.DbRemoteVaultStatus | null>(null)
  const [remoteVaultMessage, setRemoteVaultMessage] = useState<string | null>(null)
  const [isRemoteVaultBusy, setIsRemoteVaultBusy] = useState(false)
  const [restoreTargetPath, setRestoreTargetPath] = useState<string | null>(null)
  const [isRestoreWarningOpen, setIsRestoreWarningOpen] = useState(false)
  const [isClearDataDialogOpen, setIsClearDataDialogOpen] = useState(false)
  const [backupDeleteTargetPath, setBackupDeleteTargetPath] = useState<string | null>(null)
  const [isJoinAnotherVaultDialogOpen, setIsJoinAnotherVaultDialogOpen] = useState(false)
  const hasLoadedSettingsRef = useRef(false)
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false)
  const isDevSplashPreviewAvailable = process.env.NODE_ENV === 'development'

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const version = await getAppVersion()
      if (!cancelled) {
        setDisplayVersion(version)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const processingCopy = useMemo(() => {
    switch (locale) {
      case 'pt-BR':
        return {
          advancedClassification: 'Classificacao semantica avancada',
          advancedClassificationDescription: 'Classificacao opcional de topico apos a sugestao de tags.',
          disabled: 'Desativado',
          localHeuristic: 'Heuristica local',
          ocrScan: 'Leitura OCR',
          ocrScanDescription: 'Escaneie documentos armazenados e salve o estado de OCR e busca.',
          ocrEligible: '{count} documento{suffix} elegivel para OCR disponivel.',
          scanAllOcr: 'Escanear todo o OCR',
          scanning: 'Escaneando...',
          ocrProgress: 'Progresso do OCR',
          completed: 'concluidos',
          processing: 'processando',
          failed: 'falharam',
          noEligibleOcr: 'Nenhum documento elegivel precisa de OCR agora.',
          preparingOcr: 'Preparando OCR para {count} documento{suffix}...',
          ocrFinishedSomeFailed: 'Leitura OCR concluida. {complete} concluidos, {failed} falharam.',
          ocrFinished: 'Leitura OCR concluida para {count} documento{suffix}.',
          ocrRunningStatus: 'Escaneando OCR: {finished}/{total} concluidos, {processing} em andamento.',
          semanticClassificationTitle: 'Classificacao semantica',
          semanticClassificationDescription: 'Execute a classificacao de topicos em documentos que ja tenham texto extraido ou OCR.',
          semanticClassificationDisabled: 'A classificacao semantica esta desativada no momento.',
          classificationEligible: '{count} documento{suffix} elegivel para classificacao disponivel.',
          classifyAll: 'Classificar tudo',
          classifying: 'Classificando...',
          classificationProgress: 'Progresso da classificacao',
          enableClassificationFirst: 'Ative primeiro a classificacao semantica para executar esta acao.',
          noEligibleClassification: 'Nenhum documento elegivel precisa de classificacao semantica agora.',
          preparingClassification: 'Preparando a classificacao semantica para {count} documento{suffix}...',
          classificationFinishedSomeFailed: 'Classificacao semantica concluida. {complete} concluidos, {failed} falharam.',
          classificationFinished: 'Classificacao semantica concluida para {count} documento{suffix}.',
          classificationRunningStatus: 'Classificando documentos: {finished}/{total} concluidos, {processing} em andamento.',
        }
      case 'fr':
        return {
          advancedClassification: 'Classification semantique avancee',
          advancedClassificationDescription: 'Classification de sujet optionnelle apres la suggestion de tags.',
          disabled: 'Desactive',
          localHeuristic: 'Heuristique locale',
          ocrScan: 'Analyse OCR',
          ocrScanDescription: 'Analysez les documents stockes et conservez l etat OCR et recherche.',
          ocrEligible: '{count} document{suffix} eligible a l OCR disponible.',
          scanAllOcr: 'Lancer tout l OCR',
          scanning: 'Analyse en cours...',
          ocrProgress: 'Progression OCR',
          completed: 'termines',
          processing: 'en cours',
          failed: 'echoues',
          noEligibleOcr: 'Aucun document eligible n a besoin d OCR pour le moment.',
          preparingOcr: 'Preparation de l OCR pour {count} document{suffix}...',
          ocrFinishedSomeFailed: 'Analyse OCR terminee. {complete} termines, {failed} echoues.',
          ocrFinished: 'Analyse OCR terminee pour {count} document{suffix}.',
          ocrRunningStatus: 'Analyse OCR: {finished}/{total} termines, {processing} en cours.',
          semanticClassificationTitle: 'Classification semantique',
          semanticClassificationDescription: 'Lancez la classification thematique sur les documents qui ont deja du texte extrait ou OCR.',
          semanticClassificationDisabled: 'La classification semantique est actuellement desactivee.',
          classificationEligible: '{count} document{suffix} eligible a la classification disponible.',
          classifyAll: 'Tout classifier',
          classifying: 'Classification...',
          classificationProgress: 'Progression de la classification',
          enableClassificationFirst: 'Activez d abord la classification semantique pour lancer cette action.',
          noEligibleClassification: 'Aucun document eligible n a besoin de classification semantique pour le moment.',
          preparingClassification: 'Preparation de la classification semantique pour {count} document{suffix}...',
          classificationFinishedSomeFailed: 'Classification semantique terminee. {complete} termines, {failed} echoues.',
          classificationFinished: 'Classification semantique terminee pour {count} document{suffix}.',
          classificationRunningStatus: 'Classification des documents: {finished}/{total} termines, {processing} en cours.',
        }
      default:
        return {
          advancedClassification: 'Advanced Semantic Classification',
          advancedClassificationDescription: 'Optional topic classification after tag suggestion.',
          disabled: 'Disabled',
          localHeuristic: 'Local Heuristic',
          ocrScan: 'OCR Scan',
          ocrScanDescription: 'Scan stored documents and persist OCR/search state.',
          ocrEligible: '{count} OCR-eligible document{suffix} available.',
          scanAllOcr: 'Scan All OCR',
          scanning: 'Scanning...',
          ocrProgress: 'OCR progress',
          completed: 'completed',
          processing: 'processing',
          failed: 'failed',
          noEligibleOcr: 'No eligible documents need OCR right now.',
          preparingOcr: 'Preparing OCR for {count} document{suffix}...',
          ocrFinishedSomeFailed: 'OCR scan finished. {complete} completed, {failed} failed.',
          ocrFinished: 'OCR scan finished for {count} document{suffix}.',
          ocrRunningStatus: 'Scanning OCR: {finished}/{total} finished, {processing} in progress.',
          semanticClassificationTitle: 'Semantic Classification',
          semanticClassificationDescription: 'Run topic classification on documents that already have extracted or OCR text.',
          semanticClassificationDisabled: 'Semantic classification is currently disabled.',
          classificationEligible: '{count} classification-eligible document{suffix} available.',
          classifyAll: 'Classify All',
          classifying: 'Classifying...',
          classificationProgress: 'Classification progress',
          enableClassificationFirst: 'Enable semantic classification first to run this action.',
          noEligibleClassification: 'No eligible documents need semantic classification right now.',
          preparingClassification: 'Preparing semantic classification for {count} document{suffix}...',
          classificationFinishedSomeFailed: 'Semantic classification finished. {complete} completed, {failed} failed.',
          classificationFinished: 'Semantic classification finished for {count} document{suffix}.',
          classificationRunningStatus: 'Classifying documents: {finished}/{total} finished, {processing} in progress.',
        }
    }
  }, [locale])

  const settingsUiCopy = useMemo(() => {
    switch (locale) {
      case 'pt-BR':
        return {
          automaticProcessingTitle: 'Processamento automático',
          automaticProcessingDescription: 'Padrões de processamento.',
          autoOcr: 'OCR automático',
          autoOcrDescription: 'Executar OCR após a importação.',
          autoMetadataExtraction: 'Extração automática de metadados',
          autoMetadataExtractionDescription: 'Extrair título, autores, ano e DOI durante a importação.',
          autoOnlineMetadataEnrichment: 'Enriquecimento online automático de metadados',
          autoOnlineMetadataEnrichmentDescription: 'Usar Crossref primeiro e Semantic Scholar depois quando os metadados estiverem incompletos.',
          metadataApiConfiguration: 'Configuração das APIs de metadados',
          metadataApiConfigurationDescription: 'A configuração dos provedores fica salva localmente neste dispositivo.',
          crossrefContactEmail: 'Email de contato do Crossref',
          crossrefContactEmailDescription: 'Dica de contato opcional para as requisições ao Crossref.',
          semanticScholarApi: 'API do Semantic Scholar',
          semanticScholarApiDescription: 'Escolha entre usar o acesso embutido ou a sua própria chave neste dispositivo.',
          useBuiltinApi: 'Usar API embutida',
          useOwnApiKey: 'Usar sua própria chave de API',
          semanticScholarApiKey: 'Chave da API do Semantic Scholar',
          semanticScholarApiKeyDescription: 'Adicione sua própria chave do Semantic Scholar para este dispositivo.',
          semanticScholarApiKeyPlaceholder: 'Digite sua própria chave da API do Semantic Scholar',
          keywordEngine: 'Motor de palavras-chave',
          keywordEngineDescription: 'A heurística local é a opção padrão e ilimitada. Gemini é um aprimoramento opcional. A busca manual por IA na página de detalhes continua disponível.',
          autoExtractKeywordsOnImport: 'Extrair palavras-chave automaticamente na importação',
          autoExtractKeywordsOnImportDescription: 'Usar palavras-chave dos autores primeiro, depois heurística local ou extração Gemini conforme suas configurações.',
          autoRequestGeminiOnImport: 'Solicitar Gemini automaticamente na importação',
          autoRequestGeminiOnImportDescription: 'Usar Gemini apenas quando o motor de palavras-chave for Gemini e o limite diário permitir.',
          doiLinks: 'Links DOI',
          rechecking: 'Verificando novamente...',
          recheckDoiLinks: 'Verificar links DOI novamente',
          backups: 'Backups',
          vaultBackups: 'Backups do vault',
          vaultBackupsDescription: 'Quando o Remote Vault esta ativo, os backups ficam dentro da pasta do vault para proteger a fonte compartilhada, nao apenas este dispositivo.',
          backupsDescription: 'Backups locais em arquivo único para documentos, notas, mapas e configurações.',
          automaticBackups: 'Backups automáticos',
          automaticBackupsDescription: 'Backups gerenciados pelo app criados ao iniciar quando necessário.',
          vaultAutomaticBackupsDescription: 'Backups automaticos agora sao criados no vault quando este dispositivo tem a permissao de escrita.',
          backupScope: 'Escopo do backup',
          everything: 'Tudo',
          documentsOnly: 'Somente documentos',
          settingsOnly: 'Somente configurações',
          frequencyInDays: 'Frequência em dias',
          keepBackups: 'Manter backups',
          manualVaultBackup: 'Backup manual do vault',
          createVaultBackup: 'Criar backup do vault',
          vaultBackupCreated: 'Backup do vault criado: {fileName}',
          vaultSafetyBackupCreated: 'Backup de seguranca do vault criado: {fileName}',
          vaultBackupRestored: 'Backup do vault restaurado: {fileName}',
          vaultBackupList: 'Backups do vault',
          noVaultBackupsYet: 'Ainda nao ha backups no vault.',
          vaultBackupRestoreSafetyDescription: 'Isto e destrutivo. O REFX vai restaurar a snapshot selecionada para o Remote Vault e atualizar o cache deste dispositivo.',
          vaultBackupRestoreSafetyDescription2: 'O REFX criara primeiro um backup de seguranca do estado atual do vault. Outros dispositivos vao ver a versao restaurada na proxima sincronizacao.',
          vaultBackupRestoreSafetyDescription3: 'Continue apenas se quiser substituir o estado atual do vault pelo backup selecionado.',
          restoreVaultBackup: 'Restaurar backup do vault',
          manualBackupExport: 'Exportação manual de backup',
          restoreFile: 'Restaurar arquivo',
          refresh: 'Atualizar',
          noAutomaticBackupsYet: 'Ainda não há backups automáticos.',
          restore: 'Restaurar',
          dangerZone: 'Zona de perigo',
          irreversible: 'Esta ação é irreversível.',
          clearLocalDataQuestion: 'Limpar dados locais?',
          clearLocalDataDialogDescription: 'Limpar todos os documentos locais, notas e arquivos importados? Isso não pode ser desfeito.',
          deleteBackupAction: 'Excluir backup',
          deleteBackupDialogDescription: 'Excluir este arquivo de backup?',
          restoreBackupSafetyDescription: 'Isto é destrutivo. O REFX apagará os dados locais atuais dentro do escopo selecionado antes de aplicar o backup.',
          restoreBackupSafetyDescription2: 'Para sua segurança, o REFX criará antes um backup completo. Se a restauração falhar ou o resultado não for o esperado, você poderá restaurar esse backup de segurança.',
          restoreBackupSafetyDescription3: 'Continue apenas se quiser substituir o estado local atual pelo backup selecionado.',
          restoreSource: 'Origem: {path}',
          createSafetyBackupAndRestore: 'Criar backup de segurança e restaurar',
          restoring: 'Restaurando...',
          splashPreview: 'Pré-visualizar tela de carregamento',
          splashPreviewDescription: 'Recarrega o app e força a tela de carregamento por alguns segundos para depuração.',
          anonymousUsageStats: 'Estatísticas anônimas de uso',
          anonymousUsageStatsDescription: 'Compartilhe um ID de instalação anônimo, a versão do app e eventos de abertura e fechamento para contar instalações desktop ativas.',
        }
      case 'fr':
        return {
          automaticProcessingTitle: 'Traitement automatique',
          automaticProcessingDescription: 'Paramètres de traitement par défaut.',
          autoOcr: 'OCR automatique',
          autoOcrDescription: 'Lancer l’OCR après l’import.',
          autoMetadataExtraction: 'Extraction automatique des métadonnées',
          autoMetadataExtractionDescription: 'Extraire le titre, les auteurs, l’année et le DOI pendant l’import.',
          autoOnlineMetadataEnrichment: 'Enrichissement en ligne automatique des métadonnées',
          autoOnlineMetadataEnrichmentDescription: 'Utiliser Crossref puis Semantic Scholar quand les métadonnées sont incomplètes.',
          metadataApiConfiguration: 'Configuration des API de métadonnées',
          metadataApiConfigurationDescription: 'La configuration des fournisseurs est enregistrée localement sur cet appareil.',
          crossrefContactEmail: 'Email de contact Crossref',
          crossrefContactEmailDescription: 'Indice de contact facultatif pour les requêtes Crossref.',
          semanticScholarApi: 'API Semantic Scholar',
          semanticScholarApiDescription: 'Choisissez d’utiliser l’accès intégré ou votre propre clé sur cet appareil.',
          useBuiltinApi: 'Utiliser l’API intégrée',
          useOwnApiKey: 'Utiliser votre propre clé API',
          semanticScholarApiKey: 'Clé API Semantic Scholar',
          semanticScholarApiKeyDescription: 'Ajoutez votre propre clé Semantic Scholar pour cet appareil.',
          semanticScholarApiKeyPlaceholder: 'Saisissez votre propre clé API Semantic Scholar',
          keywordEngine: 'Moteur de mots-clés',
          keywordEngineDescription: 'L’heuristique locale est l’option par défaut et illimitée. Gemini est une amélioration facultative. La récupération manuelle via IA depuis la page de détails reste disponible.',
          autoExtractKeywordsOnImport: 'Extraire automatiquement les mots-clés à l’import',
          autoExtractKeywordsOnImportDescription: 'Utiliser d’abord les mots-clés auteurs, puis l’heuristique locale ou Gemini selon vos réglages.',
          autoRequestGeminiOnImport: 'Demander Gemini automatiquement à l’import',
          autoRequestGeminiOnImportDescription: 'Utiliser Gemini seulement si le moteur de mots-clés est Gemini et que la limite quotidienne le permet.',
          doiLinks: 'Liens DOI',
          rechecking: 'Nouvelle vérification...',
          recheckDoiLinks: 'Revérifier les liens DOI',
          backups: 'Sauvegardes',
          vaultBackups: 'Sauvegardes du vault',
          vaultBackupsDescription: 'Quand le Remote Vault est actif, les sauvegardes restent dans le dossier du vault pour proteger la source partagee, pas seulement cet appareil.',
          backupsDescription: 'Sauvegardes locales en fichier unique pour les documents, notes, cartes et réglages.',
          automaticBackups: 'Sauvegardes automatiques',
          vaultAutomaticBackupsDescription: 'Les sauvegardes automatiques sont creees dans le vault quand cet appareil detient le bail d ecriture.',
          automaticBackupsDescription: 'Sauvegardes gérées par l’application créées au démarrage lorsque nécessaire.',
          backupScope: 'Portée de la sauvegarde',
          everything: 'Tout',
          documentsOnly: 'Documents seulement',
          settingsOnly: 'Réglages seulement',
          frequencyInDays: 'Fréquence en jours',
          keepBackups: 'Conserver les sauvegardes',
          manualVaultBackup: 'Sauvegarde manuelle du vault',
          createVaultBackup: 'Creer une sauvegarde du vault',
          vaultBackupCreated: 'Sauvegarde du vault creee : {fileName}',
          vaultSafetyBackupCreated: 'Sauvegarde de securite du vault creee : {fileName}',
          vaultBackupRestored: 'Sauvegarde du vault restauree : {fileName}',
          vaultBackupList: 'Sauvegardes du vault',
          noVaultBackupsYet: 'Aucune sauvegarde du vault pour le moment.',
          vaultBackupRestoreSafetyDescription: 'Cette operation est destructive. REFX restaurera le snapshot selectionne dans le Remote Vault et actualisera le cache de cet appareil.',
          vaultBackupRestoreSafetyDescription2: 'REFX creera d abord une sauvegarde de securite de l etat actuel du vault. Les autres appareils verront la version restauree a la prochaine synchronisation.',
          vaultBackupRestoreSafetyDescription3: 'Continuez seulement si vous voulez remplacer l etat actuel du vault par la sauvegarde selectionnee.',
          restoreVaultBackup: 'Restaurer la sauvegarde du vault',
          manualBackupExport: 'Export manuel de sauvegarde',
          restoreFile: 'Restaurer un fichier',
          refresh: 'Actualiser',
          noAutomaticBackupsYet: 'Aucune sauvegarde automatique pour le moment.',
          restore: 'Restaurer',
          dangerZone: 'Zone de danger',
          irreversible: 'Cette action est irréversible.',
          clearLocalDataQuestion: 'Effacer les données locales ?',
          clearLocalDataDialogDescription: 'Effacer tous les documents locaux, les notes et les fichiers importés ? Cette action est irréversible.',
          deleteBackupAction: 'Supprimer la sauvegarde',
          deleteBackupDialogDescription: 'Supprimer ce fichier de sauvegarde ?',
          restoreBackupSafetyDescription: 'Cette opération est destructive. REFX effacera les données locales actuelles dans le périmètre choisi avant d’appliquer la sauvegarde.',
          restoreBackupSafetyDescription2: 'Pour vous protéger, REFX créera d’abord une sauvegarde complète. Si la restauration échoue ou si le résultat ne correspond pas à vos attentes, vous pourrez restaurer cette sauvegarde de sécurité.',
          restoreBackupSafetyDescription3: 'Continuez seulement si vous voulez remplacer l’état local actuel par la sauvegarde sélectionnée.',
          restoreSource: 'Source : {path}',
          createSafetyBackupAndRestore: 'Créer une sauvegarde de sécurité et restaurer',
          restoring: 'Restauration...',
          splashPreview: 'Prévisualiser l’écran de chargement',
          splashPreviewDescription: 'Recharge l’application et force l’écran de chargement pendant quelques secondes pour le débogage.',
          anonymousUsageStats: "Statistiques d'usage anonymes",
          anonymousUsageStatsDescription: "Partager un identifiant d'installation anonyme, la version de l'application et des événements d'ouverture et de fermeture pour compter les installations desktop actives.",
        }
      default:
        return {
          automaticProcessingTitle: 'Automatic Processing',
          automaticProcessingDescription: 'Processing defaults.',
          autoOcr: 'Auto OCR',
          autoOcrDescription: 'Run OCR after import.',
          autoMetadataExtraction: 'Auto Metadata Extraction',
          autoMetadataExtractionDescription: 'Extract title, authors, year, and DOI during import.',
          autoOnlineMetadataEnrichment: 'Auto Online Metadata Enrichment',
          autoOnlineMetadataEnrichmentDescription: 'Use Crossref first and Semantic Scholar second when metadata is incomplete.',
          metadataApiConfiguration: 'Metadata API Configuration',
          metadataApiConfigurationDescription: 'Provider configuration is stored locally on this device.',
          crossrefContactEmail: 'Crossref Contact Email',
          crossrefContactEmailDescription: 'Optional contact hint for Crossref requests.',
          semanticScholarApi: 'Semantic Scholar API',
          semanticScholarApiDescription: 'Choose whether to use the bundled API access or your own key for this device.',
          useBuiltinApi: 'Use built-in API',
          useOwnApiKey: 'Use your own API key',
          semanticScholarApiKey: 'Semantic Scholar API Key',
          semanticScholarApiKeyDescription: 'Add your own Semantic Scholar key for this device.',
          semanticScholarApiKeyPlaceholder: 'Enter your own Semantic Scholar API key',
          keywordEngine: 'Keyword Engine',
          keywordEngineDescription: 'The local heuristic extractor is the default unlimited option. Gemini is an optional enhancement. Manual AI fetch from the details page is still available.',
          autoExtractKeywordsOnImport: 'Auto extract keywords on import',
          autoExtractKeywordsOnImportDescription: 'Use author keywords first, then local heuristic or Gemini extraction based on your settings.',
          autoRequestGeminiOnImport: 'Auto request Gemini on import',
          autoRequestGeminiOnImportDescription: 'Use Gemini only when the keyword engine is Gemini and the daily cap allows it.',
          doiLinks: 'DOI Links',
          rechecking: 'Rechecking...',
          recheckDoiLinks: 'Recheck DOI Links',
          backups: 'Backups',
          vaultBackups: 'Vault Backups',
          vaultBackupsDescription: 'When Remote Vault is enabled, backups are stored inside the vault folder so they protect the shared source of truth, not just this device.',
          backupsDescription: 'Single-file local backups for documents, notes, maps, and settings.',
          automaticBackups: 'Automatic Backups',
          vaultAutomaticBackupsDescription: 'Automatic backups are created in the vault when this device holds the write lease.',
          automaticBackupsDescription: 'App-managed backups created on startup when due.',
          backupScope: 'Backup Scope',
          everything: 'Everything',
          documentsOnly: 'Documents Only',
          settingsOnly: 'Settings Only',
          frequencyInDays: 'Frequency in days',
          keepBackups: 'Keep backups',
          manualVaultBackup: 'Manual Vault Backup',
          createVaultBackup: 'Create Vault Backup',
          vaultBackupCreated: 'Vault backup created: {fileName}',
          vaultSafetyBackupCreated: 'Vault safety backup created: {fileName}',
          vaultBackupRestored: 'Vault backup restored: {fileName}',
          vaultBackupList: 'Vault backups',
          noVaultBackupsYet: 'No vault backups yet.',
          vaultBackupRestoreSafetyDescription: 'This is destructive. REFX will restore the selected snapshot into the Remote Vault and refresh this device cache.',
          vaultBackupRestoreSafetyDescription2: 'REFX will create a current vault safety backup first. Other devices will see the restored version on their next sync.',
          vaultBackupRestoreSafetyDescription3: 'Continue only if you want to replace the current vault state with the selected backup.',
          restoreVaultBackup: 'Restore vault backup',
          manualBackupExport: 'Manual Backup Export',
          restoreFile: 'Restore File',
          refresh: 'Refresh',
          noAutomaticBackupsYet: 'No automatic backups yet.',
          restore: 'Restore',
          dangerZone: 'Danger Zone',
          irreversible: 'This action is irreversible.',
          clearLocalDataQuestion: 'Clear local data?',
          clearLocalDataDialogDescription: 'Clear all local documents, notes, and imported files? This cannot be undone.',
          deleteBackupAction: 'Delete Backup',
          deleteBackupDialogDescription: 'Delete this backup file?',
          restoreBackupSafetyDescription: 'This is destructive. REFX will wipe the current local data inside the selected restore scope before applying the backup.',
          restoreBackupSafetyDescription2: 'To protect you, REFX will create a full safety backup first. If the restore fails or the result is not what you expected, you can restore from that safety backup.',
          restoreBackupSafetyDescription3: 'Continue only if you want to replace your current local state with the selected backup.',
          restoreSource: 'Source: {path}',
          createSafetyBackupAndRestore: 'Create safety backup and restore',
          restoring: 'Restoring...',
          splashPreview: 'Preview loading screen',
          splashPreviewDescription: 'Reload the app and force the loading screen for a few seconds so you can debug it.',
          anonymousUsageStats: 'Anonymous usage stats',
          anonymousUsageStatsDescription: 'Share an anonymous install ID, app version, and open/close events so you can count active desktop installs.',
        }
    }
  }, [locale])

  const isRemoteVaultBackupMode = Boolean(remoteVaultStatus?.enabled ?? settings.remoteVaultEnabled)
  const canWriteRemoteVaultBackups = !isRemoteVaultBackupMode || remoteVaultStatus?.mode === 'remoteWriter'
  const hasRemoteVault = Boolean(remoteVaultStatus?.enabled ?? settings.remoteVaultEnabled)
  const canPushRemoteVault = remoteVaultStatus?.mode === 'remoteWriter'
  const canReleaseRemoteLease = remoteVaultStatus?.mode === 'remoteWriter'

  const handlePreviewLoadingSplash = () => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem('refx.debug.loading-splash-until', String(Date.now() + 5000))
    window.location.reload()
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const loaded = await loadAppSettings(isDesktopApp)
      if (!cancelled) {
        setSettings(loaded)
        hasLoadedSettingsRef.current = true
        setIsSettingsLoaded(true)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isDesktopApp])

  const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
    { id: 'general', label: t('settings.general'), icon: Settings },
    { id: 'display', label: t('settings.display'), icon: Palette },
    { id: 'processing', label: t('settings.processing'), icon: Sparkles },
    { id: 'data', label: t('settings.data'), icon: Database },
    { id: 'about', label: t('settings.about'), icon: HardDrive },
  ]

  const activeMeta = useMemo(
    () => sections.find((section) => section.id === activeSection) ?? sections[0],
    [activeSection, sections],
  )
  const updateSettings = <K extends keyof StoredAppSettings>(key: K, value: StoredAppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  useEffect(() => {
    if (!hasLoadedSettingsRef.current) return

    const applyAndSave = async () => {
      await saveAppSettings(isDesktopApp, settings)
      const accentVariant = getThemeAccentVariant(settings.theme)
      setTheme(getBaseThemeMode(settings.theme))
      if (typeof document !== 'undefined') {
        if (accentVariant) {
          document.documentElement.dataset.refxAccent = accentVariant
        } else {
          delete document.documentElement.dataset.refxAccent
        }
        document.documentElement.style.fontSize = `${settings.fontSize}px`
      }
    }

    void applyAndSave()
  }, [isDesktopApp, setTheme, settings])

  const loadBackups = async (remoteEnabled = isRemoteVaultBackupMode) => {
    if (!isDesktopApp) {
      setBackups([])
      return
    }
    if (remoteEnabled) {
      setBackups(await repo.listRemoteVaultBackups())
      return
    }
    const nextBackups = await repo.listBackups()
    setBackups(nextBackups.filter((backup) => backup.automatic))
  }

  useEffect(() => {
    if (!isDesktopApp) return
    void loadBackups()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopApp, isRemoteVaultBackupMode])

  const applyRemoteVaultStatusToSettings = (status: repo.DbRemoteVaultStatus | null) => {
    if (!status) return
    setRemoteVaultStatus(status)
    setSettings((current) => ({
      ...current,
      remoteVaultEnabled: status.enabled,
      remoteVaultPath: status.path ?? '',
      remoteVaultId: status.vaultId ?? '',
      remoteDeviceId: status.deviceId ?? current.remoteDeviceId,
      remoteLastPulledAt: status.remoteLastPulledAt ?? current.remoteLastPulledAt,
      remoteLastPushedAt: status.remoteLastPushedAt ?? current.remoteLastPushedAt,
    }))
  }

  const loadRemoteVaultStatus = async () => {
    if (!isDesktopApp) {
      setRemoteVaultStatus(null)
      return
    }
    try {
      const status = await repo.getRemoteVaultStatus()
      applyRemoteVaultStatusToSettings(status)
      setRemoteVaultMessage(getRemoteVaultDisplayMessage(t, status))
    } catch (error) {
      setRemoteVaultMessage(error instanceof Error ? error.message : t('settings.remoteVault.readStatusFailed'))
    }
  }

  const getRemoteVaultErrorMessage = (error: unknown) => {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('already contains a populated Refx vault')) {
      return t('settings.remoteVault.migrationTargetExists')
    }
    if (message.includes('moving the library back to local storage')) {
      return t('settings.remoteVault.moveToLocalFailed')
    }
    return message || t('settings.remoteVault.actionFailed')
  }

  useEffect(() => {
    if (!isDesktopApp) return
    void loadRemoteVaultStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopApp])

  const withRemoteVaultBusy = async (action: () => Promise<repo.DbRemoteVaultStatus | repo.DbRemoteVaultActionResult>) => {
    if (!isDesktopApp) return
    setIsRemoteVaultBusy(true)
    setRemoteVaultMessage(null)
    try {
      const result = await action()
      const nextStatus = 'status' in result ? result.status : result
      if ('status' in result) {
        applyRemoteVaultStatusToSettings(result.status)
        setRemoteVaultMessage(result.message || getRemoteVaultDisplayMessage(t, result.status))
      } else {
        applyRemoteVaultStatusToSettings(result)
        setRemoteVaultMessage(getRemoteVaultDisplayMessage(t, result))
      }
      await loadBackups(nextStatus.enabled)
      await refreshData()
    } catch (error) {
      setRemoteVaultMessage(getRemoteVaultErrorMessage(error))
    } finally {
      setIsRemoteVaultBusy(false)
    }
  }

  const handleChooseRemoteVaultFolder = async () => {
    if (!isDesktopApp) return
    const selected = await open({ directory: true, multiple: false })
    if (!selected || Array.isArray(selected)) return
    await withRemoteVaultBusy(() => repo.configureRemoteVault(selected, settings.remoteCacheLimitMb))
  }

  const handleJoinRemoteVault = async () => {
    if (!isDesktopApp) return
    const selected = await open({ directory: true, multiple: false })
    if (!selected || Array.isArray(selected)) return
    await withRemoteVaultBusy(async () => {
      await repo.configureRemoteVault(selected, settings.remoteCacheLimitMb)
      return repo.pullRemoteVault()
    })
  }

  const handleMigrateRemoteVault = async () => {
    let path = settings.remoteVaultPath
    if (!path) {
      const selected = await open({ directory: true, multiple: false })
      if (!selected || Array.isArray(selected)) return
      path = selected
    }
    await withRemoteVaultBusy(() => repo.migrateToRemoteVault(path))
  }

  const applySettingsImmediately = () => {
    const accentVariant = getThemeAccentVariant(settings.theme)
    setTheme(getBaseThemeMode(settings.theme))
    if (typeof document !== 'undefined') {
      if (accentVariant) {
        document.documentElement.dataset.refxAccent = accentVariant
      } else {
        delete document.documentElement.dataset.refxAccent
      }
      document.documentElement.style.fontSize = `${settings.fontSize}px`
    }
  }

  useEffect(() => {
    if (!isSettingsLoaded) return
    applySettingsImmediately()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsLoaded, settings.theme, settings.fontSize])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleThemeUpdated = (event: Event) => {
      const nextTheme = (event as CustomEvent<{ theme?: StoredAppSettings['theme'] }>).detail?.theme
      if (!nextTheme) return
      setSettings((current) => ({ ...current, theme: nextTheme }))
    }

    window.addEventListener('refx-theme-updated', handleThemeUpdated as EventListener)
    return () => {
      window.removeEventListener('refx-theme-updated', handleThemeUpdated as EventListener)
    }
  }, [])

  const ocrScanDocuments = useMemo(
    () => documents.filter((document) => ocrScanTargetIds.includes(document.id)),
    [documents, ocrScanTargetIds],
  )
  const eligibleOcrDocuments = useMemo(
    () => documents.filter((document) =>
      document.filePath
      && !document.hasOcrText
      && (document.ocrStatus === 'pending' || document.ocrStatus === 'failed' || !document.hasExtractedText),
    ),
    [documents],
  )
  const ocrScanProgress = useMemo(() => {
    const total = ocrScanDocuments.length
    const processing = ocrScanDocuments.filter((document) => document.ocrStatus === 'processing').length
    const complete = ocrScanDocuments.filter((document) => document.ocrStatus === 'complete').length
    const failed = ocrScanDocuments.filter((document) => document.ocrStatus === 'failed').length
    const finished = complete + failed
    return {
      total,
      processing,
      complete,
      failed,
      finished,
      percent: total > 0 ? Math.round((finished / total) * 100) : 0,
    }
  }, [ocrScanDocuments])
  const eligibleClassificationDocuments = useMemo(
    () => documents.filter((document) =>
      settings.advancedClassificationMode !== 'off'
      && document.documentType !== 'my_work'
      && (document.hasExtractedText || document.hasOcrText)
      && (
        document.classificationStatus !== 'complete'
        || !document.classificationTextHash
        || document.classificationTextHash !== document.textHash
      ),
    ),
    [documents, settings.advancedClassificationMode],
  )
  const classificationRunDocuments = useMemo(
    () => documents.filter((document) => classificationTargetIds.includes(document.id)),
    [classificationTargetIds, documents],
  )
  const classificationProgress = useMemo(() => {
    const total = classificationRunDocuments.length
    const processing = classificationRunDocuments.filter((document) => document.classificationStatus === 'processing').length
    const complete = classificationRunDocuments.filter((document) => document.classificationStatus === 'complete').length
    const failed = classificationRunDocuments.filter((document) => document.classificationStatus === 'failed').length
    const finished = complete + failed
    return {
      total,
      processing,
      complete,
      failed,
      finished,
      percent: total > 0 ? Math.round((finished / total) * 100) : 0,
    }
  }, [classificationRunDocuments])

  const handleClearLocalData = async () => {
    setIsClearing(true)
    try {
      await clearLocalData()
      setIsClearDataDialogOpen(false)
      router.push('/libraries')
    } finally {
      setIsClearing(false)
    }
  }

  const handleScanAllOcr = async () => {
    const candidates = eligibleOcrDocuments

    if (candidates.length === 0) {
      setOcrScanTargetIds([])
      setOcrScanStatus(processingCopy.noEligibleOcr)
      return
    }

    setOcrScanTargetIds(candidates.map((document) => document.id))
    setOcrScanStatus(
      processingCopy.preparingOcr
        .replace('{count}', String(candidates.length))
        .replace('{suffix}', candidates.length === 1 ? '' : 's'),
    )
    setIsScanningOcr(true)
    try {
      await scanDocumentsOcr()
      const latestDocuments = useDocumentStore.getState().documents
      const scannedDocuments = latestDocuments.filter((document) => candidates.some((candidate) => candidate.id === document.id))
      const complete = scannedDocuments.filter((document) => document.ocrStatus === 'complete').length
      const failed = scannedDocuments.filter((document) => document.ocrStatus === 'failed').length
      setOcrScanStatus(
        failed > 0
          ? processingCopy.ocrFinishedSomeFailed
            .replace('{complete}', String(complete))
            .replace('{failed}', String(failed))
          : processingCopy.ocrFinished
            .replace('{count}', String(complete))
            .replace('{suffix}', complete === 1 ? '' : 's'),
      )
    } finally {
      setIsScanningOcr(false)
    }
  }

  useEffect(() => {
    if (!isScanningOcr || ocrScanProgress.total === 0) return
    setOcrScanStatus(
      processingCopy.ocrRunningStatus
        .replace('{finished}', String(ocrScanProgress.finished))
        .replace('{total}', String(ocrScanProgress.total))
        .replace('{processing}', String(ocrScanProgress.processing)),
    )
  }, [isScanningOcr, ocrScanProgress, processingCopy])

  const handleClassifyAllDocuments = async () => {
    if (settings.advancedClassificationMode === 'off') {
      setClassificationTargetIds([])
      setClassificationRunStatus(processingCopy.enableClassificationFirst)
      return
    }

    const candidates = eligibleClassificationDocuments

    if (candidates.length === 0) {
      setClassificationTargetIds([])
      setClassificationRunStatus(processingCopy.noEligibleClassification)
      return
    }

    setClassificationTargetIds(candidates.map((document) => document.id))
    setClassificationRunStatus(
      processingCopy.preparingClassification
        .replace('{count}', String(candidates.length))
        .replace('{suffix}', candidates.length === 1 ? '' : 's'),
    )
    setIsClassifyingDocuments(true)
    try {
      await classifyDocuments(candidates.map((document) => document.id), settings.advancedClassificationMode)
      const latestDocuments = useDocumentStore.getState().documents
      const classifiedDocuments = latestDocuments.filter((document) => candidates.some((candidate) => candidate.id === document.id))
      const complete = classifiedDocuments.filter((document) => document.classificationStatus === 'complete').length
      const failed = classifiedDocuments.filter((document) => document.classificationStatus === 'failed').length
      setClassificationRunStatus(
        failed > 0
          ? processingCopy.classificationFinishedSomeFailed
            .replace('{complete}', String(complete))
            .replace('{failed}', String(failed))
          : processingCopy.classificationFinished
            .replace('{count}', String(complete))
            .replace('{suffix}', complete === 1 ? '' : 's'),
      )
    } finally {
      setIsClassifyingDocuments(false)
    }
  }

  useEffect(() => {
    if (!isClassifyingDocuments || classificationProgress.total === 0) return
    setClassificationRunStatus(
      processingCopy.classificationRunningStatus
        .replace('{finished}', String(classificationProgress.finished))
        .replace('{total}', String(classificationProgress.total))
        .replace('{processing}', String(classificationProgress.processing)),
    )
  }, [classificationProgress, isClassifyingDocuments, processingCopy])

  const handleRecheckDoiReferences = async () => {
    if (!isDesktopApp) return

    setIsRecheckingDoiReferences(true)
    setDoiReferenceStatus(null)
    try {
      const references = await repo.recheckDocumentDoiReferences()
      const matchedCount = references.filter((reference) => reference.matchedDocumentId).length
      setDoiReferenceStatus(
        references.length > 0
          ? `Rechecked ${references.length} DOI reference${references.length === 1 ? '' : 's'}. ${matchedCount} matched a document.`
          : 'No stored DOI references to recheck yet.',
      )
    } catch (error) {
      setDoiReferenceStatus(error instanceof Error ? error.message : 'Could not recheck DOI references.')
    } finally {
      setIsRecheckingDoiReferences(false)
    }
  }

  const handleCreateBackup = async (scope: repo.DbBackupScope) => {
    if (!isDesktopApp) return
    if (isRemoteVaultBackupMode) {
      setIsCreatingBackup(true)
      setBackupStatus(null)
      try {
        const backup = await repo.createRemoteVaultBackup(false)
        setBackupStatus(settingsUiCopy.vaultBackupCreated.replace('{fileName}', backup.fileName))
        await loadBackups(true)
        await loadRemoteVaultStatus()
      } finally {
        setIsCreatingBackup(false)
      }
      return
    }

    const backupPath = await save({
      defaultPath: `refx-${scope}-${new Date().toISOString().slice(0, 10)}.refxbackup.json`,
      filters: [{ name: 'REFX Backup', extensions: ['json'] }],
    })
    if (!backupPath) return
    setIsCreatingBackup(true)
    setBackupStatus(null)
    try {
      const backup = await repo.createBackup(scope, false, backupPath)
      setBackupStatus(`Saved ${backup.fileName}`)
    } finally {
      setIsCreatingBackup(false)
    }
  }

  const handleOpenRestoreWarning = (path: string) => {
    setRestoreTargetPath(path)
    setIsRestoreWarningOpen(true)
  }

  const handleRestoreBackup = async () => {
    if (!isDesktopApp) return
    if (!restoreTargetPath) return
    setIsRestoringBackup(true)
    setBackupStatus(null)
    try {
      if (isRemoteVaultBackupMode) {
        const result = await repo.restoreRemoteVaultBackup(restoreTargetPath)
        applyRemoteVaultStatusToSettings(result.status)
        setBackupStatus(
          `${settingsUiCopy.vaultBackupRestored.replace('{fileName}', result.backup.fileName)} ${settingsUiCopy.vaultSafetyBackupCreated.replace('{fileName}', result.safetyBackup.fileName)}`,
        )
      } else {
        const result = await repo.restoreBackup(restoreTargetPath)
        const restoredSettings = await loadAppSettings(isDesktopApp)
        setSettings(restoredSettings)
        setBackupStatus(`Backup restored. Safety backup created: ${result.safetyBackup.fileName}`)
      }
      await refreshData()
      await loadBackups()
      setIsRestoreWarningOpen(false)
      setRestoreTargetPath(null)
    } finally {
      setIsRestoringBackup(false)
    }
  }

  const handleRestoreFromFile = async () => {
    if (!isDesktopApp) return
    if (isRemoteVaultBackupMode) return
    const selected = await open({
      multiple: false,
      filters: [{ name: 'REFX Backup', extensions: ['json'] }],
    })
    if (!selected || Array.isArray(selected)) return
    handleOpenRestoreWarning(selected)
  }

  const handleDeleteBackup = async (path: string) => {
    if (!isDesktopApp) return
    if (isRemoteVaultBackupMode) {
      await repo.deleteRemoteVaultBackup(path)
    } else {
      await repo.deleteBackup(path)
    }
    await loadBackups()
    setBackupDeleteTargetPath(null)
  }

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdates(true)
    setUpdateStatus(null)
    try {
      const result = await checkForAppUpdate()
      if (!result.supported) {
        setAvailableUpdate(null)
        setUpdateStatus(result.reason)
        return
      }

      if (!result.update) {
        setAvailableUpdate(null)
        setUpdateStatus(t('settings.latestVersion'))
        return
      }

      setAvailableUpdate(result.update)
      setUpdateStatus(t('settings.updateAvailable', { version: result.update.version }))
      setIsUpdateDialogOpen(true)
    } catch (error) {
      setUpdateStatus(error instanceof Error ? error.message : t('settings.unableToCheckForUpdates'))
    } finally {
      setIsCheckingUpdates(false)
    }
  }

  const handleInstallUpdate = async () => {
    setIsInstallingUpdate(true)
    setUpdateStatus(t('settings.preparingUpdate'))
    try {
      await downloadAndInstallAppUpdate((messageKey, params) => {
        setUpdateStatus(t(messageKey, params))
      })
    } catch (error) {
      setUpdateStatus(error instanceof Error ? error.message : t('settings.updateInstallFailed'))
      setIsInstallingUpdate(false)
    }
  }

  const formatRemoteBytes = (bytes?: number | null) => {
    const value = bytes ?? 0
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
    return `${(value / 1024 / 1024).toFixed(1)} MB`
  }

  const formatRemoteDate = (value?: string | null) => {
    if (!value) return t('settings.remoteVault.never')
    return new Date(value).toLocaleString()
  }

  if (!isSettingsLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('appProvider.loadingWorkspace')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="px-4 pb-2 pt-4 md:px-6">
        <PageHeader
          icon={<Settings className="h-6 w-6" />}
          title={t('settings.title')}
          subtitle={t('settings.subtitle')}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-56 shrink-0 overflow-auto border-r border-border/80 bg-muted/20 md:block">
          <nav className="space-y-1 p-4" data-tour-id="settings-nav">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                  activeSection === id ? 'bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                )}
                onClick={() => setActiveSection(id)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{activeMeta.label}</h2>
              <p className="text-sm text-muted-foreground">{t('settings.adjustLocalBehavior')}</p>
            </div>

            {activeSection === 'general' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('settings.profileTitle')}</CardTitle>
                    <CardDescription>{t('settings.profileDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t('settings.yourName')}</Label>
                      <Input
                        value={settings.userName}
                        onChange={(event) => updateSettings('userName', event.target.value)}
                        className="mt-2"
                        placeholder={t('settings.yourNamePlaceholder')}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('settings.yourNameHelp')}
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">{t('settings.language')}</Label>
                      <Select value={settings.locale} onValueChange={(value) => updateSettings('locale', value as StoredAppSettings['locale'])}>
                        <SelectTrigger className="mt-1.5 max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APP_LOCALES.map((locale) => (
                            <SelectItem key={locale} value={locale}>
                              {t(`localeNames.${locale}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-sm font-medium">{t('settings.pageGuides')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('settings.pageGuidesDescription')}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Workspace Mode</CardTitle>
                    <CardDescription>Everything stays local in this build.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                      <div>
                        <p className="text-sm font-medium">Local Workspace</p>
                        <p className="mt-1 text-xs text-muted-foreground">All content stays on this device.</p>
                      </div>
                      <Badge>Offline</Badge>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'display' && (
              <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('settings.appearanceTitle')}</CardTitle>
                    <CardDescription>{t('settings.appearanceDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm">{t('settings.theme')}</Label>
                    <Select value={settings.theme} onValueChange={(value) => updateSettings('theme', value as StoredAppSettings['theme'])}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="light-brown">Light Brown</SelectItem>
                        <SelectItem value="light-red">Light Red</SelectItem>
                        <SelectItem value="light-green">Light Green</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="dark-brown">Dark Brown</SelectItem>
                        <SelectItem value="dark-red">Dark Red</SelectItem>
                        <SelectItem value="dark-green">Dark Green</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm">{t('settings.fontSize')}</Label>
                    <Select value={settings.fontSize} onValueChange={(value) => updateSettings('fontSize', value as StoredAppSettings['fontSize'])}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="14">Small (14px)</SelectItem>
                        <SelectItem value="16">Medium (16px)</SelectItem>
                        <SelectItem value="18">Large (18px)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeSection === 'processing' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{settingsUiCopy.automaticProcessingTitle}</CardTitle>
                    <CardDescription>{settingsUiCopy.automaticProcessingDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{settingsUiCopy.autoOcr}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.autoOcrDescription}</p>
                      </div>
                      <Checkbox checked={settings.autoOcr} onCheckedChange={(checked) => updateSettings('autoOcr', !!checked)} />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{settingsUiCopy.autoMetadataExtraction}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.autoMetadataExtractionDescription}</p>
                      </div>
                      <Checkbox
                        checked={settings.autoMetadata}
                        onCheckedChange={(checked) => updateSettings('autoMetadata', !!checked)}
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{settingsUiCopy.autoOnlineMetadataEnrichment}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.autoOnlineMetadataEnrichmentDescription}</p>
                      </div>
                      <Checkbox
                        checked={settings.autoOnlineMetadataEnrichment}
                        onCheckedChange={(checked) => updateSettings('autoOnlineMetadataEnrichment', !!checked)}
                      />
                    </div>

                    <Separator />

                    <div>
                      <Label className="text-sm font-medium">{processingCopy.advancedClassification}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{processingCopy.advancedClassificationDescription}</p>
                      <Select
                        value={settings.advancedClassificationMode}
                        onValueChange={(value) => updateSettings('advancedClassificationMode', value as StoredAppSettings['advancedClassificationMode'])}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="off">{processingCopy.disabled}</SelectItem>
                          <SelectItem value="local_heuristic">{processingCopy.localHeuristic}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{settingsUiCopy.metadataApiConfiguration}</CardTitle>
                  <CardDescription>{settingsUiCopy.metadataApiConfigurationDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">{settingsUiCopy.crossrefContactEmail}</Label>
                      <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.crossrefContactEmailDescription}</p>
                      <Input
                        type="email"
                        value={settings.crossrefContactEmail}
                        onChange={(event) => updateSettings('crossrefContactEmail', event.target.value)}
                        className="mt-2"
                        placeholder="name@example.com"
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-medium">{settingsUiCopy.semanticScholarApi}</Label>
                      <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.semanticScholarApiDescription}</p>
                      <Select
                        value={settings.semanticScholarApiMode}
                        onValueChange={(value) => updateSettings('semanticScholarApiMode', value as StoredAppSettings['semanticScholarApiMode'])}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="builtin">{settingsUiCopy.useBuiltinApi}</SelectItem>
                          <SelectItem value="custom">{settingsUiCopy.useOwnApiKey}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {settings.semanticScholarApiMode === 'custom' ? (
                      <div>
                        <Label className="text-sm font-medium">{settingsUiCopy.semanticScholarApiKey}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.semanticScholarApiKeyDescription}</p>
                        <Input
                          type="password"
                          value={settings.semanticScholarApiKey}
                          onChange={(event) => updateSettings('semanticScholarApiKey', event.target.value)}
                          className="mt-2"
                          placeholder={settingsUiCopy.semanticScholarApiKeyPlaceholder}
                        />
                      </div>
                    ) : null}

                    <div>
                      <Label className="text-sm font-medium">{settingsUiCopy.keywordEngine}</Label>
                      <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.keywordEngineDescription}</p>
                      <Select
                        value={settings.keywordEngine}
                        onValueChange={(value) => updateSettings('keywordEngine', value as StoredAppSettings['keywordEngine'])}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local_heuristic">Local heuristic</SelectItem>
                          <SelectItem value="gemini">Gemini</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{settingsUiCopy.autoExtractKeywordsOnImport}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.autoExtractKeywordsOnImportDescription}</p>
                      </div>
                      <Checkbox
                        checked={settings.autoKeywordExtractionOnImport}
                        onCheckedChange={(checked) => updateSettings('autoKeywordExtractionOnImport', !!checked)}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{settingsUiCopy.autoRequestGeminiOnImport}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.autoRequestGeminiOnImportDescription}</p>
                      </div>
                      <Checkbox
                        checked={settings.autoGeminiOnImport}
                        onCheckedChange={(checked) => updateSettings('autoGeminiOnImport', !!checked)}
                      />
                    </div>

                    <div className={cn('space-y-2 rounded-lg border border-border/60 p-3', settings.keywordEngine === 'local_heuristic' ? 'bg-muted/20' : 'bg-background')}>
                      <Label className="text-sm font-medium">Gemini API Key</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Optional. Add your own Gemini key for AI keyword extraction.</p>
                      <p className="text-xs text-muted-foreground">
                        Request one in{' '}
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary underline underline-offset-4"
                        >
                          Gemini Studio
                        </a>
                        {' '}and paste the generated API key here.
                      </p>
                      <Input
                        type="password"
                        value={settings.geminiApiKey}
                        onChange={(event) => updateSettings('geminiApiKey', event.target.value)}
                        className="mt-2"
                        placeholder="Leave blank to keep Gemini disabled."
                      />
                    </div>

                    <div className={cn('space-y-2 rounded-lg border border-border/60 p-3', settings.keywordEngine === 'local_heuristic' ? 'bg-muted/20' : 'bg-background')}>
                      <Label className="text-sm font-medium">Gemini Model</Label>
                      <Select
                        value={settings.geminiModel}
                        onValueChange={(value) => updateSettings('geminiModel', value)}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GEMINI_MODEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {GEMINI_MODEL_OPTIONS.find((option) => option.value === settings.geminiModel)?.description ?? 'Choose the preferred Gemini model.'}
                      </p>
                    </div>

                    <div className={cn('space-y-2 rounded-lg border border-border/60 p-3', settings.keywordEngine === 'local_heuristic' ? 'bg-muted/20' : 'bg-background')}>
                      <Label className="text-sm font-medium">Gemini Extraction Scope</Label>
                      <Select
                        value={settings.keywordExtractionMode}
                        onValueChange={(value) => updateSettings('keywordExtractionMode', value as StoredAppSettings['keywordExtractionMode'])}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="page1">First page only</SelectItem>
                          <SelectItem value="full">Full document (paid)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className={cn('space-y-2 rounded-lg border border-border/60 p-3', settings.keywordEngine === 'local_heuristic' ? 'bg-muted/20' : 'bg-background')}>
                      <Label className="text-sm font-medium">Daily AI auto limit</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={settings.dailyAiAutoLimit}
                        onChange={(event) =>
                          updateSettings(
                            'dailyAiAutoLimit',
                            String(Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0)),
                          )
                        }
                        className="mt-2"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{processingCopy.ocrScan}</CardTitle>
                  <CardDescription>{processingCopy.ocrScanDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {processingCopy.ocrEligible
                        .replace('{count}', String(eligibleOcrDocuments.length))
                        .replace('{suffix}', eligibleOcrDocuments.length === 1 ? '' : 's')}
                    </p>
                    <Button variant="outline" onClick={() => void handleScanAllOcr()} disabled={isScanningOcr || eligibleOcrDocuments.length === 0}>
                      {isScanningOcr ? processingCopy.scanning : processingCopy.scanAllOcr}
                    </Button>
                    {ocrScanProgress.total > 0 ? (
                      <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{processingCopy.ocrProgress}</span>
                          <span className="text-muted-foreground">{ocrScanProgress.finished}/{ocrScanProgress.total}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.max(ocrScanProgress.percent, ocrScanProgress.finished > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{ocrScanProgress.complete} {processingCopy.completed}</span>
                          <span>{ocrScanProgress.processing} {processingCopy.processing}</span>
                          <span>{ocrScanProgress.failed} {processingCopy.failed}</span>
                        </div>
                      </div>
                    ) : null}
                    {ocrScanStatus ? (
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {ocrScanStatus}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{processingCopy.semanticClassificationTitle}</CardTitle>
                    <CardDescription>{processingCopy.semanticClassificationDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {settings.advancedClassificationMode === 'off'
                        ? processingCopy.semanticClassificationDisabled
                        : processingCopy.classificationEligible
                          .replace('{count}', String(eligibleClassificationDocuments.length))
                          .replace('{suffix}', eligibleClassificationDocuments.length === 1 ? '' : 's')}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => void handleClassifyAllDocuments()}
                      disabled={isClassifyingDocuments || settings.advancedClassificationMode === 'off' || eligibleClassificationDocuments.length === 0}
                    >
                      {isClassifyingDocuments ? processingCopy.classifying : processingCopy.classifyAll}
                    </Button>
                    {classificationProgress.total > 0 ? (
                      <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{processingCopy.classificationProgress}</span>
                          <span className="text-muted-foreground">{classificationProgress.finished}/{classificationProgress.total}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.max(classificationProgress.percent, classificationProgress.finished > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{classificationProgress.complete} {processingCopy.completed}</span>
                          <span>{classificationProgress.processing} {processingCopy.processing}</span>
                          <span>{classificationProgress.failed} {processingCopy.failed}</span>
                        </div>
                      </div>
                    ) : null}
                    {classificationRunStatus ? (
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {classificationRunStatus}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{settingsUiCopy.doiLinks}</CardTitle>
                    <CardDescription>{t('settings.recheckDoiDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button variant="outline" onClick={() => void handleRecheckDoiReferences()} disabled={isRecheckingDoiReferences}>
                      {isRecheckingDoiReferences ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {isRecheckingDoiReferences ? settingsUiCopy.rechecking : settingsUiCopy.recheckDoiLinks}
                    </Button>
                    {doiReferenceStatus ? (
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {doiReferenceStatus}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'data' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Cloud className="h-4 w-4" />
                      {t('settings.remoteVault.title')}
                    </CardTitle>
                    <CardDescription>{t('settings.remoteVault.description')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                      <div>
                        <Label className="text-sm">{t('settings.remoteVault.path')}</Label>
                        <Input
                          className="mt-1.5"
                          value={settings.remoteVaultPath || remoteVaultStatus?.path || ''}
                          readOnly
                          placeholder={t('settings.remoteVault.notConfigured')}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">{t('settings.remoteVault.cacheLimit')}</Label>
                        <Input
                          className="mt-1.5"
                          type="number"
                          min={64}
                          step={64}
                          value={settings.remoteCacheLimitMb}
                          onChange={(event) =>
                            updateSettings(
                              'remoteCacheLimitMb',
                              Math.max(64, Number.parseInt(event.target.value || '2048', 10) || 2048),
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{t('settings.remoteVault.status')}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {getRemoteVaultDisplayMessage(t, remoteVaultStatus)}
                          </p>
                        </div>
                        <Badge variant={remoteVaultStatus?.isWritable ? 'default' : 'secondary'}>
                          {getRemoteVaultModeLabel(t, remoteVaultStatus)}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 text-xs text-muted-foreground md:grid-cols-4">
                        <span>{t('settings.remoteVault.revision')}: {remoteVaultStatus?.revision ?? '-'}</span>
                        <span>{t('settings.remoteVault.lastPulled')}: {formatRemoteDate(remoteVaultStatus?.remoteLastPulledAt)}</span>
                        <span>{t('settings.remoteVault.lastPushed')}: {formatRemoteDate(remoteVaultStatus?.remoteLastPushedAt)}</span>
                        <span>{t('settings.remoteVault.cache')}: {formatRemoteBytes(remoteVaultStatus?.cacheBytes)}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-border/80 bg-background/70 p-4">
                        <p className="text-sm font-medium">{t('settings.remoteVault.setupTitle')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {hasRemoteVault
                            ? t('settings.remoteVault.connectedSetupDescription')
                            : t('settings.remoteVault.localOnlySetupDescription')}
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {!hasRemoteVault ? (
                            <>
                              <Button variant="outline" onClick={() => void handleJoinRemoteVault()} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                <Download className="mr-2 h-4 w-4" />
                                {t('settings.remoteVault.joinExisting')}
                              </Button>
                              <Button onClick={() => void handleMigrateRemoteVault()} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                {isRemoteVaultBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                {t('settings.remoteVault.createRemote')}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="outline" onClick={() => void handleChooseRemoteVaultFolder()} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                <FolderOpen className="mr-2 h-4 w-4" />
                                {t('settings.remoteVault.changeFolder')}
                              </Button>
                              <Button variant="outline" onClick={() => setIsJoinAnotherVaultDialogOpen(true)} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                <Download className="mr-2 h-4 w-4" />
                                {t('settings.remoteVault.joinAnother')}
                              </Button>
                              <Button variant="outline" onClick={() => void withRemoteVaultBusy(() => repo.migrateRemoteVaultToLocal())} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                <HardDrive className="mr-2 h-4 w-4" />
                                {t('settings.remoteVault.migrateToLocal')}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {hasRemoteVault ? (
                        <>
                          <div className="rounded-xl border border-border/80 bg-background/70 p-4">
                            <p className="text-sm font-medium">{t('settings.remoteVault.syncTitle')}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t('settings.remoteVault.syncDescription')}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              <Button variant="outline" onClick={() => void withRemoteVaultBusy(() => repo.pullRemoteVault())} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                <Download className="mr-2 h-4 w-4" />
                                {t('settings.remoteVault.pull')}
                              </Button>
                              {canPushRemoteVault ? (
                                <Button variant="outline" onClick={() => void withRemoteVaultBusy(() => repo.pushRemoteVault())} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                  <Upload className="mr-2 h-4 w-4" />
                                  {t('settings.remoteVault.push')}
                                </Button>
                              ) : null}
                              <Button variant="ghost" onClick={() => void loadRemoteVaultStatus()} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {t('settings.remoteVault.refreshStatus')}
                              </Button>
                            </div>
                          </div>

                          <div className="rounded-xl border border-border/80 bg-background/70 p-4">
                            <p className="text-sm font-medium">{t('settings.remoteVault.maintenanceTitle')}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t('settings.remoteVault.maintenanceDescription')}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {canReleaseRemoteLease ? (
                                <Button variant="outline" onClick={() => void withRemoteVaultBusy(() => repo.releaseRemoteVaultLease())} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  {t('settings.remoteVault.releaseLease')}
                                </Button>
                              ) : null}
                              <Button variant="outline" onClick={() => void withRemoteVaultBusy(() => repo.clearRemoteCache())} disabled={!isDesktopApp || isRemoteVaultBusy}>
                                <HardDrive className="mr-2 h-4 w-4" />
                                {t('settings.remoteVault.freeLocalSpace')}
                              </Button>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                    {remoteVaultMessage ? (
                      <p className="text-xs text-muted-foreground">
                        {isRemoteVaultBusy ? t('settings.remoteVault.working') : remoteVaultMessage}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {isRemoteVaultBackupMode ? settingsUiCopy.vaultBackups : settingsUiCopy.backups}
                    </CardTitle>
                    <CardDescription>
                      {isRemoteVaultBackupMode ? settingsUiCopy.vaultBackupsDescription : settingsUiCopy.backupsDescription}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">{settingsUiCopy.automaticBackups}</Label>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {isRemoteVaultBackupMode
                              ? settingsUiCopy.vaultAutomaticBackupsDescription
                              : settingsUiCopy.automaticBackupsDescription}
                          </p>
                        </div>
                        <Checkbox
                          checked={settings.autoBackupEnabled}
                          onCheckedChange={(checked) => updateSettings('autoBackupEnabled', !!checked)}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        {!isRemoteVaultBackupMode ? (
                          <div>
                            <Label className="text-sm">{settingsUiCopy.backupScope}</Label>
                            <Select
                              value={settings.autoBackupScope}
                              onValueChange={(value) => updateSettings('autoBackupScope', value as StoredAppSettings['autoBackupScope'])}
                            >
                              <SelectTrigger className="mt-1.5">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full">{settingsUiCopy.everything}</SelectItem>
                                <SelectItem value="documents">{settingsUiCopy.documentsOnly}</SelectItem>
                                <SelectItem value="settings">{settingsUiCopy.settingsOnly}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}

                        <div>
                          <Label className="text-sm">{settingsUiCopy.frequencyInDays}</Label>
                          <Input
                            className="mt-1.5"
                            type="number"
                            min={1}
                            step={1}
                            value={settings.autoBackupIntervalDays}
                            onChange={(event) =>
                              updateSettings(
                                'autoBackupIntervalDays',
                                String(Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1)),
                              )
                            }
                          />
                        </div>

                        <div>
                          <Label className="text-sm">{settingsUiCopy.keepBackups}</Label>
                          <Input
                            className="mt-1.5"
                            type="number"
                            min={1}
                            max={10}
                            step={1}
                            value={settings.autoBackupKeepCount}
                            onChange={(event) =>
                              updateSettings(
                                'autoBackupKeepCount',
                                String(
                                  Math.min(10, Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1)),
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        {isRemoteVaultBackupMode ? settingsUiCopy.manualVaultBackup : settingsUiCopy.manualBackupExport}
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {isRemoteVaultBackupMode ? (
                          <Button
                            variant="outline"
                            onClick={() => void handleCreateBackup('full')}
                            disabled={isCreatingBackup || !canWriteRemoteVaultBackups}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {settingsUiCopy.createVaultBackup}
                          </Button>
                        ) : (
                          <>
                            <Button variant="outline" onClick={() => void handleCreateBackup('full')} disabled={isCreatingBackup}>
                              <Download className="mr-2 h-4 w-4" />
                              {settingsUiCopy.everything}
                            </Button>
                            <Button variant="outline" onClick={() => void handleCreateBackup('documents')} disabled={isCreatingBackup}>
                              <Download className="mr-2 h-4 w-4" />
                              {settingsUiCopy.documentsOnly}
                            </Button>
                            <Button variant="outline" onClick={() => void handleCreateBackup('settings')} disabled={isCreatingBackup}>
                              <Download className="mr-2 h-4 w-4" />
                              {settingsUiCopy.settingsOnly}
                            </Button>
                            <Button variant="outline" onClick={() => void handleRestoreFromFile()} disabled={isRestoringBackup}>
                              <Upload className="mr-2 h-4 w-4" />
                              {settingsUiCopy.restoreFile}
                            </Button>
                          </>
                        )}
                      </div>
                      {backupStatus ? <p className="text-xs text-muted-foreground">{backupStatus}</p> : null}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">
                          {isRemoteVaultBackupMode ? settingsUiCopy.vaultBackupList : settingsUiCopy.automaticBackups}
                        </Label>
                        <Button variant="ghost" size="sm" onClick={() => void loadBackups()}>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          {settingsUiCopy.refresh}
                        </Button>
                      </div>

                      {backups.length === 0 ? (
                        <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                          {isRemoteVaultBackupMode ? settingsUiCopy.noVaultBackupsYet : settingsUiCopy.noAutomaticBackupsYet}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {backups.map((backup) => (
                            <div key={backup.path} className="rounded-xl border border-border/80 bg-background/70 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{backup.fileName}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {isRemoteVaultBackup(backup)
                                      ? `revision ${backup.revision} | ${backup.documentCount} docs | ${backup.noteCount} notes | ${backup.relationCount} links | ${backup.blobCount} files | ${formatRemoteBytes(backup.fileSize)}`
                                      : `${backup.scope} | ${backup.documentCount} docs | ${backup.noteCount} notes | ${backup.relationCount} links`}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">{new Date(backup.createdAt).toLocaleString()}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenRestoreWarning(backup.path)}
                                    disabled={isRestoringBackup || (isRemoteVaultBackupMode && !canWriteRemoteVaultBackups)}
                                  >
                                    {settingsUiCopy.restore}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setBackupDeleteTargetPath(backup.path)}
                                    disabled={isRemoteVaultBackupMode && !canWriteRemoteVaultBackups}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-red-200/70 bg-red-50/80">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-red-900">
                      <ShieldAlert className="h-4 w-4" />
                      {settingsUiCopy.dangerZone}
                    </CardTitle>
                    <CardDescription className="text-red-800">{settingsUiCopy.irreversible}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="destructive" className="w-full" onClick={() => setIsClearDataDialogOpen(true)} disabled={isClearing}>
                      {isClearing ? t('settings.clearing') : t('settings.clearLocalData')}
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

            {activeSection === 'about' && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Application</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Mode</span>
                      <Badge variant="secondary">{isDesktopApp ? 'Desktop' : 'Preview'}</Badge>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Version</span>
                      <Badge variant="secondary">v{displayVersion}</Badge>
                    </div>
                    {isDevSplashPreviewAvailable ? (
                      <>
                        <Separator />
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                          <p className="text-sm font-medium">{settingsUiCopy.splashPreview}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{settingsUiCopy.splashPreviewDescription}</p>
                          <Button variant="outline" className="mt-3" onClick={handlePreviewLoadingSplash}>
                            <Sparkles className="mr-2 h-4 w-4" />
                            {settingsUiCopy.splashPreview}
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t('settings.appUpdates')}</CardTitle>
                    <CardDescription>{t('settings.appUpdatesDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">{t('settings.checkAutomatically')}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{t('settings.checkAutomaticallyHelp')}</p>
                      </div>
                      <Checkbox
                        checked={settings.autoCheckForUpdates}
                        onCheckedChange={(checked) => updateSettings('autoCheckForUpdates', !!checked)}
                      />
                    </div>

                    <Separator />

                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={() => void handleCheckForUpdates()} disabled={isCheckingUpdates}>
                        {isCheckingUpdates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {isCheckingUpdates ? t('settings.checking') : t('settings.checkForUpdates')}
                      </Button>
                      <Button onClick={() => void handleInstallUpdate()} disabled={isInstallingUpdate || !availableUpdate}>
                        {isInstallingUpdate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {isInstallingUpdate ? t('updateDialog.installing') : t('settings.downloadInstall')}
                      </Button>
                    </div>

                    {updateStatus ? (
                      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {updateStatus}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 pr-4">
                        <Label className="text-sm font-medium">{settingsUiCopy.anonymousUsageStats}</Label>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{isUsageTelemetryConfigured() ? 'Configured' : 'Missing'}</span>
                          <span>•</span>
                          <span className="max-w-[10rem] truncate">
                            {settings.usageInstallId || 'No install ID'}
                          </span>
                          <span>•</span>
                          <span>
                            {settings.usageTelemetryLastSentAt
                              ? new Date(settings.usageTelemetryLastSentAt).toLocaleString()
                              : 'Never sent'}
                          </span>
                        </div>
                      </div>
                      <Checkbox
                        checked={settings.shareAnonymousUsageStats}
                        onCheckedChange={(checked) => updateSettings('shareAnonymousUsageStats', !!checked)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
      <AppUpdateDialog
        open={isUpdateDialogOpen}
        onOpenChange={setIsUpdateDialogOpen}
        update={availableUpdate}
        isInstalling={isInstallingUpdate}
        installStatus={updateStatus}
        onInstall={() => void handleInstallUpdate()}
        locale={locale}
      />
      <AlertDialog
        open={isClearDataDialogOpen}
        onOpenChange={(open) => {
          if (!isClearing) {
            setIsClearDataDialogOpen(open)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{settingsUiCopy.clearLocalDataQuestion}</AlertDialogTitle>
            <AlertDialogDescription>{settingsUiCopy.clearLocalDataDialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleClearLocalData()} disabled={isClearing}>
              {isClearing ? t('settings.clearing') : t('settings.clearLocalData')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(backupDeleteTargetPath)}
        onOpenChange={(open) => {
          if (!open) {
            setBackupDeleteTargetPath(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.deleteBackupTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{settingsUiCopy.deleteBackupDialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!backupDeleteTargetPath) return
                void handleDeleteBackup(backupDeleteTargetPath)
              }}
            >
              {settingsUiCopy.deleteBackupAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={isJoinAnotherVaultDialogOpen}
        onOpenChange={(open) => {
          if (!isRemoteVaultBusy) {
            setIsJoinAnotherVaultDialogOpen(open)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.remoteVault.joinAnotherTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">{t('settings.remoteVault.joinAnotherDescription')}</span>
              <span className="block">{t('settings.remoteVault.joinAnotherDescription2')}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoteVaultBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void (async () => {
                  setIsJoinAnotherVaultDialogOpen(false)
                  await handleJoinRemoteVault()
                })()
              }}
              disabled={isRemoteVaultBusy}
            >
              {t('settings.remoteVault.confirmJoinAnother')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={isRestoreWarningOpen}
        onOpenChange={(open) => {
          if (!isRestoringBackup) {
            setIsRestoreWarningOpen(open)
            if (!open) {
              setRestoreTargetPath(null)
            }
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRemoteVaultBackupMode ? settingsUiCopy.restoreVaultBackup : t('settings.restoreBackupTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                {isRemoteVaultBackupMode
                  ? settingsUiCopy.vaultBackupRestoreSafetyDescription
                  : settingsUiCopy.restoreBackupSafetyDescription}
              </span>
              <span className="block">
                {isRemoteVaultBackupMode
                  ? settingsUiCopy.vaultBackupRestoreSafetyDescription2
                  : settingsUiCopy.restoreBackupSafetyDescription2}
              </span>
              <span className="block font-medium text-foreground">
                {isRemoteVaultBackupMode
                  ? settingsUiCopy.vaultBackupRestoreSafetyDescription3
                  : settingsUiCopy.restoreBackupSafetyDescription3}
              </span>
              {restoreTargetPath ? (
                <span className="block rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-xs text-foreground/80">
                  {settingsUiCopy.restoreSource.replace('{path}', restoreTargetPath)}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoringBackup}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRestoreBackup()} disabled={isRestoringBackup}>
              {isRestoringBackup
                ? settingsUiCopy.restoring
                : isRemoteVaultBackupMode
                  ? settingsUiCopy.restoreVaultBackup
                  : settingsUiCopy.createSafetyBackupAndRestore}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
