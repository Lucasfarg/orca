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

export type CustomCssServiceOptions = {
  homePath: string
  onChanged: (snapshot: CustomCssSnapshot) => void
}

export class CustomCssService {
  private readonly path: string
  private readonly onChanged: (snapshot: CustomCssSnapshot) => void
  private subscription: ShallowWatcherSubscription | null = null
  private reloadTimer: ReturnType<typeof setTimeout> | null = null

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

  dispose(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
      this.reloadTimer = null
    }
    void this.subscription?.unsubscribe()
    this.subscription = null
  }

  private startWatching(): void {
    if (this.subscription) {
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
        // Why: drop the dead subscription so the next read re-arms it.
        this.dispose()
      }
    )
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer)
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null
      this.onChanged(readCustomCssFile(this.path))
    }, RELOAD_DEBOUNCE_MS)
  }
}
