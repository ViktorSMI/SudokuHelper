"""Offline Chromium UI smoke test; storage is an injected in-memory adapter.
Requires: pip install playwright; Chromium (or playwright install chromium).
No network/file navigation is needed. Persistence is tested by rehydrating a new page.
For real browser localStorage and hosting, also perform the manual checks in README.
"""
from playwright.sync_api import sync_playwright
import json, re, os, shutil
from pathlib import Path
OUT=Path(os.environ.get('SCREENSHOT_DIR', '/tmp/archive81-checks'));OUT.mkdir(exist_ok=True)
ROOT=Path(__file__).resolve().parents[1]
def load(page, saved=None):
 html=ROOT.joinpath('index.html').read_text()
 html=re.sub(r'<script[^>]*src=[^>]*></script>', '', html)
 html=re.sub(r'<link[^>]*>', '', html)
 page.set_content(html)
 page.add_style_tag(content=ROOT.joinpath('css/app.css').read_text())
 page.evaluate("""saved => {
  const store = new Map(saved ? [['sudokuhelper.archive81.v1', saved]] : []);
  Object.defineProperty(window, 'localStorage', {configurable:true, value:{
   getItem:k=>store.has(k)?store.get(k):null,
   setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k)
  }});
 }""", saved)
 for name in ['engine','campaign','progress','app']:
  page.add_script_tag(content=ROOT.joinpath('js/'+name+'.js').read_text())
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1080},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 load(page)
 page.screenshot(path=str(OUT/'history-desktop.png'),full_page=True)
 page.locator('[data-action=continue-story]').click()
 page.locator('#cell-0').click()
 page.locator('#notesBtn').click();page.keyboard.press('6')
 g=page.evaluate("JSON.parse(localStorage.getItem(Progress.KEY)).sessions.story")
 assert g['notes'][0]==64 and g['board'][0]==0
 page.locator('#undoBtn').click()
 page.locator('#notesBtn').click();page.keyboard.press('6')
 assert page.locator('#cell-0').inner_text()=='6'
 saved=page.evaluate('localStorage.getItem(Progress.KEY)');page.close();page=b.new_page(viewport={'width':1440,'height':1080});page.on('pageerror',lambda e:errors.append(str(e)));load(page,saved);page.locator('[data-action=continue-story]').click()
 assert page.locator('#cell-0').inner_text()=='6'
 page.locator('#candidatesBtn').click()
 page.screenshot(path=str(OUT/'game-desktop.png'),full_page=True)
 # Complete every chapter level with real keyboard/mouse events.
 for level in range(6):
  if level:
   page.locator('[data-action=next-level]').click()
  data=page.evaluate("""() => {const g=JSON.parse(localStorage.getItem(Progress.KEY)).sessions.story; const l=Campaign.levels.find(l=>l.id===g.levelId); return {game:g, type:l.type, solution:Sudoku.solve(g.puzzle), single:Sudoku.single(Sudoku.state(g.puzzle))};}""")
  g=data['game']
  indices=[data['single']['index']] if data['type']=='single' else [i for i,v in enumerate(g['puzzle']) if not v and g['board'][i]!=data['solution'][i]]
  for i in indices:
   page.locator(f'#cell-{i}').click();page.keyboard.press(str(data['solution'][i]))
  page.locator('#dialog[open]').wait_for()
  result=page.evaluate("JSON.parse(localStorage.getItem(Progress.KEY)).completed")
  assert result[f'signal-{level+1}']==3, result
  print('level',level+1,'passed')
 page.locator('[data-action=open-profile]').click()
 assert '750 XP' in page.locator('#main').inner_text()
 assert 'Освоен' in page.locator('#main').inner_text()
 page.locator('[data-theme=cyan]').click()
 page.screenshot(path=str(OUT/'profile-desktop.png'),full_page=True)
 # Replay cannot farm XP.
 page.locator('#navigation [data-route=history]').click()
 page.locator('[data-action=level][data-index="0"]').click()
 page.locator('#solveBtn').click();page.locator('[data-action=confirm]').click()
 page.locator('#speed').fill('5');page.locator('#speed').dispatch_event('input')
 page.locator('#dialog[open]').wait_for(timeout=10000)
 assert 'Теперь твой ход' in page.locator('#dialogTitle').inner_text()
 assert page.evaluate("Progress.summary(JSON.parse(localStorage.getItem(Progress.KEY))).xp")==750
 page.locator('[data-action=restart-now]').click()
 assert page.evaluate("JSON.parse(localStorage.getItem(Progress.KEY)).sessions.story.demo")==False
 # Race cancellation on mode switch.
 page.locator('#solveBtn').click();page.locator('[data-action=confirm]').click()
 page.locator('#navigation [data-route=helper]').click()
 page.wait_for_timeout(700)
 assert page.locator('#importText').count()==1
 page.locator('#importText').fill('1'*81);page.locator('[data-action=import-board]').click()
 assert 'повторяющиеся' in page.locator('#formStatus').inner_text()
 puzzle=page.evaluate("Sudoku.format(Campaign.levels[1].puzzle)")
 page.locator('#importText').fill(puzzle);page.locator('[data-action=import-board]').click()
 assert page.locator('#board .cell').count()==81
 page.locator('#hintBtn').click();assert page.locator('#hintCard').is_visible()
 page.locator('#stepBtn').click();page.locator('#undoBtn').click()
 page.locator('#navigation [data-route=practice]').click()
 page.locator('[data-action=generate][data-difficulty=hard]').click()
 page.locator('#board').wait_for(timeout=15000)
 assert page.locator('#board .cell').count()==81
 print('desktop errors:',errors)
 assert not errors
 # Mobile fresh session
 mobile=b.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 load(mobile)
 mobile.screenshot(path=str(OUT/'history-mobile.png'),full_page=True)
 mobile.locator('[data-action=continue-story]').click()
 mobile.locator('#candidatesBtn').click()
 mobile.screenshot(path=str(OUT/'game-mobile.png'),full_page=True)
 assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
 # Full session schema roundtrip on the finished profile.
 assert page.evaluate("Progress.validate(JSON.parse(localStorage.getItem(Progress.KEY)))") == page.evaluate("JSON.parse(localStorage.getItem(Progress.KEY))")
 # Import/export, invalid-file protection and explicit replacement.
 page.locator('#navigation [data-route=profile]').click()
 with page.expect_download() as download:
  page.locator('[data-action=export-save]').click()
 assert download.value.suggested_filename=='archive81-save.json'
 before=page.evaluate('localStorage.getItem(Progress.KEY)')
 page.locator('#saveFile').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{broken'})
 page.wait_for_timeout(150)
 assert page.evaluate('localStorage.getItem(Progress.KEY)')==before
 fresh=page.evaluate('JSON.stringify(Progress.fresh())')
 page.locator('#saveFile').set_input_files({'name':'fresh.json','mimeType':'application/json','buffer':fresh.encode()})
 page.locator('[data-action=confirm]').click()
 assert page.evaluate('Progress.summary(JSON.parse(localStorage.getItem(Progress.KEY))).xp')==0
 # Storage denial is visible; play remains available.
 quota=b.new_page();load(quota)
 quota.evaluate("() => {window.localStorage.setItem=()=>{throw Error('quota');};}")
 quota.locator('[data-action=continue-story]').click()
 assert quota.locator('#storageWarning').is_visible()
 assert quota.locator('#board .cell').count()==81
 assert not errors
 b.close()
 print('BROWSER PASS')
