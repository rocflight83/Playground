import { access, mkdir, readFile, rename, unlink, writeFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export interface FileSystemAdapter {
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  writeFile(path: string, content: string): Promise<void>
  readFile(path: string): Promise<string>
  readdir?(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>
  writeFilesAtomically?(files: Array<{ path: string; content: string }>): Promise<void>
}

export const nodeFileSystem: FileSystemAdapter = {
  exists: async (path) => {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  },
  mkdir: async (path) => {
    await mkdir(path, { recursive: true })
  },
  writeFile: async (path, content) => writeFile(path, content, 'utf8'),
  readFile: async (path) => readFile(path, 'utf8'),
  readdir: async (path) => {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
  },
  writeFilesAtomically: async (files) => {
    const temporaryPaths: string[] = []
    try {
      for (const file of files) {
        const temporaryPath = `${file.path}.${randomUUID()}.tmp`
        temporaryPaths.push(temporaryPath)
        await writeFile(temporaryPath, file.content, 'utf8')
        await rename(temporaryPath, file.path)
        temporaryPaths.pop()
      }
    } finally {
      await Promise.all(
        temporaryPaths.map(async (path) => {
          try {
            await unlink(path)
          } catch {
            // The rename may already have removed the temporary path.
          }
        })
      )
    }
  },
}
