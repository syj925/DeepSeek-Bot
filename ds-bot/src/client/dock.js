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
  hoverRegionRef,
  hoverLift = 0,
  focusedIconSize = MAGNIFIED_ICON_SIZE,
  hoverExitDelay = 0,
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
  const geometryDirty = useRef(true)
  const exitTimer = useRef(null)

  // Animation frame loop for macOS spring dock physics
  const tick = (now) => {
    const dt = Math.min(0.04, Math.max(0.001, (now - (lastTime.current || now)) / 1000))
    lastTime.current = now

    if (geometryDirty.current && isHovered.current) {
      // Measure the fixed hit boxes together, before any scale writes.
      itemsRef.current.forEach(item => {
        const rect = item.element?.getBoundingClientRect?.()
        item.centerX = rect?.width > 0 ? rect.left + rect.width / 2 : Infinity
      })
      geometryDirty.current = false
    }

    // Step item widths
    let itemsMoving = false
    const mX = mouseX.current
    let closestIdx = -1
    let closestDist = Infinity

    itemsRef.current.forEach(item => {
      if (!item.element || !isHovered.current || !Number.isFinite(mX) || !Number.isFinite(item.centerX)) return
      const d = Math.abs(mX - item.centerX)
      if (d < closestDist) { closestDist = d; closestIdx = item.index }
    })
    const nextHovered = isHovered.current && closestDist <= 48 ? closestIdx : -1

    itemsRef.current.forEach(item => {
      if (!item.element) return
      let targetW = BASE_ITEM_WIDTH
      if (isHovered.current && Number.isFinite(mX)) {
        if (Number.isFinite(item.centerX)) {
          const d = Math.abs(mX - item.centerX)
          if (d < distance) {
            const curve = Math.cos((d / distance) * (Math.PI / 2))
            targetW = BASE_ITEM_WIDTH + (magnification - BASE_ITEM_WIDTH) * curve
          }
        }
      }
      item.spring.target = targetW
      item.liftSpring.target = item.index === nextHovered ? hoverLift : 0
      // Integrate in small steps so a slow frame cannot destabilize the spring.
      let moving = false
      const steps = Math.ceil(dt / 0.008)
      for (let i = 0; i < steps; i++) {
        moving = item.spring.step(dt / steps) || moving
        moving = item.liftSpring.step(dt / steps) || moving
      }
      if (moving) itemsMoving = true

      const curW = Math.round(item.spring.current * 10) / 10
      const iconRatio = (curW - BASE_ITEM_WIDTH) / (magnification - BASE_ITEM_WIDTH || 1)
      const liftProgress = hoverLift > 0 ? Math.max(0, Math.min(1, item.liftSpring.current / hoverLift)) : 0
      const curIconSize = BASE_ICON_SIZE + (MAGNIFIED_ICON_SIZE - BASE_ICON_SIZE) * Math.max(0, Math.min(1, iconRatio)) + (focusedIconSize - MAGNIFIED_ICON_SIZE) * liftProgress

      // Keep hit boxes fixed: magnification must never move the next target.
      const scale = (curIconSize / BASE_ICON_SIZE).toFixed(4)
      if (item.lastScale !== scale) {
        item.element.style?.setProperty?.('--dock-icon-scale', scale)
        item.lastScale = scale
      }
      const lift = `${-Math.round(item.liftSpring.current * 100) / 100}px`
      if (item.lastLift !== lift) {
        item.element.style?.setProperty?.('--dock-icon-lift', lift)
        item.lastLift = lift
      }
    })

    if (hoveredRef.current !== nextHovered) {
      hoveredRef.current = nextHovered
      setHoveredIdx(nextHovered)
    }

    if (itemsMoving) {
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
    geometryDirty.current = true
    return () => { itemsRef.current.delete(itemData); geometryDirty.current = true }
  }, [])

  const cancelExit = () => {
    if (exitTimer.current !== null && typeof clearTimeout !== 'undefined') clearTimeout(exitTimer.current)
    exitTimer.current = null
  }
  const handleMouseMove = (event) => {
    cancelExit()
    // Keep the last tab's animation target while interacting with its preview.
    if (hoverRegionRef && event?.target && !dockRef.current?.contains?.(event.target)) return
    if (!isHovered.current) geometryDirty.current = true
    isHovered.current = true
    mouseX.current = event?.clientX ?? event?.pageX ?? Infinity
    startLoop()
  }

  const resetHover = () => {
    exitTimer.current = null
    isHovered.current = false
    mouseX.current = Infinity
    itemsRef.current.forEach(item => { item.spring.target = BASE_ITEM_WIDTH })
    if (hoveredRef.current !== -1) {
      hoveredRef.current = -1
      setHoveredIdx(-1)
    }
    startLoop()
  }
  const handleMouseLeave = () => {
    cancelExit()
    if (hoverExitDelay > 0 && typeof setTimeout !== 'undefined') exitTimer.current = setTimeout(resetHover, hoverExitDelay)
    else resetHover()
  }

  useEffect(() => {
    const region = hoverRegionRef?.current
    const invalidateGeometry = () => {
      geometryDirty.current = true
      if (isHovered.current) startLoop()
    }
    region?.addEventListener('mousemove', handleMouseMove, { passive: true })
    region?.addEventListener('mouseleave', handleMouseLeave)
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', invalidateGeometry)
      window.addEventListener('scroll', invalidateGeometry, true)
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidateGeometry) : null
    if (dockRef.current) observer?.observe(dockRef.current)
    const container = (region ?? dockRef.current)?.parentElement
    if (container) observer?.observe(container)
    return () => {
      cancelExit()
      region?.removeEventListener('mousemove', handleMouseMove)
      region?.removeEventListener('mouseleave', handleMouseLeave)
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', invalidateGeometry)
        window.removeEventListener('scroll', invalidateGeometry, true)
      }
      observer?.disconnect()
      if (frameId.current && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frameId.current)
      frameId.current = 0
    }
  }, [hoverRegionRef, distance, magnification, hoverLift, focusedIconSize, hoverExitDelay])

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
    onMouseMove: hoverRegionRef ? undefined : handleMouseMove,
    onMouseLeave: hoverRegionRef ? undefined : handleMouseLeave,
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
  const liftSpringRef = useRef(null)

  if (!springRef.current) {
    springRef.current = createSpring(spring.mass, spring.stiffness, spring.damping, BASE_ITEM_WIDTH)
    liftSpringRef.current = createSpring(spring.mass, spring.stiffness, spring.damping)
  }

  useEffect(() => {
    if (!registerItem) return undefined
    const itemData = {
      index,
      element: itemRef.current,
      spring: springRef.current,
      liftSpring: liftSpringRef.current,
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
