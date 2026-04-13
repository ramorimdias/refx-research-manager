'use client'

import { Download, Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { AppUpdateSummary } from '@/lib/services/app-update-service'
import { translate, type AppLocale } from '@/lib/localization'

type AppUpdateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  update: AppUpdateSummary | null
  isInstalling: boolean
  installStatus: string | null
  onInstall: () => void
  locale?: AppLocale
}

export function AppUpdateDialog({
  open,
  onOpenChange,
  update,
  isInstalling,
  installStatus,
  onInstall,
  locale = 'en',
}: AppUpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!isInstalling ? onOpenChange(nextOpen) : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {translate(locale, 'updateDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {update
              ? translate(locale, 'updateDialog.descriptionVersion', { version: update.version })
              : translate(locale, 'updateDialog.descriptionFallback')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            {translate(locale, 'updateDialog.installModeHint')}
          </p>

          {update?.publishedAt ? (
            <p className="text-sm text-muted-foreground">{translate(locale, 'updateDialog.published', { value: new Date(update.publishedAt).toLocaleString(locale) })}</p>
          ) : null}

          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{translate(locale, 'updateDialog.releaseNotes')}</p>
            <div className="max-h-56 overflow-auto whitespace-pre-wrap text-sm text-foreground">
              {update?.notes || translate(locale, 'updateDialog.noNotes')}
            </div>
          </div>

          {installStatus ? (
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
              {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {installStatus}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isInstalling}>
            {translate(locale, 'updateDialog.later')}
          </Button>
          <Button onClick={onInstall} disabled={isInstalling || !update}>
            {isInstalling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isInstalling ? translate(locale, 'updateDialog.installing') : translate(locale, 'updateDialog.downloadInstall')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
