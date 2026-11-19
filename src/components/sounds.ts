// Sound effects. The files live in public/sounds/.
// Each sound can have several versions; one is picked at random every time it plays
// (never the same one twice in a row). A missing or unplayable file is skipped, and a
// sound with no working files is simply silent, so the game works with or without them.

import { useSyncExternalStore } from 'react'

export type SoundName = 'shuffle' | 'play' | 'bomb'

/** Files (in public/sounds/) and volume (0–1) for each sound. Add or remove versions freely. */
const SOUNDS: Record<SoundName, { files: string[]; volume: number }> = {
  shuffle: { files: ['shuffle.mp3'], volume: 0.4 }, // not added yet: silent until it exists
  play: { files: ['play1.mp3', 'play2.mp3', 'play3.mp3'], volume: 0.30 },
  bomb: { files: ['bomb1.mp3', 'bomb2.mp3', 'bomb3.mp3'], volume: 0.6 }, // four of a kind / consecutive pairs
}

const base = `${import.meta.env.BASE_URL}sounds/`
const audio = new Map<string, HTMLAudioElement>() // file name → loaded audio
const lastPlayed = new Map<SoundName, string>()

function audioFor(file: string) {
  let a = audio.get(file)
  if (!a) {
    a = new Audio(base + file)
    a.preload = 'auto'
    audio.set(file, a)
  }
  return a
}

/** Start downloading every sound so the first play isn't delayed. */
export function preloadSounds() {
  for (const { files } of Object.values(SOUNDS)) files.forEach(audioFor)
}

/** Pick a random working version, avoiding the one played last time when there's a choice. */
export function pickVariant(files: string[], last: string | undefined, random: () => number = Math.random) {
  const choices = files.length > 1 ? files.filter((f) => f !== last) : files
  return choices[Math.floor(random() * choices.length)]
}

export function playSound(name: SoundName) {
  if (muted) return
  const working = SOUNDS[name].files.filter((f) => !audioFor(f).error) // skip missing/unplayable files
  if (working.length === 0) return
  const file = pickVariant(working, lastPlayed.get(name))
  lastPlayed.set(name, file)
  // A fresh copy each time, so quick plays can overlap instead of cutting each other off.
  const clip = audioFor(file).cloneNode() as HTMLAudioElement
  clip.volume = SOUNDS[name].volume
  clip.play().catch(() => {}) // e.g. browser blocks sound until the first click
}

// ---------- Mute setting (remembered in this browser) ----------

const MUTE_KEY = 'tienlen.muted'
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<() => void>()

export function setMuted(value: boolean) {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    /* storage unavailable: the setting just won't be remembered */
  }
  listeners.forEach((l) => l())
}

/** Current mute setting; re-renders the component when it changes. */
export function useMuted() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => muted,
  )
}
