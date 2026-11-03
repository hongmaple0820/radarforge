agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 12
echo "--- all tabs ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[role=tab]')].map(x=>x.textContent.trim()))"
echo "--- click models partition ---"
agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('模型与密钥'));if(t){t.click();return 'clicked:'+t.textContent.trim()}return 'NOT FOUND'})()"
sleep 3
echo "--- body has AI 大模型? ---"
agent-browser eval "document.body.innerText.includes('AI 大模型')?'y':'n'"
echo "--- visible card ids ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[id^=settings-card-]')].map(e=>e.id))"
