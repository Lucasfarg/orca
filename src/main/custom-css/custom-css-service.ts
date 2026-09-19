import { mkdirSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import type { CustomCssSnapshot } from '../../shared/custom-css'
import {
  startShallowWatcher,
  type ShallowWatcherSubscription
} from '../ipc/parcel-watcher-shallow-subscription'
import { ensureCustomCssFile, getUserCustomCssPath, readCustomCssFile } from './custom-css-file'

// Why: one editor save can fire several events; coalesce them into one reload.
const RELOAD_DEBOUNCE_MS = 100

// Why: a watcher error is usually transient (the folder was swapped, descriptors ran out); re-arm a few times, then stop.
const WATCH_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000]

export type CustomCssServiceOptions = {
  homePath: string
  onChanged: (snapshot: CustomCssSnapshot) => void
}

export class CustomCssService {
  private readonly path: string
  private readonly onChanged: (snapshot: CustomCssSnapshot) => void
  private subscription: ShallowWatcherSubscription | null = null
  private reloadTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryIndex = 0
  private disposed = false

  constructor(options: CustomCssServiceOptions) {
    this.path = getUserCustomCssPath(options.homePath)
    this.onChanged = options.onChanged
  }

  getPath(): string {
    return this.path
  }

  /** Reads the file; the first read starts one folder watch that lasts until quit. */
  getSnapshot(): CustomCssSnapshot {
    this.startWatching()
    return readCustomCssFile(this.path)
  }

  ensureFile(): CustomCssSnapshot {
    ensureCustomCssFile(this.path)
    return this.getSnapshot()
  }

  /** Permanent: only the quit path disposes the service. */
  dispose(): void {
    this.disposed = true
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
      this.reloadTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.stopWatching()
  }

  private stopWatching(): void {
    void this.subscription?.unsubscribe()
    this.subscription = null
  }

  private startWatching(): void {
    if (this.subscription || this.disposed) {
      return
    }
    const directory = dirname(this.path)
    try {
      // Why: the folder must exist to see a custom.css the user creates by hand.
      mkdirSync(directory, { recursive: true })
    } catch (error) {
      console.error('Failed to create the custom.css folder:', error)
      return
    }
    this.subscription = startShallowWatcher(
      directory,
      [basename(this.path)],
      () => this.scheduleReload(),
      (error) => {
        console.error('custom.css watcher failed:', error)
        this.stopWatching()
        this.scheduleRetry()
      }
    )
  }

  /** Re-arms the watcher on a backoff; nothing else re-reads the file while a window stays open. */
  private scheduleRetry(): void {
    const delay = WATCH_RETRY_DELAYS_MS[this.retryIndex]
    if (this.disposed || this.retryTimer || delay === undefined) {
      return
    }
    this.retryIndex++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.startWatching()
      // Why: saves made while the watcher was down fired no event.
      this.onChanged(readCustomCssFile(this.path))
    }, delay)
  }

  private scheduleReload(): void {
    this.retryIndex = 0
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null
      this.onChanged(readCustomCssFile(this.path))
    }, RELOAD_DEBOUNCE_MS)
  }
}
