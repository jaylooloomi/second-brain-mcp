export { ChromeConnector } from './connector.js'

import { ChromeConnector } from './connector.js'
export function createChromeConnector(bookmarksPath) {
  return new ChromeConnector(bookmarksPath)
}
