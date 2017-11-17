/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const error = require('./error')
const P = require('./promise')

module.exports = (log, client) => {
  let isUpdating = false

  return {
    get (key) {
      return client.getAsync(key)
        .catch(err => {
          log.error({ op: 'redis.get.error', key, err: err.message })
          // Allow callers to distinguish between the null result
          // and some kind of connection error
          return false
        })
    },

    set (key, value) {
      return client.setAsync(key, value)
    },

    del (key) {
      return client.delAsync(key)
    },

    update (key, getValue) {
      if (isUpdating) {
        log.error({ op: 'redis.update.conflict', key })
        return P.reject(error.unexpectedError())
      }

      isUpdating = true

      return client.watchAsync(key)
        .then(() => client.getAsync(key))
        .then(getValue)
        .then(value => {
          const multi = client.multi()
          multi.set(key, value)
          return multi.execAsync()
        })
        .catch(err => {
          client.unwatch()
          log.error({ op: 'redis.update.error', key, err: err.message })
          isUpdating = false
          throw err
        })
        .then(result => {
          isUpdating = false
          if (! result) {
            log.error({ op: 'redis.watch.conflict', key })
            throw error.unexpectedError()
          }
        })
    }
  }
}
