"""Offline: python3 scripts/build-industrial-labels.py <pasta dos PDF>
Requires PyMuPDF and Pillow. Original logos come from source artwork, never a font.
The AVEL photographed wording, GEYA common-reference text and explicit nominal labels are re-typeset.
The AVEL wordmarks are cropped/rectified from the original catalogue, not recreated as a font.
"""
from pathlib import Path
import sys, json, hashlib
from io import BytesIO
import pymupdf as fitz
from PIL import Image, ImageDraw, ImageFont
source=Path(sys.argv[1])
out=Path('public/models/industriais');out.mkdir(parents=True,exist_ok=True)
pdfout=Path('public/datasheets/industrial');pdfout.mkdir(parents=True,exist_ok=True)
fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def font(n):return ImageFont.truetype(fontfile,n)
def crop_pdf(filename,page,rect,scale=12):
    d=fitz.open(source/filename);p=d[page];pix=p.get_pixmap(matrix=fitz.Matrix(scale,scale),clip=fitz.Rect(rect),alpha=False)
    return Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
# Preserve the original PDFs. These are downloads, not generated or blank placeholders.
pdfs={
 'atv320u04m2c-datasheet.pdf':'schneider-atv320u04m2c.pdf','atv320-installation.pdf':'schneider-atv320-installation.pdf',
 'finder-55.pdf':'finder-serie-55.pdf','S60EN.pdf':'finder-serie-60-bases-90.pdf',
 'geya-grt8-m.pdf':'geya-grt8-m.pdf','geya-grt8-ab.pdf':'geya-grt8-ab.pdf',
 'avel-relays-catalog.pdf':'avel-411rnpd0.pdf','metaltex-tby.pdf':'metaltex-tby.pdf'}
manifest=[]
for a,b in pdfs.items():
    raw=(source/a).read_bytes();assert raw.startswith(b'%PDF-'),a
    d=fitz.open(stream=raw,filetype='pdf');assert len(d)>0
    (pdfout/b).write_bytes(raw);manifest.append({'sourceFile':a,'file':b,'pages':len(d),'sha256':hashlib.sha256(raw).hexdigest()})
# GEYA: precise crop of the vector front drawing on p.2. Rotor/LED disks are
# removed only inside their physical footprints; scales, legend and real logo stay.
for kind,target in [('m','geya-grt8-m-face.png'),('ab','geya-grt8-b-face.png')]:
    # Coordinates first measured at 5 px/pt in recovery previews.
    if kind=='m': rect=(49.8,542.2,73.8,601.2);centres=[(8.8,16.0,4.0),(12.6,26.2,4.0),(8.8,36.4,4.0)];leds=[(8.2,6.2,2.25),(15.2,6.2,2.25)]
    else: rect=(48.8,499.0,72.8,557.0);centres=[(8.8,16.1,4.0),(12.4,26.1,4.0)];leds=[(8.0,6.1,2.25),(14.8,6.1,2.25)]
    scale=20;im=crop_pdf('geya-grt8-'+kind+'.pdf',1,rect,scale);draw=ImageDraw.Draw(im)
    for x,y,r in centres+leds:draw.ellipse(((x-r)*scale,(y-r)*scale,(x+r)*scale,(y+r)*scale),fill='white')
    if kind=='ab':
        # Manual illustration says A2 (two outputs). This product is B1 (one output).
        draw.rectangle((1*scale,53*scale,23*scale,58*scale),fill='white');draw.text((1*scale,53*scale),'GRT8-B1',font=font(46),fill='#222222')
    im.save(out/target,optimize=True)
# AVEL: preserve the actual catalogue wordmarks, but re-typeset its exact
# photographed text at 1408 x 3200 px. Do not magnify the old perspective photo.
from lib.avel_silkscreen import build_avel_silkscreen
d=fitz.open(source/'avel-relays-catalog.pdf');image=d.extract_image(678)
photo=Image.open(BytesIO(image['image'])).convert('RGB')
build_avel_silkscreen(photo,out/'avel-411-face.png')
# Nominal print labels are explicitly reconstructed from reference text. No false
# serial number, QR, CE/UL claim or arbitrary certification badge is invented.
def label(file,lines,size=(512,280),bg='#ecece4',fg='#30332e'):
    im=Image.new('RGB',size,bg);draw=ImageDraw.Draw(im)
    for i,text in enumerate(lines):draw.text((18,14+i*(size[1]-24)/max(1,len(lines))),text,font=font(min(42,int(size[0]/max(10,len(text))*1.5))),fill=fg)
    im.save(out/file,optimize=True)
label('finder-5534-label.png',['55.34.9.024.0040','24 V DC  ·  4 CO'],(640,220))
label('atv320-product-label.png',['ATV320U04M2C','0.37 kW / 0.5 HP','1~ 200–240 V','3~ 0–240 V','3.3 A'],(440,660))
label('atv320-altivar-label.png',['Altivar','Machine','ATV320'],(500,500),bg='#34362f',fg='#e9e9df')
label('atv320-danger-label.png',['DANGER','HAZARDOUS','VOLTAGE','Read manual'],(500,640),bg='#c8c7b9',fg='#38392e')
# Actual Metaltex wordmark from its PDF; remaining rating is a reconstruction.
logo=crop_pdf('metaltex-tby.pdf',0,(28,22,138,57),4)
im=Image.new('RGB',(700,250),'#e9e9e3');logo.thumbnail((340,110));im.paste(logo,(18,8));draw=ImageDraw.Draw(im);draw.text((18,126),'TBY-301   110 V AC',font=font(44),fill='#222222');draw.text((18,190),'50/60 Hz · max. 30 min',font=font(30),fill='#222222');im.save(out/'metaltex-tby-label.png',optimize=True)
(pdfout/'sources.json').write_text(json.dumps({'notice':'Original local manufacturer PDFs; model reconstructions are not official CAD or certified electrical equipment.','files':manifest},indent=2)+'\n')
print('PDF:',len(manifest),'— etiquetas locais prontas')
