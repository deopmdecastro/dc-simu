# Imagens dos componentes

Imagens WebP sem fundo geradas a partir dos GLB reais, uma de cada tipo por componente com modelo 3D,
e o índice `manifest.json`:

- `{tipo}.webp` — capa da biblioteca (estúdio 3/4, 192 px, ~5 KiB). A biblioteca, os objetos do projeto,
  o Inspetor e a página inicial mostram-na em vez de descarregar e desenhar o GLB.
- `front/{tipo}.webp` — vista frontal ortográfica (até 560 px, ~1–40 KiB). O Esquema 2D e as capas dos
  projetos no dashboard usam-na em vez de descarregar o GLB. Fica fora do precache do PWA e entra em
  cache só quando é usada. As orientações personalizadas e o ecrã do LOGO! continuam a ser capturados do GLB.

Gerar de novo (depois de acrescentar ou mudar um modelo 3D):

```
npx vite --port 5207 --strictPort --host 127.0.0.1
COVERS_URL=http://127.0.0.1:5207 node scripts/build-component-covers.mjs              # todas
COVERS_URL=http://127.0.0.1:5207 node scripts/build-component-covers.mjs --only <tipo>  # só um tipo
node scripts/build-component-covers.mjs --check                                        # falha se faltar alguma
```

Um tipo com GLB que não esteja no índice continua a funcionar: a app captura o modelo no browser (a capa
fica guardada no IndexedDB do dispositivo; a primeira vez é mais lenta).
