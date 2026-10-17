import * as React from 'react'

const { useCallback, useEffect, useMemo, useRef, useState, createElement: h } = React
const createContext = React.createContext ?? (() => ({ Provider: ({ children }) => children }))
const useContext = React.useContext ?? (() => null)
const Children = React.Children ?? { map: (children, fn) => (Array.isArray(children) ? children : [children]).filter(Boolean).map(fn) }
const cloneElement = React.cloneElement ?? ((el, props) => (el && typeof el === 'object' ? { ...el, props: { ...el.props, ...props } } : el))

const DEFAULT_SPRING = { mass: 0.1, stiffness: 150, damping: 12 }
const DEFAULT_MAGNIFICATION = 78
const DEFAULT_DISTANCE = 140
const DEFAULT_PANEL_HEIGHT = 72
const BASE_ITEM_WIDTH = 58
const BASE_ICON_SIZE = 36
const MAGNIFIED_ICON_SIZE = 50

const DockContext = createContext(null)

export function useDock() {
  const context = useContext(DockContext)
  return context || {}
}

export function DockProvider({ children, value }) {
  return h(DockContext.Provider, { value }, children)
}

// Damped spring simulation identical to framer-motion spring physics (mass: 0.1, stiffness: 150, damping: 12)
function createSpring(mass = 0.1, stiffness = 150, damping = 12, initial = 0) {
  let current = initial
  let target = initial
  let velocity = 0
  return {
    get current() { return current },
    get target() { return target },
    set target(val) { target = val },
    jump(val) { current = val; target = val; velocity = 0 },
    step(dt) {
      if (Math.abs(current - target) < 0.08 && Math.abs(velocity) < 0.6) {
        current = target
        velocity = 0
        return false
      }
      const force = -stiffness * (current - target) - damping * velocity
      const accel = force / mass
      velocity += accel * dt
      current += velocity * dt
      return true
    },
  }
}

export function Dock({
  children,
  className = '',
  spring = DEFAULT_SPRING,
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  panelHeight = DEFAULT_PANEL_HEIGHT,
  role = 'toolbar',
  'aria-label': ariaLabel = 'Application dock',
  style = {},
  ...rest
}) {
  const dockRef = useRef(null)
  const itemsRef = useRef(new Set())
  const mouseX = useRef(Infinity)
  const isHovered = useRef(false)
  const [hoveredIdx, setHoveredIdx] = useState(-1)
  const hoveredRef = useRef(-1)
  const frameId = useRef(0)
  const lastTime = useRef(0)

  // Animation frame loop for macOS spring dock physics
  const tick = (now) => {
    const dt = Math.min(0.04, Math.max(0.001, (now - (lastTime.current || now)) / 1000))
    lastTime.current = now

    // Step item widths
    let itemsMoving = false
    const mX = mouseX.current
    let closestIdx = -1
    let closestDist = Infinity

    itemsRef.current.forEach(item => {
      if (!item.element) return
      let targetW = BASE_ITEM_WIDTH
      if (isHovered.current && Number.isFinite(mX)) {
        const rect = item.element.getBoundingClientRect?.()
        if (rect && rect.width > 0) {
          const centerX = rect.left + rect.width / 2
          const d = Math.abs(mX - centerX)
          if (d < distance) {
            const curve = Math.cos((d / distance) * (Math.PI / 2))
            targetW = BASE_ITEM_WIDTH + (magnification - BASE_ITEM_WIDTH) * curve
          }
          if (d < closestDist) {
            closestDist = d
            closestIdx = item.index
          }
        }
      }
      item.spring.target = targetW
      // Integrate in small steps so a slow frame cannot destabilize the spring.
      let moving = false
      const steps = Math.ceil(dt / 0.008)
      for (let i = 0; i < steps; i++) moving = item.spring.step(dt / steps) || moving
      if (moving) itemsMoving = true

      const curW = Math.round(item.spring.current * 10) / 10
      const iconRatio = (curW - BASE_ITEM_WIDTH) / (magnification - BASE_ITEM_WIDTH || 1)
      const curIconSize = BASE_ICON_SIZE + (MAGNIFIED_ICON_SIZE - BASE_ICON_SIZE) * Math.max(0, Math.min(1, iconRatio))

      // Keep hit boxes fixed: magnification must never move the next target.
      item.element.style?.setProperty?.('--dock-icon-scale', String(curIconSize / BASE_ICON_SIZE))
    })

    const nextHovered = isHovered.current && closestDist <= 48 ? closestIdx : -1
    if (hoveredRef.current !== nextHovered) {
      hoveredRef.current = nextHovered
      setHoveredIdx(nextHovered)
    }

    if (itemsMoving || isHovered.current) {
      if (typeof requestAnimationFrame !== 'undefined') {
        frameId.current = requestAnimationFrame(tick)
      }
    } else {
      frameId.current = 0
    }
  }

  const startLoop = () => {
    if (!frameId.current && typeof requestAnimationFrame !== 'undefined') {
      lastTime.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
      frameId.current = requestAnimationFrame(tick)
    }
  }

  const registerItem = useCallback((itemData) => {
    itemsRef.current.add(itemData)
    return () => { itemsRef.current.delete(itemData) }
  }, [])

  const handleMouseMove = (event) => {
    isHovered.current = true
    mouseX.current = event?.clientX ?? event?.pageX ?? Infinity
    startLoop()
  }

  const handleMouseLeave = () => {
    isHovered.current = false
    mouseX.current = Infinity
    itemsRef.current.forEach(item => { item.spring.target = BASE_ITEM_WIDTH })
    hoveredRef.current = -1
    setHoveredIdx(-1)
    startLoop()
  }

  useEffect(() => () => {
    if (frameId.current && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(frameId.current)
    }
  }, [])

  const contextValue = useMemo(() => ({
    registerItem,
    hoveredIdx,
    spring,
    distance,
    magnification,
  }), [hoveredIdx, spring, distance, magnification])

  return h('nav', {
    ref: dockRef,
    className: `bt-canvas-dock agent-dock ${className}`.trim(),
    style: {
      height: panelHeight,
      alignItems: 'flex-end',
      display: 'flex',
      ...style,
    },
    role,
    'aria-label': ariaLabel,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
    ...rest,
  },
    h(DockProvider, { value: contextValue },
      Children.map(children, (child, idx) => (child ? cloneElement(child, { index: idx }) : null))))
}

export function DockItem({
  children,
  className = '',
  index = 0,
  style = {},
  onMouseEnter,
  onMouseLeave,
  ...rest
}) {
  const itemRef = useRef(null)
  const dockContext = useDock()
  const registerItem = dockContext?.registerItem
  const hoveredIdx = dockContext?.hoveredIdx ?? -1
  const spring = dockContext?.spring || { mass: 0.1, stiffness: 150, damping: 12 }
  const springRef = useRef(null)

  if (!springRef.current) {
    springRef.current = createSpring(spring.mass, spring.stiffness, spring.damping, BASE_ITEM_WIDTH)
  }

  useEffect(() => {
    if (!registerItem) return undefined
    const itemData = {
      index,
      element: itemRef.current,
      spring: springRef.current,
    }
    return registerItem(itemData)
  }, [index, registerItem])

  const isItemHovered = hoveredIdx === index

  const handleMouseEnter = (event) => {
    onMouseEnter?.(event)
  }
  const handleMouseLeave = (event) => {
    onMouseLeave?.(event)
  }

  return h('button', {
    ref: itemRef,
    type: 'button',
    className: `bt-canvas-dock-item dock-item ${className}`.trim(),
    style: {
      width: 'var(--dock-item-width, 58px)',
      height: '100%',
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-end',
      position: 'relative',
      ...style,
    },
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    tabIndex: 0,
    role: 'button',
    'aria-haspopup': 'true',
    ...rest,
  },
    Children.map(children, child => {
      if (!child) return null
      if (typeof child === 'object' && child.type === DockLabel) {
        return cloneElement(child, { isVisible: isItemHovered })
      }
      return child
    }))
}

export function DockLabel({ children, className = '', isVisible = false, ...rest }) {
  return h('span', {
    className: `bt-dock-label-floating ${className}`.trim(),
    'data-visible': String(Boolean(isVisible)),
    role: 'tooltip',
    ...rest,
  }, children)
}

export function DockIcon({ children, className = '', style = {}, ...rest }) {
  return h('div', {
    className: `bt-dock-icon-wrap ${className}`.trim(),
    style: {
      width: 'var(--dock-icon-size, 36px)',
      height: 'var(--dock-icon-size, 36px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 'none',
      ...style,
    },
    ...rest,
  }, children)
}
