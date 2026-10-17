import images from './portrait-assets.json' with { type: 'json' }

const portraits = ['General Assistant', 'Engineering', 'Design', 'Administration', 'Operations', 'Finance', 'Sales']
  .map((label, index) => ({ id: `portrait-${index + 1}`, label, image: images[index] }))

export const ASSISTANT_PORTRAIT = portraits[0]
export const PORTRAITS = portraits.slice(1)
export const portraitsFor = generalAssistant => generalAssistant === true ? portraits : PORTRAITS
// Recognize saved portraits even when they are no longer offered to new employees.
export const isPortrait = image => portraits.some(portrait => portrait.image === image)
