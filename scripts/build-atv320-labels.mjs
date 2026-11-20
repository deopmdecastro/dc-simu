// Local SVG artwork reconstructed against Schneider ATV320U0xM2C_front.
// No invented serial number or copied unit-specific QR code.
import fs from 'node:fs/promises'
import {chromium} from 'playwright'

const ink='#e5e6e8',out='public/models/industriais'
const svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial,Helvetica,sans-serif">${body}</svg>`
const files={}
for(const [name,text,w,h] of [['fault','FAULT',360,68],['can-run','CAN Run',360,68],['can-err','CAN Err',360,68],['ref','Ref',200,96],['mon','Mon',200,96],['conf','Conf',200,96],['value','Value',240,96],['unit','Unit',240,96],['esc','ESC',264,112]])
 files[`atv320-legend-${name}.png`]=svg(w,h,`<text x="${w/2}" y="${h*.74}" text-anchor="middle" font-size="${h*.79}" fill="${ink}">${text}</text>`)
files['atv320-altivar-label.png']=svg(640,640,`<rect x="17" y="17" width="606" height="606" rx="122" fill="none" stroke="#a5a8ae" stroke-width="15"/><g fill="#b8bbc1"><text x="32" y="395" font-size="164">Altivar</text><text x="32" y="518" font-size="132" font-weight="300">Machine</text></g>`)
files['atv320-danger-label.png']=svg(600,780,`<defs><clipPath id="label"><rect x="5" y="5" width="590" height="770" rx="35"/></clipPath></defs><g clip-path="url(#label)"><rect width="600" height="780" fill="#efefeb"/><rect width="600" height="270" fill="#c61f29"/><path d="M65 146 L148 20 L232 146Z" fill="#f7d214" stroke="#262626" stroke-width="6"/><path d="M157 45 L120 95 H150 L132 132 L184 76 H152Z" fill="#1e2325"/><path d="M298 146 L375 20 L452 146Z" fill="#eee"/><text x="375" y="128" text-anchor="middle" font-size="110" fill="#c61f29">!</text><text x="300" y="248" text-anchor="middle" font-size="130" fill="white">DANGER</text><g fill="#141818" text-anchor="middle" font-weight="700"><text x="300" y="351" font-size="57">ELECTRIC SHOCK,</text><text x="300" y="422" font-size="57">EXPLOSION,</text><text x="300" y="493" font-size="57">OR ARC FLASH.</text><text x="300" y="580" font-size="55">To service,</text><text x="300" y="650" font-size="55">remove all power,</text><text x="300" y="722" font-size="55">wait 15 minutes.</text></g></g>`)
let logo=await fs.readFile('public/brands/schneider-electric.svg','utf8')
files['atv320-schneider-white.png']=logo.replace('<svg ','<svg width="640" height="189" ').replaceAll('#009e4d','#e5e6e8')
const qr=(await fs.readFile(`${out}/atv320-qr-sticker.png`)).toString('base64')
files['atv320-reference-sticker.png']=svg(600,900,`<rect x="3" y="3" width="594" height="894" rx="26" fill="#f2f2ee" stroke="#141818" stroke-width="6"/><g text-anchor="middle" fill="#171a1b" font-weight="700"><text x="300" y="100" font-size="61">ATV320U04M2C</text><text x="300" y="175" font-size="40">0.37kW · 200/240V</text></g><svg x="35" y="230" width="530" height="620" viewBox="55 95 490 490"><image href="data:image/png;base64,${qr}" width="600" height="600"/></svg>`)
// The existing QR encodes only the public reference. Retain it without serials.
const browser=await chromium.launch({channel:process.env.LABELS_CHANNEL||'msedge'})
try{
 const page=await browser.newPage()
 for(const [file,body]of Object.entries(files)){
  const [,w,h]=/width="(\d+)" height="(\d+)"/.exec(body)
  await page.setViewportSize({width:+w,height:+h});await page.setContent(`<body style="margin:0;background:transparent">${body}</body>`)
  await page.screenshot({path:`${out}/${file}`,omitBackground:true});console.log('✓',file)
 }
}finally{await browser.close()}
