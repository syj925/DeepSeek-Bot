/**
 * Avatar background color utilities.
 *
 * All colorful backgrounds have been removed per user request:
 * Avatar backgrounds are strictly transparent / clean without colored backgrounds.
 */

// Previous 30-color palette preserved for reference
export const PREVIOUS_PALETTE = [
  // Monday 主色：8 色
  '#6161FF',
  '#00CA72',
  '#FFCC00',
  '#FB275D',
  '#97AEFF',
  '#DED4FC',
  '#00D2D2',
  '#2E19AA',

  // 参考图上方色块：22 色，按原图逐行排列
  '#7FEDC9', '#FFB413', '#579BFC', // 第 1 行
  '#49ABFF', '#5DBAFF', '#1DCC70', // 第 2 行
  '#FF8A76', '#1789F3', '#F9A633', // 第 3 行
  '#FF5556', '#FFB830', '#BEAAFF', // 第 4 行
  '#FF5CA6', '#FF7B8E', '#E43952', // 第 5 行
  '#7B4BFF', '#00C875', '#6666FF', // 第 6 行
  '#FFDF55', '#FDAB3D', '#8080FF', '#5050FF' // 第 7 行
]

// All avatar background colors are removed (transparent)
export const AVATAR_BG_COLORS = ['transparent']

/**
 * Get avatar background color (all colorful backgrounds removed -> transparent)
 */
export function getAvatarBgColor() {
  return 'transparent'
}

export const TEXT_LIGHT = '#FFFFFF'
export const TEXT_DARK = '#181B34'

export function getContrastTextColor() {
  return TEXT_DARK
}

/**
 * Return theme styling object with transparent background
 */
export function getAvatarTheme() {
  return {
    backgroundColor: 'transparent',
    color: TEXT_DARK,
    style: {
      backgroundColor: 'transparent',
      color: TEXT_DARK
    }
  }
}

/**
 * Reusable Letter / Text Avatar props builder with transparent background
 */
export function getLetterAvatarProps({
  name = '?',
  userId,
  size = 36,
  className = '',
  style = {}
}) {
  const effectiveId = userId ?? name
  const text = (String(name).trim().slice(0, 2) || '?').toUpperCase()
  const fontSize = Math.max(10, Math.round(size * 0.42))

  return {
    className: ['bt-letter-avatar', className].filter(Boolean).join(' '),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      minWidth: size,
      minHeight: size,
      borderRadius: '50%',
      backgroundColor: 'transparent',
      color: TEXT_DARK,
      fontSize: `${fontSize}px`,
      fontWeight: 600,
      lineHeight: 1,
      userSelect: 'none',
      flexShrink: 0,
      boxSizing: 'border-box',
      ...style
    },
    'data-user-id': effectiveId,
    'aria-label': name,
    text
  }
}
