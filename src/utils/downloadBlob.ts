/** Descarrega um Blob como ficheiro.
 *  O link entra no documento (Firefox ignora cliques em links soltos) e o URL só é revogado
 *  bem depois do clique: o gestor de transferências lê-o de forma assíncrona e, revogado
 *  logo a seguir, o Chrome/Edge/Safari podem falhar com «ficheiro em falta / erro de rede». */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
