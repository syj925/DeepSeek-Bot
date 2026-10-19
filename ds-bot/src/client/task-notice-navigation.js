import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'

// The public resource viewer must be mounted before it can accept a file.
export async function openTaskFile({ sidebar, sessionId, sourceSessionId, path, navigate, timeout = 5000 }) {
  if (!sidebar?.mounted || !sidebar.openResource) throw new Error('The file viewer is unavailable. Open the conversation to find the result.')
  await new Promise((resolve, reject) => {
    let off = () => {}, timer, done = false
    const finish = error => {
      if (done) return
      done = true; clearTimeout(timer); off()
      if (error) reject(error)
      else resolve()
    }
    const check = () => { if (sidebar.mounted.getSnapshot() === sessionId) finish() }
    off = sidebar.mounted.subscribe(check)
    timer = setTimeout(() => finish(new Error('The file viewer did not open. Please try again.')), timeout)
    try { navigate(); check() } catch (error) { finish(error) }
  })
  if (sidebar.mounted.getSnapshot() !== sessionId) return false
  sidebar.openResource(fileAddressFor(sourceSessionId, undefined, path))
  return true
}

export function completionSound() {
  const Audio = globalThis.AudioContext ?? globalThis.webkitAudioContext
  if (!Audio) return
  const audio = new Audio()
  const play = async () => {
    try {
      await audio.resume()
      const oscillator = audio.createOscillator(), gain = audio.createGain()
      oscillator.connect(gain); gain.connect(audio.destination)
      oscillator.frequency.setValueAtTime(660, audio.currentTime)
      oscillator.frequency.setValueAtTime(880, audio.currentTime + .09)
      gain.gain.setValueAtTime(.045, audio.currentTime)
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .24)
      oscillator.start(); oscillator.stop(audio.currentTime + .25)
    } catch { /* browser audio policy */ }
  }
  void play()
  setTimeout(() => { void audio.close().catch(() => {}) }, 1000)
}
