import type { DiscoverJourney, DiscoverJourneyStep } from '@/lib/types'

export function countDiscoverStepStars(step: DiscoverJourneyStep): number {
  const starredWorkIds = new Set<string>()

  if (step.sourceWork.isStarred) {
    starredWorkIds.add(step.sourceWork.id)
  }

  for (const item of step.items) {
    if (item.isStarred) {
      starredWorkIds.add(item.id)
    }
  }

  return starredWorkIds.size
}

export function countDiscoverJourneyStars(journey: DiscoverJourney): number {
  const starredWorkIds = new Set<string>()

  for (const step of journey.steps) {
    if (step.sourceWork.isStarred) {
      starredWorkIds.add(step.sourceWork.id)
    }

    for (const item of step.items) {
      if (item.isStarred) {
        starredWorkIds.add(item.id)
      }
    }
  }

  return starredWorkIds.size
}
