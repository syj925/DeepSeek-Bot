import images from './portrait-assets.json' with { type: 'json' }
import legacyImages from './legacy-portrait-assets.json' with { type: 'json' }

const portraits = ['General Assistant', 'Engineering', 'Design', 'Administration', 'Operations', 'Finance', 'Sales']
  .map((label, index) => ({ id: `portrait-${index + 1}`, label, image: images[index] }))

const legacyMap = new Map(legacyImages.map((legacy, index) => [legacy, images[index]]))

export function normalizePortraitImage(image) {
  if (!image) return image
  return legacyMap.get(image) ?? image
}

export const ASSISTANT_PORTRAIT = portraits[0]
export const PORTRAITS = portraits.slice(1)
export const portraitsFor = generalAssistant => generalAssistant === true ? portraits : PORTRAITS
// Recognize saved portraits even when they are no longer offered to new employees.
export const isPortrait = image => portraits.some(portrait => portrait.image === image) || legacyMap.has(image)

