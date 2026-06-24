import { rm, writeFile } from 'node:fs/promises'

export async function markHealthy(path: string): Promise<void> {
  await writeFile(path, `${new Date().toISOString()}\n`, 'utf8')
}

export async function clearHealthy(path: string): Promise<void> {
  await rm(path, { force: true })
}
