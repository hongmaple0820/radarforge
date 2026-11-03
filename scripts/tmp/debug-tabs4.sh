agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 12
echo "--- click 设置中心 main tab via .click() ---"
agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('设置中心'));t.click();return 'clicked'})()"
sleep 4
echo "--- main tab state ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[role=tab]')].slice(0,4).map(x=>({t:x.textContent.trim(),s:x.getAttribute('data-state')})))"
echo "--- settings mounted? ---"
agent-browser eval "document.body.innerText.includes('供应商中枢')?'y':'n'"
echo "--- now inner: click 运行时依赖 (already default models) ---"
agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('运行时依赖'));t.click();return 'clicked'})()"
sleep 3
echo "--- visible card ids ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[id^=settings-card-]')].map(e=>e.id))"
