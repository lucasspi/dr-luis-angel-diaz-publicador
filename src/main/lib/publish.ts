import { git } from './git'

export async function publicar(repoPath: string, titulo: string, archivos: string[]): Promise<void> {
  await git(['add', ...archivos], repoPath)
  await git(['commit', '-m', `reflexión: ${titulo}`], repoPath)

  try {
    await git(['push', 'origin', 'master'], repoPath)
  } catch {
    await git(['pull', '--rebase', 'origin', 'master'], repoPath)
    await git(['push', 'origin', 'master'], repoPath)
  }
}
