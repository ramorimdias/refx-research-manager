import {
  Atom,
  BookMarked,
  BookOpen,
  Bookmark,
  Brain,
  ChartColumn,
  FileText,
  Files,
  FlaskConical,
  FolderOpen,
  Globe,
  GraduationCap,
  Landmark,
  LibraryBig,
  Lightbulb,
  Microscope,
  Newspaper,
  PenTool,
  ScrollText,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export const DEFAULT_LIBRARY_ICON = 'library-big'

export type LibraryIconOption = {
  value: string
  label: string
  icon: LucideIcon
}

export const LIBRARY_ICON_OPTIONS: readonly LibraryIconOption[] = [
  { value: 'library-big', label: 'Library', icon: LibraryBig },
  { value: 'book-open', label: 'Open book', icon: BookOpen },
  { value: 'book-marked', label: 'Marked book', icon: BookMarked },
  { value: 'bookmark', label: 'Bookmark', icon: Bookmark },
  { value: 'folder-open', label: 'Folder', icon: FolderOpen },
  { value: 'file-text', label: 'Document', icon: FileText },
  { value: 'files', label: 'Files', icon: Files },
  { value: 'scroll-text', label: 'Scroll', icon: ScrollText },
  { value: 'newspaper', label: 'Newspaper', icon: Newspaper },
  { value: 'graduation-cap', label: 'Academic', icon: GraduationCap },
  { value: 'flask-conical', label: 'Lab', icon: FlaskConical },
  { value: 'microscope', label: 'Research', icon: Microscope },
  { value: 'atom', label: 'Science', icon: Atom },
  { value: 'brain', label: 'Ideas', icon: Brain },
  { value: 'lightbulb', label: 'Insights', icon: Lightbulb },
  { value: 'pen-tool', label: 'Writing', icon: PenTool },
  { value: 'globe', label: 'World', icon: Globe },
  { value: 'landmark', label: 'History', icon: Landmark },
  { value: 'chart-column', label: 'Data', icon: ChartColumn },
  { value: 'sparkles', label: 'Highlights', icon: Sparkles },
]

const LIBRARY_ICON_MAP = Object.fromEntries(
  LIBRARY_ICON_OPTIONS.map((option) => [option.value, option.icon]),
) as Record<string, LucideIcon>

const LIBRARY_ICON_LABEL_MAP = Object.fromEntries(
  LIBRARY_ICON_OPTIONS.map((option) => [option.value, option.label]),
) as Record<string, string>

export function normalizeLibraryIcon(icon?: string | null) {
  return icon && LIBRARY_ICON_MAP[icon] ? icon : DEFAULT_LIBRARY_ICON
}

export function getLibraryIcon(icon?: string | null) {
  return LIBRARY_ICON_MAP[normalizeLibraryIcon(icon)] ?? LibraryBig
}

export function getLibraryIconLabel(icon?: string | null) {
  return LIBRARY_ICON_LABEL_MAP[normalizeLibraryIcon(icon)] ?? LIBRARY_ICON_LABEL_MAP[DEFAULT_LIBRARY_ICON]
}
