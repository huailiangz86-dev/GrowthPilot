import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'

import './app.scss'

const DISCLAIMER_KEY = 'gp_disclaimer_accepted'

function showDisclaimerModal() {
  Taro.showModal({
    title: '用户协议与免责声明',
    content:
      'GrowthPilot 是一款个人成长计划与 AI 辅助工具，帮助你记录目标、行动、知识和复盘。\n\n' +
      '重要声明：\n' +
      '1. AI 输出仅供思考和记录，不替代专业意见\n' +
      '2. 不同领域的决定由用户自行判断并承担责任\n' +
      '3. 个人成长没有统一答案，请以真实体验为准\n' +
      '4. 请确认你愿意保存自己主动提供的个人上下文',
    confirmText: '同意并继续',
    cancelText: '不同意',
    success(res) {
      if (res.confirm) {
        Taro.setStorageSync(DISCLAIMER_KEY, 'true')
      }
    },
  })
}

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')

    // First-use disclaimer: check storage, show modal if not accepted
    const accepted = Taro.getStorageSync(DISCLAIMER_KEY)
    if (!accepted) {
      showDisclaimerModal()
    }
  })

  // children 是将要会渲染的页面
  return children
}



export default App
