import { createElement as h, useEffect, useRef, useState } from 'react'
import visualAssets from './visual-assets.json' with { type: 'json' }

export const AGENT_AVATARS = [
  { id: '01_QiBit', name: 'QiBit', poster: '/qibit-agent-hover/posters/01_QiBit.webp', animated: '/qibit-agent-hover/animated/01_QiBit.webp' },
  { id: '02_技术', name: '技术', poster: '/qibit-agent-hover/posters/02_技术.webp', animated: '/qibit-agent-hover/animated/02_技术.webp' },
  { id: '03_设计', name: '设计', poster: '/qibit-agent-hover/posters/03_设计.webp', animated: '/qibit-agent-hover/animated/03_设计.webp' },
  { id: '04_行政', name: '行政', poster: '/qibit-agent-hover/posters/04_行政.webp', animated: '/qibit-agent-hover/animated/04_行政.webp' },
  { id: '05_运营', name: '运营', poster: '/qibit-agent-hover/posters/05_运营.webp', animated: '/qibit-agent-hover/animated/05_运营.webp' },
  { id: '06_财务', name: '财务', poster: '/qibit-agent-hover/posters/06_财务.webp', animated: '/qibit-agent-hover/animated/06_财务.webp' },
  { id: '07_销售', name: '销售', poster: '/qibit-agent-hover/posters/07_销售.webp', animated: '/qibit-agent-hover/animated/07_销售.webp' },
].map(agent => ({ ...agent, posterPath: agent.poster, animatedPath: agent.animated, poster: visualAssets[agent.poster], animated: visualAssets[agent.animated] }))

export const AGENT_ANIMATION_DURATION_MS = 4000

const blobCache = new Map()

export function getAgentBlob(url) {
  if (blobCache.has(url)) return blobCache.get(url)
  const promise = fetch(url, { cache: 'force-cache' })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} loading avatar animation`)
      return res.blob()
    })
    .catch(err => {
      blobCache.delete(url)
      throw err
    })
  blobCache.set(url, promise)
  return promise
}

export function AgentAvatarPreview({ agent, size = 88, triggerKey = 0, onReplay }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [animSrc, setAnimSrc] = useState(null)
  const tokenRef = useRef(0)
  const timerRef = useRef(null)
  const currentBlobUrlRef = useRef(null)

  useEffect(() => {
    if (!agent?.animated) return undefined

    // Increment token to invalidate any previous pending loads/timers
    const token = ++tokenRef.current
    let active = true

    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current)
      currentBlobUrlRef.current = null
    }
    setIsPlaying(false)
    setAnimSrc(null)

    getAgentBlob(agent.animated)
      .then(blob => {
        if (!active || tokenRef.current !== token) return
        const objectUrl = URL.createObjectURL(blob)
        currentBlobUrlRef.current = objectUrl

        // Preload image before displaying to ensure smooth 0-frame start
        const img = new Image()
        img.onload = () => {
          if (!active || tokenRef.current !== token) {
            URL.revokeObjectURL(objectUrl)
            if (currentBlobUrlRef.current === objectUrl) currentBlobUrlRef.current = null
            return
          }
          setAnimSrc(objectUrl)
          setIsPlaying(true)
          timerRef.current = setTimeout(() => {
            if (tokenRef.current === token) {
              setIsPlaying(false)
              setAnimSrc(null)
              URL.revokeObjectURL(objectUrl)
              currentBlobUrlRef.current = null
            }
          }, AGENT_ANIMATION_DURATION_MS)
        }
        img.onerror = () => {
          if (tokenRef.current === token) {
            setIsPlaying(false)
            setAnimSrc(null)
            URL.revokeObjectURL(objectUrl)
            currentBlobUrlRef.current = null
          }
        }
        img.src = objectUrl
      })
      .catch(() => {
        if (tokenRef.current === token) {
          setIsPlaying(false)
          setAnimSrc(null)
        }
      })

    return () => {
      active = false
      tokenRef.current += 1
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current)
        currentBlobUrlRef.current = null
      }
    }
  }, [agent?.id, agent?.animated, triggerKey])

  if (!agent) return null

  return h('span', {
    className: `bt-agent-stage${isPlaying ? ' is-playing' : ''}`,
    style: { width: size, height: size, '--agent-size': `${size}px` },
    onClick: onReplay,
    title: agent.name,
    role: 'img',
    'aria-label': agent.name,
  },
    h('img', {
      className: 'bt-agent-poster',
      src: agent.poster,
      alt: '',
      draggable: false,
      style: { height: size },
    }),
    animSrc ? h('img', {
      className: 'bt-agent-animated',
      src: animSrc,
      alt: '',
      draggable: false,
      'aria-hidden': 'true',
      style: { height: size },
    }) : null)
}

export const AGENT_AVATAR_CSS = `
.bt-agent-stage{position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:visible;line-height:0;background:transparent!important;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bt-agent-stage img{position:absolute;top:0;left:50%;transform:translateX(-50%);height:var(--agent-size,88px);width:auto;max-width:none;object-fit:contain;pointer-events:none}
.bt-agent-poster{opacity:1;transition:opacity .12s ease}
.bt-agent-animated{opacity:1}
.bt-agent-stage.is-playing .bt-agent-poster{opacity:0}
`
