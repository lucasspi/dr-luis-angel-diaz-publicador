import { git } from './git'

/**
 * Deja los archivos en master y los sube. Si el push choca, rebasa y reintenta.
 *
 * `archivos` vacío es válido y significa "commitea lo que ya está en el índice"
 * — es el caso del borrado, donde `git rm` ya dejó el cambio preparado. Con
 * lista vacía no se llama a `git add`, que sin argumentos falla.
 */
export async function confirmar(
  repoPath: string,
  mensaje: string,
  archivos: string[]
): Promise<void> {
  if (archivos.length > 0) await git(['add', ...archivos], repoPath)
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
