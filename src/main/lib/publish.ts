import { spawn } from 'node:child_process'

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

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise(stdout)
        return
      }
      reject(new Error(stderr.trim() || `git ${args.join(' ')} falló (código ${code})`))
    })
  })
}
