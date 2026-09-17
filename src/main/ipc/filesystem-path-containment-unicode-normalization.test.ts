import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { Store } from '../persistence'
import type { Repo } from '../../shared/repo-types'
import { PATH_ACCESS_DENIED_MESSAGE, resolveAuthorizedPath } from './filesystem-auth'
import { isDescendantOrEqual } from './filesystem-path-containment'

/**
 * Opening any file under a Korean-named workspace failed on macOS with
 * "Access denied: path resolves outside allowed directories" (#21172).
 *
 * The file was inside the workspace the whole time. The two sides of the containment check reached
 * it through different doors: the root was registered from the file picker or from git, which spell
 * the name in NFC, while the path being read came back from the filesystem in NFD. Same name, same
 * file on APFS, different bytes — so the guard reported an escape.
 *
 * The scratch directory is created in NFD and registered in NFC, which reproduces the mismatch on a
 * byte-exact Linux CI host too: there the two spellings are genuinely different strings, which is
 * the strictest version of the test.
 */

const FOLDER = '테스트프로젝트'
const NFC_FOLDER = FOLDER.normalize('NFC')
const NFD_FOLDER = FOLDER.normalize('NFD')

const scratchDirs: string[] = []

async function makeScratchDir(): Promise<string> {
  // realpath first: macOS fronts the temp dir with a /var symlink of its own.
  const scratch = await mkdtemp(join(await realpath(tmpdir()), 'orca-unicode-path-'))
  scratchDirs.push(scratch)
  return scratch
}

function makeStore(repoPath: string): Store {
  const repo: Repo = {
    id: 'repo-1',
    path: repoPath,
    displayName: 'workspace',
    badgeColor: '#000000',
    addedAt: 1,
    kind: 'git'
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the guard reads only these four accessors; Store is a class, so a structural double cannot satisfy it without the cast.
  return {
    getRepos: () => [repo],
    getProjectGroups: () => [],
    getFolderWorkspaces: () => [],
    getSettings: () => ({})
  } as unknown as Store
}

afterEach(async () => {
  await Promise.all(scratchDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('path containment across Unicode forms', () => {
  it('spells the fixture two ways, or the rest of this file proves nothing', () => {
    expect(NFC_FOLDER).not.toBe(NFD_FOLDER)
  })

  it('accepts a child returned in NFD under a root registered in NFC', () => {
    expect(
      isDescendantOrEqual(resolve(`/repos/${NFD_FOLDER}/test.txt`), resolve(`/repos/${NFC_FOLDER}`))
    ).toBe(true)
  })

  it('accepts a child returned in NFC under a root registered in NFD', () => {
    expect(
      isDescendantOrEqual(resolve(`/repos/${NFC_FOLDER}/test.txt`), resolve(`/repos/${NFD_FOLDER}`))
    ).toBe(true)
  })

  it('still rejects a sibling that only looks similar', () => {
    // 테스트 is a prefix of 테스트프로젝트, not a canonical equivalent of it.
    expect(
      isDescendantOrEqual(resolve('/repos/테스트/test.txt'), resolve(`/repos/${NFC_FOLDER}`))
    ).toBe(false)
  })

  it('still rejects an escape out of a non-ASCII root', () => {
    expect(
      isDescendantOrEqual(
        resolve(`/repos/${NFD_FOLDER}/../secrets`),
        resolve(`/repos/${NFC_FOLDER}`)
      )
    ).toBe(false)
  })

  it('leaves ASCII containment exactly as it was', () => {
    expect(isDescendantOrEqual(resolve('/repos/app/src'), resolve('/repos/app'))).toBe(true)
    expect(isDescendantOrEqual(resolve('/repos/apple'), resolve('/repos/app'))).toBe(false)
    expect(isDescendantOrEqual(resolve('/repos/app'), resolve('/repos/app'))).toBe(true)
  })
})

describe('fs:readFile authorization for a Korean-named workspace', () => {
  it('authorizes a file the filesystem spells in NFD under a root registered in NFC', async () => {
    const scratch = await makeScratchDir()
    const onDisk = join(scratch, NFD_FOLDER)
    await mkdir(onDisk)
    const file = join(onDisk, 'test.txt')
    await writeFile(file, 'hello')

    const store = makeStore(join(scratch, NFC_FOLDER))
    // Resolved before the assertion so a rejection lands on expect(), not on an unawaited promise.
    const expected = await realpath(file)

    await expect(
      resolveAuthorizedPath(file, store),
      'the file is inside the opened workspace; only its spelling differs'
    ).resolves.toBe(expected)
  })

  it('authorizes a file the filesystem spells in NFC under a root registered in NFD', async () => {
    const scratch = await makeScratchDir()
    const onDisk = join(scratch, NFC_FOLDER)
    await mkdir(onDisk)
    const file = join(onDisk, 'test.txt')
    await writeFile(file, 'hello')

    const store = makeStore(join(scratch, NFD_FOLDER))
    const expected = await realpath(file)

    await expect(resolveAuthorizedPath(file, store)).resolves.toBe(expected)
  })

  it('still denies a file outside the workspace', async () => {
    const scratch = await makeScratchDir()
    await mkdir(join(scratch, NFD_FOLDER))
    const outside = join(scratch, 'outside.txt')
    await writeFile(outside, 'secret')

    const store = makeStore(join(scratch, NFC_FOLDER))

    await expect(resolveAuthorizedPath(outside, store)).rejects.toThrow(PATH_ACCESS_DENIED_MESSAGE)
  })
})
