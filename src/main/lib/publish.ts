import { git } from './git'

/** Deja los archivos en master y los sube. Si el push choca, rebasa y reintenta. */
export async function confirmar(
  repoPath: string,
  mensaje: string,
  archivos: string[]
): Promise<void> {
  await git(['add', ...archivos], repoPath)
  await git(['commit', '-m', mensaje], repoPath)

  try {
    await git(['push', 'origin', 'master'], repoPath)
  } catch {
    await git(['pull', '--rebase', 'origin', 'master'], repoPath)
    await git(['push', 'origin', 'master'], repoPath)
  }
}

export async function publicar(
  repoPath: string,
  titulo: string,
  archivos: string[]
): Promise<void> {
  await confirmar(repoPath, `reflexión: ${titulo}`, archivos)
}
