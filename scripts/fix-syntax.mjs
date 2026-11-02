import fs from 'node:fs'

// Fix model.ts
let model = fs.readFileSync('src/commands/model.ts', 'utf8')
model = model.replace(/lines\?: string\[\][\s\S]*?export interface CmdEnd/, `lines?: string[]\n  /** Página do esquema (folha). Por omissão a primeira. */\n  page?: string\n}\n\nexport interface CmdEnd`)
fs.writeFileSync('src/commands/model.ts', model, 'utf8')

// Fix CommandsEditor.tsx
let editor = fs.readFileSync('src/commands/CommandsEditor.tsx', 'utf8')
editor = editor.replace(
  'const connect = (a: CmdEnd, target: Pt): boolean => {',
  'const connect = (a: CmdEnd, target: Pt): boolean => {\n    const defaultWireColor = useCommandsUi.getState().wireColor'
)
// remove duplicate if any inside if (end)
editor = editor.replace(
  '    if (end) {\n      const defaultWireColor = useCommandsUi.getState().wireColor',
  '    if (end) {'
)
fs.writeFileSync('src/commands/CommandsEditor.tsx', editor, 'utf8')
console.log('Fixed model.ts and CommandsEditor.tsx')
