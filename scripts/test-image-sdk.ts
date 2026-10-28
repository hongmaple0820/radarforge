/** 诊断：SDK 图像生成 API 是否可用（405 排查） */
import ZAI from 'z-ai-web-dev-sdk'

async function main() {
  const zai = await ZAI.create()
  try {
    const res = await zai.images.generations.create({
      prompt: 'a minimal flat illustration of an AI radar, teal and slate colors',
      size: '1024x1024',
    })
    console.log('OK: base64 length =', res.data?.[0]?.base64?.length ?? 0)
  } catch (e) {
    console.log('FAILED:', (e as Error)?.message?.slice(0, 300))
  }
}
main()
