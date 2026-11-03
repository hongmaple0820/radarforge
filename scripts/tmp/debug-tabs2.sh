agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 12
echo "--- click 视频依赖 health item ---"
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button[title*=视频依赖]')];if(btns.length){btns[0].click();return 'clicked'}return 'no-btn'})()"
sleep 5
echo "--- tabs now ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[role=tab]')].map(x=>x.textContent.trim()))"
echo "--- click 模型与密钥 partition tab ---"
agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('模型与密钥'));if(t){t.click();return 'clicked'}return 'NOT FOUND'})()"
sleep 3
echo "--- body has AI 大模型? ---"
agent-browser eval "document.body.innerText.includes('AI 大模型')?'y':'n'"
echo "--- visible card ids ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[id^=settings-card-]')].map(e=>e.id))"
