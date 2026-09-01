import { spawn } from 'node:child_process'

// El único lugar que habla git. `publicar` escribe (add/commit/push) y
// `sincronizar` lee (pull) — las dos sobre el mismo clone local del sitio.
export function git(args: string[], cwd: string): Promise<string> {
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

// Trae al clone local lo que se haya publicado desde otra máquina. Sin esto la
// lista de publicaciones muestra la foto del último pull, no lo que está en el
// sitio — y el Dr. Luis publica desde su Mac, no desde este clone.
export async function sincronizar(repoPath: string): Promise<void> {
  await git(['pull', '--rebase', 'origin', 'master'], repoPath)
}
