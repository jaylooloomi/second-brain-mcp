/**
 * GitHub Device Flow Auth
 * 用 GitHub CLI 的 client_id 實作 Device Flow
 * 用戶只需在瀏覽器點一下授權，token 自動存 session
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// gh CLI 官方 client_id，可安全嵌入版本控制
const GITHUB_CLIENT_ID = '178c6fc778ccc68e1d6a'

export class GitHubCLIAuth {
  constructor(vaultPath = './vault') {
    const sessionDir = path.join(vaultPath, 'raw', 'github')
    fs.mkdirSync(sessionDir, { recursive: true })
    this.sessionFile = path.join(sessionDir, '.oauth-session.json')
  }

  /**
   * 取得有效 token
   * 有 session → 直接用
   * 沒有 → 跑 Device Flow
   */
  async getToken() {
    const saved = this.loadSession()
    if (saved?.token) {
      return saved.token
    }

    const token = await this.runDeviceFlow()
    this.saveSession({ token, created_at: new Date().toISOString() })
    return token
  }

  /**
   * GitHub Device Flow
   * 1. 取得 device_code + user_code
   * 2. 讓用戶在瀏覽器授權
   * 3. 輪詢直到拿到 token
   */
  async runDeviceFlow() {
    // Step 1: 取得 device code
    const codeRes = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: 'read:user repo',
      }),
    })

    if (!codeRes.ok) throw new Error(`取得 device code 失敗: ${codeRes.status}`)

    const { device_code, user_code, verification_uri, interval, expires_in } = await codeRes.json()

    // Step 2: 顯示給用戶，並自動開瀏覽器
    console.log('\n🔐 GitHub 授權')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  請在瀏覽器開啟：${verification_uri}`)
    console.log(`  輸入驗證碼：    ${user_code}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // 自動開瀏覽器
    this.openBrowser(verification_uri)

    // Step 3: 輪詢直到授權完成
    return await this.pollForToken(device_code, interval || 5, expires_in || 900)
  }

  /**
   * 輪詢 GitHub 直到用戶完成授權
   */
  async pollForToken(device_code, interval, expiresIn) {
    const startTime = Date.now()
    let pollInterval = interval * 1000

    console.log('⏳ 等待授權中...')

    while (Date.now() - startTime < expiresIn * 1000) {
      await this.sleep(pollInterval)

      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })

      const data = await res.json()

      if (data.access_token) {
        console.log('✓ 授權成功！session 已儲存\n')
        return data.access_token
      }

      switch (data.error) {
        case 'authorization_pending':
          // 還在等，繼續輪詢
          break
        case 'slow_down':
          // 太快了，增加間隔
          pollInterval += 5000
          break
        case 'expired_token':
          throw new Error('驗證碼已過期，請重新執行')
        case 'access_denied':
          throw new Error('用戶拒絕授權')
        default:
          if (data.error) throw new Error(`授權失敗: ${data.error}`)
      }
    }

    throw new Error('授權超時，請重新執行')
  }

  /**
   * 清除 session（登出）
   */
  logout() {
    if (fs.existsSync(this.sessionFile)) {
      fs.unlinkSync(this.sessionFile)
      console.log('✓ 已登出，session 已清除')
    }
  }

  loadSession() {
    try {
      if (!fs.existsSync(this.sessionFile)) return null
      return JSON.parse(fs.readFileSync(this.sessionFile, 'utf-8'))
    } catch {
      return null
    }
  }

  saveSession(session) {
    fs.writeFileSync(this.sessionFile, JSON.stringify(session, null, 2), 'utf-8')
  }

  openBrowser(url) {
    try {
      const cmd = process.platform === 'win32' ? `start ${url}`
        : process.platform === 'darwin' ? `open ${url}`
        : `xdg-open ${url}`
      execSync(cmd, { stdio: 'ignore' })
    } catch {
      // 無法自動開啟也沒關係，用戶可以手動複製
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
