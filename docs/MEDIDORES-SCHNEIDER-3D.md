# Medidores, TC e aparelhos modulares Schneider

Documento técnico da recuperação de 17 de novembro de 2026.
[Resultados atuais e pendências](RECUPERACAO-2026-11-17.md).
As evidências antigas em `validation/meters-schneider-2026-11-17/` são
históricas: os seus números e hashes não aprovam o código desta recuperação.

## Aparelhos e origem da geometria

| Tipo estável | Representação | Referencial nominal L × A × P |
| --- | --- | --- |
| `meterD522066` | D52-2066 monofásico, reconstrução procedural | 54 × 80 × 64 mm |
| `meterKws306` | KWS-306 trifásico, reconstrução procedural | 74 × 86,5 × 65 mm |
| `currentTransformerSplitCore` | TC externo aberto, reconstrução aproximada | 36 × 48 × 24 mm, passagem Ø16 mm |
| `breakerSchneiderIc60h1p` | iC60H A9F07120, STEP MCADFD0000984/implantação documentada no manifesto modular | 18 × 91 × 78,5 mm |
| `pilotLightSchneiderIil1p` | iIL A9E18320, STEP MCADFD0000979 | 18 × 82 × 68 mm |
| `pilotLightSchneiderIil3p` | iIL A9E18327, STEP MCADFD0000980 | 18 × 82 × 69,5 mm |
| `residualBreakerSchneiderIid4p` | iID A9R11440, STEP MCADFD0001753 | 72 × 85 × 73,5 mm |
| `residualBreakerSchneiderIdpnVigi` | iDPN N Vigi A9D32616, STEP MCADFD0000952 | 36 × 85 × 73 mm |

Consultar os manifestos de origem para a referência STEP exata de cada peça;
a caixa externa do CAD pode diferir das dimensões nominais devido a patins e
atuadores. **Não se estica o corpo para fazer coincidir essas caixas.**

D52, KWS e TC não são apresentados como CAD oficial, produto certificado ou
réplica já aceite pelo utilizador. Os refinamentos incluem corpos escalonados,
passagens efetivamente vazadas, acesso separado aos parafusos, teclas KWS
retangulares, fecho/articulação do TC e LCD local com dígitos de sete segmentos.
Cotas e detalhes ainda carecem de aceitação visual face às fotografias 16–21 e
`IMG_5810.jpeg`. A inscrição do TC não certifica compatibilidade física/elétrica
com qualquer variante comercial.

Os dois medidores aparecem em **Aparelhos de medir** nas bibliotecas do
simulador e Admin. Um construtor serve Painel, Admin, capas e exportação GLB;
não se inventa um URL de GLB estático para desbloquear a biblioteca.

## Modelo elétrico e LCD

- D52: L/N alimentam o aparelho; CT-IN/CT-OUT conservam a semântica de passagem
  primária em série dos projetos existentes. RESET requer **5 s mantidos**;
  clique curto, blur e cancelamento não apagam energia.
- TC externo: primário contínuo pela passagem, secundário isolado S1/S2,
  relação didática 100 A:50 mA. Não une fase ao neutro nem reconecta fios antigos
  silenciosamente. Não converte automaticamente uma variante D52 interna numa
  variante externa de fabricante.
- KWS: oito ligações em quatro polos e comando ON/OFF conservados. M/+ e −
  percorrem três páginas de apresentação das medições reais; não se afirma
  emulação de firmware/configuração não documentada do fornecedor.
- Grandezas provêm do circuito ligado, não de valores de demonstração. A
  integração usa kWh = W × ms / 3,6e9 e PF = W/(V × A), com guardas de zero.
- Uma textura por LCD é atualizada in-place; instâncias não partilham leituras.
  O tick visual cobre mutações in-place do motor, mesmo com referências iguais.
- STOP apaga visores/luzes, conserva energia acumulada e limpa tempos de
  arranque; RUN faz o primeiro scan imediato. STEP avança uma vez e fica em
  PAUSA viva, sem um intervalo em segundo plano.

A simulação é educacional, não um instrumento de medição ou proteção certificado.

## Schneider: função e adaptações

O iID 4P continua RCCB (40 A/30 mA AC), sem acrescentar proteção
magnetotérmica. O iDPN N Vigi continua RCBO 1P+N C16/30 mA tipo A/6 kA, não
foi substituído por um iID 2P. O iC60H mantém a função magnetotérmica. O iIL é
sinalizador: não se inventa um contacto de saída de relé de proteção.

O iIL trifásico ocupa **18 mm**, com L1/L2/L3/N e três lentes independentes.
A referência anterior A9E18324 não identifica essa variante; a representação
atual usa A9E18327. A adaptação ótica/cavidades está documentada no manifesto.

O iID simplificado fundia o atuador no corpo; a reconstrução usa o atuador e a
cavidade iID comuns, mantendo o corpo e a implantação de quatro polos. Entradas
foram reabertas, patins ajustados à pose de montagem e elementos animados
separados. **São adaptações da plataforma, não CAD inalterado nem certificação
Schneider.** O botão T afunda 1,2 mm, regressa ao largar fora/cancelar e conserva
o disparo; a letra acompanha-o. A manobra não deve rodar simultaneamente a câmara.

Fontes, dimensões reais de exportação, adaptações e SHA-256:

- [`schneider-acti9-modular-sources.json`](../public/models/protecao/schneider-acti9-modular-sources.json)
- [`schneider-acti9-rcd-sources.json`](../public/models/protecao/schneider-acti9-rcd-sources.json)

Logótipos Schneider/Hager são recursos vetoriais **locais**, não nomes escritos
numa fonte semelhante. Os caminhos usados no canvas são comparados com a
rasterização dos SVG locais no browser.

## Catálogo, Admin e compatibilidade

Publicar uma versão não reescreve o tipo guardado de instâncias `cat:…:v…`.
A origem integrada explícita delega apenas o comportamento suportado, conserva
IDs/rótulos dos bornes, variáveis, controlos e ligações. Versões antigas e
rascunhos do autor não são resemeados por falta de um botão apagado.

Os oito tipos partilham as interfaces físicas com o Admin. Para Schneider os
bornes usam o referencial nominal preservado; o ensaio de browser compara os
pontos reais com as bocas CAD (<0,03 mm). Controlos automáticos usam as malhas
reais; áreas de interação criadas expressamente pelo autor continuam válidas.

`holdVar` separa retorno físico de disparo retido. Exportar um diferencial
conserva as três fitas de estado, mesmo quando só uma está ativa. Catálogos
publicados são recarregados após um refresh completo e exercitados com duas
instâncias e circuitos reais, não só com variáveis de pré-visualização.

A migração de bornes automáticos reconhece padrões intactos e mantém ajustes
manuais/fixados. Ver [geometria dos bornes](TERMINAL-GEOMETRY.md).

## Calhas e sobretampa

A profundidade DIN é individual (0–500 mm, passo 0,1 mm), com fixações e
batentes. Equipamentos, pontos dos bornes e extremos dos cabos acompanham o
mesmo referencial; undo/redo conserva a montagem. A sobretampa alterna
sólida/contorno tracejado/oculta: o contorno não tem uma face opaca nem um alvo
que bloqueie o picking. Obturadores ocupam apenas os intervalos vagos.

## Reproduzir as verificações

```sh
npm ci
npm run typecheck
npm run test:ci
npm run test:server
npm run test:native-server

# Vite em execução, conta sintética isolada; suites em série em máquinas de 2 GB:
npm run test:meters-schneider-ui
npm run test:meters-schneider-admin-ui
npm run test:msr127-panel-ui
npm run test:grafcet-lifecycle-ui
npm run test:panel3d-profile

VERCEL=1 npm run build
```

Usar os nomes presentes no `package.json` se uma distribuição anterior ainda
não contiver estas suites. `INDUSTRIAL_TEST_URL` configura a origem das novas
fixtures; `METERS_TEST_OUTPUT` e `METERS_ADMIN_UI_OUTPUT` guardam evidências.
As suites usam uma conta local e IndexedDB descartáveis, bloqueiam API,
service workers e recursos externos: **não provam autenticação real,
Supabase/RLS, nem escrita cloud ou publicação de produção**.

O perfil usa o Panel3D/R3F real com 15 aparelhos, montagem/desmontagem e órbita.
A execução SwiftShader mede recursos e submissão CPU, não desempenho de uma GPU
física; não existe aprovação de FPS baseada nesse ambiente.

### Fontes públicas de referência

- [iID A9R11440](https://www.se.com/id/en/product/A9R11440/)
- [STEP iID MCADFD0001753](https://download.se.com/files?p_Doc_Ref=MCADFD0001753_3D-CAD)
- [Atuador iID comum MCADFD0001467](https://download.se.com/files?p_Doc_Ref=MCADFD0001467_3D-CAD)
- [iDPN N Vigi A9D32616](https://www.clipsal.com/products/circuit-protection/acti9/residual-current-breaker-with-overcurrent-protection-rcbo-idpn-n-vigi-1p-n-16a-c-curve-6000-a9d32616?itemno=A9D32616)
- [STEP iDPN MCADFD0000952](https://download.se.com/files?p_Doc_Ref=MCADFD0000952_3D-CAD)
