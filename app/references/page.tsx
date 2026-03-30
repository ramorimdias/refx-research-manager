'use client'

import { Hammer } from 'lucide-react'
import { EmptyState } from '@/components/refx/common'

export default function ReferencesPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={Hammer}
        title="Work in progress"
        description="This area is still being built."
      />
    </div>
  )
}
