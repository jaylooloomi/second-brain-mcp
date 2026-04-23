import dotenv from 'dotenv'

dotenv.config()

const token = process.env.GITHUB_TOKEN

async function checkGitHubStars() {
  console.log('🔍 檢查 GitHub API...\n')

  // 第一頁
  const url = new URL('https://api.github.com/user/starred')
  url.searchParams.append('per_page', '100')
  url.searchParams.append('page', '1')

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  })

  console.log(`Status: ${response.status}`)
  console.log(`Headers:`)
  console.log(`  Link: ${response.headers.get('link')}`)
  console.log(`  X-RateLimit-Remaining: ${response.headers.get('x-ratelimit-remaining')}`)

  const data = await response.json() as any[]
  console.log(`\n第一頁結果: ${data.length} 個`)
  
  if (Array.isArray(data)) {
    data.forEach((repo, idx) => {
      console.log(`  ${idx + 1}. ${repo.name} (updated: ${repo.updated_at})`)
    })
  }

  // 檢查是否有第二頁
  const link = response.headers.get('link')
  if (link?.includes('rel="next"')) {
    console.log('\n✓ 有第二頁')
  } else {
    console.log('\n✗ 沒有第二頁 (這就是全部了)')
  }
}

checkGitHubStars()
