agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 12
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button[title*=视频依赖]')];if(btns.length){btns[0].click();return 'clicked'}return 'no-btn'})()"
sleep 5
echo "--- click 模型与密钥 ---"
agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('模型与密钥'));t.click();return 'clicked'})()"
sleep 2
echo "--- inner tab states (data-state) ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[role=tab]')].map(x=>({t:x.textContent.trim().slice(0,6),s:x.getAttribute('data-state')})))"
echo "--- click again ---"
agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('模型与密钥'));t.click();return 'clicked2'})()"
sleep 2
echo "--- inner tab states after 2nd click ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[role=tab]')].map(x=>({t:x.textContent.trim().slice(0,6),s:x.getAttribute('data-state')})))"
echo "--- visible card ids ---"
agent-browser eval "JSON.stringify([...document.querySelectorAll('[id^=settings-card-]')].map(e=>e.id))"
