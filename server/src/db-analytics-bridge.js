/**
 * Thin re-exports so analytics.js doesn't circular-import store.
 */
export {
  dbGetUser,
  dbInsertVisit,
  dbListUsers,
  dbListVisits,
  dbStats,
  dbTrimVisits,
  dbUpsertUser,
  metaGet,
  metaSet,
} from './db.js'

import { listCollectionSummaries } from './store.js'

export function listCollectionSummariesSafe() {
  try {
    return listCollectionSummaries()
  } catch {
    return []
  }
}
