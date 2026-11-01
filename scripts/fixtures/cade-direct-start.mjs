/**
 * Esquema sintético no formato de texto do CADe SIMU 3.x (arranque direto com selo, F1, PE e
 * um temporizador à desoperação), escrito à mão para os testes — não vem de nenhum ficheiro de terceiros.
 * Registos «*k*código#segmento*23 números»; ver src/commands/cadeSimuText.ts.
 */
export function cadeDirectStartFixture() {
  const recs = []
  const sym = (code, ref, labels, x, y, box, rot = 0) => {
  const flags = Array.from({ length: 8 }, (_, i) => (i < labels.length ? 1 : 0))
  recs.push({ code, seg: `${ref}##${labels.join('#')}#`, nums: [...flags, x, y, 0, 0, ...box, 0, rot, 0, 1, 0, 0, 0] })
  }
  const wire = (code, x1, y1, x2, y2) => recs.push({ code, seg: '########', nums: [0, 0, 0, 0, 0, 0, 0, 0, x1, y1, x2, y2, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] })
  const dot = (x, y) => recs.push({ code: 4001, seg: '########', nums: [0, 0, 0, 0, 0, 0, 0, 0, x, y, x, y, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
  const text = (x, y, value) => recs.push({ code: 8, seg: '# 0# 0# 0# 0# 0# 0# 0# 0', nums: [0, 0, 0, 0, 0, 0, 0, 0, x, y, x + 40, y + 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], text: value })
  const MULTI = [-12, -3, 18, 15]
  const TWO = [-18, -3, 6, 15]

  recs.push({ code: 3005, seg: '-X########', nums: [0, 0, 0, 0, 0, 0, 0, 0, 30, 54, 0, 0, -9, -24, 3, 12, 0, 3, 0, 0, 0, 0, 0] })
  wire(4000, 30, 54, 150, 54); wire(4000, 30, 48, 150, 48); wire(4000, 30, 42, 150, 42); wire(4010, 30, 36, 150, 36)
  sym(6009, 'Q1', ['1', '3', '5', '2', '4', '6'], 60, 66, [-21, -3, 18, 24])
  wire(4000, 60, 54, 60, 66); dot(60, 54); wire(4000, 66, 48, 66, 66); dot(66, 48); wire(4000, 72, 42, 72, 66); dot(72, 42)
  sym(2008, '-KM1', ['1', '3', '5', '2', '4', '6'], 60, 96, MULTI)
  for (const x of [60, 66, 72]) wire(4000, x, 87, x, 96)
  sym(6007, 'F1', ['1', '3', '5', '2', '4', '6'], 60, 117, [-15, -3, 21, 15])
  for (const x of [60, 66, 72]) wire(4000, x, 108, x, 117)
  sym(1000, 'M1', ['U1', 'V1', 'W1', 'PE'], 60, 141, [-12, -6, 24, 24])
  for (const x of [60, 66, 72]) wire(4000, x, 129, x, 141)
  wire(4010, 78, 36, 78, 141); dot(78, 36)
  // Comando entre L1 e L2.
  sym(8017, 'F1', ['95', '96'], 120, 60, TWO); wire(4018, 120, 54, 120, 60); dot(120, 54)
  sym(8001, 'S0', ['1', '2'], 120, 81, TWO); wire(4018, 120, 72, 120, 81)
  sym(8000, 'S1', ['3', '4'], 120, 102, TWO); wire(4018, 120, 93, 120, 102)
  sym(7000, '-KM1', ['13', '14'], 138, 102, [-12, -3, 6, 15]); wire(4018, 120, 96, 138, 96); wire(4018, 138, 96, 138, 102); dot(120, 96)
  sym(9000, '-KM1', ['A1', 'A2'], 120, 126, [-15, -3, 9, 15]); wire(4018, 120, 114, 120, 126); wire(4018, 138, 114, 138, 120); wire(4018, 138, 120, 120, 120); dot(120, 120)
  wire(4018, 120, 138, 120, 150); wire(4018, 120, 150, 150, 150); wire(4018, 150, 150, 150, 48)
  // Desenho do CADe sem equivalente e um temporizador à desoperação (fora do circuito).
  text(80, 20, 'PARTIDA DIRETA (ENSAIO)')
  recs.push({ code: 8023, seg: 'S1####0####', nums: [0, 0, 0, 0, 0, 0, 0, 0, 200, 60, 0, 0, -18, -6, 6, 6, 0, 0, 0, 1, 0, 0, 0] })
  recs.push({ code: 2, seg: '########', nums: [0, 0, 0, 0, 0, 0, 0, 0, 190, 50, 230, 80, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] })
  recs.push({ code: 9005, seg: 'TP##A1#A2#3#30###', nums: [1, 1, 0, 0, 0, 0, 0, 0, 240, 120, 0, 0, -15, -3, 9, 15, 0, 0, 0, 1, 0, 0, 0] })
  sym(7008, 'TP', ['67', '68'], 260, 90, [-15, -3, 6, 15])

  let file = 'CADe_SIMU'
  recs.forEach((r, k) => {
  file += `*${k}*${r.code}#${r.seg}*${r.nums.join('*')}`
  if (r.text !== undefined) file += `#${r.text}`
  else if (k < recs.length - 1) file += '#'
  })
  file += '$$$*1*1*1*2*5*0*0*0*0*279*210&&&*ensaio.cad*'
  return file
}
